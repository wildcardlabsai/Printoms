import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { AuthorisationError, authoriseAction } from "@/lib/auth";
import { checkConfig } from "@/lib/integrations/config";
import { runSync } from "@/lib/integrations/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Manual "Sync now" — admins only. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "etsy" && provider !== "shopify" && provider !== "vinted") {
    return NextResponse.json({ ok: false, error: "Unknown marketplace" }, { status: 404 });
  }
  try {
    const user = await authoriseAction("admin");
    const config = checkConfig(provider);
    if (!config.ready) {
      return NextResponse.json({ ok: false, error: `Missing configuration: ${config.missing.join(", ")}` }, { status: 400 });
    }
    const result = await runSync(provider, "manual", user.id);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: result.status !== "failed", ...result });
  } catch (e) {
    if (e instanceof AuthorisationError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    console.error("Manual sync failed", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}
