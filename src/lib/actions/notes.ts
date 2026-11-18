"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authoriseAction, AuthorisationError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { noteSchema } from "@/lib/validation/orders";
import { uuid } from "@/lib/validation/common";

export async function addNoteAction(input: z.input<typeof noteSchema>, revalidate: string): Promise<ActionResult> {
  try {
    const user = await authoriseAction("staff");
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid note");
    const supabase = await createClient();
    const { error } = await supabase.from("internal_notes").insert({ ...parsed.data, author_id: user.id });
    if (error) return fail(dbErrorMessage(error));
    if (parsed.data.entity_type === "order") {
      await supabase.rpc("log_activity", {
        p_entity_type: "order",
        p_entity_id: parsed.data.entity_id,
        p_order_id: parsed.data.entity_id,
        p_action: "note.added",
        p_message: "Internal note added",
      });
    }
    revalidatePath(revalidate);
    return ok(undefined, "Note added");
  } catch (e) {
    if (e instanceof AuthorisationError) return fail(e.message);
    throw e;
  }
}

export async function deleteNoteAction(noteId: string, revalidate: string): Promise<ActionResult> {
  try {
    await authoriseAction("staff");
    const id = uuid.parse(noteId);
    const supabase = await createClient();
    const { error, count } = await supabase.from("internal_notes").delete({ count: "exact" }).eq("id", id);
    if (error) return fail(dbErrorMessage(error));
    if (!count) return fail("You can only delete your own notes.");
    revalidatePath(revalidate);
    return ok(undefined, "Note deleted");
  } catch (e) {
    if (e instanceof AuthorisationError) return fail(e.message);
    throw e;
  }
}
