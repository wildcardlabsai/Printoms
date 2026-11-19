import { createHmac } from "node:crypto";
import { IntegrationError } from "../types";

/**
 * Vinted Pro Integrations API client.
 *
 * Auth (per Vinted's docs): the access token from the Pro Integrations Portal is
 * "{access key},{signing key}". Every request sends the access key in
 * X-Vpi-Access-Key and an HMAC-SHA256 signature in X-Vpi-Hmac-Sha256:
 *   payload  = "{unix seconds}.{METHOD}.{path with query}.{access key}.{body}"
 *   header   = "t={unix seconds},v1={hex hmac of payload with the signing key}"
 * The signature is recomputed on every attempt so the timestamp stays fresh.
 */
export const VINTED_HOSTS = {
  production: "https://pro.svc.vinted.com",
  sandbox: "https://pro-public-sandbox.svc.vinted.com",
} as const;

export function parseVintedToken(token: string): { accessKey: string; signingKey: string } | null {
  const [accessKey, signingKey, ...rest] = token.trim().split(",").map((s) => s.trim());
  if (!accessKey || !signingKey || rest.length) return null;
  return { accessKey, signingKey };
}

export function signVintedRequest(args: { timestamp: number; method: string; path: string; accessKey: string; signingKey: string; body?: string }) {
  const payload = [args.timestamp, args.method.toUpperCase(), args.path, args.accessKey, args.body ?? ""].join(".");
  const hash = createHmac("sha256", args.signingKey).update(payload).digest("hex");
  return `t=${args.timestamp},v1=${hash}`;
}

const AUTH_ERRORS: Record<string, string> = {
  INVALID_ACCESS_KEY: "Vinted rejected the access key. Generate a new access token in the Vinted Pro Integrations Portal and update VINTED_ACCESS_TOKEN.",
  INVALID_HMAC_SIGNATURE: "Vinted rejected the request signature. Check VINTED_ACCESS_TOKEN is the full token (access key, comma, signing key).",
  REAUTHORISATION_REQUIRED: "Vinted needs you to log out and back into the Vinted Pro Integrations Portal, then reconnect.",
};

export class VintedClient {
  private readonly accessKey: string;
  private readonly signingKey: string;

  constructor(
    token: string,
    private readonly baseUrl: string = VINTED_HOSTS.production,
  ) {
    const parsed = parseVintedToken(token);
    if (!parsed) throw new IntegrationError("VINTED_ACCESS_TOKEN must be the full token from the Vinted Pro Integrations Portal: access key, a comma, then the signing key.", null, false, 401);
    this.accessKey = parsed.accessKey;
    this.signingKey = parsed.signingKey;
  }

  /** Signed GET with up to 3 attempts on rate limits, server errors and network failures (reads only). */
  async get(path: string): Promise<Response> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const timestamp = Math.floor(Date.now() / 1000);
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method: "GET",
          headers: {
            Accept: "application/json, application/pdf",
            "X-Vpi-Access-Key": this.accessKey,
            "X-Vpi-Hmac-Sha256": signVintedRequest({ timestamp, method: "GET", path, accessKey: this.accessKey, signingKey: this.signingKey }),
          },
          signal: AbortSignal.timeout(30_000),
        });
        if ((res.status === 429 || res.status >= 500) && attempt < 2) {
          const wait = Number(res.headers.get("retry-after")) || 2 ** attempt;
          await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
          continue;
        }
        return res;
      } catch (e) {
        lastError = e;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Vinted request failed");
  }

  async json<T>(path: string): Promise<T> {
    const res = await this.get(path);
    if (res.ok) return (await res.json()) as T;
    throw await vintedError(res);
  }
}

export async function vintedError(res: Response): Promise<IntegrationError> {
  let body: { error?: string } | null = null;
  try {
    body = (await res.json()) as { error?: string };
  } catch {
    body = null;
  }
  const code = body?.error ?? "";
  if (res.status === 401) return new IntegrationError(AUTH_ERRORS[code] ?? "Vinted rejected the access token (401).", body, false, 401);
  if (res.status === 429) return new IntegrationError("Vinted is rate limiting requests — try again shortly.", body, true, 429);
  return new IntegrationError(`Vinted returned HTTP ${res.status}${code ? ` (${code})` : ""}.`, body, res.status >= 500, res.status);
}
