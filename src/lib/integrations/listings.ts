/**
 * Product import: map marketplace listings and decide, without duplicating,
 * which PrintFlow product each listing belongs to.
 *
 * Matching rules, strongest first:
 *  1. The listing is already linked to a product → keep that link (update only
 *     the listing's title/link/active flag; product details are never touched).
 *  2. A listing SKU equals an existing product SKU (case-insensitive) → link.
 *  3. A product with a very similar name exists → suggested link, shown for
 *     review (a name match is never treated as certain).
 *  4. Otherwise → create a new product.
 * Pure functions only, so the rules are unit-tested.
 */
import type { MarketplaceListing } from "./types";

// ---------- Etsy ----------

export type EtsyListing = {
  listing_id: number;
  title: string;
  description?: string | null;
  state?: string;
  url?: string | null;
  skus?: string[] | null;
  price?: { amount: number; divisor: number; currency_code: string } | null;
  has_variations?: boolean;
  images?: { url_570xN?: string; url_fullxfull?: string }[] | null;
};

export function mapEtsyListing(l: EtsyListing): MarketplaceListing {
  return {
    external_listing_id: String(l.listing_id),
    title: cleanTitle(l.title),
    description: cleanText(l.description),
    url: l.url ?? null,
    skus: uniqueSkus(l.skus ?? []),
    price: l.price && l.price.divisor ? round2(l.price.amount / l.price.divisor) : null,
    currency: l.price?.currency_code ?? null,
    image_url: l.images?.[0]?.url_570xN ?? l.images?.[0]?.url_fullxfull ?? null,
    category: null,
    is_active: (l.state ?? "active") === "active",
    variant_count: l.has_variations ? 2 : 1,
  };
}

// ---------- Shopify ----------

export type ShopifyProductNode = {
  id: string;
  title: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED" | string;
  descriptionHtml?: string | null;
  productType?: string | null;
  onlineStoreUrl?: string | null;
  featuredMedia?: { preview?: { image?: { url?: string | null } | null } | null } | null;
  priceRangeV2?: { minVariantPrice?: { amount: string; currencyCode: string } | null } | null;
  variants?: { nodes: { sku?: string | null }[] } | null;
};

export function mapShopifyProduct(p: ShopifyProductNode): MarketplaceListing {
  const min = p.priceRangeV2?.minVariantPrice;
  return {
    external_listing_id: p.id,
    title: cleanTitle(p.title),
    description: cleanText(stripHtml(p.descriptionHtml)),
    url: p.onlineStoreUrl ?? null,
    skus: uniqueSkus((p.variants?.nodes ?? []).map((v) => v.sku ?? "")),
    price: min ? round2(Number(min.amount)) : null,
    currency: min?.currencyCode ?? null,
    image_url: p.featuredMedia?.preview?.image?.url ?? null,
    category: p.productType?.trim() || null,
    is_active: p.status === "ACTIVE",
    variant_count: p.variants?.nodes.length ?? 1,
  };
}

// ---------- Matching ----------

export type ExistingProduct = { id: string; name: string; sku: string };
export type ExistingLink = { external_listing_id: string; product_id: string };

export type PlanAction = "keep" | "link" | "create" | "skip";
export type PlanRow = {
  listing: MarketplaceListing;
  /** What happens if the user changes nothing. */
  action: PlanAction;
  product_id: string | null;
  reason: "already_linked" | "sku" | "name" | "new";
  /** Name-similarity suggestion (0–1), when the reason is "name". */
  score: number | null;
};

/** A name match at or above this is suggested as the same product. */
export const NAME_MATCH_THRESHOLD = 0.6;

export function planImport(listings: MarketplaceListing[], products: ExistingProduct[], links: ExistingLink[]): PlanRow[] {
  const linked = new Map(links.map((l) => [l.external_listing_id, l.product_id]));
  const bySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p.id]));
  const grams = products.map((p) => ({ id: p.id, grams: trigrams(p.name) }));

  return listings.map((listing) => {
    const already = linked.get(listing.external_listing_id);
    if (already) return { listing, action: "keep", product_id: already, reason: "already_linked", score: null };

    const skuHit = listing.skus.map((s) => bySku.get(s.toLowerCase())).find(Boolean);
    if (skuHit) return { listing, action: "link", product_id: skuHit, reason: "sku", score: null };

    const g = trigrams(listing.title);
    let best: { id: string; score: number } | null = null;
    for (const p of grams) {
      const score = jaccard(g, p.grams);
      if (!best || score > best.score) best = { id: p.id, score };
    }
    if (best && best.score >= NAME_MATCH_THRESHOLD) {
      return { listing, action: "link", product_id: best.id, reason: "name", score: round2(best.score) };
    }
    return { listing, action: "create", product_id: null, reason: "new", score: null };
  });
}

/** Trigram set, like PostgreSQL pg_trgm (lower-case words padded with spaces). */
export function trigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const w = `  ${word} `;
    for (let i = 0; i + 3 <= w.length; i++) out.add(w.slice(i, i + 3));
  }
  return out;
}

export function nameSimilarity(a: string, b: string) {
  return jaccard(trigrams(a), trigrams(b));
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return shared / (a.size + b.size - shared);
}

// ---------- Helpers ----------

function uniqueSkus(skus: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of skus) {
    const s = raw.trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s.slice(0, 120));
  }
  return out;
}

function cleanTitle(t: string) {
  return decodeEntities(t).replace(/\s+/g, " ").trim().slice(0, 200) || "Untitled listing";
}

function cleanText(t: string | null | undefined) {
  const v = decodeEntities(t ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return v ? v.slice(0, 5000) : null;
}

function stripHtml(html: string | null | undefined) {
  return (html ?? "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
}

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
