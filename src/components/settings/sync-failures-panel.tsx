"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, History, RotateCcw, TriangleAlert } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FormError, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { dismissSyncFailureAction, reopenSyncFailureAction, retrySyncFailureAction } from "@/lib/actions/settings";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";
import type { FailureState, IntegrationOverview } from "@/lib/data/integrations";

type Failure = IntegrationOverview["failures"][number];

const EVENT_LABEL: Record<Failure["events"][number]["event"], string> = {
  failed: "Import failed",
  failed_while_dismissed: "Failed again (dismissed — not retried)",
  retried: "Retried",
  resolved: "Imported successfully",
  dismissed: "Dismissed",
  reopened: "Reopened",
};

const TABS: { id: FailureState; label: string; empty: string }[] = [
  { id: "open", label: "Open", empty: "No orders are waiting to be retried." },
  { id: "dismissed", label: "Dismissed", empty: "Nothing has been dismissed." },
  { id: "resolved", label: "Resolved", empty: "No failures resolved in the last 30 days." },
];

export function SyncFailuresPanel({
  failures,
  holdAttempts,
  canManage,
}: {
  failures: Failure[];
  holdAttempts: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const counts = { open: 0, dismissed: 0, resolved: 0 } as Record<FailureState, number>;
  for (const f of failures) counts[f.state]++;
  const [tab, setTab] = React.useState<FailureState>(counts.open ? "open" : counts.dismissed ? "dismissed" : "resolved");
  const [dialog, setDialog] = React.useState<{ kind: "dismiss" | "reopen"; failure: Failure } | null>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const retry = (f: Failure) =>
    startTransition(async () => {
      setBusy(f.id);
      const res = await retrySyncFailureAction(f.id);
      setBusy(null);
      toast(res.ok ? { title: res.message ?? "Imported" } : { title: "Retry failed", description: res.error, tone: "error" });
      router.refresh();
    });

  const confirm = () =>
    startTransition(async () => {
      if (!dialog) return;
      setError(null);
      const res =
        dialog.kind === "dismiss"
          ? await dismissSyncFailureAction(dialog.failure.id, note)
          : await reopenSyncFailureAction(dialog.failure.id, note);
      if (!res.ok) return setError(res.error);
      toast({ title: res.message ?? "Saved" });
      setDialog(null);
      router.refresh();
    });

  const shown = failures.filter((f) => f.state === tab);

  return (
    <Card className="overflow-hidden" id="failed-orders">
      <CardHeader
        icon={<TriangleAlert />}
        title={counts.open ? `Failed orders (${counts.open} open)` : "Failed orders"}
        description="Marketplace orders that could not be imported. Open ones are retried automatically; nothing is ever silently dropped."
      />
      <div className="no-scrollbar overflow-x-auto border-t border-line px-4 py-2.5 sm:px-5">
        <div role="tablist" className="inline-flex min-w-max items-center gap-1 rounded-xl border border-line bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition",
                tab === t.id ? "bg-ink text-white shadow-sm" : "text-muted hover:bg-zinc-100 hover:text-ink",
              )}
            >
              {t.label}
              <span className={cn("rounded-full px-1.5 text-[11px] tabular", tab === t.id ? "bg-white/15 text-white" : "bg-zinc-100 text-muted")}>
                {counts[t.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="border-t border-line px-5 py-6 text-center text-sm text-muted">{TABS.find((t) => t.id === tab)!.empty}</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line" role="tabpanel">
          {shown.map((f) => (
            <li key={f.id} className="px-4 py-3 text-sm sm:px-5" data-testid="sync-failure">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-ink">{f.provider === "etsy" ? "Etsy" : "Shopify"}</span>
                <span className="font-mono text-xs text-ink-2 [overflow-wrap:anywhere]">{f.external_order_id}</span>
                <Badge tone={f.state === "resolved" ? "green" : f.attempts > holdAttempts ? "red" : "amber"} size="sm">
                  {f.attempts} attempt{f.attempts === 1 ? "" : "s"}
                </Badge>
                <span className="text-xs text-muted sm:ml-auto" title={formatDateTime(f.last_failed_at)}>
                  last failed {formatRelative(f.last_failed_at)} · first {formatDateTime(f.first_failed_at)}
                </span>
              </div>
              {f.state !== "resolved" ? <p className="mt-1 text-xs text-red-700 [overflow-wrap:anywhere]">{f.last_error}</p> : null}

              {f.state === "open" && f.next_retry ? (
                <p className="mt-1 text-xs text-ink-2">
                  <span className="font-medium">Next retry: </span>
                  {f.next_retry.at ? (
                    <span title={formatDateTime(f.next_retry.at)}>
                      {f.next_retry.due ? "due now" : formatRelative(f.next_retry.at)} —{" "}
                    </span>
                  ) : null}
                  {f.next_retry.note}
                </p>
              ) : null}
              {f.state === "dismissed" ? (
                <p className="mt-1 text-xs text-ink-2 [overflow-wrap:anywhere]">
                  Dismissed {formatRelative(f.dismissed_at!)}
                  {f.dismissed_by_profile ? ` by ${f.dismissed_by_profile.full_name || f.dismissed_by_profile.email}` : ""} — “{f.dismiss_reason}”. Not
                  retried and does not hold back syncing; still marked resolved if the order later imports.
                </p>
              ) : null}
              {f.state === "resolved" ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-brand-700">
                  <CircleCheck className="size-3.5" /> Imported {formatRelative(f.resolved_at!)}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {canManage && f.state === "open" ? (
                  <>
                    <Button size="sm" variant="outline" loading={pending && busy === f.id} disabled={pending} onClick={() => retry(f)}>
                      <RotateCcw /> Retry now
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setDialog({ kind: "dismiss", failure: f });
                        setNote("");
                        setError(null);
                      }}
                    >
                      Dismiss…
                    </Button>
                  </>
                ) : null}
                {canManage && f.state === "dismissed" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setDialog({ kind: "reopen", failure: f });
                      setNote("");
                      setError(null);
                    }}
                  >
                    Reopen
                  </Button>
                ) : null}
                {f.events.length ? (
                  <details className="w-full text-xs">
                    <summary className="inline-flex cursor-pointer items-center gap-1 text-muted select-none hover:text-ink">
                      <History className="size-3.5" /> History ({f.events.length})
                    </summary>
                    <ol className="mt-2 space-y-1.5 border-l border-line pl-3">
                      {f.events.map((e) => (
                        <li key={e.id}>
                          <span className="font-medium text-ink">{EVENT_LABEL[e.event]}</span>
                          <span className="text-muted">
                            {" "}
                            · {formatDateTime(e.created_at)} · {e.actor?.full_name || e.actor?.email || e.actor_label || "System"}
                          </span>
                          {e.note ? <span className="block text-ink-2 [overflow-wrap:anywhere]">“{e.note}”</span> : null}
                          {e.error ? <span className="block text-red-700 [overflow-wrap:anywhere]">{e.error}</span> : null}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent
          size="sm"
          title={dialog?.kind === "dismiss" ? "Dismiss failed order?" : "Reopen failed order?"}
          description={dialog ? `${dialog.failure.provider === "etsy" ? "Etsy" : "Shopify"} order ${dialog.failure.external_order_id}` : undefined}
        >
          <DialogBody>
            <FormError message={error} />
            <p className="text-sm text-ink-2">
              {dialog?.kind === "dismiss"
                ? "PrintFlow will stop retrying this order and it will no longer hold back syncing. It stays dismissed even if it fails again, and the full history is kept. You can reopen it at any time."
                : "The order goes back into the automatic retry queue and is retried on the next sync."}
            </p>
            <Field
              label={dialog?.kind === "dismiss" ? "Reason (required)" : "Note (optional)"}
              htmlFor="failure-note"
              hint={dialog?.kind === "dismiss" ? "e.g. “Test order on the marketplace”, “Refunded and cancelled”." : undefined}
            >
              <Textarea id="failure-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant={dialog?.kind === "dismiss" ? "danger" : "primary"}
              loading={pending}
              disabled={dialog?.kind === "dismiss" && note.trim().length < 3}
              onClick={confirm}
            >
              {dialog?.kind === "dismiss" ? "Dismiss" : "Reopen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
