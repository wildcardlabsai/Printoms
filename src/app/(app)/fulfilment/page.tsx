import type { Metadata } from "next";
import { PackageCheck, Truck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TabNav } from "@/components/ui/misc";
import { FulfilmentCard } from "@/components/fulfilment/fulfilment-card";
import { getConnectedMarketplaces, getFulfilmentCounts, getFulfilmentOrders, type FulfilmentTab } from "@/lib/data/fulfilment";
import { getBusinessSettings } from "@/lib/data/settings";
import { hasRole, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Packing & Dispatch" };

export default async function FulfilmentPage({ searchParams }: { searchParams: Promise<{ tab?: string; order?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab: FulfilmentTab = sp.tab === "packed" || sp.tab === "dispatched" ? sp.tab : "ready";
  const [orders, counts, settings, connected] = await Promise.all([
    getFulfilmentOrders(tab),
    getFulfilmentCounts(),
    getBusinessSettings(),
    getConnectedMarketplaces(),
  ]);
  // Deep link from an order page: open whichever tab holds it.
  const focus = sp.order && orders.some((o) => o.id === sp.order) ? sp.order : orders.length === 1 ? orders[0]!.id : undefined;

  return (
    <>
      <PageHeader
        title="Packing & Dispatch"
        description="Check, pack and ship completed orders. Tracking can be sent back to Etsy and Shopify."
      />
      <TabNav
        className="mb-5"
        active={tab}
        tabs={[
          { id: "ready", label: "Ready to pack", href: "/fulfilment", count: counts.ready },
          { id: "packed", label: "Packed · awaiting dispatch", href: "/fulfilment?tab=packed", count: counts.packed },
          { id: "dispatched", label: "Dispatched", href: "/fulfilment?tab=dispatched", count: counts.pushFailed || undefined },
        ]}
      />
      {orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={tab === "dispatched" ? <Truck /> : <PackageCheck />}
            title={tab === "ready" ? "Nothing ready to pack" : tab === "packed" ? "No packed orders waiting" : "No recent dispatches"}
            description={
              tab === "ready"
                ? "Orders appear here once every item has passed quality check and reached Ready to Pack."
                : tab === "packed"
                  ? "Packed orders wait here until they’re handed to the carrier."
                  : "Orders dispatched in the last 45 days appear here with their marketplace update status."
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <FulfilmentCard
              key={o.id}
              order={o}
              checklistTemplate={settings?.packing_checklist ?? []}
              connected={connected}
              canWrite={hasRole(user, "staff")}
              defaultOpen={o.id === focus}
            />
          ))}
        </div>
      )}
    </>
  );
}
