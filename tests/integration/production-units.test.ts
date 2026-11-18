/**
 * Task 6 — production requirement vs print runs vs physical units.
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, sql } from "../helpers/db";
import { createTestPrinter, deleteTestPrinters, ingestEtsy, jobsFor, receiptWithItems, unitsFor } from "../helpers/fixtures";

const PREFIX = "9907";
const PRINTER_PREFIX = "TEST-P2-UNITS";
const T0 = Math.floor(Date.now() / 1000) - 3600;
let printerId: string;
let jobId: string;

const run = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await db.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as unknown;
};
const job = async () => (await db.from("production_jobs").select("*").eq("id", jobId).single()).data!;

describe("production units", () => {
  before(async () => {
    await cleanupTestOrders(PREFIX);
    await deleteTestPrinters(PRINTER_PREFIX);
    printerId = await createTestPrinter(`${PRINTER_PREFIX} A`);
    await ingestEtsy(receiptWithItems(`${PREFIX}0001`, T0, [{ tx: `${PREFIX}000101`, qty: 3, personalisation: "Amelia" }]));
    jobId = (await jobsFor(`${PREFIX}0001`))[0]!.id;
  });
  after(async () => {
    // Close any run left printing on the test printer, then remove test rows only.
    await db.from("printers").update({ status: "available", current_job_id: null, current_print_run_id: null }).eq("id", printerId);
    await cleanupTestOrders(PREFIX);
    await deleteTestPrinters(PRINTER_PREFIX);
  });

  it("creates one physical unit per item ordered", async () => {
    const units = await unitsFor(jobId);
    assert.equal(units.length, 3);
    assert.deepEqual(units.map((u) => u.status), ["pending", "pending", "pending"]);
    const j = await job();
    assert.equal(j.quantity, 3);
    assert.equal(j.quantity_pending, 3);
    assert.equal(j.quantity_printed, 0);
  });

  it("prints several units together on one plate, with a partial failure", async () => {
    const runId = (await run("start_print_run", { p_job_id: jobId, p_printer_id: printerId, p_quantity: 2 })) as string;
    let units = await unitsFor(jobId);
    assert.deepEqual(units.map((u) => u.status), ["printing", "printing", "pending"]);
    assert.equal(units[0]!.printed_personalisation, "Amelia", "personalisation snapshot taken at print start");
    const { data: r } = await db.from("print_runs").select("quantity").eq("id", runId).single();
    assert.equal(r!.quantity, 2);

    await run("finish_print_run", { p_run_id: runId, p_succeeded: true, p_failure_reason: "Layer shift", p_failed_unit_ids: [units[1]!.id] });
    units = await unitsFor(jobId);
    assert.deepEqual(units.map((u) => u.status), ["printed", "pending", "pending"]);
    assert.equal(units[1]!.failed_attempts, 1);
    const { data: done } = await db.from("print_runs").select("status, quantity_succeeded, quantity_failed, failure_reason").eq("id", runId).single();
    assert.deepEqual(done, { status: "succeeded", quantity_succeeded: 1, quantity_failed: 1, failure_reason: "Layer shift" });
    const j = await job();
    assert.equal(j.stage, "ready_to_print", "units remain, so the job goes back to Ready to Print (not QC)");
    assert.equal(j.quantity_printed, 1);
    assert.equal(j.quantity_pending, 2);
    assert.equal(j.units_failed, 1);
    const { data: printer } = await db.from("printers").select("status, current_print_run_id").eq("id", printerId).single();
    assert.deepEqual(printer, { status: "available", current_print_run_id: null });
  });

  it("reprints the remaining units on the same job, then moves to quality check", async () => {
    const { count: ordersBefore } = await db.from("orders").select("id", { count: "exact", head: true }).like("external_order_id", `${PREFIX}%`);
    const runId = (await run("start_print_run", { p_job_id: jobId, p_printer_id: printerId })) as string;
    const { data: r } = await db.from("print_runs").select("quantity, attempt_number").eq("id", runId).single();
    assert.equal(r!.quantity, 2, "defaults to every unit still to print");
    assert.equal(r!.attempt_number, 2);
    await run("finish_print_run", { p_run_id: runId, p_succeeded: true });
    const j = await job();
    assert.equal(j.stage, "quality_check");
    assert.equal(j.quantity_printed, 3);
    assert.equal(j.quantity_pending, 0);
    const { count: ordersAfter } = await db.from("orders").select("id", { count: "exact", head: true }).like("external_order_id", `${PREFIX}%`);
    assert.equal(ordersAfter, ordersBefore, "no duplicate order for the reprint");
    const { count: jobs } = await db.from("production_jobs").select("id", { count: "exact", head: true }).eq("order_item_id", j.order_item_id);
    assert.equal(jobs, 1, "no duplicate job");
  });

  it("refuses to start a print when nothing is left to print", async () => {
    await assert.rejects(run("start_print_run", { p_job_id: jobId, p_printer_id: printerId }), /Nothing left to print/);
  });

  it("a quality-check failure sends one unit back for reprinting", async () => {
    const units = await unitsFor(jobId);
    await run("record_qc_failure", { p_job_id: jobId, p_reason: "Misprinted text", p_unit_ids: [units[2]!.id] });
    const j = await job();
    assert.equal(j.stage, "ready_to_print");
    assert.equal(j.quantity_printed, 2);
    assert.equal(j.quantity_pending, 1);
    const u = (await unitsFor(jobId))[2]!;
    assert.equal(u.status, "pending");
    assert.match(u.status_reason ?? "", /QC: Misprinted text/);
  });

  it("a fully failed plate keeps every unit pending and records the failure", async () => {
    const runId = (await run("start_print_run", { p_job_id: jobId, p_printer_id: printerId })) as string;
    await run("finish_print_run", { p_run_id: runId, p_succeeded: false, p_failure_reason: "Spaghetti" });
    const { data: r } = await db.from("print_runs").select("status, quantity_failed").eq("id", runId).single();
    assert.deepEqual(r, { status: "failed", quantity_failed: 1 });
    const runId2 = (await run("start_print_run", { p_job_id: jobId, p_printer_id: printerId })) as string;
    await run("finish_print_run", { p_run_id: runId2, p_succeeded: true });
    assert.equal((await job()).stage, "quality_check");
  });

  it("history: every run is kept with its unit outcomes", async () => {
    const { data: runs } = await db.from("print_runs").select("id, status, print_run_units(outcome)").eq("production_job_id", jobId).order("started_at");
    assert.equal(runs!.length, 4);
    assert.deepEqual(runs!.map((r) => r.print_run_units.map((u) => u.outcome).sort()), [["failed", "succeeded"], ["succeeded", "succeeded"], ["failed"], ["succeeded"]]);
    const { data: activity } = await db.from("activity_log").select("action").eq("entity_id", jobId);
    for (const a of ["print.partial", "print.succeeded", "print.failed", "qc.failed"]) {
      assert.ok(activity!.some((x) => x.action === a), `${a} recorded`);
    }
  });

  it("moving to Ready to Pack marks units passed; unprinted ones are flagged honestly", async () => {
    await ingestEtsy(receiptWithItems(`${PREFIX}0002`, T0, [{ tx: `${PREFIX}000201`, qty: 2 }]));
    const j2 = (await jobsFor(`${PREFIX}0002`))[0]!;
    const r = (await run("start_print_run", { p_job_id: j2.id, p_printer_id: printerId, p_quantity: 1 })) as string;
    await run("finish_print_run", { p_run_id: r, p_succeeded: true });
    await db.from("production_jobs").update({ stage: "ready_to_pack" }).eq("id", j2.id);
    const units = await unitsFor(j2.id);
    assert.deepEqual(units.map((u) => [u.status, u.completed_without_print]), [["passed", false], ["passed", true]]);
  });

  it("quantity changes add units, cancel unprinted units first, then mark printed units surplus", async () => {
    await ingestEtsy(receiptWithItems(`${PREFIX}0003`, T0, [{ tx: `${PREFIX}000301`, qty: 2 }]));
    const j3 = (await jobsFor(`${PREFIX}0003`))[0]!;
    const r = (await run("start_print_run", { p_job_id: j3.id, p_printer_id: printerId })) as string;
    await run("finish_print_run", { p_run_id: r, p_succeeded: true });
    await db.from("production_jobs").update({ quantity: 4 }).eq("id", j3.id);
    let units = await unitsFor(j3.id);
    assert.deepEqual(units.map((u) => u.status), ["printed", "printed", "pending", "pending"]);
    await db.from("production_jobs").update({ quantity: 1 }).eq("id", j3.id);
    units = await unitsFor(j3.id);
    assert.deepEqual(units.map((u) => u.status), ["printed", "surplus", "cancelled", "cancelled"]);
    const j = (await db.from("production_jobs").select("quantity_printed, quantity_surplus").eq("id", j3.id).single()).data!;
    assert.deepEqual(j, { quantity_printed: 1, quantity_surplus: 1 });
  });

  it("existing (backfilled) jobs have exactly one active unit per required item", () => {
    const mismatches = sql(`
      select count(*) from production_jobs j
      where j.quantity <> (select count(*) from production_units u where u.production_job_id = j.id and u.status in ('pending','printing','printed','passed'))
        and j.cancelled_at is null`);
    assert.equal(mismatches, "0");
    const unlinked = sql(`select count(*) from print_runs r where not exists (select 1 from print_run_units x where x.print_run_id = r.id)`);
    assert.equal(unlinked, "0", "every historical run is linked to its units");
  });
});
