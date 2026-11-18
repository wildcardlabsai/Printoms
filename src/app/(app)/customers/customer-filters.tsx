"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/form";

export function CustomerFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      next.delete("page");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    },
    [params, pathname, router],
  );
  React.useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => update({ q: q.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [q, params, update]);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="pl-9" aria-label="Search customers" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Select value={params.get("source") ?? ""} onChange={(e) => update({ source: e.target.value || null })} aria-label="Channel" className="sm:w-40">
          <option value="">All channels</option>
          <option value="etsy">Etsy</option>
          <option value="shopify">Shopify</option>
          <option value="manual">Manual</option>
        </Select>
        <Select value={params.get("sort") ?? "recent"} onChange={(e) => update({ sort: e.target.value === "recent" ? null : e.target.value })} aria-label="Sort" className="sm:w-48">
          <option value="recent">Most recent order</option>
          <option value="spend">Highest spend</option>
          <option value="orders">Most orders</option>
          <option value="name">Name A–Z</option>
        </Select>
      </div>
    </div>
  );
}
