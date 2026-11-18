/**
 * Core sync engine behaviour against fake Etsy/Shopify APIs (ported from the
 * original scripts/test-sync-engine.ts): pagination, 429 retry, token refresh,
 * mapping, idempotent re-sync and preservation of internal data.
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { db, cleanupTestOrders, snapshotIntegrations } from "../helpers/db";
import { connectFakeEtsy, connectFakeShopify } from "../helpers/connect";
import { FakeMarketplaces, etsyReceipt } from "../helpers/fake-marketplaces";
import { runSync } from "../../src/lib/integrations/sync";
import { saveCredentials } from "../../src/lib/integrations/credentials";

const PREFIX = "9901";
const SHOP_PREFIX = "gid://shopify/Order/9901";
const fake = new FakeMarketplaces();
let snapshot: Awaited<ReturnType<typeof snapshotIntegrations>>;
const now = Math.floor(Date.now() / 1000);

describe("sync engine", () => {
  before(async () => {
    snapshot = await snapshotIntegrations();
    fake.install();
    await cleanupTestOrders(PREFIX);
    await cleanupTestOrders(SHOP_PREFIX);
  });
  after(async () => {
    fake.uninstall();
    await cleanupTestOrders(PREFIX);
    await cleanupTestOrders(SHOP_PREFIX);
    await snapshot.restore();
  });

  it("imports 130 Etsy receipts across pages, refreshing an expired token and retrying a 429", async () => {
    const { admin, integrationId } = await connectFakeEtsy();
    await saveCredentials(admin, integrationId, { accessToken: "1.expired", refreshToken: "1.refresh", expiresInSeconds: 1 });
    fake.etsyReceipts = Array.from({ length: 130 }, (_, i) =>
      etsyReceipt(`${PREFIX}${String(i).padStart(4, "0")}`, now - 86400 * 2 + i * 60, {
        is_shipped: i < 20,
        status: i === 5 ? "Canceled" : "Paid",
        message_from_buyer: i === 42 ? "Please gift wrap" : null,
      }),
    );
    fake.etsyRateLimitOnce = true;
    const r = await runSync("etsy", "manual", null, admin);
    assert.equal(r.status, "success", r.message);
    assert.equal(r.fetched, 130);
    assert.equal(r.created, 130);
    assert.equal(fake.etsyTokenRefreshes, 1);
    assert.ok(fake.etsyCalls >= 3, "paginated and retried");

    const { data: o42 } = await db.from("orders").select("customer_note, total, order_items(personalisation, variant_title)").eq("external_order_id", `${PREFIX}0042`).single();
    assert.equal(o42!.customer_note, "Please gift wrap");
    assert.equal(Number(o42!.total), 25.95);
    assert.equal(o42!.order_items[0]!.personalisation, `Name: ${PREFIX}0042`);
    assert.equal(o42!.order_items[0]!.variant_title, "Sage");
    const { data: shipped } = await db.from("orders").select("status").eq("external_order_id", `${PREFIX}0003`).single();
    assert.equal(shipped!.status, "completed");
    const { data: cancelled } = await db.from("orders").select("status").eq("external_order_id", `${PREFIX}0005`).single();
    assert.equal(cancelled!.status, "cancelled");
  });

  it("re-syncs without duplicates and preserves internal data", async () => {
    const { data: target } = await db.from("orders").select("id").eq("external_order_id", `${PREFIX}0100`).single();
    await db.from("orders").update({ production_notes: "INTERNAL", priority: "urgent" }).eq("id", target!.id);
    fake.etsyReceipts[100]!.updated_timestamp = now;
    fake.etsyReceipts[100]!.message_from_buyer = "Changed note";
    const r = await runSync("etsy", "manual", null);
    assert.equal(r.created, 0);
    assert.equal(r.updated, 1);
    const { data: o } = await db.from("orders").select("production_notes, priority, customer_note").eq("id", target!.id).single();
    assert.deepEqual(o, { production_notes: "INTERNAL", priority: "urgent", customer_note: "Changed note" });
    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).like("external_order_id", `${PREFIX}%`);
    assert.equal(count, 130);
  });

  it("imports Shopify orders via GraphQL with tax and line-item personalisation", async () => {
    const { admin } = await connectFakeShopify();
    fake.shopify = () => ({
      data: {
        orders: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: `${SHOP_PREFIX}555`, name: "#1555", createdAt: new Date(Date.now() - 3600_000).toISOString(), updatedAt: new Date(Date.now() - 1800_000).toISOString(),
              cancelledAt: null, email: "shopper@example.com", note: "Leave in porch", displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED",
              currencyCode: "GBP", customer: { id: "gid://shopify/Customer/990177", displayName: "Shop Buyer One", email: "shopper@example.com" },
              shippingAddress: { name: "Shop Buyer One", address1: "1 High St", address2: null, city: "Leeds", province: null, zip: "LS1 1AA", countryCodeV2: "GB", phone: null },
              subtotalPriceSet: { shopMoney: { amount: "30.00" } }, totalPriceSet: { shopMoney: { amount: "34.95" } }, totalShippingPriceSet: { shopMoney: { amount: "4.95" } },
              totalTaxSet: { shopMoney: { amount: "5.83" } }, totalDiscountsSet: { shopMoney: { amount: "0.00" } }, shippingLine: { title: "Tracked 48" },
              lineItems: { nodes: [{ id: "gid://shopify/LineItem/9901", title: "Planter", variantTitle: "Large / Black", quantity: 2, sku: "PLANTER-L",
                originalUnitPriceSet: { shopMoney: { amount: "15.00" } }, discountedTotalSet: { shopMoney: { amount: "30.00" } },
                customAttributes: [{ key: "Personalisation", value: "Mum" }, { key: "_internal", value: "x" }], product: { id: "gid://shopify/Product/1" }, variant: { id: "gid://shopify/ProductVariant/2" } }] },
            },
          ],
        },
      },
    });
    const r = await runSync("shopify", "manual", null, admin);
    assert.equal(r.created, 1, r.message);
    const { data: so } = await db.from("orders").select("external_order_number, tax_total, customer_data_status, order_items(personalisation, variant_title)").eq("external_order_id", `${SHOP_PREFIX}555`).single();
    assert.equal(so!.external_order_number, "#1555");
    assert.equal(Number(so!.tax_total), 5.83);
    assert.equal(so!.customer_data_status, "available");
    assert.equal(so!.order_items[0]!.personalisation, "Mum");
    assert.equal(so!.order_items[0]!.variant_title, "Large / Black");
  });
});
