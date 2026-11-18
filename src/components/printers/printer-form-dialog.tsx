"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { savePrinterAction } from "@/lib/actions/printers";
import { printerSchema } from "@/lib/validation/printers";
import { MATERIALS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type In = z.input<typeof printerSchema>;
type Out = z.output<typeof printerSchema>;

export type PrinterFormValues = Partial<{
  name: string;
  manufacturer: string;
  model: string;
  printer_type: string;
  build_volume_x_mm: number | null;
  build_volume_y_mm: number | null;
  build_volume_z_mm: number | null;
  nozzle_size_mm: number | null;
  supported_materials: string[];
  has_multi_material: boolean;
  maintenance_notes: string | null;
  is_active: boolean;
}>;

export function PrinterFormDialog({
  printerId,
  initial,
  trigger,
}: {
  printerId?: string;
  initial?: PrinterFormValues;
  trigger: (open: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(printerSchema) as Resolver<In, unknown, Out>,
    defaultValues: {
      name: initial?.name ?? "",
      manufacturer: initial?.manufacturer ?? "",
      model: initial?.model ?? "",
      printer_type: initial?.printer_type ?? "FDM",
      build_volume_x_mm: initial?.build_volume_x_mm ?? "",
      build_volume_y_mm: initial?.build_volume_y_mm ?? "",
      build_volume_z_mm: initial?.build_volume_z_mm ?? "",
      nozzle_size_mm: initial?.nozzle_size_mm ?? 0.4,
      supported_materials: initial?.supported_materials ?? ["PLA", "PLA+", "PETG"],
      has_multi_material: initial?.has_multi_material ?? false,
      maintenance_notes: initial?.maintenance_notes ?? "",
      is_active: initial?.is_active ?? true,
    },
  });
  const materials = useWatch({ control: form.control, name: "supported_materials" }) ?? [];
  const errors = form.formState.errors;

  const toggleMaterial = (m: string) => {
    const set = new Set(materials);
    if (set.has(m)) set.delete(m);
    else set.add(m);
    form.setValue("supported_materials", Array.from(set), { shouldDirty: true });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await savePrinterAction(printerId ?? null, values);
    if (res.ok) {
      toast({ title: res.message ?? "Saved" });
      setOpen(false);
      if (!printerId) form.reset();
      router.refresh();
    } else setError(res.error);
  });

  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" title={printerId ? "Edit printer" : "Add printer"} description="Printer details are used for job assignment and capacity planning.">
          <form onSubmit={onSubmit} noValidate>
            <DialogBody>
              <FormError message={error} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor="p-name" error={errors.name?.message} required className="sm:col-span-2">
                  <Input id="p-name" placeholder="e.g. Bambu Lab A1 #2" {...form.register("name")} />
                </Field>
                <Field label="Manufacturer" htmlFor="p-man" error={errors.manufacturer?.message} required>
                  <Input id="p-man" {...form.register("manufacturer")} />
                </Field>
                <Field label="Model" htmlFor="p-model" error={errors.model?.message} required>
                  <Input id="p-model" {...form.register("model")} />
                </Field>
                <Field label="Printer type" htmlFor="p-type">
                  <Input id="p-type" placeholder="FDM, Resin…" {...form.register("printer_type")} />
                </Field>
                <Field label="Nozzle size (mm)" htmlFor="p-nozzle" error={errors.nozzle_size_mm?.message}>
                  <Input id="p-nozzle" type="number" step="0.05" min={0.1} {...form.register("nozzle_size_mm")} />
                </Field>
              </div>
              <Field label="Build volume (mm)" hint="Width × depth × height">
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" placeholder="X" aria-label="Build volume X" {...form.register("build_volume_x_mm")} />
                  <Input type="number" placeholder="Y" aria-label="Build volume Y" {...form.register("build_volume_y_mm")} />
                  <Input type="number" placeholder="Z" aria-label="Build volume Z" {...form.register("build_volume_z_mm")} />
                </div>
              </Field>
              <Field label="Supported materials">
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set([...MATERIALS, ...materials])).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => toggleMaterial(m)}
                      aria-pressed={materials.includes(m)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                        materials.includes(m) ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line text-muted hover:border-line-strong",
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </Field>
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <Checkbox {...form.register("has_multi_material")} /> Multi-material / multi-colour capable
              </label>
              <Field label="Maintenance notes" htmlFor="p-notes">
                <Textarea id="p-notes" rows={3} placeholder="Nozzle changes, belt tension, firmware…" {...form.register("maintenance_notes")} />
              </Field>
              {printerId ? (
                <label className="flex items-center gap-2 text-sm text-ink-2">
                  <Checkbox {...form.register("is_active")} /> Active (uncheck to retire this printer — history is kept)
                </label>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loading={form.formState.isSubmitting}>{printerId ? "Save printer" : "Add printer"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
