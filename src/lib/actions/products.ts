"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authoriseAction, AuthorisationError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { listingSchema, productSchema, type ProductInput } from "@/lib/validation/products";
import { uuid } from "@/lib/validation/common";

function handle(e: unknown): ActionResult<never> {
  if (e instanceof AuthorisationError) return fail(e.message);
  if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Invalid input");
  throw e;
}

export async function saveProductAction(id: string | null, input: ProductInput): Promise<ActionResult<{ id: string }>> {
  try {
    await authoriseAction("staff");
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) return fail("Please check the highlighted fields", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    const supabase = await createClient();
    if (id) {
      const { error } = await supabase.from("products").update(parsed.data).eq("id", uuid.parse(id));
      if (error) return fail(error.code === "23505" ? "Another product already uses this SKU." : dbErrorMessage(error));
      revalidatePath("/products");
      revalidatePath(`/products/${id}`);
      return ok({ id }, "Product saved");
    }
    const { data, error } = await supabase.from("products").insert(parsed.data).select("id").single();
    if (error) return fail(error.code === "23505" ? "Another product already uses this SKU." : dbErrorMessage(error));
    revalidatePath("/products");
    return ok({ id: data.id }, "Product created");
  } catch (e) {
    return handle(e);
  }
}

export async function setProductImageAction(id: string, path: string | null): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const pid = uuid.parse(id);
    if (path !== null && !path.startsWith(`${pid}/`)) return fail("Invalid image path");
    const supabase = await createClient();
    const { data: before } = await supabase.from("products").select("image_path").eq("id", pid).single();
    const { error } = await supabase.from("products").update({ image_path: path }).eq("id", pid);
    if (error) return fail(dbErrorMessage(error));
    if (before?.image_path && before.image_path !== path) {
      await supabase.storage.from("product-images").remove([before.image_path]);
    }
    revalidatePath("/products");
    revalidatePath(`/products/${pid}`);
    return ok(undefined, path ? "Image updated" : "Image removed");
  } catch (e) {
    return handle(e);
  }
}

export async function addListingAction(input: z.input<typeof listingSchema>): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const parsed = listingSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid listing", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    const supabase = await createClient();
    const { error } = await supabase.from("product_listings").insert(parsed.data);
    if (error) return fail(error.code === "23505" ? "This marketplace listing is already linked to a product." : dbErrorMessage(error));
    // Link any existing unmapped order lines for this listing.
    let q = supabase
      .from("order_items")
      .update({ product_id: parsed.data.product_id }, { count: "exact" })
      .is("product_id", null)
      .eq("external_listing_id", parsed.data.external_listing_id);
    if (parsed.data.external_variant_id) q = q.eq("external_variant_id", parsed.data.external_variant_id);
    const { count } = await q;
    revalidatePath(`/products/${parsed.data.product_id}`);
    return ok(undefined, count ? `Listing linked · ${count} existing order line(s) matched` : "Listing linked");
  } catch (e) {
    return handle(e);
  }
}

export async function removeListingAction(listingId: string, productId: string): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const supabase = await createClient();
    const { error } = await supabase.from("product_listings").delete().eq("id", uuid.parse(listingId));
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/products/${productId}`);
    return ok(undefined, "Listing unlinked");
  } catch (e) {
    return handle(e);
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  try {
    await authoriseAction("admin");
    const pid = uuid.parse(id);
    const supabase = await createClient();
    const { count } = await supabase.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", pid);
    if (count) return fail("This product appears on orders. Archive it instead to keep order history intact.");
    const { data } = await supabase.from("products").select("image_path").eq("id", pid).single();
    const { error } = await supabase.from("products").delete().eq("id", pid);
    if (error) return fail(dbErrorMessage(error));
    if (data?.image_path) await supabase.storage.from("product-images").remove([data.image_path]);
    revalidatePath("/products");
    return ok(undefined, "Product deleted");
  } catch (e) {
    return handle(e);
  }
}
