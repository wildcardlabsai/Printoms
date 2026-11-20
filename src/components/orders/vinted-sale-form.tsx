"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { addVintedSaleAction } from "@/lib/actions/orders";
import { VINTED_SALE_STATUSES, type VintedSaleStatus } from "@/lib/validation/vinted-sale";
import type { ProductOption } from "@/lib/data/orders";
import { cn, formatCurrency } from "@/lib/utils";

type Item = { product_id: string; title: string; quantity: string; price: string; personalisation: string };
const blankItem = (): Item => ({ product_id: "", title: "", quantity: "1", price: "", personalisation: "" });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function VintedSaleForm({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [key, setKey] = React.useState(() => crypto.randomUUID());
  const [saleDate, setSaleDate] = React.useState(today);
  const [status, setStatus] = React.useState<VintedSaleStatus>("to_make");
  const [items, setItems] = React.useState<Item[]>([blankItem()]);
  const [buyer, setBuyer] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [last, setLast] = React.useState<{ id: string; title: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const setItem = (i: number, patch: Partial<Item>) => setItems((list) => list.map((it, n) => (n === i ? { ...it, ...patch } : it)));
  const pickProduct = (i: number, id: string) => {
    const p = products.find((x) => x.id === id);
    setItem(i, { product_id: id, ...(p ? { title: p.name, price: items[i]!.price || (p.base_price ? Number(p.base_price).toFixed(2) : "") } : {}) });
  };
  const total = items.reduce((s, i) => s + (Number(i.price.replace(/[£,\s]/g, "")) || 0), 0);
  const err = (k: string) => fieldErrors[k]?.[0];

  const reset = () => {
    setKey(crypto.randomUUID());
    setItems([blankItem()]);
    setBuyer("");
    setReference("");
    setNote("");
    setFieldErrors({});
  };

  const submit = (another: boolean) =>
    startTransition(async () => {
      setError(null);
      const res = await addVintedSaleAction({ key, sale_date: saleDate, status, buyer, reference, note, items });
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      toast({ title: res.message ?? "Vinted sale added" });
      if (another) {
        setLast({ id: res.data!.id, title: items[0]?.title || "Sale" });
        reset();
        window.scrollTo({ top: 0, behavior: "smooth" });
        router.refresh();
      } else {
        router.push(`/orders/${res.data!.id}`);
      }
    });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {last ? (
        <p className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          <CircleCheck className="size-4 shrink-0" />
          <span className="min-w-0 truncate">Added “{last.title}”.</span>
          <Link href={`/orders/${last.id}`} className="ml-auto shrink-0 font-medium underline">View</Link>
        </p>
      ) : null}
      <FormError message={error} />

      <Card>
        <CardHeader title="Sale" />
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date sold" htmlFor="sale_date" error={err("sale_date")}>
              <Input id="sale_date" type="date" max={today()} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </Field>
            <Field label="Vinted order number (optional)" htmlFor="reference" error={err("reference")} hint="Stops the same sale being added twice.">
              <Input id="reference" inputMode="text" autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink">Status</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Status">
              {(Object.keys(VINTED_SALE_STATUSES) as VintedSaleStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={status === s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "rounded-xl border-2 px-2 py-2.5 text-center text-sm font-semibold transition",
                    status === s ? "border-brand-500 bg-brand-50 text-brand-900" : "border-line text-muted hover:border-line-strong",
                  )}
                >
                  {VINTED_SALE_STATUSES[s].label}
                  <span className="mt-0.5 block text-[11px] font-normal text-muted">{VINTED_SALE_STATUSES[s].help}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Items" description="Price = what the buyer paid for that line (£)." />
        <CardContent className="space-y-4">
          {items.map((it, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-line p-3" data-testid="vinted-item">
              {products.length ? (
                <Field label="Product (optional)" htmlFor={`p-${i}`} hint="Links the sale to your product for tickets and costs.">
                  <Select id={`p-${i}`} value={it.product_id} onChange={(e) => pickProduct(i, e.target.value)}>
                    <option value="">— Not linked —</option>
                    {products.filter((p) => !p.is_sample).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field label="Item" htmlFor={`t-${i}`} error={err(`items.${i}.title`)}>
                <Input id={`t-${i}`} value={it.title} placeholder="e.g. Maine Coon Cat Planter" onChange={(e) => setItem(i, { title: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantity" htmlFor={`q-${i}`}>
                  <Input id={`q-${i}`} type="number" inputMode="numeric" min={1} max={99} value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
                </Field>
                <Field label="Price (£)" htmlFor={`pr-${i}`} error={err(`items.${i}.price`) ?? (fieldErrors.items ? "Check the price" : undefined)}>
                  <Input id={`pr-${i}`} inputMode="decimal" placeholder="10.00" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} />
                </Field>
              </div>
              <Field label="Personalisation (optional)" htmlFor={`pe-${i}`}>
                <Textarea id={`pe-${i}`} rows={2} value={it.personalisation} onChange={(e) => setItem(i, { personalisation: e.target.value })} />
              </Field>
              {items.length > 1 ? (
                <Button size="sm" variant="ghost" onClick={() => setItems((l) => l.filter((_, n) => n !== i))}>
                  <Trash2 /> Remove item
                </Button>
              ) : null}
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setItems((l) => [...l, blankItem()])} disabled={items.length >= 20}>
            <Plus /> Add another item (bundle)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Buyer & notes" description="Optional." />
        <CardContent className="space-y-3">
          <Field label="Buyer’s Vinted username" htmlFor="buyer" hint="Leave empty if you don’t need it. The same username always links to the same customer.">
            <Input id="buyer" autoComplete="off" autoCapitalize="none" value={buyer} onChange={(e) => setBuyer(e.target.value)} />
          </Field>
          <Field label="Note" htmlFor="note">
            <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="text-sm text-ink-2 sm:mr-auto">
            Total <strong className="text-ink">{formatCurrency(total, "GBP")}</strong>
          </p>
          <Button size="lg" className="w-full sm:w-auto" loading={pending} onClick={() => submit(false)}>
            Add sale
          </Button>
          <Button size="lg" variant="outline" className="w-full sm:w-auto" disabled={pending} onClick={() => submit(true)}>
            Add & add another
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
