"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "ytd", label: "Year to date" },
  { id: "12m", label: "12 months" },
];

export function DateRangePicker({ preset, from, to }: { preset: string; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [custom, setCustom] = React.useState(preset === "custom");
  const [f, setF] = React.useState(from);
  const [t, setT] = React.useState(to);

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="no-scrollbar inline-flex overflow-x-auto rounded-xl border border-line bg-surface p-1 shadow-card">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setCustom(false);
              router.replace(`${pathname}?range=${p.id}`, { scroll: false });
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition",
              preset === p.id && !custom ? "bg-ink text-white shadow-sm" : "text-muted hover:bg-zinc-100 hover:text-ink",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setCustom(true)}
          className={cn("rounded-lg px-3 py-1.5 text-[13px] font-medium transition", custom ? "bg-ink text-white" : "text-muted hover:bg-zinc-100 hover:text-ink")}
        >
          Custom
        </button>
      </div>
      {custom ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (f && t && f <= t) router.replace(`${pathname}?from=${f}&to=${t}`, { scroll: false });
          }}
        >
          <Input type="date" value={f} max={t} onChange={(e) => setF(e.target.value)} aria-label="From" className="w-[150px]" />
          <span className="text-muted">–</span>
          <Input type="date" value={t} min={f} onChange={(e) => setT(e.target.value)} aria-label="To" className="w-[150px]" />
          <Button type="submit" size="md" disabled={!f || !t || f > t}>Apply</Button>
        </form>
      ) : null}
    </div>
  );
}
