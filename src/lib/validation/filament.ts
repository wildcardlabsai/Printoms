import { z } from "zod";
import { optionalNumber, optionalText, requiredNumber } from "./common";

export const spoolSchema = z
  .object({
    brand: z.string().trim().min(1, "Brand is required").max(80),
    material: z.string().trim().min(1, "Material is required").max(40),
    colour: z.string().trim().min(1, "Colour is required").max(80),
    colour_hex: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^#[0-9A-Fa-f]{6}$/.test(v), "Use a hex colour like #22A06F"),
    spool_weight_g: requiredNumber({ min: 1, max: 20000, int: true }),
    remaining_g: requiredNumber({ min: 0, max: 20000 }),
    purchase_price: optionalNumber({ max: 10000 }),
    supplier: optionalText(120),
    purchase_date: z.string().optional().nullable().transform((v) => (v ? v : null)),
    low_stock_threshold_g: requiredNumber({ min: 0, max: 20000, int: true }),
    notes: optionalText(2000),
  })
  .refine((v) => v.remaining_g <= v.spool_weight_g, { path: ["remaining_g"], message: "Can’t exceed the spool weight" });

export type SpoolInput = z.input<typeof spoolSchema>;

export const adjustSchema = z.object({
  stock_id: z.uuid(),
  mode: z.enum(["set_remaining", "waste", "usage"]),
  grams: requiredNumber({ min: 0, max: 20000 }),
  note: optionalText(500),
});
