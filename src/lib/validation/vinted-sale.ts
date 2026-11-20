import { z } from "zod";

export const VINTED_SALE_STATUSES = {
  to_make: { label: "To make", help: "Goes onto the Production Board", vinted: "CREATED", shipped: false },
  shipped: { label: "Already shipped", help: "Recorded as completed", vinted: "SHIPPED", shipped: true },
  delivered: { label: "Delivered", help: "Recorded as completed", vinted: "DELIVERED", shipped: true },
} as const;
export type VintedSaleStatus = keyof typeof VINTED_SALE_STATUSES;

const money = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = typeof v === "number" ? v : Number(String(v).replace(/[£,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 10_000) {
    ctx.addIssue({ code: "custom", message: "Enter the price, e.g. 12.00" });
    return z.NEVER;
  }
  return Math.round(n * 100) / 100;
});

export const vintedSaleSchema = z.object({
  /** One per form: a repeated submit can never create the sale twice. */
  key: z.uuid(),
  sale_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the sale date"),
  status: z.enum(["to_make", "shipped", "delivered"]),
  buyer: z.string().trim().max(80),
  reference: z.string().trim().max(60),
  note: z.string().trim().max(1000),
  items: z
    .array(
      z.object({
        product_id: z.union([z.uuid(), z.literal("")]),
        title: z.string().trim().max(200),
        quantity: z.coerce.number().int("Whole numbers only").min(1).max(99),
        price: money,
        personalisation: z.string().trim().max(1000),
      }),
    )
    .min(1, "Add at least one item")
    .max(20),
});
export type VintedSaleInput = z.input<typeof vintedSaleSchema>;
