"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authoriseAction, AuthorisationError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { adjustSchema, spoolSchema, type SpoolInput } from "@/lib/validation/filament";
import { uuid } from "@/lib/validation/common";

function handle(e: unknown): ActionResult<never> {
  if (e instanceof AuthorisationError) return fail(e.message);
  if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Invalid input");
  throw e;
}

export async function saveSpoolAction(id: string | null, input: SpoolInput): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const parsed = spoolSchema.safeParse(input);
    if (!parsed.success) return fail("Please check the highlighted fields", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    const supabase = await createClient();
    if (id) {
      // Remaining weight changes go through the ledger, not a silent edit.
      const { remaining_g, ...rest } = parsed.data;
      const { data: current } = await supabase.from("filament_stock").select("remaining_g").eq("id", uuid.parse(id)).single();
      const { error } = await supabase.from("filament_stock").update(rest).eq("id", id);
      if (error) return fail(dbErrorMessage(error));
      if (current && Number(current.remaining_g) !== remaining_g) {
        await supabase.from("filament_usage").insert({
          filament_stock_id: id,
          kind: "adjustment",
          grams: Number(current.remaining_g) - remaining_g,
          note: "Remaining weight corrected when editing spool",
        });
      }
    } else {
      const { error } = await supabase.from("filament_stock").insert(parsed.data);
      if (error) return fail(dbErrorMessage(error));
    }
    revalidatePath("/filament");
    return ok(undefined, id ? "Spool updated" : "Spool added");
  } catch (e) {
    return handle(e);
  }
}

export async function adjustStockAction(input: z.input<typeof adjustSchema>): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const v = adjustSchema.parse(input);
    const supabase = await createClient();
    const { data: spool } = await supabase.from("filament_stock").select("remaining_g, spool_weight_g").eq("id", v.stock_id).single();
    if (!spool) return fail("Spool not found");
    let grams: number;
    let kind: "adjustment" | "waste" | "print";
    if (v.mode === "set_remaining") {
      if (v.grams > spool.spool_weight_g) return fail("Remaining weight can’t exceed the spool weight");
      grams = Number(spool.remaining_g) - v.grams;
      kind = "adjustment";
      if (grams === 0) return ok(undefined, "No change");
    } else {
      if (v.grams <= 0) return fail("Enter the grams used");
      grams = v.grams;
      kind = v.mode === "waste" ? "waste" : "print";
    }
    const { error } = await supabase.from("filament_usage").insert({ filament_stock_id: v.stock_id, kind, grams, note: v.note });
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/filament");
    return ok(undefined, v.mode === "set_remaining" ? "Stock level corrected" : "Usage recorded");
  } catch (e) {
    return handle(e);
  }
}

export async function setSpoolArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const supabase = await createClient();
    const { error } = await supabase.from("filament_stock").update({ is_archived: archived }).eq("id", uuid.parse(id));
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/filament");
    return ok(undefined, archived ? "Spool archived" : "Spool restored");
  } catch (e) {
    return handle(e);
  }
}
