import "server-only";
import { serverEnv } from "@/lib/server-env";
import { fetchWithRetry, safeText } from "../http";
import { IntegrationError } from "../types";

export const ETSY_SCOPES = ["transactions_r", "transactions_w", "listings_r", "shops_r", "email_r"];
const TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";

export function etsyAuthorizeUrl(state: string, codeChallenge: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: serverEnv.etsy.keystring,
    redirect_uri: serverEnv.etsy.redirectUri,
    scope: ETSY_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://www.etsy.com/oauth/connect?${params.toString()}`;
}

export type EtsyTokenResponse = { access_token: string; refresh_token: string; expires_in: number; token_type: string };

async function tokenRequest(body: Record<string, string>): Promise<EtsyTokenResponse> {
  const res = await fetchWithRetry(
    TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    },
    // Refresh tokens rotate: a blind resend could invalidate the new token.
    { label: "Etsy token request", retries: 2, idempotent: false },
  );
  if (!res.ok) {
    throw new IntegrationError(`Etsy rejected the token request (HTTP ${res.status})`, await safeText(res));
  }
  return (await res.json()) as EtsyTokenResponse;
}

export function exchangeEtsyCode(code: string, codeVerifier: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: serverEnv.etsy.keystring,
    redirect_uri: serverEnv.etsy.redirectUri,
    code,
    code_verifier: codeVerifier,
  });
}

export function refreshEtsyToken(refreshToken: string) {
  return tokenRequest({ grant_type: "refresh_token", client_id: serverEnv.etsy.keystring, refresh_token: refreshToken });
}
