import { db } from "./db";
import { etsyReceipt } from "./fake-marketplaces";
import { mapEtsyReceipt, type EtsyReceipt } from "../../src/lib/integrations/etsy/mapper";
import type { Json } from "../../src/types/database";

/** Create a temporary printer owned by the test (never reuse real printers). */
export async function createTestPrinter(name: string) {
  const { data, error } = await db
    .from("printers")
    .insert({ name, manufacturer: "Test", model: "Fixture", printer_type: "FDM", is_active: true, sort_order: 999 })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function deleteTestPrinters(prefix: string) {
  await db.from("printers").delete().like("name", `${prefix}%`);
}

/** Ingest an Etsy receipt directly (service role), as the sync engine would. */
export async function ingestEtsy(receipt: EtsyReceipt, force = false) {
  const n = mapEtsyReceipt(receipt, 3);
  const { data, error } = await db.rpc("ingest_marketplace_order", {
    p_source: "etsy",
    p_order: n.order as unknown as Json,
    p_items: n.items as unknown as Json,
    p_actor_label: "Etsy sync",
    p_force: force,
  });
  if (error) throw new Error(error.message);
  return data as { order_id: string; result: string };
}

export function receiptWithItems(id: string, updatedUnix: number, items: { tx: string; qty: number; personalisation?: string; colour?: string; title?: string }[], overrides: Partial<EtsyReceipt> = {}) {
  const base = etsyReceipt(id, updatedUnix, overrides);
  base.transactions = items.map((i) => ({
    ...base.transactions[0]!,
    transaction_id: Number(i.tx),
    title: i.title ?? "Personalised Keyring",
    quantity: i.qty,
    variations: [
      ...(i.colour ? [{ formatted_name: "Colour", formatted_value: i.colour }] : []),
      ...(i.personalisation !== undefined ? [{ formatted_name: "Personalization", formatted_value: i.personalisation }] : []),
    ],
  }));
  return base;
}

export async function jobsFor(extId: string) {
  const { data } = await db
    .from("production_jobs")
    .select("*, order:orders!inner(id, external_order_id, status), item:order_items(id, external_line_item_id, quantity, personalisation, variant_title, marketplace_status)")
    .eq("order.external_order_id", extId)
    .order("created_at");
  return data ?? [];
}

export async function unitsFor(jobId: string) {
  const { data } = await db.from("production_units").select("*").eq("production_job_id", jobId).order("unit_number");
  return data ?? [];
}

export async function orderBy(extId: string) {
  const { data } = await db.from("orders").select("*").eq("external_order_id", extId).single();
  return data!;
}

export async function reviewsFor(orderId: string) {
  const { data } = await db.from("order_reviews").select("*").eq("order_id", orderId).order("detected_at");
  return data ?? [];
}

/** Call an RPC as the service role and throw on error. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}
