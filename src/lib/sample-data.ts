import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Development sample data.
 *
 * Every row created here is flagged `is_sample = true`, uses `example.com`
 * email addresses and "SAMPLE-" marketplace IDs, is shown with a "Sample"
 * badge in the UI, and can be removed in one click from Settings → Data.
 * It never touches real records.
 */

type Stage = Database["public"]["Enums"]["production_stage"];
type Source = Database["public"]["Enums"]["order_source"];

const PRODUCTS = [
  { name: "Geometric Planter (Medium)", sku: "SAMPLE-PLANTER-M", category: "Home & Garden", minutes: 260, grams: 118, material: "PLA", colour: "Sage Green", price: 18, packaging: 0.6 },
  { name: "Personalised Name Sign", sku: "SAMPLE-NAMESIGN", category: "Personalised", minutes: 150, grams: 62, material: "PLA+", colour: "Matte White", price: 22, packaging: 0.8 },
  { name: "Articulated Dragon", sku: "SAMPLE-DRAGON", category: "Toys", minutes: 420, grams: 145, material: "PLA", colour: "Silk Rainbow", price: 28, packaging: 0.7 },
  { name: "Cable Organiser Set (6)", sku: "SAMPLE-CABLE6", category: "Desk", minutes: 95, grams: 38, material: "PETG", colour: "Black", price: 9.5, packaging: 0.3 },
  { name: "Low-poly Vase", sku: "SAMPLE-VASE", category: "Home & Garden", minutes: 310, grams: 132, material: "PLA", colour: "Terracotta", price: 24, packaging: 0.9 },
  { name: "Custom Keyring", sku: "SAMPLE-KEYRING", category: "Personalised", minutes: 35, grams: 9, material: "PLA", colour: "Mixed", price: 6.5, packaging: 0.2 },
];

const FILAMENT = [
  { brand: "Bambu Lab", material: "PLA", colour: "Sage Green", colour_hex: "#8DA88A", spool: 1000, remaining: 640, price: 19.99, supplier: "Sample Supplier Ltd" },
  { brand: "eSun", material: "PLA+", colour: "Matte White", colour_hex: "#F2F2EE", spool: 1000, remaining: 155, price: 17.49, supplier: "Sample Supplier Ltd" },
  { brand: "Sunlu", material: "PETG", colour: "Black", colour_hex: "#1C1C1C", spool: 1000, remaining: 820, price: 16.99, supplier: "Sample Filaments Co" },
  { brand: "Polymaker", material: "PLA", colour: "Terracotta", colour_hex: "#C46A4A", spool: 1000, remaining: 410, price: 21.5, supplier: "Sample Filaments Co" },
  { brand: "Eryone", material: "PLA", colour: "Silk Rainbow", colour_hex: "#B38BD6", spool: 1000, remaining: 90, price: 22.99, supplier: "Sample Supplier Ltd" },
];

const CUSTOMERS = [
  ["Sample Customer — Amelia", "amelia.sample@example.com"],
  ["Sample Customer — Oliver", "oliver.sample@example.com"],
  ["Sample Customer — Isla", "isla.sample@example.com"],
  ["Sample Customer — Noah", "noah.sample@example.com"],
  ["Sample Customer — Freya", "freya.sample@example.com"],
  ["Sample Customer — Arthur", "arthur.sample@example.com"],
  ["Sample Customer — Ivy", "ivy.sample@example.com"],
  ["Sample Customer — Leo", "leo.sample@example.com"],
] as const;

// [daysAgo, source, customerIndex, [productIndex, qty][], stage, dispatchInDays, personalisation?]
const ORDERS: [number, Source, number, [number, number][], Stage, number, string?][] = [
  [0, "etsy", 0, [[1, 1]], "new_order", 3, "Name: \"Amelia\" — font: rounded"],
  [0, "shopify", 1, [[3, 2], [5, 1]], "new_order", 2, undefined],
  [1, "etsy", 2, [[0, 1]], "awaiting_preparation", 2],
  [1, "etsy", 3, [[2, 1]], "ready_to_print", 3],
  [2, "shopify", 4, [[4, 1], [0, 1]], "printing", 1],
  [2, "manual", 5, [[5, 4]], "ready_to_print", 4, "Initials: A.B, C.D, E.F, G.H"],
  [3, "etsy", 6, [[1, 1]], "quality_check", 0, "Name: \"Harbour House\""],
  [4, "shopify", 7, [[3, 1]], "ready_to_pack", 1],
  [5, "etsy", 0, [[2, 2]], "ready_to_pack", -1],
  [6, "etsy", 1, [[0, 1]], "on_hold", 2],
  [8, "shopify", 2, [[4, 1]], "dispatched", -4],
  [12, "etsy", 3, [[1, 1], [5, 2]], "dispatched", -9, "Name: \"Leo\""],
  [16, "shopify", 4, [[2, 1]], "completed", -13],
  [21, "etsy", 5, [[0, 2]], "completed", -18],
  [27, "etsy", 6, [[3, 3]], "completed", -24],
  [33, "shopify", 7, [[4, 1]], "completed", -30],
  [38, "etsy", 0, [[5, 3]], "completed", -35],
  [44, "manual", 1, [[2, 1]], "completed", -41],
];

const day = 24 * 3600_000;

export async function loadSampleData(supabase: ServerSupabase, userId: string) {
  const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("is_sample", true);
  if (count) throw new Error("Sample data is already loaded. Remove it first to reload.");

  const { data: printers } = await supabase.from("printers").select("id, name, status").eq("is_active", true).order("sort_order");
  if (!printers?.length) throw new Error("Add at least one printer before loading sample data.");

  const { data: products, error: pErr } = await supabase
    .from("products")
    .insert(
      PRODUCTS.map((p, i) => ({
        name: p.name,
        sku: p.sku,
        category: p.category,
        description: "Sample product for exploring PrintFlow.",
        estimated_print_minutes: p.minutes,
        estimated_filament_g: p.grams,
        material: p.material,
        default_colour: p.colour,
        base_price: p.price,
        packaging_cost: p.packaging,
        default_printer_id: printers[i % printers.length]!.id,
        production_instructions: i === 2 ? "Print in place — no supports. 0.2mm layers, 15% gyroid." : "0.2mm layers, 3 walls, 15% infill.",
        model_file_ref: `sample/${p.sku.toLowerCase()}.3mf`,
        is_sample: true,
      })),
    )
    .select("id, name, sku, estimated_print_minutes, estimated_filament_g, material, default_colour, base_price, default_printer_id");
  if (pErr || !products) throw new Error(pErr?.message ?? "Could not create sample products");

  await supabase.from("product_listings").insert([
    { product_id: products[0]!.id, source: "etsy", external_listing_id: "SAMPLE-LISTING-1001", title: products[0]!.name },
    { product_id: products[0]!.id, source: "shopify", external_listing_id: "gid://shopify/Product/SAMPLE1", title: products[0]!.name },
    { product_id: products[1]!.id, source: "etsy", external_listing_id: "SAMPLE-LISTING-1002", title: products[1]!.name },
  ]);

  const { data: spools } = await supabase
    .from("filament_stock")
    .insert(
      FILAMENT.map((f, i) => ({
        brand: f.brand,
        material: f.material,
        colour: f.colour,
        colour_hex: f.colour_hex,
        spool_weight_g: f.spool,
        remaining_g: f.remaining,
        purchase_price: f.price,
        supplier: f.supplier,
        purchase_date: new Date(Date.now() - (30 + i * 9) * day).toISOString().slice(0, 10),
        low_stock_threshold_g: 200,
        is_sample: true,
      })),
    )
    .select("id, material, colour");

  const { data: customers, error: cErr } = await supabase
    .from("customers")
    .insert(CUSTOMERS.map(([name, email]) => ({ display_name: name, email, first_source: "etsy" as const, is_sample: true })))
    .select("id, display_name, email");
  if (cErr || !customers) throw new Error(cErr?.message ?? "Could not create sample customers");

  const now = Date.now();
  let printingStarted = false;

  for (let n = 0; n < ORDERS.length; n++) {
    const [daysAgo, source, ci, lines, stage, dispatchIn, personalisation] = ORDERS[n]!;
    const customer = customers[ci]!;
    const orderDate = new Date(now - daysAgo * day - (n % 5) * 3600_000);
    const subtotal = lines.reduce((s, [pi, q]) => s + products[pi]!.base_price! * q, 0);
    const shipping = source === "manual" ? 0 : 3.95;
    const closed = stage === "dispatched" || stage === "completed";
    const dispatchedAt = closed ? new Date(orderDate.getTime() + 2 * day) : null;

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .insert({
        source,
        external_order_id: source === "manual" ? null : `SAMPLE-${source.toUpperCase()}-${3000 + n}`,
        external_order_number: source === "shopify" ? `#S${3000 + n}` : source === "etsy" ? `${3000 + n}` : null,
        customer_id: customer.id,
        customer_name: customer.display_name,
        customer_email: customer.email,
        shipping_address: {
          name: customer.display_name,
          line1: `${10 + n} Example Street`,
          city: "Sampletown",
          postal_code: "SA1 1PL",
          country_code: "GB",
        },
        order_date: orderDate.toISOString(),
        payment_status: "paid",
        currency: "GBP",
        subtotal,
        shipping_total: shipping,
        total: subtotal + shipping,
        dispatch_by: new Date(now + dispatchIn * day).toISOString(),
        priority: dispatchIn <= 0 && !closed ? "high" : n === 4 ? "urgent" : "normal",
        shipping_method: source === "manual" ? "Collection" : "Royal Mail Tracked 48",
        customer_note: n === 3 ? "Could this be gift wrapped please? It's a birthday present." : null,
        production_notes: n === 9 ? "Waiting for customer to confirm colour choice." : null,
        is_sample: true,
        created_by: userId,
      })
      .select("id")
      .single();
    if (oErr || !order) throw new Error(oErr?.message ?? "Could not create sample order");

    for (const [li, [pi, qty]] of lines.entries()) {
      const p = products[pi]!;
      const { data: item } = await supabase
        .from("order_items")
        .insert({
          order_id: order.id,
          product_id: p.id,
          external_line_item_id: source === "manual" ? null : `SAMPLE-LINE-${n}-${li}`,
          sku: p.sku,
          title: p.name,
          quantity: qty,
          unit_price: p.base_price!,
          total_price: p.base_price! * qty,
          personalisation: li === 0 ? (personalisation ?? null) : null,
        })
        .select("id")
        .single();
      if (!item) continue;

      const jobStage: Stage = stage === "printing" && li > 0 ? "ready_to_print" : stage;
      const { data: job } = await supabase
        .from("production_jobs")
        .insert({
          order_id: order.id,
          order_item_id: item.id,
          product_id: p.id,
          stage: jobStage === "printing" ? "ready_to_print" : jobStage,
          priority: dispatchIn <= 0 && !closed ? "high" : n === 4 ? "urgent" : "normal",
          quantity: qty,
          printer_id: ["new_order", "awaiting_preparation"].includes(jobStage) ? null : p.default_printer_id,
          estimated_print_minutes: (p.estimated_print_minutes ?? 0) * qty,
          estimated_filament_g: Number(p.estimated_filament_g ?? 0) * qty,
          material: p.material,
          colour: p.default_colour,
          due_date: new Date(now + dispatchIn * day).toISOString(),
          is_sample: true,
        })
        .select("id")
        .single();
      if (!job) continue;

      // Print history for jobs that have been through the printer.
      if (["quality_check", "ready_to_pack", "dispatched", "completed"].includes(jobStage)) {
        const start = new Date(orderDate.getTime() + 0.5 * day);
        const mins = (p.estimated_print_minutes ?? 60) * qty;
        if (n === 8) {
          await supabase.from("print_runs").insert({
            production_job_id: job.id,
            printer_id: p.default_printer_id,
            attempt_number: 1,
            status: "failed",
            started_at: new Date(start.getTime() - 6 * 3600_000).toISOString(),
            ended_at: new Date(start.getTime() - 4 * 3600_000).toISOString(),
            failure_reason: "Bed adhesion / warping",
            estimated_minutes: mins,
          });
          await supabase.from("production_jobs").update({ failed_attempts: 1, attempt_count: 2 }).eq("id", job.id);
        } else {
          await supabase.from("production_jobs").update({ attempt_count: 1 }).eq("id", job.id);
        }
        const { data: run } = await supabase
          .from("print_runs")
          .insert({
            production_job_id: job.id,
            printer_id: p.default_printer_id,
            attempt_number: n === 8 ? 2 : 1,
            status: "succeeded",
            started_at: start.toISOString(),
            ended_at: new Date(start.getTime() + mins * 60_000 * 1.05).toISOString(),
            estimated_minutes: mins,
          })
          .select("id")
          .single();
        const spool = spools?.find((s) => s.material === p.material && s.colour === p.default_colour);
        if (run && spool && n % 2 === 0) {
          await supabase.from("filament_usage").insert({
            filament_stock_id: spool.id,
            print_run_id: run.id,
            production_job_id: job.id,
            grams: Math.round(Number(p.estimated_filament_g ?? 0) * qty * 1.04),
            kind: "print",
          });
        }
      }

      // One live print so the Print Farm has something running.
      if (jobStage === "printing" && !printingStarted && p.default_printer_id) {
        const printer = printers.find((pr) => pr.id === p.default_printer_id);
        if (printer && printer.status === "available") {
          const { error } = await supabase.rpc("start_print_run", { p_job_id: job.id, p_printer_id: p.default_printer_id });
          if (!error) printingStarted = true;
        }
      }
    }

    if (stage === "dispatched" || stage === "completed") {
      await supabase.from("shipments").insert({
        order_id: order.id,
        status: "dispatched",
        carrier: "Royal Mail",
        shipping_method: source === "manual" ? "Collection" : "Tracked 48",
        tracking_number: `SAMPLE${100000 + n}GB`,
        packed_at: dispatchedAt!.toISOString(),
        dispatched_at: dispatchedAt!.toISOString(),
        shipping_cost: source === "manual" ? 0 : 3.2,
        checklist: [],
        marketplace_push_status: "not_required",
      });
      await supabase
        .from("orders")
        .update({
          status: stage === "completed" ? "completed" : "dispatched",
          dispatched_at: dispatchedAt!.toISOString(),
          completed_at: stage === "completed" ? new Date(dispatchedAt!.getTime() + 3 * day).toISOString() : null,
          carrier: "Royal Mail",
          tracking_number: `SAMPLE${100000 + n}GB`,
        })
        .eq("id", order.id);
    } else if (stage === "on_hold") {
      await supabase.rpc("set_order_hold", { p_order_id: order.id, p_hold: true, p_reason: "Sample: awaiting customer reply" });
    }
  }

  return { orders: ORDERS.length, products: PRODUCTS.length, customers: CUSTOMERS.length, filament: FILAMENT.length };
}
