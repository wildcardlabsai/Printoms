import "server-only";
import type { AdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { getIntegration } from "./credentials";
import { createAdapter } from "./registry";
import type { FeeTarget } from "./types";

/** Orders this old or newer get their fees refreshed (refunds can change fees). */
export const FEE_LOOKBACK_DAYS = 60;
/** How often an order's fees are re-read. */
export const FEE_REFRESH_HOURS = 6;
const BATCH = 40;

export type FeeSyncResult = { status: "done" | "skipped" | "failed"; orders: number; actual: number; error?: string };

/**
 * Read actual fees for recent marketplace orders (read-only) and store them.
 * Runs after a sync; never throws, so fee problems can't affect order import.
 */
export async function syncOrderFees(admin: AdminSupabase, provider: "etsy" | "shopify"): Promise<FeeSyncResult> {
  try {
    const integration = await getIntegration(admin, provider);
    if (integration.status !== "connected" && integration.status !== "error") return { status: "skipped", orders: 0, actual: 0 };
    const now = Date.now();
    const { data: rows, error } = await admin
      .from("orders")
      .select("id, external_order_id, order_date, order_items(external_line_item_id)")
      .eq("source", provider)
      .eq("is_sample", false)
      .neq("status", "cancelled")
      .not("external_order_id", "is", null)
      .gte("order_date", new Date(now - FEE_LOOKBACK_DAYS * 86_400_000).toISOString())
      .or(`fees_synced_at.is.null,fees_synced_at.lt.${new Date(now - FEE_REFRESH_HOURS * 3_600_000).toISOString()}`)
      .order("fees_synced_at", { ascending: true, nullsFirst: true })
      .limit(BATCH);
    if (error) throw new Error(error.message);
    if (!rows?.length) return { status: "done", orders: 0, actual: 0 };

    const adapter = await createAdapter(admin, integration);
    if (!adapter.fetchOrderFees) return { status: "skipped", orders: 0, actual: 0 };
    const targets: FeeTarget[] = rows.map((r) => ({
      id: r.id,
      external_order_id: r.external_order_id!,
      order_date: r.order_date,
      line_ids: (r.order_items ?? []).map((i) => i.external_line_item_id).filter((x): x is string => Boolean(x)),
    }));
    const fees = await adapter.fetchOrderFees(targets);
    let actual = 0;
    for (const t of targets) {
      const f = fees.get(t.id);
      if (!f) continue;
      const { error: recErr } = await admin.rpc("record_order_fees", { p_order_id: t.id, p_basis: f.basis, p_lines: f.lines as unknown as Json });
      if (recErr) throw new Error(recErr.message);
      if (f.basis === "actual") actual++;
    }
    return { status: "done", orders: fees.size, actual };
  } catch (e) {
    return { status: "failed", orders: 0, actual: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
