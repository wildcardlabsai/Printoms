import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient, type AdminSupabase } from "@/lib/supabase/admin";
import { resolveSiteUrl, serverEnv } from "@/lib/server-env";
import { ORDER_SOURCE } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { escapeHtml, sendEmail } from "./email";

type AlertOrder = {
  id: string;
  order_number: string;
  source: "etsy" | "shopify" | "vinted" | "manual";
  customer_name: string;
  total: number;
  currency: string;
  dispatch_by: string | null;
  order_items: { title: string; variant_title: string | null; personalisation: string | null; quantity: number; marketplace_status: string }[];
};

export type AlertRun = { status: "sent" | "nothing" | "disabled" | "failed"; orders: number; error?: string };

/**
 * Email the alert address about newly imported orders. Each order is claimed
 * once in the database (claim_new_order_alerts), so alerts are never repeated;
 * if the email can't be sent the claim is released and the next sync retries.
 * Never throws — an alert problem must not affect syncing.
 */
export async function sendNewOrderAlerts(admin: AdminSupabase = createAdminClient()): Promise<AlertRun> {
  try {
    if (!serverEnv.email.resendApiKey) return { status: "disabled", orders: 0 };
    const { data: settings } = await admin
      .from("business_settings")
      .select("business_name, timezone, new_order_alerts_enabled, new_order_alert_email")
      .maybeSingle();
    if (!settings?.new_order_alerts_enabled || !settings.new_order_alert_email) return { status: "disabled", orders: 0 };

    const { data: claimed, error } = await admin.rpc("claim_new_order_alerts", { p_limit: 50 });
    if (error) return { status: "failed", orders: 0, error: error.message };
    const ids = ((claimed ?? []) as unknown as string[]).filter(Boolean);
    if (!ids.length) return { status: "nothing", orders: 0 };

    const { data: rows } = await admin
      .from("orders")
      .select("id, order_number, source, customer_name, total, currency, dispatch_by, order_items(title, variant_title, personalisation, quantity, marketplace_status)")
      .in("id", ids)
      .order("order_date");
    const orders = (rows ?? []) as unknown as AlertOrder[];
    const email = buildNewOrderEmail(orders, { businessName: settings.business_name, timezone: settings.timezone, siteUrl: resolveSiteUrl() });
    const result = await sendEmail({
      to: settings.new_order_alert_email,
      ...email,
      idempotencyKey: `printflow-new-orders-${createHash("sha256").update([...ids].sort().join(",")).digest("hex").slice(0, 40)}`,
    });
    if (!result.ok) {
      await admin.rpc("release_new_order_alerts", { p_order_ids: ids });
      return { status: "failed", orders: ids.length, error: result.error };
    }
    return { status: "sent", orders: ids.length };
  } catch (e) {
    return { status: "failed", orders: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export function buildNewOrderEmail(orders: AlertOrder[], ctx: { businessName: string; timezone: string; siteUrl: string }) {
  const money = (o: AlertOrder) => formatCurrency(o.total, o.currency);
  const date = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("en-GB", { timeZone: ctx.timezone, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)) : null;
  const bySource = new Map<string, number>();
  for (const o of orders) bySource.set(ORDER_SOURCE[o.source].label, (bySource.get(ORDER_SOURCE[o.source].label) ?? 0) + 1);
  const first = orders[0]!;
  const subject =
    orders.length === 1
      ? `New ${ORDER_SOURCE[first.source].label} order ${first.order_number} · ${money(first)}`
      : `${orders.length} new orders (${[...bySource].map(([k, v]) => `${k} ${v}`).join(", ")})`;

  const items = (o: AlertOrder) => o.order_items.filter((i) => i.marketplace_status !== "removed");
  const text = [
    `${ctx.businessName}: ${subject}`,
    "",
    ...orders.flatMap((o) => [
      `${o.order_number} · ${ORDER_SOURCE[o.source].label} · ${o.customer_name} · ${money(o)}${o.dispatch_by ? ` · dispatch by ${date(o.dispatch_by)}` : ""}`,
      ...items(o).map((i) => `  ${i.quantity} × ${i.title}${i.variant_title ? ` (${i.variant_title})` : ""}${i.personalisation ? `\n     Personalisation: ${i.personalisation.replace(/\n/g, " / ")}` : ""}`),
      `  ${ctx.siteUrl}/orders/${o.id}`,
      "",
    ]),
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 4px;font-size:13px;color:#71717a">${escapeHtml(ctx.businessName)}</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(subject)}</h1>
${orders
  .map(
    (o) => `<div style="background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:16px;margin-bottom:12px">
<p style="margin:0;font-size:15px;font-weight:600">${escapeHtml(o.order_number)} · ${escapeHtml(ORDER_SOURCE[o.source].label)} · ${escapeHtml(money(o))}</p>
<p style="margin:2px 0 10px;font-size:13px;color:#52525b">${escapeHtml(o.customer_name)}${o.dispatch_by ? ` · dispatch by <strong>${escapeHtml(date(o.dispatch_by) ?? "")}</strong>` : ""}</p>
${items(o)
  .map(
    (i) => `<p style="margin:0 0 6px;font-size:14px"><strong>${i.quantity} ×</strong> ${escapeHtml(i.title)}${i.variant_title ? ` <span style="color:#71717a">(${escapeHtml(i.variant_title)})</span>` : ""}${
      i.personalisation
        ? `<br><span style="display:inline-block;margin-top:3px;padding:3px 8px;background:#f4f4f5;border-radius:6px;font-size:13px;white-space:pre-wrap">${escapeHtml(i.personalisation)}</span>`
        : ""
    }</p>`,
  )
  .join("")}
<a href="${escapeHtml(`${ctx.siteUrl}/orders/${o.id}`)}" style="display:inline-block;margin-top:6px;font-size:13px;color:#15803d;font-weight:600">Open in PrintFlow →</a>
</div>`,
  )
  .join("")}
<p style="font-size:12px;color:#a1a1aa">You get this because new-order alerts are on in PrintFlow → Settings.</p>
</div></body></html>`;
  return { subject, html, text };
}
