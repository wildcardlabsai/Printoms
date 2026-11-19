import { NextResponse, type NextRequest } from "next/server";
import { hasServiceRole } from "@/lib/server-env";
import { isAuthorisedCron } from "@/lib/cron-auth";
import { runScheduledSync } from "@/lib/integrations/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled sync for ONE marketplace. Call every 10 minutes per marketplace
 * from a server-side scheduler with `Authorization: Bearer $CRON_SECRET`.
 * Each marketplace runs in its own invocation with its own lock, cursor,
 * time budget and log. Runs only when that marketplace is due.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  if (!isAuthorisedCron(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { provider } = await params;
  if (provider !== "etsy" && provider !== "shopify" && provider !== "vinted") return NextResponse.json({ error: "Unknown marketplace" }, { status: 404 });
  if (!hasServiceRole()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not configured" }, { status: 503 });
  const result = await runScheduledSync(provider);
  // 200 for success/skipped/partial so schedulers don't retry and overlap; 500 only on failure.
  return NextResponse.json({ ok: result.status !== "failed", result }, { status: result.status === "failed" ? 500 : 200 });
}
