"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { saveProductAction } from "@/lib/actions/products";
import { productSchema } from "@/lib/validation/products";
import { MATERIALS } from "@/lib/constants";

type In = z.input<typeof productSchema>;
type Out = z.output<typeof productSchema>;

export type ProductFormInitial = Partial<Record<keyof Out, unknown>>;

export function ProductForm({
  productId,
  initial,
  printers,
  categories,
  currency,
  canEdit = true,
}: {
  productId?: string;
  initial?: ProductFormInitial;
  printers: { id: string; name: string }[];
  categories: string[];
  currency: string;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = React.useState<string | null>(null);
  const v = (k: keyof Out, fallback: unknown = "") => (initial?.[k] ?? fallback) as never;
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(productSchema) as Resolver<In, unknown, Out>,
    defaultValues: {
      name: v("name"),
      sku: v("sku"),
      description: v("description"),
      category: v("category"),
      material: v("material", "PLA"),
      default_colour: v("default_colour"),
      estimated_print_minutes: v("estimated_print_minutes"),
      estimated_filament_g: v("estimated_filament_g"),
      default_printer_id: v("default_printer_id"),
      model_file_ref: v("model_file_ref"),
      production_instructions: v("production_instructions"),
      base_price: v("base_price"),
      material_cost: v("material_cost"),
      packaging_cost: v("packaging_cost"),
      labour_cost: v("labour_cost"),
      other_cost: v("other_cost"),
      is_active: v("is_active", true),
    },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await saveProductAction(productId ?? null, values);
    if (res.ok) {
      toast({ title: res.message ?? "Saved" });
      if (!productId && res.data) router.push(`/products/${res.data.id}`);
      else {
        form.reset(values);
        router.refresh();
      }
    } else {
      setError(res.error);
      if (res.fieldErrors) for (const [k, msgs] of Object.entries(res.fieldErrors)) form.setError(k as keyof In, { message: msgs?.[0] });
    }
  });

  const money = (name: keyof In, label: string, hint?: string) => (
    <Field label={label} htmlFor={name} error={(e[name] as { message?: string } | undefined)?.message} hint={hint}>
      <div className="relative">
        <Input id={name} type="number" min={0} step="0.01" inputMode="decimal" className="pr-12" disabled={!canEdit} {...form.register(name)} />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">{currency}</span>
      </div>
    </Field>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError message={error} />
      <Card>
        <CardHeader title="Product details" />
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" error={e.name?.message} required className="sm:col-span-2">
            <Input id="name" disabled={!canEdit} {...form.register("name")} />
          </Field>
          <Field label="SKU" htmlFor="sku" error={e.sku?.message} required hint="Matched against marketplace SKUs on import.">
            <Input id="sku" className="font-mono uppercase" disabled={!canEdit} {...form.register("sku")} />
          </Field>
          <Field label="Category" htmlFor="category">
            <Input id="category" list="product-categories" disabled={!canEdit} {...form.register("category")} />
            <datalist id="product-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Description" htmlFor="description" className="sm:col-span-2">
            <Textarea id="description" rows={3} disabled={!canEdit} {...form.register("description")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Production" description="Defaults copied onto new production jobs (multiplied by quantity)." />
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Material" htmlFor="material">
            <Input id="material" list="mat-list" disabled={!canEdit} {...form.register("material")} />
            <datalist id="mat-list">{MATERIALS.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="Default colour" htmlFor="default_colour">
            <Input id="default_colour" disabled={!canEdit} {...form.register("default_colour")} />
          </Field>
          <Field label="Default printer" htmlFor="default_printer_id">
            <Select id="default_printer_id" disabled={!canEdit} {...form.register("default_printer_id")}>
              <option value="">No preference</option>
              {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Est. print time (minutes)" htmlFor="estimated_print_minutes" error={e.estimated_print_minutes?.message} hint="Per unit">
            <Input id="estimated_print_minutes" type="number" min={0} step={1} inputMode="numeric" disabled={!canEdit} {...form.register("estimated_print_minutes")} />
          </Field>
          <Field label="Est. filament (g)" htmlFor="estimated_filament_g" error={e.estimated_filament_g?.message} hint="Per unit, incl. supports/purge">
            <Input id="estimated_filament_g" type="number" min={0} step="0.1" inputMode="decimal" disabled={!canEdit} {...form.register("estimated_filament_g")} />
          </Field>
          <Field label="STL / 3MF file reference" htmlFor="model_file_ref" hint="Path, share link or file name">
            <Input id="model_file_ref" className="font-mono text-[13px]" disabled={!canEdit} {...form.register("model_file_ref")} />
          </Field>
          <Field label="Production instructions" htmlFor="production_instructions" className="sm:col-span-2 lg:col-span-3">
            <Textarea id="production_instructions" rows={3} placeholder="Layer height, infill, supports, orientation, post-processing…" disabled={!canEdit} {...form.register("production_instructions")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Pricing & costs" description="Per unit. Leave material cost blank to estimate it from filament weight." />
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {money("base_price", "Selling price", "Default for manual orders")}
          {money("material_cost", "Material cost", "Optional override")}
          {money("packaging_cost", "Packaging")}
          {money("labour_cost", "Labour")}
          {money("other_cost", "Other")}
        </CardContent>
        <CardFooter className="justify-between">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <Checkbox disabled={!canEdit} {...form.register("is_active")} /> Active in catalogue
          </label>
          {canEdit ? (
            <div className="flex gap-2">
              {!productId ? <ButtonLink href="/products" variant="ghost">Cancel</ButtonLink> : null}
              <Button type="submit" loading={form.formState.isSubmitting} disabled={Boolean(productId) && !form.formState.isDirty}>
                {productId ? "Save changes" : "Create product"}
              </Button>
            </div>
          ) : null}
        </CardFooter>
      </Card>
    </form>
  );
}
