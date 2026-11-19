import "server-only";
import type { AdminSupabase } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import type { IntegrationProvider } from "@/lib/constants";
import { loadCredentials, type IntegrationRow } from "./credentials";
import { EtsyAdapter } from "./etsy/adapter";
import { ShopifyAdapter } from "./shopify/adapter";
import { VintedAdapter } from "./vinted/adapter";
import { VINTED_HOSTS } from "./vinted/client";
import { IntegrationError, type MarketplaceAdapter } from "./types";

/** Build the adapter for a connected integration. Add new marketplaces here. */
export async function createAdapter(admin: AdminSupabase, integration: IntegrationRow): Promise<MarketplaceAdapter> {
  const provider = integration.provider as IntegrationProvider;
  if (provider === "etsy") {
    if (!integration.external_shop_id) throw new IntegrationError("Etsy shop ID is missing — reconnect Etsy.");
    return new EtsyAdapter(admin, integration.id, integration.external_shop_id);
  }
  if (provider === "vinted") {
    if (!serverEnv.vinted.accessToken) throw new IntegrationError("VINTED_ACCESS_TOKEN is not set.", null, false, 401);
    return new VintedAdapter(admin, serverEnv.vinted.accessToken, VINTED_HOSTS[serverEnv.vinted.environment]);
  }
  const shop = integration.shop_domain ?? serverEnv.shopify.storeDomain;
  const creds = await loadCredentials(admin, integration.id);
  const token = creds?.accessToken ?? serverEnv.shopify.adminAccessToken;
  if (!shop || !token) throw new IntegrationError("Shopify is not connected — no access token stored.");
  return new ShopifyAdapter(shop, token);
}
