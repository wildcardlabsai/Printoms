import { NextResponse, type NextRequest } from "next/server";
import { AuthorisationError, authoriseAction } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSiteUrl, serverEnv } from "@/lib/server-env";
import { checkConfig } from "@/lib/integrations/config";
import { getIntegration, saveCredentials } from "@/lib/integrations/credentials";
import { randomToken } from "@/lib/integrations/crypto";
import { shopifyAuthorizeUrl } from "@/lib/integrations/shopify/oauth";
import { fetchShopInfo } from "@/lib/integrations/shopify/adapter";

export const dynamic = "force-dynamic";

/**
 * Connect Shopify.
 *  - With SHOPIFY_ADMIN_ACCESS_TOKEN: verify the token against the store and save it (encrypted).
 *  - Otherwise: start the OAuth installation flow using SHOPIFY_CLIENT_ID / SECRET.
 */
export async function GET(request: NextRequest) {
  const back = new URL("/settings/integrations", request.url);
  let userId: string;
  try {
    userId = (await authoriseAction("admin")).id;
  } catch (e) {
    back.searchParams.set("error", e instanceof AuthorisationError ? e.message : "Not allowed");
    return NextResponse.redirect(back);
  }
  const config = checkConfig("shopify");
  if (!config.ready) {
    back.searchParams.set("error", `Shopify is not configured. Missing: ${config.missing.join(", ")}`);
    return NextResponse.redirect(back);
  }
  const shop = serverEnv.shopify.storeDomain;

  if (serverEnv.shopify.adminAccessToken) {
    try {
      const info = await fetchShopInfo(shop, serverEnv.shopify.adminAccessToken);
      const admin = createAdminClient();
      const integration = await getIntegration(admin, "shopify");
      await saveCredentials(admin, integration.id, { accessToken: serverEnv.shopify.adminAccessToken });
      await admin
        .from("integrations")
        .update({
          status: "connected",
          display_name: info.name,
          shop_domain: info.myshopifyDomain,
          external_shop_id: info.myshopifyDomain,
          // Actual granted scopes (decides e.g. how much order history is available).
          scopes: info.scopes,
          connected_at: new Date().toISOString(),
          connected_by: userId,
          last_error: null,
          consecutive_failures: 0,
          next_sync_at: new Date().toISOString(),
        })
        .eq("id", integration.id);
      back.searchParams.set("connected", "shopify");
    } catch (e) {
      back.searchParams.set("error", e instanceof Error ? e.message : "Shopify connection failed");
    }
    return NextResponse.redirect(back);
  }

  const state = randomToken(24);
  const redirectUri = `${resolveSiteUrl(request.nextUrl.origin)}/api/integrations/shopify/callback`;
  const response = NextResponse.redirect(shopifyAuthorizeUrl(state, redirectUri));
  response.cookies.set("pf_shopify_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/integrations/shopify",
  });
  return response;
}
