import type { NormalisedOrder } from "../types";
import { addBusinessDays } from "@/lib/utils";

type Money = { shopMoney: { amount: string; currencyCode?: string } } | null;
export type ShopifyOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  email: string | null;
  note: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  currencyCode: string;
  customer: { id: string; displayName: string | null; email: string | null } | null;
  shippingAddress: {
    name: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    countryCodeV2: string | null;
    phone: string | null;
  } | null;
  subtotalPriceSet: Money;
  totalPriceSet: Money;
  totalShippingPriceSet: Money;
  totalTaxSet: Money;
  totalDiscountsSet: Money;
  shippingLine: { title: string | null } | null;
  lineItems: {
    nodes: {
      id: string;
      title: string;
      variantTitle: string | null;
      quantity: number;
      sku: string | null;
      originalUnitPriceSet: Money;
      discountedTotalSet: Money;
      customAttributes: { key: string; value: string | null }[];
      product: { id: string } | null;
      variant: { id: string } | null;
    }[];
  };
};

const amount = (m: Money) => (m ? Number(m.shopMoney.amount) || 0 : 0);

function paymentStatus(s: string | null): NormalisedOrder["order"]["payment_status"] {
  switch (s) {
    case "PAID":
      return "paid";
    case "PARTIALLY_PAID":
      return "partially_paid";
    case "PARTIALLY_REFUNDED":
      return "partially_refunded";
    case "REFUNDED":
      return "refunded";
    case "VOIDED":
      return "voided";
    case "PENDING":
    case "AUTHORIZED":
    case "EXPIRED":
      return "pending";
    default:
      return "unknown";
  }
}

const PERSONALISATION = /personali[sz]|engrav|custom text|name/i;

export function mapShopifyOrder(o: ShopifyOrderNode, defaultDispatchDays: number): NormalisedOrder {
  const a = o.shippingAddress;
  const customerName = a?.name?.trim() || o.customer?.displayName?.trim() || "Shopify customer";
  return {
    order: {
      external_order_id: o.id,
      external_order_number: o.name,
      customer: { external_id: o.customer?.id ?? null },
      customer_name: customerName,
      customer_email: o.email || o.customer?.email || null,
      shipping_address: {
        name: a?.name ?? null,
        line1: a?.address1 ?? null,
        line2: a?.address2 ?? null,
        city: a?.city ?? null,
        region: a?.province ?? null,
        postal_code: a?.zip ?? null,
        country_code: a?.countryCodeV2 ?? null,
        phone: a?.phone ?? null,
      },
      order_date: o.createdAt,
      payment_status: paymentStatus(o.displayFinancialStatus),
      marketplace_status: o.displayFinancialStatus,
      marketplace_fulfilment_status: o.displayFulfillmentStatus,
      currency: o.currencyCode,
      subtotal: amount(o.subtotalPriceSet),
      shipping_total: amount(o.totalShippingPriceSet),
      tax_total: amount(o.totalTaxSet),
      discount_total: amount(o.totalDiscountsSet),
      total: amount(o.totalPriceSet),
      customer_note: o.note?.trim() || null,
      shipping_method: o.shippingLine?.title ?? null,
      marketplace_dispatch_by: null,
      default_dispatch_by: addBusinessDays(new Date(o.createdAt), defaultDispatchDays).toISOString(),
      marketplace_updated_at: o.updatedAt,
      marketplace_cancelled_at: o.cancelledAt,
      is_fulfilled: o.displayFulfillmentStatus === "FULFILLED",
    },
    items: o.lineItems.nodes.map((li) => {
      const attrs = li.customAttributes.filter((c) => c.value && !c.key.startsWith("_"));
      const personal = attrs.filter((c) => PERSONALISATION.test(c.key));
      const rest = attrs.filter((c) => !PERSONALISATION.test(c.key));
      const unit = amount(li.originalUnitPriceSet);
      return {
        external_line_item_id: li.id,
        external_listing_id: li.product?.id ?? null,
        external_variant_id: li.variant?.id ?? null,
        sku: li.sku || null,
        title: li.title,
        variant_title: li.variantTitle && li.variantTitle !== "Default Title" ? li.variantTitle : null,
        variant_details: rest.map((c) => ({ name: c.key, value: c.value ?? "" })),
        quantity: li.quantity,
        unit_price: unit,
        total_price: amount(li.discountedTotalSet) || unit * li.quantity,
        personalisation: personal.map((c) => (personal.length > 1 ? `${c.key}: ${c.value}` : c.value)).join("\n") || null,
      };
    }),
  };
}
