import { createAdminClient } from "../../src/lib/supabase/admin";
import { getIntegration, saveCredentials } from "../../src/lib/integrations/credentials";
import { db } from "./db";

/** Mark Etsy as connected to a fake shop with valid (fake) stored tokens. */
export async function connectFakeEtsy(overrides: Record<string, unknown> = {}) {
  const admin = createAdminClient();
  const etsy = await getIntegration(admin, "etsy");
  await saveCredentials(admin, etsy.id, { accessToken: "1.newtoken", refreshToken: "1.refresh", expiresInSeconds: 3600 });
  await db
    .from("integrations")
    .update({ status: "connected", external_shop_id: "42", sync_cursor: null, sync_locked_until: null, initial_import_days: 30, settings: {}, consecutive_failures: 0, last_error: null, ...overrides })
    .eq("id", etsy.id);
  return { admin, integrationId: etsy.id };
}

/** Mark Shopify as connected via an admin access token (fake). */
export async function connectFakeShopify(overrides: Record<string, unknown> = {}) {
  const admin = createAdminClient();
  const shop = await getIntegration(admin, "shopify");
  await saveCredentials(admin, shop.id, { accessToken: "shpat_test" });
  await db
    .from("integrations")
    .update({
      status: "connected",
      shop_domain: "printflow-test.myshopify.com",
      scopes: ["read_orders", "read_customers"],
      sync_cursor: null,
      sync_locked_until: null,
      initial_import_days: 30,
      settings: {},
      customer_data_access: "unknown",
      consecutive_failures: 0,
      last_error: null,
      ...overrides,
    })
    .eq("id", shop.id);
  return { admin, integrationId: shop.id };
}

export async function integrationRow(provider: "etsy" | "shopify") {
  const { data } = await db.from("integrations").select("*").eq("provider", provider).single();
  return data!;
}
