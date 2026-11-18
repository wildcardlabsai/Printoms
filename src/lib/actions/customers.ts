"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authoriseAction, AuthorisationError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { optionalText, uuid } from "@/lib/validation/common";

const customerSchema = z.object({
  id: uuid,
  display_name: z.string().trim().min(1, "Name is required").max(200),
  email: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email"),
  phone: optionalText(40),
  notes: optionalText(4000),
});

function handle(e: unknown): ActionResult<never> {
  if (e instanceof AuthorisationError) return fail(e.message);
  if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Invalid input");
  throw e;
}

export async function updateCustomerAction(input: z.input<typeof customerSchema>): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const { id, ...v } = customerSchema.parse(input);
    const supabase = await createClient();
    const { error } = await supabase.from("customers").update(v).eq("id", id);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/customers/${id}`);
    revalidatePath("/customers");
    return ok(undefined, "Customer updated");
  } catch (e) {
    return handle(e);
  }
}

export async function mergeCustomersAction(targetId: string, sourceId: string): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const supabase = await createClient();
    const { error } = await supabase.rpc("merge_customers", { p_target: uuid.parse(targetId), p_source: uuid.parse(sourceId) });
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/customers");
    revalidatePath(`/customers/${targetId}`);
    return ok(undefined, "Customers merged");
  } catch (e) {
    return handle(e);
  }
}
