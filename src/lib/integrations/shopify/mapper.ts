import type { NormalisedOrder } from "../types";
import { addBusinessDays } from "@/lib/utils";
import { splitOptions } from "../personalisation";

type Money = { shopMoney: { amount: string; currencyCode?: string } } | null;
export type ShopifyOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  email?: string | null;
  note: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  currencyCode: string;
  customer?: { id: string; displayName: string | null; email: string | null } | null;
  shippingAddress?: {
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

export const RESTRICTED_CUSTOMER_NAME = "Shopify customer (details restricted)";

/**
 * @param restrictedFields protected fields Shopify withheld for this order
 *   (e.g. ["customer","email","shipping_address"]). Withheld fields are stored
 *   as unavailable rather than as genuinely empty values.
 */
export function mapShopifyOrder(o: ShopifyOrderNode, defaultDispatchDays: number, restrictedFields: string[] = []): NormalisedOrder {
  const restricted = new Set(restrictedFields);
  const a = restricted.has("shipping_address") ? null : o.shippingAddress;
  const customer = restricted.has("customer") ? null : o.customer;
  const email = restricted.has("email") ? null : o.email;
  const customerName =
    a?.name?.trim() || customer?.displayName?.trim() || (restricted.size ? RESTRICTED_CUSTOMER_NAME : "Shopify customer");
  return {
    order: {
      external_order_id: o.id,
      external_order_number: o.name,
      customer: { external_id: customer?.id ?? null },
      customer_name: customerName,
      customer_email: email || customer?.email || null,
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
      customer_data_status: restricted.size ? "restricted" : "available",
      customer_data_restricted_fields: [...restricted].sort(),
    },
    items: o.lineItems.nodes.map((li) => {
      // Keys starting with "_" are hidden app data by Shopify convention.
      const attrs = li.customAttributes.filter((c) => c.value && !c.key.startsWith("_"));
      const { personalisation, variations: rest } = splitOptions(attrs.map((c) => ({ name: c.key, value: c.value ?? "" })));
      const unit = amount(li.originalUnitPriceSet);
      return {
        external_line_item_id: li.id,
        external_listing_id: li.product?.id ?? null,
        external_variant_id: li.variant?.id ?? null,
        sku: li.sku || null,
        title: li.title,
        variant_title: li.variantTitle && li.variantTitle !== "Default Title" ? li.variantTitle : null,
        variant_details: rest,
        quantity: li.quantity,
        unit_price: unit,
        total_price: amount(li.discountedTotalSet) || unit * li.quantity,
        personalisation,
        // Original data, untouched.
        marketplace_options: { variant_title: li.variantTitle, custom_attributes: li.customAttributes },
      };
    }),
  };
}
