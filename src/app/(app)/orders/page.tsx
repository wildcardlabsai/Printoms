import type { Metadata } from "next";
import { Plus, RefreshCw, ShoppingBag } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TabNav } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { OrderFilters } from "@/components/orders/order-filters";
import { OrdersTable } from "@/components/orders/orders-table";
import { getOrderViewCounts, listOrders, ORDER_SORTS, ORDER_VIEWS, type OrderSort, type OrderView } from "@/lib/data/orders";
import { hasRole, requireUser } from "@/lib/auth";
import { ORDER_SOURCE, ORDER_STATUS, PAYMENT_STATUS, type OrderSource, type OrderStatus, type PaymentStatus } from "@/lib/constants";

export const metadata: Metadata = { title: "All Orders" };

type SP = Record<string, string | undefined>;

function pick<T extends string>(value: string | undefined, allowed: readonly T[] | Record<T, unknown>): T | undefined {
  const list = Array.isArray(allowed) ? allowed : Object.keys(allowed);
  return value && (list as string[]).includes(value) ? (value as T) : undefined;
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = pick<OrderView>(sp.view, ORDER_VIEWS) ?? "active";
  const params = {
    q: sp.q,
    view,
    source: pick<OrderSource>(sp.source, ORDER_SOURCE),
    status: pick<OrderStatus>(sp.status, ORDER_STATUS),
    payment: pick<PaymentStatus>(sp.payment, PAYMENT_STATUS),
    sort: pick<OrderSort>(sp.sort, ORDER_SORTS),
    page: Math.max(1, Number(sp.page) || 1),
  };
  const [result, counts] = await Promise.all([listOrders(params), getOrderViewCounts()]);

  const href = (changes: SP) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...changes })) if (v) next.set(k, v);
    return `/orders?${next.toString()}`;
  };

  const tabs: { id: OrderView; label: string; count?: number }[] = [
    { id: "active", label: "Active", count: counts.active },
    ...(counts.review ? [{ id: "review" as const, label: "Needs review", count: counts.review }] : []),
    { id: "overdue", label: "Overdue", count: counts.overdue },
    { id: "due_soon", label: "Due in 48h", count: counts.due_soon },
    { id: "new", label: "New", count: counts.new },
    { id: "in_production", label: "In production", count: counts.in_production },
    { id: "ready", label: "Ready to pack", count: counts.ready },
    { id: "dispatched", label: "Dispatched" },
    { id: "all", label: "All" },
  ];
  const filtered = Boolean(sp.q || sp.source || sp.status || sp.payment);

  return (
    <>
      <PageHeader
        title="All Orders"
        description="Etsy, Shopify and manual orders in one place. Each item moves through production independently."
        actions={
          <>
            <ButtonLink href="/settings/integrations" variant="outline">
              <RefreshCw /> Sync status
            </ButtonLink>
            {hasRole(user, "staff") ? (
              <>
                <ButtonLink href="/orders/new/vinted" variant="outline">
                  <Plus /> Vinted sale
                </ButtonLink>
                <ButtonLink href="/orders/new">
                  <Plus /> Manual order
                </ButtonLink>
              </>
            ) : null}
          </>
        }
      />
      <div className="space-y-4">
        <TabNav
          active={view}
          tabs={tabs.map((t) => ({ ...t, href: href({ view: t.id === "active" ? undefined : t.id, page: undefined }) }))}
        />
        <OrderFilters />
        <Card className="overflow-hidden">
          {result.rows.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag />}
              title={filtered ? "No orders match these filters" : view === "overdue" ? "Nothing overdue" : "No orders here yet"}
              description={
                filtered
                  ? "Try a different search or clear the filters."
                  : "Orders appear here once Etsy or Shopify is connected and synced, or when you add a manual order."
              }
              action={
                filtered ? (
                  <ButtonLink href={`/orders${view !== "active" ? `?view=${view}` : ""}`} variant="outline">
                    Clear filters
                  </ButtonLink>
                ) : (
                  <>
                    <ButtonLink href="/settings/integrations" variant="outline">Connect a marketplace</ButtonLink>
                    {hasRole(user, "staff") ? <ButtonLink href="/orders/new">Add manual order</ButtonLink> : null}
                  </>
                )
              }
            />
          ) : (
            <>
              <OrdersTable rows={result.rows} />
              <div className="border-t border-line px-4 py-3 sm:px-5">
                <Pagination
                  page={result.page}
                  pageSize={result.pageSize}
                  total={result.total}
                  hrefFor={(p) => href({ page: p > 1 ? String(p) : undefined })}
                />
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
