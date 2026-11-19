"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authoriseAction, AuthorisationError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { businessSettingsSchema, integrationSettingsSchema, type BusinessSettingsInput } from "@/lib/validation/settings";
import { uuid } from "@/lib/validation/common";
import { deleteCredentials, getIntegration } from "@/lib/integrations/credentials";
import { pushShipmentToMarketplace } from "@/lib/integrations/fulfilment";
import { retrySyncFailure } from "@/lib/integrations/failures";
import { hasServiceRole } from "@/lib/server-env";
import { maxImportDays } from "@/lib/integrations/import-window";

function handle(e: unknown): ActionResult<never> {
  if (e instanceof AuthorisationError) return fail(e.message);
  if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Invalid input");
  if (e instanceof Error) return fail(e.message);
  throw e;
}

const provider = z.enum(["etsy", "shopify", "vinted"]);

export async function updateBusinessSettingsAction(input: BusinessSettingsInput): Promise<ActionResult> {
  try {
    await authoriseAction("admin");
    const parsed = businessSettingsSchema.safeParse(input);
    if (!parsed.success) return fail("Please check the highlighted fields", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: parsed.data.timezone });
    } catch {
      return fail("Unknown timezone", { timezone: ["Use an IANA timezone such as Europe/London"] });
    }
    const supabase = await createClient();
    const { error } = await supabase.from("business_settings").update(parsed.data).eq("singleton", true);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/", "layout");
    return ok(undefined, "Settings saved");
  } catch (e) {
    return handle(e);
  }
}

export async function updateIntegrationSettingsAction(
  providerInput: string,
  input: z.input<typeof integrationSettingsSchema>,
): Promise<ActionResult> {
  try {
    await authoriseAction("admin");
    const p = provider.parse(providerInput);
    const v = integrationSettingsSchema.parse(input);
    const supabase = await createClient();
    const { data: current } = await supabase.from("integrations").select("scopes").eq("provider", p).single();
    const max = maxImportDays(p, current?.scopes);
    if (v.initial_import_days > max) {
      return fail(
        p === "shopify"
          ? `Shopify only provides the last ${max} days of orders without the read_all_orders permission.`
          : `The maximum import window is ${max} days.`,
      );
    }
    const { error } = await supabase.from("integrations").update(v).eq("provider", p);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/settings/integrations");
    return ok(undefined, "Sync settings saved");
  } catch (e) {
    return handle(e);
  }
}

export async function disconnectIntegrationAction(providerInput: string): Promise<ActionResult> {
  try {
    const user = await authoriseAction("admin");
    const p = provider.parse(providerInput);
    if (!hasServiceRole()) return fail("SUPABASE_SECRET_KEY is required to remove stored credentials.");
    const admin = createAdminClient();
    const integration = await getIntegration(admin, p);
    await deleteCredentials(admin, integration.id);
    await admin
      .from("integrations")
      .update({
        status: "not_connected",
        connected_at: null,
        sync_cursor: null,
        next_sync_at: null,
        last_error: null,
        consecutive_failures: 0,
        sync_locked_until: null,
      })
      .eq("id", integration.id);
    await admin.from("activity_log").insert({
      entity_type: "integration",
      entity_id: integration.id,
      action: "integration.disconnected",
      message: `${p === "etsy" ? "Etsy" : "Shopify"} disconnected — existing orders were kept`,
      actor_id: user.id,
    });
    revalidatePath("/", "layout");
    return ok(undefined, "Disconnected. Imported orders have been kept.");
  } catch (e) {
    return handle(e);
  }
}

export async function updateMemberAction(profileId: string, input: { role?: string; is_active?: boolean }): Promise<ActionResult> {
  try {
    const user = await authoriseAction("admin");
    const id = uuid.parse(profileId);
    const role = input.role ? z.enum(["owner", "admin", "staff", "viewer"]).parse(input.role) : undefined;
    if (id === user.id && (input.is_active === false || (role && role !== user.role))) {
      return fail("You can’t change your own role or access.");
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ ...(role ? { role } : {}), ...(input.is_active !== undefined ? { is_active: input.is_active } : {}) })
      .eq("id", id);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/settings/team");
    return ok(undefined, "Team member updated");
  } catch (e) {
    return handle(e);
  }
}

export async function updateProfileAction(fullName: string): Promise<ActionResult> {
  try {
    const user = await authoriseAction("viewer");
    const name = z.string().trim().min(1, "Enter your name").max(120).parse(fullName);
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", user.id);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/", "layout");
    return ok(undefined, "Profile updated");
  } catch (e) {
    return handle(e);
  }
}

export async function pushShipmentAction(shipmentId: string): Promise<ActionResult> {
  try {
    const user = await authoriseAction("staff");
    if (!hasServiceRole()) return fail("SUPABASE_SECRET_KEY is required for marketplace updates.");
    const result = await pushShipmentToMarketplace(uuid.parse(shipmentId), user.id);
    revalidatePath("/fulfilment");
    revalidatePath("/orders");
    if (result.ok) return ok(undefined, result.message);
    const hint: Record<string, string> = {
      credentials: " Reconnect the marketplace in Settings → Integrations, then retry.",
      rate_limited: " The marketplace is busy — retry in a few minutes.",
      marketplace_error: " The marketplace had a problem — retry shortly.",
      network: " The connection dropped — retrying is safe (PrintFlow checks before resubmitting).",
      marketplace_rejected: " Check the tracking details and the order on the marketplace.",
    };
    return fail(`${result.message}${hint[result.category] ?? ""}`, undefined, result.category);
  } catch (e) {
    revalidatePath("/fulfilment");
    return handle(e);
  }
}

const failureNote = z.string().trim().max(500);

/** Retry one failed marketplace order now, from its stored data. */
export async function retrySyncFailureAction(failureId: string): Promise<ActionResult> {
  try {
    const user = await authoriseAction("admin");
    if (!hasServiceRole()) return fail("SUPABASE_SECRET_KEY is required to retry imports.");
    const result = await retrySyncFailure(uuid.parse(failureId), { id: user.id, label: user.fullName || user.email || "Team member" });
    revalidatePath("/settings/integrations");
    revalidatePath("/orders");
    return result.ok ? ok(undefined, result.message) : fail(result.message);
  } catch (e) {
    return handle(e);
  }
}

/** Stop retrying a failed order. A reason is required; it stays in the history. */
export async function dismissSyncFailureAction(failureId: string, reason: string): Promise<ActionResult> {
  try {
    await authoriseAction("admin");
    const r = failureNote.min(3, "Give a reason (at least 3 characters)").parse(reason);
    const supabase = await createClient();
    const { error } = await supabase.rpc("dismiss_sync_failure", { p_failure_id: uuid.parse(failureId), p_reason: r });
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/settings/integrations");
    return ok(undefined, "Dismissed — it won’t be retried or shown as outstanding. You can reopen it at any time.");
  } catch (e) {
    return handle(e);
  }
}

/** Put a dismissed failure back into the automatic retry queue. */
export async function reopenSyncFailureAction(failureId: string, note?: string): Promise<ActionResult> {
  try {
    await authoriseAction("admin");
    const supabase = await createClient();
    const { error } = await supabase.rpc("reopen_sync_failure", {
      p_failure_id: uuid.parse(failureId),
      p_note: failureNote.parse(note ?? ""),
    });
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/settings/integrations");
    return ok(undefined, "Reopened — it will be retried on the next sync.");
  } catch (e) {
    return handle(e);
  }
}
