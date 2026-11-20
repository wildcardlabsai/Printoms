import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { VintedSaleForm } from "@/components/orders/vinted-sale-form";
import { requireUser } from "@/lib/auth";
import { getProductOptions } from "@/lib/data/orders";

export const metadata: Metadata = { title: "Add Vinted sale" };

export default async function AddVintedSalePage() {
  await requireUser("staff");
  const products = await getProductOptions();
  return (
    <>
      <Link href="/orders" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All orders
      </Link>
      <PageHeader
        title="Add Vinted sale"
        description="Copy a sale from the Vinted app. It counts as a Vinted order everywhere — production, tickets, packing and sales figures. Use Vinted’s own shipping label."
      />
      <VintedSaleForm products={products} />
    </>
  );
}
