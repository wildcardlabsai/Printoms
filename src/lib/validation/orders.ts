import { z } from "zod";
import { addressSchema, optionalDate, optionalNumber, optionalText, requiredNumber, uuid } from "./common";

export const priorityEnum = z.enum(["low", "normal", "high", "urgent"]);
export const paymentEnum = z.enum(["pending", "paid", "partially_paid", "partially_refunded", "refunded", "voided", "unknown"]);

export const manualOrderItemSchema = z.object({
  product_id: z.string().optional().nullable().transform((v) => (v ? v : null)),
  title: optionalText(300),
  sku: optionalText(80),
  variant_title: optionalText(200),
  quantity: requiredNumber({ min: 1, max: 10000, int: true }),
  unit_price: requiredNumber({ min: 0, max: 100000 }),
  personalisation: optionalText(2000),
});

export const manualOrderSchema = z
  .object({
    customer_name: z.string().trim().min(1, "Customer name is required").max(200),
    customer_email: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v ? v.toLowerCase() : null))
      .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email"),
    customer_phone: optionalText(40),
    external_order_number: optionalText(80),
    order_date: optionalDate,
    dispatch_by: optionalDate,
    payment_status: paymentEnum.default("pending"),
    priority: priorityEnum.default("normal"),
    shipping_method: optionalText(120),
    shipping_total: optionalNumber({ max: 10000 }),
    discount_total: optionalNumber({ max: 100000 }),
    customer_note: optionalText(4000),
    production_notes: optionalText(4000),
    shipping_address: addressSchema,
    items: z.array(manualOrderItemSchema).min(1, "Add at least one item").max(100),
  })
  .superRefine((v, ctx) => {
    v.items.forEach((item, i) => {
      if (!item.product_id && !item.title) {
        ctx.addIssue({ code: "custom", path: ["items", i, "title"], message: "Choose a product or enter an item name" });
      }
    });
  });

export type ManualOrderInput = z.input<typeof manualOrderSchema>;

export const orderInternalSchema = z.object({
  order_id: uuid,
  priority: priorityEnum,
  dispatch_by: optionalDate,
  production_notes: optionalText(4000),
  shipping_method: optionalText(120),
});

export const noteSchema = z.object({
  entity_type: z.enum(["order", "customer", "product", "production_job", "printer"]),
  entity_id: uuid,
  body: z.string().trim().min(1, "Write a note first").max(4000),
});

export const orderItemMappingSchema = z.object({
  item_id: uuid,
  product_id: z.string().optional().nullable().transform((v) => (v ? v : null)),
  internal_notes: optionalText(2000),
});
