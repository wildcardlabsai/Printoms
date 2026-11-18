import { z } from "zod";
import { optionalDate, optionalNumber, optionalText, requiredNumber, uuid } from "./common";

export const stageEnum = z.enum([
  "new_order",
  "awaiting_preparation",
  "ready_to_print",
  "printing",
  "quality_check",
  "ready_to_pack",
  "dispatched",
  "completed",
  "on_hold",
]);

export const jobUpdateSchema = z.object({
  job_id: uuid,
  priority: z.enum(["low", "normal", "high", "urgent"]),
  estimated_print_minutes: optionalNumber({ max: 100000, int: true }),
  material: optionalText(60),
  colour: optionalText(80),
  estimated_filament_g: optionalNumber({ max: 100000 }),
  print_requirements: optionalText(4000),
  notes: optionalText(4000),
  due_date: optionalDate,
});

export const finishPrintSchema = z
  .object({
    run_id: uuid,
    succeeded: z.boolean(),
    failure_reason: optionalText(500),
    notes: optionalText(2000),
    requeue: z.boolean().default(true),
    filament_stock_id: z.string().optional().nullable().transform((v) => (v ? v : null)),
    filament_grams: optionalNumber({ max: 50000 }),
  })
  .superRefine((v, ctx) => {
    if (!v.succeeded && !v.failure_reason) {
      ctx.addIssue({ code: "custom", path: ["failure_reason"], message: "Describe why the print failed" });
    }
    if (v.filament_stock_id && !v.filament_grams) {
      ctx.addIssue({ code: "custom", path: ["filament_grams"], message: "Enter the grams used" });
    }
  });

export const filamentUsageSchema = z.object({
  filament_stock_id: uuid,
  grams: requiredNumber({ min: 0.1, max: 50000 }),
  print_run_id: z.string().optional().nullable().transform((v) => (v ? v : null)),
  production_job_id: z.string().optional().nullable().transform((v) => (v ? v : null)),
  kind: z.enum(["print", "failed_print", "waste"]).default("print"),
  note: optionalText(500),
});
