import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { serverEnv } from "@/lib/server-env";

/** Constant-time check of `Authorization: Bearer $CRON_SECRET`. No secret configured = always refused. */
export function isAuthorisedCron(request: NextRequest) {
  const secret = serverEnv.cronSecret;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
