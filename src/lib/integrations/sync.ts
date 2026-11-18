import "server-only";
import { createAdminClient, type AdminSupabase } from "@/lib/supabase/admin";
import type { IntegrationProvider } from "@/lib/constants";
import { getIntegration } from "./credentials";
import { createAdapter } from "./registry";
import { IntegrationError } from "./types";

export type SyncTrigger = "scheduled" | "manual" | "initial" | "webhook";

export type SyncResult = {
  provider: IntegrationProvider;
  status: "success" | "partial" | "failed" | "skipped";
  message: string;
  fetched?: number;
  created?: number;
  updated?: number;
  failed?: number;
};

/** Re-read a small overlap window each run so late-arriving updates are not missed. */
const OVERLAP_MS = 5 * 60_000;
/** Stop pulling new pages after this long, leaving headroom for serverless limits. */
const TIME_BUDGET_MS = 240_000;
const LABEL: Record<IntegrationProvider, string> = { etsy: "Etsy sync", shopify: "Shopify sync" };

function describeError(e: unknown) {
  if (e instanceof IntegrationError) return { message: e.message, details: e.details ?? null };
  if (e instanceof Error) return { message: e.message, details: null };
  return { message: String(e), details: null };
}

/**
 * Run one synchronisation for a provider.
 *  - Takes a DB lock so cron and manual runs never overlap.
 *  - Incremental from the stored high-water mark (initial import window otherwise).
 *  - Every order goes through the idempotent `ingest_marketplace_order` RPC, so
 *    duplicates are impossible and internal production data is preserved.
 *  - Each order is isolated: one bad record is logged but does not fail the run.
 */
export async function runSync(
  provider: IntegrationProvider,
  trigger: SyncTrigger,
  triggeredBy: string | null = null,
  admin: AdminSupabase = createAdminClient(),
): Promise<SyncResult> {
  const integration = await getIntegration(admin, provider);
  if (integration.status !== "connected" && integration.status !== "error") {
    return { provider, status: "skipped", message: `${LABEL[provider]} skipped: not connected` };
  }

  const { data: locked } = await admin.rpc("acquire_sync_lock", { p_provider: provider, p_seconds: 600 });
  if (!locked) return { provider, status: "skipped", message: "A sync is already running for this marketplace." };

  const started = Date.now();
  const since = integration.sync_cursor
    ? new Date(new Date(integration.sync_cursor).getTime() - OVERLAP_MS)
    : new Date(Date.now() - integration.initial_import_days * 86_400_000);
  const effectiveTrigger: SyncTrigger = integration.sync_cursor ? trigger : "initial";

  const { data: log } = await admin
    .from("sync_logs")
    .insert({
      integration_id: integration.id,
      provider,
      trigger: effectiveTrigger,
      status: "running",
      cursor_from: since.toISOString(),
      triggered_by: triggeredBy,
    })
    .select("id")
    .single();

  const counters = { pages: 0, fetched: 0, created: 0, updated: 0, failed: 0 };
  const failures: { external_order_id: string; error: string }[] = [];
  let highWater: string | null = integration.sync_cursor;
  let truncated = false;

  try {
    const { data: settings } = await admin.from("business_settings").select("default_dispatch_days").maybeSingle();
    const adapter = await createAdapter(admin, integration);

    for await (const page of adapter.fetchOrders({
      since,
      defaultDispatchDays: settings?.default_dispatch_days ?? 3,
      onPage: (n) => (counters.pages = n),
    })) {
      for (const normalised of page.orders) {
        counters.fetched++;
        const { data, error } = await admin.rpc("ingest_marketplace_order", {
          p_source: provider,
          p_order: normalised.order,
          p_items: normalised.items,
          p_actor_label: LABEL[provider],
        });
        if (error) {
          counters.failed++;
          if (failures.length < 25) failures.push({ external_order_id: normalised.order.external_order_id, error: error.message });
          continue;
        }
        const result = (data as { result: string }).result;
        if (result === "created") counters.created++;
        else if (result === "updated") counters.updated++;
      }
      // Only advance the cursor past orders we have fully processed.
      if (page.maxUpdatedAt && (!highWater || page.maxUpdatedAt > highWater)) highWater = page.maxUpdatedAt;
      if (Date.now() - started > TIME_BUDGET_MS) {
        truncated = true;
        break;
      }
    }

    const status = counters.failed > 0 || truncated ? "partial" : "success";
    const message = truncated
      ? "Time budget reached — remaining orders will be fetched on the next run."
      : counters.failed
        ? `${counters.failed} order(s) could not be imported.`
        : null;

    await admin
      .from("sync_logs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        cursor_to: highWater,
        pages_fetched: counters.pages,
        orders_fetched: counters.fetched,
        orders_created: counters.created,
        orders_updated: counters.updated,
        orders_failed: counters.failed,
        error_message: message,
        error_details: failures.length ? { failures } : null,
      })
      .eq("id", log!.id);

    await admin
      .from("integrations")
      .update({
        status: "connected",
        sync_cursor: highWater,
        last_sync_finished_at: new Date().toISOString(),
        last_successful_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + integration.sync_interval_minutes * 60_000).toISOString(),
        consecutive_failures: 0,
        last_error: counters.failed ? message : null,
        last_error_at: counters.failed ? new Date().toISOString() : integration.last_error_at,
        sync_locked_until: null,
      })
      .eq("id", integration.id);

    return {
      provider,
      status,
      message: `${counters.fetched} fetched · ${counters.created} new · ${counters.updated} updated${counters.failed ? ` · ${counters.failed} failed` : ""}`,
      ...counters,
    };
  } catch (e) {
    const err = describeError(e);
    const failures = integration.consecutive_failures + 1;
    // Back off after repeated failures: 10, 20, 40… minutes (max 6h).
    const backoffMin = Math.min(360, integration.sync_interval_minutes * 2 ** Math.min(5, failures - 1));
    await admin
      .from("sync_logs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        cursor_to: highWater,
        pages_fetched: counters.pages,
        orders_fetched: counters.fetched,
        orders_created: counters.created,
        orders_updated: counters.updated,
        orders_failed: counters.failed,
        error_message: err.message,
        error_details: JSON.parse(JSON.stringify({ details: err.details ?? null, failures })),
      })
      .eq("id", log!.id);
    await admin
      .from("integrations")
      .update({
        status: "error",
        // Keep progress made before the failure.
        sync_cursor: highWater,
        last_sync_finished_at: new Date().toISOString(),
        last_error: err.message,
        last_error_at: new Date().toISOString(),
        consecutive_failures: failures,
        next_sync_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
        sync_locked_until: null,
      })
      .eq("id", integration.id);
    return { provider, status: "failed", message: err.message, ...counters };
  }
}

/** Run every connected integration whose next scheduled sync is due. Used by cron. */
export async function runDueSyncs(): Promise<SyncResult[]> {
  const admin = createAdminClient();
  const { data: integrations } = await admin
    .from("integrations")
    .select("provider, status, sync_enabled, next_sync_at")
    .in("status", ["connected", "error"])
    .eq("sync_enabled", true);
  const due = (integrations ?? []).filter((i) => !i.next_sync_at || new Date(i.next_sync_at).getTime() <= Date.now() + 30_000);
  const results: SyncResult[] = [];
  for (const i of due) results.push(await runSync(i.provider, "scheduled", null, admin));
  return results;
}
