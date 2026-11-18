import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-card", className)}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  title,
  description,
  action,
  icon,
  children,
}: {
  className?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted ring-1 ring-line [&_svg]:size-4">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          {title ? <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h3> : null}
          {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
          {children}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 border-t border-line bg-subtle/60 px-5 py-3 rounded-b-[var(--radius-card)]", className)}
      {...props}
    />
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}
