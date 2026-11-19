/**
 * New-order email alerts: each new order emailed once, history never floods,
 * failures retried, nothing about existing orders. Fake Resend only.
 * Test orders 9915…; the real alert settings are restored afterwards.
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, snapshotIntegrations } from "../helpers/db";
import { connectFakeEtsy } from "../helpers/connect";
import { FakeMarketplaces, etsyReceipt } from "../helpers/fake-marketplaces";
import { runSync } from "../../src/lib/integrations/sync";
import { sendNewOrderAlerts } from "../../src/lib/notifications/new-order-alerts";

const fake = new FakeMarketplaces();
let snapshot: Awaited<ReturnType<typeof snapshotIntegrations>>;
let savedSettings: { new_order_alerts_enabled: boolean; new_order_alert_email: string | null; new_order_alerts_since: string | null };
const now = () => Math.floor(Date.now() / 1000);
const id = (n: number) => `991500${String(n).padStart(2, "0")}`;
const alertCols = "new_order_alerts_enabled, new_order_alert_email, new_order_alerts_since";

describe("new-order email alerts", () => {
  before(async () => {
    snapshot = await snapshotIntegrations();
    savedSettings = (await db.from("business_settings").select(alertCols).single()).data as typeof savedSettings;
    fake.install();
    await cleanupTestOrders("9915");
    await connectFakeEtsy();
    await db.from("business_settings").update({ new_order_alerts_enabled: false }).eq("singleton", true);
  });
  after(async () => {
    fake.uninstall();
    await cleanupTestOrders("9915");
    await db.from("business_settings").update(savedSettings).eq("singleton", true);
    await snapshot.restore();
  });

  it("sends nothing while alerts are off", async () => {
    fake.etsyReceipts = [etsyReceipt(id(1), now() - 300)];
    await runSync("etsy", "manual", null);
    assert.equal(fake.emails.length, 0);
  });

  it("orders that arrived before alerts were switched on are never emailed", async () => {
    await db.from("business_settings").update({ new_order_alerts_enabled: true, new_order_alert_email: "owner@example.com", new_order_alerts_since: new Date().toISOString() }).eq("singleton", true);
    const r = await sendNewOrderAlerts(db);
    assert.equal(r.status, "nothing");
    assert.equal(fake.emails.length, 0);
  });

  it("emails new open orders once, in one email per sync — not old, shipped or sample orders", async () => {
    const recent = (n: number, extra = {}) => ({ ...etsyReceipt(id(n), now() - 120), ...extra });
    const withName = recent(2);
    withName.transactions[0] = { ...withName.transactions[0]!, variations: [{ formatted_name: "Personalization", formatted_value: "<b>Ava</b> & Co" }] };
    fake.etsyReceipts.push(
      withName,
      recent(3),
      { ...etsyReceipt(id(4), now() - 100), created_timestamp: now() - 10 * 86400 }, // placed 10 days ago (history)
      recent(5, { is_shipped: true }), // already shipped on Etsy
    );
    const r = await runSync("etsy", "manual", null);
    assert.equal(r.status, "success", r.message);
    assert.equal(fake.emails.length, 1, "one email for the batch");
    const e = fake.emails[0]!;
    assert.deepEqual(e.body.to, ["owner@example.com"]);
    assert.equal(e.body.from, "PrintFlow Test <alerts@example.com>");
    assert.equal(e.body.subject, "2 new orders (Etsy 2)");
    assert.ok(e.idempotencyKey?.startsWith("printflow-new-orders-"));
    assert.match(e.body.html, /&lt;b&gt;Ava&lt;\/b&gt; &amp; Co/, "personalisation is escaped");
    assert.ok(!e.body.html.includes("<b>Ava</b>"));
    assert.match(e.body.text, /Personalisation: <b>Ava<\/b> & Co/);
    assert.ok(!e.body.text.includes(id(4)) && !e.body.text.includes(id(5)));
  });

  it("a later sync with no new orders sends nothing; updates never re-alert", async () => {
    fake.etsyReceipts = fake.etsyReceipts.map((x) => (x.receipt_id === Number(id(2)) ? { ...x, updated_timestamp: now() } : x));
    await runSync("etsy", "manual", null);
    assert.equal(fake.emails.length, 1);
  });

  it("if sending fails the order is retried on the next sync, and only one email is ever sent", async () => {
    fake.etsyReceipts.push(etsyReceipt(id(6), now() - 30));
    fake.resendStatus = [500];
    await runSync("etsy", "manual", null);
    assert.equal(fake.emails.length, 1, "failed send didn't count");
    const { data: o } = await db.from("orders").select("new_order_alert_sent_at").eq("external_order_id", id(6)).single();
    assert.equal(o!.new_order_alert_sent_at, null, "claim released for retry");
    const r = await sendNewOrderAlerts(db);
    assert.equal(r.status, "sent");
    assert.equal(fake.emails.length, 2);
    assert.match(fake.emails[1]!.body.subject, new RegExp(`New Etsy order .* · £25\\.95`));
  });

  it("two alert runs at the same time never email the same order twice", async () => {
    fake.etsyReceipts.push(etsyReceipt(id(7), now() - 20));
    await db.from("business_settings").update({ new_order_alerts_enabled: false }).eq("singleton", true);
    await runSync("etsy", "manual", null);
    await db.from("business_settings").update({ new_order_alerts_enabled: true }).eq("singleton", true);
    const [a, b] = await Promise.all([sendNewOrderAlerts(db), sendNewOrderAlerts(db)]);
    assert.deepEqual([a.orders + b.orders, fake.emails.length], [1, 3]);
  });
});
