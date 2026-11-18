"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { updateBusinessSettingsAction } from "@/lib/actions/settings";
import { businessSettingsSchema } from "@/lib/validation/settings";
import type { BusinessSettings } from "@/lib/data/settings";

// The form edits the checklist as objects so useFieldArray can key rows.
const formSchema = businessSettingsSchema.extend({
  packing_checklist: z.array(z.object({ label: z.string().trim().min(1, "Enter a checklist item").max(120) })).max(20),
});
type In = z.input<typeof formSchema>;
type Out = z.output<typeof formSchema>;

export function BusinessSettingsForm({ settings, canEdit }: { settings: BusinessSettings; canEdit: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(formSchema) as Resolver<In, unknown, Out>,
    defaultValues: {
      business_name: settings.business_name,
      currency: settings.currency,
      timezone: settings.timezone,
      default_dispatch_days: settings.default_dispatch_days,
      etsy_fee_percent: settings.etsy_fee_percent,
      etsy_fixed_fee: settings.etsy_fixed_fee,
      shopify_fee_percent: settings.shopify_fee_percent,
      shopify_fixed_fee: settings.shopify_fixed_fee,
      default_packaging_cost: settings.default_packaging_cost,
      default_filament_cost_per_kg: settings.default_filament_cost_per_kg,
      packing_checklist: settings.packing_checklist.map((label) => ({ label })),
    },
  });
  const checklist = useFieldArray({ control: form.control, name: "packing_checklist" });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await updateBusinessSettingsAction({ ...values, packing_checklist: values.packing_checklist.map((c) => c.label) });
    if (res.ok) {
      toast({ title: "Settings saved" });
      form.reset(values);
      router.refresh();
    } else setError(res.error);
  });

  const num = (name: keyof In, label: string, opts: { step?: string; hint?: string; suffix?: string } = {}) => (
    <Field label={label} htmlFor={name} error={(e[name] as { message?: string } | undefined)?.message} hint={opts.hint}>
      <div className="relative">
        <Input id={name} type="number" step={opts.step ?? "0.01"} min={0} disabled={!canEdit} {...form.register(name)} className={opts.suffix ? "pr-10" : undefined} />
        {opts.suffix ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">{opts.suffix}</span> : null}
      </div>
    </Field>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError message={error} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Business" description="Shown in the sidebar and used for dates and money." />
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name" htmlFor="business_name" error={e.business_name?.message} className="sm:col-span-2">
              <Input id="business_name" disabled={!canEdit} {...form.register("business_name")} />
            </Field>
            <Field label="Currency" htmlFor="currency" error={e.currency?.message} hint="ISO code, e.g. GBP">
              <Input id="currency" maxLength={3} className="uppercase" disabled={!canEdit} {...form.register("currency")} />
            </Field>
            <Field label="Timezone" htmlFor="timezone" error={e.timezone?.message} hint="e.g. Europe/London">
              <Input id="timezone" disabled={!canEdit} {...form.register("timezone")} />
            </Field>
            {num("default_dispatch_days", "Default dispatch time", { step: "1", suffix: "days", hint: "Business days after ordering, when the marketplace gives no deadline." })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Cost assumptions" description="Used only for estimated profit — never presented as accounting figures." />
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {num("etsy_fee_percent", "Etsy fees", { suffix: "%", hint: "Transaction + payment processing" })}
            {num("etsy_fixed_fee", "Etsy fixed fee per order", { suffix: settings.currency })}
            {num("shopify_fee_percent", "Shopify payment fees", { suffix: "%" })}
            {num("shopify_fixed_fee", "Shopify fixed fee per order", { suffix: settings.currency })}
            {num("default_packaging_cost", "Packaging per order (min)", { suffix: settings.currency })}
            {num("default_filament_cost_per_kg", "Fallback filament cost", { suffix: "/kg", hint: "When a spool has no purchase price recorded." })}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader title="Packing checklist" description="Shown for every order in Packing & Dispatch." />
        <CardContent className="space-y-2">
          {checklist.fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2">
              <span className="w-5 text-center text-xs text-faint tabular">{i + 1}</span>
              <Input disabled={!canEdit} {...form.register(`packing_checklist.${i}.label`)} aria-label={`Checklist item ${i + 1}`} />
              {canEdit ? (
                <Button variant="ghost" size="icon-sm" onClick={() => checklist.remove(i)} aria-label="Remove item">
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ))}
          {canEdit ? (
            <Button variant="outline" size="sm" onClick={() => checklist.append({ label: "" })} disabled={checklist.fields.length >= 20}>
              <Plus /> Add item
            </Button>
          ) : null}
        </CardContent>
        {canEdit ? (
          <CardFooter>
            <Button type="submit" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>Save settings</Button>
          </CardFooter>
        ) : null}
      </Card>
    </form>
  );
}
