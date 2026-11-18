import { NextResponse, type NextRequest } from "next/server";
import { AuthorisationError, authoriseAction } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIntegration, saveCredentials } from "@/lib/integrations/credentials";
import { EtsyClient } from "@/lib/integrations/etsy/client";
import { ETSY_SCOPES, exchangeEtsyCode } from "@/lib/integrations/etsy/oauth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const back = new URL("/settings/integrations", request.url);
  const fail = (msg: string) => {
    back.searchParams.set("error", msg);
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: "pf_etsy_state", path: "/api/integrations/etsy" });
    res.cookies.delete({ name: "pf_etsy_verifier", path: "/api/integrations/etsy" });
    return res;
  };

  let userId: string;
  try {
    userId = (await authoriseAction("admin")).id;
  } catch (e) {
    return fail(e instanceof AuthorisationError ? e.message : "Not allowed");
  }

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail(`Etsy authorisation was not completed: ${params.get("error_description") ?? params.get("error")}`);
  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get("pf_etsy_state")?.value;
  const verifier = request.cookies.get("pf_etsy_verifier")?.value;
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return fail("The Etsy authorisation response could not be verified. Please try connecting again.");
  }

  try {
    const tokens = await exchangeEtsyCode(code, verifier);
    const me = await EtsyClient.requestWithToken<{ user_id: number; shop_id: number | null }>(tokens.access_token, "/users/me");
    if (!me.shop_id) return fail("This Etsy account does not have a shop.");
    const shop = await EtsyClient.requestWithToken<{ shop_name: string; url?: string }>(tokens.access_token, `/shops/${me.shop_id}`);

    const admin = createAdminClient();
    const integration = await getIntegration(admin, "etsy");
    await saveCredentials(admin, integration.id, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
      refreshExpiresInDays: 90,
    });
    await admin
      .from("integrations")
      .update({
        status: "connected",
        external_shop_id: String(me.shop_id),
        display_name: shop.shop_name,
        shop_domain: shop.url ?? null,
        scopes: ETSY_SCOPES,
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
      message: `Etsy shop ${shop.shop_name} connected`,
      actor_id: userId,
    });

    back.searchParams.set("connected", "etsy");
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: "pf_etsy_state", path: "/api/integrations/etsy" });
    res.cookies.delete({ name: "pf_etsy_verifier", path: "/api/integrations/etsy" });
    return res;
  } catch (e) {
    console.error("Etsy OAuth callback failed", e);
    return fail(e instanceof Error ? e.message : "Etsy connection failed");
  }
}
