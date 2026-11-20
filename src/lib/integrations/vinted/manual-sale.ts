import { addBusinessDays } from "@/lib/utils";
import { VINTED_SALE_STATUSES, type vintedSaleSchema } from "@/lib/validation/vinted-sale";
import type { z } from "zod";

type Sale = z.output<typeof vintedSaleSchema>;
type Product = { id: string; name: string; sku: string };

/** Stable marketplace ID: the Vinted reference when given (used once), else the form's key. */
export function vintedSaleExternalId(sale: Pick<Sale, "key" | "reference">) {
  const ref = sale.reference.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
  return { ref, externalId: ref ? `vinted-app-ref-${ref.toLowerCase()}` : `vinted-app-${sale.key}` };
}

/**
 * Build the order exactly as the Vinted import would (source "vinted"), from a
 * sale typed in from the Vinted app. Returns null + the index of an item with no name.
 */
export function buildVintedSale(sale: Sale, products: Product[], dispatchDays: number, now = new Date()) {
  const { ref, externalId } = vintedSaleExternalId(sale);
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = sale.items.map((i, n) => {
    const product = i.product_id ? byId.get(i.product_id) : undefined;
    return {
      external_line_item_id: `${externalId}-${n + 1}`,
      external_listing_id: null,
      external_variant_id: null,
      // The product's SKU links the line to it (tickets, costs, analytics).
      sku: product?.sku ?? null,
      title: i.title || product?.name || "",
      variant_title: null,
      variant_details: [],
      quantity: i.quantity,
      unit_price: Math.round((i.price / i.quantity) * 100) / 100,
      total_price: i.price,
      personalisation: i.personalisation || null,
      marketplace_options: {},
    };
  });
  const missingTitle = items.findIndex((i) => !i.title);
  const status = VINTED_SALE_STATUSES[sale.status];
  // Midday on the sale date, or now if that's still in the future (i.e. today).
  const orderDate = new Date(Math.min(new Date(`${sale.sale_date}T12:00:00`).getTime(), now.getTime()));
  const total = Math.round(items.reduce((s, i) => s + i.total_price, 0) * 100) / 100;
  const buyer = sale.buyer.replace(/^@/, "");
  const order = {
    external_order_id: externalId,
    external_order_number: ref || `VA-${sale.key.slice(0, 6).toUpperCase()}`,
    customer: { external_id: buyer ? `vinted-app-buyer:${buyer.toLowerCase()}` : "vinted-app-buyer" },
    customer_name: buyer || "Vinted buyer",
    customer_email: null,
    shipping_address: { name: buyer || null, line1: null, line2: null, city: null, region: null, postal_code: null, country_code: "GB", phone: null },
    order_date: orderDate.toISOString(),
    payment_status: "paid",
    marketplace_status: status.vinted,
    marketplace_fulfilment_status: status.vinted,
    currency: "GBP",
    subtotal: total,
    shipping_total: 0,
    tax_total: 0,
    discount_total: 0,
    total,
    customer_note: sale.note || null,
    shipping_method: "Vinted shipping label",
    marketplace_dispatch_by: null,
    default_dispatch_by: addBusinessDays(orderDate, dispatchDays).toISOString(),
    marketplace_updated_at: now.toISOString(),
    marketplace_cancelled_at: null,
    is_fulfilled: status.shipped,
    customer_data_status: "available",
    customer_data_restricted_fields: [],
    items_complete: true,
  };
  return { ref, externalId, order, items, missingTitle, shipped: status.shipped };
}
