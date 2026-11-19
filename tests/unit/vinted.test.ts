import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseVintedToken, signVintedRequest } from "../../src/lib/integrations/vinted/client";
import { mapVintedOrder, vintedIsShipped, type VintedOrder } from "../../src/lib/integrations/vinted/mapper";

describe("Vinted request signing", () => {
  it("splits the portal token into access and signing keys", () => {
    assert.deepEqual(parseVintedToken(" foo , bar "), { accessKey: "foo", signingKey: "bar" });
    assert.equal(parseVintedToken("foo"), null);
    assert.equal(parseVintedToken("a,b,c"), null);
    assert.equal(parseVintedToken(",bar"), null);
  });
  it("signs exactly like Vinted's reference script: t.METHOD.path?query.accessKey.body", () => {
    const body = '{"event_types":["ITEM_SOLD"]}';
    const header = signVintedRequest({ timestamp: 1704067200, method: "post", path: "/api/v1/webhooks?x=1", accessKey: "foo", signingKey: "bar", body });
    const expected = createHmac("sha256", "bar").update(`1704067200.POST./api/v1/webhooks?x=1.foo.${body}`).digest("hex");
    assert.equal(header, `t=1704067200,v1=${expected}`);
    // Empty bodies are signed as an empty string (trailing dot).
    const get = signVintedRequest({ timestamp: 1, method: "GET", path: "/api/v1/orders", accessKey: "k", signingKey: "s" });
    assert.equal(get, `t=1,v1=${createHmac("sha256", "s").update("1.GET./api/v1/orders.k.").digest("hex")}`);
  });
});

describe("Vinted order mapping", () => {
  const order: VintedOrder = {
    id: 555, created_at: "2026-11-18T10:00:00Z", status: "READY_TO_BE_SHIPPED", amount: 18.4, currency: "GBP",
    items: [
      { id: "11111111-2222-3333-4444-555555555555", item_reference: "LAMP-1", title: "Moon lamp", price: 15 },
      { id: "00000000-0000-0000-0000-000000000000", title: "Keyring", price: 5 },
      { id: "00000000-0000-0000-0000-000000000000", title: "Keyring", price: 5 },
    ],
    delivery_address: { name: "Sam Buyer", line_1: "1 High St", postal_code: "AB1 2CD", city: "Leeds", country_code: "GB" },
  };
  it("maps payout, address, and gives unmanaged items distinct line ids", () => {
    const n = mapVintedOrder(order, 3, "2026-11-18T12:00:00.000Z");
    assert.equal(n.order.external_order_id, "555");
    assert.equal(n.order.total, 18.4, "total is what Vinted pays the seller");
    assert.equal(n.order.subtotal, 25);
    assert.equal(n.order.customer_name, "Sam Buyer");
    assert.equal(n.order.shipping_address.postal_code, "AB1 2CD");
    assert.equal(n.order.is_fulfilled, false);
    assert.equal(n.order.items_complete, true);
    assert.deepEqual(n.items.map((i) => i.external_line_item_id), ["11111111-2222-3333-4444-555555555555", "555-2", "555-3"]);
    assert.deepEqual(n.items.map((i) => i.external_listing_id), ["11111111-2222-3333-4444-555555555555", null, null]);
    assert.equal(n.items[0]!.sku, "LAMP-1");
  });
  it("treats shipped/returned/finished statuses as fulfilled and CANCELED as cancelled", () => {
    for (const s of ["SHIPPED", "DELIVERED", "COMPLETED", "RETURN_REQUESTED", "CLOSED"] as const) assert.ok(vintedIsShipped(s), s);
    for (const s of ["CREATED", "READY_TO_BE_SHIPPED", "CANCELED"] as const) assert.ok(!vintedIsShipped(s), s);
    const c = mapVintedOrder({ ...order, status: "CANCELED" }, 3, "2026-11-18T12:00:00.000Z");
    assert.equal(c.order.marketplace_cancelled_at, "2026-11-18T12:00:00.000Z");
    assert.equal(c.order.payment_status, "voided");
  });
});
