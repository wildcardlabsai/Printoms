import "server-only";
import type { AdminSupabase } from "@/lib/supabase/admin";
import type { FetchContext, FulfilmentPush, MarketplaceAdapter, OrderPage } from "../types";
import { IntegrationError } from "../types";
import { EtsyClient } from "./client";
import { mapEtsyReceipt, type EtsyReceipt } from "./mapper";

const PAGE_SIZE = 100;
const MAX_PAGES = 200; // safety valve: 20,000 receipts per run

export class EtsyAdapter implements MarketplaceAdapter {
  readonly provider = "etsy" as const;
  private client: EtsyClient;

  constructor(
    admin: AdminSupabase,
    integrationId: string,
    private readonly shopId: string,
  ) {
    this.client = new EtsyClient(admin, integrationId);
  }

  async *fetchOrders(ctx: FetchContext): AsyncGenerator<OrderPage> {
    const minLastModified = Math.floor(ctx.since.getTime() / 1000);
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        min_last_modified: String(minLastModified),
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        sort_on: "updated",
        sort_order: "asc",
      });
      const data = await this.client.request<{ count: number; results: EtsyReceipt[] }>(
        `/shops/${this.shopId}/receipts?${params.toString()}`,
      );
      ctx.onPage?.(page + 1);
      const orders = data.results.map((r) => mapEtsyReceipt(r, ctx.defaultDispatchDays));
      const maxUpdatedAt = orders.reduce<string | null>(
        (max, o) => (!max || o.order.marketplace_updated_at > max ? o.order.marketplace_updated_at : max),
        null,
      );
      yield { orders, maxUpdatedAt };
      if (data.results.length < PAGE_SIZE || (page + 1) * PAGE_SIZE >= data.count) return;
    }
  }

  async pushFulfilment(input: FulfilmentPush) {
    if (!input.trackingNumber) throw new IntegrationError("A tracking number is required to update Etsy.");
    const body = new URLSearchParams({ tracking_code: input.trackingNumber, carrier_name: input.carrier ?? "other", send_bcc: "true" });
    await this.client.request(`/shops/${this.shopId}/receipts/${encodeURIComponent(input.externalOrderId)}/tracking`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    return { externalId: null };
  }
}
