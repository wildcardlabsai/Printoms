import { z } from "zod";
import { optionalNumber, optionalText, uuid } from "./common";

export const packSchema = z.object({
  order_id: uuid,
  checklist: z.array(z.object({ label: z.string().max(200), done: z.boolean() })).max(30),
  packaging_notes: optionalText(2000),
});

export const dispatchSchema = z.object({
  order_id: uuid,
  carrier: z.string().trim().min(1, "Choose a carrier").max(80),
  tracking_number: optionalText(120),
  shipping_method: optionalText(120),
  tracking_url: optionalText(500).refine((v) => v === null || /^https?:\/\//i.test(v), "Must start with http(s)://"),
  shipping_cost: optionalNumber({ max: 10000 }),
  dispatched_at: z.string().optional().nullable().transform((v) => (v ? v : null)),
});
