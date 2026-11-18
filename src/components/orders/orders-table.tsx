import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import { Badge, SampleBadge } from "@/components/ui/badge";
import { OrderStatusBadge, PaymentBadge, PriorityBadge, SourceBadge } from "@/components/ui/status-badges";
import { cn, externalRef, formatCurrency, formatDate, formatRelative, isOverdue } from "@/lib/utils";
import type { OrderListRow } from "@/lib/data/orders";

function Deadline({ value, status }: { value: string | null; status: string }) {
  if (!value) return <span className="text-faint">—</span>;
  const overdue = isOverdue(value, status);
  const closed = ["dispatched", "completed", "cancelled"].includes(status);
  return (
    <span className={cn("inline-flex items-center gap-1 tabular", overdue ? "font-semibold text-red-600" : "text-ink-2")}>
      {overdue ? <CalendarClock className="size-3.5" /> : null}
      {formatDate(value, { day: "numeric", month: "short" })}
      {!closed ? <span className={cn("text-xs", overdue ? "text-red-500" : "text-faint")}>· {formatRelative(value)}</span> : null}
    </span>
  );
}

export function OrdersTable({ rows }: { rows: OrderListRow[] }) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-medium text-muted">
              <th className="py-2.5 pr-3 pl-5 font-medium">Order</th>
              <th className="px-3 py-2.5 font-medium">Customer</th>
              <th className="px-3 py-2.5 font-medium">Source</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Payment</th>
              <th className="px-3 py-2.5 font-medium">Dispatch by</th>
              <th className="px-3 py-2.5 text-right font-medium">Items</th>
              <th className="py-2.5 pr-5 pl-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((o) => (
              <tr key={o.id} className="group relative transition-colors hover:bg-subtle">
                <td className="py-3 pr-3 pl-5">
                  <Link href={`/orders/${o.id}`} className="font-semibold text-ink after:absolute after:inset-0">
                    {o.order_number}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    {externalRef(o) ? <span className="tabular">{externalRef(o)}</span> : null}
                    <span>{formatDate(o.order_date, { day: "numeric", month: "short" })}</span>
                    {o.is_sample ? <SampleBadge /> : null}
                  </div>
                </td>
                <td className="max-w-[220px] px-3 py-3">
                  <p className="truncate font-medium text-ink">{o.customer_name}</p>
                  {o.customer_email ? <p className="truncate text-xs text-muted">{o.customer_email}</p> : null}
                </td>
                <td className="px-3 py-3"><SourceBadge source={o.source} /></td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <OrderStatusBadge status={o.status} />
                    <PriorityBadge priority={o.priority} hideNormal />
                    {o.requires_review ? <Badge tone="red" size="sm">Needs review</Badge> : null}
                  </div>
                </td>
                <td className="hidden px-3 py-3 xl:table-cell"><PaymentBadge status={o.payment_status} /></td>
                <td className="px-3 py-3 whitespace-nowrap"><Deadline value={o.dispatch_by} status={o.status} /></td>
                <td className="px-3 py-3 text-right tabular text-ink-2">{o.item_count}</td>
                <td className="py-3 pr-5 pl-3 text-right font-medium tabular text-ink">{formatCurrency(o.total, o.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`} className="flex items-start gap-3 px-4 py-3.5 active:bg-subtle">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{o.order_number}</span>
                  <SourceBadge source={o.source} compact />
                  {o.is_sample ? <SampleBadge /> : null}
                  <span className="ml-auto font-semibold tabular text-ink">{formatCurrency(o.total, o.currency)}</span>
                </div>
                <p className="truncate text-sm text-ink-2">
                  {o.customer_name} · {o.item_count} item{o.item_count === 1 ? "" : "s"}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <OrderStatusBadge status={o.status} />
                  <PriorityBadge priority={o.priority} hideNormal />
                    {o.requires_review ? <Badge tone="red" size="sm">Needs review</Badge> : null}
                  <span className="ml-auto"><Deadline value={o.dispatch_by} status={o.status} /></span>
                </div>
              </div>
              <ChevronRight className="mt-1 size-4 shrink-0 text-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
