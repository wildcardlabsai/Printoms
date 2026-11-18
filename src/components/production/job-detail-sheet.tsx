"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ExternalLink, FileBox, LoaderCircle, Play, Printer, Sparkles, StickyNote, Timer } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PrintRunBadge, PriorityBadge, StageBadge, SourceBadge } from "@/components/ui/status-badges";
import { useToast } from "@/components/ui/toast";
import { ActivityTimeline } from "@/components/orders/activity-timeline";
import { FinishPrintForm } from "@/components/printers/finish-print-form";
import { assignPrinterAction, getJobDetailAction, startPrintAction, updateJobAction } from "@/lib/actions/production";
import { MATERIALS, PRINTER_STATUS, PRIORITIES, PRIORITY, type PriorityLevel } from "@/lib/constants";
import { endOfDayIso, toDateInput } from "@/lib/dates";
import { formatDateTime, formatGrams, formatMinutes, formatRelative } from "@/lib/utils";
import type { JobDetail, PrinterOption } from "@/lib/data/production";

type EditValues = {
  priority: PriorityLevel;
  estimated_print_minutes: string;
  material: string;
  colour: string;
  estimated_filament_g: string;
  print_requirements: string;
  notes: string;
  due_date: string;
};

function Section({ title, icon, children, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink [&_svg]:size-4 [&_svg]:text-faint">
          {icon} {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function JobEditForm({ detail, canWrite, onSaved }: { detail: JobDetail; canWrite: boolean; onSaved: () => void }) {
  const toast = useToast();
  const j = detail.job;
  const form = useForm<EditValues>({
    defaultValues: {
      priority: j.priority,
      estimated_print_minutes: j.estimated_print_minutes?.toString() ?? "",
      material: j.material ?? "",
      colour: j.colour ?? "",
      estimated_filament_g: j.estimated_filament_g?.toString() ?? "",
      print_requirements: j.print_requirements ?? "",
      notes: j.notes ?? "",
      due_date: toDateInput(j.due_date),
    },
  });
  const [pending, startTransition] = React.useTransition();
  const submit = form.handleSubmit((v) =>
    startTransition(async () => {
      const res = await updateJobAction({ job_id: j.id, ...v, due_date: endOfDayIso(v.due_date) });
      if (res.ok) {
        toast({ title: "Job updated" });
        form.reset(v);
        onSaved();
      } else toast({ title: res.error, tone: "error" });
    }),
  );
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Priority" htmlFor="j-priority">
          <Select id="j-priority" disabled={!canWrite} {...form.register("priority")}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY[p].label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="j-due">
          <Input id="j-due" type="date" disabled={!canWrite} {...form.register("due_date")} />
        </Field>
        <Field label="Est. print time (min)" htmlFor="j-mins">
          <Input id="j-mins" type="number" min={0} inputMode="numeric" disabled={!canWrite} {...form.register("estimated_print_minutes")} />
        </Field>
        <Field label="Material" htmlFor="j-material">
          <Input id="j-material" list="materials" disabled={!canWrite} {...form.register("material")} />
        </Field>
        <Field label="Colour" htmlFor="j-colour">
          <Input id="j-colour" disabled={!canWrite} {...form.register("colour")} />
        </Field>
        <Field label="Est. filament (g)" htmlFor="j-grams">
          <Input id="j-grams" type="number" min={0} step="0.1" inputMode="decimal" disabled={!canWrite} {...form.register("estimated_filament_g")} />
        </Field>
      </div>
      <datalist id="materials">
        {MATERIALS.map((m) => <option key={m} value={m} />)}
      </datalist>
      <Field label="Print requirements" htmlFor="j-req" hint="Supports, orientation, layer height, multi-colour mapping…">
        <Textarea id="j-req" rows={3} disabled={!canWrite} {...form.register("print_requirements")} />
      </Field>
      <Field label="Production notes" htmlFor="j-notes">
        <Textarea id="j-notes" rows={2} disabled={!canWrite} {...form.register("notes")} />
      </Field>
      {canWrite ? (
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={pending} disabled={!form.formState.isDirty}>Save job</Button>
        </div>
      ) : null}
    </form>
  );
}

export function JobDetailSheet({
  jobId,
  onClose,
  printers,
  canWrite,
}: {
  jobId: string | null;
  onClose: () => void;
  printers: PrinterOption[];
  canWrite: boolean;
}) {
  return (
    <Dialog open={jobId !== null} onOpenChange={(o) => !o && onClose()}>
      {jobId ? <JobDetailContent key={jobId} jobId={jobId} printers={printers} canWrite={canWrite} /> : null}
    </Dialog>
  );
}

function JobDetailContent({ jobId, printers, canWrite }: { jobId: string; printers: PrinterOption[]; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [detail, setDetail] = React.useState<JobDetail | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [printerId, setPrinterId] = React.useState("");
  const [finishing, setFinishing] = React.useState<"success" | "failure" | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    getJobDetailAction(jobId).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        setDetail(res.data);
        setPrinterId((current) => current || res.data!.job.printer_id || "");
      } else if (!res.ok) setLoadError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId, version]);

  const loading = !detail && !loadError;
  const refresh = () => {
    setVersion((v) => v + 1);
    router.refresh();
  };

  const runAction = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast({ title: res.message ?? "Done" });
        refresh();
      } else toast({ title: res.error ?? "Something went wrong", tone: "error" });
    });

  const job = detail?.job;
  const activeRun = detail?.runs.find((r) => r.status === "printing");
  const canStart = job && !activeRun && ["new_order", "awaiting_preparation", "ready_to_print", "quality_check"].includes(job.stage);
  const variants = Array.isArray(job?.item?.variant_details) ? (job!.item!.variant_details as { name?: string; value?: string }[]) : [];

  return (
      <DialogContent
        size="xl"
        title={job ? `${job.job_number} · ${job.product?.name ?? job.item?.title ?? "Job"}` : "Production job"}
        description={job?.order ? `Order ${job.order.order_number} for ${job.order.customer_name}` : undefined}
      >
        {loading && !detail ? (
          <div className="flex items-center justify-center py-20 text-muted">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : loadError ? (
          <p className="p-6 text-sm text-red-600">{loadError}</p>
        ) : job && detail ? (
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6 px-5 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <StageBadge stage={job.stage} />
                <PriorityBadge priority={job.priority} />
                {job.order ? <SourceBadge source={job.order.source} /> : null}
                <span className="text-xs text-muted">Attempt {job.attempt_count || 0}{job.failed_attempts ? ` · ${job.failed_attempts} failed` : ""}</span>
                {job.order ? (
                  <Link href={`/orders/${job.order.id}`} className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
                    View order <ExternalLink className="size-3.5" />
                  </Link>
                ) : null}
              </div>

              <Section title="What to make">
                <div className="rounded-xl border border-line bg-subtle/60 p-4">
                  <p className="text-[15px] font-semibold text-ink">
                    <span className="text-brand-700">{job.quantity}×</span> {job.item?.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[job.item?.sku && `SKU ${job.item.sku}`, job.item?.variant_title].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {variants.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {variants.map((v, i) => (
                        <span key={i} className="rounded-md bg-white px-1.5 py-0.5 text-xs ring-1 ring-line">
                          <span className="text-muted">{v.name}:</span> {v.value}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {job.item?.personalisation ? (
                    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-700">
                        <Sparkles className="size-3" /> Personalisation
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-wrap text-violet-950">{job.item.personalisation}</p>
                    </div>
                  ) : null}
                  {job.product?.production_instructions ? (
                    <div className="mt-3 text-sm">
                      <p className="text-xs font-semibold text-muted">Product instructions</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-ink-2">{job.product.production_instructions}</p>
                    </div>
                  ) : null}
                  {job.product?.model_file_ref ? (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-2">
                      <FileBox className="size-3.5 text-faint" /> Model file: <span className="font-mono">{job.product.model_file_ref}</span>
                    </p>
                  ) : null}
                </div>
                {job.order?.production_notes || job.order?.customer_note ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {job.order.production_notes ? (
                      <div className="rounded-lg border border-line p-3 text-sm">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted"><StickyNote className="size-3.5" /> Order production notes</p>
                        <p className="mt-1 whitespace-pre-wrap text-ink-2">{job.order.production_notes}</p>
                      </div>
                    ) : null}
                    {job.order.customer_note ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm">
                        <p className="text-xs font-semibold text-amber-800">Customer note</p>
                        <p className="mt-1 whitespace-pre-wrap text-amber-950">{job.order.customer_note}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Section>

              <Section title="Job settings">
                <JobEditForm key={job.updated_at} detail={detail} canWrite={canWrite} onSaved={refresh} />
              </Section>

              <Section title="Job history">
                <ActivityTimeline entries={detail.activity} />
              </Section>
            </div>

            <aside className="space-y-6 border-t border-line bg-subtle/50 px-5 py-5 lg:border-t-0 lg:border-l">
              <Section title="Printing" icon={<Printer />}>
                {activeRun ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                      <p className="font-semibold text-amber-900">Printing on {activeRun.printer?.name}</p>
                      <p className="mt-0.5 text-xs text-amber-800">
                        Started {formatRelative(activeRun.started_at)}
                        {activeRun.estimated_minutes ? ` · est. ${formatMinutes(activeRun.estimated_minutes)}` : ""}
                      </p>
                    </div>
                    {canWrite ? (
                      finishing ? (
                        <FinishPrintForm
                          runId={activeRun.id}
                          defaultOutcome={finishing}
                          estimatedGrams={job.estimated_filament_g}
                          preferredMaterial={job.material}
                          filament={detail.filament.map((f) => ({ ...f, remaining_g: f.remaining_g == null ? null : Number(f.remaining_g) }))}
                          onDone={() => {
                            setFinishing(null);
                            refresh();
                          }}
                        />
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <Button onClick={() => setFinishing("success")}>Completed</Button>
                          <Button variant="danger-outline" onClick={() => setFinishing("failure")}>Failed</Button>
                        </div>
                      )
                    ) : null}
                  </div>
                ) : canWrite && canStart ? (
                  <div className="space-y-2">
                    <Select value={printerId} onChange={(e) => setPrinterId(e.target.value)} aria-label="Printer">
                      <option value="">Choose a printer…</option>
                      {printers.map((p) => (
                        <option key={p.id} value={p.id} disabled={p.status === "offline" || p.status === "maintenance"}>
                          {p.name} — {PRINTER_STATUS[p.status].label}
                        </option>
                      ))}
                    </Select>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        disabled={!printerId || printerId === job.printer_id}
                        loading={pending}
                        onClick={() => runAction(() => assignPrinterAction(job.id, printerId))}
                      >
                        Add to queue
                      </Button>
                      <Button disabled={!printerId} loading={pending} onClick={() => runAction(() => startPrintAction(job.id, printerId))}>
                        <Play /> Start print
                      </Button>
                    </div>
                    <p className="text-xs text-muted">
                      Printer status is updated manually — PrintFlow is not connected to live printer monitoring.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    {job.printer ? `Last printed on ${job.printer.name}.` : "No printer assigned."}
                  </p>
                )}
              </Section>

              <Section title="Print attempts" icon={<Timer />}>
                {detail.runs.length === 0 ? (
                  <p className="text-sm text-muted">No prints started yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.runs.map((r) => (
                      <li key={r.id} className="rounded-lg border border-line bg-surface p-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-ink">#{r.attempt_number} · {r.printer?.name ?? "Printer removed"}</span>
                          <PrintRunBadge status={r.status} />
                        </div>
                        <p className="mt-1 text-muted">
                          {formatDateTime(r.started_at)}
                          {r.ended_at ? ` → ${formatMinutes((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 60000)}` : ""}
                        </p>
                        {r.failure_reason ? <p className="mt-1 font-medium text-red-700">{r.failure_reason}</p> : null}
                        {r.notes ? <p className="mt-1 text-ink-2">{r.notes}</p> : null}
                        {r.status !== "printing" && !r.filament_recorded ? (
                          <p className="mt-1 text-amber-700">Filament not recorded</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Filament recorded">
                {detail.usage.length === 0 ? (
                  <p className="text-sm text-muted">No consumption recorded. Stock hasn’t been deducted for this job.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {detail.usage.map((u) => (
                      <li key={u.id} className="flex justify-between gap-2 rounded-md bg-surface px-2.5 py-1.5 ring-1 ring-line">
                        <span className="truncate text-ink-2">
                          {u.stock?.brand} {u.stock?.material} {u.stock?.colour}
                          {u.kind === "failed_print" ? <span className="text-red-600"> · failed</span> : null}
                        </span>
                        <span className="font-medium tabular text-ink">{formatGrams(u.grams)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <ButtonLink href="/filament" variant="link" size="sm">Manage filament →</ButtonLink>
              </Section>
            </aside>
          </div>
        ) : null}
      </DialogContent>
  );
}
