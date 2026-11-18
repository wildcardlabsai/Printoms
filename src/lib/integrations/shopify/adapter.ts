import "server-only";
import type { FetchContext, FulfilmentPush, MarketplaceAdapter, OrderPage } from "../types";
import { IntegrationError } from "../types";
import { ShopifyClient } from "./client";
import { mapShopifyOrder, type ShopifyOrderNode } from "./mapper";

const ORDERS_QUERY = /* GraphQL */ `
  query PrintFlowOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name createdAt updatedAt cancelledAt email note
        displayFinancialStatus displayFulfillmentStatus currencyCode
        customer { id displayName email }
        shippingAddress { name address1 address2 city province zip countryCodeV2 phone }
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalPriceSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        shippingLine { title }
        lineItems(first: 100) {
          nodes {
            id title variantTitle quantity sku
            originalUnitPriceSet { shopMoney { amount } }
            discountedTotalSet { shopMoney { amount } }
            customAttributes { key value }
            product { id }
            variant { id }
          }
        }
      }
    }
  }
`;

const FULFILLMENT_ORDERS_QUERY = /* GraphQL */ `
  query PrintFlowFulfillmentOrders($id: ID!) {
    order(id: $id) {
      fulfillmentOrders(first: 20) { nodes { id status } }
    }
  }
`;

const FULFILLMENT_CREATE = /* GraphQL */ `
  mutation PrintFlowFulfil($fulfillment: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $fulfillment) {
      fulfillment { id status }
      userErrors { field message }
    }
  }
`;

const PAGE_SIZE = 50;
const MAX_PAGES = 400;

export class ShopifyAdapter implements MarketplaceAdapter {
  readonly provider = "shopify" as const;
  private client: ShopifyClient;

  constructor(shop: string, accessToken: string) {
    this.client = new ShopifyClient(shop, accessToken);
  }

  async *fetchOrders(ctx: FetchContext): AsyncGenerator<OrderPage> {
    let after: string | null = null;
    const query = `updated_at:>='${ctx.since.toISOString()}'`;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyOrderNode[] } } =
        await this.client.graphql(ORDERS_QUERY, { first: PAGE_SIZE, after, query });
      ctx.onPage?.(page + 1);
      const orders = data.orders.nodes.map((n) => mapShopifyOrder(n, ctx.defaultDispatchDays));
      const maxUpdatedAt = orders.reduce<string | null>(
        (max, o) => (!max || o.order.marketplace_updated_at > max ? o.order.marketplace_updated_at : max),
        null,
      );
      yield { orders, maxUpdatedAt };
      if (!data.orders.pageInfo.hasNextPage) return;
      after = data.orders.pageInfo.endCursor;
    }
  }

  async pushFulfilment(input: FulfilmentPush) {
    const fo = await this.client.graphql<{ order: { fulfillmentOrders: { nodes: { id: string; status: string }[] } } | null }>(
      FULFILLMENT_ORDERS_QUERY,
      { id: input.externalOrderId },
    );
    const open = fo.order?.fulfillmentOrders.nodes.filter((n) => ["OPEN", "IN_PROGRESS"].includes(n.status)) ?? [];
    if (!open.length) throw new IntegrationError("Shopify has no open fulfilment orders for this order (it may already be fulfilled).");
    const result = await this.client.graphql<{
      fulfillmentCreate: { fulfillment: { id: string } | null; userErrors: { message: string }[] };
    }>(FULFILLMENT_CREATE, {
      fulfillment: {
        lineItemsByFulfillmentOrder: open.map((n) => ({ fulfillmentOrderId: n.id })),
        notifyCustomer: true,
        trackingInfo: {
          number: input.trackingNumber ?? undefined,
          company: input.carrier ?? undefined,
          url: input.trackingUrl ?? undefined,
        },
      },
    });
    if (result.fulfillmentCreate.userErrors.length) {
      throw new IntegrationError(`Shopify: ${result.fulfillmentCreate.userErrors.map((e) => e.message).join("; ")}`);
    }
    return { externalId: result.fulfillmentCreate.fulfillment?.id ?? null };
  }
}

/** Lightweight connection check used when connecting with an access token. */
export async function fetchShopInfo(shop: string, accessToken: string) {
  const client = new ShopifyClient(shop, accessToken);
  const data = await client.graphql<{ shop: { name: string; myshopifyDomain: string; currencyCode: string } }>(
    "query { shop { name myshopifyDomain currencyCode } }",
  );
  return data.shop;
}
