import "server-only";
import { createClient } from "@/lib/supabase/server";
import { checkConfig } from "@/lib/integrations/config";
import { serverEnv } from "@/lib/server-env";

export async function getIntegrationsOverview() {
  const supabase = await createClient();
  const [integrations, logs] = await Promise.all([
    supabase.from("integrations").select("*").order("provider"),
    supabase
      .from("sync_logs")
      .select("*, triggered_by_profile:profiles(full_name, email)")
      .order("started_at", { ascending: false })
      .limit(40),
  ]);
  return {
    integrations: (integrations.data ?? []).map((i) => ({
      ...i,
      config: checkConfig(i.provider),
      sync_due: Boolean(i.next_sync_at && new Date(i.next_sync_at).getTime() <= Date.now()),
    })),
    logs: logs.data ?? [],
    cronConfigured: Boolean(serverEnv.cronSecret),
    redirect: {
      etsy: serverEnv.etsy.redirectUri || null,
    },
    shopifyStore: serverEnv.shopify.storeDomain || null,
  };
}

export type IntegrationOverview = Awaited<ReturnType<typeof getIntegrationsOverview>>;
