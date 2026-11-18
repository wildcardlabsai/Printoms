import type { NormalisedOrder } from "../types";
import { addBusinessDays } from "@/lib/utils";

/** Subset of the Etsy v3 ShopReceipt shape that PrintFlow uses. */
export type EtsyMoney = { amount: number; divisor: number; currency_code: string };
export type EtsyTransaction = {
  transaction_id: number;
  title: string | null;
  quantity: number;
  listing_id: number | null;
  product_id: number | null;
  sku: string | null;
  price: EtsyMoney;
  variations?: { formatted_name: string; formatted_value: string }[];
  expected_ship_date?: number | null;
  shipping_method?: string | null;
};
export type EtsyReceipt = {
  receipt_id: number;
  buyer_user_id: number | null;
  buyer_email?: string | null;
  name: string | null;
  first_line: string | null;
  second_line: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country_iso: string | null;
  status: string;
  is_paid: boolean;
  is_shipped: boolean;
  message_from_buyer: string | null;
  create_timestamp?: number;
  created_timestamp?: number;
  update_timestamp?: number;
  updated_timestamp?: number;
  grandtotal: EtsyMoney;
  subtotal: EtsyMoney;
  total_shipping_cost: EtsyMoney;
  total_tax_cost: EtsyMoney;
  total_vat_cost?: EtsyMoney;
  discount_amt: EtsyMoney;
  transactions: EtsyTransaction[];
};

const money = (m?: EtsyMoney | null) => (m && m.divisor ? m.amount / m.divisor : 0);
const iso = (unix?: number | null) => (unix ? new Date(unix * 1000).toISOString() : null);

function paymentStatus(r: EtsyReceipt): NormalisedOrder["order"]["payment_status"] {
  const s = r.status.toLowerCase();
  if (s.includes("fully refunded")) return "refunded";
  if (s.includes("partially refunded")) return "partially_refunded";
  if (s.includes("canceled") || s.includes("cancelled")) return "voided";
  if (r.is_paid) return "paid";
  if (s.includes("processing")) return "pending";
  return "pending";
}

const PERSONALISATION = /personali[sz]ation/i;

export function mapEtsyReceipt(r: EtsyReceipt, defaultDispatchDays: number): NormalisedOrder {
  const created = iso(r.created_timestamp ?? r.create_timestamp) ?? new Date().toISOString();
  const updated = iso(r.updated_timestamp ?? r.update_timestamp) ?? created;
  const shipDates = r.transactions.map((t) => t.expected_ship_date).filter((d): d is number => Boolean(d));
  const status = r.status.toLowerCase();
  const cancelled = status.includes("cancel");

  return {
    order: {
      external_order_id: String(r.receipt_id),
      external_order_number: String(r.receipt_id),
      customer: { external_id: r.buyer_user_id ? String(r.buyer_user_id) : null },
      customer_name: r.name?.trim() || "Etsy buyer",
      customer_email: r.buyer_email || null,
      shipping_address: {
        name: r.name,
        line1: r.first_line,
        line2: r.second_line,
        city: r.city,
        region: r.state,
        postal_code: r.zip,
        country_code: r.country_iso,
        phone: null,
      },
      order_date: created,
      payment_status: paymentStatus(r),
      marketplace_status: r.status,
      marketplace_fulfilment_status: r.is_shipped ? "shipped" : "unshipped",
      currency: r.grandtotal?.currency_code ?? "GBP",
      subtotal: money(r.subtotal),
      shipping_total: money(r.total_shipping_cost),
      tax_total: money(r.total_tax_cost) + money(r.total_vat_cost),
      discount_total: money(r.discount_amt),
      total: money(r.grandtotal),
      customer_note: r.message_from_buyer?.trim() || null,
      shipping_method: r.transactions.find((t) => t.shipping_method)?.shipping_method ?? null,
      marketplace_dispatch_by: shipDates.length ? iso(Math.min(...shipDates)) : null,
      default_dispatch_by: addBusinessDays(new Date(created), defaultDispatchDays).toISOString(),
      marketplace_updated_at: updated,
      marketplace_cancelled_at: cancelled ? updated : null,
      is_fulfilled: r.is_shipped,
    },
    items: r.transactions.map((t) => {
      const variations = t.variations ?? [];
      const personal = variations.filter((v) => PERSONALISATION.test(v.formatted_name));
      const rest = variations.filter((v) => !PERSONALISATION.test(v.formatted_name));
      const unit = money(t.price);
      return {
        external_line_item_id: String(t.transaction_id),
        external_listing_id: t.listing_id ? String(t.listing_id) : null,
        external_variant_id: t.product_id ? String(t.product_id) : null,
        sku: t.sku || null,
        title: t.title?.trim() || "Etsy item",
        variant_title: rest.map((v) => v.formatted_value).join(" / ") || null,
        variant_details: rest.map((v) => ({ name: v.formatted_name, value: v.formatted_value })),
        quantity: t.quantity,
        unit_price: unit,
        total_price: unit * t.quantity,
        personalisation: personal.map((v) => v.formatted_value).join("\n") || null,
      };
    }),
  };
}
