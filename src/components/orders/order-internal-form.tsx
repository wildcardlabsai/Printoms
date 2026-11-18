"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { updateOrderInternalAction } from "@/lib/actions/orders";
import { PRIORITIES, PRIORITY, type PriorityLevel } from "@/lib/constants";
import { endOfDayIso, toDateInput } from "@/lib/dates";

type Values = { priority: PriorityLevel; dispatch_by: string; production_notes: string; shipping_method: string };

export function OrderInternalForm({
  orderId,
  initial,
  canWrite,
  marketplaceDeadline,
}: {
  orderId: string;
  initial: { priority: PriorityLevel; dispatch_by: string | null; production_notes: string | null; shipping_method: string | null };
  canWrite: boolean;
  marketplaceDeadline?: string | null;
}) {
  const toast = useToast();
  const defaults: Values = {
    priority: initial.priority,
    dispatch_by: toDateInput(initial.dispatch_by),
    production_notes: initial.production_notes ?? "",
    shipping_method: initial.shipping_method ?? "",
  };
  const form = useForm<Values>({ defaultValues: defaults });
  const [pending, startTransition] = React.useTransition();

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await updateOrderInternalAction({
        order_id: orderId,
        priority: values.priority,
        dispatch_by: endOfDayIso(values.dispatch_by),
        production_notes: values.production_notes,
        shipping_method: values.shipping_method,
      });
      if (res.ok) {
        toast({ title: "Order updated" });
        form.reset(values);
      } else toast({ title: res.error, tone: "error" });
    }),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" disabled={!canWrite} {...form.register("priority")}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY[p].label}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Dispatch by"
          htmlFor="dispatch_by"
          hint={marketplaceDeadline ? `Marketplace: ${new Date(marketplaceDeadline).toLocaleDateString("en-GB")}` : undefined}
        >
          <Input id="dispatch_by" type="date" disabled={!canWrite} {...form.register("dispatch_by")} />
        </Field>
      </div>
      <Field label="Shipping method" htmlFor="shipping_method">
        <Input id="shipping_method" disabled={!canWrite} placeholder="e.g. Royal Mail Tracked 48" {...form.register("shipping_method")} />
      </Field>
      <Field label="Production notes" htmlFor="production_notes" hint="Internal — never overwritten by marketplace sync.">
        <Textarea id="production_notes" rows={4} disabled={!canWrite} placeholder="Colours, finishing, packing instructions…" {...form.register("production_notes")} />
      </Field>
      {canWrite ? (
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={pending} disabled={!form.formState.isDirty}>
            Save changes
          </Button>
        </div>
      ) : null}
    </form>
  );
}
