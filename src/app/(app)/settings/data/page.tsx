import type { Metadata } from "next";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SampleBadge } from "@/components/ui/badge";
import { DescriptionList } from "@/components/ui/misc";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SampleDataControls } from "@/components/settings/sample-data-controls";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Data · Settings" };

export default async function DataSettingsPage() {
  await requireUser("admin");
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [orders, sampleOrders, products, sampleProducts, customers, filament] = await Promise.all([
    supabase.from("orders").select("id", head),
    supabase.from("orders").select("id", head).eq("is_sample", true),
    supabase.from("products").select("id", head),
    supabase.from("products").select("id", head).eq("is_sample", true),
    supabase.from("customers").select("id", head),
    supabase.from("filament_stock").select("id", head),
  ]);
  const hasSample = (sampleOrders.count ?? 0) + (sampleProducts.count ?? 0) > 0;

  return (
    <>
      <PageHeader title="Settings" description="Business configuration, marketplace connections and team access." />
      <SettingsNav active="data" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<FlaskConical />} title="Development sample data" description="Explore PrintFlow without touching real business records." />
          <CardContent className="space-y-4 text-sm text-ink-2">
            <p>
              Sample data creates fictitious orders across Etsy, Shopify and manual channels, plus products, customers
              (using <code className="rounded bg-subtle px-1 text-xs">example.com</code> emails) and filament spools. Every record is flagged and shown with a{" "}
              <SampleBadge className="mx-0.5 align-middle" /> badge. Sample marketplace IDs start with “SAMPLE-” and are never sent to Etsy or Shopify.
            </p>
            <p className="text-muted">Analytics include sample data while it is loaded and say so clearly. Remove it before you start trading for real.</p>
            <SampleDataControls hasSample={hasSample} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader icon={<ShieldCheck />} title="Records" description="Counts across the database (visible to your role)." />
          <CardContent>
            <DescriptionList
              items={[
                { label: "Orders", value: `${formatNumber(orders.count)} (${formatNumber(sampleOrders.count)} sample)` },
                { label: "Products", value: `${formatNumber(products.count)} (${formatNumber(sampleProducts.count)} sample)` },
                { label: "Customers", value: formatNumber(customers.count) },
                { label: "Filament spools", value: formatNumber(filament.count) },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
