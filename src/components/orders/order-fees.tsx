import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";

type Fee = { id: string; kind: string; label: string; amount: number; currency: string; counted: boolean; external_ref: string };
type Props = { order: { source: string; total: number; tax_total: number; currency: string; fee_basis: string | null; order_fees?: Fee[] | null } };

/** Marketplace fees for one order, as reported by Etsy/Shopify (read-only). */
export function OrderFeesSummary({ order }: Props) {
  if (order.source !== "etsy" && order.source !== "shopify") return null;
  const fees = [...(order.order_fees ?? [])].sort((a, b) => Number(b.counted) - Number(a.counted) || a.label.localeCompare(b.label));
  const counted = fees.filter((f) => f.counted).reduce((s, f) => s + Number(f.amount), 0);
  const basis = order.fee_basis;
  const money = (v: number) => formatCurrency(v, order.currency);

  return (
    <div className="mt-3 space-y-1.5 border-t border-dashed border-line pt-3" data-testid="order-fees">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">Marketplace fees</span>
        <Badge size="sm" tone={basis === "actual" ? "green" : basis === "partial" ? "amber" : "neutral"}>
          {basis === "actual" ? "Actual" : basis === "partial" ? "Partly known" : basis === "unavailable" ? "Not available" : "Not read yet"}
        </Badge>
      </div>
      {fees.map((f) => (
        <div key={f.id} className={cn("flex justify-between gap-3 text-muted", !f.counted && "line-through opacity-60")} title={f.counted ? undefined : "Already counted in another line"}>
          <span className="min-w-0 truncate">{f.label}</span>
          <span className="tabular">{money(-Number(f.amount))}</span>
        </div>
      ))}
      {basis === "actual" ? (
        <div className="flex justify-between font-medium text-ink">
          <span>After fees</span>
          <span className="tabular">{money(Number(order.total) - Number(order.tax_total) - counted)}</span>
        </div>
      ) : (
        <p className="text-xs text-muted">
          {basis === "partial"
            ? "Some fees aren’t reported yet, so profit uses the estimate from Settings for this order."
            : basis === "unavailable"
              ? "The marketplace doesn’t report fees for this order (e.g. paid outside Shopify Payments) — profit uses the estimate."
              : "Fees are read automatically after the next sync."}
        </p>
      )}
    </div>
  );
}
