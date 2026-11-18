"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authoriseAction, AuthorisationError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { manualOrderSchema, orderInternalSchema, orderItemMappingSchema, type ManualOrderInput } from "@/lib/validation/orders";
import { uuid } from "@/lib/validation/common";

function handle(e: unknown): ActionResult<never> {
  if (e instanceof AuthorisationError) return fail(e.message);
  if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Invalid input");
  throw e;
}

function revalidateOrder(orderId?: string) {
  revalidatePath("/orders");
  revalidatePath("/overview");
  revalidatePath("/production");
  revalidatePath("/fulfilment");
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

export async function createManualOrderAction(input: ManualOrderInput): Promise<ActionResult<{ id: string }>> {
  try {
    await authoriseAction("staff");
    const parsed = manualOrderSchema.safeParse(input);
    if (!parsed.success) {
      return fail("Please check the highlighted fields", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    }
    const { items, ...order } = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_manual_order", {
      p_order: {
        ...order,
        order_date: order.order_date ? new Date(order.order_date).toISOString() : null,
        dispatch_by: order.dispatch_by ? new Date(order.dispatch_by).toISOString() : null,
      },
      p_items: items,
    });
    if (error) return fail(dbErrorMessage(error));
    revalidateOrder();
    return ok({ id: data as string }, "Order created");
  } catch (e) {
    return handle(e);
  }
}

export async function updateOrderInternalAction(input: z.input<typeof orderInternalSchema>): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const v = orderInternalSchema.parse(input);
    const supabase = await createClient();
    const { data: before } = await supabase.from("orders").select("priority, dispatch_by").eq("id", v.order_id).single();
    const { error } = await supabase
      .from("orders")
      .update({
        priority: v.priority,
        dispatch_by: v.dispatch_by ? new Date(v.dispatch_by).toISOString() : null,
        production_notes: v.production_notes,
        shipping_method: v.shipping_method,
      })
      .eq("id", v.order_id);
    if (error) return fail(dbErrorMessage(error));

    // Keep job priority/due date aligned with the order.
    await supabase
      .from("production_jobs")
      .update({ priority: v.priority, due_date: v.dispatch_by ? new Date(v.dispatch_by).toISOString() : null })
      .eq("order_id", v.order_id)
      .not("stage", "in", "(dispatched,completed)");

    const changes: string[] = [];
    if (before && before.priority !== v.priority) changes.push(`priority → ${v.priority}`);
    const newDeadline = v.dispatch_by ? new Date(v.dispatch_by).toISOString() : null;
    if (before && (before.dispatch_by ? new Date(before.dispatch_by).toISOString() : null) !== newDeadline) {
      changes.push("dispatch deadline changed");
    }
    await supabase.rpc("log_activity", {
      p_entity_type: "order",
      p_entity_id: v.order_id,
      p_order_id: v.order_id,
      p_action: "order.updated",
      p_message: changes.length ? `Order details updated (${changes.join(", ")})` : "Order details updated",
    });
    revalidateOrder(v.order_id);
    return ok(undefined, "Order updated");
  } catch (e) {
    return handle(e);
  }
}

export async function setOrderHoldAction(orderId: string, hold: boolean, reason?: string): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const id = uuid.parse(orderId);
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_order_hold", { p_order_id: id, p_hold: hold, p_reason: reason ?? undefined });
    if (error) return fail(dbErrorMessage(error));
    revalidateOrder(id);
    return ok(undefined, hold ? "Order put on hold" : "Order released");
  } catch (e) {
    return handle(e);
  }
}

export async function cancelOrderAction(orderId: string, reason: string): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const id = uuid.parse(orderId);
    const supabase = await createClient();
    const { data: order } = await supabase.from("orders").select("status, source").eq("id", id).single();
    if (!order) return fail("Order not found");
    if (["dispatched", "completed", "cancelled"].includes(order.status)) {
      return fail("This order can no longer be cancelled.");
    }
    // Same safe path as marketplace cancellations: unstarted work is closed,
    // anything printing/printed/packed is kept and flagged for a decision.
    const { data, error } = await supabase.rpc("apply_order_cancellation", {
      p_order_id: id,
      p_source: "printflow",
      p_reason: `${reason.trim()}${order.source !== "manual" ? " (remember to cancel/refund on the marketplace too)" : ""}`,
    });
    if (error) return fail(dbErrorMessage(error));
    const r = data as { jobs_needing_decision?: number };
    revalidateOrder(id);
    return ok(
      undefined,
      r.jobs_needing_decision ? "Order cancelled — work already done needs a decision (see Marketplace & order changes)" : "Order cancelled",
    );
  } catch (e) {
    return handle(e);
  }
}

export async function reopenOrderAction(orderId: string): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const id = uuid.parse(orderId);
    const supabase = await createClient();
    const { error } = await supabase.rpc("reopen_cancelled_order", { p_order_id: id });
    if (error) return fail(dbErrorMessage(error));
    revalidateOrder(id);
    return ok(undefined, "Order reopened");
  } catch (e) {
    return handle(e);
  }
}

const resolveSchema = z.object({
  review_id: uuid,
  resolution: z.enum(["acknowledged", "jobs_closed", "reprint_requested", "returned_to_production"]),
  note: z.string().trim().max(1000).optional().nullable(),
});

/** A person decides what happens after a marketplace/order change. */
export async function resolveOrderReviewAction(input: z.input<typeof resolveSchema>): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const v = resolveSchema.parse(input);
    const supabase = await createClient();
    const { data: review } = await supabase.from("order_reviews").select("order_id").eq("id", v.review_id).single();
    const { error } = await supabase.rpc("resolve_order_review", {
      p_review_id: v.review_id,
      p_resolution: v.resolution,
      p_note: v.note ?? undefined,
    });
    if (error) return fail(dbErrorMessage(error));
    revalidateOrder(review?.order_id);
    return ok(undefined, "Change resolved");
  } catch (e) {
    return handle(e);
  }
}

export async function completeOrderAction(orderId: string): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const id = uuid.parse(orderId);
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_order_completed", { p_order_id: id });
    if (error) return fail(dbErrorMessage(error));
    revalidateOrder(id);
    return ok(undefined, "Order completed");
  } catch (e) {
    return handle(e);
  }
}

export async function updateOrderItemAction(input: z.input<typeof orderItemMappingSchema>): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const v = orderItemMappingSchema.parse(input);
    const supabase = await createClient();
    const { data: item, error: itemErr } = await supabase
      .from("order_items")
      .update({ product_id: v.product_id, internal_notes: v.internal_notes })
      .eq("id", v.item_id)
      .select("id, order_id, quantity, title")
      .single();
    if (itemErr) return fail(dbErrorMessage(itemErr));

    // Fill production defaults on a job that hasn't started yet.
    if (v.product_id) {
      const { data: product } = await supabase
        .from("products")
        .select("name, estimated_print_minutes, material, default_colour, estimated_filament_g, production_instructions, default_printer_id")
        .eq("id", v.product_id)
        .single();
      if (product) {
        await supabase
          .from("production_jobs")
          .update({
            product_id: v.product_id,
            estimated_print_minutes: product.estimated_print_minutes != null ? product.estimated_print_minutes * item.quantity : null,
            material: product.material,
            colour: product.default_colour,
            estimated_filament_g: product.estimated_filament_g != null ? Number(product.estimated_filament_g) * item.quantity : null,
            print_requirements: product.production_instructions,
            printer_id: product.default_printer_id,
          })
          .eq("order_item_id", v.item_id)
          .in("stage", ["new_order", "awaiting_preparation", "ready_to_print"]);
        await supabase.rpc("log_activity", {
          p_entity_type: "order",
          p_entity_id: item.order_id,
          p_order_id: item.order_id,
          p_action: "item.mapped",
          p_message: `“${item.title}” linked to product ${product.name}`,
        });
      }
    }
    revalidateOrder(item.order_id);
    return ok(undefined, "Item updated");
  } catch (e) {
    return handle(e);
  }
}
