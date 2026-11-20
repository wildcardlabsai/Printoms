/**
 * "Add Vinted sale" form: builds the same order the Vinted import would.
 * Test sales use keys 99170000-… and references TEST9917…; cleaned up after.
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db } from "../helpers/db";
import { jobsFor, orderBy, rpc } from "../helpers/fixtures";
import { buildVintedSale } from "../../src/lib/integrations/vinted/manual-sale";
import { vintedSaleSchema, type VintedSaleInput } from "../../src/lib/validation/vinted-sale";
import type { Json } from "../../src/types/database";

const key = (n: number) => `99170000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let product: { id: string; name: string; sku: string };

async function add(input: Partial<VintedSaleInput>) {
  const v = vintedSaleSchema.parse({ key: key(1), sale_date: "2026-11-18", status: "to_make", buyer: "", reference: "", note: "", items: [], ...input });
  const sale = buildVintedSale(v, [product], 3, new Date("2026-11-20T10:00:00Z"));
  await rpc("ingest_marketplace_order", { p_source: "vinted", p_order: sale.order as unknown as Json, p_items: sale.items as unknown as Json, p_actor_label: "Test", p_force: false });
  return sale;
}
const item = (over = {}) => ({ product_id: "", title: "Cat planter", quantity: 1, price: "10", personalisation: "", ...over });

describe("add Vinted sale", () => {
  before(async () => {
    await cleanupTestOrders("vinted-app-99170000");
    await cleanupTestOrders("vinted-app-ref-test9917");
    await db.from("products").delete().eq("sku", "TVS-LAMP");
    product = (await db.from("products").insert({ name: "TVS Moon Lamp", sku: "TVS-LAMP" }).select("id, name, sku").single()).data!;
  });
  after(async () => {
    await cleanupTestOrders("vinted-app-99170000");
    await cleanupTestOrders("vinted-app-ref-test9917");
    await db.from("products").delete().eq("id", product.id);
  });

  it("validates prices and items", () => {
    const base = { key: key(9), sale_date: "2026-11-18", status: "to_make", buyer: "", reference: "", note: "" };
    assert.equal(vintedSaleSchema.parse({ ...base, items: [item({ price: "£12.50" })] }).items[0]!.price, 12.5);
    assert.equal(vintedSaleSchema.safeParse({ ...base, items: [item({ price: "0" })] }).success, false);
    assert.equal(vintedSaleSchema.safeParse({ ...base, items: [] }).success, false);
    assert.equal(vintedSaleSchema.safeParse({ ...base, key: "not-a-uuid", items: [item()] }).success, false);
  });

  it("a sale to make goes onto the board, linked to the chosen product", async () => {
    const sale = await add({ key: key(1), items: [item({ product_id: product.id, title: "", quantity: 2, price: "18", personalisation: "Name: Ava" })] });
    const o = await orderBy(sale.externalId);
    assert.deepEqual([o.source, o.status, Number(o.total), o.customer_name], ["vinted", "new", 18, "Vinted buyer"]);
    const [job] = await jobsFor(sale.externalId);
    assert.equal(job!.stage, "new_order");
    assert.equal(job!.quantity, 2);
    assert.equal(job!.product_id, product.id, "linked via the product's SKU");
    assert.equal(job!.item?.personalisation, "Name: Ava");
    const { data: line } = await db.from("order_items").select("title, sku").eq("order_id", o.id).single();
    assert.deepEqual(line, { title: "TVS Moon Lamp", sku: "TVS-LAMP" }, "product name used when no title typed");
  });

  it("submitting the same form twice never duplicates the sale", async () => {
    const sale = await add({ key: key(1), items: [item({ product_id: product.id, title: "", quantity: 2, price: "18", personalisation: "Name: Ava" })] });
    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("external_order_id", sale.externalId);
    assert.equal(count, 1);
    assert.equal((await jobsFor(sale.externalId)).length, 1);
  });

  it("a delivered bundle is recorded as completed with both lines", async () => {
    const sale = await add({ key: key(2), status: "delivered", items: [item({ title: "Knocker", price: "12" }), item({ title: "Planter", price: "9" })] });
    const o = await orderBy(sale.externalId);
    assert.deepEqual([o.status, Number(o.total)], ["completed", 21]);
    const { count } = await db.from("order_items").select("id", { count: "exact", head: true }).eq("order_id", o.id);
    assert.equal(count, 2);
  });

  it("the same buyer username is one customer; a Vinted reference gives a stable ID", async () => {
    const a = await add({ key: key(3), buyer: "@CatLover22", items: [item()] });
    const b = await add({ key: key(4), buyer: "catlover22", reference: "TEST9917-555", items: [item()] });
    assert.equal(b.externalId, "vinted-app-ref-test9917-555");
    assert.equal(b.order.external_order_number, "TEST9917-555");
    const [oa, ob] = [await orderBy(a.externalId), await orderBy(b.externalId)];
    assert.equal(oa.customer_id, ob.customer_id);
    assert.equal(oa.customer_name, "CatLover22");
  });
});
