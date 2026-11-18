/**
 * Task 5 — full resynchronisation preserves workshop data and never duplicates.
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, snapshotIntegrations } from "../helpers/db";
import { connectFakeEtsy, integrationRow } from "../helpers/connect";
import { FakeMarketplaces, etsyReceipt } from "../helpers/fake-marketplaces";
import { runSync } from "../../src/lib/integrations/sync";

const PREFIX = "9903";
const fake = new FakeMarketplaces();
let snapshot: Awaited<ReturnType<typeof snapshotIntegrations>>;
const T0 = Math.floor(Date.now() / 1000) - 86400 * 3;
const A = `${PREFIX}0001`, B = `${PREFIX}0002`, C = `${PREFIX}0003`;

async function load(extId: string) {
  const { data } = await db
    .from("orders")
    .select("id, priority, production_notes, dispatch_by, status, order_items(id, quantity, product_id, personalisation, marketplace_options, production_jobs(id, stage, printer_id, quantity))")
    .eq("external_order_id", extId)
    .single();
  return data!;
}
async function counts() {
  const orders = await db.from("orders").select("id", { count: "exact", head: true }).like("external_order_id", `${PREFIX}%`);
  const jobs = await db.from("production_jobs").select("id, order:orders!inner(external_order_id)", { count: "exact", head: true }).like("order.external_order_id", `${PREFIX}%`);
  const items = await db.from("order_items").select("id, order:orders!inner(external_order_id)", { count: "exact", head: true }).like("order.external_order_id", `${PREFIX}%`);
  return { orders: orders.count, jobs: jobs.count, items: items.count };
}

describe("full resynchronisation", () => {
  let runId: string;
  let printerId: string;
  let ownerId: string;
  let productId: string;

  before(async () => {
    snapshot = await snapshotIntegrations();
    fake.install();
    await cleanupTestOrders(PREFIX);
    await connectFakeEtsy();
    fake.etsyReceipts = [
      etsyReceipt(A, T0 + 60, { transactions: [{ ...etsyReceipt(A, 0).transactions[0]!, variations: [{ formatted_name: "Name to engrave", formatted_value: "Leo" }] }] }),
      etsyReceipt(B, T0 + 120),
      etsyReceipt(C, T0 + 180),
    ];
    const r = await runSync("etsy", "manual", null);
    assert.equal(r.created, 3);

    const { data: owner } = await db.from("profiles").select("id").eq("role", "owner").limit(1).single();
    ownerId = owner!.id;
    const { data: printer } = await db.from("printers").select("id").eq("status", "available").eq("is_active", true).limit(1).single();
    printerId = printer!.id;
    const { data: product } = await db.from("products").select("id").limit(1).single();
    productId = product!.id;

    // Workshop state on order A: notes, priority, deadline, a live print.
    const a = await load(A);
    await db.from("orders").update({ production_notes: "Use the gold PLA", priority: "urgent", dispatch_by: "2030-01-01T17:00:00Z" }).eq("id", a.id);
    await db.from("internal_notes").insert({ entity_type: "order", entity_id: a.id, body: "Customer called about colour", author_id: ownerId });
    const jobA = a.order_items[0]!.production_jobs!.id;
    const { data: run, error } = await db.rpc("start_print_run", { p_job_id: jobA, p_printer_id: printerId });
    assert.equal(error, null, error?.message);
    runId = run as string;

    // Order B: further along, with a manual product mapping.
    const b = await load(B);
    await db.from("production_jobs").update({ stage: "quality_check" }).eq("id", b.order_items[0]!.production_jobs!.id);
    await db.from("order_items").update({ product_id: productId }).eq("id", b.order_items[0]!.id);

    // Order C: imported by an older mapper that missed the personalisation.
    const c = await load(C);
    await db.from("order_items").update({ personalisation: null, marketplace_options: null }).eq("id", c.order_items[0]!.id);

    // Marketplace changes order A's quantity without a timestamp change.
    fake.etsyReceipts[0]!.transactions[0]!.quantity = 2;
  });

  after(async () => {
    if (runId) await db.rpc("finish_print_run", { p_run_id: runId, p_succeeded: true });
    fake.uninstall();
    await db.from("internal_notes").delete().eq("body", "Customer called about colour");
    await cleanupTestOrders(PREFIX);
    await snapshot.restore();
  });

  it("an ordinary sync does not re-apply unchanged marketplace data", async () => {
    await runSync("etsy", "manual", null);
    const c = await load(C);
    assert.equal(c.order_items[0]!.personalisation, null, "normal sync skips orders whose timestamp hasn't changed");
  });

  it("re-applies marketplace data, preserves workshop data, and creates no duplicates", async () => {
    const cursorBefore = (await integrationRow("etsy")).sync_cursor;
    const countsBefore = await counts();
    const startedAt = new Date().toISOString();

    const r = await runSync("etsy", "resync", ownerId, undefined, { mode: "resync", since: new Date((T0 - 60) * 1000) });
    assert.equal(r.status, "success", r.message);
    assert.equal(r.fetched, 3);
    assert.equal(r.created, 0);
    assert.equal(r.updated, 2, "A (quantity) and C (personalisation) changed; B did not");

    assert.deepEqual(await counts(), countsBefore, "no duplicate orders, items or jobs");

    const a = await load(A);
    assert.equal(a.production_notes, "Use the gold PLA");
    assert.equal(a.priority, "urgent");
    assert.equal(new Date(a.dispatch_by!).toISOString(), "2030-01-01T17:00:00.000Z");
    assert.equal(a.order_items[0]!.quantity, 2, "marketplace quantity updated on the item");
    assert.equal(a.order_items[0]!.production_jobs!.stage, "printing", "production progress preserved");
    assert.equal(a.order_items[0]!.production_jobs!.printer_id, printerId, "printer assignment preserved");
    assert.equal(a.order_items[0]!.production_jobs!.quantity, 1, "a job already printing keeps its quantity");
    const { data: liveRun } = await db.from("print_runs").select("status").eq("id", runId).single();
    assert.equal(liveRun!.status, "printing");
    const { count: notes } = await db.from("internal_notes").select("id", { count: "exact", head: true }).eq("entity_id", a.id);
    assert.equal(notes, 1);

    const b = await load(B);
    assert.equal(b.order_items[0]!.production_jobs!.stage, "quality_check");
    assert.equal(b.order_items[0]!.product_id, productId, "manual product mapping kept");

    const c = await load(C);
    assert.equal(c.order_items[0]!.personalisation, `Name: ${C}`, "missing personalisation restored");
    assert.ok(c.order_items[0]!.marketplace_options, "original options restored");

    assert.equal((await integrationRow("etsy")).sync_cursor, cursorBefore, "resync does not move the incremental cursor");

    const { data: log } = await db.from("sync_logs").select("trigger, status, orders_updated").eq("provider", "etsy").gte("started_at", startedAt).single();
    assert.deepEqual(log, { trigger: "resync", status: "success", orders_updated: 2 });
    const { data: activity } = await db.from("activity_log").select("action, order_id").gte("created_at", startedAt);
    assert.equal(activity!.filter((x) => x.action === "order.resynced").length, 2, "per-order history only where data changed");
    assert.ok(activity!.some((x) => x.action === "integration.resync"), "resync logged");
  });

  it("running the resync again changes nothing", async () => {
    const r = await runSync("etsy", "resync", ownerId, undefined, { mode: "resync", since: new Date((T0 - 60) * 1000) });
    assert.equal(r.created, 0);
    assert.equal(r.updated, 0);
  });
});
