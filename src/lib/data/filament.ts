import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function listSpools({ view = "active", material }: { view?: "active" | "low" | "archived"; material?: string }) {
  const supabase = await createClient();
  let q = supabase.from("filament_stock_overview").select("*").order("material").order("brand").order("colour");
  if (view === "archived") q = q.eq("is_archived", true);
  else q = q.eq("is_archived", false);
  if (view === "low") q = q.eq("is_low_stock", true);
  if (material) q = q.eq("material", material);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).filter((s): s is typeof s & { id: string } => Boolean(s.id));
}

export type SpoolRow = Awaited<ReturnType<typeof listSpools>>[number];

export async function getFilamentSummary() {
  const supabase = await createClient();
  const { data } = await supabase.from("filament_stock_overview").select("material, remaining_g, purchase_price, spool_weight_g, is_low_stock").eq("is_archived", false);
  const rows = data ?? [];
  const byMaterial: Record<string, number> = {};
  let value = 0;
  for (const r of rows) {
    byMaterial[r.material ?? "Other"] = (byMaterial[r.material ?? "Other"] ?? 0) + Number(r.remaining_g ?? 0);
    if (r.purchase_price != null && r.spool_weight_g) value += (Number(r.purchase_price) / r.spool_weight_g) * Number(r.remaining_g ?? 0);
  }
  return {
    spools: rows.length,
    remainingG: rows.reduce((s, r) => s + Number(r.remaining_g ?? 0), 0),
    low: rows.filter((r) => r.is_low_stock).length,
    value,
    byMaterial,
    materials: Object.keys(byMaterial).sort(),
  };
}

export async function getRecentUsage(limit = 25) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("filament_usage")
    .select("id, grams, cost, kind, note, created_at, stock:filament_stock(id, brand, material, colour, colour_hex), job:production_jobs(id, job_number), recorded_by_profile:profiles(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export type UsageRow = Awaited<ReturnType<typeof getRecentUsage>>[number];
