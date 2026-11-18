"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ORDER_SOURCE, ORDER_STATUS, ORDER_STATUSES, PAYMENT_STATUS, PAYMENT_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
  ["newest", "Newest first"],
  ["oldest", "Oldest first"],
  ["deadline", "Dispatch deadline"],
  ["value_desc", "Highest value"],
  ["customer", "Customer A–Z"],
] as const;

export function OrderFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [showMore, setShowMore] = React.useState(false);
  const [, startTransition] = React.useTransition();

  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      next.delete("page");
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  // Debounced search
  React.useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => update({ q: q.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [q, params, update]);

  const activeFilters = ["source", "status", "payment"].filter((k) => params.get(k)).length;

  const selects = (
    <>
      <Select value={params.get("source") ?? ""} onChange={(e) => update({ source: e.target.value || null })} aria-label="Source" className="sm:w-[140px]">
        <option value="">All sources</option>
        {Object.entries(ORDER_SOURCE).map(([k, m]) => (
          <option key={k} value={k}>{m.label}</option>
        ))}
      </Select>
      <Select value={params.get("status") ?? ""} onChange={(e) => update({ status: e.target.value || null })} aria-label="Status" className="sm:w-[160px]">
        <option value="">Any status</option>
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>{ORDER_STATUS[s].label}</option>
        ))}
      </Select>
      <Select value={params.get("payment") ?? ""} onChange={(e) => update({ payment: e.target.value || null })} aria-label="Payment" className="sm:w-[150px]">
        <option value="">Any payment</option>
        {PAYMENT_STATUSES.map((s) => (
          <option key={s} value={s}>{PAYMENT_STATUS[s].label}</option>
        ))}
      </Select>
      <Select value={params.get("sort") ?? "newest"} onChange={(e) => update({ sort: e.target.value === "newest" ? null : e.target.value })} aria-label="Sort" className="sm:w-[170px]">
        {SORT_OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>
    </>
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1 lg:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Order no., customer, email, tracking…"
            className="pl-9"
            aria-label="Search orders"
          />
          {q ? (
            <button onClick={() => setQ("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink" aria-label="Clear search">
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <Button variant="outline" className="sm:hidden" onClick={() => setShowMore((s) => !s)} aria-expanded={showMore}>
          <SlidersHorizontal />
          {activeFilters ? <span className="rounded-full bg-brand-600 px-1.5 text-[11px] text-white">{activeFilters}</span> : null}
        </Button>
        <div className="hidden gap-2 sm:flex">{selects}</div>
      </div>
      <div className={cn("grid grid-cols-2 gap-2 sm:hidden", !showMore && "hidden")}>{selects}</div>
    </div>
  );
}
