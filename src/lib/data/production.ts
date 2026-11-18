import "server-only";
import { createClient } from "@/lib/supabase/server";

export const BOARD_JOB_SELECT = `id, job_number, stage, priority, quantity, printer_id, estimated_print_minutes, material, colour,
  estimated_filament_g, due_date, attempt_count, failed_attempts, board_position, stage_changed_at, notes, is_sample,
  order:orders!inner(id, order_number, customer_name, source, dispatch_by, status, is_sample),
  item:order_items!inner(id, title, variant_title, personalisation),
  product:products(id, name, sku),
  printer:printers!production_jobs_printer_id_fkey(id, name)`;

export async function getBoardJobs({ includeClosed = false }: { includeClosed?: boolean } = {}) {
  const supabase = await createClient();
  let query = supabase.from("production_jobs").select(BOARD_JOB_SELECT).order("board_position", { ascending: true });
  if (!includeClosed) {
    // Keep the board fast: show recently dispatched/completed only.
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    query = query.or(`stage.not.in.(dispatched,completed),stage_changed_at.gte.${since}`);
  }
  query = query.neq("order.status", "cancelled");
  const { data, error } = await query.limit(1000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type BoardJob = Awaited<ReturnType<typeof getBoardJobs>>[number];

export async function getActivePrinters() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("printers")
    .select("id, name, status, supported_materials, current_print_run_id")
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

export type PrinterOption = Awaited<ReturnType<typeof getActivePrinters>>[number];

export async function getJobDetail(jobId: string) {
  const supabase = await createClient();
  const [job, runs, activity, filament] = await Promise.all([
    supabase
      .from("production_jobs")
      .select(
        `*, order:orders(id, order_number, customer_name, source, dispatch_by, status, production_notes, customer_note),
         item:order_items(id, title, variant_title, variant_details, personalisation, sku, internal_notes),
         product:products(id, name, sku, production_instructions, model_file_ref),
         printer:printers!production_jobs_printer_id_fkey(id, name)`,
      )
      .eq("id", jobId)
      .maybeSingle(),
    supabase
      .from("print_runs")
      .select("id, status, attempt_number, started_at, ended_at, failure_reason, notes, estimated_minutes, filament_recorded, quantity, printer:printers!print_runs_printer_id_fkey(id, name)")
      .eq("production_job_id", jobId)
      .order("started_at", { ascending: false }),
    supabase
      .from("activity_log")
      .select("id, action, message, created_at, actor_label, actor:profiles(full_name, email)")
      .eq("entity_type", "production_job")
      .eq("entity_id", jobId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("filament_stock_overview")
      .select("id, brand, material, colour, colour_hex, remaining_g")
      .eq("is_archived", false)
      .gt("remaining_g", 0)
      .order("material"),
  ]);
  if (job.error) throw new Error(job.error.message);
  if (!job.data) return null;
  const usage = await supabase
    .from("filament_usage")
    .select("id, grams, cost, kind, created_at, print_run_id, stock:filament_stock(brand, material, colour)")
    .eq("production_job_id", jobId)
    .order("created_at", { ascending: false });
  return {
    job: job.data,
    runs: runs.data ?? [],
    activity: activity.data ?? [],
    filament: (filament.data ?? []).filter((f): f is typeof f & { id: string } => Boolean(f.id)),
    usage: usage.data ?? [],
  };
}

export type JobDetail = NonNullable<Awaited<ReturnType<typeof getJobDetail>>>;
