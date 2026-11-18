"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resetSchema, signInSchema, signUpSchema, updatePasswordSchema } from "@/lib/validation/auth";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { resolveSiteUrl } from "@/lib/server-env";

function safeNext(next: unknown) {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/overview";
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return resolveSiteUrl(host ? `${proto}://${host}` : undefined);
}

export async function signInAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Please check the highlighted fields", z.flattenError(parsed.error).fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return fail(error.message === "Invalid login credentials" ? "Incorrect email or password." : error.message);
  }
  redirect(safeNext(formData.get("next")));
}

export async function createOwnerAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Please check the highlighted fields", z.flattenError(parsed.error).fieldErrors);

  const supabase = await createClient();
  const { data: setupRequired } = await supabase.rpc("setup_required");
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await origin()}/auth/callback`,
    },
  });
  if (error) return fail(error.message);

  if (!data.session) {
    return ok(undefined, "Check your inbox to confirm your email address, then sign in.");
  }
  redirect(setupRequired ? "/overview?welcome=1" : "/auth/pending");
}

export async function requestPasswordResetAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Enter a valid email address", z.flattenError(parsed.error).fieldErrors);
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origin()}/auth/callback?next=/settings/profile?reset=1`,
  });
  // Same response whether or not the account exists.
  return ok(undefined, "If an account exists for that email, a reset link is on its way.");
}

export async function updatePasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = updatePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Please check the highlighted fields", z.flattenError(parsed.error).fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(error.message);
  return ok(undefined, "Password updated");
}
