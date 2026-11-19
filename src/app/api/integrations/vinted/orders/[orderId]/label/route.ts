import { NextResponse, type NextRequest } from "next/server";
import { AuthorisationError, authoriseAction } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { uuid } from "@/lib/validation/common";
import { VintedAdapter } from "@/lib/integrations/vinted/adapter";
import { VINTED_HOSTS } from "@/lib/integrations/vinted/client";

export const dynamic = "force-dynamic";

const text = (message: string, status: number) =>
  new NextResponse(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** Stream Vinted's shipping label PDF for a PrintFlow order (read-only). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    await authoriseAction("staff");
  } catch (e) {
    return text(e instanceof AuthorisationError ? e.message : "Not allowed", 403);
  }
  const parsed = uuid.safeParse((await params).orderId);
  if (!parsed.success) return text("Unknown order", 404);
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("source, external_order_id, is_sample").eq("id", parsed.data).maybeSingle();
  if (!order || order.source !== "vinted" || !order.external_order_id) return text("This is not a Vinted order.", 404);
  if (order.is_sample) return text("Sample orders have no Vinted label.", 404);
  if (!serverEnv.vinted.accessToken) return text("VINTED_ACCESS_TOKEN is not set.", 503);
  try {
    const adapter = new VintedAdapter(createAdminClient(), serverEnv.vinted.accessToken, VINTED_HOSTS[serverEnv.vinted.environment]);
    const label = await adapter.shipmentLabel(order.external_order_id);
    if (!label.ok) return text(label.reason, 404);
    return new NextResponse(label.pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="vinted-label-${order.external_order_id.replace(/[^0-9A-Za-z-]/g, "")}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    return text(e instanceof Error ? e.message : "Vinted label could not be downloaded.", 502);
  }
}
