import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapEtsyListing, mapShopifyProduct, nameSimilarity, planImport } from "../../src/lib/integrations/listings";
import { isAllowedImageUrl } from "../../src/lib/integrations/product-import";

describe("listing mappers", () => {
  it("maps an Etsy listing", () => {
    const l = mapEtsyListing({
      listing_id: 123, title: "  Name &amp; Date   Sign ", description: "Line 1\r\n\n\n\nLine 2", state: "active",
      url: "https://www.etsy.com/listing/123", skus: [" SIGN-1 ", "sign-1", "", "SIGN-2"],
      price: { amount: 1999, divisor: 100, currency_code: "GBP" }, has_variations: true,
      images: [{ url_570xN: "https://i.etsystatic.com/a.jpg" }],
    });
    assert.deepEqual(
      { id: l.external_listing_id, title: l.title, desc: l.description, skus: l.skus, price: l.price, img: l.image_url, active: l.is_active },
      { id: "123", title: "Name & Date Sign", desc: "Line 1\n\nLine 2", skus: ["SIGN-1", "SIGN-2"], price: 19.99, img: "https://i.etsystatic.com/a.jpg", active: true },
    );
  });
  it("maps a Shopify product (HTML stripped, variant SKUs collected, draft = inactive)", () => {
    const p = mapShopifyProduct({
      id: "gid://shopify/Product/9", title: "Lamp", status: "DRAFT", descriptionHtml: "<p>Warm <b>light</b></p><p>Two</p>",
      productType: "Lighting", onlineStoreUrl: null, featuredMedia: { preview: { image: { url: "https://cdn.shopify.com/l.png" } } },
      priceRangeV2: { minVariantPrice: { amount: "24.5", currencyCode: "GBP" } }, variants: { nodes: [{ sku: "LAMP-S" }, { sku: null }, { sku: "LAMP-L" }] },
    });
    assert.equal(p.description, "Warm light\nTwo");
    assert.deepEqual(p.skus, ["LAMP-S", "LAMP-L"]);
    assert.equal(p.price, 24.5);
    assert.equal(p.is_active, false);
    assert.equal(p.category, "Lighting");
  });
});

describe("import matching", () => {
  const base = { description: null, url: null, price: null, currency: null, image_url: null, category: null, is_active: true, variant_count: 1 };
  const products = [
    { id: "p1", name: "Personalised Keyring", sku: "KEY-1" },
    { id: "p2", name: "Personalised Dog Tag Necklace", sku: "TAG-1" },
  ];
  it("prefers an existing link, then SKU, then a close name, else create", () => {
    const rows = planImport(
      [
        { ...base, external_listing_id: "L0", title: "Anything", skus: ["KEY-1"] },
        { ...base, external_listing_id: "L1", title: "Totally different", skus: ["key-1"] },
        { ...base, external_listing_id: "L2", title: "Personalised Dog Tag Name Necklace", skus: [] },
        { ...base, external_listing_id: "L3", title: "Lithophane Lamp", skus: ["LAMP"] },
      ],
      products,
      [{ external_listing_id: "L0", product_id: "p2" }],
    );
    assert.deepEqual(rows.map((r) => [r.reason, r.action, r.product_id]), [
      ["already_linked", "keep", "p2"],
      ["sku", "link", "p1"],
      ["name", "link", "p2"],
      ["new", "create", null],
    ]);
  });
  it("does not treat loosely similar names as the same product", () => {
    assert.ok(nameSimilarity("Personalised Keyring", "Personalised Dog Tag Necklace") < 0.6);
    assert.ok(nameSimilarity("Dog Tag Necklace", "dog tag necklace!") === 1);
  });
  it("only downloads images from marketplace image hosts over https", () => {
    assert.ok(isAllowedImageUrl("https://i.etsystatic.com/123/r/il/abc.jpg"));
    assert.ok(isAllowedImageUrl("https://cdn.shopify.com/s/files/1/x.png"));
    assert.ok(!isAllowedImageUrl("http://i.etsystatic.com/a.jpg"));
    assert.ok(!isAllowedImageUrl("https://evil.example.com/etsystatic.com.jpg"));
    assert.ok(!isAllowedImageUrl("https://169.254.169.254/latest"));
  });
});
