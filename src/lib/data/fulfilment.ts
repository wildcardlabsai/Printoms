import "server-only";
import { createClient } from "@/lib/supabase/server";

const SELECT = `id, order_number, source, requires_review, customer_data_status, customer_data_restricted_fields, external_order_id, external_order_number, customer_name, customer_email, shipping_address,
  shipping_method, dispatch_by, status, priority, production_notes, customer_note, total, currency, is_sample, dispatched_at, tracking_number, carrier,
  order_items(id, title, variant_title, quantity, personalisation, sku, product:products(name, sku)),
  shipments(id, status, carrier, tracking_number, tracking_url, shipping_method, packaging_notes, checklist, packed_at, dispatched_at,
    marketplace_push_status, marketplace_push_error, marketplace_pushed_at, shipping_cost,
    marketplace_push_attempts, marketplace_push_error_category,
    fulfilment_submissions(id, attempt, status, error_category, error_message, http_status, started_at, finished_at))`;

export type FulfilmentTab = "ready" | "packed" | "dispatched";

export async function getFulfilmentOrders(tab: FulfilmentTab) {
  const supabase = await createClient();
  let q = supabase.from("orders").select(SELECT);
  if (tab === "ready") q = q.eq("status", "ready_to_pack").order("dispatch_by", { ascending: true, nullsFirst: false });
  else if (tab === "packed") q = q.eq("status", "packed").order("dispatch_by", { ascending: true, nullsFirst: false });
  else
    q = q
      .in("status", ["dispatched", "completed"])
      .gte("dispatched_at", new Date(Date.now() - 45 * 86_400_000).toISOString())
      .order("dispatched_at", { ascending: false });
  const { data, error } = await q.limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type FulfilmentOrder = Awaited<ReturnType<typeof getFulfilmentOrders>>[number];

export async function getFulfilmentCounts() {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [ready, packed, pushFailed] = await Promise.all([
    supabase.from("orders").select("id", head).eq("status", "ready_to_pack"),
    supabase.from("orders").select("id", head).eq("status", "packed"),
    supabase.from("shipments").select("id", head).eq("marketplace_push_status", "failed"),
  ]);
  return { ready: ready.count ?? 0, packed: packed.count ?? 0, pushFailed: pushFailed.count ?? 0 };
}

export async function getConnectedMarketplaces() {
  const supabase = await createClient();
  const { data } = await supabase.from("integrations").select("provider, status");
  return (data ?? []).filter((i) => i.status === "connected" || i.status === "error").map((i) => i.provider);
}
