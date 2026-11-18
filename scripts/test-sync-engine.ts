/**
 * Integration test for the marketplace sync engine against a MOCKED Etsy and
 * Shopify API (no network calls to real marketplaces). Run against a local
 * Supabase stack:  npm run test:sync
 *
 * Verifies: OAuth token storage/refresh, pagination, mapping (personalisation,
 * variants, money), idempotent re-sync, cursor advance, failure isolation.
 */
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

process.env.ETSY_API_KEYSTRING ||= "test-keystring";
process.env.ETSY_SHARED_SECRET ||= "test-secret";
process.env.ETSY_REDIRECT_URI ||= "http://localhost:3000/api/integrations/etsy/callback";
process.env.SHOPIFY_STORE_DOMAIN ||= "printflow-test.myshopify.com";
process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||= "shpat_test";

const now = Math.floor(Date.now() / 1000);
const receipts = Array.from({ length: 130 }, (_, i) => ({
  receipt_id: 900000 + i,
  buyer_user_id: 5000 + (i % 7),
  buyer_email: i % 3 === 0 ? `buyer${i % 7}@example.com` : null,
  name: `Test Buyer ${i % 7}`,
  first_line: `${i} Test Road`,
  second_line: null,
  city: "Testville",
  state: null,
  zip: "TE1 1ST",
  country_iso: "GB",
  status: i === 5 ? "Canceled" : "Paid",
  is_paid: true,
  is_shipped: i < 20,
  message_from_buyer: i === 42 ? "Please gift wrap" : null,
  created_timestamp: now - 86400 * 10 + i * 60,
  updated_timestamp: now - 86400 * 2 + i * 60,
  grandtotal: { amount: 2595, divisor: 100, currency_code: "GBP" },
  subtotal: { amount: 2200, divisor: 100, currency_code: "GBP" },
  total_shipping_cost: { amount: 395, divisor: 100, currency_code: "GBP" },
  total_tax_cost: { amount: 0, divisor: 100, currency_code: "GBP" },
  discount_amt: { amount: 0, divisor: 100, currency_code: "GBP" },
  transactions: [
    {
      transaction_id: 7000000 + i,
      title: "Personalised Name Sign",
      quantity: 1 + (i % 2),
      listing_id: 1234567,
      product_id: 89,
      sku: "SIGN-1",
      price: { amount: 1100, divisor: 100, currency_code: "GBP" },
      variations: [
        { formatted_name: "Colour", formatted_value: "Sage" },
        { formatted_name: "Personalization", formatted_value: `Name: Test ${i}` },
      ],
      expected_ship_date: now + 86400 * 3,
    },
  ],
}));

let etsyCalls = 0;
let tokenRefreshes = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://api.etsy.com/v3/public/oauth/token")) {
    tokenRefreshes++;
    return Response.json({ access_token: "1.newtoken", refresh_token: "1.newrefresh", expires_in: 3600, token_type: "Bearer" });
  }
  if (url.startsWith("https://openapi.etsy.com/v3/application/shops/42/receipts")) {
    etsyCalls++;
    const h = new Headers(init?.headers);
    assert.equal(h.get("x-api-key"), "test-keystring:test-secret");
    assert.equal(h.get("authorization"), "Bearer 1.newtoken");
    const u = new URL(url);
    const offset = Number(u.searchParams.get("offset"));
    const limit = Number(u.searchParams.get("limit"));
    if (etsyCalls === 1) return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
    return Response.json({ count: receipts.length, results: receipts.slice(offset, offset + limit) });
  }
  if (url === "https://printflow-test.myshopify.com/admin/api/2025-10/graphql.json") {
    return Response.json({
      data: {
        orders: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: "gid://shopify/Order/555",
              name: "#1555",
              createdAt: new Date(Date.now() - 3600_000).toISOString(),
              updatedAt: new Date(Date.now() - 1800_000).toISOString(),
              cancelledAt: null,
              email: "shopper@example.com",
              note: "Leave in porch",
              displayFinancialStatus: "PAID",
              displayFulfillmentStatus: "UNFULFILLED",
              currencyCode: "GBP",
              customer: { id: "gid://shopify/Customer/77", displayName: "Shop Per", email: "shopper@example.com" },
              shippingAddress: { name: "Shop Per", address1: "1 High St", address2: null, city: "Leeds", province: null, zip: "LS1 1AA", countryCodeV2: "GB", phone: null },
              subtotalPriceSet: { shopMoney: { amount: "30.00" } },
              totalPriceSet: { shopMoney: { amount: "34.95" } },
              totalShippingPriceSet: { shopMoney: { amount: "4.95" } },
              totalTaxSet: { shopMoney: { amount: "5.83" } },
              totalDiscountsSet: { shopMoney: { amount: "0.00" } },
              shippingLine: { title: "Tracked 48" },
              lineItems: {
                nodes: [
                  {
                    id: "gid://shopify/LineItem/1",
                    title: "Planter",
                    variantTitle: "Large / Black",
                    quantity: 2,
                    sku: "PLANTER-L",
                    originalUnitPriceSet: { shopMoney: { amount: "15.00" } },
                    discountedTotalSet: { shopMoney: { amount: "30.00" } },
                    customAttributes: [{ key: "Engraving", value: "Mum" }, { key: "_internal", value: "x" }],
                    product: { id: "gid://shopify/Product/1" },
                    variant: { id: "gid://shopify/ProductVariant/2" },
                  },
                ],
              },
            },
          ],
        },
      },
      extensions: { cost: { requestedQueryCost: 50, throttleStatus: { currentlyAvailable: 900, restoreRate: 50 } } },
    });
  }
  return realFetch(input, init);
}) as typeof fetch;

async function main() {
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const { saveCredentials, getIntegration } = await import("../src/lib/integrations/credentials");
  const { runSync } = await import("../src/lib/integrations/sync");
  const admin = createAdminClient();
  const raw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

  // Clean slate for test rows
  await raw.from("orders").delete().like("external_order_id", "900%");
  await raw.from("orders").delete().eq("external_order_id", "gid://shopify/Order/555");

  // Connect a fake Etsy shop with an expired token (forces a refresh)
  const etsy = await getIntegration(admin, "etsy");
  await saveCredentials(admin, etsy.id, { accessToken: "1.expired", refreshToken: "1.refresh", expiresInSeconds: 1 });
  await raw.from("integrations").update({ status: "connected", external_shop_id: "42", sync_cursor: null, sync_locked_until: null, initial_import_days: 30 }).eq("id", etsy.id);

  const r1 = await runSync("etsy", "manual", null, admin);
  console.log("Etsy first sync:", r1);
  assert.equal(r1.status, "success");
  assert.equal(r1.fetched, 130);
  assert.equal(r1.created, 130);
  assert.equal(tokenRefreshes, 1, "expired token refreshed once");
  assert.ok(etsyCalls >= 3, "paginated (and retried after 429)");

  const { data: o42 } = await raw.from("orders").select("status, customer_note, total, order_items(personalisation, variant_title, quantity)").eq("source", "etsy").eq("external_order_id", "900042").single();
  assert.equal(o42!.customer_note, "Please gift wrap");
  assert.equal(Number(o42!.total), 25.95);
  assert.equal(o42!.order_items[0]!.personalisation, "Name: Test 42");
  assert.equal(o42!.order_items[0]!.variant_title, "Sage");
  const { data: shipped } = await raw.from("orders").select("status").eq("external_order_id", "900003").single();
  assert.equal(shipped!.status, "completed", "already-shipped receipts import as completed");
  const { data: cancelled } = await raw.from("orders").select("status").eq("external_order_id", "900005").single();
  assert.equal(cancelled!.status, "cancelled");

  // Internal data survives a re-sync where the marketplace changed
  const { data: target } = await raw.from("orders").select("id").eq("external_order_id", "900100").single();
  await raw.from("orders").update({ production_notes: "INTERNAL", priority: "urgent" }).eq("id", target!.id);
  receipts[100]!.updated_timestamp = now;
  receipts[100]!.message_from_buyer = "Changed note";
  await raw.from("integrations").update({ sync_cursor: new Date((now - 86400 * 3) * 1000).toISOString() }).eq("id", etsy.id);
  const r2 = await runSync("etsy", "manual", null, admin);
  console.log("Etsy re-sync:", r2);
  assert.equal(r2.created, 0, "no duplicates on re-sync");
  assert.equal(r2.updated, 1, "only the changed receipt is updated");
  const { data: after } = await raw.from("orders").select("production_notes, priority, customer_note").eq("id", target!.id).single();
  assert.deepEqual(after, { production_notes: "INTERNAL", priority: "urgent", customer_note: "Changed note" });
  const { count } = await raw.from("orders").select("id", { count: "exact", head: true }).like("external_order_id", "900%");
  assert.equal(count, 130);

  // Shopify via admin access token
  const shop = await getIntegration(admin, "shopify");
  await saveCredentials(admin, shop.id, { accessToken: "shpat_test" });
  await raw.from("integrations").update({ status: "connected", shop_domain: "printflow-test.myshopify.com", sync_cursor: null, sync_locked_until: null }).eq("id", shop.id);
  const r3 = await runSync("shopify", "manual", null, admin);
  console.log("Shopify sync:", r3);
  assert.equal(r3.created, 1);
  const { data: so } = await raw.from("orders").select("external_order_number, tax_total, order_items(personalisation, variant_title, quantity, total_price)").eq("external_order_id", "gid://shopify/Order/555").single();
  assert.equal(so!.external_order_number, "#1555");
  assert.equal(Number(so!.tax_total), 5.83);
  assert.equal(so!.order_items[0]!.personalisation, "Mum");
  assert.equal(so!.order_items[0]!.variant_title, "Large / Black");

  const { data: logs } = await raw.from("sync_logs").select("provider, status, orders_created").order("started_at", { ascending: false }).limit(3);
  console.log("sync_logs:", logs);

  // Reset integrations to not connected so the dev UI reflects reality
  await raw.from("integration_credentials").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await raw.from("integrations").update({ status: "not_connected", sync_cursor: null, external_shop_id: null, shop_domain: null, connected_at: null, next_sync_at: null, last_successful_sync_at: null, last_error: null }).neq("id", "00000000-0000-0000-0000-000000000000");
  await raw.from("orders").delete().like("external_order_id", "900%");
  await raw.from("orders").delete().eq("external_order_id", "gid://shopify/Order/555");
  await raw.from("sync_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("\nALL SYNC ENGINE ASSERTIONS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
