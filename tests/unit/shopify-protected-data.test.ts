import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyGraphQLErrors,
  isProtectedCustomerDataError,
  restrictedFieldsFor,
} from "../../src/lib/integrations/shopify/protected-data";
import { mapShopifyOrder, RESTRICTED_CUSTOMER_NAME, type ShopifyOrderNode } from "../../src/lib/integrations/shopify/mapper";

const accessDenied = (path?: (string | number)[], message = "This app is not approved to access the Customer object.") => ({
  message,
  path,
  extensions: { code: "ACCESS_DENIED" },
});

describe("Shopify protected customer data detection", () => {
  it("recognises ACCESS_DENIED on protected order fields", () => {
    assert.equal(isProtectedCustomerDataError(accessDenied(["orders", "nodes", 0, "customer"])), true);
    assert.equal(isProtectedCustomerDataError(accessDenied(["orders", "nodes", 2, "shippingAddress", "address1"])), true);
  });

  it("recognises message-only errors without a code", () => {
    assert.equal(isProtectedCustomerDataError({ message: "This app is not approved to use the email field." }), true);
  });

  it("does not treat other errors as permission problems", () => {
    assert.equal(isProtectedCustomerDataError({ message: "Field 'foo' doesn't exist on type 'Order'", extensions: { code: "undefinedField" } }), false);
    assert.equal(isProtectedCustomerDataError({ message: "Internal error" }), false);
    // Access denied on a non-customer field is NOT protected customer data.
    assert.equal(isProtectedCustomerDataError(accessDenied(["orders", "nodes", 0, "lineItems"], "Access denied for lineItems field.")), false);
  });

  it("maps errors to the affected orders and fields", () => {
    const c = classifyGraphQLErrors([
      accessDenied(["orders", "nodes", 0, "customer"]),
      accessDenied(["orders", "nodes", 0, "email"], "This app is not approved to use the email field."),
      accessDenied(["orders", "nodes", 3, "shippingAddress"]),
      { message: "Throttled", extensions: { code: "OTHER" } },
    ]);
    assert.equal(c.protectedErrors.length, 3);
    assert.equal(c.otherErrors.length, 1);
    assert.deepEqual(restrictedFieldsFor(0, c.restrictedByOrder), ["customer", "email"]);
    assert.deepEqual(restrictedFieldsFor(3, c.restrictedByOrder), ["shipping_address"]);
    assert.deepEqual(restrictedFieldsFor(1, c.restrictedByOrder), []);
  });

  it("applies path-less permission errors to every order", () => {
    const c = classifyGraphQLErrors([{ message: "This app is not approved to access protected customer data.", extensions: { code: "ACCESS_DENIED" } }]);
    assert.deepEqual(restrictedFieldsFor(5, c.restrictedByOrder), ["customer", "email", "shipping_address"]);
  });
});

const baseOrder: ShopifyOrderNode = {
  id: "gid://shopify/Order/1",
  name: "#1001",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T11:00:00Z",
  cancelledAt: null,
  note: null,
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "UNFULFILLED",
  currencyCode: "GBP",
  subtotalPriceSet: { shopMoney: { amount: "10.00" } },
  totalPriceSet: { shopMoney: { amount: "12.00" } },
  totalShippingPriceSet: { shopMoney: { amount: "2.00" } },
  totalTaxSet: { shopMoney: { amount: "0" } },
  totalDiscountsSet: { shopMoney: { amount: "0" } },
  shippingLine: { title: "Tracked" },
  lineItems: {
    nodes: [
      {
        id: "gid://shopify/LineItem/1",
        title: "Planter",
        variantTitle: "Large",
        quantity: 1,
        sku: "P-1",
        originalUnitPriceSet: { shopMoney: { amount: "10.00" } },
        discountedTotalSet: { shopMoney: { amount: "10.00" } },
        customAttributes: [
          { key: "Engraving", value: "Mum" },
          { key: "Gift wrap", value: "Yes" },
          { key: "Product name", value: "ignored?" },
          { key: "_app_ref", value: "x" },
        ],
        product: { id: "gid://shopify/Product/1" },
        variant: { id: "gid://shopify/ProductVariant/1" },
      },
    ],
  },
};

describe("Shopify mapper — restricted customer data", () => {
  it("marks withheld fields as restricted instead of empty", () => {
    const m = mapShopifyOrder({ ...baseOrder, customer: null, email: null, shippingAddress: null }, 3, ["customer", "email", "shipping_address"]);
    assert.equal(m.order.customer_data_status, "restricted");
    assert.deepEqual(m.order.customer_data_restricted_fields, ["customer", "email", "shipping_address"]);
    assert.equal(m.order.customer_name, RESTRICTED_CUSTOMER_NAME);
    assert.equal(m.order.customer.external_id, null);
    assert.equal(m.items.length, 1, "line items are still imported");
  });

  it("genuinely empty fields stay 'available'", () => {
    const m = mapShopifyOrder({ ...baseOrder, customer: null, email: null, shippingAddress: null }, 3, []);
    assert.equal(m.order.customer_data_status, "available");
    assert.deepEqual(m.order.customer_data_restricted_fields, []);
    assert.equal(m.order.customer_name, "Shopify customer");
  });

  it("partial restriction keeps the fields that were supplied", () => {
    const m = mapShopifyOrder(
      {
        ...baseOrder,
        customer: null,
        email: null,
        shippingAddress: { name: "Shop Buyer A", address1: "1 High St", address2: null, city: "Leeds", province: null, zip: "LS1", countryCodeV2: "GB", phone: null },
      },
      3,
      ["customer", "email"],
    );
    assert.equal(m.order.customer_name, "Shop Buyer A");
    assert.equal(m.order.shipping_address.line1, "1 High St");
    assert.equal(m.order.customer_data_status, "restricted");
  });

  it("uses the shared classifier for line item properties and keeps originals", () => {
    const item = mapShopifyOrder({ ...baseOrder, customer: null, email: null, shippingAddress: null }, 3).items[0]!;
    assert.equal(item.personalisation, "Engraving: Mum");
    // "Product name" is not personalisation (the old /name/ rule over-matched).
    assert.deepEqual(item.variant_details.map((v) => v.name), ["Gift wrap", "Product name"]);
    assert.deepEqual((item.marketplace_options as { custom_attributes: unknown[] }).custom_attributes.length, 4);
  });
});
