"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Download, Link2, Sparkles, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { FormError, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { importProductsAction, previewProductImportAction } from "@/lib/actions/products";
import type { ImportPreview, ImportSummary } from "@/lib/integrations/product-import";
import type { PlanAction } from "@/lib/integrations/listings";
import { cn } from "@/lib/utils";

type Provider = "etsy" | "shopify";
type Row = ImportPreview["rows"][number];
type Choice = { action: PlanAction; product_id: string | null };

const NAMES: Record<Provider, string> = { etsy: "Etsy", shopify: "Shopify" };
const ORDER: Record<Row["reason"], number> = { name: 0, new: 1, sku: 2, already_linked: 3 };

export function ImportProductsDialog({ providers }: { providers: Provider[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [provider, setProvider] = React.useState<Provider | null>(null);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [choices, setChoices] = React.useState<Record<string, Choice>>({});
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const reset = () => {
    setProvider(null);
    setPreview(null);
    setChoices({});
    setSummary(null);
    setError(null);
  };

  const load = (p: Provider) =>
    startTransition(async () => {
      setProvider(p);
      setError(null);
      const res = await previewProductImportAction(p);
      if (!res.ok) return setError(res.error);
      setPreview(res.data!);
      setChoices(Object.fromEntries(res.data!.rows.map((r) => [r.listing.external_listing_id, { action: r.action, product_id: r.product_id }])));
    });

  const run = () =>
    startTransition(async () => {
      if (!provider || !preview) return;
      setError(null);
      const decisions = preview.rows.map((r) => ({ external_listing_id: r.listing.external_listing_id, ...choices[r.listing.external_listing_id]! }));
      const res = await importProductsAction(provider, decisions);
      if (!res.ok) return setError(res.error);
      setSummary(res.data!);
      toast({ title: res.message ?? "Import complete" });
      router.refresh();
    });

  const rows = preview ? [...preview.rows].sort((a, b) => ORDER[a.reason] - ORDER[b.reason]) : [];
  const count = (pred: (c: Choice, r: Row) => boolean) => rows.filter((r) => pred(choices[r.listing.external_listing_id]!, r)).length;
  const productName = (id: string | null) => preview?.products.find((p) => p.id === id)?.name ?? "—";
  const invalid = rows.some((r) => {
    const c = choices[r.listing.external_listing_id]!;
    return c.action === "link" && !c.product_id;
  });

  return (
    <>
      <Button variant="outline" onClick={() => { reset(); setOpen(true); }}>
        <Download /> Import from marketplace
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent
          size="xl"
          title={provider ? `Import products from ${NAMES[provider]}` : "Import products"}
          description="Brings your listings into PrintFlow as products. Nothing is duplicated: listings already linked are only refreshed, and matching SKUs link to the product you already have."
        >
          <DialogBody>
            <FormError message={error} />

            {!preview && !pending ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {providers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => load(p)}
                    className="rounded-xl border border-line p-4 text-left transition hover:border-line-strong hover:shadow-card"
                  >
                    <span className="block text-sm font-semibold text-ink">{NAMES[p]}</span>
                    <span className="mt-1 block text-xs text-muted">Read your {p === "etsy" ? "active listings" : "products"} and review before anything is saved.</span>
                  </button>
                ))}
                {providers.length === 0 ? <p className="text-sm text-muted">Connect Etsy or Shopify in Settings → Integrations first.</p> : null}
              </div>
            ) : null}

            {pending && !preview ? <p className="py-6 text-center text-sm text-muted">Reading listings from {provider ? NAMES[provider] : "the marketplace"}…</p> : null}

            {summary ? (
              <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-sm" data-testid="import-summary">
                <p className="flex items-center gap-2 font-semibold text-brand-900"><CircleCheck className="size-4" /> Import complete</p>
                <ul className="grid gap-1 text-ink-2 sm:grid-cols-2">
                  <li>{summary.created} new product(s) created</li>
                  <li>{summary.linked} linked to existing products</li>
                  <li>{summary.already_linked} already linked (refreshed)</li>
                  <li>{summary.skipped} skipped</li>
                  <li>{summary.order_lines_linked} existing order line(s) matched</li>
                  <li>{summary.images_added} image(s) copied</li>
                </ul>
                {summary.images_pending ? <p className="text-xs text-muted">{summary.images_pending} image(s) not copied yet — run the import again to fetch them (nothing is duplicated).</p> : null}
                {summary.failed.length ? (
                  <div className="text-xs text-red-700">
                    {summary.failed.length} failed:
                    <ul className="list-disc pl-4">{summary.failed.slice(0, 10).map((f, i) => <li key={i}>{f.title}: {f.error}</li>)}</ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {preview && !summary ? (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge tone="neutral">{rows.length} listings</Badge>
                  <Badge tone="green">{count((c) => c.action === "create")} to create</Badge>
                  <Badge tone="blue">{count((c, r) => c.action === "link" && r.reason !== "already_linked")} to link</Badge>
                  <Badge tone="neutral">{count((_, r) => r.reason === "already_linked")} already linked</Badge>
                  <Badge tone="neutral">{count((c) => c.action === "skip")} skipped</Badge>
                  {count((_, r) => r.reason === "name") ? <Badge tone="amber">{count((_, r) => r.reason === "name")} matched by name — please check</Badge> : null}
                </div>
                <ul className="max-h-[55vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
                  {rows.map((r) => {
                    const id = r.listing.external_listing_id;
                    const c = choices[id]!;
                    const set = (next: Partial<Choice>) => setChoices((prev) => ({ ...prev, [id]: { ...prev[id]!, ...next } }));
                    return (
                      <li key={id} className={cn("flex flex-col gap-2 p-3 sm:flex-row sm:items-center", r.reason === "name" && "bg-amber-50/50")} data-testid="import-row">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          {r.listing.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.listing.image_url} alt="" className="size-11 shrink-0 rounded-lg object-cover ring-1 ring-line" />
                          ) : (
                            <span className="size-11 shrink-0 rounded-lg bg-subtle ring-1 ring-line" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink" title={r.listing.title}>{r.listing.title}</p>
                            <p className="truncate text-xs text-muted">
                              {r.listing.skus.length ? `SKU ${r.listing.skus.join(", ")}` : "No SKU"}
                              {r.listing.price != null ? ` · ${r.listing.price.toFixed(2)} ${r.listing.currency ?? ""}` : ""}
                              {!r.listing.is_active ? " · inactive" : ""}
                            </p>
                            <p className="mt-0.5 text-xs">
                              {r.reason === "already_linked" ? (
                                <span className="inline-flex items-center gap-1 text-ink-2"><Link2 className="size-3" /> Already linked to {productName(r.product_id)}</span>
                              ) : r.reason === "sku" ? (
                                <span className="inline-flex items-center gap-1 text-brand-700"><Link2 className="size-3" /> Same SKU as {productName(r.product_id)}</span>
                              ) : r.reason === "name" ? (
                                <span className="inline-flex items-center gap-1 text-amber-800"><TriangleAlert className="size-3" /> Similar name to {productName(r.product_id)} ({Math.round((r.score ?? 0) * 100)}%) — check it’s the same item</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-muted"><Sparkles className="size-3" /> No match — new product</span>
                              )}
                            </p>
                          </div>
                        </div>
                        {r.reason !== "already_linked" ? (
                          <div className="flex shrink-0 flex-col gap-1.5 sm:w-64">
                            <Select
                              aria-label={`Action for ${r.listing.title}`}
                              value={c.action}
                              onChange={(e) => set({ action: e.target.value as PlanAction, product_id: e.target.value === "link" ? (c.product_id ?? r.product_id) : c.product_id })}
                            >
                              <option value="create">Create new product</option>
                              <option value="link">Link to existing product</option>
                              <option value="skip">Skip</option>
                            </Select>
                            {c.action === "link" ? (
                              <Select aria-label={`Product for ${r.listing.title}`} value={c.product_id ?? ""} onChange={(e) => set({ product_id: e.target.value || null })}>
                                <option value="">Choose a product…</option>
                                {preview.products.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                                ))}
                              </Select>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
          </DialogBody>
          <DialogFooter>
            {summary ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : preview ? (
              <>
                <Button variant="outline" onClick={reset} disabled={pending}>Back</Button>
                <Button onClick={run} loading={pending} disabled={invalid}>
                  Import {count((c, r) => c.action !== "skip" || r.reason === "already_linked")} listing(s)
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
