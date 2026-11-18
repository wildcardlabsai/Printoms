import { NextResponse, type NextRequest } from "next/server";
import { AuthorisationError, authoriseAction } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { getIntegration, saveCredentials } from "@/lib/integrations/credentials";
import { exchangeShopifyCode, verifyShopifyHmac } from "@/lib/integrations/shopify/oauth";
import { fetchShopInfo } from "@/lib/integrations/shopify/adapter";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const back = new URL("/settings/integrations", request.url);
  const fail = (msg: string) => {
    back.searchParams.set("error", msg);
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: "pf_shopify_state", path: "/api/integrations/shopify" });
    return res;
  };

  let userId: string;
  try {
    userId = (await authoriseAction("admin")).id;
  } catch (e) {
    return fail(e instanceof AuthorisationError ? e.message : "Not allowed");
  }

  const params = request.nextUrl.searchParams;
  const shop = params.get("shop") ?? "";
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || state !== request.cookies.get("pf_shopify_state")?.value) {
    return fail("The Shopify authorisation response could not be verified. Please try again.");
  }
  if (!verifyShopifyHmac(params)) return fail("Shopify signature verification failed.");
  if (shop.toLowerCase() !== serverEnv.shopify.storeDomain.toLowerCase()) {
    return fail(`Unexpected store ${shop}. PrintFlow is configured for ${serverEnv.shopify.storeDomain}.`);
  }

  try {
    const token = await exchangeShopifyCode(shop, code);
    const info = await fetchShopInfo(shop, token.access_token);
    const admin = createAdminClient();
    const integration = await getIntegration(admin, "shopify");
    await saveCredentials(admin, integration.id, { accessToken: token.access_token });
    await admin
      .from("integrations")
      .update({
        status: "connected",
        display_name: info.name,
        shop_domain: info.myshopifyDomain,
        external_shop_id: info.myshopifyDomain,
        scopes: token.scope.split(",").map((s) => s.trim()).filter(Boolean),
        connected_at: new Date().toISOString(),
        connected_by: userId,
        last_error: null,
        consecutive_failures: 0,
        next_sync_at: new Date().toISOString(),
      })
      .eq("id", integration.id);
    await admin.from("activity_log").insert({
      entity_type: "integration",
      entity_id: integration.id,
      action: "integration.connected",
      message: `Shopify store ${info.name} connected`,
      actor_id: userId,
    });
    back.searchParams.set("connected", "shopify");
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: "pf_shopify_state", path: "/api/integrations/shopify" });
    return res;
  } catch (e) {
    console.error("Shopify OAuth callback failed", e);
    return fail(e instanceof Error ? e.message : "Shopify connection failed");
  }
}
