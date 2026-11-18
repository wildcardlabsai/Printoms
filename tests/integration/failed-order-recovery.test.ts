/**
 * Task 1 — failed marketplace orders can never silently disappear.
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, installFaultInjection, removeFaultInjection, setFault, snapshotIntegrations } from "../helpers/db";
import { connectFakeEtsy, integrationRow } from "../helpers/connect";
import { FakeMarketplaces, etsyReceipt } from "../helpers/fake-marketplaces";
import { FAILURE_CURSOR_HOLD_ATTEMPTS, runSync } from "../../src/lib/integrations/sync";

const PREFIX = "9902";
const fake = new FakeMarketplaces();
let snapshot: Awaited<ReturnType<typeof snapshotIntegrations>>;
const T0 = Math.floor(Date.now() / 1000) - 86400;
const id = (n: number) => `${PREFIX}000${n}`;
const iso = (unix: number) => new Date(unix * 1000).toISOString();

async function failure(extId: string) {
  const { data } = await db.from("sync_failures").select("*").eq("external_order_id", extId).maybeSingle();
  return data;
}
async function orderCount() {
  const { count } = await db.from("orders").select("id", { count: "exact", head: true }).like("external_order_id", `${PREFIX}%`);
  return count;
}
async function latestLog() {
  const { data } = await db.from("sync_logs").select("*").eq("provider", "etsy").order("started_at", { ascending: false }).limit(1).single();
  return data!;
}

describe("failed order recovery", () => {
  before(async () => {
    snapshot = await snapshotIntegrations();
    fake.install();
    await cleanupTestOrders(PREFIX);
    installFaultInjection();
    await connectFakeEtsy();
    fake.etsyReceipts = [1, 2, 3, 4, 5].map((n) => etsyReceipt(id(n), T0 + n * 60));
  });
  after(async () => {
    fake.uninstall();
    removeFaultInjection();
    await cleanupTestOrders(PREFIX);
    await snapshot.restore();
  });

  it("records the failed order, imports the rest, and holds the cursor", async () => {
    setFault([id(3)]);
    const r = await runSync("etsy", "manual", null);
    assert.equal(r.status, "partial");
    assert.equal(r.created, 4);
    assert.equal(r.failed, 1);
    assert.equal(await orderCount(), 4);

    const f = await failure(id(3));
    assert.ok(f, "failure recorded");
    assert.equal(f!.attempts, 1);
    assert.equal(f!.resolved_at, null);
    assert.match(f!.last_error, /Injected test failure/);
    assert.equal((f!.payload as { order: { external_order_id: string } }).order.external_order_id, id(3), "payload stored for retry");

    const integration = await integrationRow("etsy");
    assert.equal(Date.parse(integration.sync_cursor!), (T0 + 180) * 1000, "cursor held at the failed order, not past it");

    const log = await latestLog();
    assert.equal(log.orders_failed, 1);
    assert.equal(log.failures_outstanding, 1);
    assert.equal((log.error_details as { failures: { external_order_id: string; attempts: number }[] }).failures[0]!.external_order_id, id(3));
  });

  it("retries on the next run, counts repeated failures, and never duplicates successful orders", async () => {
    const r = await runSync("etsy", "manual", null);
    assert.equal(r.created, 0);
    assert.equal(r.failed, 1);
    assert.equal((await failure(id(3)))!.attempts, 2, "repeated failure visible");
    assert.equal(await orderCount(), 4, "no duplicates");
    const log = await latestLog();
    assert.equal((log.error_details as { failures: { attempts: number }[] }).failures[0]!.attempts, 2);
  });

  it("a successful retry clears the failure and the cursor then advances", async () => {
    setFault([]);
    const r = await runSync("etsy", "manual", null);
    assert.equal(r.status, "success", r.message);
    assert.equal(r.created, 1);
    assert.equal(r.recovered, 1);
    assert.equal(r.outstanding, 0);
    const f = await failure(id(3));
    assert.ok(f!.resolved_at, "failure resolved");
    assert.ok(f!.resolved_sync_log_id);
    assert.equal(await orderCount(), 5);
    const { count: jobs } = await db
      .from("production_jobs")
      .select("id, order:orders!inner(external_order_id)", { count: "exact", head: true })
      .like("order.external_order_id", `${PREFIX}%`);
    assert.equal(jobs, 5, "exactly one job per order line");
    const integration = await integrationRow("etsy");
    assert.equal(Date.parse(integration.sync_cursor!), (T0 + 300) * 1000);
    assert.equal(integration.last_error, null);
    const log = await latestLog();
    assert.equal(log.orders_recovered, 1);
    assert.equal(log.failures_outstanding, 0);
  });

  it(`stops holding the cursor after ${FAILURE_CURSOR_HOLD_ATTEMPTS} attempts but keeps retrying from the stored payload`, async () => {
    fake.etsyReceipts.push(etsyReceipt(id(6), T0 + 600), etsyReceipt(id(7), T0 + 3600));
    setFault([id(6)]);
    for (let attempt = 1; attempt <= FAILURE_CURSOR_HOLD_ATTEMPTS; attempt++) {
      await runSync("etsy", "manual", null);
      assert.equal((await failure(id(6)))!.attempts, attempt);
      assert.equal(Date.parse((await integrationRow("etsy")).sync_cursor!), (T0 + 600) * 1000, `cursor held on attempt ${attempt}`);
    }
    // Attempt 4: no longer holds the cursor.
    await runSync("etsy", "manual", null);
    assert.equal((await failure(id(6)))!.attempts, FAILURE_CURSOR_HOLD_ATTEMPTS + 1);
    assert.equal(Date.parse((await integrationRow("etsy")).sync_cursor!), (T0 + 3600) * 1000, "cursor released");

    // Next run: order 6 is outside the fetch window, so it's retried from storage.
    const r = await runSync("etsy", "manual", null);
    assert.equal(r.retried, 1);
    assert.equal((await failure(id(6)))!.attempts, FAILURE_CURSOR_HOLD_ATTEMPTS + 2);
    const log = await latestLog();
    assert.ok((log.warnings as { code: string }[]).some((w) => w.code === "failures_parked"), "parked failures surfaced as a warning");

    setFault([]);
    const fixed = await runSync("etsy", "manual", null);
    assert.equal(fixed.retried, 1);
    assert.equal(fixed.recovered, 1);
    assert.ok((await failure(id(6)))!.resolved_at);
    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("external_order_id", id(6));
    assert.equal(count, 1);
  });

  it("a whole-run failure keeps the cursor at the last fully processed point", async () => {
    const before = (await integrationRow("etsy")).sync_cursor;
    fake.etsyReceipts.push(etsyReceipt(id(8), Math.floor(Date.now() / 1000)));
    const original = fake.etsyReceipts;
    // Break the API: every request now returns 500 (retries exhaust).
    Object.defineProperty(fake, "etsyReceipts", { get: () => { throw new Error("Etsy is down"); }, configurable: true });
    const r = await runSync("etsy", "manual", null);
    Object.defineProperty(fake, "etsyReceipts", { value: original, writable: true, configurable: true });
    assert.equal(r.status, "failed");
    const integration = await integrationRow("etsy");
    assert.equal(integration.status, "error");
    assert.equal(integration.sync_cursor, before, "cursor unchanged");
    // Recovery on the next healthy run.
    await db.from("integrations").update({ next_sync_at: null }).eq("provider", "etsy");
    const ok = await runSync("etsy", "manual", null);
    assert.equal(ok.status, "success");
    assert.equal((await integrationRow("etsy")).status, "connected");
    assert.equal(iso(Date.parse((await integrationRow("etsy")).sync_cursor!) / 1000), iso(fake.etsyReceipts.at(-1)!.updated_timestamp!));
  });
});
