/**
 * Actual marketplace fees: stored per order, idempotent, used in profit only
 * when complete, and never able to break a sync. Mocked APIs; orders 9916….
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, snapshotIntegrations } from "../helpers/db";
import { connectFakeEtsy, connectFakeShopify } from "../helpers/connect";
import { FakeMarketplaces, etsyReceipt } from "../helpers/fake-marketplaces";
import { orderBy, rpc } from "../helpers/fixtures";
import { runSync } from "../../src/lib/integrations/sync";
import { syncOrderFees } from "../../src/lib/integrations/fee-sync";
import { mapShopifyOrder, type ShopifyOrderNode } from "../../src/lib/integrations/shopify/mapper";
import type { Json } from "../../src/types/database";

const fake = new FakeMarketplaces();
let snapshot: Awaited<ReturnType<typeof snapshotIntegrations>>;
const now = () => Math.floor(Date.now() / 1000);
const A = "99160001"; // full Etsy fees
const B = "99160002"; // Etsy processing fee only
const SHOP = "gid://shopify/Order/9916";
const gbp = (p: number) => ({ amount: p, divisor: 100, currency_code: "GBP" });
const fees = async (orderId: string) => (await db.from("order_fees").select("kind, label, amount, counted, external_ref").eq("order_id", orderId).order("external_ref")).data ?? [];
const summary = async (day: string) => (await db.rpc("analytics_period_summary", { p_from: `${day}T00:00:00Z`, p_to: `${day}T23:59:59Z` })).data as { est_marketplace_fees: number; orders_with_actual_fees: number };

describe("actual marketplace fees", () => {
  before(async () => {
    snapshot = await snapshotIntegrations();
    fake.install();
    await cleanupTestOrders("9916");
    await cleanupTestOrders(SHOP);
    await connectFakeEtsy();
    await connectFakeShopify();
    fake.etsyReceipts = [etsyReceipt(A, now() - 600), etsyReceipt(B, now() - 500)];
    fake.etsyPayments = {
      [A]: [{ payment_id: 501, receipt_id: Number(A), amount_fees: gbp(85), posted_fees: gbp(85), adjusted_fees: null }],
      [B]: [{ payment_id: 502, receipt_id: Number(B), amount_fees: gbp(90), posted_fees: gbp(90), adjusted_fees: null }],
    };
    fake.etsyLedger = [
      { entry_id: 7001, amount: -169, currency: "GBP", ledger_type: "transaction", reference_type: "transaction", reference_id: `${A}01`, create_date: now() - 550 },
      { entry_id: 7002, amount: -16, currency: "GBP", ledger_type: "listing", reference_type: "transaction", reference_id: `${A}01`, create_date: now() - 550 },
      { entry_id: 7003, amount: 2595, currency: "GBP", ledger_type: "payment", reference_type: "receipt", reference_id: A, create_date: now() - 550 },
      { entry_id: 7004, amount: -999, currency: "GBP", ledger_type: "transaction", reference_type: "transaction", reference_id: "123", create_date: now() - 550 }, // someone else's
    ];
  });
  after(async () => {
    fake.uninstall();
    await cleanupTestOrders("9916");
    await cleanupTestOrders(SHOP);
    await snapshot.restore();
  });

  it("a sync imports orders and their actual Etsy fees", async () => {
    const r = await runSync("etsy", "manual", null);
    assert.equal(r.status, "success", r.message);
    const a = await orderBy(A);
    assert.equal(a.fee_basis, "actual");
    const lines = await fees(a.id);
    assert.deepEqual(lines.map((l) => [l.external_ref, Number(l.amount), l.counted]), [
      ["ledger:7001", 1.69, true],
      ["ledger:7002", 0.16, true],
      ["payment:501:processing", 0.85, true],
    ]);
    const b = await orderBy(B);
    assert.equal(b.fee_basis, "partial", "only the processing fee is known → estimate still used");
    assert.ok(fake.etsyLedgerCalls.every((q) => q.includes("min_created") && q.includes("max_created")));
  });

  it("profit uses actual fees only where complete", async () => {
    const a = await orderBy(A);
    const day = a.order_date.slice(0, 10);
    const withActual = await summary(day);
    await db.from("orders").update({ fee_basis: "partial" }).eq("id", a.id);
    const estimated = await summary(day);
    await db.from("orders").update({ fee_basis: "actual" }).eq("id", a.id);
    const { data: s } = await db.from("business_settings").select("etsy_fee_percent, etsy_fixed_fee").single();
    const est = Number(a.total) * Number(s!.etsy_fee_percent) / 100 + Number(s!.etsy_fixed_fee);
    const delta = Number(estimated.est_marketplace_fees) - Number(withActual.est_marketplace_fees);
    assert.ok(Math.abs(delta - (est - 2.7)) < 0.02, `estimate ${est} replaced by actual 2.70 (delta ${delta})`);
    assert.equal(withActual.orders_with_actual_fees - estimated.orders_with_actual_fees, 1);
  });

  it("re-reading is idempotent and doesn't run again until the refresh interval", async () => {
    const again = await syncOrderFees(db, "etsy");
    assert.equal(again.orders, 0, "nothing due yet");
    await db.from("orders").update({ fees_synced_at: null }).eq("external_order_id", A);
    const forced = await syncOrderFees(db, "etsy");
    assert.equal(forced.status, "done");
    assert.equal((await fees((await orderBy(A)).id)).length, 3, "no duplicate fee lines");
  });

  it("a fee problem never breaks order syncing", async () => {
    await db.from("orders").update({ fees_synced_at: null }).like("external_order_id", "9916%");
    fake.etsyDown = false;
    const original = fake.etsyLedger;
    fake.etsyLedger = null as unknown as typeof original; // the fake will throw while reading the ledger
    fake.etsyReceipts.push(etsyReceipt("99160003", now() - 60));
    const r = await runSync("etsy", "manual", null);
    fake.etsyLedger = original;
    assert.equal(r.status, "success");
    assert.equal(r.created, 1);
  });

  it("Shopify Payments fees are actual; other gateways keep the estimate", async () => {
    const node = (id: string): ShopifyOrderNode => ({
      id: `${SHOP}${id}`, name: `#${id}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), cancelledAt: null, note: null,
      displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED", currencyCode: "GBP", customer: null, email: null, shippingAddress: null,
      subtotalPriceSet: null, totalPriceSet: { shopMoney: { amount: "20" } }, totalShippingPriceSet: null, totalTaxSet: null, totalDiscountsSet: null, shippingLine: null,
      lineItems: { pageInfo: { hasNextPage: false }, nodes: [{ id: `gid://shopify/LineItem/9916${id}`, title: "A", variantTitle: null, quantity: 1, currentQuantity: 1, sku: null, originalUnitPriceSet: { shopMoney: { amount: "20" } }, discountedTotalSet: null, customAttributes: [], product: null, variant: null }] },
    });
    for (const id of ["1", "2"]) {
      const m = mapShopifyOrder(node(id), 3);
      await rpc("ingest_marketplace_order", { p_source: "shopify", p_order: m.order as unknown as Json, p_items: m.items as unknown as Json });
    }
    fake.shopify = ({ query, variables }) => {
      if (!query.includes("PrintFlowOrderFees")) return { data: null };
      return {
        data: {
          nodes: (variables.ids as string[]).map((gid) => ({
            id: gid,
            transactions: gid.endsWith("1")
              ? [{ id: "t1", kind: "SALE", status: "SUCCESS", gateway: "shopify_payments", fees: [{ id: "gid://shopify/TransactionFee/1", type: "payment_processing", rateName: "Online card rate", flatFeeName: null, amount: { amount: "0.75", currencyCode: "GBP" }, taxAmount: { amount: "0.15", currencyCode: "GBP" } }] }]
              : [{ id: "t2", kind: "SALE", status: "SUCCESS", gateway: "paypal", fees: [] }],
          })),
        },
      };
    };
    const r = await syncOrderFees(db, "shopify");
    assert.equal(r.status, "done", r.error);
    const one = await orderBy(`${SHOP}1`);
    assert.equal(one.fee_basis, "actual");
    assert.deepEqual((await fees(one.id)).map((l) => Number(l.amount)), [0.75, 0.15]);
    assert.equal((await orderBy(`${SHOP}2`)).fee_basis, "unavailable");
  });
});
