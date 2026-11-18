import "server-only";
import { createAdminClient, type AdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import type { NormalisedOrder } from "./types";

export type RetryOutcome =
  | { ok: true; result: "created" | "updated" | "unchanged" | string; message: string }
  | { ok: false; message: string; attempts?: number };

/**
 * Manually retry one failed marketplace order from its stored payload.
 *
 * Uses the same idempotent ingest function as the sync engine, so a retry can
 * never duplicate an order, and a stale payload never overwrites newer
 * marketplace data. Every attempt is written to the failure's history.
 * Dismissed failures must be reopened first (so dismissing is never undone by
 * accident); resolved failures have nothing to retry.
 */
export async function retrySyncFailure(
  failureId: string,
  actor: { id: string | null; label: string },
  admin: AdminSupabase = createAdminClient(),
): Promise<RetryOutcome> {
  const { data: failure } = await admin
    .from("sync_failures")
    .select("id, provider, external_order_id, payload, resolved_at, dismissed_at")
    .eq("id", failureId)
    .maybeSingle();
  if (!failure) return { ok: false, message: "Failed order not found." };
  if (failure.resolved_at) return { ok: false, message: "This order has already imported — nothing to retry." };
  if (failure.dismissed_at) return { ok: false, message: "This failure was dismissed. Reopen it before retrying." };

  const payload = failure.payload as unknown as NormalisedOrder | null;
  if (!payload?.order || !Array.isArray(payload.items)) {
    return { ok: false, message: "No stored order data to retry from. It will be retried when the marketplace sends it again." };
  }

  await admin.from("sync_failure_events").insert({
    failure_id: failure.id,
    event: "retried",
    actor_id: actor.id,
    actor_label: actor.label,
    note: "Manual retry from stored order data",
  });

  const { data, error } = await admin.rpc("ingest_marketplace_order", {
    p_source: failure.provider,
    p_order: payload.order as unknown as Json,
    p_items: payload.items as unknown as Json,
    p_actor_label: actor.label,
    p_force: false,
  });

  if (error) {
    const { data: recorded } = await admin.rpc("record_sync_failure", {
      p_provider: failure.provider,
      p_external_order_id: failure.external_order_id,
      p_marketplace_updated_at: payload.order.marketplace_updated_at,
      p_payload: payload as unknown as Json,
      p_error: error.message,
      p_sync_log_id: null as unknown as string,
      p_actor_id: actor.id as string,
      p_actor_label: actor.label,
    });
    const attempts = (recorded as { attempts?: number } | null)?.attempts;
    return { ok: false, attempts, message: `Still failing: ${error.message}` };
  }

  await admin.rpc("resolve_sync_failure", {
    p_provider: failure.provider,
    p_external_order_id: failure.external_order_id,
    p_sync_log_id: null as unknown as string,
    p_actor_id: actor.id as string,
    p_actor_label: actor.label,
  });
  const result = (data as { result?: string } | null)?.result ?? "updated";
  return { ok: true, result, message: result === "created" ? "Order imported." : "Order updated — the failure is resolved." };
}
