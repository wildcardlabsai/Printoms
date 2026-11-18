import "server-only";
import { createClient } from "@/lib/supabase/server";

const PRINTER_SELECT = `*,
  current_job:production_jobs!printers_current_job_fk(id, job_number, quantity, estimated_filament_g, material,
    item:order_items(title, personalisation), order:orders(id, order_number, customer_name)),
  current_run:print_runs!printers_current_run_fk(id, started_at, estimated_minutes, quantity,
    print_run_units(unit_id, unit:production_units(unit_number, printed_personalisation))),
  queue:print_queue(id, status, position, job:production_jobs(id, job_number, stage, quantity, estimated_print_minutes, priority, material, colour,
    item:order_items(title), order:orders(order_number, dispatch_by)))`;

export async function listPrinters({ includeInactive = false } = {}) {
  const supabase = await createClient();
  let q = supabase.from("printers").select(PRINTER_SELECT).order("sort_order").order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    ...p,
    queue: (p.queue ?? []).filter((q) => q.status === "queued").sort((a, b) => a.position - b.position),
  }));
}

export type PrinterRow = Awaited<ReturnType<typeof listPrinters>>[number];

export async function getPrinter(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("printers").select(PRINTER_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { ...data, queue: (data.queue ?? []).filter((q) => q.status === "queued").sort((a, b) => a.position - b.position) };
}

export async function listPrintRuns({ printerId, status, limit = 50 }: { printerId?: string; status?: "failed" | "succeeded"; limit?: number }) {
  const supabase = await createClient();
  let q = supabase
    .from("print_runs")
    .select(
      `id, status, attempt_number, quantity, quantity_succeeded, quantity_failed, started_at, ended_at, estimated_minutes, failure_reason, notes, filament_recorded,
       printer:printers!print_runs_printer_id_fkey(id, name),
       job:production_jobs(id, job_number, item:order_items(title), order:orders(id, order_number))`,
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  if (printerId) q = q.eq("printer_id", printerId);
  // The failure log includes partly failed plates (some units failed).
  if (status === "failed") q = q.or("status.eq.failed,quantity_failed.gt.0");
  else if (status) q = q.eq("status", status);
  else q = q.neq("status", "printing");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type PrintRunRow = Awaited<ReturnType<typeof listPrintRuns>>[number];

/** Jobs waiting for a printer (for the "assign" picker). */
export async function listAssignableJobs() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("production_jobs")
    .select("id, job_number, quantity, priority, estimated_print_minutes, material, colour, printer_id, item:order_items(title), order:orders!inner(order_number, status)")
    .in("stage", ["new_order", "awaiting_preparation", "ready_to_print"])
    .neq("order.status", "cancelled")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(200);
  return data ?? [];
}

export type AssignableJob = Awaited<ReturnType<typeof listAssignableJobs>>[number];

export async function getFilamentOptions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("filament_stock_overview")
    .select("id, brand, material, colour, remaining_g")
    .eq("is_archived", false)
    .gt("remaining_g", 0)
    .order("material");
  return (data ?? [])
    .filter((f): f is typeof f & { id: string } => Boolean(f.id))
    .map((f) => ({ ...f, remaining_g: f.remaining_g == null ? null : Number(f.remaining_g) }));
}

export async function getPrinterStats() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data } = await supabase
    .from("print_runs")
    .select("printer_id, status, started_at, ended_at")
    .gte("started_at", since)
    .neq("status", "printing");
  const stats: Record<string, { runs: number; failed: number; hours: number }> = {};
  for (const r of data ?? []) {
    if (!r.printer_id) continue;
    const s = (stats[r.printer_id] ??= { runs: 0, failed: 0, hours: 0 });
    s.runs++;
    if (r.status === "failed") s.failed++;
    if (r.ended_at) s.hours += (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 3_600_000;
  }
  return stats;
}
