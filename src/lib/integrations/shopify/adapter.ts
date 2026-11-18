import "server-only";
import type { FetchContext, FulfilmentPush, MarketplaceAdapter, OrderPage } from "../types";
import { IntegrationError } from "../types";
import { ShopifyClient } from "./client";
import { mapShopifyOrder, type ShopifyOrderNode } from "./mapper";
import { findCarrier, normaliseTracking } from "../carriers";
import { ALL_RESTRICTED_FIELDS, classifyGraphQLErrors, restrictedFieldsFor, type GraphQLError } from "./protected-data";

// Fields that never contain protected customer data.
const ORDER_CORE_FIELDS = `
        id name createdAt updatedAt cancelledAt note
        displayFinancialStatus displayFulfillmentStatus currencyCode
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalPriceSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        shippingLine { title }
        lineItems(first: 100) {
          pageInfo { hasNextPage }
          nodes {
            id title variantTitle quantity currentQuantity sku
            originalUnitPriceSet { shopMoney { amount } }
            discountedTotalSet { shopMoney { amount } }
            customAttributes { key value }
            product { id }
            variant { id }
          }
        }`;

// Protected customer data (requires Shopify protected customer data approval).
const ORDER_CUSTOMER_FIELDS = `
        email
        customer { id displayName email }
        shippingAddress { name address1 address2 city province zip countryCodeV2 phone }`;

const ordersQuery = (withCustomerData: boolean) => /* GraphQL */ `
  query PrintFlowOrders${withCustomerData ? "" : "Restricted"}($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {${ORDER_CORE_FIELDS}${withCustomerData ? ORDER_CUSTOMER_FIELDS : ""}
      }
    }
  }
`;

export const ORDERS_QUERY = ordersQuery(true);
export const ORDERS_QUERY_RESTRICTED = ordersQuery(false);

type OrdersData = { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyOrderNode[] } | null };

const FULFILLMENT_ORDERS_QUERY = /* GraphQL */ `
  query PrintFlowFulfillmentOrders($id: ID!) {
    order(id: $id) {
      fulfillmentOrders(first: 20) { nodes { id status } }
    }
  }
`;

const EXISTING_FULFILMENTS_QUERY = /* GraphQL */ `
  query PrintFlowExistingFulfilments($id: ID!) {
    order(id: $id) {
      fulfillments(first: 50) { id trackingInfo { number } }
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

  /**
   * Fetch orders. Protected customer data is handled in two tiers:
   *  1. Field-level permission errors with partial data → keep the data, mark
   *     the affected orders' customer fields as restricted.
   *  2. The whole query rejected for permission reasons → re-request the page
   *     without protected fields for the rest of this run; every order is
   *     marked restricted. The next run tries the full query again, so access
   *     granted later is picked up automatically.
   * Any other GraphQL error is fatal.
   */
  async *fetchOrders(ctx: FetchContext): AsyncGenerator<OrderPage> {
    let after: string | null = null;
    let restrictedMode = false;
    const query = `updated_at:>='${ctx.since.toISOString()}'`;
    for (let page = 0; page < MAX_PAGES; page++) {
      const variables = { first: PAGE_SIZE, after, query };
      let nodes: ShopifyOrderNode[] = [];
      let pageInfo: { hasNextPage: boolean; endCursor: string | null } = { hasNextPage: false, endCursor: null };
      let restrictedFor: (index: number) => string[] = () => [];

      if (!restrictedMode) {
        const res = await this.client.graphqlRaw<OrdersData>(ORDERS_QUERY, variables);
        const c = classifyGraphQLErrors(res.errors);
        if (c.otherErrors.length) throw fatal(c.otherErrors);
        if (c.protectedErrors.length && res.data?.orders) {
          nodes = res.data.orders.nodes;
          pageInfo = res.data.orders.pageInfo;
          restrictedFor = (i) => restrictedFieldsFor(i, c.restrictedByOrder);
          this.warn(ctx, c.protectedErrors, "partial");
        } else if (c.protectedErrors.length) {
          restrictedMode = true;
          this.warn(ctx, c.protectedErrors, "rejected");
        } else if (res.data?.orders) {
          nodes = res.data.orders.nodes;
          pageInfo = res.data.orders.pageInfo;
        } else {
          throw new IntegrationError("Shopify returned no order data");
        }
      }
      if (restrictedMode) {
        const data = await this.client.graphql<OrdersData>(ORDERS_QUERY_RESTRICTED, variables);
        if (!data.orders) throw new IntegrationError("Shopify returned no order data");
        nodes = data.orders.nodes;
        pageInfo = data.orders.pageInfo;
        restrictedFor = () => ALL_RESTRICTED_FIELDS;
      }

      ctx.onPage?.(page + 1);
      const orders = nodes.map((n, i) => mapShopifyOrder(n, ctx.defaultDispatchDays, restrictedFor(i)));
      const maxUpdatedAt = orders.reduce<string | null>(
        (max, o) => (!max || o.order.marketplace_updated_at > max ? o.order.marketplace_updated_at : max),
        null,
      );
      yield { orders, maxUpdatedAt };
      if (!pageInfo.hasNextPage) return;
      after = pageInfo.endCursor;
    }
  }

  private warnedModes = new Set<string>();
  private warn(ctx: FetchContext, errors: GraphQLError[], mode: "partial" | "rejected") {
    if (this.warnedModes.has(mode)) return;
    this.warnedModes.add(mode);
    ctx.onWarning?.({
      code: "customer_data_restricted",
      message:
        mode === "partial"
          ? "Shopify withheld some customer fields (protected customer data). Orders and line items were imported; the withheld fields are marked as restricted."
          : "Shopify refused access to customer data (protected customer data). Orders and line items were imported without customer name, email or address, marked as restricted.",
      details: { mode, errors: errors.slice(0, 5).map((e) => ({ message: e.message, path: e.path ?? null, code: e.extensions?.code ?? null })) },
    });
  }

  /**
   * Shopify: find open fulfillment orders, then fulfillmentCreate with
   * trackingInfo {number, company, url}. notifyCustomer sends Shopify's
   * shipping confirmation email.
   */
  async pushFulfilment(input: FulfilmentPush) {
    const fo = await this.client.graphql<{ order: { fulfillmentOrders: { nodes: { id: string; status: string }[] } } | null }>(
      FULFILLMENT_ORDERS_QUERY,
      { id: input.externalOrderId },
    );
    const open = fo.order?.fulfillmentOrders.nodes.filter((n) => ["OPEN", "IN_PROGRESS"].includes(n.status)) ?? [];
    if (!open.length) {
      throw new IntegrationError("Shopify has no open fulfilment orders for this order (it may already be fulfilled).", fo, false, 422);
    }
    const number = normaliseTracking(input.trackingNumber);
    const result = await this.client.graphql<{
      fulfillmentCreate: { fulfillment: { id: string; status: string } | null; userErrors: { field: string[] | null; message: string }[] };
    }>(FULFILLMENT_CREATE, {
      fulfillment: {
        lineItemsByFulfillmentOrder: open.map((n) => ({ fulfillmentOrderId: n.id })),
        notifyCustomer: true,
        trackingInfo: {
          number,
          company: findCarrier(input.carrier).shopify,
          ...(input.trackingUrl ? { url: input.trackingUrl } : {}),
        },
      },
    });
    if (result.fulfillmentCreate.userErrors.length) {
      throw new IntegrationError(
        `Shopify rejected the fulfilment: ${result.fulfillmentCreate.userErrors.map((e) => e.message).join("; ")}`,
        result.fulfillmentCreate.userErrors,
        false,
        422,
      );
    }
    return { externalId: result.fulfillmentCreate.fulfillment?.id ?? null, response: result.fulfillmentCreate };
  }

  /** Is this tracking number already on one of the order's fulfilments? */
  async findExistingFulfilment(input: FulfilmentPush) {
    const data = await this.client.graphql<{
      order: { fulfillments: { id: string; trackingInfo: { number: string | null }[] }[] } | null;
    }>(EXISTING_FULFILMENTS_QUERY, { id: input.externalOrderId });
    const wanted = normaliseTracking(input.trackingNumber);
    const match = data.order?.fulfillments.find((f) => f.trackingInfo.some((t) => normaliseTracking(t.number) === wanted));
    return match ? { externalId: match.id } : null;
  }
}

/** Lightweight connection check used when connecting with an access token. */
export async function fetchShopInfo(shop: string, accessToken: string) {
  const client = new ShopifyClient(shop, accessToken);
  const data = await client.graphql<{
    shop: { name: string; myshopifyDomain: string; currencyCode: string };
    currentAppInstallation: { accessScopes: { handle: string }[] } | null;
  }>("query { shop { name myshopifyDomain currencyCode } currentAppInstallation { accessScopes { handle } } }");
  return { ...data.shop, scopes: data.currentAppInstallation?.accessScopes.map((s) => s.handle) ?? [] };
}

function fatal(errors: GraphQLError[]) {
  return new IntegrationError(`Shopify GraphQL error: ${errors.map((e) => e.message).join("; ")}`, errors);
}
