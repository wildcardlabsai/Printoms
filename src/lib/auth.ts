import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_RANK, type UserRole } from "@/lib/constants";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
};

/**
 * Data Access Layer: verifies the session with Supabase Auth (not just the
 * cookie) and loads the profile. Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return { id: user.id, email: user.email ?? "", fullName: null, role: "viewer", isActive: false };
  }
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    isActive: profile.is_active,
  };
});

export function hasRole(user: CurrentUser | null, min: UserRole) {
  return Boolean(user && user.isActive && ROLE_RANK[user.role] >= ROLE_RANK[min]);
}

/** For pages: redirect to login / pending approval as needed. */
export async function requireUser(min: UserRole = "viewer"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive) redirect("/auth/pending");
  if (!hasRole(user, min)) redirect("/overview?denied=1");
  return user;
}

export class AuthorisationError extends Error {}

/** For server actions / route handlers: throw instead of redirecting. */
export async function authoriseAction(min: UserRole = "staff"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorisationError("Your session has expired. Please sign in again.");
  if (!user.isActive) throw new AuthorisationError("Your account is awaiting approval.");
  if (!hasRole(user, min)) throw new AuthorisationError("You do not have permission to perform this action.");
  return user;
}
