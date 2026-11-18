"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";

/**
 * Confirmation dialog for an administrative full resynchronisation.
 * Explains exactly what is and isn't updated before anything runs.
 */
export function ResyncDialog({
  provider,
  name,
  options,
  maxDays,
  pendingFrom,
  open,
  onOpenChange,
}: {
  provider: "etsy" | "shopify";
  name: string;
  options: number[];
  maxDays: number;
  pendingFrom: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [days, setDays] = React.useState(String(options.includes(30) ? 30 : (options.at(-1) ?? 30)));
  const [resume, setResume] = React.useState(Boolean(pendingFrom));
  const [confirmed, setConfirmed] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/${provider}/resync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resume && pendingFrom ? { confirm: true, resume: true } : { confirm: true, days: Number(days) }),
      });
      const body = (await res.json()) as { ok: boolean; message?: string; error?: string; status?: string };
      if (body.ok) {
        toast({ title: `${name} resync ${body.status === "partial" ? "partly completed" : "complete"}`, description: body.message });
        onOpenChange(false);
        setConfirmed(false);
        router.refresh();
      } else setError(body.error ?? body.message ?? "Resync failed");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setRunning(false);
    }
  };

  const updated = [
    "Customer name, email and delivery address (unless the marketplace now withholds them)",
    "Totals, payment and marketplace status, shipping method, customer note",
    "Line item titles, variants, quantities and personalisation",
    "Cancellations and fulfilments made directly on the marketplace",
    "New line items (a production job is created for each)",
  ];
  const kept = [
    "Internal notes, production notes, priority and dispatch-by date",
    "Production stages, printer assignments and print history",
    "Product links you set manually, packing, shipments and tracking",
    "Filament records and customer notes",
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent
        size="lg"
        title={`Full resync from ${name}`}
        description="Re-reads orders from the marketplace and re-applies their marketplace data. Orders are matched by marketplace ID, so nothing is duplicated."
      >
        <DialogBody>
          <FormError message={error} />
          {pendingFrom ? (
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-sm text-amber-900">
              <Checkbox checked={resume} onChange={(e) => setResume(e.target.checked)} className="mt-0.5" />
              <span>
                Resume the paused resync from {formatDateTime(pendingFrom)}
                <span className="block text-xs">Untick to start a new resync window instead.</span>
              </span>
            </label>
          ) : null}
          {!resume || !pendingFrom ? (
            <Field
              label="Orders updated in the last"
              htmlFor={`resync-days-${provider}`}
              hint={
                provider === "shopify" && maxDays < 365
                  ? `Shopify only provides ${maxDays} days of order history without the read_all_orders permission.`
                  : undefined
              }
            >
              <Select id={`resync-days-${provider}`} value={days} onChange={(e) => setDays(e.target.value)}>
                {options.map((d) => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <History className="size-4 text-brand-600" /> Updated from {name}
              </p>
              <ul className="space-y-1.5 text-xs text-ink-2">
                {updated.map((t) => (
                  <li key={t} className="flex gap-1.5"><CircleCheck className="mt-px size-3.5 shrink-0 text-brand-600" /> {t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-line p-3">
              <p className="mb-2 text-[13px] font-semibold text-ink">Never changed</p>
              <ul className="space-y-1.5 text-xs text-ink-2">
                {kept.map((t) => (
                  <li key={t} className="flex gap-1.5"><CircleX className="mt-px size-3.5 shrink-0 text-faint" /> {t}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted">
            Jobs that haven’t started printing take the marketplace quantity if it changed. An order cancelled or shipped on the
            marketplace is updated here to match. Large windows may pause after about four minutes — you can resume from this dialog.
          </p>
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I understand what will be updated
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>Cancel</Button>
          <Button onClick={start} disabled={!confirmed} loading={running}>
            {resume && pendingFrom ? "Resume resync" : "Start full resync"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
