import type { EtsyReceipt } from "../../src/lib/integrations/etsy/mapper";
import type { EtsyListing } from "../../src/lib/integrations/listings";
import type { VintedOrder } from "../../src/lib/integrations/vinted/mapper";
import type { EtsyLedgerEntry, EtsyPayment } from "../../src/lib/integrations/fees";
import { createHmac } from "node:crypto";

/** A valid 1×1 PNG, served for marketplace image URLs. */
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

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
  /** Active Etsy listings (getListingsByShop). */
  etsyListings: EtsyListing[] = [];
  imageRequests: string[] = [];
  /** Vinted Pro Integrations: full orders (the list endpoint is derived from these). */
  vintedOrders: VintedOrder[] = [];
  vintedPageSize = 250;
  vintedListCalls = 0;
  vintedDetailCalls: string[] = [];
  /** Force a 401 with this error code on every Vinted request. */
  vintedAuthError: string | null = null;
  /** Order ids whose detail request returns HTTP 500. */
  vintedBrokenOrders = new Set<number>();
  /** Label behaviour per order id: "pdf" (default) or a 404 error code. */
  vintedLabels: Record<string, string> = {};
  vintedBadSignatures = 0;
  /** Etsy payment-account ledger and per-receipt payments (fees). */
  etsyLedger: EtsyLedgerEntry[] = [];
  etsyPayments: Record<string, EtsyPayment[]> = {};
  etsyLedgerCalls: string[] = [];
  /** Emails "sent" through the fake Resend API. */
  emails: { body: { from: string; to: string[]; subject: string; html: string; text: string }; idempotencyKey: string | null }[] = [];
  /** Force these HTTP statuses on the next Resend calls. */
  resendStatus: number[] = [];
  private resendKeys = new Set<string>();
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
    const ledger = url.match(/^https:\/\/openapi\.etsy\.com\/v3\/application\/shops\/\d+\/payment-account\/ledger-entries\?(.*)$/);
    if (ledger) {
      this.etsyLedgerCalls.push(ledger[1]!);
      const p = new URLSearchParams(ledger[1]);
      if (!p.get("min_created") || !p.get("max_created")) return Response.json({ error: "min_created and max_created are required" }, { status: 400 });
      const inRange = this.etsyLedger.filter((e) => (e.create_date ?? 0) >= Number(p.get("min_created")) && (e.create_date ?? 0) <= Number(p.get("max_created")));
      const offset = Number(p.get("offset") ?? 0);
      return Response.json({ count: inRange.length, results: inRange.slice(offset, offset + Number(p.get("limit") ?? 100)) });
    }
    const payments = url.match(/^https:\/\/openapi\.etsy\.com\/v3\/application\/shops\/\d+\/receipts\/(\d+)\/payments$/);
    if (payments) {
      const results = this.etsyPayments[payments[1]!] ?? [];
      return Response.json({ count: results.length, results });
    }
    const listings = url.match(/^https:\/\/openapi\.etsy\.com\/v3\/application\/shops\/\d+\/listings\?(.*)$/);
    if (listings) {
      const p = new URLSearchParams(listings[1]);
      const offset = Number(p.get("offset") ?? 0);
      const limit = Number(p.get("limit") ?? 100);
      return Response.json({ count: this.etsyListings.length, results: this.etsyListings.slice(offset, offset + limit) });
    }
    if (/^https:\/\/(i\.etsystatic\.com|cdn\.shopify\.com)\//.test(url)) {
      this.imageRequests.push(url);
      return new Response(PNG, { headers: { "content-type": "image/png" } });
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
    if (url.startsWith("https://pro.svc.vinted.com/")) return this.vinted(url, init);
    if (url === "https://api.resend.com/emails") {
      const forced = this.resendStatus.shift();
      if (forced) return Response.json({ name: "error", message: `forced ${forced}` }, { status: forced });
      const headers = new Headers(init?.headers);
      if (headers.get("authorization") !== "Bearer re_test_key") return Response.json({ message: "API key is invalid" }, { status: 401 });
      const key = headers.get("idempotency-key");
      // Like Resend: a repeated idempotency key never sends a second email.
      if (key && this.resendKeys.has(key)) return Response.json({ id: `email_${key}` });
      if (key) this.resendKeys.add(key);
      this.emails.push({ body: JSON.parse(String(init?.body)), idempotencyKey: key });
      return Response.json({ id: `email_${this.emails.length}` });
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

  /** Fake Vinted Pro Integrations API; verifies signatures like Vinted's reference script. */
  private vinted(url: string, init?: RequestInit): Response {
    const u = new URL(url);
    const pathWithQuery = u.pathname + u.search;
    const headers = new Headers(init?.headers);
    const accessKey = headers.get("x-vpi-access-key") ?? "";
    const sig = headers.get("x-vpi-hmac-sha256") ?? "";
    const m = sig.match(/^t=(\d+),v1=([0-9a-f]{64})$/);
    const expected = m
      ? createHmac("sha256", "test-signing-key").update([m[1], (init?.method ?? "GET").toUpperCase(), pathWithQuery, accessKey, String(init?.body ?? "")].join(".")).digest("hex")
      : null;
    if (accessKey !== "test-access-key") return Response.json({ error: "INVALID_ACCESS_KEY" }, { status: 401 });
    if (!m || expected !== m[2] || Math.abs(Date.now() / 1000 - Number(m[1])) > 300) {
      this.vintedBadSignatures++;
      return Response.json({ error: "INVALID_HMAC_SIGNATURE" }, { status: 401 });
    }
    if (this.vintedAuthError) return Response.json({ error: this.vintedAuthError }, { status: 401 });

    if (u.pathname === "/api/v1/orders") {
      this.vintedListCalls++;
      const after = Number(u.searchParams.get("after-id") ?? 0);
      const orders = [...this.vintedOrders].sort((a, b) => a.id - b.id).filter((o) => o.id > after).slice(0, this.vintedPageSize);
      return Response.json({ orders: orders.map((o) => ({ id: o.id, created_at: o.created_at, status: o.status })) });
    }
    const detail = u.pathname.match(/^\/api\/v1\/orders\/(\d+)$/);
    if (detail) {
      this.vintedDetailCalls.push(detail[1]!);
      if (this.vintedBrokenOrders.has(Number(detail[1]))) return new Response("boom", { status: 500 });
      const o = this.vintedOrders.find((x) => x.id === Number(detail[1]));
      return o ? Response.json(o) : Response.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
    }
    const label = u.pathname.match(/^\/api\/v1\/orders\/(\d+)\/shipment-label$/);
    if (label) {
      const mode = this.vintedLabels[label[1]!] ?? "pdf";
      if (mode === "pdf") return new Response(new TextEncoder().encode("%PDF-1.4 fake label"), { headers: { "content-type": "application/pdf" } });
      return Response.json({ error: mode }, { status: 404 });
    }
    return Response.json({ error: "not found" }, { status: 404 });
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
