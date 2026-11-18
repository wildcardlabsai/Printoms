import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";

/**
 * Service-role client. Bypasses RLS — use ONLY in trusted server code
 * (marketplace sync, cron, credential storage). Never import from client code.
 */
export function createAdminClient() {
  if (!publicEnv.supabaseUrl || !serverEnv.supabaseSecretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is not configured. It is required for marketplace sync.",
    );
  }
  return createClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminSupabase = ReturnType<typeof createAdminClient>;
