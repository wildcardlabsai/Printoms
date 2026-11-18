import "server-only";
import { createAdminClient, type AdminSupabase } from "@/lib/supabase/admin";
import type { IntegrationProvider } from "@/lib/constants";
import type { Json } from "@/types/database";
import { findCarrier, trackingUrlFor, validateTracking, validateTrackingUrl } from "./carriers";
import { getIntegration } from "./credentials";
import { createAdapter } from "./registry";
import { IntegrationError, type FulfilmentPush } from "./types";

export type ErrorCategory = "validation" | "credentials" | "rate_limited" | "marketplace_rejected" | "marketplace_error" | "network" | "unknown";

export type PushOutcome =
  | { ok: true; status: "succeeded" | "already_fulfilled"; message: string; attempt: number }
  | { ok: false; category: ErrorCategory; retryable: boolean; message: string; attempt?: number };

/** Classify a failure so the UI can say what to do next. */
export function categoriseError(e: unknown): { category: ErrorCategory; retryable: boolean; status: number | null; message: string } {
  const message = e instanceof Error ? e.message : String(e);
  const status = e instanceof IntegrationError ? (e.status ?? null) : null;
  if (status === 401 || status === 403 || /reconnect|not connected|no stored credentials|access token/i.test(message)) {
    return { category: "credentials", retryable: false, status, message };
  }
  if (status === 429) return { category: "rate_limited", retryable: true, status, message };
  if (status !== null && status >= 500) return { category: "marketplace_error", retryable: true, status, message };
  if (status !== null && status >= 400) return { category: "marketplace_rejected", retryable: false, status, message };
  if (/timeout|timed out|aborted|fetch failed|network|ECONN|ENOTFOUND|socket/i.test(message)) {
    // The request may have reached the marketplace: a retry checks first.
    return { category: "network", retryable: true, status, message };
  }
  return { category: "unknown", retryable: true, status, message };
}

/**
 * Send dispatch tracking for one shipment back to Etsy/Shopify.
 *
 * Safety rules:
 *  - Only real, dispatched, marketplace orders (never sample/manual/cancelled).
 *  - The tracking number must be valid (no placeholders); links must be https.
 *  - One submission in flight per shipment (DB unique index); "sent" is final.
 *  - Before submitting, the marketplace is checked for this tracking number so
 *    a retry after a timeout never creates a duplicate fulfilment.
 *  - Every attempt is recorded with its request, response and outcome. The
 *    order's dispatch status is never changed by this function.
 */
export async function pushShipmentToMarketplace(shipmentId: string, userId: string | null = null, admin: AdminSupabase = createAdminClient()): Promise<PushOutcome> {
  const { data: shipment } = await admin
    .from("shipments")
    .select("id, status, carrier, tracking_number, tracking_url, marketplace_push_status, order:orders(id, source, status, is_sample, external_order_id)")
    .eq("id", shipmentId)
    .maybeSingle();
  const reject = (message: string): PushOutcome => ({ ok: false, category: "validation", retryable: false, message });

  if (!shipment?.order) return reject("Shipment not found.");
  const order = shipment.order;
  if (order.is_sample) return reject("Sample orders are never sent to a marketplace.");
  if (order.source === "manual" || !order.external_order_id) return reject("Manual orders have no marketplace to update.");
  if (shipment.status !== "dispatched" || !["dispatched", "completed"].includes(order.status)) {
    return reject("Only orders that have actually been dispatched can be sent to the marketplace.");
  }
  if (shipment.marketplace_push_status === "sent") return reject("Tracking has already been sent for this shipment.");

  const tracking = validateTracking(shipment.carrier, shipment.tracking_number);
  if (!tracking.ok) return reject(tracking.error);
  const url = validateTrackingUrl(shipment.tracking_url);
  if (!url.ok) return reject(url.error);

  const provider = order.source as IntegrationProvider;
  const integration = await getIntegration(admin, provider);
  if (integration.status !== "connected" && integration.status !== "error") {
    return { ok: false, category: "credentials", retryable: false, message: `${provider === "etsy" ? "Etsy" : "Shopify"} is not connected.` };
  }

  const input: FulfilmentPush = {
    externalOrderId: order.external_order_id,
    carrier: shipment.carrier,
    trackingNumber: tracking.normalised,
    trackingUrl: trackingUrlFor(shipment.carrier, tracking.normalised, url.url),
  };
  const carrier = findCarrier(shipment.carrier);
  const request = {
    provider,
    external_order_id: input.externalOrderId,
    tracking_number: input.trackingNumber,
    carrier: provider === "etsy" ? carrier.etsy : carrier.shopify,
    tracking_url: input.trackingUrl,
  };

  const { data: claim, error: claimError } = await admin.rpc("begin_fulfilment_submission", {
    p_shipment_id: shipment.id,
    p_provider: provider,
    p_request: request as unknown as Json,
    p_user: userId as string,
  });
  if (claimError) return reject(claimError.message);
  const { submission_id: submissionId, attempt } = claim as { submission_id: string; attempt: number };

  const finish = (args: Record<string, unknown>) =>
    admin.rpc("finish_fulfilment_submission", { p_submission_id: submissionId, ...args } as never);

  try {
    const adapter = await createAdapter(admin, integration);
    const existing = await adapter.findExistingFulfilment(input);
    if (existing) {
      await finish({ p_status: "already_fulfilled", p_external_id: existing.externalId, p_response: { existing } as unknown as Json });
      return { ok: true, status: "already_fulfilled", attempt, message: "This tracking number was already on the marketplace — recorded as sent, nothing submitted twice." };
    }
    const result = await adapter.pushFulfilment(input);
    await finish({ p_status: "succeeded", p_external_id: result.externalId, p_response: (result.response ?? null) as Json });
    return { ok: true, status: "succeeded", attempt, message: `Tracking sent to ${provider === "etsy" ? "Etsy" : "Shopify"}.` };
  } catch (e) {
    const c = categoriseError(e);
    const details = e instanceof IntegrationError ? e.details : null;
    await finish({
      p_status: "failed",
      p_error_category: c.category,
      p_retryable: c.retryable,
      p_http_status: c.status,
      p_response: JSON.parse(JSON.stringify(details ?? null)) as Json,
      p_error_message: c.message,
    });
    return { ok: false, category: c.category, retryable: c.retryable, attempt, message: c.message };
  }
}
