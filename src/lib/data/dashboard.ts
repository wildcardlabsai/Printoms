import "server-only";
import { createClient } from "@/lib/supabase/server";

export type DashboardMetrics = {
  total_orders: number;
  new_today: number;
  awaiting_production: number;
  in_production: number;
  ready_to_pack: number;
  awaiting_dispatch: number;
  on_hold: number;
  overdue: number;
  total_sales: number;
  etsy_sales: number;
  shopify_sales: number;
  manual_sales: number;
  etsy_orders: number;
  shopify_orders: number;
  manual_orders: number;
  sample_orders: number;
  currently_printing: number;
  jobs_by_stage: Record<string, number>;
  sales_30d: { date: string; etsy: number; shopify: number; manual: number; orders: number }[];
};

export async function getDashboard() {
  const supabase = await createClient();
  const [metrics, recent, deadlines, printers, activity, integrations] = await Promise.all([
    supabase.rpc("dashboard_metrics"),
    supabase
      .from("orders")
      .select("id, order_number, source, customer_name, status, total, currency, order_date, is_sample")
      .order("order_date", { ascending: false })
      .limit(7),
    supabase
      .from("orders")
      .select("id, order_number, customer_name, dispatch_by, status, source, priority")
      .not("status", "in", "(dispatched,completed,cancelled)")
      .not("dispatch_by", "is", null)
      .order("dispatch_by", { ascending: true })
      .limit(6),
    supabase
      .from("printers")
      .select(
        "id, name, model, status, estimated_completion_at, current_job:production_jobs!printers_current_job_fk(job_number, quantity, item:order_items(title))",
      )
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("activity_log")
      .select("id, action, message, created_at, actor_label, actor:profiles(full_name, email)")
      .or("entity_type.eq.production_job,action.like.order.dispatched,action.like.order.packed")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("integrations").select("provider, status, last_successful_sync_at"),
  ]);
  if (metrics.error) throw new Error(metrics.error.message);
  return {
    metrics: metrics.data as unknown as DashboardMetrics,
    recent: recent.data ?? [],
    deadlines: deadlines.data ?? [],
    printers: printers.data ?? [],
    activity: activity.data ?? [],
    integrations: integrations.data ?? [],
  };
}
