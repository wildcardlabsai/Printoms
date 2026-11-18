import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv, hasServiceRole } from "@/lib/server-env";
import { runDueSyncs } from "@/lib/integrations/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(request: NextRequest) {
  const secret = serverEnv.cronSecret;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Scheduled marketplace sync. Called every 10 minutes by Vercel Cron (see
 * vercel.json) or any external scheduler with `Authorization: Bearer $CRON_SECRET`.
 * Each integration decides whether it is due based on its own interval.
 */
export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not configured" }, { status: 503 });
  }
  const results = await runDueSyncs();
  return NextResponse.json({ ok: true, ran: results.length, results });
}
