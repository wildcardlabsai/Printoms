import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";
import { getIntegration } from "./credentials";
import { createAdapter } from "./registry";
import { planImport, type PlanAction, type PlanRow } from "./listings";
import { IntegrationError, type MarketplaceListing } from "./types";

type Provider = "etsy" | "shopify";
type Db = SupabaseClient<Database>;

/** Read every listing from the marketplace (read-only). */
export async function fetchAllListings(provider: Provider): Promise<MarketplaceListing[]> {
  const admin = createAdminClient();
  const integration = await getIntegration(admin, provider);
  if (integration.status !== "connected" && integration.status !== "error") {
    throw new IntegrationError(`${provider === "etsy" ? "Etsy" : "Shopify"} is not connected.`);
  }
  const adapter = await createAdapter(admin, integration);
  if (!adapter.fetchListings) throw new IntegrationError("This marketplace does not support product import.");
  const out: MarketplaceListing[] = [];
  for await (const page of adapter.fetchListings()) out.push(...page);
  return out;
}

async function currentCatalogue(supabase: Db, provider: Provider) {
  const [{ data: products }, { data: links }] = await Promise.all([
    supabase.from("products").select("id, name, sku").order("name"),
    supabase.from("product_listings").select("external_listing_id, product_id").eq("source", provider),
  ]);
  return { products: products ?? [], links: links ?? [] };
}

export type ImportPreview = {
  rows: PlanRow[];
  products: { id: string; name: string; sku: string }[];
};

export async function previewProductImport(supabase: Db, provider: Provider): Promise<ImportPreview> {
  const listings = await fetchAllListings(provider);
  const { products, links } = await currentCatalogue(supabase, provider);
  return { rows: planImport(listings, products, links), products };
}

export type ImportDecision = { external_listing_id: string; action: PlanAction; product_id: string | null };
export type ImportSummary = {
  created: number;
  linked: number;
  already_linked: number;
  skipped: number;
  failed: { title: string; error: string }[];
  order_lines_linked: number;
  images_added: number;
  images_pending: number;
};

/**
 * Apply the reviewed decisions. Listings are re-read from the marketplace (the
 * browser only sends decisions), each listing is applied atomically in the
 * database, and the whole import can be safely repeated.
 */
export async function runProductImport(
  supabase: Db,
  provider: Provider,
  decisions: ImportDecision[],
  opts: { timeBudgetMs?: number; listings?: MarketplaceListing[] } = {},
): Promise<ImportSummary> {
  const started = Date.now();
  const budget = opts.timeBudgetMs ?? 45_000;
  const listings = opts.listings ?? (await fetchAllListings(provider));
  const { products, links } = await currentCatalogue(supabase, provider);
  const plan = new Map(planImport(listings, products, links).map((r) => [r.listing.external_listing_id, r]));
  const chosen = new Map(decisions.map((d) => [d.external_listing_id, d]));
  const summary: ImportSummary = { created: 0, linked: 0, already_linked: 0, skipped: 0, failed: [], order_lines_linked: 0, images_added: 0, images_pending: 0 };

  for (const listing of listings) {
    const row = plan.get(listing.external_listing_id)!;
    const d = chosen.get(listing.external_listing_id);
    const action = row.action === "keep" ? "keep" : (d?.action ?? row.action);
    const productId = action === "link" ? (d?.product_id ?? row.product_id) : null;
    const { data, error } = await supabase.rpc("import_marketplace_listing", {
      p_source: provider,
      p_listing: listing as unknown as Json,
      p_action: action,
      p_product_id: productId as string,
    });
    if (error) {
      summary.failed.push({ title: listing.title, error: error.message });
      continue;
    }
    const r = data as { result: string; product_id: string | null; order_lines_linked?: number; needs_image?: boolean };
    if (r.result === "created") summary.created++;
    else if (r.result === "linked") summary.linked++;
    else if (r.result === "already_linked") summary.already_linked++;
    else summary.skipped++;
    summary.order_lines_linked += r.order_lines_linked ?? 0;

    if (r.product_id && r.needs_image && listing.image_url) {
      if (Date.now() - started > budget) summary.images_pending++;
      else if (await copyImage(supabase, r.product_id, provider, listing.image_url)) summary.images_added++;
    }
  }
  return summary;
}

const IMAGE_HOSTS = [/(^|\.)etsystatic\.com$/i, /(^|\.)shopify\.com$/i, /(^|\.)shopifycdn\.com$/i];
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Is this a marketplace image URL we may download? (Never arbitrary hosts.) */
export function isAllowedImageUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && IMAGE_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** Copy the marketplace image into private storage; only fills an empty image. */
async function copyImage(supabase: Db, productId: string, provider: Provider, url: string): Promise<boolean> {
  if (!isAllowedImageUrl(url)) return false;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const ext = IMAGE_TYPES[type];
    if (!res.ok || !ext) return false;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return false;
    const path = `${productId}/import-${provider}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("product-images").upload(path, bytes, { contentType: type, upsert: false });
    if (upErr) return false;
    const { data } = await supabase.from("products").update({ image_path: path }).eq("id", productId).is("image_path", null).select("id");
    if (!data?.length) {
      await supabase.storage.from("product-images").remove([path]);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
