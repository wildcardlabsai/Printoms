import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calculator, Link2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, SampleBadge } from "@/components/ui/badge";
import { DescriptionList } from "@/components/ui/misc";
import { OrderStatusBadge } from "@/components/ui/status-badges";
import { ProductForm } from "@/components/products/product-form";
import { ProductImageUpload } from "@/components/products/product-image-upload";
import { ListingsManager } from "@/components/products/listings-manager";
import { NotesPanel } from "@/components/orders/notes-panel";
import { DeleteProductButton } from "./delete-product-button";
import { getMaterialCostPerKg, getProduct, getProductCategories, getProductSales, signedImageUrls } from "@/lib/data/products";
import { getActivePrinters } from "@/lib/data/production";
import { getNotes } from "@/lib/data/orders";
import { getBusinessSettings } from "@/lib/data/settings";
import { hasRole, requireUser } from "@/lib/auth";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const product = await getProduct(id);
  if (!product) notFound();
  const canEdit = hasRole(user, "staff");
  const [printers, categories, settings, sales, cost, notes, images] = await Promise.all([
    getActivePrinters(),
    getProductCategories(),
    getBusinessSettings(),
    getProductSales(id),
    getMaterialCostPerKg(product.material),
    getNotes("product", id),
    signedImageUrls([product.image_path]),
  ]);
  const currency = settings?.currency ?? "GBP";

  const estMaterial =
    product.material_cost != null
      ? Number(product.material_cost)
      : product.estimated_filament_g != null
        ? (Number(product.estimated_filament_g) * cost.perKg) / 1000
        : null;
  const unitCost =
    (estMaterial ?? 0) + Number(product.packaging_cost ?? 0) + Number(product.labour_cost ?? 0) + Number(product.other_cost ?? 0);
  const margin = product.base_price != null ? Number(product.base_price) - unitCost : null;

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/products" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Products
        </Link>
        {hasRole(user, "admin") ? <DeleteProductButton id={product.id} hasOrders={sales.units > 0} /> : null}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{product.name}</h1>
        <span className="font-mono text-sm text-muted">{product.sku}</span>
        {!product.is_active ? <Badge>Archived</Badge> : null}
        {product.is_sample ? <SampleBadge /> : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <ProductForm
            productId={product.id}
            canEdit={canEdit}
            printers={printers}
            categories={categories}
            currency={currency}
            initial={product}
          />
          <Card>
            <CardHeader icon={<Link2 />} title="Marketplace listings" description="Imported order lines with these IDs are linked to this product automatically." />
            <CardContent>
              <ListingsManager productId={product.id} listings={product.product_listings} canEdit={canEdit} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardContent className="pt-5">
              <ProductImageUpload productId={product.id} imageUrl={product.image_path ? images[product.image_path] ?? null : null} canEdit={canEdit} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader icon={<Calculator />} title="Estimated unit cost" description="An estimate for pricing decisions — not an accounting figure." />
            <CardContent>
              <DescriptionList
                items={[
                  {
                    label: "Material",
                    value: estMaterial != null ? (
                      <span>
                        {formatCurrency(estMaterial, currency)}
                        <span className="block text-[11px] font-normal text-muted">
                          {product.material_cost != null ? "manual override" : `${product.estimated_filament_g} g @ ${formatCurrency(cost.perKg, currency)}/kg (${cost.basis})`}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted">Add filament weight</span>
                    ),
                  },
                  { label: "Packaging", value: formatCurrency(product.packaging_cost ?? 0, currency) },
                  { label: "Labour", value: formatCurrency(product.labour_cost ?? 0, currency) },
                  { label: "Other", value: formatCurrency(product.other_cost ?? 0, currency) },
                  { label: "Est. unit cost", value: <span className="text-base">{formatCurrency(unitCost, currency)}</span> },
                  {
                    label: "Est. margin at list price",
                    value:
                      margin != null ? (
                        <span className={margin < 0 ? "text-red-600" : "text-brand-700"}>
                          {formatCurrency(margin, currency)}
                          {product.base_price ? ` (${((margin / Number(product.base_price)) * 100).toFixed(0)}%)` : ""}
                        </span>
                      ) : (
                        "—"
                      ),
                  },
                ]}
              />
              <p className="mt-3 text-xs text-muted">Excludes marketplace fees and postage, which are estimated per order in Analytics.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader icon={<TrendingUp />} title="Sales" description="Non-cancelled orders" />
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Units", formatNumber(sales.units)],
                  ["Orders", formatNumber(sales.orders)],
                  ["Revenue", formatCurrency(sales.revenue, currency, { compact: sales.revenue >= 10000 })],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-subtle py-2.5 ring-1 ring-line">
                    <p className="text-base font-semibold text-ink tabular">{v}</p>
                    <p className="text-[11px] text-muted">{l}</p>
                  </div>
                ))}
              </div>
              {sales.recent.length ? (
                <ul className="divide-y divide-line text-sm">
                  {sales.recent.map((r, i) => (
                    <li key={i} className="flex items-center gap-2 py-2">
                      <Link href={`/orders/${r.order?.id}`} className="font-medium text-ink hover:underline">{r.order?.order_number}</Link>
                      <span className="truncate text-xs text-muted">{formatDate(r.order?.order_date)} · ×{r.quantity}</span>
                      <span className="ml-auto">{r.order ? <OrderStatusBadge status={r.order.status} /> : null}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Notes" />
            <CardContent>
              <NotesPanel entityType="product" entityId={product.id} notes={notes} currentUserId={user.id} canWrite={canEdit} revalidate={`/products/${product.id}`} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
