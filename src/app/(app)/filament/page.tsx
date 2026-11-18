import type { Metadata } from "next";
import Link from "next/link";
import { Disc3, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Notice, Progress, TabNav } from "@/components/ui/misc";
import { Badge, SampleBadge } from "@/components/ui/badge";
import { AddSpoolButton, SpoolActions } from "@/components/filament/spool-dialogs";
import { getFilamentSummary, getRecentUsage, listSpools } from "@/lib/data/filament";
import { getBusinessSettings } from "@/lib/data/settings";
import { hasRole, requireUser } from "@/lib/auth";
import { cn, formatCurrency, formatDate, formatGrams, formatRelative } from "@/lib/utils";

export const metadata: Metadata = { title: "Filament Inventory" };

const KIND_LABEL: Record<string, { label: string; tone: "neutral" | "red" | "amber" | "blue" }> = {
  print: { label: "Print", tone: "blue" },
  failed_print: { label: "Failed print", tone: "red" },
  waste: { label: "Waste", tone: "amber" },
  adjustment: { label: "Adjustment", tone: "neutral" },
};

function Swatch({ hex }: { hex: string | null }) {
  return (
    <span
      className="inline-block size-6 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]"
      style={{ background: hex ?? "repeating-linear-gradient(45deg,#e4e4e7 0 4px,#f4f4f5 4px 8px)" }}
      aria-hidden
    />
  );
}

export default async function FilamentPage({ searchParams }: { searchParams: Promise<{ view?: string; material?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "low" || sp.view === "archived" ? sp.view : "active";
  const [spools, summary, usage, settings] = await Promise.all([
    listSpools({ view, material: sp.material }),
    getFilamentSummary(),
    getRecentUsage(),
    getBusinessSettings(),
  ]);
  const currency = settings?.currency ?? "GBP";
  const canWrite = hasRole(user, "staff");
  const href = (v: string, m?: string) => {
    const p = new URLSearchParams();
    if (v !== "active") p.set("view", v);
    if (m) p.set("material", m);
    return `/filament${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Filament Inventory"
        description="Spool stock, cost per kg and consumption. Stock only changes when usage is recorded or confirmed."
        actions={canWrite ? <AddSpoolButton currency={currency} /> : null}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Spools in stock" value={summary.spools} icon={<Disc3 />} />
        <StatCard label="Filament remaining" value={formatGrams(summary.remainingG)} hint={summary.materials.map((m) => `${m} ${formatGrams(summary.byMaterial[m])}`).join(" · ") || undefined} />
        <StatCard label="Low stock" value={<span className={cn(summary.low && "text-amber-600")}>{summary.low}</span>} icon={<TriangleAlert />} tone={summary.low ? "amber" : "neutral"} href={summary.low ? "/filament?view=low" : undefined} />
        <StatCard label="Stock value" value={formatCurrency(summary.value, currency)} hint="Remaining weight × purchase price" />
      </div>
      {summary.low > 0 && view !== "low" ? (
        <Notice tone="warning" icon={<TriangleAlert />} className="mb-5" title={`${summary.low} spool${summary.low === 1 ? " is" : "s are"} running low`} action={<Link href="/filament?view=low" className="text-sm font-medium underline">Show</Link>} />
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <TabNav
          active={view}
          tabs={[
            { id: "active", label: "In stock", href: href("active", sp.material) },
            { id: "low", label: "Low stock", href: href("low", sp.material), count: summary.low || undefined },
            { id: "archived", label: "Archived", href: href("archived", sp.material) },
          ]}
        />
        {summary.materials.length > 1 ? (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            <Link href={href(view)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", !sp.material ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2")}>All</Link>
            {summary.materials.map((m) => (
              <Link key={m} href={href(view, m)} className={cn("rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap", sp.material === m ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2")}>
                {m}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          {spools.length === 0 ? (
            <EmptyState
              icon={<Disc3 />}
              title={view === "low" ? "No low-stock spools" : view === "archived" ? "No archived spools" : "No filament recorded"}
              description="Add spools with their weight and price to track stock and estimate material costs."
              action={canWrite && view === "active" ? <AddSpoolButton currency={currency} /> : null}
            />
          ) : (
            <ul className="divide-y divide-line">
              {spools.map((s) => {
                const pct = Number(s.remaining_percent ?? 0);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                    <Swatch hex={s.colour_hex} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="font-medium text-ink">{s.brand} {s.material}</p>
                        <span className="text-sm text-ink-2">{s.colour}</span>
                        {s.is_low_stock ? <Badge tone="amber" size="sm">Low</Badge> : null}
                        {s.is_sample ? <SampleBadge /> : null}
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <Progress value={pct} tone={s.is_low_stock ? "amber" : "brand"} className="max-w-[220px]" />
                        <span className="text-xs text-muted tabular whitespace-nowrap">
                          {formatGrams(s.remaining_g)} / {formatGrams(s.spool_weight_g)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted">
                        {[
                          s.cost_per_kg != null ? `${formatCurrency(s.cost_per_kg, currency)}/kg` : "No price",
                          s.supplier,
                          s.purchase_date ? `bought ${formatDate(s.purchase_date)}` : null,
                          `warn at ${formatGrams(s.low_stock_threshold_g)}`,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {canWrite ? <SpoolActions spool={s} currency={currency} /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Recent consumption" description="Recorded usage, waste and corrections" />
          <CardContent className="px-0 pb-0">
            {usage.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">Nothing recorded yet. Record usage when finishing a print, or from a spool’s menu.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {usage.map((u) => {
                  const k = KIND_LABEL[u.kind] ?? KIND_LABEL.adjustment!;
                  const restock = Number(u.grams) < 0;
                  return (
                    <li key={u.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                      <Swatch hex={u.stock?.colour_hex ?? null} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-ink-2">
                          {u.stock?.brand} {u.stock?.material} {u.stock?.colour}
                        </p>
                        <p className="truncate text-xs text-muted">
                          <Badge tone={k.tone} size="sm">{k.label}</Badge>{" "}
                          {u.job ? <Link className="hover:underline" href={`/production?job=${u.job.id}`}>{u.job.job_number}</Link> : u.note}
                          {" · "}{formatRelative(u.created_at)}
                        </p>
                      </div>
                      <span className={cn("font-medium tabular", restock ? "text-brand-700" : "text-ink")}>
                        {restock ? "+" : "−"}{formatGrams(Math.abs(Number(u.grams)))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
