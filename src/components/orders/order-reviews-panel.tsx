"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, History, ShieldAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FormError, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { resolveOrderReviewAction } from "@/lib/actions/orders";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";
import type { OrderDetail } from "@/lib/data/orders";

type Review = OrderDetail["order_reviews"][number];
type Resolution = "acknowledged" | "jobs_closed" | "reprint_requested" | "returned_to_production";

/** The decisions available for each kind of change. */
function actionsFor(r: Review): { resolution: Resolution; label: string; help: string; danger?: boolean }[] {
  const ack = { resolution: "acknowledged" as const, label: "Acknowledge", help: "Record that you’ve dealt with this. Nothing else changes." };
  switch (r.kind) {
    case "order_cancelled":
    case "item_removed":
      return [
        {
          resolution: "jobs_closed",
          label: "Close the job(s)",
          help: "Takes the work off the board and printer queues. Items already printed are kept as surplus stock — nothing is deleted. Not allowed while a print is running.",
          danger: true,
        },
        ack,
      ];
    case "quantity_decreased":
      return [ack];
    case "quantity_increased":
      return [
        { resolution: "returned_to_production", label: "Return to production", help: "Moves the job back to Ready to Print so the extra units can be printed." },
        ack,
      ];
    case "personalisation_changed":
    case "variation_changed":
      return [
        {
          resolution: "reprint_requested",
          label: "Reprint affected units",
          help: "Units printed with the old details go back to be reprinted on the same job and the job returns to Ready to Print.",
          danger: true,
        },
        { ...ack, label: "Already correct", help: "Use when the printed items already match the new details." },
      ];
    default:
      return [ack];
  }
}

const RESOLUTION_LABEL: Record<string, string> = {
  auto_applied: "Applied automatically",
  acknowledged: "Acknowledged",
  jobs_closed: "Jobs closed",
  reprint_requested: "Reprint requested",
  returned_to_production: "Returned to production",
};

export function OrderReviewsPanel({ reviews, canWrite }: { reviews: Review[]; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [active, setActive] = React.useState<{ review: Review; resolution: Resolution; label: string; help: string } | null>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const open = reviews.filter((r) => r.status === "open");
  const history = reviews.filter((r) => r.status !== "open");

  const submit = () =>
    startTransition(async () => {
      if (!active) return;
      setError(null);
      const res = await resolveOrderReviewAction({ review_id: active.review.id, resolution: active.resolution, note });
      if (res.ok) {
        toast({ title: res.message ?? "Resolved" });
        setActive(null);
        setNote("");
        router.refresh();
      } else setError(res.error);
    });

  if (!reviews.length) return null;

  return (
    <div className="space-y-3">
      {open.map((r) => (
        <div key={r.id} className="rounded-xl border border-red-200 bg-red-50/60 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-red-900">
                {r.title} <Badge tone="red" size="sm">Decision needed</Badge>
              </p>
              <p className="mt-1 text-sm text-red-950 [overflow-wrap:anywhere]">{r.message}</p>
              {r.kind === "personalisation_changed" || r.kind === "variation_changed" ? <ChangeDiff details={r.details} /> : null}
              <p className="mt-1.5 text-xs text-red-800/80" title={formatDateTime(r.detected_at)}>
                Detected {formatRelative(r.detected_at)} · {r.source === "marketplace" ? "from the marketplace" : "in PrintFlow"}
              </p>
              {canWrite ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {actionsFor(r).map((a, i) => (
                    <Button
                      key={a.resolution}
                      size="sm"
                      variant={i === 0 ? (a.danger ? "danger" : "primary") : "outline"}
                      onClick={() => {
                        setActive({ review: r, ...a });
                        setNote("");
                        setError(null);
                      }}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ))}

      {history.length ? (
        <details className="group rounded-xl border border-line" open={open.length === 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-medium text-ink-2 select-none">
            <History className="size-4 text-faint" /> Change history ({history.length})
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {history.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {r.severity === "action_required" ? (
                    <TriangleAlert className="size-4 text-amber-600" />
                  ) : (
                    <CircleCheck className="size-4 text-brand-600" />
                  )}
                  <span className="font-medium text-ink">{r.title}</span>
                  <Badge tone={r.resolution === "auto_applied" ? "green" : "neutral"} size="sm">
                    {RESOLUTION_LABEL[r.resolution ?? ""] ?? "Resolved"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink-2 [overflow-wrap:anywhere]">{r.message}</p>
                {r.kind === "personalisation_changed" || r.kind === "variation_changed" ? <ChangeDiff details={r.details} /> : null}
                <p className="mt-1 text-xs text-muted">
                  {formatDateTime(r.detected_at)}
                  {r.resolved_at && r.resolution !== "auto_applied"
                    ? ` · resolved ${formatRelative(r.resolved_at)}${r.resolved_by_profile ? ` by ${r.resolved_by_profile.full_name || r.resolved_by_profile.email}` : ""}`
                    : ""}
                  {r.resolution_note ? ` · “${r.resolution_note}”` : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent size="sm" title={active?.label ?? ""} description={active?.review.title}>
          <DialogBody>
            <FormError message={error} />
            <p className="text-sm text-ink-2">{active?.help}</p>
            <Field label="Note" htmlFor="review-note" hint="Saved in the order history (e.g. “kept as stock”, “customer agreed”).">
              <Textarea id="review-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)}>Cancel</Button>
            <Button variant={actionsFor(active?.review ?? ({ kind: "" } as Review)).find((a) => a.resolution === active?.resolution)?.danger ? "danger" : "primary"} loading={pending} onClick={submit}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChangeDiff({ details }: { details: unknown }) {
  const d = (details ?? {}) as { before?: unknown; after?: unknown };
  const fmt = (v: unknown) =>
    v == null ? "—" : typeof v === "object" ? Object.values(v as Record<string, unknown>).filter(Boolean).join(" · ") || "—" : String(v);
  return (
    <div className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
      <div className={cn("rounded-md bg-white px-2 py-1.5 ring-1 ring-line")}>
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-faint">Before</span>
        <span className="whitespace-pre-wrap text-ink-2 line-through decoration-red-400 [overflow-wrap:anywhere]">{fmt(d.before)}</span>
      </div>
      <div className="rounded-md bg-white px-2 py-1.5 ring-1 ring-brand-200">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-brand-700">Now</span>
        <span className="whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{fmt(d.after)}</span>
      </div>
    </div>
  );
}
