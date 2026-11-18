"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { Progress } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { recordQcFailureAction } from "@/lib/actions/production";
import type { JobDetail } from "@/lib/data/production";
import type { Tone } from "@/lib/constants";

type Unit = JobDetail["units"][number];

const UNIT_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "To print", tone: "neutral" },
  printing: { label: "Printing", tone: "amber" },
  printed: { label: "Printed", tone: "blue" },
  passed: { label: "Passed QC", tone: "green" },
  cancelled: { label: "Cancelled", tone: "slate" },
  surplus: { label: "Surplus", tone: "orange" },
};

/** Physical units of a job: progress, per-unit status and QC failures. */
export function JobUnits({
  jobId,
  quantity,
  units,
  currentPersonalisation,
  canWrite,
  onChanged,
}: {
  jobId: string;
  quantity: number;
  units: Unit[];
  currentPersonalisation: string | null;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [qcOpen, setQcOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const active = units.filter((u) => ["pending", "printing", "printed", "passed"].includes(u.status));
  const done = active.filter((u) => u.status === "printed" || u.status === "passed").length;
  const printedUnits = units.filter((u) => u.status === "printed" || u.status === "passed");

  const submitQc = () =>
    startTransition(async () => {
      setError(null);
      const res = await recordQcFailureAction({ job_id: jobId, unit_ids: selected, reason });
      if (res.ok) {
        toast({ title: res.message ?? "Recorded" });
        setQcOpen(false);
        setSelected([]);
        setReason("");
        onChanged();
      } else setError(res.error);
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Progress value={quantity ? (done / quantity) * 100 : 0} className="flex-1" />
        <span className="text-xs font-medium text-ink-2 tabular whitespace-nowrap">
          {done} / {quantity} printed
        </span>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {units.map((u) => {
          const m = UNIT_STATUS[u.status] ?? UNIT_STATUS.pending!;
          const stale =
            u.printed_personalisation != null &&
            (u.status === "printed" || u.status === "passed") &&
            (currentPersonalisation ?? "") !== (u.printed_personalisation ?? "");
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px]">
              <span className="w-14 shrink-0 font-medium text-ink">Unit {u.unit_number}</span>
              <Badge tone={m.tone} size="sm">{m.label}</Badge>
              {u.failed_attempts ? <span className="text-xs text-red-600">{u.failed_attempts} failed</span> : null}
              {u.completed_without_print ? <span className="text-xs text-muted">completed without a print run</span> : null}
              {u.printed_personalisation ? (
                <span className="flex min-w-0 items-center gap-1 text-xs text-violet-800">
                  <Sparkles className="size-3 shrink-0" />
                  <span className="truncate">printed as “{u.printed_personalisation.split("\n")[0]}”</span>
                </span>
              ) : null}
              {stale ? <Badge tone="red" size="sm">Personalisation changed since printing</Badge> : null}
              {u.status_reason && (u.status === "pending" || u.status === "surplus" || u.status === "cancelled") ? (
                <span className="w-full truncate text-xs text-muted">{u.status_reason}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canWrite && printedUnits.length ? (
        qcOpen ? (
          <div className="space-y-3 rounded-xl border border-red-100 bg-red-50/40 p-3">
            <FormError message={error} />
            <p className="text-[13px] font-medium text-ink">Which units failed quality check?</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {printedUnits.map((u) => (
                <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-sm ring-1 ring-line">
                  <Checkbox
                    checked={selected.includes(u.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, u.id] : s.filter((x) => x !== u.id)))}
                  />
                  Unit {u.unit_number}
                </label>
              ))}
            </div>
            <Field label="Reason" htmlFor={`qc-${jobId}`} required>
              <Input id={`qc-${jobId}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. layer lines, wrong text" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setQcOpen(false)}>Cancel</Button>
              <Button variant="danger" size="sm" loading={pending} disabled={!selected.length || !reason.trim()} onClick={submitQc}>
                Send for reprint
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setQcOpen(true)}>Record QC failure</Button>
        )
      ) : null}
    </div>
  );
}
