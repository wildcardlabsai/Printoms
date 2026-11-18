import "server-only";
import { serverEnv } from "@/lib/server-env";
import { fetchWithRetry, safeText, sleep } from "../http";
import { IntegrationError } from "../types";

type GraphQLError = { message: string; extensions?: { code?: string } };
type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
  extensions?: { cost?: { requestedQueryCost: number; throttleStatus: { currentlyAvailable: number; restoreRate: number } } };
};

export class ShopifyClient {
  constructor(
    private readonly shop: string,
    private readonly accessToken: string,
    private readonly apiVersion = serverEnv.shopify.apiVersion,
  ) {}

  /** GraphQL request with cost-based throttle handling. */
  async graphql<T>(query: string, variables: Record<string, unknown> = {}, attempt = 0): Promise<T> {
    const res = await fetchWithRetry(
      `https://${this.shop}/admin/api/${this.apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": this.accessToken, Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
      },
      { label: "Shopify GraphQL" },
    );
    if (res.status === 401 || res.status === 403) {
      throw new IntegrationError(
        `Shopify rejected the access token (HTTP ${res.status}). Check the app is installed and has the required scopes.`,
        await safeText(res),
      );
    }
    if (!res.ok) throw new IntegrationError(`Shopify API error (HTTP ${res.status})`, await safeText(res));
    const body = (await res.json()) as GraphQLResponse<T>;

    if (body.errors?.some((e) => e.extensions?.code === "THROTTLED") && attempt < 5) {
      const cost = body.extensions?.cost;
      const wait = cost
        ? Math.ceil(((cost.requestedQueryCost - cost.throttleStatus.currentlyAvailable) / Math.max(1, cost.throttleStatus.restoreRate)) * 1000)
        : 2000;
      await sleep(Math.max(1000, wait));
      return this.graphql<T>(query, variables, attempt + 1);
    }
    if (body.errors?.length) {
      const msg = body.errors.map((e) => e.message).join("; ");
      const hint = /access denied|protected customer data/i.test(msg)
        ? " — the app may need protected customer data access (see README → Shopify)."
        : "";
      throw new IntegrationError(`Shopify GraphQL error: ${msg}${hint}`, body.errors);
    }

    // Be a good citizen: pause when the bucket is nearly empty.
    const status = body.extensions?.cost?.throttleStatus;
    if (status && status.currentlyAvailable < 100) await sleep(1000);
    if (!body.data) throw new IntegrationError("Shopify returned no data");
    return body.data;
  }
}
