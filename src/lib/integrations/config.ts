import "server-only";
import { hasEncryptionKey, hasServiceRole, serverEnv } from "@/lib/server-env";
import type { IntegrationProvider } from "@/lib/constants";

export type ConfigCheck = { ready: boolean; missing: string[]; mode?: string };

/** Which server-side environment variables are still needed for a provider. */
export function checkConfig(provider: IntegrationProvider): ConfigCheck {
  const missing: string[] = [];
  if (!hasServiceRole()) missing.push("SUPABASE_SECRET_KEY");
  if (!hasEncryptionKey()) missing.push("TOKEN_ENCRYPTION_KEY");

  if (provider === "etsy") {
    if (!serverEnv.etsy.keystring) missing.push("ETSY_API_KEYSTRING");
    if (!serverEnv.etsy.sharedSecret) missing.push("ETSY_SHARED_SECRET");
    if (!serverEnv.etsy.redirectUri) missing.push("ETSY_REDIRECT_URI");
    return { ready: missing.length === 0, missing, mode: "OAuth 2.0 (PKCE)" };
  }

  if (!serverEnv.shopify.storeDomain) missing.push("SHOPIFY_STORE_DOMAIN");
  else if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(serverEnv.shopify.storeDomain)) {
    missing.push("SHOPIFY_STORE_DOMAIN (must be your-store.myshopify.com)");
  }
  const hasToken = Boolean(serverEnv.shopify.adminAccessToken);
  const hasOAuth = Boolean(serverEnv.shopify.clientId && serverEnv.shopify.clientSecret);
  if (!hasToken && !hasOAuth) missing.push("SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (or SHOPIFY_ADMIN_ACCESS_TOKEN)");
  return {
    ready: missing.length === 0,
    missing,
    mode: hasToken ? "Admin API access token" : "OAuth app installation",
  };
}
