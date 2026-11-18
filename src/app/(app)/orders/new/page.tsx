import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ManualOrderForm } from "@/components/orders/manual-order-form";
import { requireUser } from "@/lib/auth";
import { getProductOptions } from "@/lib/data/orders";
import { getBusinessSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "New manual order" };

export default async function NewOrderPage() {
  await requireUser("staff");
  const [products, settings] = await Promise.all([getProductOptions(), getBusinessSettings()]);
  return (
    <>
      <Link href="/orders" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All orders
      </Link>
      <PageHeader
        title="New manual order"
        description="For direct sales, craft fairs, repeat customers or replacements. Production jobs are created automatically."
      />
      <ManualOrderForm
        products={products}
        currency={settings?.currency ?? "GBP"}
        defaultDispatchDays={settings?.default_dispatch_days ?? 3}
      />
    </>
  );
}
