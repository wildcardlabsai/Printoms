import { z } from "zod";

/** Optional trimmed text: "" → null */
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** Optional non-negative number from form input: "" → null */
export const optionalNumber = (opts: { min?: number; max?: number; int?: boolean } = {}) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) ? null : Number(v)),
    z
      .number({ error: "Enter a number" })
      .min(opts.min ?? 0, `Must be at least ${opts.min ?? 0}`)
      .max(opts.max ?? 1_000_000)
      .refine((n) => !opts.int || Number.isInteger(n), "Must be a whole number")
      .nullable(),
  );

export const requiredNumber = (opts: { min?: number; max?: number; int?: boolean } = {}) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z
      .number({ error: "Required" })
      .min(opts.min ?? 0, `Must be at least ${opts.min ?? 0}`)
      .max(opts.max ?? 1_000_000)
      .refine((n) => !opts.int || Number.isInteger(n), "Must be a whole number"),
  );

export const uuid = z.uuid("Invalid identifier");

export const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), "Enter a valid date");

export const addressSchema = z.object({
  name: optionalText(200),
  line1: optionalText(200),
  line2: optionalText(200),
  city: optionalText(120),
  region: optionalText(120),
  postal_code: optionalText(32),
  country_code: optionalText(2).transform((v) => (v ? v.toUpperCase() : null)),
  phone: optionalText(40),
});
