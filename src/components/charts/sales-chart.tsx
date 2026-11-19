"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TEXT, GRID, SERIES, SURFACE } from "./palette";
import { formatCurrency } from "@/lib/utils";

type Row = { label: string; etsy: number; shopify: number; vinted?: number; manual: number };

const KEYS = [
  { key: "etsy", label: "Etsy" },
  { key: "shopify", label: "Shopify" },
  { key: "vinted", label: "Vinted" },
  { key: "manual", label: "Manual" },
] as const;

export type TooltipLike = {
  active?: boolean;
  label?: unknown;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown; color?: string; name?: unknown }>;
};

function ChartTooltip({ active, payload, label, currency }: TooltipLike & { currency: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0);
  return (
    <div className="min-w-[180px] rounded-lg border border-line bg-surface px-3 py-2.5 text-xs shadow-overlay">
      <p className="mb-1.5 font-semibold text-ink">{String(label ?? "")}</p>
      {[...payload].reverse().map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-sm" style={{ background: p.color }} />
            {KEYS.find((k) => k.key === p.dataKey)?.label}
          </span>
          <span className="font-medium tabular text-ink">{formatCurrency(Number(p.value), currency)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-line pt-1.5 font-semibold text-ink">
        <span>Total</span>
        <span className="tabular">{formatCurrency(total, currency)}</span>
      </div>
    </div>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          {i.label}
          {i.value ? <span className="font-medium text-ink tabular">{i.value}</span> : null}
        </span>
      ))}
    </div>
  );
}

/** Stacked daily sales by source. */
export function SalesChart({ data, currency, height = 260 }: { data: Row[]; currency: string; height?: number }) {
  const present = KEYS.filter((k) => data.some((d) => (d[k.key] ?? 0) > 0));
  const series = present.length ? present : KEYS.slice(0, 2);
  const topKey = series[series.length - 1]!.key;
  return (
    <div className="space-y-3">
      <ChartLegend items={series.map((k) => ({ label: k.label, color: SERIES[k.key] }))} />
      <div style={{ height }} role="img" aria-label="Daily sales by marketplace">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              width={52}
              tickFormatter={(v: number) => formatCurrency(v, currency, { compact: true })}
            />
            <Tooltip cursor={{ fill: "rgba(16,24,40,0.04)" }} content={(p) => <ChartTooltip {...p} currency={currency} />} />
            {series.map((k) => (
              <Bar
                key={k.key}
                dataKey={k.key}
                stackId="sales"
                fill={SERIES[k.key]}
                stroke={SURFACE}
                strokeWidth={1}
                radius={k.key === topKey ? [4, 4, 0, 0] : 0}
                maxBarSize={28}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
