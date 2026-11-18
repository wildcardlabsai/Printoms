/**
 * Detection of Shopify protected-customer-data permission errors.
 *
 * When an app lacks protected customer data access, Shopify reports GraphQL
 * errors for the protected fields (typically with extensions.code
 * "ACCESS_DENIED" and a message such as "This app is not approved to access
 * the Customer object"). Depending on the field, Shopify either returns the
 * rest of the data with those fields set to null (field-level errors with a
 * `path`), or rejects the whole query. Both cases are handled by the adapter.
 *
 * Limitation: Shopify does not publish a formal contract for these messages,
 * so detection is based on the documented ACCESS_DENIED code plus message
 * patterns. Anything we don't recognise as a permission error stays fatal —
 * we would rather fail loudly than silently drop data.
 */

export type GraphQLError = { message: string; path?: (string | number)[]; extensions?: { code?: string } };

/** Order fields that hold protected customer data, mapped to PrintFlow field names. */
export const PROTECTED_ORDER_FIELDS: Record<string, string> = {
  customer: "customer",
  email: "email",
  phone: "phone",
  shippingAddress: "shipping_address",
  billingAddress: "billing_address",
};

/** Fields we treat as withheld when Shopify rejects the whole query. */
export const ALL_RESTRICTED_FIELDS = ["customer", "email", "shipping_address"];

const PERMISSION_MESSAGE =
  /not approved to (access|use)|protected customer data|access denied|access to this (field|object) (is )?(denied|restricted)/i;

export function isPermissionError(e: GraphQLError): boolean {
  return e.extensions?.code === "ACCESS_DENIED" || PERMISSION_MESSAGE.test(e.message ?? "");
}

/** True when the error is a permission error on a protected customer field. */
export function isProtectedCustomerDataError(e: GraphQLError): boolean {
  if (!isPermissionError(e)) return false;
  // With a path we can be precise: it must point inside a protected order field.
  if (e.path?.length) return protectedFieldFromPath(e.path) !== null;
  // Without a path, rely on the message mentioning customer data.
  return /customer|email|phone|address|protected customer data/i.test(e.message ?? "");
}

/** ["orders","nodes",3,"shippingAddress","name"] → "shipping_address" */
export function protectedFieldFromPath(path: (string | number)[]): string | null {
  for (const segment of path) {
    if (typeof segment === "string" && segment in PROTECTED_ORDER_FIELDS) return PROTECTED_ORDER_FIELDS[segment]!;
  }
  return null;
}

/** ["orders","nodes",3,...] → 3 */
export function orderIndexFromPath(path: (string | number)[] | undefined): number | null {
  if (!path) return null;
  const i = path.indexOf("nodes");
  const idx = i >= 0 ? path[i + 1] : undefined;
  return typeof idx === "number" ? idx : null;
}

export type ErrorClassification = {
  protectedErrors: GraphQLError[];
  otherErrors: GraphQLError[];
  /** Per order index: which protected fields were withheld. Key -1 = applies to every order. */
  restrictedByOrder: Map<number, Set<string>>;
};

export function classifyGraphQLErrors(errors: GraphQLError[] | undefined): ErrorClassification {
  const protectedErrors: GraphQLError[] = [];
  const otherErrors: GraphQLError[] = [];
  const restrictedByOrder = new Map<number, Set<string>>();
  for (const e of errors ?? []) {
    if (!isProtectedCustomerDataError(e)) {
      otherErrors.push(e);
      continue;
    }
    protectedErrors.push(e);
    const idx = orderIndexFromPath(e.path) ?? -1;
    const field = e.path?.length ? protectedFieldFromPath(e.path) : null;
    const set = restrictedByOrder.get(idx) ?? new Set<string>();
    if (field) set.add(field);
    else ALL_RESTRICTED_FIELDS.forEach((f) => set.add(f));
    restrictedByOrder.set(idx, set);
  }
  return { protectedErrors, otherErrors, restrictedByOrder };
}

export function restrictedFieldsFor(index: number, map: Map<number, Set<string>>): string[] {
  const fields = new Set<string>([...(map.get(-1) ?? []), ...(map.get(index) ?? [])]);
  return [...fields].sort();
}
