"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Archive, ArchiveRestore, Ellipsis, Pencil, Plus, Scale, Trash, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { adjustStockAction, saveSpoolAction, setSpoolArchivedAction } from "@/lib/actions/filament";
import { spoolSchema } from "@/lib/validation/filament";
import { MATERIALS } from "@/lib/constants";
import { formatGrams } from "@/lib/utils";
import type { SpoolRow } from "@/lib/data/filament";

type In = z.input<typeof spoolSchema>;
type Out = z.output<typeof spoolSchema>;

function SpoolForm({ spool, onDone, currency }: { spool?: SpoolRow; onDone: () => void; currency: string }) {
  const toast = useToast();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(spoolSchema) as Resolver<In, unknown, Out>,
    defaultValues: {
      brand: spool?.brand ?? "",
      material: spool?.material ?? "PLA",
      colour: spool?.colour ?? "",
      colour_hex: spool?.colour_hex ?? "",
      spool_weight_g: spool?.spool_weight_g ?? 1000,
      remaining_g: spool?.remaining_g ?? 1000,
      purchase_price: spool?.purchase_price ?? "",
      supplier: spool?.supplier ?? "",
      purchase_date: spool?.purchase_date ?? new Date().toISOString().slice(0, 10),
      low_stock_threshold_g: spool?.low_stock_threshold_g ?? 200,
      notes: spool?.notes ?? "",
    },
  });
  const e = form.formState.errors;
  const hex = useWatch({ control: form.control, name: "colour_hex" });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await saveSpoolAction(spool?.id ?? null, values);
    if (res.ok) {
      toast({ title: res.message ?? "Saved" });
      onDone();
      router.refresh();
    } else setError(res.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogBody>
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Brand" htmlFor="f-brand" error={e.brand?.message} required>
            <Input id="f-brand" {...form.register("brand")} />
          </Field>
          <Field label="Material" htmlFor="f-mat" error={e.material?.message} required hint="Any material — PLA, PLA+, PETG…">
            <Input id="f-mat" list="f-materials" {...form.register("material")} />
            <datalist id="f-materials">{MATERIALS.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="Colour" htmlFor="f-colour" error={e.colour?.message} required>
            <Input id="f-colour" {...form.register("colour")} />
          </Field>
          <Field label="Swatch" htmlFor="f-hex" error={e.colour_hex?.message}>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Pick swatch colour"
                className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-white p-1"
                value={/^#[0-9A-Fa-f]{6}$/.test(String(hex ?? "")) ? String(hex) : "#cccccc"}
                onChange={(ev) => form.setValue("colour_hex", ev.target.value, { shouldDirty: true })}
              />
              <Input id="f-hex" placeholder="#22A06F" {...form.register("colour_hex")} />
            </div>
          </Field>
          <Field label="Spool weight (g)" htmlFor="f-spool" error={e.spool_weight_g?.message} required hint="Net filament weight">
            <Input id="f-spool" type="number" min={1} {...form.register("spool_weight_g")} />
          </Field>
          <Field label="Remaining (g)" htmlFor="f-rem" error={e.remaining_g?.message} required hint={spool ? "Changes are recorded as an adjustment" : undefined}>
            <Input id="f-rem" type="number" min={0} step="0.1" {...form.register("remaining_g")} />
          </Field>
          <Field label={`Purchase price (${currency})`} htmlFor="f-price" error={e.purchase_price?.message}>
            <Input id="f-price" type="number" min={0} step="0.01" {...form.register("purchase_price")} />
          </Field>
          <Field label="Purchase date" htmlFor="f-date">
            <Input id="f-date" type="date" {...form.register("purchase_date")} />
          </Field>
          <Field label="Supplier" htmlFor="f-sup">
            <Input id="f-sup" {...form.register("supplier")} />
          </Field>
          <Field label="Low-stock warning at (g)" htmlFor="f-low" error={e.low_stock_threshold_g?.message}>
            <Input id="f-low" type="number" min={0} {...form.register("low_stock_threshold_g")} />
          </Field>
          <Field label="Notes" htmlFor="f-notes" className="sm:col-span-2">
            <Textarea id="f-notes" rows={2} placeholder="Drying, storage, print temps…" {...form.register("notes")} />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={form.formState.isSubmitting}>{spool ? "Save spool" : "Add spool"}</Button>
      </DialogFooter>
    </form>
  );
}

export function AddSpoolButton({ currency }: { currency: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Add spool</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" title="Add filament spool">
          {open ? <SpoolForm onDone={() => setOpen(false)} currency={currency} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SpoolActions({ spool, currency }: { spool: SpoolRow; currency: string }) {
  const toast = useToast();
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"edit" | "set_remaining" | "usage" | "waste" | null>(null);
  const [grams, setGrams] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const openAdjust = (mode: "set_remaining" | "usage" | "waste") => {
    setGrams(mode === "set_remaining" ? String(spool.remaining_g ?? "") : "");
    setNote("");
    setError(null);
    setDialog(mode);
  };

  const titles = {
    set_remaining: "Correct remaining weight",
    usage: "Record filament used",
    waste: "Record wasted filament",
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${spool.brand} ${spool.colour}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => openAdjust("usage")}><Flame /> Record usage</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openAdjust("waste")}><Trash /> Record waste</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openAdjust("set_remaining")}><Scale /> Weighed spool — set remaining</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog("edit")}><Pencil /> Edit details</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              startTransition(async () => {
                const res = await setSpoolArchivedAction(spool.id, !spool.is_archived);
                toast(res.ok ? { title: res.message ?? "Done" } : { title: res.error, tone: "error" });
                router.refresh();
              })
            }
          >
            {spool.is_archived ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive (empty / finished)</>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "edit"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent size="lg" title="Edit spool" description={`${spool.brand} ${spool.material} · ${spool.colour}`}>
          {dialog === "edit" ? <SpoolForm spool={spool} onDone={() => setDialog(null)} currency={currency} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog !== null && dialog !== "edit"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent
          size="sm"
          title={dialog && dialog !== "edit" ? titles[dialog] : ""}
          description={`${spool.brand} ${spool.material} · ${spool.colour} — ${formatGrams(spool.remaining_g)} remaining`}
        >
          <DialogBody>
            <FormError message={error} />
            <Field
              label={dialog === "set_remaining" ? "Remaining filament (g)" : "Grams"}
              htmlFor={`adj-${spool.id}`}
              hint={dialog === "set_remaining" ? "Weigh the spool and subtract the empty spool weight." : "Deducted from this spool and recorded in the usage history."}
            >
              <Input id={`adj-${spool.id}`} type="number" min={0} step="0.1" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} autoFocus />
            </Field>
            <Field label="Note" htmlFor={`adjn-${spool.id}`}>
              <Input id={`adjn-${spool.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              loading={pending}
              disabled={grams === ""}
              onClick={() =>
                startTransition(async () => {
                  const res = await adjustStockAction({ stock_id: spool.id, mode: dialog as "set_remaining" | "usage" | "waste", grams, note });
                  if (res.ok) {
                    toast({ title: res.message ?? "Saved" });
                    setDialog(null);
                    router.refresh();
                  } else setError(res.error);
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
