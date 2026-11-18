import "server-only";
import { IntegrationError } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  label?: string;
};

/**
 * fetch with timeout, exponential backoff + jitter, and Retry-After support.
 * Retries network errors, 429 and 5xx. Other 4xx responses are returned to
 * the caller unchanged so they can produce a useful error.
 */
export async function fetchWithRetry(url: string, init: RequestInit = {}, opts: RetryOptions = {}): Promise<Response> {
  const { retries = 4, baseDelayMs = 800, maxDelayMs = 30_000, timeoutMs = 30_000, label = "request" } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      if (res.status !== 429 && res.status < 500) return res;
      lastError = new IntegrationError(`${label} failed with HTTP ${res.status}`, await safeText(res), true);
      if (attempt === retries) return res;
      const retryAfter = Number(res.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt, baseDelayMs, maxDelayMs);
      await sleep(Math.min(delay, maxDelayMs));
    } catch (e) {
      lastError = e;
      if (attempt === retries) break;
      await sleep(backoff(attempt, baseDelayMs, maxDelayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new IntegrationError(`${label} failed`, lastError, true);
}

function backoff(attempt: number, base: number, max: number) {
  const exp = Math.min(max, base * 2 ** attempt);
  return exp / 2 + Math.random() * (exp / 2);
}

export async function safeText(res: Response) {
  try {
    return (await res.text()).slice(0, 2000);
  } catch {
    return "";
  }
}

export { sleep };
