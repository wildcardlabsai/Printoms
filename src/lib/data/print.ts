import "server-only";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import type { ProductionStage } from "@/lib/constants";

const MAX = 200;

/** Jobs for printable job tickets (never cancelled jobs). */
export async function getTicketJobs(opts: { ids?: string[]; stage?: ProductionStage }) {
  const supabase = await createClient();
  let q = supabase
    .from("production_jobs")
    .select(
      "id, job_number, stage, priority, quantity, quantity_printed, quantity_pending, material, colour, notes, due_date, is_sample, " +
        "order:orders!inner(id, order_number, source, external_order_number, external_order_id, customer_name, customer_note, production_notes, dispatch_by, is_sample), " +
        "item:order_items(title, variant_title, personalisation, quantity, sku), " +
        "product:products(name, sku, material, default_colour, production_instructions), " +
        "printer:printers!production_jobs_printer_id_fkey(name)",
    )
    .is("cancelled_at", null)
    .order("created_at")
    .limit(MAX);
  if (opts.ids?.length) q = q.in("id", opts.ids.slice(0, MAX));
  else if (opts.stage) q = q.eq("stage", opts.stage);
  else return [];
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TicketJob[];
}

export type TicketJob = {
  id: string;
  job_number: string;
  stage: ProductionStage;
  priority: "low" | "normal" | "high" | "urgent";
  quantity: number;
  quantity_printed: number;
  quantity_pending: number;
  material: string | null;
  colour: string | null;
  notes: string | null;
  due_date: string | null;
  is_sample: boolean;
  order: {
    id: string;
    order_number: string;
    source: "etsy" | "shopify" | "vinted" | "manual";
    external_order_number: string | null;
    external_order_id: string | null;
    customer_name: string;
    customer_note: string | null;
    production_notes: string | null;
    dispatch_by: string | null;
    is_sample: boolean;
  };
  item: { title: string; variant_title: string | null; personalisation: string | null; quantity: number; sku: string | null } | null;
  product: { name: string; sku: string; material: string | null; default_colour: string | null; production_instructions: string | null } | null;
  printer: { name: string } | null;
};

/** Orders for packing slips. `view: "to_pack"` = ready to pack or packed. */
export async function getSlipOrders(opts: { ids?: string[]; view?: "to_pack" }) {
  const supabase = await createClient();
  let q = supabase
    .from("orders")
    .select(
      "id, order_number, source, external_order_number, external_order_id, order_date, customer_name, shipping_address, customer_data_status, " +
        "currency, subtotal, shipping_total, discount_total, tax_total, total, is_sample, shipping_method, " +
        "order_items(id, title, variant_title, personalisation, quantity, unit_price, total_price, marketplace_status, created_at)",
    )
    .order("order_date")
    .limit(MAX);
  if (opts.ids?.length) q = q.in("id", opts.ids.slice(0, MAX));
  else if (opts.view === "to_pack") q = q.in("status", ["ready_to_pack", "packed"]);
  else return [];
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as SlipOrder[]).map((o) => ({
    ...o,
    // Lines removed on the marketplace are not packed.
    order_items: o.order_items.filter((i) => i.marketplace_status !== "removed").sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}

export type SlipOrder = {
  id: string;
  order_number: string;
  source: "etsy" | "shopify" | "vinted" | "manual";
  external_order_number: string | null;
  external_order_id: string | null;
  order_date: string;
  customer_name: string;
  shipping_address: unknown;
  customer_data_status: string;
  currency: string;
  subtotal: number;
  shipping_total: number;
  discount_total: number;
  tax_total: number;
  total: number;
  is_sample: boolean;
  shipping_method: string | null;
  order_items: {
    id: string;
    title: string;
    variant_title: string | null;
    personalisation: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
    marketplace_status: string;
    created_at: string;
  }[];
};

/** Inline SVG QR code (no external service). */
export async function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
}

/** Parse a comma-separated list of UUIDs from a query string. */
export function parseIds(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
    .slice(0, MAX);
}
