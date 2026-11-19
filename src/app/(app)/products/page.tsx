import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Box, Boxes, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SampleBadge, Badge } from "@/components/ui/badge";
import { TabNav } from "@/components/ui/misc";
import { SourceBadge } from "@/components/ui/status-badges";
import { ProductSearch } from "./product-search";
import { ImportProductsDialog } from "@/components/products/import-products-dialog";
import { createClient } from "@/lib/supabase/server";
import { getProductCategories, listProducts, signedImageUrls } from "@/lib/data/products";
import { getBusinessSettings } from "@/lib/data/settings";
import { hasRole, requireUser } from "@/lib/auth";
import { formatCurrency, formatGrams, formatMinutes } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; status?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = sp.status === "archived" || sp.status === "all" ? sp.status : "active";
  const [products, categories, settings] = await Promise.all([
    listProducts({ q: sp.q, category: sp.category, status }),
    getProductCategories(),
    getBusinessSettings(),
  ]);
  const images = await signedImageUrls(products.map((p) => p.image_path));
  const isAdmin = hasRole(user, "admin");
  const importable = isAdmin
    ? ((await (await createClient()).from("integrations").select("provider, status")).data ?? [])
        .filter((i) => (i.provider === "etsy" || i.provider === "shopify") && (i.status === "connected" || i.status === "error"))
        .map((i) => i.provider as "etsy" | "shopify")
    : [];
  const currency = settings?.currency ?? "GBP";
  const qs = (s: string) => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (sp.category) p.set("category", sp.category);
    if (s !== "active") p.set("status", s);
    return `/products${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalogue — print settings, costs and the marketplace listings each product sells through."
        actions={
          hasRole(user, "staff") ? (
            <div className="flex flex-wrap gap-2">
              {isAdmin ? <ImportProductsDialog providers={importable} /> : null}
              <ButtonLink href="/products/new"><Plus /> New product</ButtonLink>
            </div>
          ) : null
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <TabNav
          active={status}
          tabs={[
            { id: "active", label: "Active", href: qs("active") },
            { id: "archived", label: "Archived", href: qs("archived") },
            { id: "all", label: "All", href: qs("all") },
          ]}
        />
        <ProductSearch categories={categories} />
      </div>
      {products.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Boxes />}
            title={sp.q || sp.category ? "No products match" : "No products yet"}
            description="Add products with their print time, filament weight and costs. Link Etsy and Shopify listings so imported orders map automatically."
            action={hasRole(user, "staff") ? <ButtonLink href="/products/new"><Plus /> Add your first product</ButtonLink> : null}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {products.map((p) => {
            const sources = Array.from(new Set(p.product_listings.map((l) => l.source)));
            return (
              <Link key={p.id} href={`/products/${p.id}`} className="group overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card transition hover:border-line-strong hover:shadow-raised">
                <div className="relative aspect-[4/3] bg-gradient-to-br from-zinc-50 to-zinc-100">
                  {p.image_path && images[p.image_path] ? (
                    <Image src={images[p.image_path]!} alt={p.name} fill sizes="(max-width: 640px) 100vw, 320px" className="object-cover transition duration-300 group-hover:scale-[1.02]" unoptimized />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-300"><Box className="size-12" strokeWidth={1} /></div>
                  )}
                  <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                    {!p.is_active ? <Badge tone="neutral">Archived</Badge> : null}
                    {p.is_sample ? <SampleBadge className="bg-white" /> : null}
                  </div>
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{p.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted">{p.sku}</p>
                    </div>
                    {p.base_price != null ? <p className="shrink-0 font-semibold tabular text-ink">{formatCurrency(p.base_price, currency)}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {p.category ? <span>{p.category}</span> : null}
                    {p.estimated_print_minutes ? <span>⏱ {formatMinutes(p.estimated_print_minutes)}</span> : null}
                    {p.estimated_filament_g ? <span>{formatGrams(p.estimated_filament_g)}</span> : null}
                    {p.material ? <span>{p.material}{p.default_colour ? ` · ${p.default_colour}` : ""}</span> : null}
                  </div>
                  <div className="flex items-center gap-2 border-t border-line pt-2 text-xs">
                    {sources.length ? sources.map((s) => <SourceBadge key={s} source={s} />) : <span className="text-amber-700">No listings linked</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
