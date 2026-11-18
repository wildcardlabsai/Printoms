"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authoriseAction, AuthorisationError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { dispatchSchema, packSchema } from "@/lib/validation/fulfilment";
import { trackingUrlFor, validateTracking, validateTrackingUrl } from "@/lib/integrations/carriers";

function handle(e: unknown): ActionResult<never> {
  if (e instanceof AuthorisationError) return fail(e.message);
  if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Invalid input");
  throw e;
}

function revalidate(orderId: string) {
  revalidatePath("/fulfilment");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/overview");
  revalidatePath("/production");
}

export async function markPackedAction(input: z.input<typeof packSchema>): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const v = packSchema.parse(input);
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_order_packed", {
      p_order_id: v.order_id,
      p_checklist: v.checklist,
      p_packaging_notes: v.packaging_notes ?? undefined,
    });
    if (error) return fail(dbErrorMessage(error));
    revalidate(v.order_id);
    return ok(undefined, "Order packed");
  } catch (e) {
    return handle(e);
  }
}

export async function markDispatchedAction(input: z.input<typeof dispatchSchema>): Promise<ActionResult<{ shipmentId: string }>> {
  try {
    await authoriseAction("staff");
    const parsed = dispatchSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    const v = parsed.data;
    // Validate tracking up front: no placeholders or junk ever stored as tracking.
    let tracking: string | null = null;
    let warning: string | null = null;
    if (v.tracking_number) {
      const t = validateTracking(v.carrier, v.tracking_number);
      if (!t.ok) return fail(t.error, { tracking_number: [t.error] });
      tracking = t.normalised;
      warning = t.warning;
    }
    const url = validateTrackingUrl(v.tracking_url);
    if (!url.ok) return fail(url.error, { tracking_url: [url.error] });
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("mark_order_dispatched", {
      p_order_id: v.order_id,
      p_carrier: v.carrier,
      p_tracking_number: tracking ?? "",
      p_shipping_method: v.shipping_method ?? undefined,
      p_tracking_url: url.url ?? (tracking ? trackingUrlFor(v.carrier, tracking) ?? undefined : undefined),
      p_shipping_cost: v.shipping_cost ?? undefined,
      p_dispatched_at: v.dispatched_at ?? undefined,
    });
    if (error) return fail(dbErrorMessage(error));
    revalidate(v.order_id);
    return ok(
      { shipmentId: data as string },
      warning ? `Order dispatched. ${warning}` : tracking ? "Order dispatched" : "Order dispatched without tracking — the marketplace can’t be updated automatically",
    );
  } catch (e) {
    return handle(e);
  }
}
