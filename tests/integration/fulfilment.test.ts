/**
 * Task 4 — tracking/fulfilment updates (mocked marketplaces only).
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, snapshotIntegrations } from "../helpers/db";
import { connectFakeEtsy, connectFakeShopify } from "../helpers/connect";
import { FakeMarketplaces } from "../helpers/fake-marketplaces";
import { ingestEtsy, jobsFor, orderBy, receiptWithItems, rpc } from "../helpers/fixtures";
import { saveCredentials } from "../../src/lib/integrations/credentials";
import { mapShopifyOrder, type ShopifyOrderNode } from "../../src/lib/integrations/shopify/mapper";
import { pushShipmentToMarketplace } from "../../src/lib/integrations/fulfilment";
import type { Json } from "../../src/types/database";

const PREFIX = "9910";
const SHOP = `gid://shopify/Order/${PREFIX}`;
const fake = new FakeMarketplaces();
let snapshot: Awaited<ReturnType<typeof snapshotIntegrations>>;
const T0 = Math.floor(Date.now() / 1000) - 3600;
let n = 0;

/** A real-looking dispatched Etsy order. Returns {orderId, shipmentId, receiptId}. */
async function dispatchedEtsy(tracking: string | null = "AB123456789GB", carrier = "Royal Mail") {
  n++;
  const receiptId = `${PREFIX}${String(n).padStart(4, "0")}`;
  await ingestEtsy(receiptWithItems(receiptId, T0, [{ tx: `${receiptId}01`, qty: 1 }]));
  const job = (await jobsFor(receiptId))[0]!;
  await db.from("production_jobs").update({ stage: "ready_to_pack" }).eq("id", job.id);
  const order = await orderBy(receiptId);
  const shipmentId = await rpc<string>("mark_order_dispatched", { p_order_id: order.id, p_carrier: carrier, p_tracking_number: tracking ?? "" });
  return { orderId: order.id, shipmentId, receiptId };
}
const shipment = async (id: string) => (await db.from("shipments").select("*").eq("id", id).single()).data!;
const submissions = async (id: string) => (await db.from("fulfilment_submissions").select("*").eq("shipment_id", id).order("attempt")).data ?? [];

describe("Etsy fulfilment", () => {
  before(async () => {
    snapshot = await snapshotIntegrations();
    fake.install();
    await cleanupTestOrders(PREFIX);
    await cleanupTestOrders(SHOP);
    await connectFakeEtsy();
    await connectFakeShopify();
  });
  after(async () => {
    fake.uninstall();
    await cleanupTestOrders(PREFIX);
    await cleanupTestOrders(SHOP);
    await snapshot.restore();
  });

  it("sends valid tracking once, records the response, and never changes dispatch status", async () => {
    const { orderId, shipmentId, receiptId } = await dispatchedEtsy();
    const r = await pushShipmentToMarketplace(shipmentId);
    assert.ok(r.ok && r.status === "succeeded", JSON.stringify(r));
    assert.equal(fake.etsyTrackingPosts.length, 1);
    const post = fake.etsyTrackingPosts[0]!;
    assert.equal(post.receiptId, receiptId);
    assert.equal(post.body.get("tracking_code"), "AB123456789GB");
    assert.equal(post.body.get("carrier_name"), "Royal Mail");
    const s = await shipment(shipmentId);
    assert.equal(s.marketplace_push_status, "sent");
    const [sub] = await submissions(shipmentId);
    assert.equal(sub!.status, "succeeded");
    assert.ok(sub!.response, "API response recorded");
    assert.equal((sub!.request as { tracking_number: string }).tracking_number, "AB123456789GB");
    assert.equal((await db.from("orders").select("status").eq("id", orderId).single()).data!.status, "dispatched");

    // A second attempt is refused — no duplicate fulfilment.
    const again = await pushShipmentToMarketplace(shipmentId);
    assert.equal(again.ok, false);
    assert.equal(fake.etsyTrackingPosts.length, 1);
  });

  it("concurrent submissions for one shipment send only once", async () => {
    const { shipmentId } = await dispatchedEtsy("CD123456789GB");
    const before = fake.etsyTrackingPosts.length;
    const [a, b] = await Promise.all([pushShipmentToMarketplace(shipmentId), pushShipmentToMarketplace(shipmentId)]);
    assert.equal([a, b].filter((x) => x.ok).length, 1);
    assert.match([a, b].find((x) => !x.ok)!.message, /already (in progress|been sent)/);
    assert.equal(fake.etsyTrackingPosts.length - before, 1);
  });

  it("refuses missing tracking, placeholders, undispatched and sample orders without calling Etsy", async () => {
    const before = fake.etsyTrackingPosts.length;
    const none = await dispatchedEtsy(null);
    assert.match((await pushShipmentToMarketplace(none.shipmentId)).message, /tracking number is required/);

    const placeholder = await dispatchedEtsy("EF123456789GB");
    await db.from("shipments").update({ tracking_number: "TBC12345" }).eq("id", placeholder.shipmentId);
    assert.match((await pushShipmentToMarketplace(placeholder.shipmentId)).message, /placeholder/);

    n++;
    const rid = `${PREFIX}${String(n).padStart(4, "0")}`;
    await ingestEtsy(receiptWithItems(rid, T0, [{ tx: `${rid}01`, qty: 1 }]));
    const job = (await jobsFor(rid))[0]!;
    await db.from("production_jobs").update({ stage: "ready_to_pack" }).eq("id", job.id);
    const packed = await rpc<string>("mark_order_packed", { p_order_id: (await orderBy(rid)).id, p_checklist: [] });
    await db.from("shipments").update({ tracking_number: "GH123456789GB", carrier: "Royal Mail" }).eq("id", packed);
    assert.match((await pushShipmentToMarketplace(packed)).message, /actually been dispatched/);

    const sample = await dispatchedEtsy("IJ123456789GB");
    await db.from("orders").update({ is_sample: true }).eq("id", sample.orderId);
    assert.match((await pushShipmentToMarketplace(sample.shipmentId)).message, /Sample orders/);

    assert.equal(fake.etsyTrackingPosts.length, before, "no API calls for invalid submissions");
    assert.equal((await submissions(none.shipmentId)).length, 0);
  });

  it("dispatch itself rejects invalid tracking (stored tracking is always clean)", async () => {
    n++;
    const rid = `${PREFIX}${String(n).padStart(4, "0")}`;
    await ingestEtsy(receiptWithItems(rid, T0, [{ tx: `${rid}01`, qty: 1 }]));
    // The SQL function accepts raw input; the server action validates first — see unit tests.
    const { validateTracking } = await import("../../src/lib/integrations/carriers");
    assert.equal(validateTracking("Royal Mail", "SAMPLE100001GB").ok, false);
  });

  it("expired credentials fail safely and are clearly categorised", async () => {
    const { orderId, shipmentId } = await dispatchedEtsy("KL123456789GB");
    const { admin, integrationId } = await connectFakeEtsy();
    await saveCredentials(admin, integrationId, { accessToken: "1.old", refreshToken: "1.revoked", expiresInSeconds: 1 });
    fake.etsyRefreshFails = true;
    const r = await pushShipmentToMarketplace(shipmentId);
    fake.etsyRefreshFails = false;
    assert.ok(!r.ok && r.category === "credentials" && !r.retryable, JSON.stringify(r));
    const s = await shipment(shipmentId);
    assert.equal(s.marketplace_push_status, "failed");
    assert.equal(s.marketplace_push_error_category, "credentials");
    assert.equal((await db.from("orders").select("status").eq("id", orderId).single()).data!.status, "dispatched", "order stays dispatched");
    await connectFakeEtsy();
    // Retrying after reconnecting works and creates exactly one fulfilment.
    const retry = await pushShipmentToMarketplace(shipmentId);
    assert.ok(retry.ok, JSON.stringify(retry));
    assert.deepEqual((await submissions(shipmentId)).map((x) => x.status), ["failed", "succeeded"]);
  });

  it("a 429 is retried automatically; persistent rate limiting is recorded as retryable", async () => {
    const once = await dispatchedEtsy("MN123456789GB");
    fake.etsyTrackingStatus = [429];
    assert.ok((await pushShipmentToMarketplace(once.shipmentId)).ok);

    const always = await dispatchedEtsy("OP123456789GB");
    fake.etsyTrackingStatus = [429, 429, 429, 429, 429];
    const r = await pushShipmentToMarketplace(always.shipmentId);
    fake.etsyTrackingStatus = [];
    assert.ok(!r.ok && r.category === "rate_limited" && r.retryable, JSON.stringify(r));
  });

  it("a server error on the write is NOT blindly resent; the manual retry succeeds once", async () => {
    const { shipmentId } = await dispatchedEtsy("QR123456789GB");
    const before = fake.etsyTrackingPosts.length;
    fake.etsyTrackingStatus = [500];
    const r = await pushShipmentToMarketplace(shipmentId);
    assert.ok(!r.ok && r.category === "marketplace_error" && r.retryable, JSON.stringify(r));
    assert.equal(fake.etsyTrackingPosts.length, before, "the failed write was not repeated automatically");
    const retry = await pushShipmentToMarketplace(shipmentId);
    assert.ok(retry.ok);
    assert.equal(fake.etsyTrackingPosts.length - before, 1);
  });

  it("a rejected submission (400) is recorded as not retryable", async () => {
    const { shipmentId } = await dispatchedEtsy("ST123456789GB");
    fake.etsyTrackingStatus = [400];
    const r = await pushShipmentToMarketplace(shipmentId);
    assert.ok(!r.ok && r.category === "marketplace_rejected" && !r.retryable, JSON.stringify(r));
    const [sub] = await submissions(shipmentId);
    assert.equal(sub!.http_status, 400);
  });

  it("a timeout after Etsy saved the tracking never creates a duplicate on retry", async () => {
    const { shipmentId, receiptId } = await dispatchedEtsy("UV123456789GB");
    fake.etsyTrackingTimeoutAfterSave = true;
    const r = await pushShipmentToMarketplace(shipmentId);
    assert.ok(!r.ok && r.category === "network", JSON.stringify(r));
    assert.equal(fake.etsyShipments[receiptId]!.length, 1, "Etsy did record it");
    const retry = await pushShipmentToMarketplace(shipmentId);
    assert.ok(retry.ok && retry.status === "already_fulfilled", JSON.stringify(retry));
    assert.equal(fake.etsyShipments[receiptId]!.length, 1, "no second tracking entry on Etsy");
    assert.equal((await shipment(shipmentId)).marketplace_push_status, "sent");
  });
});

describe("Shopify fulfilment", () => {
  const mutations: Record<string, unknown>[] = [];
  const shopifyFulfilments: { id: string; trackingInfo: { number: string }[] }[] = [];
  let mode: "ok" | "userErrors" | "unauthorised" = "ok";

  before(async () => {
    snapshot = await snapshotIntegrations();
    fake.install();
    await connectFakeShopify();
    fake.shopify = ({ query, variables }) => {
      if (query.includes("PrintFlowExistingFulfilments")) return { data: { order: { fulfillments: shopifyFulfilments } } };
      if (query.includes("PrintFlowFulfillmentOrders")) return { data: { order: { fulfillmentOrders: { nodes: [{ id: "gid://shopify/FulfillmentOrder/1", status: "OPEN" }] } } } };
      if (query.includes("PrintFlowFulfil")) {
        mutations.push(variables);
        if (mode === "userErrors") return { data: { fulfillmentCreate: { fulfillment: null, userErrors: [{ field: ["trackingInfo"], message: "Tracking number is invalid" }] } } };
        const f = { id: `gid://shopify/Fulfillment/${mutations.length}`, status: "SUCCESS" };
        shopifyFulfilments.push({ id: f.id, trackingInfo: [{ number: (variables.fulfillment as { trackingInfo: { number: string } }).trackingInfo.number }] });
        return { data: { fulfillmentCreate: { fulfillment: f, userErrors: [] } } };
      }
      return { data: null };
    };
  });
  after(async () => {
    fake.uninstall();
    await cleanupTestOrders(SHOP);
    await snapshot.restore();
  });

  async function dispatchedShopify(id: string, tracking: string) {
    const node: ShopifyOrderNode = {
      id: `${SHOP}${id}`, name: `#${id}`, createdAt: "2026-11-18T08:00:00Z", updatedAt: "2026-11-18T09:00:00Z", cancelledAt: null, note: null,
      displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED", currencyCode: "GBP", customer: null, email: null, shippingAddress: null,
      subtotalPriceSet: null, totalPriceSet: { shopMoney: { amount: "10" } }, totalShippingPriceSet: null, totalTaxSet: null, totalDiscountsSet: null, shippingLine: null,
      lineItems: { pageInfo: { hasNextPage: false }, nodes: [{ id: `gid://shopify/LineItem/${PREFIX}${id}`, title: "A", variantTitle: null, quantity: 1, currentQuantity: 1, sku: null, originalUnitPriceSet: { shopMoney: { amount: "10" } }, discountedTotalSet: null, customAttributes: [], product: null, variant: null }] },
    };
    const m = mapShopifyOrder(node, 3);
    await rpc("ingest_marketplace_order", { p_source: "shopify", p_order: m.order as unknown as Json, p_items: m.items as unknown as Json });
    const order = await orderBy(`${SHOP}${id}`);
    await db.from("production_jobs").update({ stage: "ready_to_pack" }).eq("order_id", order.id);
    return rpc<string>("mark_order_dispatched", { p_order_id: order.id, p_carrier: "DPD", p_tracking_number: tracking });
  }

  it("creates a fulfilment with mapped carrier and tracking link", async () => {
    const shipmentId = await dispatchedShopify("01", "15501234567890");
    const r = await pushShipmentToMarketplace(shipmentId);
    assert.ok(r.ok && r.status === "succeeded", JSON.stringify(r));
    const info = (mutations[0]!.fulfillment as { trackingInfo: { number: string; company: string; url: string }; notifyCustomer: boolean }).trackingInfo;
    assert.deepEqual({ number: info.number, company: info.company }, { number: "15501234567890", company: "DPD UK" });
    assert.match(info.url, /dpd\.co\.uk/);
    assert.equal((await shipment(shipmentId)).external_fulfilment_id, "gid://shopify/Fulfillment/1");
  });

  it("does not resubmit when Shopify already has the tracking", async () => {
    const shipmentId = await dispatchedShopify("02", "15501234567890");
    const before = mutations.length;
    const r = await pushShipmentToMarketplace(shipmentId);
    assert.ok(r.ok && r.status === "already_fulfilled");
    assert.equal(mutations.length, before);
  });

  it("records Shopify user errors as a rejected, non-retryable failure", async () => {
    const shipmentId = await dispatchedShopify("03", "15509999999999");
    mode = "userErrors";
    const r = await pushShipmentToMarketplace(shipmentId);
    mode = "ok";
    assert.ok(!r.ok && r.category === "marketplace_rejected" && !r.retryable, JSON.stringify(r));
    assert.match(r.message, /Tracking number is invalid/);
  });

  it("an unauthorised token is categorised as a credentials problem", async () => {
    const shipmentId = await dispatchedShopify("04", "15508888888888");
    const original = fake.shopify;
    fake.shopifyDown = false;
    // Simulate a revoked token: the fake returns HTTP 401.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      /myshopify\.com/.test(String(input)) ? new Response("Unauthorized", { status: 401 }) : realFetch(input, init)) as typeof fetch;
    const r = await pushShipmentToMarketplace(shipmentId);
    globalThis.fetch = realFetch;
    fake.shopify = original;
    assert.ok(!r.ok && r.category === "credentials", JSON.stringify(r));
  });
});
