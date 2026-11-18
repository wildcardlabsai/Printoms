"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authoriseAction, AuthorisationError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { getJobDetail, type JobDetail } from "@/lib/data/production";
import { filamentUsageSchema, finishPrintSchema, jobUpdateSchema, stageEnum } from "@/lib/validation/production";
import { uuid } from "@/lib/validation/common";
import { STAGE_META } from "@/lib/constants";

function handle(e: unknown): ActionResult<never> {
  if (e instanceof AuthorisationError) return fail(e.message);
  if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Invalid input");
  throw e;
}

function revalidateProduction(orderId?: string | null) {
  revalidatePath("/production");
  revalidatePath("/printers");
  revalidatePath("/overview");
  revalidatePath("/orders");
  revalidatePath("/fulfilment");
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

export async function getJobDetailAction(jobId: string): Promise<ActionResult<JobDetail>> {
  try {
    await authoriseAction("viewer");
    const detail = await getJobDetail(uuid.parse(jobId));
    if (!detail) return fail("Production job not found");
    return ok(detail);
  } catch (e) {
    return handle(e);
  }
}

/**
 * Move a job on the board. Moves that represent real-world events go through
 * the proper workflow (print runs, dispatch) rather than silently changing state.
 */
export async function moveJobAction(jobId: string, toStageInput: string, position?: number): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const id = uuid.parse(jobId);
    const toStage = stageEnum.parse(toStageInput);
    const supabase = await createClient();
    const { data: job } = await supabase
      .from("production_jobs")
      .select("id, stage, printer_id, order_id, order:orders(status)")
      .eq("id", id)
      .single();
    if (!job) return fail("Job not found");

    if (job.order?.status === "cancelled") return fail("This order has been cancelled.");
    if (job.stage === toStage) {
      if (position != null) await supabase.from("production_jobs").update({ board_position: position }).eq("id", id);
      revalidatePath("/production");
      return ok();
    }
    if (["dispatched", "completed"].includes(job.stage)) {
      return fail("This job has already been dispatched.");
    }
    if (toStage === "dispatched" || toStage === "completed") {
      return fail("Dispatch orders from Packing & Dispatch so tracking details are recorded.");
    }

    // Leaving "Printing" requires an outcome for the active print run.
    if (job.stage === "printing") {
      const { data: run } = await supabase
        .from("print_runs")
        .select("id")
        .eq("production_job_id", id)
        .eq("status", "printing")
        .maybeSingle();
      if (run) {
        if (toStage === "quality_check" || toStage === "ready_to_pack") {
          const { error } = await supabase.rpc("finish_print_run", { p_run_id: run.id, p_succeeded: true });
          if (error) return fail(dbErrorMessage(error));
          if (toStage === "ready_to_pack") {
            await supabase.from("production_jobs").update({ stage: "ready_to_pack" }).eq("id", id);
          }
          revalidateProduction(job.order_id);
          return ok(undefined, "Print completed");
        }
        return fail("Open the job and record the print as completed or failed first.");
      }
    }

    if (toStage === "printing") {
      if (!job.printer_id) return fail("Assign a printer first — open the job and choose Start print.");
      const { error } = await supabase.rpc("start_print_run", { p_job_id: id, p_printer_id: job.printer_id });
      if (error) return fail(dbErrorMessage(error));
      revalidateProduction(job.order_id);
      return ok(undefined, "Print started");
    }

    const update: { stage: typeof toStage; board_position?: number } = { stage: toStage };
    if (position != null) update.board_position = position;
    const { error } = await supabase.from("production_jobs").update(update).eq("id", id);
    if (error) return fail(dbErrorMessage(error));
    revalidateProduction(job.order_id);
    return ok(undefined, `Moved to ${STAGE_META[toStage].label}`);
  } catch (e) {
    return handle(e);
  }
}

export async function updateJobAction(input: z.input<typeof jobUpdateSchema>): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const v = jobUpdateSchema.parse(input);
    const supabase = await createClient();
    const { job_id, ...fields } = v;
    const { data, error } = await supabase.from("production_jobs").update(fields).eq("id", job_id).select("order_id, job_number").single();
    if (error) return fail(dbErrorMessage(error));
    await supabase.rpc("log_activity", {
      p_entity_type: "production_job",
      p_entity_id: job_id,
      p_order_id: data.order_id,
      p_action: "job.updated",
      p_message: `${data.job_number} details updated`,
    });
    revalidateProduction(data.order_id);
    return ok(undefined, "Job updated");
  } catch (e) {
    return handle(e);
  }
}

export async function assignPrinterAction(jobId: string, printerId: string | null): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const supabase = await createClient();
    const { error } = await supabase.rpc("assign_job_to_printer", {
      p_job_id: uuid.parse(jobId),
      p_printer_id: printerId ? uuid.parse(printerId) : (null as unknown as string),
    });
    if (error) return fail(dbErrorMessage(error));
    revalidateProduction();
    return ok(undefined, printerId ? "Added to printer queue" : "Printer unassigned");
  } catch (e) {
    return handle(e);
  }
}

export async function startPrintAction(jobId: string, printerId: string): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const supabase = await createClient();
    const { error } = await supabase.rpc("start_print_run", { p_job_id: uuid.parse(jobId), p_printer_id: uuid.parse(printerId) });
    if (error) return fail(dbErrorMessage(error));
    revalidateProduction();
    return ok(undefined, "Print started");
  } catch (e) {
    return handle(e);
  }
}

export async function finishPrintAction(input: z.input<typeof finishPrintSchema>): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const parsed = finishPrintSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    }
    const v = parsed.data;
    const supabase = await createClient();
    const { data: run } = await supabase.from("print_runs").select("production_job_id").eq("id", v.run_id).single();
    if (!run) return fail("Print run not found");

    const { error } = await supabase.rpc("finish_print_run", {
      p_run_id: v.run_id,
      p_succeeded: v.succeeded,
      p_failure_reason: v.failure_reason ?? undefined,
      p_notes: v.notes ?? undefined,
      p_requeue: v.requeue,
    });
    if (error) return fail(dbErrorMessage(error));

    // Filament is only deducted when the person confirms actual consumption.
    if (v.filament_stock_id && v.filament_grams) {
      const { error: usageError } = await supabase.from("filament_usage").insert({
        filament_stock_id: v.filament_stock_id,
        grams: v.filament_grams,
        print_run_id: v.run_id,
        production_job_id: run.production_job_id,
        kind: v.succeeded ? "print" : "failed_print",
      });
      if (usageError) return fail(`Print recorded, but filament usage failed: ${dbErrorMessage(usageError)}`);
    }
    revalidateProduction();
    revalidatePath("/filament");
    return ok(undefined, v.succeeded ? "Print completed — job moved to Quality Check" : "Failure recorded — job returned to Ready to Print");
  } catch (e) {
    return handle(e);
  }
}

export async function recordFilamentUsageAction(input: z.input<typeof filamentUsageSchema>): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const v = filamentUsageSchema.parse(input);
    const supabase = await createClient();
    const { error } = await supabase.from("filament_usage").insert(v);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/filament");
    revalidatePath("/production");
    return ok(undefined, "Filament usage recorded");
  } catch (e) {
    return handle(e);
  }
}
