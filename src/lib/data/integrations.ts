import "server-only";
import { createClient } from "@/lib/supabase/server";
import { checkConfig } from "@/lib/integrations/config";
import { allowedImportOptions, hasAllOrdersScope, maxImportDays } from "@/lib/integrations/import-window";
import { serverEnv } from "@/lib/server-env";
import { FAILURE_CURSOR_HOLD_ATTEMPTS } from "@/lib/integrations/sync";

export async function getIntegrationsOverview() {
  const supabase = await createClient();
  const [integrations, logs, failures] = await Promise.all([
    supabase.from("integrations").select("*").order("provider"),
    supabase
      .from("sync_logs")
      .select("*, triggered_by_profile:profiles(full_name, email)")
      .order("started_at", { ascending: false })
      .limit(40),
    supabase
      .from("sync_failures")
      .select(
        "id, provider, external_order_id, attempts, last_error, first_failed_at, last_failed_at, resolved_at, dismissed_at, dismiss_reason, reopened_at, " +
          "dismissed_by_profile:profiles!sync_failures_dismissed_by_fkey(full_name, email), " +
          "events:sync_failure_events(id, event, error, note, actor_label, created_at, actor:profiles(full_name, email))",
      )
      // Everything still unresolved, plus what resolved in the last 30 days.
      .or(`resolved_at.is.null,resolved_at.gte.${new Date(Date.now() - 30 * 86_400_000).toISOString()}`)
      .order("last_failed_at", { ascending: false })
      .order("created_at", { referencedTable: "sync_failure_events", ascending: false })
      .limit(200),
  ]);
  const integrationRows = integrations.data ?? [];
  const failureRows = ((failures.data ?? []) as unknown as FailureRow[]).map((f) => {
    const integration = integrationRows.find((i) => i.provider === f.provider);
    const state: FailureState = f.resolved_at ? "resolved" : f.dismissed_at ? "dismissed" : "open";
    return { ...f, state, next_retry: state === "open" ? nextRetry(f.attempts, integration) : null };
  });
  return {
    integrations: integrationRows.map((i) => ({
      ...i,
      config: checkConfig(i.provider),
      sync_due: Boolean(i.next_sync_at && new Date(i.next_sync_at).getTime() <= Date.now()),
      max_import_days: maxImportDays(i.provider, i.scopes),
      import_options: allowedImportOptions(i.provider, i.scopes),
      has_all_orders_scope: hasAllOrdersScope(i.scopes),
      pending_resync: ((i.settings as { pending_resync?: { from?: string } } | null)?.pending_resync?.from ?? null) as string | null,
      open_failures: failureRows.filter((f) => f.provider === i.provider && f.state === "open").length,
    })),
    failures: failureRows,
    logs: logs.data ?? [],
    cronConfigured: Boolean(serverEnv.cronSecret),
    redirect: {
      etsy: serverEnv.etsy.redirectUri || null,
    },
    shopifyStore: serverEnv.shopify.storeDomain || null,
  };
}

export type IntegrationOverview = Awaited<ReturnType<typeof getIntegrationsOverview>>;

export type FailureState = "open" | "dismissed" | "resolved";

type FailureRow = {
  id: string;
  provider: "etsy" | "shopify" | "vinted";
  external_order_id: string;
  attempts: number;
  last_error: string;
  first_failed_at: string;
  last_failed_at: string;
  resolved_at: string | null;
  dismissed_at: string | null;
  dismiss_reason: string | null;
  reopened_at: string | null;
  dismissed_by_profile: { full_name: string | null; email: string } | null;
  events: {
    id: string;
    event: "failed" | "failed_while_dismissed" | "retried" | "resolved" | "dismissed" | "reopened";
    error: string | null;
    note: string | null;
    actor_label: string | null;
    created_at: string;
    actor: { full_name: string | null; email: string } | null;
  }[];
};

/** When (and how) an open failure will next be retried automatically. */
function nextRetry(
  attempts: number,
  integration: { status: string; sync_enabled: boolean; next_sync_at: string | null } | undefined,
): { at: string | null; due: boolean; note: string } {
  const how =
    attempts <= FAILURE_CURSOR_HOLD_ATTEMPTS
      ? "fetched again from the marketplace"
      : "retried from the stored order data";
  if (!integration || (integration.status !== "connected" && integration.status !== "error")) {
    return { at: null, due: false, note: "Not retried automatically — the marketplace is not connected." };
  }
  if (!integration.sync_enabled) {
    return { at: null, due: false, note: "Automatic sync is off — use Retry now." };
  }
  const due = !integration.next_sync_at || new Date(integration.next_sync_at).getTime() <= Date.now();
  return { at: integration.next_sync_at, due, note: `With the next sync, ${how}.` };
}
