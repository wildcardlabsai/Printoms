/**
 * Vinted Pro orders: signed requests, import, status changes, isolation.
 * Mocked Vinted API only. Test orders use ids 9914….
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, snapshotIntegrations } from "../helpers/db";
import { FakeMarketplaces } from "../helpers/fake-marketplaces";
import { jobsFor, orderBy, reviewsFor } from "../helpers/fixtures";
import { runSync } from "../../src/lib/integrations/sync";
import { pushShipmentToMarketplace } from "../../src/lib/integrations/fulfilment";
import { VintedAdapter } from "../../src/lib/integrations/vinted/adapter";
import type { VintedOrder } from "../../src/lib/integrations/vinted/mapper";

const fake = new FakeMarketplaces();
let snapshot: Awaited<ReturnType<typeof snapshotIntegrations>>;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const vOrder = (id: number, status: VintedOrder["status"], created: string, title = "Moon lamp"): VintedOrder => ({
  id, created_at: created, status, amount: 21.5, currency: "GBP",
  items: [
    { id: `00000000-0000-4000-8000-0000${id}`, item_reference: null, title, price: 24 },
    { id: "00000000-0000-0000-0000-000000000000", title: "Keyring", price: 4 },
  ],
  delivery_address: { name: `Vinted Buyer ${id}`, line_1: "1 Test Road", postal_code: "TE1 1ST", city: "Testville", country_code: "GB" },
});
const setStatus = (id: number, status: VintedOrder["status"]) => {
  fake.vintedOrders = fake.vintedOrders.map((o) => (o.id === id ? { ...o, status } : o));
};

describe("Vinted Pro orders", () => {
  before(async () => {
    snapshot = await snapshotIntegrations();
    fake.install();
    await cleanupTestOrders("9914");
    await db.from("integrations").update({ status: "connected", sync_cursor: null, sync_locked_until: null, initial_import_days: 30, settings: {}, consecutive_failures: 0, last_error: null }).eq("provider", "vinted");
    fake.vintedPageSize = 2; // force pagination
    fake.vintedOrders = [
      vOrder(99140001, "READY_TO_BE_SHIPPED", daysAgo(1)),
      vOrder(99140002, "COMPLETED", daysAgo(5)),
      vOrder(99140003, "CREATED", daysAgo(2)),
      vOrder(99140004, "READY_TO_BE_SHIPPED", daysAgo(60)), // outside the 30-day window
    ];
  });
  after(async () => {
    fake.uninstall();
    await cleanupTestOrders("9914");
    await snapshot.restore();
  });

  it("imports orders in the window with signed requests, paging through the list", async () => {
    const r = await runSync("vinted", "manual", null);
    assert.equal(r.status, "success", r.message);
    assert.equal(fake.vintedBadSignatures, 0, "every request was correctly signed");
    assert.ok(fake.vintedListCalls >= 3, "list was paged (page size 2)");
    assert.equal(r.created, 3);
    const open = await orderBy("99140001");
    assert.equal(open.source, "vinted");
    assert.equal(Number(open.total), 21.5, "total is the Vinted payout");
    assert.equal(open.status, "new");
    const jobs = await jobsFor("99140001");
    assert.equal(jobs.length, 2, "one job per item, including the unmanaged item");
    assert.equal((await orderBy("99140002")).status, "completed", "already finished on Vinted → completed, not on the board");
    const { data: old } = await db.from("orders").select("id").eq("external_order_id", "99140004");
    assert.equal(old!.length, 0, "outside the import window");
    const { data: cust } = await db.from("customers").select("display_name").eq("id", open.customer_id!).single();
    assert.equal(cust!.display_name, "Vinted Buyer 99140001");
  });

  it("an unchanged account only re-reads the list, never order details", async () => {
    fake.vintedDetailCalls = [];
    const r = await runSync("vinted", "manual", null);
    assert.equal(r.status, "success", r.message);
    assert.deepEqual(fake.vintedDetailCalls, []);
    assert.equal((r.created ?? 0) + (r.updated ?? 0), 0);
  });

  it("applies status changes: cancellation closes unstarted work; shipped on Vinted is recorded", async () => {
    setStatus(99140003, "CANCELED");
    setStatus(99140001, "SHIPPED");
    fake.vintedDetailCalls = [];
    const r = await runSync("vinted", "manual", null);
    assert.equal(r.status, "success", r.message);
    assert.deepEqual(fake.vintedDetailCalls.sort(), ["99140001", "99140003"], "only changed orders fetched");
    assert.equal((await orderBy("99140003")).status, "cancelled");
    assert.ok((await jobsFor("99140003")).every((j) => j.cancelled_at), "unstarted jobs closed");
    assert.equal((await orderBy("99140001")).status, "dispatched");
    assert.equal((await reviewsFor((await orderBy("99140001")).id)).filter((x) => x.status === "open").length, 0);
  });

  it("new orders arrive on the next sync; one broken order doesn't block the rest", async () => {
    fake.vintedOrders.push(vOrder(99140005, "READY_TO_BE_SHIPPED", new Date().toISOString()), vOrder(99140006, "READY_TO_BE_SHIPPED", new Date().toISOString()));
    fake.vintedBrokenOrders.add(99140005);
    const r = await runSync("vinted", "manual", null);
    assert.equal(r.created, 1, r.message);
    assert.equal((await orderBy("99140006")).status, "new");
    const { data: log } = await db.from("sync_logs").select("warnings").eq("provider", "vinted").order("started_at", { ascending: false }).limit(1).single();
    assert.match(JSON.stringify(log!.warnings), /99140005 could not be loaded/);
    fake.vintedBrokenOrders.clear();
    const again = await runSync("vinted", "manual", null);
    assert.equal(again.created, 1, "retried and imported on the next sync");
  });

  it("a rejected access key fails the Vinted sync clearly, without touching other marketplaces", async () => {
    fake.vintedAuthError = "REAUTHORISATION_REQUIRED";
    const r = await runSync("vinted", "manual", null);
    fake.vintedAuthError = null;
    assert.equal(r.status, "failed");
    assert.match(r.message ?? "", /log out and back into the Vinted Pro Integrations Portal/);
    const { data: etsy } = await db.from("integrations").select("last_error").eq("provider", "etsy").single();
    assert.ok(!/Vinted/.test(etsy!.last_error ?? ""), "Etsy unaffected");
  });

  it("downloads Vinted's label PDF and explains when there isn't one", async () => {
    const adapter = new VintedAdapter(db, "test-access-key,test-signing-key");
    const ok = await adapter.shipmentLabel("99140006");
    assert.ok(ok.ok && new TextDecoder().decode(ok.pdf).startsWith("%PDF"));
    fake.vintedLabels["99140001"] = "LABEL_CREATION_IN_PROGRESS";
    const wait = await adapter.shipmentLabel("99140001");
    assert.ok(!wait.ok && /still creating/.test(wait.reason));
  });

  it("never tries to send tracking to Vinted", async () => {
    const order = await orderBy("99140006");
    await db.from("production_jobs").update({ stage: "ready_to_pack" }).eq("order_id", order.id);
    const { data: shipmentId, error } = await db.rpc("mark_order_dispatched", { p_order_id: order.id, p_carrier: "Royal Mail", p_tracking_number: "AB123456789GB" });
    assert.equal(error, null, error?.message);
    const r = await pushShipmentToMarketplace(shipmentId as string);
    assert.ok(!r.ok && /nothing to send back/.test(r.message));
  });

  it("Vinted sales appear as their own channel in the dashboard", async () => {
    const { data } = await db.rpc("dashboard_metrics");
    const m = data as { vinted_sales: number; vinted_orders: number; total_sales: number };
    assert.ok(Number(m.vinted_sales) >= 21.5 * 3, JSON.stringify({ v: m.vinted_sales }));
    assert.ok(m.vinted_orders >= 3);
  });
});
