import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapEtsyReceipt, type EtsyTransaction } from "../../src/lib/integrations/etsy/mapper";
import { etsyReceipt } from "../helpers/fake-marketplaces";

const now = 1_800_000_000;

function mapWith(transaction: Partial<EtsyTransaction>) {
  const r = etsyReceipt(555, now);
  r.transactions = [{ ...r.transactions[0]!, ...transaction }];
  return mapEtsyReceipt(r, 3).items[0]!;
}

describe("Etsy receipt mapping — personalisation formats", () => {
  it("1. classic single 'Personalization' variation", () => {
    const item = mapWith({ variations: [{ formatted_name: "Personalization", formatted_value: "Amelia" }] });
    assert.equal(item.personalisation, "Amelia");
    assert.deepEqual(item.variant_details, []);
  });

  it("2. British spelling + ordinary variations", () => {
    const item = mapWith({
      variations: [
        { formatted_name: "Size", formatted_value: "Medium" },
        { formatted_name: "Personalisation", formatted_value: "The Smiths" },
        { formatted_name: "Colour", formatted_value: "Sage" },
      ],
    });
    assert.equal(item.personalisation, "The Smiths");
    assert.equal(item.variant_title, "Medium / Sage");
    assert.deepEqual(item.variant_details.map((v) => v.name), ["Size", "Colour"]);
  });

  it("3. buyer-facing questions are not treated as ordinary variations", () => {
    const item = mapWith({
      variations: [
        { formatted_name: "Name to engrave", formatted_value: "Leo" },
        { formatted_name: "Custom message", formatted_value: "Love you always" },
        { formatted_name: "Colour", formatted_value: "Black" },
      ],
    });
    assert.equal(item.personalisation, "Name to engrave: Leo\nCustom message: Love you always");
    assert.equal(item.variant_title, "Black");
  });

  it("4. optional personalisation left blank by the buyer", () => {
    const item = mapWith({ variations: [{ formatted_name: "Personalization", formatted_value: "Not requested on this item." }] });
    assert.equal(item.personalisation, null);
  });

  it("5. transaction-level personalisation (question/answer list) is read defensively", () => {
    const item = mapWith({
      variations: [{ formatted_name: "Colour", formatted_value: "White" }],
      personalization: [{ question: "Enter your name", answer: "Freya" }],
    });
    assert.equal(item.personalisation, "Enter your name: Freya");
    assert.equal(item.variant_title, "White");
  });

  it("6. no variations at all", () => {
    const item = mapWith({ variations: [] });
    assert.equal(item.personalisation, null);
    assert.equal(item.variant_title, null);
  });

  it("7. multi-line personalisation text is preserved exactly", () => {
    const item = mapWith({ variations: [{ formatted_name: "Personalization", formatted_value: "Line one\nLine two" }] });
    assert.equal(item.personalisation, "Line one\nLine two");
  });

  it("8. keeps the untouched original variation data", () => {
    const variations = [
      { property_id: 513, value_id: 1, formatted_name: "Size", formatted_value: "L" },
      { property_id: 54, value_id: null, formatted_name: "Name to engrave", formatted_value: "Ivy" },
    ];
    const item = mapWith({ variations });
    assert.deepEqual(item.marketplace_options, { variations });
    assert.equal(item.personalisation, "Name to engrave: Ivy");
  });

  it("maps money, cancellation and shipped state", () => {
    const r = etsyReceipt(777, now, { status: "Canceled", is_shipped: true });
    const m = mapEtsyReceipt(r, 3);
    assert.equal(m.order.total, 25.95);
    assert.ok(m.order.marketplace_cancelled_at);
    assert.equal(m.order.is_fulfilled, true);
    assert.equal(m.order.customer_data_status, "available");
  });
});
