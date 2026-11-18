import type { IntegrationProvider } from "@/lib/constants";

/** Normalised order payload accepted by the `ingest_marketplace_order` SQL function. */
export type NormalisedOrder = {
  order: {
    external_order_id: string;
    external_order_number: string | null;
    customer: { external_id: string | null };
    customer_name: string;
    customer_email: string | null;
    shipping_address: {
      name: string | null;
      line1: string | null;
      line2: string | null;
      city: string | null;
      region: string | null;
      postal_code: string | null;
      country_code: string | null;
      phone: string | null;
    };
    order_date: string;
    payment_status: "pending" | "paid" | "partially_paid" | "partially_refunded" | "refunded" | "voided" | "unknown";
    marketplace_status: string | null;
    marketplace_fulfilment_status: string | null;
    currency: string;
    subtotal: number;
    shipping_total: number;
    tax_total: number;
    discount_total: number;
    total: number;
    customer_note: string | null;
    shipping_method: string | null;
    marketplace_dispatch_by: string | null;
    default_dispatch_by: string | null;
    marketplace_updated_at: string;
    marketplace_cancelled_at: string | null;
    is_fulfilled: boolean;
  };
  items: {
    external_line_item_id: string;
    external_listing_id: string | null;
    external_variant_id: string | null;
    sku: string | null;
    title: string;
    variant_title: string | null;
    variant_details: { name: string; value: string }[];
    quantity: number;
    unit_price: number;
    total_price: number;
    personalisation: string | null;
  }[];
};

export type OrderPage = { orders: NormalisedOrder[]; maxUpdatedAt: string | null };

export type FetchContext = {
  since: Date;
  defaultDispatchDays: number;
  /** Called after each page, so the engine can record progress. */
  onPage?: (page: number) => void;
};

export type FulfilmentPush = {
  externalOrderId: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
};

export interface MarketplaceAdapter {
  provider: IntegrationProvider;
  /** Iterate pages of orders updated since `ctx.since` (oldest first where supported). */
  fetchOrders(ctx: FetchContext): AsyncGenerator<OrderPage>;
  /** Send tracking details back to the marketplace. Returns an external reference. */
  pushFulfilment(input: FulfilmentPush): Promise<{ externalId: string | null }>;
}

export class IntegrationError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
    public readonly retryable = false,
  ) {
    super(message);
  }
}
