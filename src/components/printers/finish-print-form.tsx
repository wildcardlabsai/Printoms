"use client";

import * as React from "react";
import { CircleCheck, CircleX, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { finishPrintAction } from "@/lib/actions/production";
import { FAILURE_REASONS } from "@/lib/constants";
import { cn, formatGrams } from "@/lib/utils";

export type RunUnit = { id: string; unit_number: number; label?: string | null };

export type FilamentOption = { id: string; brand: string | null; material: string | null; colour: string | null; remaining_g: number | null };

export function FinishPrintForm({
  runId,
  defaultOutcome = "success",
  estimatedGrams,
  filament,
  preferredMaterial,
  runUnits = [],
  onDone,
}: {
  runId: string;
  defaultOutcome?: "success" | "failure";
  estimatedGrams?: number | null;
  filament: FilamentOption[];
  preferredMaterial?: string | null;
  /** Units on this plate. With more than one, a partial outcome can be recorded. */
  runUnits?: RunUnit[];
  onDone: () => void;
}) {
  const toast = useToast();
  const multi = runUnits.length > 1;
  const [outcome, setOutcome] = React.useState<"success" | "failure" | "partial">(defaultOutcome);
  const [failedUnits, setFailedUnits] = React.useState<string[]>([]);
  const [reason, setReason] = React.useState("");
  const [customReason, setCustomReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [requeue, setRequeue] = React.useState(true);
  const preferred = filament.find((f) => preferredMaterial && f.material === preferredMaterial);
  const [stockId, setStockId] = React.useState(defaultOutcome === "success" ? (preferred?.id ?? "") : "");
  const [grams, setGrams] = React.useState(defaultOutcome === "success" && estimatedGrams ? String(Math.round(Number(estimatedGrams))) : "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const failureReason = reason === "__other" ? customReason : reason;
      if (outcome === "partial" && (failedUnits.length === 0 || failedUnits.length === runUnits.length)) {
        setError(failedUnits.length === 0 ? "Tick the units that failed." : "All units failed — choose “All failed” instead.");
        return;
      }
      const res = await finishPrintAction({
        run_id: runId,
        succeeded: outcome !== "failure",
        failure_reason: outcome !== "success" ? failureReason : null,
        failed_unit_ids: outcome === "partial" ? failedUnits : null,
        notes,
        requeue,
        filament_stock_id: stockId || null,
        filament_grams: stockId ? grams : null,
      });
      if (res.ok) {
        toast({ title: res.message ?? "Recorded" });
        onDone();
      } else setError(res.error);
    });

  return (
    <div className="space-y-4">
      <div className={cn("grid gap-2", multi ? "grid-cols-3" : "grid-cols-2")}>
        {(
          [
            ["success", multi ? "All succeeded" : "Print succeeded", CircleCheck, "border-brand-500 bg-brand-50 text-brand-800"],
            ...(multi ? ([["partial", "Some failed", CircleSlash, "border-amber-400 bg-amber-50 text-amber-900"]] as const) : []),
            ["failure", multi ? "All failed" : "Print failed", CircleX, "border-red-400 bg-red-50 text-red-800"],
          ] as const
        ).map(([value, label, Icon, activeCls]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setOutcome(value);
              setFailedUnits([]);
              if (value === "failure") {
                setGrams("");
                setStockId("");
              } else {
                if (estimatedGrams) setGrams(String(Math.round(Number(estimatedGrams))));
                if (!stockId && preferred) setStockId(preferred.id);
              }
            }}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-semibold transition",
              outcome === value ? activeCls : "border-line text-muted hover:border-line-strong",
            )}
            aria-pressed={outcome === value}
          >
            <Icon className="size-[18px]" /> {label}
          </button>
        ))}
      </div>

      {outcome === "partial" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-[13px] font-medium text-ink">Which units failed?</p>
          <p className="mt-0.5 text-xs text-muted">The others are recorded as printed. Failed units are reprinted on the same job.</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {runUnits.map((u) => (
              <label key={u.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-sm ring-1 ring-line">
                <Checkbox
                  checked={failedUnits.includes(u.id)}
                  onChange={(e) => setFailedUnits((list) => (e.target.checked ? [...list, u.id] : list.filter((x) => x !== u.id)))}
                />
                <span className="truncate">Unit {u.unit_number}{u.label ? ` · ${u.label}` : ""}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {outcome !== "success" ? (
        <div className="space-y-3 rounded-xl border border-red-100 bg-red-50/40 p-3">
          <Field label="What went wrong?" htmlFor="failure-reason" required>
            <Select id="failure-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason…</option>
              {FAILURE_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="__other">Other…</option>
            </Select>
          </Field>
          {reason === "__other" ? (
            <Input value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="Describe the failure" aria-label="Failure description" />
          ) : null}
          <label className="flex items-start gap-2 text-sm text-ink-2">
            <Checkbox checked={requeue} onChange={(e) => setRequeue(e.target.checked)} className="mt-0.5" />
            <span>
              Keep the job in this printer’s queue for a reprint
              <span className="block text-xs text-muted">The same job is reprinted — no duplicate order is created.</span>
            </span>
          </label>
        </div>
      ) : null}

      <div className="rounded-xl border border-line p-3">
        <p className="text-[13px] font-medium text-ink">Filament used {outcome === "failure" ? "(wasted)" : ""}</p>
        <p className="mt-0.5 text-xs text-muted">
          Optional. Stock is only deducted when you record actual consumption here.
          {estimatedGrams ? ` Estimate for this job: ${formatGrams(estimatedGrams)}.` : ""}
        </p>
        <div className="mt-3 grid grid-cols-[1fr_110px] gap-2">
          <Select value={stockId} onChange={(e) => setStockId(e.target.value)} aria-label="Filament spool">
            <option value="">Don’t record now</option>
            {filament.map((f) => (
              <option key={f.id} value={f.id}>
                {f.brand} {f.material} · {f.colour} ({formatGrams(f.remaining_g)} left)
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min={0}
            step="0.1"
            inputMode="decimal"
            placeholder="grams"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            disabled={!stockId}
            aria-label="Grams used"
          />
        </div>
      </div>

      <Field label="Notes" htmlFor="run-notes">
        <Textarea id="run-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional observations" />
      </Field>
      <FormError message={error} />
      <Button className="w-full" size="lg" variant={outcome === "success" ? "primary" : "danger"} onClick={submit} loading={pending}>
        {outcome === "success" ? "Record success" : outcome === "partial" ? "Record partial result" : "Record failure"}
      </Button>
    </div>
  );
}
