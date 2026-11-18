import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OrderSource, OrderStatus, PaymentStatus } from "@/lib/constants";

export const ORDER_VIEWS = ["active", "overdue", "due_soon", "new", "in_production", "ready", "dispatched", "all"] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];

export const ORDER_SORTS = {
  newest: { column: "order_date", ascending: false, label: "Newest first" },
  oldest: { column: "order_date", ascending: true, label: "Oldest first" },
  deadline: { column: "dispatch_by", ascending: true, label: "Dispatch deadline" },
  value_desc: { column: "total", ascending: false, label: "Highest value" },
  customer: { column: "customer_name", ascending: true, label: "Customer A–Z" },
} as const;
export type OrderSort = keyof typeof ORDER_SORTS;

export type OrderListParams = {
  q?: string;
  view?: OrderView;
  source?: OrderSource | "";
  status?: OrderStatus | "";
  payment?: PaymentStatus | "";
  sort?: OrderSort;
  page?: number;
  pageSize?: number;
  customerId?: string;
};

const CLOSED = "(dispatched,completed,cancelled)";

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function listOrders(params: OrderListParams) {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 25;
  const sort = ORDER_SORTS[params.sort ?? "newest"] ?? ORDER_SORTS.newest;

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, source, external_order_id, external_order_number, customer_name, customer_email, order_date, payment_status, status, priority, dispatch_by, total, currency, is_sample, order_items(quantity)",
      { count: "exact" },
    );

  const now = new Date().toISOString();
  switch (params.view ?? "active") {
    case "active":
      query = query.not("status", "in", "(completed,cancelled)");
      break;
    case "overdue":
      query = query.lt("dispatch_by", now).not("status", "in", CLOSED);
      break;
    case "due_soon":
      query = query
        .gte("dispatch_by", now)
        .lt("dispatch_by", new Date(Date.now() + 48 * 3600_000).toISOString())
        .not("status", "in", CLOSED);
      break;
    case "new":
      query = query.eq("status", "new");
      break;
    case "in_production":
      query = query.eq("status", "in_production");
      break;
    case "ready":
      query = query.in("status", ["ready_to_pack", "packed"]);
      break;
    case "dispatched":
      query = query.in("status", ["dispatched", "completed"]);
      break;
    case "all":
      break;
  }

  if (params.q?.trim()) query = query.ilike("search_text", `%${escapeLike(params.q.trim().toLowerCase())}%`);
  if (params.source) query = query.eq("source", params.source);
  if (params.status) query = query.eq("status", params.status);
  if (params.payment) query = query.eq("payment_status", params.payment);
  if (params.customerId) query = query.eq("customer_id", params.customerId);

  query = query
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return {
    rows: (data ?? []).map((o) => ({
      ...o,
      item_count: (o.order_items ?? []).reduce((sum, i) => sum + i.quantity, 0),
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export type OrderListRow = Awaited<ReturnType<typeof listOrders>>["rows"][number];

export async function getOrderViewCounts() {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const head = { count: "exact" as const, head: true };
  const [active, overdue, dueSoon, fresh, inProd, ready] = await Promise.all([
    supabase.from("orders").select("id", head).not("status", "in", "(completed,cancelled)"),
    supabase.from("orders").select("id", head).lt("dispatch_by", now).not("status", "in", CLOSED),
    supabase
      .from("orders")
      .select("id", head)
      .gte("dispatch_by", now)
      .lt("dispatch_by", new Date(Date.now() + 48 * 3600_000).toISOString())
      .not("status", "in", CLOSED),
    supabase.from("orders").select("id", head).eq("status", "new"),
    supabase.from("orders").select("id", head).eq("status", "in_production"),
    supabase.from("orders").select("id", head).in("status", ["ready_to_pack", "packed"]),
  ]);
  return {
    active: active.count ?? 0,
    overdue: overdue.count ?? 0,
    due_soon: dueSoon.count ?? 0,
    new: fresh.count ?? 0,
    in_production: inProd.count ?? 0,
    ready: ready.count ?? 0,
  };
}

export async function getOrder(id: string) {
  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `*,
       customer:customers(id, display_name, email, phone),
       order_items(*, product:products(id, name, sku, image_path, material, default_colour),
         production_jobs(id, job_number, stage, priority, printer_id, quantity, attempt_count, failed_attempts,
           estimated_print_minutes, material, colour, notes, printer:printers!production_jobs_printer_id_fkey(id, name))),
       shipments(*)`,
    )
    .eq("id", id)
    .order("created_at", { referencedTable: "order_items", ascending: true })
    .order("created_at", { referencedTable: "shipments", ascending: false })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return order;
}

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

export async function getNotes(entityType: string, entityId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("internal_notes")
    .select("id, body, created_at, author_id, author:profiles(full_name, email)")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export type NoteRow = Awaited<ReturnType<typeof getNotes>>[number];

export async function getOrderActivity(orderId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_log")
    .select("id, action, message, created_at, actor_label, actor:profiles(full_name, email)")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export type ActivityRow = Awaited<ReturnType<typeof getOrderActivity>>[number];

export async function getProductOptions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, sku, base_price, is_sample")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export type ProductOption = Awaited<ReturnType<typeof getProductOptions>>[number];

export async function getIntegrationShopDomain(provider: "etsy" | "shopify") {
  const supabase = await createClient();
  const { data } = await supabase.from("integrations").select("shop_domain, external_shop_id").eq("provider", provider).maybeSingle();
  return data;
}
