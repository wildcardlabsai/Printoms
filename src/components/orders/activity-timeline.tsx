import { formatDateTime, formatRelative } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  action: string;
  message: string;
  created_at: string;
  actor_label: string | null;
  actor: { full_name: string | null; email: string } | null;
};

function dotTone(action: string) {
  if (action.includes("failed") || action.includes("cancel")) return "bg-red-500";
  if (action.includes("dispatch") || action.includes("succeeded") || action.includes("completed")) return "bg-brand-500";
  if (action.includes("hold")) return "bg-amber-500";
  if (action.includes("imported") || action.includes("synced") || action.includes("created")) return "bg-blue-500";
  return "bg-zinc-300";
}

export function ActivityTimeline({ entries, empty = "No activity recorded yet." }: { entries: Entry[]; empty?: string }) {
  if (entries.length === 0) return <p className="text-[13px] text-muted">{empty}</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-line">
      {entries.map((e) => (
        <li key={e.id} className="relative flex gap-3 pl-0">
          <span className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-surface", dotTone(e.action))} />
          <div className="min-w-0">
            <p className="text-[13px] text-ink [overflow-wrap:anywhere]">{e.message}</p>
            <p className="mt-0.5 text-xs text-muted" title={formatDateTime(e.created_at)}>
              {e.actor?.full_name || e.actor?.email || e.actor_label || "System"} · {formatRelative(e.created_at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
