/**
 * Task 2 — Shopify protected customer data must not break order imports.
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, snapshotIntegrations } from "../helpers/db";
import { connectFakeShopify, integrationRow } from "../helpers/connect";
import { FakeMarketplaces } from "../helpers/fake-marketplaces";
import { runSync } from "../../src/lib/integrations/sync";
import { RESTRICTED_CUSTOMER_NAME } from "../../src/lib/integrations/shopify/mapper";

const PREFIX = "gid://shopify/Order/9905";
const fake = new FakeMarketplaces();
let snapshot: Awaited<ReturnType<typeof snapshotIntegrations>>;
const recent = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

type Opts = { id: string; updatedAt: string; total?: string; withCustomer?: boolean; email?: string | null; buyer?: string };
function node({ id, updatedAt, total = "20.00", withCustomer = true, email = "buyer@example.com", buyer = "Shop Buyer X" }: Opts) {
  const core = {
    id: `${PREFIX}${id}`, name: `#${id}`, createdAt: recent(600), updatedAt, cancelledAt: null, note: null,
    displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED", currencyCode: "GBP",
    subtotalPriceSet: { shopMoney: { amount: total } }, totalPriceSet: { shopMoney: { amount: total } },
    totalShippingPriceSet: { shopMoney: { amount: "0" } }, totalTaxSet: { shopMoney: { amount: "0" } }, totalDiscountsSet: { shopMoney: { amount: "0" } },
    shippingLine: { title: "Tracked 48" },
    lineItems: { nodes: [{ id: `gid://shopify/LineItem/9905${id}`, title: "Planter", variantTitle: null, quantity: 1, sku: null,
      originalUnitPriceSet: { shopMoney: { amount: total } }, discountedTotalSet: { shopMoney: { amount: total } },
      customAttributes: [{ key: "Engraving", value: `For ${id}` }], product: { id: "gid://shopify/Product/9" }, variant: null }] },
  };
  if (!withCustomer) return core;
  return {
    ...core,
    email,
    customer: { id: `gid://shopify/Customer/9905${id}`, displayName: buyer, email },
    shippingAddress: { name: buyer, address1: `${id} High St`, address2: null, city: "Leeds", province: null, zip: "LS1", countryCodeV2: "GB", phone: null },
  };
}
const page = (nodes: unknown[]) => ({ orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } });
const denied = (path?: (string | number)[]) => ({
  message: "This app is not approved to access the Customer object. See https://shopify.dev/docs/apps/launch/protected-customer-data for more details.",
  ...(path ? { path } : {}),
  extensions: { code: "ACCESS_DENIED" },
});

async function order(id: string) {
  const { data } = await db
    .from("orders")
    .select("id, customer_id, customer_name, customer_email, shipping_address, customer_data_status, customer_data_restricted_fields, total, production_notes, order_items(personalisation), production_jobs(id)")
    .eq("external_order_id", `${PREFIX}${id}`)
    .single();
  return data!;
}
async function latestLog() {
  const { data } = await db.from("sync_logs").select("*").eq("provider", "shopify").order("started_at", { ascending: false }).limit(1).single();
  return data!;
}

describe("Shopify protected customer data", () => {
  before(async () => {
    snapshot = await snapshotIntegrations();
    fake.install();
    await cleanupTestOrders(PREFIX);
    await connectFakeShopify();
  });
  after(async () => {
    fake.uninstall();
    await cleanupTestOrders(PREFIX);
    await snapshot.restore();
  });

  it("partial data: imports every order, marks only the withheld fields, keeps genuinely empty fields as available", async () => {
    fake.shopify = () => ({
      data: page([
        { ...node({ id: "01", updatedAt: recent(30) }), customer: null, email: null },
        node({ id: "02", updatedAt: recent(29), email: null, buyer: "Shop Buyer Two" }),
      ]),
      errors: [denied(["orders", "nodes", 0, "customer"]), { ...denied(["orders", "nodes", 0, "email"]), message: "This app is not approved to use the email field." }],
    });
    const r = await runSync("shopify", "manual", null);
    assert.equal(r.status, "success", r.message);
    assert.equal(r.created, 2);

    const o1 = await order("01");
    assert.equal(o1.customer_data_status, "restricted");
    assert.deepEqual(o1.customer_data_restricted_fields, ["customer", "email"]);
    assert.equal(o1.customer_id, null, "no placeholder customer created");
    assert.equal(o1.customer_name, "Shop Buyer X", "name taken from the address, which was available");
    assert.equal((o1.shipping_address as { line1: string }).line1, "01 High St");
    assert.equal(o1.order_items[0]!.personalisation, "Engraving: For 01", "line items imported");
    assert.ok(o1.production_jobs, "production job created");

    const o2 = await order("02");
    assert.equal(o2.customer_data_status, "available", "missing email without a permission error is genuinely empty");
    assert.equal(o2.customer_email, null);
    assert.ok(o2.customer_id);

    const log = await latestLog();
    assert.ok((log.warnings as { code: string }[]).some((w) => w.code === "customer_data_restricted"));
    assert.equal((await integrationRow("shopify")).customer_data_access, "restricted");
  });

  it("whole query rejected: falls back to a query without protected fields and imports orders as restricted", async () => {
    const { count: customersBefore } = await db.from("customers").select("id", { count: "exact", head: true });
    fake.shopifyQueries = [];
    fake.shopify = ({ query }) =>
      query.includes("PrintFlowOrdersRestricted")
        ? { data: page([node({ id: "03", updatedAt: recent(20), withCustomer: false }), node({ id: "04", updatedAt: recent(19), withCustomer: false })]) }
        : { data: null, errors: [denied()] };
    const r = await runSync("shopify", "manual", null);
    assert.equal(r.status, "success", r.message);
    assert.equal(r.created, 2);
    assert.ok(fake.shopifyQueries.some((q) => q.includes("PrintFlowOrdersRestricted")), "fallback query used");
    assert.ok(!fake.shopifyQueries.find((q) => q.includes("PrintFlowOrdersRestricted"))!.includes("shippingAddress"), "fallback requests no protected fields");

    const o3 = await order("03");
    assert.equal(o3.customer_data_status, "restricted");
    assert.deepEqual(o3.customer_data_restricted_fields, ["customer", "email", "shipping_address"]);
    assert.equal(o3.customer_name, RESTRICTED_CUSTOMER_NAME);
    assert.equal(o3.customer_id, null);
    assert.equal(o3.order_items.length, 1);
    const { count: customersAfter } = await db.from("customers").select("id", { count: "exact", head: true });
    assert.equal(customersAfter, customersBefore, "no customer records invented");
    const log = await latestLog();
    assert.match(JSON.stringify(log.warnings), /refused access to customer data/);
  });

  it("other GraphQL errors still fail the run safely without moving the cursor", async () => {
    const before = (await integrationRow("shopify")).sync_cursor;
    fake.shopify = () => ({ data: null, errors: [{ message: "Field 'bogus' doesn't exist on type 'Order'", extensions: { code: "undefinedField" } }] });
    const r = await runSync("shopify", "manual", null);
    assert.equal(r.status, "failed");
    assert.match(r.message, /bogus/);
    assert.equal((await integrationRow("shopify")).sync_cursor, before);
    await db.from("integrations").update({ status: "connected", next_sync_at: null }).eq("provider", "shopify");
  });

  it("once access is granted, restricted orders are filled in even though Shopify's timestamp hasn't changed", async () => {
    await db.from("orders").update({ production_notes: "Keep me" }).eq("external_order_id", `${PREFIX}03`);
    const { data: before } = await db.from("orders").select("marketplace_updated_at").eq("external_order_id", `${PREFIX}03`).single();
    fake.shopify = () => ({
      data: page([
        node({ id: "03", updatedAt: new Date(before!.marketplace_updated_at!).toISOString(), buyer: "Shop Buyer Three", email: "three@example.com" }),
      ]),
    });
    await db.from("integrations").update({ sync_cursor: new Date(Date.now() - 3600_000).toISOString() }).eq("provider", "shopify");
    const r = await runSync("shopify", "manual", null);
    assert.equal(r.updated, 1, r.message);
    const o3 = await order("03");
    assert.equal(o3.customer_data_status, "available");
    assert.deepEqual(o3.customer_data_restricted_fields, []);
    assert.equal(o3.customer_name, "Shop Buyer Three");
    assert.equal(o3.customer_email, "three@example.com");
    assert.ok(o3.customer_id, "customer linked once data is available");
    assert.equal(o3.production_notes, "Keep me");
    assert.equal((await integrationRow("shopify")).customer_data_access, "available");
  });

  it("if access is later withdrawn, existing customer details are never overwritten with blanks", async () => {
    fake.shopify = () => ({
      data: page([{ ...node({ id: "03", updatedAt: recent(1), total: "99.00" }), customer: null, email: null, shippingAddress: null }]),
      errors: [denied(["orders", "nodes", 0, "customer"]), denied(["orders", "nodes", 0, "email"]), denied(["orders", "nodes", 0, "shippingAddress"])],
    });
    const r = await runSync("shopify", "manual", null);
    assert.equal(r.updated, 1, r.message);
    const o3 = await order("03");
    assert.equal(Number(o3.total), 99, "marketplace order data still updates");
    assert.equal(o3.customer_name, "Shop Buyer Three");
    assert.equal(o3.customer_email, "three@example.com");
    assert.equal((o3.shipping_address as { line1: string }).line1, "03 High St");
    assert.equal(o3.customer_data_status, "available");
  });
});
