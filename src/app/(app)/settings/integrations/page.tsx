import type { Metadata } from "next";
import { headers } from "next/headers";
import { CalendarClock, CircleCheck, CircleAlert, History, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/misc";
import { SettingsNav } from "@/components/settings/settings-nav";
import { IntegrationCard } from "@/components/settings/integration-card";
import { SyncLogTable } from "@/components/settings/sync-log-table";
import { SyncFailuresPanel } from "@/components/settings/sync-failures-panel";
import { FAILURE_CURSOR_HOLD_ATTEMPTS } from "@/lib/integrations/sync";
import { EtsySetupGuide, ShopifySetupGuide } from "@/components/settings/setup-guides";
import { getIntegrationsOverview } from "@/lib/data/integrations";
import { hasRole, requireUser } from "@/lib/auth";
import { resolveSiteUrl } from "@/lib/server-env";

export const metadata: Metadata = { title: "Integrations · Settings" };

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const overview = await getIntegrationsOverview();
  const h = await headers();
  const origin = resolveSiteUrl(h.get("host") ? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}` : undefined);
  const canManage = hasRole(user, "admin");

  return (
    <>
      <PageHeader title="Settings" description="Business configuration, marketplace connections and team access." />
      <SettingsNav active="integrations" isAdmin={hasRole(user, "admin")} />

      {sp.connected ? (
        <Notice tone="success" icon={<CircleCheck />} className="mb-5" title={`${sp.connected === "etsy" ? "Etsy" : "Shopify"} connected`}>
          The first import starts with the next scheduled sync, or click <strong>Sync now</strong>.
        </Notice>
      ) : null}
      {sp.error ? (
        <Notice tone="danger" icon={<CircleAlert />} className="mb-5" title="Connection problem">
          {sp.error}
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {overview.integrations.map((i) => (
          <IntegrationCard key={i.id} integration={i} canManage={canManage} />
        ))}
      </div>

      {overview.failures.length ? (
        <div className="mt-5">
          <SyncFailuresPanel failures={overview.failures} holdAttempts={FAILURE_CURSOR_HOLD_ATTEMPTS} canManage={canManage} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          <CardHeader icon={<History />} title="Sync history" description="Every scheduled and manual synchronisation, with errors." />
          {overview.logs.length === 0 ? (
            <EmptyState compact title="No syncs yet" description="Sync runs appear here once a marketplace is connected." />
          ) : (
            <div className="border-t border-line">
              <SyncLogTable logs={overview.logs} />
            </div>
          )}
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader icon={<CalendarClock />} title="Scheduler" />
            <CardContent className="space-y-2 text-sm text-ink-2">
              {overview.cronConfigured ? (
                <p className="flex items-center gap-2 font-medium text-brand-700"><CircleCheck className="size-4" /> CRON_SECRET configured</p>
              ) : (
                <p className="flex items-center gap-2 font-medium text-amber-700"><CircleAlert className="size-4" /> CRON_SECRET not set — scheduled sync is disabled</p>
              )}
              <p>
                Each marketplace has its own endpoint — <code className="rounded bg-subtle px-1 text-xs">/api/cron/sync/etsy</code> and{" "}
                <code className="rounded bg-subtle px-1 text-xs">/api/cron/sync/shopify</code> — so one failing never blocks the other. Call them every
                5–10 minutes from Supabase pg_cron, GitHub Actions or Vercel Pro cron (see <code className="rounded bg-subtle px-1 text-xs">docs/scheduling.md</code>);
                each only syncs when its own interval is due.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader icon={<ShieldCheck />} title="How data is protected" />
            <CardContent className="space-y-2 text-sm text-ink-2">
              <p>API secrets live only in server environment variables. OAuth tokens are encrypted (AES-256-GCM) in a table that browsers cannot read.</p>
              <p>Orders are matched on marketplace + order ID, so re-syncing never creates duplicates, and internal production notes, priorities and stages are never overwritten.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card id="setup-etsy" className="min-w-0 scroll-mt-24">
          <CardHeader title="Etsy setup" description="Obtain Etsy Open API v3 credentials." />
          <CardContent>
            <EtsySetupGuide redirectUri={overview.redirect.etsy ?? `${origin}/api/integrations/etsy/callback`} />
          </CardContent>
        </Card>
        <Card id="setup-shopify" className="min-w-0 scroll-mt-24">
          <CardHeader title="Shopify setup" description="Connect the Shopify Admin GraphQL API." />
          <CardContent>
            <ShopifySetupGuide redirectUri={`${origin}/api/integrations/shopify/callback`} store={overview.shopifyStore} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
