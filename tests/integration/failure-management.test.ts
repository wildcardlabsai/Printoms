/**
 * Task 5 — failed-order management: manual retry, dismiss, reopen, history.
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, installFaultInjection, removeFaultInjection, setFault, snapshotIntegrations, sql } from "../helpers/db";
import { connectFakeEtsy, integrationRow } from "../helpers/connect";
import { FakeMarketplaces, etsyReceipt } from "../helpers/fake-marketplaces";
import { runSync } from "../../src/lib/integrations/sync";
import { retrySyncFailure } from "../../src/lib/integrations/failures";

const PREFIX = "9911";
const fake = new FakeMarketplaces();
let snapshot: Awaited<ReturnType<typeof snapshotIntegrations>>;
const T0 = Math.floor(Date.now() / 1000) - 86400;
const id = (n: number) => `${PREFIX}000${n}`;
let ownerId: string;
const ACTOR = { id: null, label: "Test Admin" };

const failure = async (extId: string) => (await db.from("sync_failures").select("*").eq("external_order_id", extId).single()).data!;
const events = async (failureId: string) =>
  ((await db.from("sync_failure_events").select("event, actor_label, actor_id, note").eq("failure_id", failureId).order("created_at")).data ?? []).map((e) => e);
const orders = async (extId: string) => (await db.from("orders").select("id").eq("external_order_id", extId)).data!.length;

/** Call an RPC as a signed-in user (real RLS / auth.uid() / is_admin checks). */
function asUser(userId: string, call: string) {
  return sql(`begin; set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true);
    select ${call}; commit;`);
}

describe("failed order management", () => {
  before(async () => {
    snapshot = await snapshotIntegrations();
    fake.install();
    await cleanupTestOrders(PREFIX);
    installFaultInjection();
    await connectFakeEtsy();
    ownerId = (await db.from("profiles").select("id").eq("role", "owner").limit(1).single()).data!.id;
    fake.etsyReceipts = [1, 2, 3].map((n) => etsyReceipt(id(n), T0 + n * 60));
    setFault([id(2), id(3)]);
    const r = await runSync("etsy", "manual", null);
    assert.equal(r.failed, 2);
  });
  after(async () => {
    fake.uninstall();
    removeFaultInjection();
    await cleanupTestOrders(PREFIX);
    await snapshot.restore();
  });

  it("a manual retry that still fails is counted and recorded in the history", async () => {
    const f = await failure(id(2));
    const r = await retrySyncFailure(f.id, ACTOR);
    assert.ok(!r.ok && /Injected test failure/.test(r.message));
    const after = await failure(id(2));
    assert.equal(after.attempts, 2);
    assert.equal(after.resolved_at, null);
    const ev = await events(f.id);
    assert.deepEqual(ev.map((e) => e.event), ["failed", "retried", "failed"]);
    assert.equal(ev[1]!.actor_label, "Test Admin");
  });

  it("a manual retry recovers the order once the cause is fixed — exactly one order", async () => {
    setFault([id(3)]);
    const f = await failure(id(2));
    const r = await retrySyncFailure(f.id, ACTOR);
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok((await failure(id(2))).resolved_at);
    assert.equal(await orders(id(2)), 1);
    assert.deepEqual((await events(f.id)).map((e) => e.event).slice(-2), ["retried", "resolved"]);
    // Retrying a resolved failure does nothing.
    const again = await retrySyncFailure(f.id, ACTOR);
    assert.ok(!again.ok && /already imported/.test(again.message));
    assert.equal(await orders(id(2)), 1);
  });

  it("only admins can dismiss, and a reason is required", async () => {
    const f = await failure(id(3));
    assert.throws(() => asUser("00000000-0000-0000-0000-000000000001", `public.dismiss_sync_failure('${f.id}', 'nope')`), /Only owners and admins/);
    assert.throws(() => asUser(ownerId, `public.dismiss_sync_failure('${f.id}', '  ')`), /Give a reason/);
    assert.equal((await failure(id(3))).dismissed_at, null);
  });

  it("a dismissed failure is not retried, does not hold the cursor, and never silently reappears", async () => {
    const f = await failure(id(3));
    asUser(ownerId, `public.dismiss_sync_failure('${f.id}', 'Test order on Etsy')`);
    const d = await failure(id(3));
    assert.ok(d.dismissed_at);
    assert.equal(d.dismissed_by, ownerId);
    assert.equal(d.dismiss_reason, "Test order on Etsy");

    // Manual retry refuses until reopened.
    const r = await retrySyncFailure(f.id, ACTOR);
    assert.ok(!r.ok && /Reopen it/.test(r.message));

    // Next sync: the marketplace still returns it and it still fails.
    await runSync("etsy", "manual", null);
    const still = await failure(id(3));
    assert.ok(still.dismissed_at, "stays dismissed");
    assert.equal(still.resolved_at, null);
    assert.equal((await events(f.id)).at(-1)!.event, "failed_while_dismissed", "the new failure is kept in history");
    const integration = await integrationRow("etsy");
    assert.equal(Date.parse(integration.sync_cursor!), (T0 + 180) * 1000, "cursor moves past the dismissed order");
    const { data: log } = await db.from("sync_logs").select("failures_outstanding").eq("provider", "etsy").order("started_at", { ascending: false }).limit(1).single();
    assert.equal(log!.failures_outstanding, 0, "dismissed failures are not counted as outstanding");
  });

  it("reopening puts it back in the retry queue; the next successful sync resolves it", async () => {
    const f = await failure(id(3));
    asUser(ownerId, `public.reopen_sync_failure('${f.id}', 'Customer confirmed it is real')`);
    const reopened = await failure(id(3));
    assert.equal(reopened.dismissed_at, null);
    assert.ok(reopened.reopened_at);
    assert.throws(() => asUser(ownerId, `public.reopen_sync_failure('${f.id}', null)`), /Only dismissed failures/);

    setFault([]);
    // The cursor already moved past it, so this proves the stored-payload retry path.
    const r = await runSync("etsy", "manual", null);
    assert.equal(r.recovered, 1, JSON.stringify(r));
    assert.ok((await failure(id(3))).resolved_at);
    assert.equal(await orders(id(3)), 1);
    const ev = await events(f.id);
    assert.deepEqual(
      ev.map((e) => e.event),
      ["failed", "dismissed", "failed_while_dismissed", "reopened", "resolved"],
    );
    assert.equal(ev.find((e) => e.event === "dismissed")!.note, "Test order on Etsy");
    assert.equal(ev.find((e) => e.event === "reopened")!.actor_id, ownerId);
  });

  it("a dismissed failure is still marked resolved if the order later imports", async () => {
    const extra = id(4);
    fake.etsyReceipts = [...fake.etsyReceipts, etsyReceipt(extra, T0 + 4 * 60)];
    setFault([extra]);
    await runSync("etsy", "manual", null);
    const f = await failure(extra);
    asUser(ownerId, `public.dismiss_sync_failure('${f.id}', 'Will check later')`);
    setFault([]);
    fake.etsyReceipts = fake.etsyReceipts.map((r) => (r.receipt_id === Number(extra) ? { ...r, updated_timestamp: T0 + 600 } : r));
    await runSync("etsy", "manual", null);
    const done = await failure(extra);
    assert.ok(done.resolved_at, "resolved");
    assert.equal(await orders(extra), 1);
  });
});
