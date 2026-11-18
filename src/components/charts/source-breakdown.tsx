import { SERIES } from "./palette";
import { formatCurrency, formatNumber } from "@/lib/utils";

/** Proportional bar list — reads more accurately than a pie for 2–3 parts. */
export function SourceBreakdown({
  rows,
  currency,
}: {
  rows: { key: keyof typeof SERIES; label: string; revenue: number; orders: number }[];
  currency: string;
}) {
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  return (
    <div className="space-y-4">
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-zinc-100" role="img" aria-label="Revenue share by source">
        {total > 0
          ? rows
              .filter((r) => r.revenue > 0)
              .map((r) => <span key={r.key} style={{ width: `${(r.revenue / total) * 100}%`, background: SERIES[r.key] }} />)
          : null}
      </div>
      <ul className="space-y-3">
        {rows.map((r) => {
          const share = total > 0 ? (r.revenue / total) * 100 : 0;
          return (
            <li key={r.key} className="flex items-center gap-3 text-sm">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: SERIES[r.key] }} aria-hidden />
              <span className="font-medium text-ink">{r.label}</span>
              <span className="text-xs text-muted">{formatNumber(r.orders)} orders</span>
              <span className="ml-auto font-medium tabular text-ink">{formatCurrency(r.revenue, currency)}</span>
              <span className="w-11 text-right text-xs tabular text-muted">{share.toFixed(0)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
