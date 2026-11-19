import { NextResponse, type NextRequest } from "next/server";
import { AuthorisationError, authoriseAction } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { checkConfig } from "@/lib/integrations/config";
import { getIntegration } from "@/lib/integrations/credentials";
import { VintedClient, VINTED_HOSTS } from "@/lib/integrations/vinted/client";

export const dynamic = "force-dynamic";

/**
 * Connect Vinted Pro: verify VINTED_ACCESS_TOKEN with a read-only, signed
 * request (GetOrders), then mark the integration connected. The token itself
 * stays in the server environment; nothing secret is stored in the database.
 */
export async function GET(request: NextRequest) {
  const back = new URL("/settings/integrations", request.url);
  let userId: string;
  try {
    userId = (await authoriseAction("admin")).id;
  } catch (e) {
    back.searchParams.set("error", e instanceof AuthorisationError ? e.message : "Not allowed");
    return NextResponse.redirect(back);
  }
  const config = checkConfig("vinted");
  if (!config.ready) {
    back.searchParams.set("error", `Vinted is not configured. Missing: ${config.missing.join(", ")}`);
    return NextResponse.redirect(back);
  }
  try {
    const client = new VintedClient(serverEnv.vinted.accessToken, VINTED_HOSTS[serverEnv.vinted.environment]);
    await client.json("/api/v1/orders");
    const admin = createAdminClient();
    const integration = await getIntegration(admin, "vinted");
    await admin
      .from("integrations")
      .update({
        status: "connected",
        display_name: serverEnv.vinted.environment === "sandbox" ? "Vinted Pro (dev mode)" : "Vinted Pro",
        connected_at: new Date().toISOString(),
        connected_by: userId,
        last_error: null,
        consecutive_failures: 0,
        next_sync_at: new Date().toISOString(),
      })
      .eq("id", integration.id);
    back.searchParams.set("connected", "vinted");
  } catch (e) {
    back.searchParams.set("error", e instanceof Error ? e.message : "Vinted connection failed");
  }
  return NextResponse.redirect(back);
}
