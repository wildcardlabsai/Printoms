import { NextResponse, type NextRequest } from "next/server";
import { AuthorisationError, authoriseAction } from "@/lib/auth";
import { checkConfig } from "@/lib/integrations/config";
import { pkceChallenge, randomToken } from "@/lib/integrations/crypto";
import { etsyAuthorizeUrl } from "@/lib/integrations/etsy/oauth";

export const dynamic = "force-dynamic";

/** Starts Etsy OAuth 2.0 (authorization code + PKCE). */
export async function GET(request: NextRequest) {
  const back = new URL("/settings/integrations", request.url);
  try {
    await authoriseAction("admin");
  } catch (e) {
    back.searchParams.set("error", e instanceof AuthorisationError ? e.message : "Not allowed");
    return NextResponse.redirect(back);
  }
  const config = checkConfig("etsy");
  if (!config.ready) {
    back.searchParams.set("error", `Etsy is not configured. Missing: ${config.missing.join(", ")}`);
    return NextResponse.redirect(back);
  }
  const state = randomToken(24);
  const verifier = randomToken(48);
  const response = NextResponse.redirect(etsyAuthorizeUrl(state, pkceChallenge(verifier)));
  const cookie = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge: 600, path: "/api/integrations/etsy" };
  response.cookies.set("pf_etsy_state", state, cookie);
  response.cookies.set("pf_etsy_verifier", verifier, cookie);
  return response;
}
