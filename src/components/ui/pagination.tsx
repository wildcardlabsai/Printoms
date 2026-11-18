import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn =
    "inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:bg-subtle";
  const disabled = "pointer-events-none opacity-40";
  return (
    <div className={cn("flex items-center justify-between gap-3 text-[13px] text-muted", className)}>
      <p className="tabular">
        <span className="font-medium text-ink">{from}</span>–<span className="font-medium text-ink">{to}</span> of{" "}
        <span className="font-medium text-ink">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <span className="hidden tabular sm:inline">
          Page {page} of {pages}
        </span>
        <Link href={hrefFor(page - 1)} className={cn(btn, page <= 1 && disabled)} aria-disabled={page <= 1} scroll={false}>
          <ChevronLeft className="size-4" /> <span className="sr-only sm:not-sr-only">Prev</span>
        </Link>
        <Link href={hrefFor(page + 1)} className={cn(btn, page >= pages && disabled)} aria-disabled={page >= pages} scroll={false}>
          <span className="sr-only sm:not-sr-only">Next</span> <ChevronRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
