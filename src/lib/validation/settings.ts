import { z } from "zod";
import { requiredNumber } from "./common";

export const businessSettingsSchema = z.object({
  business_name: z.string().trim().min(1, "Business name is required").max(120),
  currency: z.string().trim().length(3, "Use a 3-letter currency code").transform((v) => v.toUpperCase()),
  timezone: z.string().trim().min(1).max(64),
  default_dispatch_days: requiredNumber({ min: 0, max: 60, int: true }),
  etsy_fee_percent: requiredNumber({ min: 0, max: 50 }),
  etsy_fixed_fee: requiredNumber({ min: 0, max: 100 }),
  shopify_fee_percent: requiredNumber({ min: 0, max: 50 }),
  shopify_fixed_fee: requiredNumber({ min: 0, max: 100 }),
  default_packaging_cost: requiredNumber({ min: 0, max: 1000 }),
  default_filament_cost_per_kg: requiredNumber({ min: 0, max: 1000 }),
  packing_checklist: z.array(z.string().trim().min(1).max(120)).max(20),
});

export type BusinessSettingsInput = z.input<typeof businessSettingsSchema>;

export const integrationSettingsSchema = z.object({
  sync_enabled: z.boolean(),
  sync_interval_minutes: requiredNumber({ min: 5, max: 1440, int: true }),
  initial_import_days: requiredNumber({ min: 1, max: 365, int: true }),
});
