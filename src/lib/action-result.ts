export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export function ok<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string[] | undefined>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Convert a Supabase/Postgres error into a user-safe message. */
export function dbErrorMessage(error: { message?: string; code?: string; details?: string } | null | undefined) {
  if (!error) return "Something went wrong";
  if (error.code === "23505") return "A record with these details already exists.";
  if (error.code === "42501") return "You do not have permission to perform this action.";
  if (error.code === "23503") return "This record is linked to other data and cannot be changed that way.";
  if (error.code === "23514") return "Some values are outside the allowed range.";
  if (error.code === "P0001" && error.message) return error.message; // raised by our SQL functions
  return error.message || "Something went wrong";
}
