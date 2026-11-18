import "server-only";
import type { AdminSupabase } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { loadCredentials, saveCredentials } from "../credentials";
import { fetchWithRetry, safeText } from "../http";
import { IntegrationError } from "../types";
import { refreshEtsyToken } from "./oauth";

const API = "https://openapi.etsy.com/v3/application";

/** Etsy expects the app keystring (and, for newer apps, the shared secret) in x-api-key. */
export function etsyApiKeyHeader() {
  const { keystring, sharedSecret } = serverEnv.etsy;
  return sharedSecret ? `${keystring}:${sharedSecret}` : keystring;
}

export class EtsyClient {
  private accessToken: string | null = null;

  constructor(
    private readonly admin: AdminSupabase,
    private readonly integrationId: string,
  ) {}

  /** Static helper used right after OAuth, before credentials are stored. */
  static async requestWithToken<T>(accessToken: string, path: string): Promise<T> {
    const res = await fetchWithRetry(`${API}${path}`, {
      headers: { "x-api-key": etsyApiKeyHeader(), Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    }, { label: `Etsy GET ${path}` });
    if (!res.ok) throw new IntegrationError(`Etsy API error (HTTP ${res.status}) for ${path}`, await safeText(res), res.status === 429 || res.status >= 500, res.status);
    return (await res.json()) as T;
  }

  /** Returns a valid access token, refreshing (and rotating the refresh token) when close to expiry. */
  private async token(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const creds = await loadCredentials(this.admin, this.integrationId);
    if (!creds?.accessToken || !creds.refreshToken) {
      throw new IntegrationError("Etsy is not connected — no stored credentials. Reconnect from Settings → Integrations.");
    }
    const expiresSoon = !creds.accessTokenExpiresAt || creds.accessTokenExpiresAt.getTime() - Date.now() < 5 * 60_000;
    if (!expiresSoon) {
      this.accessToken = creds.accessToken;
      return creds.accessToken;
    }
    try {
      const refreshed = await refreshEtsyToken(creds.refreshToken);
      await saveCredentials(this.admin, this.integrationId, {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresInSeconds: refreshed.expires_in,
        refreshExpiresInDays: 90,
      });
      this.accessToken = refreshed.access_token;
      return refreshed.access_token;
    } catch (e) {
      throw new IntegrationError(
        "Etsy access could not be refreshed. The connection may have been revoked or expired — reconnect Etsy.",
        e instanceof IntegrationError ? e.details : String(e),
        false,
        401,
      );
    }
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.token();
    const res = await fetchWithRetry(
      `${API}${path}`,
      {
        ...init,
        headers: {
          "x-api-key": etsyApiKeyHeader(),
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      },
      { label: `Etsy ${init.method ?? "GET"} ${path.split("?")[0]}` },
    );
    if (res.status === 401) {
      throw new IntegrationError("Etsy rejected the access token (401). Reconnect Etsy from Settings → Integrations.", await safeText(res), false, 401);
    }
    if (!res.ok) {
      throw new IntegrationError(`Etsy API error (HTTP ${res.status})`, await safeText(res), res.status === 429 || res.status >= 500, res.status);
    }
    return (await res.json()) as T;
  }
}
