import "server-only";
import { createAdminClient, type AdminSupabase } from "@/lib/supabase/admin";
import type { IntegrationProvider } from "@/lib/constants";
import type { Json } from "@/types/database";
import { getIntegration } from "./credentials";
import { clampSince } from "./import-window";
import { createAdapter } from "./registry";
import { IntegrationError, type NormalisedOrder, type SyncWarning } from "./types";

export type SyncTrigger = "scheduled" | "manual" | "initial" | "webhook" | "resync";

export type SyncOptions = {
  /** "resync" re-applies marketplace data to every order in the window, without moving the cursor. */
  mode?: "incremental" | "resync";
  /** Start of the window for a resync. Defaults to the integration's initial import window. */
  since?: Date;
};

export type SyncResult = {
  provider: IntegrationProvider;
  status: "success" | "partial" | "failed" | "skipped";
  message: string;
  pages?: number;
  fetched?: number;
  created?: number;
  updated?: number;
  failed?: number;
  retried?: number;
  recovered?: number;
  outstanding?: number;
};

/** Re-read a small overlap window each run so late-arriving updates are not missed. */
const OVERLAP_MS = 5 * 60_000;
/** Stop pulling new pages after this long, leaving headroom for serverless limits. */
const TIME_BUDGET_MS = 240_000;
/**
 * Per-marketplace lock. Slightly longer than a function's maximum duration
 * (300s) so a run that is killed mid-way frees its marketplace well before the
 * next 10-minute run, without ever allowing two runs to overlap.
 */
export const SYNC_LOCK_SECONDS = 330;
/**
 * A failing order holds the cursor back (so it is re-fetched from the
 * marketplace) for this many attempts. After that it no longer blocks the
 * cursor — to avoid an ever-growing fetch window — but it stays recorded in
 * sync_failures and is retried from its stored payload on every run until it
 * succeeds.
 */
export const FAILURE_CURSOR_HOLD_ATTEMPTS = 3;
/** Stored failures retried per run (those not already re-fetched). */
export const STORED_RETRY_BATCH = 50;

const LABEL: Record<IntegrationProvider, string> = { etsy: "Etsy sync", shopify: "Shopify sync", vinted: "Vinted sync" };
const NAME: Record<IntegrationProvider, string> = { etsy: "Etsy", shopify: "Shopify", vinted: "Vinted" };

function describeError(e: unknown) {
  if (e instanceof IntegrationError) return { message: e.message, details: e.details ?? null };
  if (e instanceof Error) return { message: e.message, details: null };
  return { message: String(e), details: null };
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.NaN);

/** Later of two timestamps (compared as instants, not strings). */
export function maxTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return time(b) > time(a) ? b : a;
}

/**
 * Next cursor = the high-water mark of fully fetched pages, but never past the
 * earliest order that failed this run and is still holding the cursor. Because
 * each run starts from (cursor − overlap), that order is fetched again.
 */
export function computeNextCursor(highWater: string | null, heldFailureTimes: (string | null | undefined)[]): string | null {
  const held = heldFailureTimes.filter((t): t is string => Boolean(t) && !Number.isNaN(time(t)));
  if (!held.length) return highWater;
  const earliest = held.reduce((a, b) => (time(b) < time(a) ? b : a));
  if (!highWater || time(earliest) < time(highWater)) return earliest;
  return highWater;
}

type OpenFailure = { external_order_id: string; attempts: number; payload: Json };

/**
 * Run one synchronisation for a provider.
 *  - Takes a DB lock so cron, manual and resync runs never overlap.
 *  - Incremental from the stored cursor (initial import window otherwise),
 *    limited to the history the marketplace permissions allow.
 *  - Every order goes through the idempotent `ingest_marketplace_order` RPC
 *    (one transaction per order), so duplicates are impossible and internal
 *    production data is preserved.
 *  - Failed orders are recorded in sync_failures with their payload, retried
 *    on later runs, and cleared when a retry succeeds. They hold the cursor
 *    back so they can't be silently skipped.
 */
export async function runSync(
  provider: IntegrationProvider,
  trigger: SyncTrigger,
  triggeredBy: string | null = null,
  admin?: AdminSupabase,
  options: SyncOptions = {},
): Promise<SyncResult> {
  // Never throw: one marketplace's problem must not stop another's sync.
  try {
    return await runSyncUnsafe(provider, trigger, triggeredBy, admin ?? createAdminClient(), options);
  } catch (e) {
    const err = describeError(e);
    console.error(`[sync:${provider}] unexpected error`, e);
    return { provider, status: "failed", message: `Unexpected error: ${err.message}` };
  }
}

async function runSyncUnsafe(
  provider: IntegrationProvider,
  trigger: SyncTrigger,
  triggeredBy: string | null,
  admin: AdminSupabase,
  options: SyncOptions,
): Promise<SyncResult> {
  const resync = options.mode === "resync";
  const integration = await getIntegration(admin, provider);
  if (integration.status !== "connected" && integration.status !== "error") {
    return { provider, status: "skipped", message: `${LABEL[provider]} skipped: not connected` };
  }

  const { data: locked } = await admin.rpc("acquire_sync_lock", { p_provider: provider, p_seconds: SYNC_LOCK_SECONDS });
  if (!locked) return { provider, status: "skipped", message: "A sync is already running for this marketplace." };

  // We hold this marketplace's lock, so any run still marked "running" was
  // interrupted (timeout/crash). Close it so the log stays truthful. Its
  // imported orders are kept and the cursor never moved past unsafe work.
  await admin
    .from("sync_logs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: "Run did not finish (timed out or was interrupted). Orders it imported are kept; this run continues from the last safe point.",
    })
    .eq("provider", provider)
    .eq("status", "running");

  const started = Date.now();
  const warnings: SyncWarning[] = [];
  const requestedSince = resync
    ? (options.since ?? new Date(started - integration.initial_import_days * 86_400_000))
    : integration.sync_cursor
      ? new Date(time(integration.sync_cursor) - OVERLAP_MS)
      : new Date(started - integration.initial_import_days * 86_400_000);
  const window = clampSince(provider, integration.scopes, requestedSince, started);
  const since = window.since;
  if (window.clamped) {
    warnings.push({
      code: "import_window_limited",
      message: `${NAME[provider]} only allows ${window.maxDays} days of order history with the current permissions; older orders were not requested.`,
      details: { requested_since: requestedSince.toISOString(), since: since.toISOString(), max_days: window.maxDays },
    });
  }
  const effectiveTrigger: SyncTrigger = resync ? "resync" : integration.sync_cursor ? trigger : "initial";

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
  const logId = log?.id ?? null;

  const counters = { pages: 0, fetched: 0, created: 0, updated: 0, failed: 0, retried: 0, recovered: 0 };
  const failures: { external_order_id: string; error: string; attempts: number }[] = [];
  const heldFailureTimes: string[] = [];
  const seen = new Set<string>();
  let highWater: string | null = integration.sync_cursor;
  let truncated = false;
  let restrictedCustomerData = false;

  // Failures still waiting to be resolved, from earlier runs.
  const { data: openRows } = await admin
    .from("sync_failures")
    .select("external_order_id, attempts, payload")
    .eq("provider", provider)
    .is("resolved_at", null)
    .is("dismissed_at", null)
    .order("last_failed_at", { ascending: true });
  const openFailures = new Map<string, OpenFailure>((openRows ?? []).map((r) => [r.external_order_id, r]));
  // Dismissed failures are not retried, but if the order later imports
  // successfully they are still marked resolved.
  const { data: dismissedRows } = await admin
    .from("sync_failures")
    .select("external_order_id")
    .eq("provider", provider)
    .is("resolved_at", null)
    .not("dismissed_at", "is", null);
  const dismissedIds = new Set((dismissedRows ?? []).map((r) => r.external_order_id));

  /** Ingest one order; record or resolve its failure state. */
  const ingest = async (normalised: NormalisedOrder, force: boolean): Promise<{ ok: boolean; attempts: number }> => {
    const extId = normalised.order.external_order_id;
    const { data, error } = await admin.rpc("ingest_marketplace_order", {
      p_source: provider,
      p_order: normalised.order as unknown as Json,
      p_items: normalised.items as unknown as Json,
      p_actor_label: LABEL[provider],
      p_force: force,
    });
    if (error) {
      counters.failed++;
      const { data: recorded } = await admin.rpc("record_sync_failure", {
        p_provider: provider,
        p_external_order_id: extId,
        p_marketplace_updated_at: normalised.order.marketplace_updated_at,
        p_payload: normalised as unknown as Json,
        p_error: error.message,
        p_sync_log_id: logId as string,
      });
      const rec = (recorded ?? {}) as { attempts?: number; dismissed?: boolean };
      const n = rec.attempts ?? 1;
      if (failures.length < 50) failures.push({ external_order_id: extId, error: error.message, attempts: n });
      // A dismissed failure never holds the cursor back again.
      return { ok: false, attempts: rec.dismissed ? Number.MAX_SAFE_INTEGER : n };
    }
    if (openFailures.has(extId) || dismissedIds.has(extId)) {
      await admin.rpc("resolve_sync_failure", { p_provider: provider, p_external_order_id: extId, p_sync_log_id: logId as string });
      if (openFailures.delete(extId)) counters.recovered++;
      dismissedIds.delete(extId);
    }
    const result = (data as { result: string }).result;
    if (result === "created") counters.created++;
    else if (result === "updated") counters.updated++;
    return { ok: true, attempts: 0 };
  };

  try {
    const { data: settings } = await admin.from("business_settings").select("default_dispatch_days").maybeSingle();
    const adapter = await createAdapter(admin, integration);

    for await (const page of adapter.fetchOrders({
      since,
      resync,
      defaultDispatchDays: settings?.default_dispatch_days ?? 3,
      onPage: (n) => (counters.pages = n),
      onWarning: (w) => {
        if (w.code === "customer_data_restricted") restrictedCustomerData = true;
        if (!warnings.some((x) => x.code === w.code && x.message === w.message)) warnings.push(w);
      },
    })) {
      for (const normalised of page.orders) {
        counters.fetched++;
        seen.add(normalised.order.external_order_id);
        const res = await ingest(normalised, resync);
        if (!res.ok && res.attempts <= FAILURE_CURSOR_HOLD_ATTEMPTS) {
          heldFailureTimes.push(normalised.order.marketplace_updated_at);
        }
      }
      highWater = maxTimestamp(highWater, page.maxUpdatedAt);
      if (Date.now() - started > TIME_BUDGET_MS) {
        truncated = true;
        break;
      }
    }

    // Retry stored failures that this run didn't fetch again (e.g. outside the
    // window, or no longer holding the cursor). A stale payload is safe: the
    // ingest function never overwrites newer marketplace data.
    if (!truncated) {
      for (const failure of [...openFailures.values()].filter((f) => !seen.has(f.external_order_id)).slice(0, STORED_RETRY_BATCH)) {
        counters.retried++;
        await ingest(failure.payload as unknown as NormalisedOrder, false);
      }
    }

    const nextCursor = resync ? integration.sync_cursor : computeNextCursor(highWater, heldFailureTimes);
    const outstanding = await countOutstanding(admin, provider);
    const parked = await countParked(admin, provider);
    if (parked > 0) {
      warnings.push({
        code: "failures_parked",
        message: `${parked} order(s) have failed ${FAILURE_CURSOR_HOLD_ATTEMPTS}+ times. They are retried from stored data on every sync until they import.`,
        details: { parked },
      });
    }

    const status = counters.failed > 0 || truncated ? "partial" : "success";
    const message = truncated
      ? resync
        ? "Time budget reached — resume the resync to continue from where it stopped."
        : "Time budget reached — remaining orders will be fetched on the next run."
      : counters.failed
        ? `${counters.failed} order(s) could not be imported and will be retried.`
        : null;

    await admin
      .from("sync_logs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        cursor_to: resync ? highWater : nextCursor,
        pages_fetched: counters.pages,
        orders_fetched: counters.fetched,
        orders_created: counters.created,
        orders_updated: counters.updated,
        orders_failed: counters.failed,
        orders_retried: counters.retried,
        orders_recovered: counters.recovered,
        failures_outstanding: outstanding,
        warnings: warnings as unknown as NonNullable<Json>,
        error_message: message,
        error_details: failures.length ? ({ failures } as unknown as Json) : null,
      })
      .eq("id", logId as string);

    const settingsJson = (integration.settings ?? {}) as Record<string, unknown>;
    const nextSettings = { ...settingsJson };
    if (resync) {
      if (truncated && highWater) {
        nextSettings.pending_resync = { from: highWater, requested_since: since.toISOString(), updated_at: new Date().toISOString() };
      } else {
        delete nextSettings.pending_resync;
      }
    }

    await admin
      .from("integrations")
      .update({
        status: "connected",
        sync_cursor: nextCursor,
        last_sync_finished_at: new Date().toISOString(),
        last_successful_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + integration.sync_interval_minutes * 60_000).toISOString(),
        consecutive_failures: 0,
        last_error: outstanding ? `${outstanding} order(s) waiting to be retried.` : null,
        last_error_at: counters.failed ? new Date().toISOString() : integration.last_error_at,
        sync_locked_until: null,
        settings: nextSettings as NonNullable<Json>,
        ...(provider === "shopify" && counters.fetched > 0
          ? { customer_data_access: restrictedCustomerData ? "restricted" : "available", customer_data_checked_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", integration.id);

    if (resync) {
      await admin.from("activity_log").insert({
        entity_type: "integration",
        entity_id: integration.id,
        action: "integration.resync",
        message: `${NAME[provider]} full resync ${truncated ? "paused" : "completed"}: ${counters.fetched} fetched, ${counters.updated} changed, ${counters.created} new${counters.failed ? `, ${counters.failed} failed` : ""}`,
        actor_id: triggeredBy,
        actor_label: triggeredBy ? null : LABEL[provider],
        metadata: { since: since.toISOString(), sync_log_id: logId } as NonNullable<Json>,
      });
    }

    return {
      provider,
      status,
      message: [
        `${counters.fetched} fetched · ${counters.created} new · ${counters.updated} updated`,
        counters.failed ? `${counters.failed} failed` : null,
        counters.recovered ? `${counters.recovered} recovered` : null,
        outstanding ? `${outstanding} awaiting retry` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      ...counters,
      outstanding,
    };
  } catch (e) {
    const err = describeError(e);
    const failuresCount = integration.consecutive_failures + 1;
    // Back off after repeated failures: 10, 20, 40… minutes (max 6h).
    const backoffMin = Math.min(360, integration.sync_interval_minutes * 2 ** Math.min(5, failuresCount - 1));
    const outstanding = await countOutstanding(admin, provider).catch(() => 0);
    await admin
      .from("sync_logs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        cursor_to: resync ? highWater : computeNextCursor(highWater, heldFailureTimes),
        pages_fetched: counters.pages,
        orders_fetched: counters.fetched,
        orders_created: counters.created,
        orders_updated: counters.updated,
        orders_failed: counters.failed,
        orders_retried: counters.retried,
        orders_recovered: counters.recovered,
        failures_outstanding: outstanding,
        warnings: warnings as unknown as NonNullable<Json>,
        error_message: err.message,
        error_details: JSON.parse(JSON.stringify({ details: err.details ?? null, consecutive_failures: failuresCount, failures })),
      })
      .eq("id", logId as string);
    await admin
      .from("integrations")
      .update({
        status: "error",
        // Keep progress made before the failure — but never past a failed order.
        sync_cursor: resync ? integration.sync_cursor : computeNextCursor(highWater, heldFailureTimes),
        last_sync_finished_at: new Date().toISOString(),
        last_error: err.message,
        last_error_at: new Date().toISOString(),
        consecutive_failures: failuresCount,
        next_sync_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
        sync_locked_until: null,
      })
      .eq("id", integration.id);
    return { provider, status: "failed", message: err.message, ...counters, outstanding };
  }
}

async function countOutstanding(admin: AdminSupabase, provider: IntegrationProvider) {
  const { count } = await admin
    .from("sync_failures")
    .select("id", { count: "exact", head: true })
    .eq("provider", provider)
    .is("resolved_at", null)
    .is("dismissed_at", null);
  return count ?? 0;
}

async function countParked(admin: AdminSupabase, provider: IntegrationProvider) {
  const { count } = await admin
    .from("sync_failures")
    .select("id", { count: "exact", head: true })
    .eq("provider", provider)
    .is("resolved_at", null)
    .is("dismissed_at", null)
    .gt("attempts", FAILURE_CURSOR_HOLD_ATTEMPTS);
  return count ?? 0;
}

/** Is this integration due for a scheduled sync? */
async function isDue(admin: AdminSupabase, provider: IntegrationProvider) {
  const { data: i } = await admin
    .from("integrations")
    .select("status, sync_enabled, next_sync_at")
    .eq("provider", provider)
    .maybeSingle();
  if (!i || !["connected", "error"].includes(i.status) || !i.sync_enabled) return false;
  return !i.next_sync_at || new Date(i.next_sync_at).getTime() <= Date.now() + 30_000;
}

/**
 * Scheduled sync for ONE marketplace (used by /api/cron/sync/[provider]).
 * Each marketplace has its own endpoint, function invocation, time budget,
 * lock, cursor and log, so they can never block or time out each other.
 */
export async function runScheduledSync(provider: IntegrationProvider): Promise<SyncResult> {
  try {
    const admin = createAdminClient();
    if (!(await isDue(admin, provider))) {
      return { provider, status: "skipped", message: `${NAME[provider]}: not connected, disabled or not due yet.` };
    }
    return await runSync(provider, "scheduled", null, admin);
  } catch (e) {
    return { provider, status: "failed", message: describeError(e).message };
  }
}

/**
 * Legacy combined endpoint (/api/cron/sync): runs each due marketplace
 * IN PARALLEL and isolated, so one failing or slow marketplace can't stop or
 * starve the other. Prefer the per-marketplace endpoints for scheduling.
 */
export async function runDueSyncs(): Promise<SyncResult[]> {
  const providers: IntegrationProvider[] = ["etsy", "shopify", "vinted"];
  const settled = await Promise.allSettled(providers.map((p) => runScheduledSync(p)));
  return settled.map((r, i) =>
    r.status === "fulfilled" ? r.value : { provider: providers[i]!, status: "failed" as const, message: String(r.reason) },
  );
}
