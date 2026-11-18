"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus, Trash2, User, MapPin, Package, Settings2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { createManualOrderAction } from "@/lib/actions/orders";
import { manualOrderSchema } from "@/lib/validation/orders";
import { PAYMENT_STATUS, PAYMENT_STATUSES, PRIORITIES, PRIORITY } from "@/lib/constants";
import { endOfDayIso, startOfDayIso, toDateInput } from "@/lib/dates";
import { addBusinessDays, formatCurrency, toNumber } from "@/lib/utils";
import type { ProductOption } from "@/lib/data/orders";

type FormIn = z.input<typeof manualOrderSchema>;
type FormOut = z.output<typeof manualOrderSchema>;

export function ManualOrderForm({
  products,
  currency,
  defaultDispatchDays,
}: {
  products: ProductOption[];
  currency: string;
  defaultDispatchDays: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(manualOrderSchema) as Resolver<FormIn, unknown, FormOut>,
    defaultValues: {
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      external_order_number: "",
      order_date: toDateInput(new Date().toISOString()),
      dispatch_by: toDateInput(addBusinessDays(new Date(), defaultDispatchDays).toISOString()),
      payment_status: "paid",
      priority: "normal",
      shipping_method: "",
      shipping_total: "",
      discount_total: "",
      customer_note: "",
      production_notes: "",
      shipping_address: { name: "", line1: "", line2: "", city: "", region: "", postal_code: "", country_code: "GB", phone: "" },
      items: [{ product_id: "", title: "", sku: "", variant_title: "", quantity: 1, unit_price: "", personalisation: "" }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items = useWatch({ control: form.control, name: "items" });
  const shipping = useWatch({ control: form.control, name: "shipping_total" });
  const discount = useWatch({ control: form.control, name: "discount_total" });
  const errors = form.formState.errors;

  const subtotal = (items ?? []).reduce((s, i) => s + toNumber(i?.quantity) * toNumber(i?.unit_price), 0);
  const total = Math.max(0, subtotal + toNumber(shipping) - toNumber(discount));

  const onProductChange = (index: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (p) {
      if (!form.getValues(`items.${index}.title`)) form.setValue(`items.${index}.title`, p.name, { shouldDirty: true });
      if (p.base_price != null && !form.getValues(`items.${index}.unit_price`)) {
        form.setValue(`items.${index}.unit_price`, String(p.base_price), { shouldDirty: true, shouldValidate: true });
      }
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const res = await createManualOrderAction({
      ...values,
      order_date: startOfDayIso(values.order_date),
      dispatch_by: endOfDayIso(values.dispatch_by),
    });
    if (res.ok && res.data) {
      toast({ title: "Manual order created", description: "Production jobs were created for each item." });
      router.push(`/orders/${res.data.id}`);
    } else if (!res.ok) {
      setServerError(res.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" noValidate>
      <div className="min-w-0 space-y-5">
        <FormError message={serverError} />
        <Card>
          <CardHeader icon={<Package />} title="Items" description="Choose a catalogue product or enter a custom item." />
          <CardContent className="space-y-3">
            {fields.map((field, index) => {
              const itemErrors = errors.items?.[index];
              return (
                <div key={field.id} className="rounded-xl border border-line bg-subtle/50 p-3 sm:p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-faint">Item {index + 1}</span>
                    {fields.length > 1 ? (
                      <Button variant="ghost" size="xs" onClick={() => remove(index)} aria-label={`Remove item ${index + 1}`}>
                        <Trash2 /> Remove
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Product" htmlFor={`items.${index}.product_id`}>
                      <Select
                        id={`items.${index}.product_id`}
                        {...form.register(`items.${index}.product_id`, { onChange: (e) => onProductChange(index, e.target.value) })}
                      >
                        <option value="">Custom item (not in catalogue)</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.sku}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Item name" htmlFor={`items.${index}.title`} error={itemErrors?.title?.message}>
                      <Input id={`items.${index}.title`} placeholder="Defaults to product name" {...form.register(`items.${index}.title`)} />
                    </Field>
                    <Field label="Variant" htmlFor={`items.${index}.variant_title`}>
                      <Input id={`items.${index}.variant_title`} placeholder="e.g. Large / Sage green" {...form.register(`items.${index}.variant_title`)} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Quantity" htmlFor={`items.${index}.quantity`} error={itemErrors?.quantity?.message} required>
                        <Input id={`items.${index}.quantity`} type="number" min={1} step={1} inputMode="numeric" {...form.register(`items.${index}.quantity`)} />
                      </Field>
                      <Field label={`Unit price (${currency})`} htmlFor={`items.${index}.unit_price`} error={itemErrors?.unit_price?.message} required>
                        <Input id={`items.${index}.unit_price`} type="number" min={0} step="0.01" inputMode="decimal" {...form.register(`items.${index}.unit_price`)} />
                      </Field>
                    </div>
                    <Field label="Personalisation" htmlFor={`items.${index}.personalisation`} className="sm:col-span-2">
                      <Textarea id={`items.${index}.personalisation`} rows={2} placeholder="Names, text, colours requested…" {...form.register(`items.${index}.personalisation`)} />
                    </Field>
                  </div>
                </div>
              );
            })}
            {errors.items?.message || errors.items?.root?.message ? (
              <p className="text-xs font-medium text-red-600">{errors.items?.message ?? errors.items?.root?.message}</p>
            ) : null}
            <Button
              variant="outline"
              onClick={() => append({ product_id: "", title: "", sku: "", variant_title: "", quantity: 1, unit_price: "", personalisation: "" })}
            >
              <Plus /> Add another item
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader icon={<User />} title="Customer" />
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="customer_name" error={errors.customer_name?.message} required>
              <Input id="customer_name" autoComplete="off" {...form.register("customer_name")} />
            </Field>
            <Field label="Email" htmlFor="customer_email" error={errors.customer_email?.message} hint="Used to match an existing customer record.">
              <Input id="customer_email" type="email" autoComplete="off" {...form.register("customer_email")} />
            </Field>
            <Field label="Phone" htmlFor="customer_phone">
              <Input id="customer_phone" type="tel" {...form.register("customer_phone")} />
            </Field>
            <Field label="Reference" htmlFor="external_order_number" hint="Optional — e.g. invoice or craft-fair ticket number.">
              <Input id="external_order_number" {...form.register("external_order_number")} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader icon={<MapPin />} title="Delivery address" />
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Recipient name" htmlFor="addr-name" className="sm:col-span-2">
              <Input id="addr-name" {...form.register("shipping_address.name")} />
            </Field>
            <Field label="Address line 1" htmlFor="addr-line1">
              <Input id="addr-line1" {...form.register("shipping_address.line1")} />
            </Field>
            <Field label="Address line 2" htmlFor="addr-line2">
              <Input id="addr-line2" {...form.register("shipping_address.line2")} />
            </Field>
            <Field label="Town / city" htmlFor="addr-city">
              <Input id="addr-city" {...form.register("shipping_address.city")} />
            </Field>
            <Field label="County / region" htmlFor="addr-region">
              <Input id="addr-region" {...form.register("shipping_address.region")} />
            </Field>
            <Field label="Postcode" htmlFor="addr-postal">
              <Input id="addr-postal" {...form.register("shipping_address.postal_code")} />
            </Field>
            <Field label="Country code" htmlFor="addr-country" error={errors.shipping_address?.country_code?.message} hint="Two letters, e.g. GB">
              <Input id="addr-country" maxLength={2} className="uppercase" {...form.register("shipping_address.country_code")} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="xl:sticky xl:top-24">
          <CardHeader icon={<Settings2 />} title="Order details" />
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Order date" htmlFor="order_date" error={errors.order_date?.message}>
                <Input id="order_date" type="date" {...form.register("order_date")} />
              </Field>
              <Field label="Dispatch by" htmlFor="dispatch_by" error={errors.dispatch_by?.message}>
                <Input id="dispatch_by" type="date" {...form.register("dispatch_by")} />
              </Field>
              <Field label="Payment" htmlFor="payment_status">
                <Select id="payment_status" {...form.register("payment_status")}>
                  {PAYMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>{PAYMENT_STATUS[s].label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority" htmlFor="priority">
                <Select id="priority" {...form.register("priority")}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{PRIORITY[p].label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Shipping charged" htmlFor="shipping_total" error={errors.shipping_total?.message}>
                <Input id="shipping_total" type="number" min={0} step="0.01" inputMode="decimal" {...form.register("shipping_total")} />
              </Field>
              <Field label="Discount" htmlFor="discount_total" error={errors.discount_total?.message}>
                <Input id="discount_total" type="number" min={0} step="0.01" inputMode="decimal" {...form.register("discount_total")} />
              </Field>
            </div>
            <Field label="Shipping method" htmlFor="shipping_method">
              <Input id="shipping_method" placeholder="e.g. Royal Mail Tracked 48" {...form.register("shipping_method")} />
            </Field>
            <Field label="Customer note" htmlFor="customer_note">
              <Textarea id="customer_note" rows={2} {...form.register("customer_note")} />
            </Field>
            <Field label="Production notes" htmlFor="production_notes">
              <Textarea id="production_notes" rows={2} {...form.register("production_notes")} />
            </Field>

            <div className="space-y-1.5 rounded-lg bg-subtle p-3 text-sm ring-1 ring-line">
              <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular">{formatCurrency(subtotal, currency)}</span></div>
              <div className="flex justify-between text-muted"><span>Shipping</span><span className="tabular">{formatCurrency(toNumber(shipping), currency)}</span></div>
              {toNumber(discount) ? (
                <div className="flex justify-between text-muted"><span>Discount</span><span className="tabular">−{formatCurrency(toNumber(discount), currency)}</span></div>
              ) : null}
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-ink"><span>Total</span><span className="tabular">{formatCurrency(total, currency)}</span></div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button type="submit" size="lg" loading={form.formState.isSubmitting}>Create order</Button>
              <ButtonLink href="/orders" variant="ghost">Cancel</ButtonLink>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
