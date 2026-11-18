import { z } from "zod";
import type { IntegrationProvider } from "@/lib/constants";
import { allowedImportOptions } from "./import-window";

export const RESYNC_OVERLAP_MS = 5 * 60_000;

const bodySchema = z.union([
  z.object({ confirm: z.literal(true), resume: z.literal(true) }),
  z.object({ confirm: z.literal(true), days: z.number().int().positive() }),
]);

export type ResyncValidation = { ok: true; since: Date } | { ok: false; error: string };

/**
 * Validate a full-resync request: explicit confirmation is required, the
 * window must be one the marketplace permissions can serve, and "resume"
 * needs a paused resync to continue from.
 */
export function validateResyncRequest(
  body: unknown,
  provider: IntegrationProvider,
  integration: { scopes: string[] | null; settings: unknown },
  now = Date.now(),
): ResyncValidation {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "Confirm the resync and choose a valid window." };
  if ("resume" in parsed.data) {
    const from = (integration.settings as { pending_resync?: { from?: string } } | null)?.pending_resync?.from;
    if (!from || Number.isNaN(Date.parse(from))) return { ok: false, error: "There is no paused resync to resume." };
    return { ok: true, since: new Date(Date.parse(from) - RESYNC_OVERLAP_MS) };
  }
  const allowed = allowedImportOptions(provider, integration.scopes);
  if (!allowed.includes(parsed.data.days)) {
    return {
      ok: false,
      error: `Choose one of: ${allowed.join(", ")} days. Longer windows aren’t available with the current marketplace permissions.`,
    };
  }
  return { ok: true, since: new Date(now - parsed.data.days * 86_400_000) };
}
