import * as React from "react";
import Link from "next/link";
import { cn, initials } from "@/lib/utils";

export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[11px] font-semibold text-white ring-2 ring-white",
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Progress({ value, tone = "brand", className }: { value: number; tone?: "brand" | "amber" | "red"; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-100", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          tone === "brand" && "bg-brand-500",
          tone === "amber" && "bg-amber-500",
          tone === "red" && "bg-red-500",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Link-based tabs (server-friendly; state lives in the URL). */
export function TabNav({
  tabs,
  active,
  className,
}: {
  tabs: { id: string; label: React.ReactNode; href: string; count?: number }[];
  active: string;
  className?: string;
}) {
  return (
    <div className={cn("no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <nav className="inline-flex min-w-max items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-card">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <Link
              key={t.id}
              href={t.href}
              scroll={false}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition",
                isActive ? "bg-ink text-white shadow-sm" : "text-muted hover:bg-zinc-100 hover:text-ink",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {t.label}
              {t.count != null ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] tabular",
                    isActive ? "bg-white/15 text-white" : "bg-zinc-100 text-muted",
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function DescriptionList({ items, className }: { items: { label: React.ReactNode; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {items.map((item, i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2.5 text-sm">
          <dt className="shrink-0 text-muted">{item.label}</dt>
          <dd className="min-w-0 text-right font-medium text-ink [overflow-wrap:anywhere]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  icon,
  className,
  action,
}: {
  tone?: "info" | "warning" | "danger" | "success" | "neutral";
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const styles = {
    info: "border-blue-200 bg-blue-50/70 text-blue-900 [&_svg]:text-blue-600",
    warning: "border-amber-200 bg-amber-50/70 text-amber-900 [&_svg]:text-amber-600",
    danger: "border-red-200 bg-red-50/70 text-red-900 [&_svg]:text-red-600",
    success: "border-brand-200 bg-brand-50/70 text-brand-900 [&_svg]:text-brand-600",
    neutral: "border-line bg-subtle text-ink-2 [&_svg]:text-muted",
  }[tone];
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-start", styles, className)}>
      <div className="flex flex-1 items-start gap-3">
        {icon ? <div className="mt-0.5 shrink-0 [&_svg]:size-[18px]">{icon}</div> : null}
        <div className="min-w-0 flex-1">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className={cn("leading-relaxed opacity-90", title && "mt-0.5")}>{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-subtle px-1 font-sans text-[10px] font-medium text-muted">
      {children}
    </kbd>
  );
}
