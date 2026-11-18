"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CircleCheck, CircleX, Ellipsis, ListPlus, Pause, Play, Plus, Power, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Progress } from "@/components/ui/misc";
import { PrinterStatusBadge, PriorityBadge } from "@/components/ui/status-badges";
import { useToast } from "@/components/ui/toast";
import { assignPrinterAction, startPrintAction } from "@/lib/actions/production";
import { moveQueueItemAction, removeFromQueueAction, setPrinterStatusAction } from "@/lib/actions/printers";
import { cn, formatMinutes, formatRelative } from "@/lib/utils";
import type { AssignableJob, PrinterRow } from "@/lib/data/printers";
import { FinishPrintForm, type FilamentOption } from "./finish-print-form";

/** Current time, ticking every 30s on the client; null during SSR (avoids hydration mismatch). */
const TICK = 30_000;
function subscribeClock(cb: () => void) {
  const t = setInterval(cb, TICK);
  return () => clearInterval(t);
}
function useNow() {
  return React.useSyncExternalStore(
    subscribeClock,
    () => Math.floor(Date.now() / TICK) * TICK,
    () => null,
  );
}

export function PrinterCard({
  printer,
  assignable,
  filament,
  canWrite,
  stats,
  detailed,
}: {
  printer: PrinterRow;
  assignable: AssignableJob[];
  filament: FilamentOption[];
  canWrite: boolean;
  stats?: { runs: number; failed: number; hours: number };
  detailed?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const [finish, setFinish] = React.useState<"success" | "failure" | null>(null);
  const [statusDialog, setStatusDialog] = React.useState<"maintenance" | "offline" | null>(null);
  const [note, setNote] = React.useState("");
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [assignJob, setAssignJob] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (res.message) toast({ title: res.message });
        after?.();
        router.refresh();
      } else toast({ title: res.error ?? "Something went wrong", tone: "error" });
    });

  const job = printer.current_job;
  const runInfo = printer.current_run;
  const elapsedMin = runInfo && now ? (now - new Date(runInfo.started_at).getTime()) / 60000 : 0;
  const estMin = runInfo?.estimated_minutes ?? null;
  const pct = estMin ? Math.min(100, (elapsedMin / estMin) * 100) : 0;
  const overrun = estMin != null && elapsedMin > estMin;
  const queue = printer.queue;
  const nextJob = queue[0]?.job;
  const idle = printer.status === "available";
  const volume = [printer.build_volume_x_mm, printer.build_volume_y_mm, printer.build_volume_z_mm].every(Boolean)
    ? `${printer.build_volume_x_mm}×${printer.build_volume_y_mm}×${printer.build_volume_z_mm} mm`
    : null;

  const accent = {
    available: "from-brand-500/10",
    printing: "from-amber-400/15",
    paused: "from-sky-400/15",
    maintenance: "from-orange-400/15",
    offline: "from-zinc-400/10",
  }[printer.status];

  const unassigned = assignable.filter((j) => !queue.some((q) => q.job?.id === j.id));

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className={cn("bg-gradient-to-b to-transparent px-5 pt-4 pb-3", accent)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {detailed ? (
              <h2 className="text-lg font-semibold text-ink">{printer.name}</h2>
            ) : (
              <Link href={`/printers/${printer.id}`} className="text-[15px] font-semibold text-ink hover:underline">
                {printer.name}
              </Link>
            )}
            <p className="mt-0.5 truncate text-xs text-muted">
              {printer.manufacturer} {printer.model} · {printer.printer_type}
              {volume ? ` · ${volume}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <PrinterStatusBadge status={printer.status} />
            {canWrite ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`${printer.name} status actions`}>
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {printer.status === "printing" ? (
                    <DropdownMenuItem onSelect={() => run(() => setPrinterStatusAction(printer.id, "paused"))}>
                      <Pause /> Pause print
                    </DropdownMenuItem>
                  ) : null}
                  {printer.status === "paused" ? (
                    <DropdownMenuItem onSelect={() => run(() => setPrinterStatusAction(printer.id, "printing"))}>
                      <Play /> Resume print
                    </DropdownMenuItem>
                  ) : null}
                  {!printer.current_print_run_id && printer.status !== "available" ? (
                    <DropdownMenuItem onSelect={() => run(() => setPrinterStatusAction(printer.id, "available"))}>
                      <CircleCheck /> Mark available
                    </DropdownMenuItem>
                  ) : null}
                  {!printer.current_print_run_id ? (
                    <>
                      <DropdownMenuItem onSelect={() => setStatusDialog("maintenance")}>
                        <Wrench /> Maintenance…
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setStatusDialog("offline")}>
                        <Power /> Take offline…
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {!detailed ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href={`/printers/${printer.id}`}>View details & history</Link>
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-5 pb-5">
        {/* Current job */}
        <div className="rounded-xl border border-line bg-subtle/60 p-3.5">
          {job ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                    {printer.status === "paused" ? "Paused" : "Now printing"}
                  </p>
                  <Link href={`/production?job=${job.id}`} className="mt-0.5 block truncate text-sm font-semibold text-ink hover:underline">
                    {job.quantity > 1 ? `${job.quantity}× ` : ""}
                    {job.item?.title}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {job.job_number} · {job.order?.order_number} · {job.order?.customer_name}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Progress value={pct} tone={overrun ? "amber" : "brand"} />
                <div className="flex justify-between text-[11px] text-muted tabular">
                  <span>{now ? `${formatMinutes(elapsedMin)} elapsed` : " "}</span>
                  <span className={cn(overrun && "font-medium text-amber-700")}>
                    {estMin
                      ? overrun
                        ? "Past estimate — check printer"
                        : printer.estimated_completion_at
                          ? `Est. finish ${formatRelative(printer.estimated_completion_at)}`
                          : ""
                      : "No estimate"}
                  </span>
                </div>
              </div>
              {canWrite && printer.current_print_run_id ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="sm" onClick={() => setFinish("success")}>
                    <CircleCheck /> Completed
                  </Button>
                  <Button size="sm" variant="danger-outline" onClick={() => setFinish("failure")}>
                    <CircleX /> Failed
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{idle ? "Idle" : printer.status === "maintenance" ? "Under maintenance" : "Offline"}</p>
                <p className="text-xs text-muted">
                  {idle ? (nextJob ? `Next: ${nextJob.job_number}` : "Queue is empty") : "Not accepting prints"}
                </p>
              </div>
              {canWrite && idle && nextJob ? (
                <Button size="sm" loading={pending} onClick={() => run(() => startPrintAction(nextJob.id, printer.id))}>
                  <Play /> Start next
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {/* Queue */}
        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">
              Queue <span className="font-normal text-muted">({queue.length})</span>
            </p>
            {canWrite ? (
              <Button variant="ghost" size="xs" onClick={() => setAssignOpen(true)}>
                <ListPlus /> Add job
              </Button>
            ) : null}
          </div>
          {queue.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-xs text-muted">No jobs queued</p>
          ) : (
            <ol className="space-y-1.5">
              {queue.slice(0, detailed ? 50 : 4).map((q, i) => (
                <li key={q.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs">
                  <span className="w-4 text-center font-semibold text-faint tabular">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {q.job?.quantity && q.job.quantity > 1 ? `${q.job.quantity}× ` : ""}
                      {q.job?.item?.title}
                    </p>
                    <p className="truncate text-muted">
                      {q.job?.job_number} · {q.job?.order?.order_number}
                      {q.job?.estimated_print_minutes ? ` · ${formatMinutes(q.job.estimated_print_minutes)}` : ""}
                      {q.job?.material ? ` · ${q.job.material}` : ""}
                    </p>
                  </div>
                  {q.job ? <PriorityBadge priority={q.job.priority} hideNormal /> : null}
                  {canWrite ? (
                    <div className="flex items-center">
                      {detailed ? (
                        <>
                          <button className="rounded p-1 text-faint hover:bg-zinc-100 hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => run(() => moveQueueItemAction(q.id, "up"))} aria-label="Move up">
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button className="rounded p-1 text-faint hover:bg-zinc-100 hover:text-ink disabled:opacity-30" disabled={i === queue.length - 1} onClick={() => run(() => moveQueueItemAction(q.id, "down"))} aria-label="Move down">
                            <ArrowDown className="size-3.5" />
                          </button>
                        </>
                      ) : null}
                      <button className="rounded p-1 text-faint hover:bg-red-50 hover:text-red-600" onClick={() => run(() => removeFromQueueAction(q.id))} aria-label="Remove from queue">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
              {!detailed && queue.length > 4 ? (
                <li>
                  <Link href={`/printers/${printer.id}`} className="block text-center text-xs font-medium text-brand-700 hover:underline">
                    +{queue.length - 4} more
                  </Link>
                </li>
              ) : null}
            </ol>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[11px] text-muted">
          <span>{printer.nozzle_size_mm ? `${printer.nozzle_size_mm} mm nozzle` : "Nozzle —"}</span>
          <span className="truncate">{printer.supported_materials.join(", ")}</span>
          {stats ? (
            <span className="ml-auto tabular">
              30d: {stats.runs} runs · {stats.failed} failed · {stats.hours.toFixed(0)}h
            </span>
          ) : null}
        </div>
      </div>

      {/* Finish print */}
      <Dialog open={finish !== null} onOpenChange={(o) => !o && setFinish(null)}>
        <DialogContent size="md" title="Record print outcome" description={job ? `${job.job_number} on ${printer.name}` : undefined}>
          <DialogBody>
            {printer.current_print_run_id && finish ? (
              <FinishPrintForm
                runId={printer.current_print_run_id}
                defaultOutcome={finish}
                estimatedGrams={job?.estimated_filament_g}
                preferredMaterial={job?.material}
                runUnits={(printer.current_run?.print_run_units ?? []).map((ru) => ({
                  id: ru.unit_id,
                  unit_number: ru.unit?.unit_number ?? 0,
                  label: ru.unit?.printed_personalisation?.split("\n")[0] ?? null,
                }))}
                filament={filament}
                onDone={() => {
                  setFinish(null);
                  router.refresh();
                }}
              />
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Maintenance / offline */}
      <Dialog open={statusDialog !== null} onOpenChange={(o) => !o && setStatusDialog(null)}>
        <DialogContent size="sm" title={statusDialog === "maintenance" ? "Put into maintenance" : "Take printer offline"} description="The note is added to this printer’s maintenance log.">
          <DialogBody>
            <Field label="Note" htmlFor={`note-${printer.id}`}>
              <Textarea id={`note-${printer.id}`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Replacing hotend, levelling bed…" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(null)}>Cancel</Button>
            <Button
              loading={pending}
              onClick={() =>
                run(() => setPrinterStatusAction(printer.id, statusDialog!, note), () => {
                  setStatusDialog(null);
                  setNote("");
                })
              }
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign job */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent size="md" title={`Queue a job on ${printer.name}`} description="Jobs that haven’t started printing yet.">
          <DialogBody>
            {unassigned.length === 0 ? (
              <p className="text-sm text-muted">There are no unstarted jobs to queue.</p>
            ) : (
              <Select value={assignJob} onChange={(e) => setAssignJob(e.target.value)} aria-label="Job">
                <option value="">Choose a job…</option>
                {unassigned.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_number} · {j.quantity}× {j.item?.title} · {j.order?.order_number}
                    {j.material ? ` · ${j.material}` : ""}
                    {j.printer_id && j.printer_id !== printer.id ? " (queued elsewhere)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button
              disabled={!assignJob}
              loading={pending}
              onClick={() =>
                run(() => assignPrinterAction(assignJob, printer.id), () => {
                  setAssignOpen(false);
                  setAssignJob("");
                })
              }
            >
              <Plus /> Add to queue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
