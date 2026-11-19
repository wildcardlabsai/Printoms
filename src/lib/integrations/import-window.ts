import type { IntegrationProvider } from "@/lib/constants";

/**
 * How far back each marketplace lets PrintFlow read orders.
 *
 *  - Etsy: receipts are available for the shop's full history.
 *  - Shopify: without the `read_all_orders` scope, the Admin API only returns
 *    orders from the last 60 days (by creation date). With the scope granted,
 *    the full history is available.
 *
 * The UI only offers windows the granted permissions can actually serve, and
 * the sync engine clamps anything older.
 */
export const IMPORT_WINDOW_OPTIONS = [14, 30, 60, 90, 180, 365] as const;
export const SHOPIFY_DEFAULT_HISTORY_DAYS = 60;
export const MAX_HISTORY_DAYS = 365;

export function hasAllOrdersScope(scopes: readonly string[] | null | undefined) {
  return (scopes ?? []).includes("read_all_orders");
}

export function maxImportDays(provider: IntegrationProvider, scopes: readonly string[] | null | undefined): number {
  if (provider !== "shopify") return MAX_HISTORY_DAYS;
  return hasAllOrdersScope(scopes) ? MAX_HISTORY_DAYS : SHOPIFY_DEFAULT_HISTORY_DAYS;
}

export function allowedImportOptions(provider: IntegrationProvider, scopes: readonly string[] | null | undefined): number[] {
  const max = maxImportDays(provider, scopes);
  return IMPORT_WINDOW_OPTIONS.filter((d) => d <= max);
}

/** Never ask a marketplace for more history than its permissions allow. */
export function clampSince(
  provider: IntegrationProvider,
  scopes: readonly string[] | null | undefined,
  since: Date,
  now = Date.now(),
): { since: Date; clamped: boolean; maxDays: number } {
  const maxDays = maxImportDays(provider, scopes);
  const earliest = new Date(now - maxDays * 86_400_000);
  return since < earliest ? { since: earliest, clamped: true, maxDays } : { since, clamped: false, maxDays };
}
