import "server-only";
import { createClient } from "@/lib/supabase/server";
import { escapeLike } from "./orders";

export const CUSTOMER_SORTS = {
  recent: { column: "last_order_at", ascending: false, label: "Most recent order" },
  spend: { column: "total_spend", ascending: false, label: "Highest spend" },
  orders: { column: "order_count", ascending: false, label: "Most orders" },
  name: { column: "display_name", ascending: true, label: "Name A–Z" },
} as const;

export async function listCustomers({ q, source, sort = "recent", page = 1, pageSize = 30 }: { q?: string; source?: string; sort?: keyof typeof CUSTOMER_SORTS; page?: number; pageSize?: number }) {
  const supabase = await createClient();
  const s = CUSTOMER_SORTS[sort] ?? CUSTOMER_SORTS.recent;
  let query = supabase.from("customer_summaries").select("*", { count: "exact" });
  if (q?.trim()) {
    const term = `%${escapeLike(q.trim()).replace(/[,()]/g, " ")}%`;
    query = query.or(`display_name.ilike.${term},email.ilike.${term}`);
  }
  if (source === "etsy" || source === "shopify" || source === "vinted" || source === "manual") query = query.contains("sources", [source]);
  const { data, count, error } = await query
    .order(s.column, { ascending: s.ascending, nullsFirst: false })
    .order("display_name")
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0, page, pageSize };
}

export async function getCustomer(id: string) {
  const supabase = await createClient();
  const [summary, customer, identities, addresses] = await Promise.all([
    supabase.from("customer_summaries").select("*").eq("id", id).maybeSingle(),
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("customer_identities").select("*").eq("customer_id", id),
    supabase.from("customer_addresses").select("*").eq("customer_id", id).order("last_used_at", { ascending: false }),
  ]);
  if (!customer.data) return null;
  return { ...customer.data, summary: summary.data, identities: identities.data ?? [], addresses: addresses.data ?? [] };
}

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomer>>>;

export async function findMergeCandidates(id: string, name: string, email: string | null) {
  const supabase = await createClient();
  const first = name.split(/\s+/)[0] ?? name;
  const filters = [`display_name.ilike.%${escapeLike(first).replace(/[,()]/g, " ")}%`];
  if (email) filters.push(`email.ilike.${escapeLike(email).replace(/[,()]/g, " ")}`);
  const { data } = await supabase
    .from("customer_summaries")
    .select("id, display_name, email, order_count, sources")
    .or(filters.join(","))
    .neq("id", id)
    .limit(10);
  return data ?? [];
}
