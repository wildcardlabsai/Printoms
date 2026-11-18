import { z } from "zod";
import { optionalNumber, optionalText } from "./common";

export const printerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  manufacturer: z.string().trim().min(1, "Manufacturer is required").max(80),
  model: z.string().trim().min(1, "Model is required").max(80),
  printer_type: z.string().trim().min(1).max(80).default("FDM"),
  build_volume_x_mm: optionalNumber({ min: 1, max: 5000, int: true }),
  build_volume_y_mm: optionalNumber({ min: 1, max: 5000, int: true }),
  build_volume_z_mm: optionalNumber({ min: 1, max: 5000, int: true }),
  nozzle_size_mm: optionalNumber({ min: 0.1, max: 5 }),
  supported_materials: z.array(z.string().trim().min(1).max(30)).max(30).default([]),
  has_multi_material: z.boolean().default(false),
  maintenance_notes: optionalText(4000),
  is_active: z.boolean().default(true),
});

export type PrinterInput = z.input<typeof printerSchema>;
