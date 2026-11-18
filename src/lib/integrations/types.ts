import type { Json } from "@/types/database";
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
    /** "restricted" when the marketplace withheld customer data (e.g. Shopify protected customer data). */
    customer_data_status: "available" | "restricted";
    /** Which customer fields were withheld, e.g. ["customer", "email", "shipping_address"]. */
    customer_data_restricted_fields: string[];
    /** True when `items` is the marketplace's complete line-item list, so missing lines mean removed. */
    items_complete: boolean;
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
    /** Untouched original option data from the marketplace (variations / custom attributes). */
    marketplace_options: Json;
  }[];
};

export type OrderPage = { orders: NormalisedOrder[]; maxUpdatedAt: string | null };

export type FetchContext = {
  since: Date;
  defaultDispatchDays: number;
  /** Called after each page, so the engine can record progress. */
  onPage?: (page: number) => void;
  /** Non-fatal problems worth surfacing in the sync log (e.g. restricted customer data). */
  onWarning?: (warning: SyncWarning) => void;
};

export type SyncWarning = {
  code: "customer_data_restricted" | "import_window_limited" | "failures_parked";
  message: string;
  details?: Record<string, unknown>;
};

export type FulfilmentPush = {
  externalOrderId: string;
  /** PrintFlow carrier label; adapters map it via the carrier registry. */
  carrier: string | null;
  trackingNumber: string;
  trackingUrl: string | null;
};

export type FulfilmentResult = { externalId: string | null; response: unknown };

export interface MarketplaceAdapter {
  provider: IntegrationProvider;
  /** Iterate pages of orders updated since `ctx.since` (oldest first where supported). */
  fetchOrders(ctx: FetchContext): AsyncGenerator<OrderPage>;
  /** Send tracking details back to the marketplace. */
  pushFulfilment(input: FulfilmentPush): Promise<FulfilmentResult>;
  /**
   * Is this tracking number already on the marketplace order? Used before every
   * submission so a retry after an ambiguous outcome never creates a duplicate.
   */
  findExistingFulfilment(input: FulfilmentPush): Promise<{ externalId: string | null } | null>;
}

export class IntegrationError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
    public readonly retryable = false,
    /** HTTP status from the marketplace, when there was one. */
    public readonly status?: number,
  ) {
    super(message);
  }
}
