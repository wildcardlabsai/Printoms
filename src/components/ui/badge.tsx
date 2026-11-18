import * as React from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/constants";

const tones: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-brand-50 text-brand-700 ring-brand-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
};

const dots: Record<Tone, string> = {
  neutral: "bg-zinc-400",
  slate: "bg-slate-400",
  green: "bg-brand-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  orange: "bg-orange-500",
  sky: "bg-sky-500",
};

export function Badge({
  tone = "neutral",
  dot,
  className,
  children,
  size = "md",
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset",
        size === "sm" ? "px-1.5 py-px text-[11px]" : "px-2 py-0.5 text-xs",
        tones[tone],
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", dots[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      title="Development sample data — not a real business record"
      className={cn(
        "inline-flex items-center rounded-md border border-dashed border-fuchsia-300 bg-fuchsia-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-fuchsia-700",
        className,
      )}
    >
      Sample
    </span>
  );
}
