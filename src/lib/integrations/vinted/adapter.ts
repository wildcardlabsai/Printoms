import "server-only";
import type { AdminSupabase } from "@/lib/supabase/admin";
import { IntegrationError, type FetchContext, type MarketplaceAdapter, type NormalisedOrder, type OrderPage } from "../types";
import { VintedClient, vintedError } from "./client";
import { mapVintedOrder, type VintedOrder, type VintedOrderListElement } from "./mapper";

const DETAIL_BATCH = 25;
const MAX_LIST_PAGES = 400;

/**
 * Vinted Pro Integrations: orders are read-only for PrintFlow.
 *
 * GetOrders only returns id, created date and status (paged with `after-id`),
 * and orders have no "updated at". Each run therefore lists the orders and
 * fetches full details (GetOrder) only for:
 *   - orders PrintFlow doesn't have yet, created inside the sync window;
 *   - orders whose Vinted status differs from the one stored;
 *   - during a full resync, every order created inside the window.
 */
export class VintedAdapter implements MarketplaceAdapter {
  readonly provider = "vinted" as const;
  readonly client: VintedClient;

  constructor(
    private readonly admin: AdminSupabase,
    token: string,
    baseUrl?: string,
  ) {
    this.client = new VintedClient(token, baseUrl);
  }

  /** Every order in the account, oldest id first. */
  async listOrders(onPage?: (page: number) => void): Promise<VintedOrderListElement[]> {
    const all: VintedOrderListElement[] = [];
    let after: number | null = null;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const data: { orders?: VintedOrderListElement[] } = await this.client.json(`/api/v1/orders${after ? `?after-id=${after}` : ""}`);
      onPage?.(page + 1);
      const orders = data.orders ?? [];
      if (!orders.length) break;
      all.push(...orders);
      const maxId = Math.max(...orders.map((o) => o.id));
      if (after !== null && maxId <= after) break; // no progress: stop rather than loop
      after = maxId;
    }
    return all;
  }

  private async storedStatuses(): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.admin
        .from("orders")
        .select("external_order_id, marketplace_status")
        .eq("source", "vinted")
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) if (r.external_order_id) out.set(r.external_order_id, r.marketplace_status);
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async *fetchOrders(ctx: FetchContext): AsyncGenerator<OrderPage> {
    const [list, stored] = await Promise.all([this.listOrders(ctx.onPage), this.storedStatuses()]);
    const since = ctx.since.getTime();
    const wanted = list.filter((o) => {
      const known = stored.get(String(o.id));
      const inWindow = new Date(o.created_at).getTime() >= since;
      if (known === undefined) return inWindow;
      return known !== o.status || (ctx.resync === true && inWindow);
    });
    const newest = list.reduce<string | null>((max, o) => (!max || o.created_at > max ? o.created_at : max), null);

    let batch: NormalisedOrder[] = [];
    for (const item of wanted) {
      try {
        const detail = await this.client.json<VintedOrder>(`/api/v1/orders/${item.id}`);
        batch.push(mapVintedOrder(detail, ctx.defaultDispatchDays, new Date().toISOString()));
      } catch (e) {
        if (e instanceof IntegrationError && e.status === 401) throw e;
        ctx.onWarning?.({
          code: "order_fetch_failed",
          message: `Vinted order ${item.id} could not be loaded (${e instanceof Error ? e.message : "error"}). It is tried again on the next sync.`,
          details: { order_id: item.id },
        });
      }
      if (batch.length >= DETAIL_BATCH) {
        yield { orders: batch, maxUpdatedAt: null };
        batch = [];
      }
    }
    // The cursor tracks the newest order *creation* time seen.
    yield { orders: batch, maxUpdatedAt: newest };
  }

  /** The shipping label PDF Vinted generated for this order. */
  async shipmentLabel(orderId: string): Promise<{ ok: true; pdf: ArrayBuffer } | { ok: false; reason: string }> {
    const res = await this.client.get(`/api/v1/orders/${encodeURIComponent(orderId)}/shipment-label`);
    if (res.ok) return { ok: true, pdf: await res.arrayBuffer() };
    if (res.status === 404) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      const reason =
        body?.error === "LABEL_CREATION_IN_PROGRESS" ? "Vinted is still creating the label — try again in a minute."
        : body?.error === "LABEL_CREATION_FAILED" ? "Vinted could not create the label. Open the order on Vinted."
        : "No label available. Vinted only provides labels for items listed through Vinted Pro Integrations — download it from Vinted instead.";
      return { ok: false, reason };
    }
    throw await vintedError(res);
  }

  /** Vinted creates the label and tracks the parcel itself: nothing is sent back. */
  async pushFulfilment(): Promise<never> {
    throw new IntegrationError("Vinted tracks the parcel from its own shipping label — there is nothing to send back.", null, false, 400);
  }

  async findExistingFulfilment() {
    return null;
  }
}
