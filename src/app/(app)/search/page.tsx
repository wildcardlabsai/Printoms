import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, SearchX, ShoppingBag, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { OrderStatusBadge, SourceBadge } from "@/components/ui/status-badges";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/data/orders";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  if (!q) {
    return (
      <>
        <PageHeader title="Search" />
        <Card><EmptyState icon={<SearchX />} title="Type to search" description="Search orders, customers and products from the bar at the top of every page (⌘K)." /></Card>
      </>
    );
  }
  const supabase = await createClient();
  const like = `%${escapeLike(q.toLowerCase())}%`;
  const safe = like.replace(/[,()]/g, " ");
  const [orders, customers, products] = await Promise.all([
    supabase.from("orders").select("id, order_number, source, customer_name, status, total, currency, order_date").ilike("search_text", like).order("order_date", { ascending: false }).limit(15),
    supabase.from("customer_summaries").select("id, display_name, email, order_count").or(`display_name.ilike.${safe},email.ilike.${safe}`).limit(10),
    supabase.from("products").select("id, name, sku, category").or(`name.ilike.${safe},sku.ilike.${safe}`).limit(10),
  ]);
  const total = (orders.data?.length ?? 0) + (customers.data?.length ?? 0) + (products.data?.length ?? 0);

  return (
    <>
      <PageHeader title={`Results for “${q}”`} description={`${total} match${total === 1 ? "" : "es"} across orders, customers and products`} />
      {total === 0 ? (
        <Card><EmptyState icon={<SearchX />} title="No matches" description="Try an order number (PF-1001), marketplace ID, customer name, email, tracking number or SKU." /></Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="overflow-hidden">
            <CardHeader icon={<ShoppingBag />} title={`Orders (${orders.data?.length ?? 0})`} />
            <ul className="divide-y divide-line border-t border-line">
              {(orders.data ?? []).map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-subtle">
                    <SourceBadge source={o.source} compact />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{o.order_number}</p>
                      <p className="truncate text-xs text-muted">{o.customer_name} · {formatDate(o.order_date)}</p>
                    </div>
                    <OrderStatusBadge status={o.status} />
                    <span className="w-20 text-right text-sm tabular">{formatCurrency(o.total, o.currency)}</span>
                  </Link>
                </li>
              ))}
              {!orders.data?.length ? <li className="px-5 py-4 text-sm text-muted">No matching orders</li> : null}
            </ul>
          </Card>
          <div className="space-y-5">
            <Card className="overflow-hidden">
              <CardHeader icon={<Users />} title={`Customers (${customers.data?.length ?? 0})`} />
              <ul className="divide-y divide-line border-t border-line">
                {(customers.data ?? []).map((c) => (
                  <li key={c.id}>
                    <Link href={`/customers/${c.id}`} className="block px-5 py-3 hover:bg-subtle">
                      <p className="text-sm font-medium text-ink">{c.display_name}</p>
                      <p className="truncate text-xs text-muted">{c.email ?? "No email"} · {c.order_count} orders</p>
                    </Link>
                  </li>
                ))}
                {!customers.data?.length ? <li className="px-5 py-4 text-sm text-muted">No matching customers</li> : null}
              </ul>
            </Card>
            <Card className="overflow-hidden">
              <CardHeader icon={<Boxes />} title={`Products (${products.data?.length ?? 0})`} />
              <ul className="divide-y divide-line border-t border-line">
                {(products.data ?? []).map((p) => (
                  <li key={p.id}>
                    <Link href={`/products/${p.id}`} className="block px-5 py-3 hover:bg-subtle">
                      <p className="text-sm font-medium text-ink">{p.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted">{p.sku}{p.category ? ` · ${p.category}` : ""}</p>
                    </Link>
                  </li>
                ))}
                {!products.data?.length ? <li className="px-5 py-4 text-sm text-muted">No matching products</li> : null}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
