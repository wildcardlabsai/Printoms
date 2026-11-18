import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/server-env";
import { fetchWithRetry, safeText } from "../http";
import { IntegrationError } from "../types";

export const SHOPIFY_SCOPES = [
  "read_orders",
  "read_customers",
  "read_products",
  "read_fulfillments",
  "write_fulfillments",
  "read_merchant_managed_fulfillment_orders",
  "write_merchant_managed_fulfillment_orders",
];

/** Scopes to request. read_all_orders is only requested when explicitly enabled. */
export function requestedShopifyScopes() {
  return serverEnv.shopify.requestAllOrders ? [...SHOPIFY_SCOPES, "read_all_orders"] : SHOPIFY_SCOPES;
}

export function shopifyAuthorizeUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: serverEnv.shopify.clientId,
    scope: requestedShopifyScopes().join(","),
    redirect_uri: redirectUri,
    state,
  });
  return `https://${serverEnv.shopify.storeDomain}/admin/oauth/authorize?${params.toString()}`;
}

/** Verify the HMAC Shopify appends to OAuth redirects. */
export function verifyShopifyHmac(query: URLSearchParams) {
  const hmac = query.get("hmac");
  if (!hmac) return false;
  const message = [...query.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = createHmac("sha256", serverEnv.shopify.clientSecret).update(message).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmac, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function exchangeShopifyCode(shop: string, code: string) {
  const res = await fetchWithRetry(
    `https://${shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: serverEnv.shopify.clientId, client_secret: serverEnv.shopify.clientSecret, code }),
    },
    { label: "Shopify token exchange", retries: 2 },
  );
  if (!res.ok) throw new IntegrationError(`Shopify rejected the token exchange (HTTP ${res.status})`, await safeText(res));
  return (await res.json()) as { access_token: string; scope: string };
}
