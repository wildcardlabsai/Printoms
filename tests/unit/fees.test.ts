import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyEtsyLedger, etsyOrderFees, shopifyOrderFees } from "../../src/lib/integrations/fees";

const gbp = (p: number) => ({ amount: p, divisor: 100, currency_code: "GBP" });

describe("Etsy ledger classification", () => {
  it("treats money movements as not fees", () => {
    for (const t of ["payment", "PAYMENT", "disbursement", "DEPOSIT", "refund", "recoupment", "reserve", "bill_payment", null]) {
      assert.equal(classifyEtsyLedger({ ledger_type: t }).isFee, false, String(t));
    }
  });
  it("classifies seller fees", () => {
    const k = (t: string) => classifyEtsyLedger({ ledger_type: t }).kind;
    assert.equal(k("transaction"), "transaction");
    assert.equal(k("shipping_transaction"), "transaction");
    assert.equal(k("listing"), "listing");
    assert.equal(k("renew_sold"), "listing");
    assert.equal(k("PAYMENT_PROCESSING_FEE"), "processing");
    assert.equal(k("offsite_ads_fee"), "advertising");
    assert.equal(k("vat_seller_services"), "tax_on_fees");
    assert.equal(k("shipping_label"), "shipping_label");
    assert.equal(k("regulatory_operating_fee"), "other");
  });
});

describe("Etsy order fees", () => {
  const payment = { payment_id: 1, receipt_id: 9, amount_fees: gbp(85), posted_fees: gbp(85), adjusted_fees: null };
  it("is actual only with the processing fee AND sale fees from the ledger; never counts processing twice", () => {
    const f = etsyOrderFees([payment], [
      { entry_id: 10, amount: -169, currency: "GBP", ledger_type: "transaction", reference_type: "transaction", reference_id: "91" },
      { entry_id: 11, amount: -16, currency: "GBP", ledger_type: "listing", reference_type: "transaction", reference_id: "91" },
      { entry_id: 12, amount: -85, currency: "GBP", ledger_type: "PAYMENT_PROCESSING_FEE", reference_type: "receipt", reference_id: "9" },
      { entry_id: 13, amount: 2000, currency: "GBP", ledger_type: "payment", reference_type: "receipt", reference_id: "9" },
    ]);
    assert.equal(f.basis, "actual");
    assert.equal(f.lines.length, 4, "payment line is not a fee");
    const counted = f.lines.filter((l) => l.counted).reduce((s, l) => s + l.amount, 0);
    assert.equal(Math.round(counted * 100) / 100, 2.7);
    assert.equal(f.lines.find((l) => l.external_ref === "ledger:12")!.counted, false, "duplicate processing kept but not counted");
  });
  it("uses the refund-adjusted fee when there is one; processing alone is only partial", () => {
    const f = etsyOrderFees([{ ...payment, adjusted_fees: gbp(40) }], []);
    assert.equal(f.basis, "partial");
    assert.equal(f.lines[0]!.amount, 0.4);
    assert.equal(etsyOrderFees([], []).basis, "unavailable");
  });
});

describe("Shopify order fees", () => {
  const fee = (id: string, amount: string, tax?: string) => ({ id, type: "payment_processing", rateName: "Online card rate", amount: { amount, currencyCode: "GBP" }, taxAmount: tax ? { amount: tax, currencyCode: "GBP" } : null });
  it("Shopify Payments fees are actual, including tax on fees", () => {
    const f = shopifyOrderFees([{ id: "t1", kind: "SALE", status: "SUCCESS", gateway: "shopify_payments", fees: [fee("f1", "0.75", "0.15")] }]);
    assert.equal(f.basis, "actual");
    assert.deepEqual(f.lines.map((l) => [l.kind, l.amount]), [["processing", 0.75], ["tax_on_fees", 0.15]]);
  });
  it("orders paid outside Shopify Payments, or failed transactions, aren't actual", () => {
    assert.equal(shopifyOrderFees([{ id: "t", kind: "SALE", status: "SUCCESS", gateway: "paypal", fees: [] }]).basis, "unavailable");
    assert.equal(shopifyOrderFees([{ id: "t", kind: "SALE", status: "FAILURE", gateway: "shopify_payments", fees: [fee("x", "1")] }]).lines.length, 0);
  });
});
