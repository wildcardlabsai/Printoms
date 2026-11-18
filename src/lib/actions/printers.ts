"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authoriseAction, AuthorisationError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { printerSchema, type PrinterInput } from "@/lib/validation/printers";
import { uuid } from "@/lib/validation/common";
import { PRINTER_STATUS } from "@/lib/constants";

function handle(e: unknown): ActionResult<never> {
  if (e instanceof AuthorisationError) return fail(e.message);
  if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Invalid input");
  throw e;
}

function revalidate(id?: string) {
  revalidatePath("/printers");
  revalidatePath("/overview");
  revalidatePath("/production");
  if (id) revalidatePath(`/printers/${id}`);
}

export async function savePrinterAction(id: string | null, input: PrinterInput): Promise<ActionResult<{ id: string }>> {
  try {
    await authoriseAction(id ? "staff" : "admin");
    const parsed = printerSchema.safeParse(input);
    if (!parsed.success) return fail("Please check the highlighted fields", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    const supabase = await createClient();
    if (id) {
      const { error } = await supabase.from("printers").update(parsed.data).eq("id", uuid.parse(id));
      if (error) return fail(dbErrorMessage(error));
      revalidate(id);
      return ok({ id }, "Printer updated");
    }
    const { data: last } = await supabase.from("printers").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase
      .from("printers")
      .insert({ ...parsed.data, sort_order: (last?.sort_order ?? 0) + 1 })
      .select("id")
      .single();
    if (error) return fail(dbErrorMessage(error));
    revalidate();
    return ok({ id: data.id }, "Printer added");
  } catch (e) {
    return handle(e);
  }
}

const statusEnum = z.enum(["available", "printing", "paused", "maintenance", "offline"]);

/**
 * Manual status change. "Printing" is only entered by starting a print run,
 * so the status always reflects tracked work — no simulated live monitoring.
 */
export async function setPrinterStatusAction(printerId: string, statusInput: string, note?: string): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const id = uuid.parse(printerId);
    const status = statusEnum.parse(statusInput);
    const supabase = await createClient();
    const { data: printer } = await supabase.from("printers").select("name, status, current_print_run_id, maintenance_notes").eq("id", id).single();
    if (!printer) return fail("Printer not found");

    if (printer.current_print_run_id) {
      if (status === "paused" || (status === "printing" && printer.status === "paused")) {
        // pause / resume an active print
      } else {
        return fail("This printer has an active print. Record it as completed or failed first.");
      }
    } else if (status === "printing" || status === "paused") {
      return fail("Start a print from a queued job to set this printer to Printing.");
    }

    const update: { status: typeof status; maintenance_notes?: string } = { status };
    if (note?.trim()) {
      const stamp = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      update.maintenance_notes = `[${stamp}] ${note.trim()}${printer.maintenance_notes ? `\n${printer.maintenance_notes}` : ""}`.slice(0, 4000);
    }
    const { error } = await supabase.from("printers").update(update).eq("id", id);
    if (error) return fail(dbErrorMessage(error));
    await supabase.rpc("log_activity", {
      p_entity_type: "printer",
      p_entity_id: id,
      p_order_id: null as unknown as string,
      p_action: "printer.status",
      p_message: `${printer.name} set to ${PRINTER_STATUS[status].label}${note?.trim() ? `: ${note.trim()}` : ""}`,
    });
    revalidate(id);
    return ok(undefined, `${printer.name} is now ${PRINTER_STATUS[status].label.toLowerCase()}`);
  } catch (e) {
    return handle(e);
  }
}

export async function removeFromQueueAction(queueId: string): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("print_queue")
      .update({ status: "removed" })
      .eq("id", uuid.parse(queueId))
      .eq("status", "queued")
      .select("production_job_id")
      .single();
    if (error) return fail(dbErrorMessage(error));
    await supabase.from("production_jobs").update({ printer_id: null }).eq("id", data.production_job_id).neq("stage", "printing");
    revalidate();
    return ok(undefined, "Removed from queue");
  } catch (e) {
    return handle(e);
  }
}

export async function moveQueueItemAction(queueId: string, direction: "up" | "down"): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const supabase = await createClient();
    const { data: item } = await supabase.from("print_queue").select("id, printer_id, position").eq("id", uuid.parse(queueId)).single();
    if (!item) return fail("Queue item not found");
    const { data: siblings } = await supabase
      .from("print_queue")
      .select("id, position")
      .eq("printer_id", item.printer_id)
      .eq("status", "queued")
      .order("position");
    const list = siblings ?? [];
    const idx = list.findIndex((s) => s.id === item.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return ok();
    const other = list[swapIdx]!;
    // Swap positions (guard against equal positions)
    const a = item.position === other.position ? other.position + (direction === "up" ? -0.001 : 0.001) : other.position;
    await supabase.from("print_queue").update({ position: a }).eq("id", item.id);
    await supabase.from("print_queue").update({ position: item.position }).eq("id", other.id);
    revalidate(item.printer_id);
    return ok();
  } catch (e) {
    return handle(e);
  }
}
