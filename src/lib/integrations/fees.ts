/**
 * Actual marketplace fees per order — pure mapping/classification (unit-tested).
 *
 * Etsy:   card processing fee from the Payment API (exact, documented) plus
 *         seller fees from the payment-account ledger that reference the
 *         order's receipt or one of its transactions. Ledger types aren't
 *         enumerated in Etsy's spec, so every line keeps Etsy's own name and
 *         the classification below is deliberately conservative.
 * Shopify: OrderTransaction.fees (only present for Shopify Payments).
 * An order's basis is "actual" only when its fees are complete; otherwise
 * profit keeps using the estimate, so missing fees never inflate profit.
 */

export type FeeKind = "processing" | "transaction" | "listing" | "shipping_label" | "advertising" | "tax_on_fees" | "other";
export type FeeLine = { kind: FeeKind; label: string; amount: number; currency: string; counted: boolean; external_ref: string; raw: Record<string, unknown> };
export type FeeBasis = "actual" | "partial" | "unavailable";
export type OrderFees = { basis: FeeBasis; lines: FeeLine[] };

// ---------- Etsy ----------

export type EtsyMoney = { amount: number; divisor: number; currency_code: string };
export type EtsyPayment = {
  payment_id: number;
  receipt_id: number;
  amount_fees?: EtsyMoney | null;
  posted_fees?: EtsyMoney | null;
  adjusted_fees?: EtsyMoney | null;
  currency?: string;
};
export type EtsyLedgerEntry = {
  entry_id: number;
  amount: number;
  currency: string;
  description?: string | null;
  ledger_type?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  create_date?: number;
};

const money = (m: EtsyMoney | null | undefined) => (m && m.divisor ? m.amount / m.divisor : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Which ledger lines are seller fees, and what kind. Money movements (payments, refunds to buyers, disbursements…) are not fees. */
export function classifyEtsyLedger(e: Pick<EtsyLedgerEntry, "ledger_type" | "description">): { isFee: boolean; kind: FeeKind } {
  const t = `${e.ledger_type ?? ""}`.toLowerCase();
  const isFee = /fee|vat|tax|listing|renew|transaction|advert|offsite|\bads?\b|_ads?\b|promot|label|postage|subscription|regulatory/.test(t);
  if (!isFee) return { isFee: false, kind: "other" };
  if (/process/.test(t)) return { isFee: true, kind: "processing" };
  if (/vat|tax/.test(t)) return { isFee: true, kind: "tax_on_fees" };
  if (/offsite|advert|\bads?\b|_ads?\b|promot/.test(t)) return { isFee: true, kind: "advertising" };
  if (/listing|renew/.test(t)) return { isFee: true, kind: "listing" };
  if (/transaction|sale/.test(t)) return { isFee: true, kind: "transaction" };
  if (/label|postage/.test(t)) return { isFee: true, kind: "shipping_label" };
  return { isFee: true, kind: "other" };
}

export function humaniseLedgerType(t: string | null | undefined) {
  const s = (t ?? "fee").replace(/[_-]+/g, " ").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Fees for one Etsy order from its payments and the ledger entries that refer
 * to its receipt or transactions.
 */
export function etsyOrderFees(payments: EtsyPayment[], ledger: EtsyLedgerEntry[]): OrderFees {
  const lines: FeeLine[] = [];
  for (const p of payments) {
    const fee = money(p.adjusted_fees) ?? money(p.posted_fees) ?? money(p.amount_fees);
    if (fee === null) continue;
    const m = p.adjusted_fees ?? p.posted_fees ?? p.amount_fees!;
    lines.push({
      kind: "processing",
      label: "Card processing fee",
      amount: round2(fee),
      currency: m.currency_code,
      counted: true,
      external_ref: `payment:${p.payment_id}:processing`,
      raw: { payment_id: p.payment_id, amount_fees: p.amount_fees ?? null, posted_fees: p.posted_fees ?? null, adjusted_fees: p.adjusted_fees ?? null },
    });
  }
  const haveProcessing = lines.length > 0;
  let saleFees = 0;
  for (const e of ledger) {
    const c = classifyEtsyLedger(e);
    if (!c.isFee) continue;
    // Debits are negative on the ledger: a positive cost to the seller.
    const counted = !(c.kind === "processing" && haveProcessing);
    if (counted && c.kind !== "processing") saleFees++;
    lines.push({
      kind: c.kind,
      label: humaniseLedgerType(e.ledger_type),
      amount: round2(-e.amount / 100),
      currency: e.currency,
      counted,
      external_ref: `ledger:${e.entry_id}`,
      raw: { ...e },
    });
  }
  const basis: FeeBasis = haveProcessing && saleFees > 0 ? "actual" : lines.length ? "partial" : "unavailable";
  return { basis, lines };
}

// ---------- Shopify ----------

export type ShopifyFeeTransaction = {
  id: string;
  kind: string;
  status: string;
  gateway: string | null;
  fees: { id: string; type: string; rateName?: string | null; flatFeeName?: string | null; amount: { amount: string; currencyCode: string }; taxAmount?: { amount: string; currencyCode: string } | null }[];
};

export function shopifyOrderFees(transactions: ShopifyFeeTransaction[]): OrderFees {
  const ok = transactions.filter((t) => t.status === "SUCCESS");
  const viaShopifyPayments = ok.some((t) => (t.kind === "SALE" || t.kind === "CAPTURE") && t.gateway === "shopify_payments");
  const lines: FeeLine[] = [];
  for (const t of ok) {
    for (const f of t.fees ?? []) {
      const name = f.rateName || f.flatFeeName || humaniseLedgerType(f.type);
      lines.push({
        kind: /tax|vat/i.test(f.type) ? "tax_on_fees" : "processing",
        label: t.kind === "REFUND" ? `${name} (refund)` : name,
        amount: round2(Number(f.amount.amount)),
        currency: f.amount.currencyCode,
        counted: true,
        external_ref: `fee:${f.id}`,
        raw: { transaction: t.id, kind: t.kind, type: f.type },
      });
      const tax = f.taxAmount ? Number(f.taxAmount.amount) : 0;
      if (tax) {
        lines.push({
          kind: "tax_on_fees",
          label: `Tax on ${name}`,
          amount: round2(tax),
          currency: f.taxAmount!.currencyCode,
          counted: true,
          external_ref: `fee:${f.id}:tax`,
          raw: { transaction: t.id },
        });
      }
    }
  }
  // Paid outside Shopify Payments (e.g. PayPal): Shopify doesn't know the fees.
  return { basis: viaShopifyPayments ? "actual" : "unavailable", lines };
}
