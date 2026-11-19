import type { NormalisedOrder } from "../types";
import { addBusinessDays } from "@/lib/utils";
import type { Json } from "@/types/database";

/** Vinted Pro Integrations API order shapes (from Vinted's OpenAPI definition). */
export type VintedOrderStatus =
  | "CREATED" | "READY_TO_BE_SHIPPED" | "SHIPPED" | "DELIVERED" | "LOST"
  | "RETURN_REQUESTED" | "RETURN_INITIATED" | "RETURN_SHIPPED" | "RETURN_DELIVERED" | "RETURN_LOST"
  | "CANCELED" | "COMPLETED" | "PARTIALLY_COMPLETED" | "CLOSED";

export type VintedOrderListElement = { id: number; created_at: string; status: VintedOrderStatus };

export type VintedAddress = {
  name?: string | null;
  line_1?: string | null;
  line_2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
};

export type VintedOrder = {
  id: number;
  created_at: string;
  status: VintedOrderStatus;
  /** What the seller receives for this order. */
  amount: number;
  currency: "EUR" | "GBP" | string;
  items: { id: string; item_reference?: string | null; title: string; price: number }[];
  billing_address?: VintedAddress | null;
  delivery_address?: VintedAddress | null;
};

const NO_ITEM_ID = "00000000-0000-0000-0000-000000000000";

/** Statuses meaning the parcel has left (or the order is finished). */
const SHIPPED_STATES = new Set<VintedOrderStatus>([
  "SHIPPED", "DELIVERED", "LOST", "RETURN_REQUESTED", "RETURN_INITIATED", "RETURN_SHIPPED",
  "RETURN_DELIVERED", "RETURN_LOST", "COMPLETED", "PARTIALLY_COMPLETED", "CLOSED",
]);

export function vintedIsShipped(status: VintedOrderStatus) {
  return SHIPPED_STATES.has(status);
}

/**
 * Normalise a Vinted order. Vinted orders have no "updated at" timestamp, so
 * the engine only re-fetches an order when its status changes; `seenAt` (the
 * time of that fetch) is used as the marketplace update time.
 */
export function mapVintedOrder(o: VintedOrder, defaultDispatchDays: number, seenAt: string): NormalisedOrder {
  const addr = o.delivery_address ?? o.billing_address ?? {};
  const name = addr.name?.trim() || "Vinted buyer";
  const cancelled = o.status === "CANCELED";
  const itemsTotal = round2(o.items.reduce((s, i) => s + (Number(i.price) || 0), 0));
  const created = new Date(o.created_at);

  return {
    order: {
      external_order_id: String(o.id),
      external_order_number: String(o.id),
      customer: { external_id: null },
      customer_name: name,
      customer_email: null,
      shipping_address: {
        name,
        line1: addr.line_1 ?? null,
        line2: addr.line_2 || null,
        city: addr.city ?? null,
        region: addr.state || null,
        postal_code: addr.postal_code ?? null,
        country_code: addr.country_code ?? null,
        phone: null,
      },
      order_date: created.toISOString(),
      payment_status: cancelled ? "voided" : "paid",
      marketplace_status: o.status,
      marketplace_fulfilment_status: o.status,
      currency: o.currency,
      subtotal: itemsTotal,
      shipping_total: 0,
      tax_total: 0,
      discount_total: 0,
      // Vinted reports the seller payout; that is what PrintFlow counts as revenue.
      total: round2(Number(o.amount) || 0),
      customer_note: null,
      shipping_method: "Vinted shipping label",
      marketplace_dispatch_by: null,
      default_dispatch_by: addBusinessDays(created, defaultDispatchDays).toISOString(),
      marketplace_updated_at: seenAt,
      marketplace_cancelled_at: cancelled ? seenAt : null,
      is_fulfilled: vintedIsShipped(o.status),
      customer_data_status: "available",
      customer_data_restricted_fields: [],
      items_complete: true,
    },
    items: o.items.map((item, i) => {
      const managed = item.id && item.id !== NO_ITEM_ID;
      return {
        // Items not listed through the API all share the zero ID; use the position instead.
        external_line_item_id: managed ? item.id : `${o.id}-${i + 1}`,
        external_listing_id: managed ? item.id : null,
        external_variant_id: null,
        sku: item.item_reference?.trim() || null,
        title: item.title?.trim() || "Vinted item",
        variant_title: null,
        variant_details: [],
        quantity: 1,
        unit_price: round2(Number(item.price) || 0),
        total_price: round2(Number(item.price) || 0),
        personalisation: null,
        marketplace_options: { item_id: item.id, item_reference: item.item_reference ?? null } as Json,
      };
    }),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
