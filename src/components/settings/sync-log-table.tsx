import { SyncStatusBadge } from "@/components/ui/status-badges";
import { formatDateTime, formatRelative } from "@/lib/utils";
import type { IntegrationOverview } from "@/lib/data/integrations";

type Log = IntegrationOverview["logs"][number];

export function SyncLogTable({ logs }: { logs: Log[] }) {
  return (
    <ul className="divide-y divide-line">
      {logs.map((l) => {
        const failures = (l.error_details as { failures?: { external_order_id: string; error: string; attempts?: number }[] } | null)?.failures;
        return (
          <li key={l.id} className="px-5 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-ink">{l.provider === "etsy" ? "Etsy" : "Shopify"}</span>
              <SyncStatusBadge status={l.status} />
              <span className="rounded bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-muted ring-1 ring-line capitalize">{l.trigger}</span>
              <span className="text-xs text-muted" title={formatDateTime(l.started_at)}>{formatRelative(l.started_at)}</span>
              {l.duration_ms != null ? <span className="text-xs text-faint tabular">{(l.duration_ms / 1000).toFixed(1)}s</span> : null}
              <span className="ml-auto text-xs text-muted tabular">
                {l.orders_fetched} fetched · {l.orders_created} new · {l.orders_updated} updated
                {l.orders_failed ? <span className="text-red-600"> · {l.orders_failed} failed</span> : null}
                {l.orders_retried ? <> · {l.orders_retried} retried</> : null}
                {l.orders_recovered ? <span className="text-brand-700"> · {l.orders_recovered} recovered</span> : null}
                {l.failures_outstanding ? <span className="text-amber-700"> · {l.failures_outstanding} awaiting retry</span> : null}
              </span>
            </div>
            {l.error_message ? <p className="mt-1 text-xs text-red-700 [overflow-wrap:anywhere]">{l.error_message}</p> : null}
            {(Array.isArray(l.warnings) ? (l.warnings as { message?: string }[]) : []).map((w, i) => (
              <p key={i} className="mt-1 text-xs text-amber-800 [overflow-wrap:anywhere]">⚠ {w.message}</p>
            ))}
            {failures?.length ? (
              <details className="mt-1 text-xs text-muted">
                <summary className="cursor-pointer select-none hover:text-ink">Show failed orders</summary>
                <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
                  {failures.map((f) => (
                    <li key={f.external_order_id}>
                      {f.external_order_id}{f.attempts ? ` (attempt ${f.attempts})` : ""}: {f.error}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
