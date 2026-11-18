/**
 * Task 1 — Etsy and Shopify synchronise independently.
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, snapshotIntegrations } from "../helpers/db";
import { connectFakeEtsy, connectFakeShopify, integrationRow } from "../helpers/connect";
import { FakeMarketplaces, etsyReceipt } from "../helpers/fake-marketplaces";
import { runDueSyncs, runScheduledSync, runSync, SYNC_LOCK_SECONDS } from "../../src/lib/integrations/sync";

const ETSY = "9909";
const SHOP = "gid://shopify/Order/9909";
const fake = new FakeMarketplaces();
let snapshot: Awaited<ReturnType<typeof snapshotIntegrations>>;
const T0 = Math.floor(Date.now() / 1000) - 3600;

const shopifyPage = (ids: string[]) => ({
  data: {
    orders: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: ids.map((id, i) => ({
        id: `${SHOP}${id}`, name: `#${id}`, createdAt: new Date(Date.now() - 7200_000).toISOString(),
        updatedAt: new Date(Date.now() - 3600_000 + i * 1000).toISOString(), cancelledAt: null, note: null,
        displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED", currencyCode: "GBP",
        email: null, customer: null, shippingAddress: null,
        subtotalPriceSet: null, totalPriceSet: { shopMoney: { amount: "10" } }, totalShippingPriceSet: null, totalTaxSet: null, totalDiscountsSet: null, shippingLine: null,
        lineItems: { pageInfo: { hasNextPage: false }, nodes: [{ id: `gid://shopify/LineItem/9909${id}`, title: "Thing", variantTitle: null, quantity: 1, currentQuantity: 1, sku: null, originalUnitPriceSet: { shopMoney: { amount: "10" } }, discountedTotalSet: null, customAttributes: [], product: null, variant: null }] },
      })),
    },
  },
});
const count = async (prefix: string) =>
  (await db.from("orders").select("id", { count: "exact", head: true }).like("external_order_id", `${prefix}%`)).count;
const due = () => db.from("integrations").update({ next_sync_at: null, sync_locked_until: null, status: "connected", consecutive_failures: 0 }).in("provider", ["etsy", "shopify"]);

describe("independent marketplace sync", () => {
  before(async () => {
    snapshot = await snapshotIntegrations();
    fake.install();
    await cleanupTestOrders(ETSY);
    await cleanupTestOrders(SHOP);
    await connectFakeEtsy();
    await connectFakeShopify();
    fake.etsyReceipts = [1, 2, 3].map((n) => etsyReceipt(`${ETSY}000${n}`, T0 + n));
    fake.shopify = () => shopifyPage(["01", "02"]);
  });
  after(async () => {
    fake.uninstall();
    await cleanupTestOrders(ETSY);
    await cleanupTestOrders(SHOP);
    await snapshot.restore();
  });

  it("Etsy failing does not stop Shopify", async () => {
    fake.etsyDown = true;
    const results = await runDueSyncs();
    fake.etsyDown = false;
    const etsy = results.find((r) => r.provider === "etsy")!;
    const shop = results.find((r) => r.provider === "shopify")!;
    assert.equal(etsy.status, "failed");
    assert.equal(shop.status, "success", shop.message);
    assert.equal(await count(SHOP), 2);
    assert.equal(await count(ETSY), 0);
    assert.equal((await integrationRow("etsy")).status, "error");
    assert.equal((await integrationRow("shopify")).status, "connected");
    assert.equal((await integrationRow("etsy")).sync_cursor, null, "Etsy cursor untouched by its failure");
  });

  it("Shopify failing does not stop Etsy, and each cursor belongs to its own marketplace", async () => {
    const shopCursorBefore = (await integrationRow("shopify")).sync_cursor;
    await due();
    fake.shopifyDown = true;
    const results = await runDueSyncs();
    fake.shopifyDown = false;
    assert.equal(results.find((r) => r.provider === "etsy")!.status, "success");
    assert.equal(results.find((r) => r.provider === "shopify")!.status, "failed");
    assert.equal(await count(ETSY), 3);
    assert.equal((await integrationRow("shopify")).sync_cursor, shopCursorBefore, "Etsy's run never wrote Shopify's cursor");
    assert.equal(Date.parse((await integrationRow("etsy")).sync_cursor!), (T0 + 3) * 1000);
  });

  it("an unexpected error (bad configuration) is contained, not thrown", async () => {
    await due();
    await db.from("integrations").update({ external_shop_id: null }).eq("provider", "etsy");
    const results = await runDueSyncs();
    assert.equal(results.find((r) => r.provider === "etsy")!.status, "failed");
    assert.match(results.find((r) => r.provider === "etsy")!.message, /shop ID is missing/);
    assert.notEqual(results.find((r) => r.provider === "shopify")!.status, "failed");
    await db.from("integrations").update({ external_shop_id: "42" }).eq("provider", "etsy");
  });

  it("each marketplace logs independently", async () => {
    const { data: logs } = await db.from("sync_logs").select("provider, status, started_at, finished_at, orders_created, orders_failed").gte("started_at", snapshot.startedAt).order("started_at");
    assert.ok(logs!.some((l) => l.provider === "etsy" && l.status === "failed"));
    assert.ok(logs!.some((l) => l.provider === "etsy" && l.status === "success" && l.orders_created === 3));
    assert.ok(logs!.some((l) => l.provider === "shopify" && l.status === "success" && l.orders_created === 2));
    assert.ok(logs!.every((l) => l.started_at && l.finished_at), "start and finish recorded for every run");
  });

  it("simultaneous requests for the same marketplace run once", async () => {
    await due();
    fake.etsyReceipts.push(etsyReceipt(`${ETSY}0004`, T0 + 100));
    const results = await Promise.all([runScheduledSync("etsy"), runScheduledSync("etsy"), runSync("etsy", "manual", null)]);
    assert.equal(results.filter((r) => r.status === "success").length, 1);
    assert.equal(results.filter((r) => r.status === "skipped").length, 2);
    assert.equal(await count(ETSY), 4, "no duplicates");
  });

  it("a run that was killed is recovered: lock expires and its log is closed", async () => {
    const { data: stale } = await db
      .from("sync_logs")
      .insert({ provider: "etsy", trigger: "scheduled", status: "running", started_at: new Date(Date.now() - 400_000).toISOString() })
      .select("id")
      .single();
    // Still locked → refused.
    await db.from("integrations").update({ sync_locked_until: new Date(Date.now() + 60_000).toISOString(), next_sync_at: null }).eq("provider", "etsy");
    assert.equal((await runScheduledSync("etsy")).status, "skipped");
    // Lock lapsed (killed run) → next run proceeds and closes the stale log.
    await db.from("integrations").update({ sync_locked_until: new Date(Date.now() - 1000).toISOString() }).eq("provider", "etsy");
    assert.notEqual((await runScheduledSync("etsy")).status, "skipped");
    const { data: closed } = await db.from("sync_logs").select("status, error_message").eq("id", stale!.id).single();
    assert.equal(closed!.status, "failed");
    assert.match(closed!.error_message!, /did not finish/);
    assert.ok(SYNC_LOCK_SECONDS < 600, "lock is shorter than the 10-minute schedule");
    await db.from("sync_logs").delete().eq("id", stale!.id); // backdated test row: remove explicitly
  });

  it("not-due marketplaces are skipped, keeping the 10-minute interval", async () => {
    await db.from("integrations").update({ next_sync_at: new Date(Date.now() + 9 * 60_000).toISOString() }).eq("provider", "shopify");
    assert.equal((await runScheduledSync("shopify")).status, "skipped");
  });
});

describe("cron endpoints (HTTP, local dev server)", () => {
  const base = process.env.PRINTFLOW_TEST_BASE_URL ?? "http://localhost:3000";
  const secret = process.env.CRON_SECRET ?? "";
  it("refuse requests without the secret", async () => {
    for (const path of ["/api/cron/sync", "/api/cron/sync/etsy", "/api/cron/sync/shopify"]) {
      const res = await fetch(base + path);
      assert.equal(res.status, 401, path);
    }
    const wrong = await fetch(base + "/api/cron/sync/etsy", { headers: { Authorization: "Bearer wrong" } });
    assert.equal(wrong.status, 401);
  });
  it("run each marketplace independently with the secret", async () => {
    for (const p of ["etsy", "shopify"]) {
      const res = await fetch(`${base}/api/cron/sync/${p}`, { headers: { Authorization: `Bearer ${secret}` } });
      assert.equal(res.status, 200, p);
      const body = (await res.json()) as { result: { provider: string; status: string } };
      assert.equal(body.result.provider, p);
      assert.equal(body.result.status, "skipped", "not connected in the dev database");
    }
    const unknown = await fetch(`${base}/api/cron/sync/amazon`, { headers: { Authorization: `Bearer ${secret}` } });
    assert.equal(unknown.status, 404);
  });
});
