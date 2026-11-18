"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { SourceBadge } from "@/components/ui/status-badges";
import { useToast } from "@/components/ui/toast";
import { addListingAction, removeListingAction } from "@/lib/actions/products";

type Listing = {
  id: string;
  source: "etsy" | "shopify";
  external_listing_id: string;
  external_variant_id: string | null;
  external_sku: string | null;
  title: string | null;
  url: string | null;
};

export function ListingsManager({ productId, listings, canEdit }: { productId: string; listings: Listing[]; canEdit: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [source, setSource] = React.useState<"etsy" | "shopify">("etsy");
  const [listingId, setListingId] = React.useState("");
  const [variantId, setVariantId] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const reset = () => {
    setListingId("");
    setVariantId("");
    setSku("");
    setTitle("");
    setUrl("");
    setError(null);
  };

  return (
    <div className="space-y-3">
      {listings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[13px] text-muted">
          No marketplace listings linked. Link listings so imported order lines map to this product automatically.
        </p>
      ) : (
        <ul className="space-y-2">
          {listings.map((l) => (
            <li key={l.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
              <SourceBadge source={l.source} compact className="mt-0.5" />
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="truncate font-medium text-ink">{l.title || (l.source === "etsy" ? "Etsy listing" : "Shopify product")}</p>
                <p className="truncate font-mono text-[11px] text-muted">
                  {l.external_listing_id}
                  {l.external_variant_id ? ` · variant ${l.external_variant_id.split("/").pop()}` : " · all variants"}
                  {l.external_sku ? ` · ${l.external_sku}` : ""}
                </p>
              </div>
              {l.url ? (
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-faint hover:text-ink" aria-label="Open listing">
                  <ExternalLink className="size-4" />
                </a>
              ) : null}
              {canEdit ? (
                <button
                  className="rounded p-1 text-faint hover:text-red-600"
                  aria-label="Unlink listing"
                  onClick={() =>
                    startTransition(async () => {
                      const res = await removeListingAction(l.id, productId);
                      toast(res.ok ? { title: res.message ?? "Unlinked" } : { title: res.error, tone: "error" });
                      router.refresh();
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus /> Link a listing
        </Button>
      ) : null}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent size="md" title="Link a marketplace listing" description="Etsy and Shopify IDs are different systems — add one row per listing (and per variant if variants are different products).">
          <DialogBody>
            <FormError message={error} />
            <Field label="Marketplace" htmlFor="l-source">
              <Select id="l-source" value={source} onChange={(e) => setSource(e.target.value as "etsy" | "shopify")}>
                <option value="etsy">Etsy</option>
                <option value="shopify">Shopify</option>
              </Select>
            </Field>
            <Field
              label={source === "etsy" ? "Etsy listing ID" : "Shopify product ID"}
              htmlFor="l-id"
              required
              hint={source === "etsy" ? "The number in the listing URL: etsy.com/listing/123456789/…" : "Numeric ID from the product URL in Shopify admin, or a gid://shopify/Product/… ID"}
            >
              <Input id="l-id" className="font-mono" value={listingId} onChange={(e) => setListingId(e.target.value)} />
            </Field>
            <Field
              label={source === "etsy" ? "Etsy product (variation) ID" : "Shopify variant ID"}
              htmlFor="l-var"
              hint="Optional — leave blank to match every variant of the listing."
            >
              <Input id="l-var" className="font-mono" value={variantId} onChange={(e) => setVariantId(e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Marketplace SKU" htmlFor="l-sku">
                <Input id="l-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
              </Field>
              <Field label="Listing title" htmlFor="l-title">
                <Input id="l-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
            </div>
            <Field label="Listing URL" htmlFor="l-url">
              <Input id="l-url" type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={pending}
              disabled={!listingId.trim()}
              onClick={() =>
                startTransition(async () => {
                  const res = await addListingAction({
                    product_id: productId,
                    source,
                    external_listing_id: listingId,
                    external_variant_id: variantId,
                    external_sku: sku,
                    title,
                    url,
                  });
                  if (res.ok) {
                    toast({ title: res.message ?? "Linked" });
                    setOpen(false);
                    reset();
                    router.refresh();
                  } else setError(res.error);
                })
              }
            >
              Link listing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
