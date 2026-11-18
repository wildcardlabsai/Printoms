import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  CalendarClock,
  CircleAlert,
  Clock,
  Hourglass,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  ShoppingBag,
  SquareKanban,
  Truck,
  Inbox,
  PoundSterling,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/misc";
import { SampleBadge } from "@/components/ui/badge";
import { OrderStatusBadge, PrinterStatusBadge, PriorityBadge, SourceBadge } from "@/components/ui/status-badges";
import { SalesChart } from "@/components/charts/sales-chart";
import { SourceBreakdown } from "@/components/charts/source-breakdown";
import { ActivityTimeline } from "@/components/orders/activity-timeline";
import { getDashboard } from "@/lib/data/dashboard";
import { getBusinessSettings } from "@/lib/data/settings";
import { hasRole, requireUser } from "@/lib/auth";
import { PRODUCTION_STAGES } from "@/lib/constants";
import { cn, formatCurrency, formatDate, formatNumber, formatRelative, formatShortDate, isOverdue } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [{ metrics: m, recent, deadlines, printers, activity, integrations }, settings] = await Promise.all([
    getDashboard(),
    getBusinessSettings(),
  ]);
  const currency = settings?.currency ?? "GBP";
  const canWrite = hasRole(user, "staff");
  const anyConnected = integrations.some((i) => i.status === "connected");
  const firstName = user.fullName?.split(" ")[0];

  const salesData = m.sales_30d.map((d) => ({
    label: formatShortDate(d.date),
    etsy: Number(d.etsy),
    shopify: Number(d.shopify),
    manual: Number(d.manual),
  }));
  const sales30 = salesData.reduce((s, d) => s + d.etsy + d.shopify + d.manual, 0);
  const activeJobs = PRODUCTION_STAGES.filter((s) => !["dispatched", "completed"].includes(s.id));
  const maxStage = Math.max(1, ...activeJobs.map((s) => m.jobs_by_stage[s.id] ?? 0));

  return (
    <>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        description={`${formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" })} · Here’s what needs attention across the business.`}
        actions={
          canWrite ? (
            <>
              <ButtonLink href="/settings/integrations" variant="outline"><RefreshCw /> Sync</ButtonLink>
              <ButtonLink href="/production" variant="outline"><SquareKanban /> Board</ButtonLink>
              <ButtonLink href="/orders/new"><Plus /> Manual order</ButtonLink>
            </>
          ) : null
        }
      />

      {sp.denied ? (
        <Notice tone="warning" icon={<CircleAlert />} className="mb-5" title="You don’t have access to that page">
          Ask an owner or admin if you need a higher role.
        </Notice>
      ) : null}
      {!anyConnected ? (
        <Notice
          tone="info"
          icon={<RefreshCw />}
          className="mb-5"
          title={sp.welcome ? "Welcome to PrintFlow — connect your shops" : "No marketplace connected yet"}
          action={<ButtonLink href="/settings/integrations" size="sm">Set up integrations</ButtonLink>}
        >
          Connect Etsy and Shopify to import orders automatically every 10 minutes. Until then you can add manual orders
          {hasRole(user, "admin") ? " or load clearly-labelled sample data from Settings → Data to explore." : "."}
        </Notice>
      ) : null}
      {m.sample_orders > 0 ? (
        <Notice tone="neutral" className="mb-5" title="Sample data is loaded" action={hasRole(user, "admin") ? <ButtonLink href="/settings/data" size="sm" variant="outline">Manage</ButtonLink> : null}>
          {m.sample_orders} sample orders marked <SampleBadge className="mx-0.5 align-middle" /> are included in these figures. Remove them before going live.
        </Notice>
      ) : null}

      {/* Operational KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        <StatCard label="New today" value={formatNumber(m.new_today)} icon={<Inbox />} tone="blue" href="/orders?view=new" hint={`${formatNumber(m.total_orders)} orders all time`} />
        <StatCard label="Awaiting production" value={formatNumber(m.awaiting_production)} icon={<Hourglass />} tone="violet" href="/orders?view=new" hint={`${formatNumber(m.in_production)} in production`} />
        <StatCard label="Currently printing" value={formatNumber(m.currently_printing)} icon={<Printer />} tone="amber" href="/printers" hint={`${printers.filter((p) => p.status === "available").length} printer(s) available`} />
        <StatCard
          label="Overdue"
          value={<span className={cn(m.overdue > 0 && "text-red-600")}>{formatNumber(m.overdue)}</span>}
          icon={<CalendarClock />}
          tone={m.overdue > 0 ? "red" : "neutral"}
          href="/orders?view=overdue"
          hint="Past dispatch deadline"
        />
        <StatCard label="Ready for packing" value={formatNumber(m.ready_to_pack)} icon={<PackageCheck />} tone="brand" href="/fulfilment" />
        <StatCard label="Awaiting dispatch" value={formatNumber(m.awaiting_dispatch)} icon={<Truck />} tone="brand" href="/fulfilment?tab=packed" hint="Packed, not yet shipped" />
        <StatCard label="Total sales" value={formatCurrency(m.total_sales, currency)} icon={<PoundSterling />} hint="All non-cancelled orders" href="/analytics" />
        <StatCard
          label="Etsy / Shopify sales"
          value={<span className="text-lg sm:text-xl">{formatCurrency(m.etsy_sales, currency)} <span className="text-faint">/</span> {formatCurrency(m.shopify_sales, currency)}</span>}
          icon={<ShoppingBag />}
          hint={m.manual_sales ? `+ ${formatCurrency(m.manual_sales, currency)} manual` : "By marketplace"}
          href="/analytics"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sales — last 30 days" description={`${formatCurrency(sales30, currency)} across all channels (order totals incl. shipping & tax)`} action={<ButtonLink href="/analytics" variant="ghost" size="sm">Analytics</ButtonLink>} />
          <CardContent>
            <SalesChart data={salesData} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Order sources" description="All-time sales by channel" />
          <CardContent>
            <SourceBreakdown
              currency={currency}
              rows={[
                { key: "etsy", label: "Etsy", revenue: Number(m.etsy_sales), orders: m.etsy_orders },
                { key: "shopify", label: "Shopify", revenue: Number(m.shopify_sales), orders: m.shopify_orders },
                { key: "manual", label: "Manual", revenue: Number(m.manual_sales), orders: m.manual_orders },
              ]}
            />
            <div className="mt-6 border-t border-line pt-4">
              <p className="mb-3 text-[13px] font-semibold text-ink">Production queue</p>
              <ul className="space-y-2">
                {activeJobs.map((s) => {
                  const n = m.jobs_by_stage[s.id] ?? 0;
                  return (
                    <li key={s.id} className="grid grid-cols-[130px_1fr_28px] items-center gap-2 text-xs">
                      <span className="truncate text-muted">{s.label}</span>
                      <span className="h-1.5 rounded-full bg-zinc-100">
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(n / maxStage) * 100}%` }} />
                      </span>
                      <span className="text-right font-medium tabular text-ink">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader title="Recent orders" action={<ButtonLink href="/orders?view=all" variant="ghost" size="sm">View all</ButtonLink>} />
          {recent.length === 0 ? (
            <EmptyState compact icon={<ShoppingBag />} title="No orders yet" description="Imported and manual orders will appear here." />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-subtle">
                    <SourceBadge source={o.source} compact />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">
                        {o.order_number} {o.is_sample ? <SampleBadge /> : null}
                      </p>
                      <p className="truncate text-xs text-muted">{o.customer_name} · {formatRelative(o.order_date)}</p>
                    </div>
                    <span className="hidden sm:block"><OrderStatusBadge status={o.status} /></span>
                    <span className="w-20 text-right text-sm font-medium tabular text-ink">{formatCurrency(o.total, o.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Upcoming dispatch deadlines" icon={<Clock />} />
          {deadlines.length === 0 ? (
            <EmptyState compact title="No open deadlines" description="Orders with a dispatch-by date appear here." />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {deadlines.map((o) => {
                const overdue = isOverdue(o.dispatch_by, o.status);
                return (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-subtle">
                      <div className={cn("flex w-11 shrink-0 flex-col items-center rounded-lg py-1 ring-1", overdue ? "bg-red-50 text-red-700 ring-red-200" : "bg-subtle text-ink ring-line")}>
                        <span className="text-[10px] font-semibold uppercase">{formatDate(o.dispatch_by, { month: "short" })}</span>
                        <span className="text-base font-semibold leading-none tabular">{formatDate(o.dispatch_by, { day: "numeric" })}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                          {o.order_number} <PriorityBadge priority={o.priority} hideNormal />
                        </p>
                        <p className={cn("truncate text-xs", overdue ? "font-medium text-red-600" : "text-muted")}>
                          {overdue ? "Overdue · " : ""}{formatRelative(o.dispatch_by)} · {o.customer_name}
                        </p>
                      </div>
                      <OrderStatusBadge status={o.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Printer availability" icon={<Printer />} description="Statuses are set manually — no live printer monitoring is connected." action={<ButtonLink href="/printers" variant="ghost" size="sm">Print farm</ButtonLink>} />
          <CardContent>
            {printers.length === 0 ? (
              <EmptyState compact title="No printers registered" action={<ButtonLink href="/printers" size="sm">Add a printer</ButtonLink>} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {printers.map((p) => (
                  <Link key={p.id} href={`/printers/${p.id}`} className="rounded-xl border border-line p-3.5 transition hover:border-line-strong hover:shadow-raised">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{p.name}</p>
                      <PrinterStatusBadge status={p.status} />
                    </div>
                    <p className="mt-2 truncate text-xs text-muted">
                      {p.current_job ? `${p.current_job.job_number} · ${p.current_job.item?.title ?? ""}` : "No active job"}
                    </p>
                    {p.estimated_completion_at ? (
                      <p className={cn("mt-1 text-xs", isOverdue(p.estimated_completion_at) ? "font-medium text-amber-700" : "text-muted")}>
                        Est. finish {formatRelative(p.estimated_completion_at)}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Production activity" icon={<Activity />} />
          <CardContent>
            <ActivityTimeline entries={activity} empty="Printing and packing events will appear here." />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
