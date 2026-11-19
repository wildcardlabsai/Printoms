/**
 * Product import from Etsy and Shopify — no duplicates, user data preserved.
 * Test products use SKU prefix TPI- / generated ETSY-9913… and listing IDs 9913….
 */
import "../helpers/env";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupTestOrders, db, snapshotIntegrations } from "../helpers/db";
import { connectFakeEtsy, connectFakeShopify } from "../helpers/connect";
import { FakeMarketplaces } from "../helpers/fake-marketplaces";
import { ingestEtsy, jobsFor, receiptWithItems } from "../helpers/fixtures";
import { runProductImport, previewProductImport } from "../../src/lib/integrations/product-import";
import type { EtsyListing } from "../../src/lib/integrations/listings";

const fake = new FakeMarketplaces();
let snapshot: Awaited<ReturnType<typeof snapshotIntegrations>>;
const ORDER = "99130001";
const listing = (id: number, title: string, skus: string[] = [], extra: Partial<EtsyListing> = {}): EtsyListing => ({
  listing_id: id, title, description: `About ${title}`, state: "active", url: `https://www.etsy.com/listing/${id}`, skus,
  price: { amount: 1500, divisor: 100, currency_code: "GBP" }, images: [{ url_570xN: `https://i.etsystatic.com/${id}.jpg` }], ...extra,
});

async function testProducts() {
  const { data } = await db.from("products").select("id, name, sku, description, base_price, image_path, product_listings(source, external_listing_id)")
    .or("sku.ilike.TPI-%,sku.ilike.ETSY-9913%,sku.ilike.SHOPIFY-9913%").order("sku");
  return data ?? [];
}
async function cleanup() {
  const products = await testProducts();
  const paths = products.map((p) => p.image_path).filter((x): x is string => Boolean(x));
  if (paths.length) await db.storage.from("product-images").remove(paths);
  await cleanupTestOrders("9913");
  if (products.length) {
    await db.from("activity_log").delete().in("entity_id", products.map((p) => p.id));
    await db.from("products").delete().in("id", products.map((p) => p.id));
  }
}

describe("product import", () => {
  let keyringId: string;
  let tagId: string;

  before(async () => {
    snapshot = await snapshotIntegrations();
    fake.install();
    await cleanup();
    await connectFakeEtsy();
    await connectFakeShopify();
    const { data: k } = await db.from("products").insert({ name: "TPI Keyring", sku: "TPI-KEYRING", description: "My own words" }).select("id").single();
    const { data: t } = await db.from("products").insert({ name: "TPI Personalised Dog Tag Necklace", sku: "TPI-TAG" }).select("id").single();
    keyringId = k!.id;
    tagId = t!.id;
    fake.etsyListings = [
      listing(99130001, "Custom keyring with any name", ["tpi-keyring"]),
      listing(99130002, "TPI Personalised Dog Tag Name Necklace"),
      listing(99130003, "TPI Lithophane Moon Lamp", ["TPI-LAMP"]),
    ];
    // An order imported BEFORE the product existed: no product on the line yet.
    const r = receiptWithItems(ORDER, Math.floor(Date.now() / 1000) - 600, [{ tx: `${ORDER}01`, qty: 1 }]);
    r.transactions[0] = { ...r.transactions[0]!, listing_id: 99130003, sku: "" };
    await ingestEtsy(r);
  });
  after(async () => {
    fake.uninstall();
    await cleanup();
    await snapshot.restore();
  });

  it("previews: SKU link, name suggestion, new product — nothing saved", async () => {
    const before = (await testProducts()).length;
    const { rows } = await previewProductImport(db, "etsy");
    const mine = rows.filter((r) => r.listing.external_listing_id.startsWith("9913"));
    assert.deepEqual(mine.map((r) => [r.listing.external_listing_id, r.reason, r.product_id]), [
      ["99130001", "sku", keyringId],
      ["99130002", "name", tagId],
      ["99130003", "new", null],
    ]);
    assert.equal((await testProducts()).length, before, "preview writes nothing");
  });

  it("imports with the reviewed decisions, fills only blank fields, copies images, links old order lines", async () => {
    const s = await runProductImport(db, "etsy", []);
    assert.equal(s.failed.length, 0, JSON.stringify(s.failed));
    assert.equal(s.created, 1);
    assert.equal(s.linked, 2);
    assert.equal(s.order_lines_linked, 1);
    const products = await testProducts();
    assert.equal(products.length, 3, "only one new product");
    const keyring = products.find((p) => p.id === keyringId)!;
    assert.equal(keyring.description, "My own words", "existing details are not overwritten");
    assert.equal(Number(keyring.base_price), 15, "blank price filled");
    const lamp = products.find((p) => p.sku === "TPI-LAMP")!;
    assert.equal(lamp.name, "TPI Lithophane Moon Lamp");
    assert.ok(lamp.image_path?.startsWith(`${lamp.id}/`), "image copied into storage");
    const job = (await jobsFor(ORDER))[0]!;
    assert.equal(job.product_id, lamp.id, "the existing job now knows its product");
    assert.equal(job.item?.quantity, 1);
  });

  it("running the import again changes nothing and creates no duplicates", async () => {
    const before = await testProducts();
    const images = fake.imageRequests.length;
    const s = await runProductImport(db, "etsy", []);
    assert.deepEqual([s.created, s.linked, s.already_linked], [0, 0, 3]);
    assert.deepEqual((await testProducts()).map((p) => [p.id, p.product_listings.length]), before.map((p) => [p.id, p.product_listings.length]));
    assert.ok(fake.imageRequests.length - images <= 1, "images only fetched for products still without one");
  });

  it("two imports at the same time still create one product", async () => {
    fake.etsyListings.push(listing(99130004, "TPI Planter Pot", ["TPI-POT"]));
    const [a, b] = await Promise.all([runProductImport(db, "etsy", []), runProductImport(db, "etsy", [])]);
    assert.equal(a.created + b.created, 1);
    assert.equal((await testProducts()).filter((p) => p.sku === "TPI-POT").length, 1);
  });

  it("respects skip and explicit link choices; a taken SKU never blocks 'create'", async () => {
    fake.etsyListings.push(listing(99130005, "TPI Skip Me"), listing(99130006, "TPI Second keyring", ["TPI-KEYRING"]));
    const s = await runProductImport(db, "etsy", [
      { external_listing_id: "99130005", action: "skip", product_id: null },
      { external_listing_id: "99130006", action: "create", product_id: null },
    ]);
    assert.equal(s.failed.length, 0, JSON.stringify(s.failed));
    const products = await testProducts();
    assert.ok(!products.some((p) => p.name === "TPI Skip Me"));
    const second = products.find((p) => p.name === "TPI Second keyring")!;
    assert.equal(second.sku, "ETSY-99130006", "generated SKU because TPI-KEYRING is taken");
  });

  it("a Shopify product with the same SKU links to the product imported from Etsy", async () => {
    fake.shopify = ({ query }) =>
      query.includes("PrintFlowProducts")
        ? { data: { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [
            { id: "gid://shopify/Product/99130010", title: "Moon Lamp", status: "ACTIVE", descriptionHtml: "<p>Lamp</p>", productType: "Lighting",
              onlineStoreUrl: null, featuredMedia: null, priceRangeV2: { minVariantPrice: { amount: "30.00", currencyCode: "GBP" } },
              variants: { nodes: [{ sku: "TPI-LAMP" }] } },
          ] } } }
        : { data: null };
    const s = await runProductImport(db, "shopify", []);
    assert.equal(s.linked, 1);
    const lamp = (await testProducts()).find((p) => p.sku === "TPI-LAMP")!;
    assert.deepEqual(lamp.product_listings.map((l) => l.source).sort(), ["etsy", "shopify"], "one product, two marketplace listings");
  });
});
