"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowRightLeft, Search, SquareKanban } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { moveJobAction } from "@/lib/actions/production";
import { PRIORITY, PRODUCTION_STAGES, STAGE_META, type ProductionStage } from "@/lib/constants";
import { cn, formatMinutes } from "@/lib/utils";
import type { BoardJob, PrinterOption } from "@/lib/data/production";
import { JobCard } from "./job-card";
import { JobDetailSheet } from "./job-detail-sheet";

const COLUMN_DOT: Record<string, string> = {
  blue: "bg-blue-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  green: "bg-brand-500",
  slate: "bg-slate-400",
  neutral: "bg-zinc-400",
  red: "bg-red-500",
};

function sortJobs(a: BoardJob, b: BoardJob) {
  const p = PRIORITY[b.priority].rank - PRIORITY[a.priority].rank;
  if (p) return p;
  const da = a.due_date ?? a.order?.dispatch_by ?? "9999";
  const db = b.due_date ?? b.order?.dispatch_by ?? "9999";
  if (da !== db) return da < db ? -1 : 1;
  return a.board_position - b.board_position;
}

function DraggableJob({ job, canWrite, onOpen }: { job: BoardJob; canWrite: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: job.id, disabled: !canWrite });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-manipulation", isDragging && "opacity-30")}>
      <JobCard job={job} onOpen={onOpen} />
    </div>
  );
}

function Column({
  stage,
  jobs,
  canWrite,
  onOpen,
}: {
  stage: (typeof PRODUCTION_STAGES)[number];
  jobs: BoardJob[];
  canWrite: boolean;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const minutes = jobs.reduce((s, j) => s + (j.estimated_print_minutes ?? 0), 0);
  return (
    <section
      ref={setNodeRef}
      aria-label={stage.label}
      className={cn(
        "flex w-[288px] shrink-0 flex-col rounded-2xl border border-transparent bg-zinc-100/70 transition-colors",
        isOver && "border-brand-300 bg-brand-50/60",
      )}
    >
      <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        <span className={cn("size-2 rounded-full", COLUMN_DOT[stage.tone])} />
        <h2 className="text-[13px] font-semibold text-ink">{stage.label}</h2>
        <span className="rounded-full bg-white px-1.5 text-[11px] font-semibold text-muted tabular ring-1 ring-line">{jobs.length}</span>
        {minutes ? <span className="ml-auto text-[11px] text-faint tabular">{formatMinutes(minutes)}</span> : null}
      </header>
      <div className="scrollbar-thin flex max-h-[calc(100dvh-290px)] min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {jobs.map((job) => (
          <DraggableJob key={job.id} job={job} canWrite={canWrite} onOpen={() => onOpen(job.id)} />
        ))}
        {jobs.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-faint">
            {stage.description}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ProductionBoard({
  jobs: initialJobs,
  printers,
  canWrite,
  initialJobId,
}: {
  jobs: BoardJob[];
  printers: PrinterOption[];
  canWrite: boolean;
  initialJobId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [jobs, setJobs] = React.useState(initialJobs);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [openJobId, setOpenJobId] = React.useState<string | null>(initialJobId ?? null);
  const [q, setQ] = React.useState("");
  const [printerFilter, setPrinterFilter] = React.useState("");
  const [priorityFilter, setPriorityFilter] = React.useState("");
  const [mobileStage, setMobileStage] = React.useState<ProductionStage>("new_order");

  React.useEffect(() => setJobs(initialJobs), [initialJobs]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return jobs.filter((j) => {
      if (printerFilter === "none" ? j.printer_id : printerFilter && j.printer_id !== printerFilter) return false;
      if (priorityFilter && j.priority !== priorityFilter) return false;
      if (!needle) return true;
      return [j.job_number, j.order?.order_number, j.order?.customer_name, j.product?.name, j.item?.title, j.item?.personalisation]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(needle));
    });
  }, [jobs, q, printerFilter, priorityFilter]);

  const byStage = React.useMemo(() => {
    const map = Object.fromEntries(PRODUCTION_STAGES.map((s) => [s.id, [] as BoardJob[]])) as Record<ProductionStage, BoardJob[]>;
    for (const j of filtered) map[j.stage].push(j);
    for (const k of Object.keys(map) as ProductionStage[]) map[k].sort(sortJobs);
    return map;
  }, [filtered]);

  const move = React.useCallback(
    async (jobId: string, to: ProductionStage) => {
      const job = jobs.find((j) => j.id === jobId);
      if (!job || job.stage === to) return;
      const previous = jobs;
      setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, stage: to } : j)));
      const res = await moveJobAction(jobId, to);
      if (!res.ok) {
        setJobs(previous);
        toast({ title: "Couldn’t move job", description: res.error, tone: "error" });
      } else {
        if (res.message) toast({ title: res.message });
        router.refresh();
      }
    },
    [jobs, router, toast],
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (e.over) void move(String(e.active.id), e.over.id as ProductionStage);
  };

  const activeJob = activeId ? jobs.find((j) => j.id === activeId) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by order, customer, product…" className="pl-9" aria-label="Filter jobs" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={printerFilter} onChange={(e) => setPrinterFilter(e.target.value)} aria-label="Printer" className="sm:w-48">
            <option value="">All printers</option>
            <option value="none">Unassigned</option>
            {printers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} aria-label="Priority" className="sm:w-40">
            <option value="">Any priority</option>
            {Object.entries(PRIORITY).map(([k, m]) => (
              <option key={k} value={k}>{m.label}</option>
            ))}
          </Select>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <EmptyState
            icon={<SquareKanban />}
            title="No production jobs yet"
            description="A job is created for every order item when orders are imported from Etsy or Shopify, or added manually."
          />
        </div>
      ) : (
        <>
          {/* Desktop/tablet: kanban with drag and drop */}
          <div className="hidden md:block">
            <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
              <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                <div className="flex min-w-max gap-3">
                  {PRODUCTION_STAGES.map((stage) => (
                    <Column key={stage.id} stage={stage} jobs={byStage[stage.id]} canWrite={canWrite} onOpen={setOpenJobId} />
                  ))}
                </div>
              </div>
              <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.16,1,0.3,1)" }}>
                {activeJob ? <JobCard job={activeJob} dragging className="w-[272px]" /> : null}
              </DragOverlay>
            </DndContext>
          </div>

          {/* Mobile: one stage at a time, move via menu */}
          <div className="md:hidden">
            <div className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4">
              {PRODUCTION_STAGES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setMobileStage(s.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                    mobileStage === s.id ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2",
                  )}
                >
                  {s.label}
                  <span className={cn("text-[11px] tabular", mobileStage === s.id ? "text-white/70" : "text-faint")}>{byStage[s.id].length}</span>
                </button>
              ))}
            </div>
            <div className="space-y-2.5">
              {byStage[mobileStage].length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-muted">
                  No jobs in {STAGE_META[mobileStage].label}
                </div>
              ) : (
                byStage[mobileStage].map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onOpen={() => setOpenJobId(job.id)}
                    footer={
                      canWrite ? (
                        <div className="mt-2.5 border-t border-line pt-2.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-subtle text-[13px] font-medium text-ink-2 ring-1 ring-line active:bg-zinc-100">
                              <ArrowRightLeft className="size-4" /> Move to…
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center" className="w-[min(320px,calc(100vw-32px))]">
                              <DropdownMenuLabel>Move {job.job_number}</DropdownMenuLabel>
                              {PRODUCTION_STAGES.filter((s) => s.id !== job.stage).map((s) => (
                                <DropdownMenuItem key={s.id} onSelect={() => void move(job.id, s.id)}>
                                  <span className={cn("size-2 rounded-full", COLUMN_DOT[s.tone])} /> {s.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : null
                    }
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}

      <JobDetailSheet
        jobId={openJobId}
        onClose={() => {
          setOpenJobId(null);
          if (initialJobId) router.replace("/production", { scroll: false });
        }}
        printers={printers}
        canWrite={canWrite}
      />
    </div>
  );
}
