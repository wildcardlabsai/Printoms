import "server-only";
import { createClient } from "@/lib/supabase/server";
import { checkConfig } from "@/lib/integrations/config";
import { allowedImportOptions, hasAllOrdersScope, maxImportDays } from "@/lib/integrations/import-window";
import { serverEnv } from "@/lib/server-env";

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
      .select("id, provider, external_order_id, attempts, last_error, first_failed_at, last_failed_at")
      .is("resolved_at", null)
      .order("last_failed_at", { ascending: false })
      .limit(100),
  ]);
  return {
    integrations: (integrations.data ?? []).map((i) => ({
      ...i,
      config: checkConfig(i.provider),
      sync_due: Boolean(i.next_sync_at && new Date(i.next_sync_at).getTime() <= Date.now()),
      max_import_days: maxImportDays(i.provider, i.scopes),
      import_options: allowedImportOptions(i.provider, i.scopes),
      has_all_orders_scope: hasAllOrdersScope(i.scopes),
      pending_resync: ((i.settings as { pending_resync?: { from?: string } } | null)?.pending_resync?.from ?? null) as string | null,
      open_failures: (failures.data ?? []).filter((f) => f.provider === i.provider).length,
    })),
    failures: failures.data ?? [],
    logs: logs.data ?? [],
    cronConfigured: Boolean(serverEnv.cronSecret),
    redirect: {
      etsy: serverEnv.etsy.redirectUri || null,
    },
    shopifyStore: serverEnv.shopify.storeDomain || null,
  };
}

export type IntegrationOverview = Awaited<ReturnType<typeof getIntegrationsOverview>>;
