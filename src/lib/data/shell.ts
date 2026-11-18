import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import { hasRole } from "@/lib/auth";
import type { AppNotification } from "@/components/layout/notifications-menu";
import type { NavCounts } from "@/components/layout/nav-config";

/** Sidebar badge counts + notification feed, all derived from live data. */
export async function getShellData(user: CurrentUser): Promise<{
  counts: NavCounts;
  notifications: AppNotification[];
  businessName: string;
}> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const soonIso = new Date(Date.now() + 24 * 3600_000).toISOString();
  const openStatuses = ["dispatched", "completed", "cancelled"] as const;

  const [settings, newOrders, toPack, overdue, dueSoon, lowStock, integrations, pendingUsers, overrunning] = await Promise.all([
    supabase.from("business_settings").select("business_name").maybeSingle(),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["ready_to_pack", "packed"]),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .lt("dispatch_by", nowIso)
      .not("status", "in", `(${openStatuses.join(",")})`),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("dispatch_by", nowIso)
      .lt("dispatch_by", soonIso)
      .not("status", "in", `(${openStatuses.join(",")})`),
    supabase.from("filament_stock_overview").select("id, brand, material, colour").eq("is_low_stock", true).eq("is_archived", false).limit(5),
    supabase.from("integrations").select("provider, status, last_error"),
    hasRole(user, "admin")
      ? supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", false)
      : Promise.resolve({ count: 0 }),
    supabase
      .from("printers")
      .select("id, name")
      .eq("status", "printing")
      .lt("estimated_completion_at", nowIso),
  ]);

  const notifications: AppNotification[] = [];

  if (overdue.count) {
    notifications.push({
      id: "overdue",
      tone: "red",
      title: `${overdue.count} overdue order${overdue.count === 1 ? "" : "s"}`,
      description: "Past their dispatch deadline and not yet shipped.",
      href: "/orders?view=overdue",
    });
  }
  if (dueSoon.count) {
    notifications.push({
      id: "due-soon",
      tone: "amber",
      title: `${dueSoon.count} order${dueSoon.count === 1 ? "" : "s"} due within 24 hours`,
      href: "/orders?view=due_soon",
    });
  }
  for (const p of overrunning.data ?? []) {
    notifications.push({
      id: `overrun-${p.id}`,
      tone: "amber",
      title: `${p.name} has passed its estimated finish time`,
      description: "Check the printer and record the result.",
      href: `/printers/${p.id}`,
    });
  }
  for (const f of lowStock.data ?? []) {
    notifications.push({
      id: `low-${f.id}`,
      tone: "amber",
      title: `Low filament: ${f.brand} ${f.material} ${f.colour}`,
      href: "/filament?view=low",
    });
  }
  for (const i of integrations.data ?? []) {
    if (i.status === "error") {
      notifications.push({
        id: `int-${i.provider}`,
        tone: "red",
        title: `${i.provider === "etsy" ? "Etsy" : "Shopify"} sync problem`,
        description: i.last_error ?? "The last synchronisation failed.",
        href: "/settings/integrations",
      });
    }
  }
  if (pendingUsers.count) {
    notifications.push({
      id: "pending-users",
      tone: "blue",
      title: `${pendingUsers.count} account${pendingUsers.count === 1 ? "" : "s"} awaiting approval`,
      href: "/settings/team",
    });
  }

  return {
    counts: {
      orders: newOrders.count ?? 0,
      fulfilment: toPack.count ?? 0,
    },
    notifications,
    businessName: settings.data?.business_name ?? "PrintFlow",
  };
}
