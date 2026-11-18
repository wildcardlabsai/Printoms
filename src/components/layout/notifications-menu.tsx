"use client";

import Link from "next/link";
import { Bell, CircleCheck } from "lucide-react";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type AppNotification = {
  id: string;
  tone: "red" | "amber" | "blue" | "green";
  title: string;
  description?: string;
  href: string;
};

export function NotificationsMenu({ notifications }: { notifications: AppNotification[] }) {
  const urgent = notifications.filter((n) => n.tone === "red").length;
  return (
    <Popover>
      <PopoverTrigger
        className="relative rounded-lg p-2 text-ink-2 transition hover:bg-zinc-100"
        aria-label={`Notifications${notifications.length ? ` (${notifications.length})` : ""}`}
      >
        <Bell className="size-5" />
        {notifications.length ? (
          <span
            className={cn(
              "absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-white",
              urgent ? "bg-red-500" : "bg-amber-500",
            )}
          />
        ) : null}
      </PopoverTrigger>
      <PopoverContent className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold text-ink">Notifications</p>
          <span className="text-xs text-muted">{notifications.length ? `${notifications.length} need attention` : "All clear"}</span>
        </div>
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <CircleCheck className="mb-2 size-6 text-brand-500" />
            <p className="text-sm font-medium text-ink">Nothing needs your attention</p>
            <p className="mt-1 text-xs text-muted">Overdue orders, low stock and sync problems appear here.</p>
          </div>
        ) : (
          <ul className="scrollbar-thin max-h-[60vh] divide-y divide-line overflow-y-auto">
            {notifications.map((n) => (
              <li key={n.id}>
                <PopoverClose asChild>
                  <Link href={n.href} className="flex gap-3 px-4 py-3 transition hover:bg-subtle">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        n.tone === "red" && "bg-red-500",
                        n.tone === "amber" && "bg-amber-500",
                        n.tone === "blue" && "bg-blue-500",
                        n.tone === "green" && "bg-brand-500",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink">{n.title}</span>
                      {n.description ? <span className="mt-0.5 block text-xs text-muted">{n.description}</span> : null}
                    </span>
                  </Link>
                </PopoverClose>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
