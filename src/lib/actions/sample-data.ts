"use server";

import { revalidatePath } from "next/cache";
import { authoriseAction, AuthorisationError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { loadSampleData } from "@/lib/sample-data";

export async function loadSampleDataAction(): Promise<ActionResult> {
  try {
    const user = await authoriseAction("admin");
    const supabase = await createClient();
    const result = await loadSampleData(supabase, user.id);
    revalidatePath("/", "layout");
    return ok(undefined, `Loaded ${result.orders} sample orders, ${result.products} products and ${result.filament} spools`);
  } catch (e) {
    if (e instanceof AuthorisationError) return fail(e.message);
    return fail(e instanceof Error ? e.message : "Could not load sample data");
  }
}

export async function purgeSampleDataAction(): Promise<ActionResult> {
  try {
    await authoriseAction("admin");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("purge_sample_data");
    if (error) return fail(dbErrorMessage(error));
    const r = data as { orders: number; customers: number; products: number; filament: number };
    revalidatePath("/", "layout");
    return ok(undefined, `Removed ${r.orders} orders, ${r.customers} customers, ${r.products} products and ${r.filament} spools`);
  } catch (e) {
    if (e instanceof AuthorisationError) return fail(e.message);
    throw e;
  }
}
