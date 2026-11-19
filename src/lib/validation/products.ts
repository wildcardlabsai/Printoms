import { z } from "zod";
import { optionalNumber, optionalText } from "./common";

export const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(200),
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required")
    .max(80)
    .regex(/^[A-Za-z0-9._\-/]+$/, "Use letters, numbers, dashes, dots or slashes"),
  description: optionalText(4000),
  category: optionalText(80),
  material: optionalText(60),
  default_colour: optionalText(80),
  estimated_print_minutes: optionalNumber({ max: 100000, int: true }),
  estimated_filament_g: optionalNumber({ max: 100000 }),
  default_printer_id: z.string().optional().nullable().transform((v) => (v ? v : null)),
  model_file_ref: optionalText(500),
  production_instructions: optionalText(4000),
  base_price: optionalNumber({ max: 100000 }),
  material_cost: optionalNumber({ max: 100000 }),
  packaging_cost: optionalNumber({ max: 100000 }),
  labour_cost: optionalNumber({ max: 100000 }),
  other_cost: optionalNumber({ max: 100000 }),
  is_active: z.boolean().default(true),
});
export type ProductInput = z.input<typeof productSchema>;

export const listingSchema = z
  .object({
    product_id: z.uuid(),
    source: z.enum(["etsy", "shopify", "vinted"]),
    external_listing_id: z.string().trim().min(1, "Listing ID is required").max(200),
    external_variant_id: optionalText(200),
    external_sku: optionalText(120),
    title: optionalText(300),
    url: optionalText(500).refine((v) => v === null || /^https?:\/\//i.test(v), "Must start with http(s)://"),
  })
  .transform((v) => {
    // Accept a bare numeric Shopify ID and normalise to a GID.
    if (v.source === "shopify" && /^\d+$/.test(v.external_listing_id)) v.external_listing_id = `gid://shopify/Product/${v.external_listing_id}`;
    if (v.source === "shopify" && v.external_variant_id && /^\d+$/.test(v.external_variant_id)) {
      v.external_variant_id = `gid://shopify/ProductVariant/${v.external_variant_id}`;
    }
    return v;
  })
  .superRefine((v, ctx) => {
    if (v.source === "etsy" && !/^\d+$/.test(v.external_listing_id)) {
      ctx.addIssue({ code: "custom", path: ["external_listing_id"], message: "Etsy listing IDs are numeric (from the listing URL)" });
    }
  });
