import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon,
  hint,
  href,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: "neutral" | "brand" | "amber" | "red" | "blue" | "violet";
  className?: string;
}) {
  const iconTone = {
    neutral: "bg-zinc-100 text-zinc-600",
    brand: "bg-brand-50 text-brand-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-600",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
  }[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {icon ? <div className={cn("flex size-7 items-center justify-center rounded-lg [&_svg]:size-[15px]", iconTone)}>{icon}</div> : null}
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink tabular">{value}</div>
      {hint ? <div className="mt-2 text-xs text-muted">{hint}</div> : null}
    </>
  );

  const classes = cn(
    "group block rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card transition",
    href && "hover:border-line-strong hover:shadow-raised",
    className,
  );

  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
