"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TEXT, GRID, SEQUENTIAL } from "./palette";
import type { TooltipLike } from "./sales-chart";

/** Single-series daily order volume. One series → no legend; the title names it. */
export function VolumeChart({ data, height = 220 }: { data: { label: string; orders: number }[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Orders per day">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SEQUENTIAL} stopOpacity={0.18} />
              <stop offset="100%" stopColor={SEQUENTIAL} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} minTickGap={28} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} width={32} />
          <Tooltip
            cursor={{ stroke: "#9aa0aa", strokeDasharray: "3 3" }}
            content={(p: TooltipLike) =>
              p.active && p.payload?.length ? (
                <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-overlay">
                  <p className="font-semibold text-ink">{String(p.label ?? "")}</p>
                  <p className="mt-0.5 text-muted">
                    <span className="font-medium text-ink tabular">{String(p.payload[0]?.value ?? 0)}</span> orders
                  </p>
                </div>
              ) : null
            }
          />
          <Area type="linear" dataKey="orders" stroke={SEQUENTIAL} strokeWidth={2} fill="url(#volFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
