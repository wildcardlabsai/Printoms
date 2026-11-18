"use client";

import * as React from "react";
import { CalendarClock, Printer, Sparkles, TriangleAlert } from "lucide-react";
import { PriorityBadge, SourceBadge } from "@/components/ui/status-badges";
import { SampleBadge } from "@/components/ui/badge";
import { cn, formatMinutes, formatShortDate, isOverdue } from "@/lib/utils";
import type { BoardJob } from "@/lib/data/production";

export function JobCard({
  job,
  dragging,
  className,
  onOpen,
  footer,
  ...rest
}: {
  job: BoardJob;
  dragging?: boolean;
  className?: string;
  onOpen?: () => void;
  footer?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const due = job.due_date ?? job.order?.dispatch_by;
  const overdue = isOverdue(due, job.stage === "dispatched" || job.stage === "completed" ? "dispatched" : "open");
  const priorityBar = {
    urgent: "bg-red-500",
    high: "bg-orange-400",
    normal: "bg-transparent",
    low: "bg-transparent",
  }[job.priority];

  return (
    <div
      {...rest}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-line bg-surface p-3 text-left shadow-card transition",
        "hover:border-line-strong hover:shadow-raised",
        dragging && "rotate-[1.5deg] shadow-overlay ring-2 ring-brand-500/40",
        className,
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", priorityBar)} aria-hidden />
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Open ${job.job_number}`}>
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <SourceBadge source={job.order?.source ?? "manual"} compact className="[&>span]:size-4 [&>span]:text-[9px]" />
          <span className="shrink-0 font-semibold whitespace-nowrap text-ink-2">{job.order?.order_number}</span>
          <span className="min-w-0 flex-1 truncate">· {job.order?.customer_name}</span>
          {job.is_sample || job.order?.is_sample ? <SampleBadge className="shrink-0" /> : null}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[13.5px] font-medium leading-snug text-ink">
          {job.quantity > 1 ? <span className="mr-1 font-semibold text-brand-700">{job.quantity}×</span> : null}
          {job.product?.name ?? job.item?.title}
        </p>
        {job.item?.variant_title ? <p className="mt-0.5 truncate text-xs text-muted">{job.item.variant_title}</p> : null}
        {job.item?.personalisation ? (
          <p className="mt-1.5 flex items-start gap-1 rounded-md bg-violet-50 px-1.5 py-1 text-[11.5px] text-violet-800">
            <Sparkles className="mt-px size-3 shrink-0" />
            <span className="line-clamp-2">{job.item.personalisation}</span>
          </p>
        ) : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted">
          <PriorityBadge priority={job.priority} hideNormal />
          {due ? (
            <span className={cn("inline-flex items-center gap-1 tabular", overdue && "font-semibold text-red-600")}>
              <CalendarClock className="size-3" /> {formatShortDate(due)}
            </span>
          ) : null}
          {job.estimated_print_minutes ? <span className="tabular">⏱ {formatMinutes(job.estimated_print_minutes)}</span> : null}
          {job.material ? (
            <span className="truncate">
              {job.material}
              {job.colour ? ` · ${job.colour}` : ""}
            </span>
          ) : null}
        </div>
        {job.printer || job.failed_attempts ? (
          <div className="mt-2 flex items-center gap-2 border-t border-dashed border-line pt-2 text-[11.5px]">
            {job.printer ? (
              <span className="inline-flex items-center gap-1 font-medium text-ink-2">
                <Printer className="size-3.5 text-faint" /> {job.printer.name}
              </span>
            ) : null}
            {job.failed_attempts ? (
              <span className="ml-auto inline-flex items-center gap-1 font-medium text-red-600">
                <TriangleAlert className="size-3" /> {job.failed_attempts} failed
              </span>
            ) : null}
          </div>
        ) : null}
      </button>
      {footer}
    </div>
  );
}
