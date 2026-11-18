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
export async function moveJobAction(
  jobId: string,
  toStageInput: string,
  position?: number,
  options: { force?: boolean } = {},
): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const id = uuid.parse(jobId);
    const toStage = stageEnum.parse(toStageInput);
    const supabase = await createClient();
    const { data: job } = await supabase
      .from("production_jobs")
      .select("id, stage, printer_id, order_id, quantity, quantity_pending, quantity_printing, cancelled_at, order:orders(status)")
      .eq("id", id)
      .single();
    if (!job) return fail("Job not found");

    if (job.order?.status === "cancelled" || job.cancelled_at) {
      return fail("This order or item has been cancelled. Use the review actions on the order to decide what happens to it.");
    }
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
          const { data: after } = await supabase.from("production_jobs").select("stage, quantity_pending, quantity").eq("id", id).single();
          if (toStage === "ready_to_pack" && after?.stage === "quality_check") {
            await supabase.from("production_jobs").update({ stage: "ready_to_pack" }).eq("id", id);
          }
          revalidateProduction(job.order_id);
          return ok(
            undefined,
            after && after.quantity_pending > 0
              ? `Print completed — ${after.quantity_pending} of ${after.quantity} units still to print`
              : "Print completed",
          );
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

    // Moving to Ready to Pack with units never printed needs an explicit decision.
    const outstanding = (job.quantity_pending ?? 0) + (job.quantity_printing ?? 0);
    if (toStage === "ready_to_pack" && outstanding > 0 && !options.force) {
      return fail(
        `${outstanding} of ${job.quantity} unit${job.quantity === 1 ? " has" : "s have"} not been printed yet. Mark ${outstanding === 1 ? "it" : "them"} as complete anyway (e.g. supplied from stock)?`,
        undefined,
        "OUTSTANDING_UNITS",
      );
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

export async function startPrintAction(jobId: string, printerId: string, quantity?: number | null): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const supabase = await createClient();
    const qty = quantity == null ? undefined : z.number().int().min(1).max(10000).parse(quantity);
    const { error } = await supabase.rpc("start_print_run", {
      p_job_id: uuid.parse(jobId),
      p_printer_id: uuid.parse(printerId),
      ...(qty ? { p_quantity: qty } : {}),
    });
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
      ...(v.failed_unit_ids?.length ? { p_failed_unit_ids: v.failed_unit_ids } : {}),
    });
    if (error) return fail(dbErrorMessage(error));
    const { data: runAfter } = await supabase.from("print_runs").select("quantity_succeeded, quantity_failed").eq("id", v.run_id).single();
    const { data: jobAfter } = await supabase.from("production_jobs").select("stage, quantity_pending").eq("id", run.production_job_id).single();

    // Filament is only deducted when the person confirms actual consumption.
    if (v.filament_stock_id && v.filament_grams) {
      const { error: usageError } = await supabase.from("filament_usage").insert({
        filament_stock_id: v.filament_stock_id,
        grams: v.filament_grams,
        print_run_id: v.run_id,
        production_job_id: run.production_job_id,
        kind: (runAfter?.quantity_succeeded ?? (v.succeeded ? 1 : 0)) > 0 ? "print" : "failed_print",
      });
      if (usageError) return fail(`Print recorded, but filament usage failed: ${dbErrorMessage(usageError)}`);
    }
    revalidateProduction();
    revalidatePath("/filament");
    const failedUnits = runAfter?.quantity_failed ?? 0;
    const remaining = jobAfter?.quantity_pending ?? 0;
    return ok(
      undefined,
      remaining === 0
        ? "Print recorded — job moved to Quality Check"
        : failedUnits > 0
          ? `${failedUnits} unit${failedUnits === 1 ? "" : "s"} failed — ${remaining} to reprint (same job, no duplicate order)`
          : `Print recorded — ${remaining} unit${remaining === 1 ? "" : "s"} still to print`,
    );
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

const qcFailureSchema = z.object({
  job_id: uuid,
  unit_ids: z.array(uuid).min(1, "Choose at least one unit").max(500),
  reason: z.string().trim().min(1, "Describe why the unit failed quality check").max(500),
});

/** Units that fail quality check go back to be reprinted (same job). */
export async function recordQcFailureAction(input: z.input<typeof qcFailureSchema>): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const v = qcFailureSchema.parse(input);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_qc_failure", { p_job_id: v.job_id, p_reason: v.reason, p_unit_ids: v.unit_ids });
    if (error) return fail(dbErrorMessage(error));
    revalidateProduction();
    return ok(undefined, `${data} unit${data === 1 ? "" : "s"} sent back for reprinting`);
  } catch (e) {
    return handle(e);
  }
}
