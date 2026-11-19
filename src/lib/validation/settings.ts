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

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v ? v : null));

export const slipSettingsSchema = z.object({
  return_address: optionalText(400),
  contact_email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email address")
    .transform((v) => (v ? v : null)),
  slip_message: z.string().trim().max(600),
  slip_show_prices: z.boolean(),
});
export type SlipSettingsInput = z.input<typeof slipSettingsSchema>;

export const alertSettingsSchema = z
  .object({
    new_order_alerts_enabled: z.boolean(),
    new_order_alert_email: z
      .string()
      .trim()
      .max(200)
      .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email address")
      .transform((v) => (v ? v : null)),
  })
  .refine((v) => !v.new_order_alerts_enabled || v.new_order_alert_email, { message: "Enter the email address for alerts", path: ["new_order_alert_email"] });
export type AlertSettingsInput = z.input<typeof alertSettingsSchema>;
