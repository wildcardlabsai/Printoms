import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, Factory, Info, TrendingDown, TrendingUp, Trophy, Truck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/empty-state";
import { SalesChart } from "@/components/charts/sales-chart";
import { VolumeChart } from "@/components/charts/volume-chart";
import { SERIES } from "@/components/charts/palette";
import { DateRangePicker } from "./date-range-picker";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBusinessSettings } from "@/lib/data/settings";
import { cn, formatCurrency, formatGrams, formatMinutes, formatNumber, formatShortDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

type Summary = {
  orders: number;
  gross_sales: number;
  tax_collected: number;
  net_revenue: number;
  etsy_revenue: number;
  shopify_revenue: number;
  vinted_revenue?: number;
  manual_revenue: number;
  average_order_value: number;
  est_marketplace_fees: number;
  orders_with_actual_fees?: number;
  orders_with_fees?: number;
  est_filament_cost: number;
  est_packaging_cost: number;
  est_other_cost: number;
  recorded_shipping_cost: number;
  est_total_costs: number;
  est_profit: number;
  orders_with_unmapped_items: number;
};
type Report = {
  current: Summary;
  previous: Summary;
  monthly: { month: string; orders: number; etsy: number; shopify: number; vinted?: number; manual: number; net_revenue: number }[];
  daily: { date: string; orders: number; revenue: number }[];
  best_sellers: { product_id: string | null; name: string; sku: string | null; mapped: boolean; units: number; revenue: number; orders: number }[];
  production: { print_runs: number; succeeded: number; failed: number; failure_rate: number; avg_print_minutes: number; total_print_hours: number };
  fulfilment: { dispatched_orders: number; avg_turnaround_hours: number; on_time_rate: number | null };
  filament: { recorded_grams: number; recorded_cost: number; failed_print_grams: number; by_material: { material: string; grams: number; cost: number }[] };
  includes_sample_data: boolean;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

function resolveRange(sp: { range?: string; from?: string; to?: string }) {
  const today = new Date();
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (sp.from && sp.to && re.test(sp.from) && re.test(sp.to) && sp.from <= sp.to) return { preset: "custom", from: sp.from, to: sp.to };
  const preset = ["7d", "30d", "90d", "ytd", "12m"].includes(sp.range ?? "") ? sp.range! : "30d";
  const from = new Date(today);
  if (preset === "7d") from.setDate(today.getDate() - 6);
  else if (preset === "30d") from.setDate(today.getDate() - 29);
  else if (preset === "90d") from.setDate(today.getDate() - 89);
  else if (preset === "ytd") from.setMonth(0, 1);
  else if (preset === "12m") from.setFullYear(today.getFullYear() - 1, today.getMonth(), today.getDate() + 1);
  return { preset, from: iso(from), to: iso(today) };
}

function Delta({ current, previous, invert }: { current: number; previous: number; invert?: boolean }) {
  if (!previous) return <span className="text-xs text-faint">No prior data</span>;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const good = invert ? pct < 0 : pct >= 0;
  const Icon = pct >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", good ? "text-brand-700" : "text-red-600")}>
      <Icon className="size-3.5" /> {pct >= 0 ? "+" : ""}{pct.toFixed(0)}% <span className="font-normal text-muted">vs previous</span>
    </span>
  );
}

function Kpi({ label, value, delta, tag, sub }: { label: string; value: string; delta?: React.ReactNode; tag?: string; sub?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {tag ? <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200">{tag}</span> : null}
      </div>
      <p className="mt-2 text-[26px] leading-none font-semibold tracking-[-0.02em] text-ink tabular">{value}</p>
      <div className="mt-2 min-h-4">{delta}</div>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  await requireUser();
  const range = resolveRange(await searchParams);
  const supabase = await createClient();
  const [{ data, error }, settings] = await Promise.all([
    supabase.rpc("analytics_report", { p_from: range.from, p_to: range.to }),
    getBusinessSettings(),
  ]);
  if (error) throw new Error(error.message);
  const r = data as unknown as Report;
  const c = r.current;
  const p = r.previous;
  const currency = settings?.currency ?? "GBP";
  const money = (v: number) => formatCurrency(v, currency);
  const margin = c.net_revenue ? (c.est_profit / c.net_revenue) * 100 : 0;
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

  return (
    <>
      <PageHeader title="Analytics" description="Sales, production and cost performance. Profit figures are estimates based on your cost assumptions." />
      <div className="mb-5">
        <DateRangePicker preset={range.preset} from={range.from} to={range.to} />
      </div>

      {r.includes_sample_data ? (
        <Notice tone="neutral" icon={<Info />} className="mb-5" title="This period includes sample data">
          Remove sample data in Settings → Data before relying on these figures.
        </Notice>
      ) : null}

      {c.orders === 0 ? (
        <Card>
          <EmptyState title="No orders in this period" description="Choose a different date range, or connect a marketplace to start importing orders." />
        </Card>
      ) : (
        <>
          <section aria-labelledby="revenue-h" className="space-y-3">
            <h2 id="revenue-h" className="text-xs font-semibold uppercase tracking-[0.08em] text-faint">Revenue</h2>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Kpi label="Net revenue" value={money(c.net_revenue)} delta={<Delta current={c.net_revenue} previous={p.net_revenue} />} sub={`${money(c.gross_sales)} gross · ${money(c.tax_collected)} tax`} />
              <Kpi label="Orders" value={formatNumber(c.orders)} delta={<Delta current={c.orders} previous={p.orders} />} />
              <Kpi label="Average order value" value={money(c.average_order_value)} delta={<Delta current={c.average_order_value} previous={p.average_order_value} />} />
              <Kpi label="Estimated profit" tag="Estimate" value={money(c.est_profit)} delta={<Delta current={c.est_profit} previous={p.est_profit} />} sub={`${margin.toFixed(0)}% estimated margin`} />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(
                [
                  ["etsy", "Etsy revenue", c.etsy_revenue, p.etsy_revenue],
                  ["shopify", "Shopify revenue", c.shopify_revenue, p.shopify_revenue],
                  ["vinted", "Vinted revenue", c.vinted_revenue ?? 0, p.vinted_revenue ?? 0],
                  ["manual", "Manual revenue", c.manual_revenue, p.manual_revenue],
                ] as const
              ).map(([k, label, v, prev]) => (
                <div key={k} className="rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <span className="size-2.5 rounded-[3px]" style={{ background: SERIES[k] }} /> {label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-ink tabular">{money(v)}</p>
                  <div className="hidden sm:block"><Delta current={v} previous={prev} /></div>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader title="Monthly comparison" description="Net revenue (excl. tax) by channel" />
              <CardContent>
                <SalesChart
                  currency={currency}
                  data={r.monthly.map((m) => ({ label: monthLabel(m.month), etsy: Number(m.etsy), shopify: Number(m.shopify), vinted: Number(m.vinted ?? 0), manual: Number(m.manual) }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader title="Orders per day" description={`${formatNumber(c.orders)} orders between ${formatShortDate(range.from)} and ${formatShortDate(range.to)}`} />
              <CardContent className="pt-6">
                <VolumeChart data={r.daily.map((d) => ({ label: formatShortDate(d.date), orders: Number(d.orders) }))} height={252} />
              </CardContent>
            </Card>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Revenue, costs & estimated profit" description="How the estimate is built" />
              <CardContent>
                <dl className="space-y-0 text-sm">
                  {[
                    ["Gross sales", c.gross_sales, "revenue"],
                    ["Tax collected", -c.tax_collected, "muted"],
                    ["Net revenue", c.net_revenue, "subtotal"],
                    [
                      c.orders_with_fees && c.orders_with_actual_fees
                        ? `Marketplace fees (${c.orders_with_actual_fees === c.orders_with_fees ? "actual" : `actual for ${c.orders_with_actual_fees} of ${c.orders_with_fees} orders`})`
                        : "Marketplace fees (est.)",
                      -c.est_marketplace_fees,
                      "cost",
                    ],
                    ["Filament (est. / recorded)", -c.est_filament_cost, "cost"],
                    ["Packaging (est.)", -c.est_packaging_cost, "cost"],
                    ["Labour & other (est.)", -c.est_other_cost, "cost"],
                    ["Postage (recorded)", -c.recorded_shipping_cost, "cost"],
                    ["Estimated profit", c.est_profit, "total"],
                  ].map(([label, value, kind]) => (
                    <div
                      key={label as string}
                      className={cn(
                        "flex items-center justify-between py-2",
                        kind === "subtotal" && "border-t border-line font-semibold text-ink",
                        kind === "total" && "mt-1 border-t-2 border-ink pt-2.5 text-base font-semibold text-ink",
                        kind === "cost" && "text-ink-2",
                        kind === "muted" && "text-muted",
                        kind === "revenue" && "text-ink",
                      )}
                    >
                      <dt className="flex items-center gap-2">
                        {kind === "cost" ? <span className="size-1.5 rounded-full bg-red-400" /> : kind === "revenue" || kind === "subtotal" ? <span className="size-1.5 rounded-full bg-brand-500" /> : null}
                        {label}
                      </dt>
                      <dd className={cn("tabular", kind === "total" && (Number(value) < 0 ? "text-red-600" : "text-brand-700"))}>{money(Number(value))}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 space-y-1.5 rounded-lg bg-amber-50/70 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
                  <p className="font-semibold">Estimated — not accounting profit</p>
                  <p>Fees use the percentages in Settings. Filament uses recorded consumption where available, otherwise product estimates. Postage counts only costs entered at dispatch. Overheads, refunds and VAT treatment are not included.</p>
                  {c.orders_with_unmapped_items ? (
                    <p className="flex items-start gap-1"><CircleAlert className="mt-px size-3.5 shrink-0" /> {c.orders_with_unmapped_items} order(s) include items not linked to a product, so their material cost is unknown.</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader icon={<Trophy />} title="Best-selling products" description="By units sold in this period" />
              {r.best_sellers.length === 0 ? (
                <EmptyState compact title="No sales" />
              ) : (
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted">
                        <th className="py-2.5 pr-3 pl-5 font-medium">#</th>
                        <th className="px-3 py-2.5 font-medium">Product</th>
                        <th className="px-3 py-2.5 text-right font-medium">Units</th>
                        <th className="px-3 py-2.5 text-right font-medium">Orders</th>
                        <th className="py-2.5 pr-5 pl-3 text-right font-medium">Item revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {r.best_sellers.map((b, i) => {
                        const max = r.best_sellers[0]!.units || 1;
                        return (
                          <tr key={`${b.product_id}-${b.name}`}>
                            <td className="py-2.5 pr-3 pl-5 text-muted tabular">{i + 1}</td>
                            <td className="px-3 py-2.5">
                              {b.product_id ? <Link href={`/products/${b.product_id}`} className="font-medium text-ink hover:underline">{b.name}</Link> : <span className="font-medium text-ink">{b.name}</span>}
                              <div className="mt-1 h-1 max-w-[220px] rounded-full bg-zinc-100">
                                <div className="h-full rounded-full" style={{ width: `${(b.units / max) * 100}%`, background: SERIES.shopify }} />
                              </div>
                              {!b.mapped ? <span className="text-[11px] text-amber-700">Not linked to a product</span> : null}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium tabular">{formatNumber(b.units)}</td>
                            <td className="px-3 py-2.5 text-right tabular text-ink-2">{formatNumber(b.orders)}</td>
                            <td className="py-2.5 pr-5 pl-3 text-right tabular">{money(b.revenue)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader icon={<Factory />} title="Production" description="Print runs started in this period" />
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[
                ["Print runs", formatNumber(r.production.print_runs)],
                ["Failure rate", `${r.production.failure_rate}%`],
                ["Avg successful print", formatMinutes(Number(r.production.avg_print_minutes))],
                ["Printer hours", `${r.production.total_print_hours} h`],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-subtle py-3 ring-1 ring-line">
                  <p className="text-lg font-semibold text-ink tabular">{v}</p>
                  <p className="text-[11px] text-muted">{l}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">{r.production.succeeded} succeeded · {r.production.failed} failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader icon={<Truck />} title="Fulfilment" description="Orders dispatched in this period" />
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[
                ["Dispatched", formatNumber(r.fulfilment.dispatched_orders)],
                ["On-time rate", r.fulfilment.on_time_rate == null ? "—" : `${r.fulfilment.on_time_rate}%`],
                ["Avg order → dispatch", r.fulfilment.avg_turnaround_hours ? `${(Number(r.fulfilment.avg_turnaround_hours) / 24).toFixed(1)} days` : "—"],
                ["Prev. period orders", formatNumber(p.orders)],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-subtle py-3 ring-1 ring-line">
                  <p className="text-lg font-semibold text-ink tabular">{v}</p>
                  <p className="text-[11px] text-muted">{l}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Filament costs" description="Recorded consumption in this period" />
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-semibold text-ink tabular">{money(r.filament.recorded_cost)}</p>
                <p className="text-xs text-muted">{formatGrams(r.filament.recorded_grams)} recorded · {formatGrams(r.filament.failed_print_grams)} lost to failed prints</p>
              </div>
            </div>
            {r.filament.by_material.length ? (
              <ul className="divide-y divide-line border-t border-line text-xs">
                {r.filament.by_material.map((m) => (
                  <li key={m.material} className="flex justify-between gap-2 py-1.5 text-ink-2">
                    <span className="font-medium text-ink">{m.material}</span>
                    <span className="ml-auto tabular text-muted">{formatGrams(m.grams)}</span>
                    <span className="w-16 text-right tabular">{money(m.cost)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No consumption recorded in this period. Record grams used when finishing prints for accurate costs.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
