import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ProductForm } from "@/components/products/product-form";
import { requireUser } from "@/lib/auth";
import { getActivePrinters } from "@/lib/data/production";
import { getProductCategories } from "@/lib/data/products";
import { getBusinessSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireUser("staff");
  const [printers, categories, settings] = await Promise.all([getActivePrinters(), getProductCategories(), getBusinessSettings()]);
  return (
    <>
      <Link href="/products" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Products
      </Link>
      <PageHeader title="New product" description="You can add an image and link marketplace listings after creating the product." />
      <div className="max-w-5xl">
        <ProductForm printers={printers} categories={categories} currency={settings?.currency ?? "GBP"} />
      </div>
    </>
  );
}
