import type { EtsyReceipt } from "../../src/lib/integrations/etsy/mapper";

/**
 * In-process fake Etsy Open API v3 and Shopify Admin GraphQL endpoints.
 * Installed by replacing globalThis.fetch; any other URL is refused so a test
 * can never reach a real marketplace.
 */
export type ShopifyResponder = (request: { query: string; variables: Record<string, unknown> }) => unknown;

export class FakeMarketplaces {
  etsyReceipts: EtsyReceipt[] = [];
  etsyCalls = 0;
  etsyTokenRefreshes = 0;
  etsyRateLimitOnce = false;
  /** Simulate an outage: every request returns HTTP 500. */
  etsyDown = false;
  shopifyDown = false;
  shopify: ShopifyResponder = () => ({ data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } });
  shopifyQueries: string[] = [];
  /** Etsy receipt shipments by receipt id (tracking already on Etsy). */
  etsyShipments: Record<string, { tracking_code: string; carrier_name: string; receipt_shipping_id: number }[]> = {};
  etsyTrackingPosts: { receiptId: string; body: URLSearchParams }[] = [];
  /** Respond to the tracking POST with this status (simulate failures). */
  etsyTrackingStatus: number[] = [];
  /** Throw a network error AFTER Etsy recorded the tracking (ambiguous outcome). */
  etsyTrackingTimeoutAfterSave = false;
  /** Etsy refuses token refresh (revoked/expired refresh token). */
  etsyRefreshFails = false;
  private original = globalThis.fetch;

  install() {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => this.handle(String(input), init)) as typeof fetch;
    return this;
  }

  uninstall() {
    globalThis.fetch = this.original;
  }

  private async handle(url: string, init?: RequestInit): Promise<Response> {
    if (this.etsyDown && /etsy\.com/.test(url)) return new Response("Etsy unavailable", { status: 500 });
    if (this.shopifyDown && /myshopify\.com/.test(url)) return new Response("Shopify unavailable", { status: 500 });
    if (url.startsWith("https://api.etsy.com/v3/public/oauth/token")) {
      this.etsyTokenRefreshes++;
      if (this.etsyRefreshFails) return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({ access_token: "1.newtoken", refresh_token: "1.newrefresh", expires_in: 3600, token_type: "Bearer" });
    }
    const tracking = url.match(/^https:\/\/openapi\.etsy\.com\/v3\/application\/shops\/\d+\/receipts\/(\d+)\/tracking$/);
    if (tracking && init?.method === "POST") {
      const receiptId = tracking[1]!;
      const forced = this.etsyTrackingStatus.shift();
      if (forced && forced !== 200) return new Response(JSON.stringify({ error: `forced ${forced}` }), { status: forced });
      const body = new URLSearchParams(String(init.body ?? ""));
      this.etsyTrackingPosts.push({ receiptId, body });
      (this.etsyShipments[receiptId] ??= []).push({
        tracking_code: body.get("tracking_code") ?? "",
        carrier_name: body.get("carrier_name") ?? "",
        receipt_shipping_id: 5000 + this.etsyTrackingPosts.length,
      });
      if (this.etsyTrackingTimeoutAfterSave) {
        this.etsyTrackingTimeoutAfterSave = false;
        throw new TypeError("fetch failed: socket hang up");
      }
      return Response.json({ receipt_id: Number(receiptId), shipments: this.etsyShipments[receiptId] });
    }
    const single = url.match(/^https:\/\/openapi\.etsy\.com\/v3\/application\/shops\/\d+\/receipts\/(\d+)$/);
    if (single) return Response.json({ receipt_id: Number(single[1]), shipments: this.etsyShipments[single[1]!] ?? [] });
    const receipts = url.match(/^https:\/\/openapi\.etsy\.com\/v3\/application\/shops\/(\d+)\/receipts\?(.*)$/);
    if (receipts) {
      this.etsyCalls++;
      if (this.etsyRateLimitOnce) {
        this.etsyRateLimitOnce = false;
        return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
      }
      const p = new URLSearchParams(receipts[2]);
      const min = Number(p.get("min_last_modified") ?? 0);
      const offset = Number(p.get("offset") ?? 0);
      const limit = Number(p.get("limit") ?? 100);
      const matching = this.etsyReceipts
        .filter((r) => (r.updated_timestamp ?? 0) >= min)
        .sort((a, b) => (a.updated_timestamp ?? 0) - (b.updated_timestamp ?? 0));
      return Response.json({ count: matching.length, results: matching.slice(offset, offset + limit) });
    }
    if (/^https:\/\/printflow-test\.myshopify\.com\/admin\/api\/[^/]+\/graphql\.json$/.test(url)) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { query: string; variables: Record<string, unknown> };
      this.shopifyQueries.push(body.query);
      return Response.json(this.shopify(body));
    }
    // The local Supabase stack is allowed; anything else is refused.
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) return this.original(url, init);
    throw new Error(`Test attempted a real network request: ${url}`);
  }
}

let seq = 0;
/** Build an Etsy receipt with sensible defaults. */
export function etsyReceipt(id: string | number, updatedUnix: number, overrides: Partial<EtsyReceipt> = {}): EtsyReceipt {
  seq++;
  return {
    receipt_id: Number(id),
    buyer_user_id: 880000 + seq,
    buyer_email: null,
    name: `Test Buyer ${id}`,
    first_line: `${id} Test Road`,
    second_line: null,
    city: "Testville",
    state: null,
    zip: "TE1 1ST",
    country_iso: "GB",
    status: "Paid",
    is_paid: true,
    is_shipped: false,
    message_from_buyer: null,
    created_timestamp: updatedUnix - 3600,
    updated_timestamp: updatedUnix,
    grandtotal: { amount: 2595, divisor: 100, currency_code: "GBP" },
    subtotal: { amount: 2200, divisor: 100, currency_code: "GBP" },
    total_shipping_cost: { amount: 395, divisor: 100, currency_code: "GBP" },
    total_tax_cost: { amount: 0, divisor: 100, currency_code: "GBP" },
    discount_amt: { amount: 0, divisor: 100, currency_code: "GBP" },
    transactions: [
      {
        transaction_id: Number(`${id}01`),
        title: "Personalised Name Sign",
        quantity: 1,
        listing_id: 1234567,
        product_id: 89,
        sku: "SIGN-1",
        price: { amount: 1100, divisor: 100, currency_code: "GBP" },
        variations: [
          { formatted_name: "Colour", formatted_value: "Sage" },
          { formatted_name: "Personalization", formatted_value: `Name: ${id}` },
        ],
        expected_ship_date: updatedUnix + 86400 * 3,
      },
    ],
    ...overrides,
  };
}
