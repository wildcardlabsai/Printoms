import "server-only";
import { createClient } from "@/lib/supabase/server";
import { escapeLike } from "./orders";

export async function listProducts({ q, category, status = "active" }: { q?: string; category?: string; status?: "active" | "archived" | "all" }) {
  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("id, name, sku, category, image_path, material, default_colour, estimated_print_minutes, estimated_filament_g, base_price, material_cost, packaging_cost, labour_cost, other_cost, is_active, is_sample, product_listings(source)")
    .order("name");
  if (status === "active") query = query.eq("is_active", true);
  if (status === "archived") query = query.eq("is_active", false);
  if (q?.trim()) {
    const term = `%${escapeLike(q.trim())}%`;
    query = query.or(`name.ilike.${term.replace(/[,()]/g, " ")},sku.ilike.${term.replace(/[,()]/g, " ")}`);
  }
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type ProductRow = Awaited<ReturnType<typeof listProducts>>[number];

export async function getProductCategories() {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("category").not("category", "is", null);
  return Array.from(new Set((data ?? []).map((d) => d.category!).filter(Boolean))).sort();
}

export async function getProduct(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, default_printer:printers(id, name), product_listings(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

export async function getProductSales(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("order_items")
    .select("quantity, total_price, order:orders!inner(id, order_number, order_date, status, currency, customer_name)")
    .eq("product_id", id)
    .neq("order.status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = data ?? [];
  return {
    units: rows.reduce((s, r) => s + r.quantity, 0),
    revenue: rows.reduce((s, r) => s + Number(r.total_price), 0),
    orders: new Set(rows.map((r) => r.order?.id)).size,
    recent: rows.slice(0, 8),
  };
}

/** Average cost per kg for a material from spools with a purchase price. */
export async function getMaterialCostPerKg(material: string | null) {
  const supabase = await createClient();
  const [{ data: settings }, { data: spools }] = await Promise.all([
    supabase.from("business_settings").select("default_filament_cost_per_kg").maybeSingle(),
    material
      ? supabase.from("filament_stock").select("purchase_price, spool_weight_g").eq("material", material).not("purchase_price", "is", null)
      : Promise.resolve({ data: [] as { purchase_price: number | null; spool_weight_g: number }[] }),
  ]);
  const priced = (spools ?? []).filter((s) => s.purchase_price != null && s.spool_weight_g > 0);
  if (priced.length) {
    const perKg = priced.reduce((s, x) => s + (Number(x.purchase_price) / x.spool_weight_g) * 1000, 0) / priced.length;
    return { perKg, basis: `average of ${priced.length} ${material} spool${priced.length === 1 ? "" : "s"}` };
  }
  return { perKg: Number(settings?.default_filament_cost_per_kg ?? 18), basis: "default cost per kg from settings" };
}

export async function signedImageUrls(paths: (string | null)[]) {
  const unique = Array.from(new Set(paths.filter((p): p is string => Boolean(p))));
  if (!unique.length) return {} as Record<string, string>;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("product-images").createSignedUrls(unique, 3600);
  const map: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  return map;
}
