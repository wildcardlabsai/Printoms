/**
 * Duplicate prevention under retries, concurrency and stale data.
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, snapshotIntegrations } from "../helpers/db";
import { connectFakeEtsy } from "../helpers/connect";
import { FakeMarketplaces, etsyReceipt } from "../helpers/fake-marketplaces";
import { mapEtsyReceipt } from "../../src/lib/integrations/etsy/mapper";
import { runSync } from "../../src/lib/integrations/sync";
import type { Json } from "../../src/types/database";

const PREFIX = "9904";
const fake = new FakeMarketplaces();
let snapshot: Awaited<ReturnType<typeof snapshotIntegrations>>;
const T0 = Math.floor(Date.now() / 1000) - 7200;

const ingest = (receipt: ReturnType<typeof etsyReceipt>, force = false) => {
  const n = mapEtsyReceipt(receipt, 3);
  return db.rpc("ingest_marketplace_order", { p_source: "etsy", p_order: n.order as unknown as Json, p_items: n.items as unknown as Json, p_force: force });
};
const countFor = async (extId: string) => {
  const o = await db.from("orders").select("id", { count: "exact", head: true }).eq("external_order_id", extId);
  const j = await db.from("production_jobs").select("id, order:orders!inner(external_order_id)", { count: "exact", head: true }).eq("order.external_order_id", extId);
  return { orders: o.count, jobs: j.count };
};

describe("duplicate prevention", () => {
  before(async () => {
    snapshot = await snapshotIntegrations();
    fake.install();
    await cleanupTestOrders(PREFIX);
  });
  after(async () => {
    fake.uninstall();
    await cleanupTestOrders(PREFIX);
    await snapshot.restore();
  });

  it("five concurrent ingests of the same order create one order and one job", async () => {
    const r = etsyReceipt(`${PREFIX}0001`, T0);
    const results = await Promise.all(Array.from({ length: 5 }, () => ingest(r)));
    results.forEach((x) => assert.equal(x.error, null, x.error?.message));
    assert.deepEqual(await countFor(`${PREFIX}0001`), { orders: 1, jobs: 1 });
  });

  it("forced re-ingest never duplicates, and a new line item gets exactly one new job", async () => {
    const r = etsyReceipt(`${PREFIX}0002`, T0);
    await ingest(r);
    await ingest(r, true);
    await ingest(r, true);
    assert.deepEqual(await countFor(`${PREFIX}0002`), { orders: 1, jobs: 1 });
    r.transactions.push({ ...r.transactions[0]!, transaction_id: Number(`${PREFIX}000299`) });
    r.updated_timestamp = T0 + 60;
    await ingest(r);
    await ingest(r, true);
    assert.deepEqual(await countFor(`${PREFIX}0002`), { orders: 1, jobs: 2 });
  });

  it("a stale payload (e.g. an old retry) never overwrites newer marketplace data", async () => {
    const newer = etsyReceipt(`${PREFIX}0003`, T0 + 600, { message_from_buyer: "newest note" });
    const stale = etsyReceipt(`${PREFIX}0003`, T0, { message_from_buyer: "old note" });
    await ingest(newer);
    const { data } = await ingest(stale);
    assert.equal((data as { result: string }).result, "unchanged");
    const { data: o } = await db.from("orders").select("customer_note, marketplace_updated_at").eq("external_order_id", `${PREFIX}0003`).single();
    assert.equal(o!.customer_note, "newest note");
    assert.equal(Date.parse(o!.marketplace_updated_at!), (T0 + 600) * 1000);
  });

  it("overlapping sync runs are refused by the lock", async () => {
    await connectFakeEtsy();
    fake.etsyReceipts = Array.from({ length: 20 }, (_, i) => etsyReceipt(`${PREFIX}1${String(i).padStart(3, "0")}`, T0 + i));
    const [a, b] = await Promise.all([runSync("etsy", "manual", null), runSync("etsy", "scheduled", null)]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, ["skipped", "success"]);
    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).like("external_order_id", `${PREFIX}1%`);
    assert.equal(count, 20);
  });
});
