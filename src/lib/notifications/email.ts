import "server-only";
import { serverEnv } from "@/lib/server-env";

export type EmailResult = { ok: true; id: string | null } | { ok: false; error: string; retryable: boolean };

/**
 * Send one email with Resend (POST https://api.resend.com/emails).
 * The Idempotency-Key means a retried request never sends the same email twice
 * (Resend keeps keys for 24 hours).
 */
export async function sendEmail(input: { to: string; subject: string; html: string; text: string; idempotencyKey?: string }): Promise<EmailResult> {
  const key = serverEnv.email.resendApiKey;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set.", retryable: false };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({ from: serverEnv.email.from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
    if (res.ok) return { ok: true, id: body?.id ?? null };
    const message = body?.message ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: `Resend refused the request: ${message}. Check RESEND_API_KEY, and that the sender address is allowed (with onboarding@resend.dev you can only send to your own Resend account email).`, retryable: false };
    }
    return { ok: false, error: `Resend error: ${message}`, retryable: res.status === 429 || res.status >= 500 };
  } catch (e) {
    return { ok: false, error: `Could not reach Resend: ${e instanceof Error ? e.message : String(e)}`, retryable: true };
  }
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
