import { NextResponse, type NextRequest } from "next/server";
import { hasServiceRole } from "@/lib/server-env";
import { isAuthorisedCron } from "@/lib/cron-auth";
import { runDueSyncs } from "@/lib/integrations/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Combined scheduled sync (kept for compatibility). Runs each due marketplace
 * in parallel and isolated. Prefer scheduling the per-marketplace endpoints
 * /api/cron/sync/etsy and /api/cron/sync/shopify (see docs/scheduling.md).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorisedCron(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!hasServiceRole()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not configured" }, { status: 503 });
  const results = await runDueSyncs();
  return NextResponse.json({ ok: results.every((r) => r.status !== "failed"), ran: results.filter((r) => r.status !== "skipped").length, results });
}
