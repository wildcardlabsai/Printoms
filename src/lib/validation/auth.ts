import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(120),
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(128)
    .regex(/[A-Za-z]/, "Include at least one letter")
    .regex(/[0-9]/, "Include at least one number"),
});

export const resetSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
});

export const updatePasswordSchema = z
  .object({
    password: signUpSchema.shape.password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });
