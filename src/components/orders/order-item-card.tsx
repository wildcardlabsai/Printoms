"use client";

import * as React from "react";
import Link from "next/link";
import { Link2, PenLine, Printer, Sparkles } from "lucide-react";
import { Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/ui/status-badges";
import { useToast } from "@/components/ui/toast";
import { updateOrderItemAction } from "@/lib/actions/orders";
import { formatCurrency, formatMinutes } from "@/lib/utils";
import type { OrderDetail, ProductOption } from "@/lib/data/orders";

type Item = OrderDetail["order_items"][number];

export function OrderItemCard({
  item,
  currency,
  products,
  canWrite,
}: {
  item: Item;
  currency: string;
  products: ProductOption[];
  canWrite: boolean;
}) {
  const toast = useToast();
  const [mapping, setMapping] = React.useState(false);
  const [productId, setProductId] = React.useState(item.product_id ?? "");
  const [pending, startTransition] = React.useTransition();
  const job = item.production_jobs;
  const variants = Array.isArray(item.variant_details) ? (item.variant_details as { name?: string; value?: string }[]) : [];

  const saveMapping = () =>
    startTransition(async () => {
      const res = await updateOrderItemAction({ item_id: item.id, product_id: productId || null, internal_notes: item.internal_notes });
      if (res.ok) {
        toast({ title: "Product linked" });
        setMapping(false);
      } else toast({ title: res.error, tone: "error" });
    });

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-50 to-zinc-100 text-sm font-semibold text-ink-2 ring-1 ring-line tabular">
          ×{item.quantity}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className="font-medium text-ink [overflow-wrap:anywhere]">{item.title}</p>
              <p className="mt-0.5 text-xs text-muted">
                {[item.sku ? `SKU ${item.sku}` : null, item.variant_title].filter(Boolean).join(" · ") || "No SKU"}
              </p>
            </div>
            <p className="text-sm font-medium tabular text-ink">{formatCurrency(item.total_price, currency)}</p>
          </div>

          {variants.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {variants.map((v, i) => (
                <span key={i} className="rounded-md bg-subtle px-1.5 py-0.5 text-xs text-ink-2 ring-1 ring-line">
                  <span className="text-muted">{v.name}:</span> {v.value}
                </span>
              ))}
            </div>
          ) : null}

          {item.personalisation ? (
            <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-700">
                <Sparkles className="size-3" /> Personalisation
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-violet-950 [overflow-wrap:anywhere]">{item.personalisation}</p>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-dashed border-line pt-3 text-xs">
            {job ? (
              <>
                <StageBadge stage={job.stage} />
                <Link href={`/production?job=${job.id}`} className="font-medium text-ink-2 hover:text-brand-700 hover:underline">
                  {job.job_number}
                </Link>
                {job.printer ? (
                  <span className="inline-flex items-center gap-1 text-muted">
                    <Printer className="size-3.5" /> {job.printer.name}
                  </span>
                ) : null}
                {job.estimated_print_minutes ? <span className="text-muted">≈ {formatMinutes(job.estimated_print_minutes)}</span> : null}
                {job.failed_attempts ? <span className="font-medium text-red-600">{job.failed_attempts} failed print{job.failed_attempts === 1 ? "" : "s"}</span> : null}
              </>
            ) : (
              <span className="text-muted">No production job</span>
            )}
            <span className="ml-auto">
              {item.product ? (
                <Link href={`/products/${item.product.id}`} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                  <Link2 className="size-3.5" /> {item.product.name}
                </Link>
              ) : (
                <span className="font-medium text-amber-700">Not linked to a product</span>
              )}
            </span>
            {canWrite ? (
              <button onClick={() => setMapping((m) => !m)} className="inline-flex items-center gap-1 text-muted hover:text-ink">
                <PenLine className="size-3.5" /> {item.product ? "Change" : "Link"}
              </button>
            ) : null}
          </div>

          {item.marketplace_options ? (
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer select-none hover:text-ink">Original marketplace options</summary>
              <pre className="mt-1.5 max-h-48 overflow-auto rounded-md bg-subtle p-2 font-mono text-[11px] whitespace-pre-wrap text-ink-2 ring-1 ring-line">
                {JSON.stringify(item.marketplace_options, null, 2)}
              </pre>
            </details>
          ) : null}

          {mapping ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Product">
                <option value="">— Not linked —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </Select>
              <Button size="md" onClick={saveMapping} loading={pending}>Save</Button>
            </div>
          ) : null}
          {mapping ? (
            <p className="mt-1.5 text-xs text-muted">
              Linking fills print time, material and filament estimates on the job if it hasn’t started. Add a marketplace
              listing to the product to link future orders automatically.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
