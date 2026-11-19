import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { AuthorisationError, authoriseAction } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkConfig } from "@/lib/integrations/config";
import { getIntegration } from "@/lib/integrations/credentials";
import { validateResyncRequest } from "@/lib/integrations/resync";
import { runSync } from "@/lib/integrations/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Full resynchronisation — admins only, explicit confirmation required.
 * Re-applies marketplace data to every order in the window. Never creates
 * duplicates and never touches internal notes, priorities, deadlines, printer
 * assignments, production stages or print history.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "etsy" && provider !== "shopify" && provider !== "vinted") {
    return NextResponse.json({ ok: false, error: "Unknown marketplace" }, { status: 404 });
  }
  try {
    const user = await authoriseAction("admin");
    const body = await request.json().catch(() => null);
    const config = checkConfig(provider);
    if (!config.ready) {
      return NextResponse.json({ ok: false, error: `Missing configuration: ${config.missing.join(", ")}` }, { status: 400 });
    }
    const admin = createAdminClient();
    const integration = await getIntegration(admin, provider);
    if (integration.status !== "connected" && integration.status !== "error") {
      return NextResponse.json({ ok: false, error: "Connect the marketplace before resynchronising." }, { status: 400 });
    }

    const validation = validateResyncRequest(body, provider, integration);
    if (!validation.ok) return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    const since = validation.since;

    const result = await runSync(provider, "resync", user.id, admin, { mode: "resync", since });
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: result.status !== "failed" && result.status !== "skipped", ...result });
  } catch (e) {
    if (e instanceof AuthorisationError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    console.error("Resync failed", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Resync failed" }, { status: 500 });
  }
}
