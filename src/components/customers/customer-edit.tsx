"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Merge, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { mergeCustomersAction, updateCustomerAction } from "@/lib/actions/customers";

type Values = { display_name: string; email: string; phone: string; notes: string };

export function EditCustomerButton({ customer }: { customer: { id: string; display_name: string; email: string | null; phone: string | null; notes: string | null } }) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const form = useForm<Values>({
    defaultValues: { display_name: customer.display_name, email: customer.email ?? "", phone: customer.phone ?? "", notes: customer.notes ?? "" },
  });
  const submit = form.handleSubmit(async (v) => {
    const res = await updateCustomerAction({ id: customer.id, ...v });
    if (res.ok) {
      toast({ title: "Customer updated" });
      setOpen(false);
      router.refresh();
    } else setError(res.error);
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Pencil /> Edit</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Edit customer" description="Marketplace syncs don’t overwrite these details.">
          <form onSubmit={submit}>
            <DialogBody>
              <FormError message={error} />
              <Field label="Name" htmlFor="c-name"><Input id="c-name" {...form.register("display_name")} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email" htmlFor="c-email"><Input id="c-email" type="email" {...form.register("email")} /></Field>
                <Field label="Phone" htmlFor="c-phone"><Input id="c-phone" type="tel" {...form.register("phone")} /></Field>
              </div>
              <Field label="Customer notes" htmlFor="c-notes" hint="Preferences, repeat requests, wholesale terms…">
                <Textarea id="c-notes" rows={4} {...form.register("notes")} />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loading={form.formState.isSubmitting}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MergeCustomerButton({
  targetId,
  targetName,
  candidates,
}: {
  targetId: string;
  targetName: string;
  candidates: { id: string | null; display_name: string | null; email: string | null; order_count: number | null; sources: string[] | null }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [sourceId, setSourceId] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const toast = useToast();
  const router = useRouter();
  if (!candidates.length) return null;
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}><Merge /> Merge duplicate</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Merge a duplicate customer" description={`Move another record’s orders, marketplace IDs, addresses and notes into “${targetName}”, then delete it.`}>
          <DialogBody>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              Only merge when you’re sure both records are the same person — a matching name alone isn’t proof. This can’t be undone.
            </p>
            <Field label="Record to merge in" htmlFor="merge-src">
              <Select id="merge-src" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Choose a customer…</option>
                {candidates.map((c) => (
                  <option key={c.id!} value={c.id!}>
                    {c.display_name} · {c.email ?? "no email"} · {c.order_count} orders ({(c.sources ?? []).join(", ") || "—"})
                  </option>
                ))}
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={!sourceId}
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await mergeCustomersAction(targetId, sourceId);
                  toast(res.ok ? { title: "Customers merged" } : { title: res.error, tone: "error" });
                  if (res.ok) {
                    setOpen(false);
                    router.refresh();
                  }
                })
              }
            >
              Merge records
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
