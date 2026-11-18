/**
 * Tasks 2 & 3 — cancellations, amendments and line-item reconciliation must
 * never damage production work.
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, sql } from "../helpers/db";
import {
  createTestPrinter, deleteTestPrinters, ingestEtsy, jobsFor, orderBy, receiptWithItems, reviewsFor, rpc, unitsFor,
} from "../helpers/fixtures";
import { mapShopifyOrder, type ShopifyOrderNode } from "../../src/lib/integrations/shopify/mapper";
import type { Json } from "../../src/types/database";

const PREFIX = "9908";
const PRINTER_PREFIX = "TEST-P2-RECON";
const T0 = Math.floor(Date.now() / 1000) - 7200;
let printerId: string;
let printer2: string;

const ext = (n: number) => `${PREFIX}${String(n).padStart(4, "0")}`;
const line = (n: number, l = 1) => `${ext(n)}${String(l).padStart(2, "0")}`;
/** Ingest version v of a receipt (each version gets a newer marketplace timestamp). */
const put = (n: number, v: number, items: Parameters<typeof receiptWithItems>[2], extra: Record<string, unknown> = {}) =>
  ingestEtsy(receiptWithItems(ext(n), T0 + v * 60, items, extra));
const cancel = (n: number, v: number, items: Parameters<typeof receiptWithItems>[2]) => put(n, v, items, { status: "Canceled" });
const firstJob = async (n: number) => (await jobsFor(ext(n)))[0]!;

async function finishCurrent(jobId: string, ok = true) {
  const { data: run } = await db.from("print_runs").select("id").eq("production_job_id", jobId).eq("status", "printing").single();
  await rpc("finish_print_run", { p_run_id: run!.id, p_succeeded: ok, p_failure_reason: ok ? null : "Test failure" });
}

describe("cancellations", () => {
  before(async () => {
    await cleanupTestOrders(PREFIX);
    await deleteTestPrinters(PRINTER_PREFIX);
    printerId = await createTestPrinter(`${PRINTER_PREFIX} A`);
    printer2 = await createTestPrinter(`${PRINTER_PREFIX} B`);
  });
  after(async () => {
    await db.from("printers").update({ status: "available", current_job_id: null, current_print_run_id: null }).like("name", `${PRINTER_PREFIX}%`);
    await cleanupTestOrders(PREFIX);
    await deleteTestPrinters(PRINTER_PREFIX);
  });

  it("before production: jobs are closed automatically and recorded", async () => {
    const items = [{ tx: line(1), qty: 2, personalisation: "A" }];
    await put(1, 1, items);
    await cancel(1, 2, items);
    const o = await orderBy(ext(1));
    assert.equal(o.status, "cancelled");
    assert.equal(o.requires_review, false, "nothing physical to decide on");
    const j = await firstJob(1);
    assert.ok(j.cancelled_at, "job closed");
    assert.deepEqual((await unitsFor(j.id)).map((u) => u.status), ["cancelled", "cancelled"]);
    const [r] = await reviewsFor(o.id);
    assert.equal(r!.kind, "order_cancelled");
    assert.equal(r!.severity, "info");
    assert.equal(r!.resolution, "auto_applied");
  });

  it("while queued: removed from the printer queue", async () => {
    const items = [{ tx: line(2), qty: 1 }];
    await put(2, 1, items);
    const j = await firstJob(2);
    await rpc("assign_job_to_printer", { p_job_id: j.id, p_printer_id: printerId });
    await cancel(2, 2, items);
    const { data: q } = await db.from("print_queue").select("status").eq("production_job_id", j.id);
    assert.deepEqual(q!.map((x) => x.status), ["removed"]);
    assert.ok((await firstJob(2)).cancelled_at);
    assert.match((await reviewsFor((await orderBy(ext(2))).id))[0]!.message, /removed from printer queues/);
  });

  it("during an active print: nothing disappears and a decision is required", async () => {
    const items = [{ tx: line(3), qty: 2, personalisation: "Leo" }];
    await put(3, 1, items);
    const j = await firstJob(3);
    const runId = await rpc<string>("start_print_run", { p_job_id: j.id, p_printer_id: printerId });
    await cancel(3, 2, items);

    const o = await orderBy(ext(3));
    assert.equal(o.status, "cancelled");
    assert.equal(o.requires_review, true);
    const after = await firstJob(3);
    assert.equal(after.cancelled_at, null, "job not closed — stays visible on the board");
    assert.equal(after.stage, "printing");
    assert.equal(after.printer_id, printerId, "printer assignment kept");
    const { data: p } = await db.from("printers").select("status, current_print_run_id").eq("id", printerId).single();
    assert.deepEqual(p, { status: "printing", current_print_run_id: runId });
    const [review] = await reviewsFor(o.id);
    assert.equal(review!.severity, "action_required");
    assert.match(review!.message, new RegExp(`printing on ${PRINTER_PREFIX} A`));

    // Closing jobs is refused while the print is still running.
    await assert.rejects(rpc("resolve_order_review", { p_review_id: review!.id, p_resolution: "jobs_closed" }), /print is still running/);
    // Packing is refused while the decision is open.
    await assert.rejects(rpc("mark_order_packed", { p_order_id: o.id, p_checklist: [] }), /not ready to pack|need a decision/);

    // The print can still be finished and is kept in history.
    await finishCurrent(j.id);
    await rpc("resolve_order_review", { p_review_id: review!.id, p_resolution: "jobs_closed", p_note: "Kept as stock" });
    const closed = await firstJob(3);
    assert.ok(closed.cancelled_at);
    assert.deepEqual((await unitsFor(j.id)).map((u) => u.status), ["surplus", "surplus"], "printed items kept, not discarded");
    const { data: runs } = await db.from("print_runs").select("status").eq("production_job_id", j.id);
    assert.deepEqual(runs!.map((r) => r.status), ["succeeded"]);
    assert.equal((await orderBy(ext(3))).requires_review, false);
  });

  it("after printing completed: flagged, not discarded", async () => {
    const items = [{ tx: line(4), qty: 1 }];
    await put(4, 1, items);
    const j = await firstJob(4);
    await rpc("start_print_run", { p_job_id: j.id, p_printer_id: printer2 });
    await finishCurrent(j.id);
    await cancel(4, 2, items);
    const o = await orderBy(ext(4));
    const [r] = await reviewsFor(o.id);
    assert.equal(r!.severity, "action_required");
    assert.match(r!.message, /Quality Check|printed/);
    assert.equal((await firstJob(4)).stage, "quality_check", "stage untouched");
    assert.equal((await unitsFor(j.id))[0]!.status, "printed");
  });

  it("after packing: unpack instruction, shipping blocked, history kept", async () => {
    const items = [{ tx: line(5), qty: 1 }];
    await put(5, 1, items);
    const j = await firstJob(5);
    await rpc("start_print_run", { p_job_id: j.id, p_printer_id: printer2 });
    await finishCurrent(j.id);
    await db.from("production_jobs").update({ stage: "ready_to_pack" }).eq("id", j.id);
    const o0 = await orderBy(ext(5));
    assert.equal(o0.status, "ready_to_pack");
    const shipmentId = await rpc<string>("mark_order_packed", { p_order_id: o0.id, p_checklist: [] });
    await cancel(5, 2, items);
    const o = await orderBy(ext(5));
    assert.equal(o.status, "cancelled");
    const [r] = await reviewsFor(o.id);
    assert.equal(r!.title, "Cancelled after packing");
    assert.match(r!.message, /unpack it and do not ship/);
    await assert.rejects(rpc("mark_order_dispatched", { p_order_id: o.id, p_carrier: "Royal Mail", p_tracking_number: "AB123456789GB" }), /Only packed or ready-to-pack/);
    const { data: s1 } = await db.from("shipments").select("status, packed_at").eq("id", shipmentId).single();
    assert.equal(s1!.status, "packed", "packing record kept");
    await rpc("resolve_order_review", { p_review_id: r!.id, p_resolution: "jobs_closed", p_note: "Unpacked" });
    const { data: s2 } = await db.from("shipments").select("status, packed_at").eq("id", shipmentId).single();
    assert.equal(s2!.status, "cancelled");
    assert.ok(s2!.packed_at, "packing history preserved");
  });

  it("after dispatch: status and shipping history are never overwritten", async () => {
    const items = [{ tx: line(6), qty: 1 }];
    await put(6, 1, items);
    const j = await firstJob(6);
    await db.from("production_jobs").update({ stage: "ready_to_pack" }).eq("id", j.id);
    const o0 = await orderBy(ext(6));
    await rpc("mark_order_dispatched", { p_order_id: o0.id, p_carrier: "Royal Mail", p_tracking_number: "AB123456789GB" });
    await cancel(6, 2, items);
    const o = await orderBy(ext(6));
    assert.equal(o.status, "dispatched");
    assert.equal(o.tracking_number, "AB123456789GB");
    const [r] = await reviewsFor(o.id);
    assert.equal(r!.kind, "order_cancelled_after_dispatch");
    assert.equal(r!.severity, "action_required");
  });

  it("in-app cancellation follows the same safe path", async () => {
    const items = [{ tx: line(7), qty: 1 }];
    await put(7, 1, items);
    const j = await firstJob(7);
    await rpc("start_print_run", { p_job_id: j.id, p_printer_id: printer2 });
    const o = await orderBy(ext(7));
    const res = await rpc<{ jobs_needing_decision: number }>("apply_order_cancellation", { p_order_id: o.id, p_source: "printflow", p_reason: "Customer emailed" });
    assert.equal(res.jobs_needing_decision, 1);
    assert.equal((await firstJob(7)).stage, "printing");
    await finishCurrent(j.id);
    // Re-running the cancellation is a no-op (idempotent).
    const again = await rpc<{ already_cancelled?: boolean }>("apply_order_cancellation", { p_order_id: o.id, p_source: "printflow" });
    assert.equal(again.already_cancelled, true);
    assert.equal((await reviewsFor(o.id)).length, 1);
  });

  it("a marketplace 'shipped' update never moves a printing job", async () => {
    const items = [{ tx: line(8), qty: 1 }, { tx: line(8, 2), qty: 1 }];
    await put(8, 1, items);
    const [a, b] = await jobsFor(ext(8));
    await rpc("start_print_run", { p_job_id: a!.id, p_printer_id: printerId });
    await put(8, 2, items, { is_shipped: true });
    const jobs = await jobsFor(ext(8));
    assert.equal(jobs.find((x) => x.id === a!.id)!.stage, "printing", "printing job untouched");
    assert.equal(jobs.find((x) => x.id === b!.id)!.stage, "dispatched");
    const o = await orderBy(ext(8));
    assert.equal(o.status, "dispatched");
    assert.ok((await reviewsFor(o.id)).some((r) => r.kind === "fulfilled_externally_during_production" && r.status === "open"));
    await finishCurrent(a!.id);
  });
});

describe("customer changes and line-item reconciliation", () => {
  before(async () => {
    printerId = await createTestPrinter(`${PRINTER_PREFIX} C`);
  });
  after(async () => {
    await db.from("printers").update({ status: "available", current_job_id: null, current_print_run_id: null }).like("name", `${PRINTER_PREFIX}%`);
    await cleanupTestOrders(PREFIX);
    await deleteTestPrinters(PRINTER_PREFIX);
  });

  it("personalisation changed before production: applied and recorded, nothing blocked", async () => {
    await put(20, 1, [{ tx: line(20), qty: 1, personalisation: "Ivy" }]);
    await put(20, 2, [{ tx: line(20), qty: 1, personalisation: "Ivy-Rose" }]);
    const o = await orderBy(ext(20));
    assert.equal(o.requires_review, false);
    const j = await firstJob(20);
    assert.equal(j.item.personalisation, "Ivy-Rose");
    const r = (await reviewsFor(o.id)).find((x) => x.kind === "personalisation_changed")!;
    assert.equal(r.severity, "info");
    assert.deepEqual(r.details, { before: "Ivy", after: "Ivy-Rose" });
  });

  it("personalisation changed after printing: highlighted, packing blocked, reprint on request", async () => {
    await put(21, 1, [{ tx: line(21), qty: 2, personalisation: "Noah" }]);
    const j = await firstJob(21);
    await rpc("start_print_run", { p_job_id: j.id, p_printer_id: printerId });
    await finishCurrent(j.id);
    await db.from("production_jobs").update({ stage: "ready_to_pack" }).eq("id", j.id);
    await put(21, 2, [{ tx: line(21), qty: 2, personalisation: "Noah J" }]);
    const o = await orderBy(ext(21));
    assert.equal(o.requires_review, true);
    assert.equal((await firstJob(21)).stage, "ready_to_pack", "not moved backwards automatically");
    const units = await unitsFor(j.id);
    assert.deepEqual(units.map((u) => u.printed_personalisation), ["Noah", "Noah"], "what was physically printed is kept");
    await assert.rejects(rpc("mark_order_packed", { p_order_id: o.id, p_checklist: [] }), /need a decision/);
    const r = (await reviewsFor(o.id)).find((x) => x.kind === "personalisation_changed")!;
    const res = await rpc<{ affected: number }>("resolve_order_review", { p_review_id: r.id, p_resolution: "reprint_requested" });
    assert.equal(res.affected, 2);
    const jAfter = await firstJob(21);
    assert.equal(jAfter.stage, "ready_to_print");
    assert.equal(jAfter.quantity_pending, 2);
    assert.equal((await orderBy(ext(21))).requires_review, false);
  });

  it("variation changed after printing is flagged", async () => {
    await put(22, 1, [{ tx: line(22), qty: 1, colour: "Black" }]);
    const j = await firstJob(22);
    await rpc("start_print_run", { p_job_id: j.id, p_printer_id: printerId });
    await finishCurrent(j.id);
    await put(22, 2, [{ tx: line(22), qty: 1, colour: "White" }]);
    const r = (await reviewsFor((await orderBy(ext(22))).id)).find((x) => x.kind === "variation_changed")!;
    assert.equal(r.severity, "action_required");
    assert.match(r.message, /Black → White/);
  });

  it("an added item gets exactly one new job", async () => {
    await put(23, 1, [{ tx: line(23), qty: 1 }]);
    await put(23, 2, [{ tx: line(23), qty: 1 }, { tx: line(23, 2), qty: 3, title: "Extra Planter" }]);
    const jobs = await jobsFor(ext(23));
    assert.equal(jobs.length, 2);
    assert.equal(jobs[1]!.quantity, 3);
    assert.equal((await unitsFor(jobs[1]!.id)).length, 3);
    const r = (await reviewsFor((await orderBy(ext(23))).id)).find((x) => x.kind === "item_added")!;
    assert.equal(r.severity, "info");
  });

  it("a removed item that hasn't started is closed; its row is kept, marked removed", async () => {
    await put(24, 1, [{ tx: line(24), qty: 1 }, { tx: line(24, 2), qty: 1 }]);
    await put(24, 2, [{ tx: line(24), qty: 1 }]);
    const jobs = await jobsFor(ext(24));
    const removed = jobs.find((x) => x.item.external_line_item_id === line(24, 2))!;
    assert.equal(removed.item.marketplace_status, "removed");
    assert.ok(removed.cancelled_at);
    assert.equal(jobs.length, 2, "job not deleted");
    const o = await orderBy(ext(24));
    assert.equal(o.requires_review, false);
  });

  it("a removed item that was already printed is flagged, never deleted", async () => {
    await put(25, 1, [{ tx: line(25), qty: 1 }, { tx: line(25, 2), qty: 1 }]);
    const target = (await jobsFor(ext(25))).find((x) => x.item.external_line_item_id === line(25, 2))!;
    await rpc("start_print_run", { p_job_id: target.id, p_printer_id: printerId });
    await finishCurrent(target.id);
    await put(25, 2, [{ tx: line(25), qty: 1 }]);
    const after = (await jobsFor(ext(25))).find((x) => x.id === target.id)!;
    assert.equal(after.cancelled_at, null);
    assert.equal(after.quantity_printed, 1);
    const r = (await reviewsFor((await orderBy(ext(25))).id)).find((x) => x.kind === "item_removed")!;
    assert.equal(r.severity, "action_required");
  });

  it("quantity increase before production adds units; after QC it is flagged and never moved back", async () => {
    await put(26, 1, [{ tx: line(26), qty: 1 }]);
    await put(26, 2, [{ tx: line(26), qty: 2 }]);
    let j = await firstJob(26);
    assert.equal(j.quantity, 2);
    assert.equal(j.quantity_pending, 2);
    await rpc("start_print_run", { p_job_id: j.id, p_printer_id: printerId });
    await finishCurrent(j.id);
    assert.equal((await firstJob(26)).stage, "quality_check");
    await put(26, 3, [{ tx: line(26), qty: 3 }]);
    j = await firstJob(26);
    assert.equal(j.stage, "quality_check", "not moved backwards");
    assert.equal(j.quantity, 3);
    assert.equal(j.quantity_pending, 1, "one more unit needed");
    const o = await orderBy(ext(26));
    assert.equal(o.requires_review, true);
    const r = (await reviewsFor(o.id)).find((x) => x.kind === "quantity_increased" && x.status === "open")!;
    await rpc("resolve_order_review", { p_review_id: r.id, p_resolution: "returned_to_production" });
    assert.equal((await firstJob(26)).stage, "ready_to_print");
  });

  it("quantity decrease cancels unprinted units first; printed ones become surplus and are flagged", async () => {
    await put(27, 1, [{ tx: line(27), qty: 3 }]);
    let j = await firstJob(27);
    await put(27, 2, [{ tx: line(27), qty: 2 }]);
    j = await firstJob(27);
    assert.deepEqual((await unitsFor(j.id)).map((u) => u.status), ["pending", "pending", "cancelled"]);
    let o = await orderBy(ext(27));
    assert.equal(o.requires_review, false);
    await rpc("start_print_run", { p_job_id: j.id, p_printer_id: printerId });
    await finishCurrent(j.id);
    await put(27, 3, [{ tx: line(27), qty: 1 }]);
    assert.deepEqual((await unitsFor(j.id)).map((u) => u.status), ["printed", "surplus", "cancelled"]);
    o = await orderBy(ext(27));
    assert.equal(o.requires_review, true);
    assert.match((await reviewsFor(o.id)).at(-1)!.message, /surplus — nothing was discarded/);
  });

  it("the same marketplace update received twice records nothing twice", async () => {
    await put(28, 1, [{ tx: line(28), qty: 1, personalisation: "X" }]);
    const v2 = [{ tx: line(28), qty: 2, personalisation: "Y" }, { tx: line(28, 2), qty: 1 }];
    await put(28, 2, v2);
    const o = await orderBy(ext(28));
    const before = (await reviewsFor(o.id)).length;
    const jobsBefore = (await jobsFor(ext(28))).length;
    await ingestEtsy(receiptWithItems(ext(28), T0 + 120, v2), true); // forced replay
    await put(28, 2, v2); // normal replay (skipped as unchanged)
    assert.equal((await reviewsFor(o.id)).length, before);
    assert.equal((await jobsFor(ext(28))).length, jobsBefore);
    assert.equal((await unitsFor((await firstJob(28)).id)).length, 2);
  });

  it("Shopify order edits (currentQuantity 0) remove the line", async () => {
    const node = (qty: number, updatedAt: string): ShopifyOrderNode => ({
      id: `gid://shopify/Order/${PREFIX}9`, name: "#R1", createdAt: "2026-11-18T08:00:00Z", updatedAt, cancelledAt: null, note: null,
      displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED", currencyCode: "GBP",
      customer: null, email: null, shippingAddress: null,
      subtotalPriceSet: null, totalPriceSet: { shopMoney: { amount: "10" } }, totalShippingPriceSet: null, totalTaxSet: null, totalDiscountsSet: null, shippingLine: null,
      lineItems: { pageInfo: { hasNextPage: false }, nodes: [
        { id: `gid://shopify/LineItem/${PREFIX}91`, title: "A", variantTitle: null, quantity: 1, currentQuantity: 1, sku: null, originalUnitPriceSet: { shopMoney: { amount: "5" } }, discountedTotalSet: null, customAttributes: [], product: null, variant: null },
        { id: `gid://shopify/LineItem/${PREFIX}92`, title: "B", variantTitle: null, quantity: 1, currentQuantity: qty, sku: null, originalUnitPriceSet: { shopMoney: { amount: "5" } }, discountedTotalSet: null, customAttributes: [], product: null, variant: null },
      ] },
    });
    const ingestShop = async (n: ShopifyOrderNode) => {
      const m = mapShopifyOrder(n, 3);
      await rpc("ingest_marketplace_order", { p_source: "shopify", p_order: m.order as unknown as Json, p_items: m.items as unknown as Json });
    };
    await ingestShop(node(1, "2026-11-18T09:00:00Z"));
    await ingestShop(node(0, "2026-11-18T10:00:00Z"));
    const { data: items } = await db.from("order_items").select("external_line_item_id, marketplace_status").eq("order_id", (await orderBy(`gid://shopify/Order/${PREFIX}9`)).id).order("external_line_item_id");
    assert.deepEqual(items!.map((i) => i.marketplace_status), ["active", "removed"]);
    await db.from("orders").delete().eq("external_order_id", `gid://shopify/Order/${PREFIX}9`);
  });

  it("history is preserved: no print run was removed by any change above", () => {
    const runs = Number(sql(`select count(*) from print_runs r join production_jobs j on j.id = r.production_job_id join orders o on o.id = j.order_id where o.external_order_id like '${PREFIX}%'`));
    // 21, 22, 25, 26, 27: one successful run each.
    assert.equal(runs, 5);
    const lost = sql(`select count(*) from print_runs r where r.ended_at is null and r.status <> 'printing'`);
    assert.equal(lost, "0");
  });
});
