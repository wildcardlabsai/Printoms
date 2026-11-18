import "server-only";

/**
 * Server-only configuration. Marketplace secrets live here and are never
 * exposed to the browser (no NEXT_PUBLIC_ prefix, `server-only` guard).
 */
export const serverEnv = {
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "",

  etsy: {
    keystring: process.env.ETSY_API_KEYSTRING ?? "",
    sharedSecret: process.env.ETSY_SHARED_SECRET ?? "",
    redirectUri: process.env.ETSY_REDIRECT_URI ?? "",
  },

  shopify: {
    storeDomain: (process.env.SHOPIFY_STORE_DOMAIN ?? "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
    clientId: process.env.SHOPIFY_CLIENT_ID ?? "",
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? "",
    adminAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? "",
    apiVersion: process.env.SHOPIFY_API_VERSION ?? "2025-10",
    /** Opt-in: also request read_all_orders (orders older than 60 days). Shopify may require approval. */
    requestAllOrders: (process.env.SHOPIFY_REQUEST_ALL_ORDERS ?? "").toLowerCase() === "true",
  },
};

export function hasServiceRole(): boolean {
  return Boolean(serverEnv.supabaseSecretKey);
}

export function hasEncryptionKey(): boolean {
  return /^[0-9a-fA-F]{64}$/.test(serverEnv.tokenEncryptionKey) || serverEnv.tokenEncryptionKey.length >= 32;
}

/** Resolve the public base URL used for OAuth redirects. */
export function resolveSiteUrl(requestOrigin?: string): string {
  const configured = serverEnv.siteUrl || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return (configured || requestOrigin || "http://localhost:3000").replace(/\/$/, "");
}
