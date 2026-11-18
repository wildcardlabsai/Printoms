import { TriangleAlert } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatRelative } from "@/lib/utils";
import type { IntegrationOverview } from "@/lib/data/integrations";

export function SyncFailuresPanel({ failures, holdAttempts }: { failures: IntegrationOverview["failures"]; holdAttempts: number }) {
  if (!failures.length) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<TriangleAlert />}
        title={`Orders awaiting retry (${failures.length})`}
        description="These marketplace orders failed to import. They are retried automatically on every sync and disappear from this list once they import."
      />
      <ul className="divide-y divide-line border-t border-line">
        {failures.map((f) => (
          <li key={f.id} className="px-5 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-ink">{f.provider === "etsy" ? "Etsy" : "Shopify"}</span>
              <span className="font-mono text-xs text-ink-2">{f.external_order_id}</span>
              <Badge tone={f.attempts > holdAttempts ? "red" : "amber"} size="sm">
                {f.attempts} attempt{f.attempts === 1 ? "" : "s"}
              </Badge>
              <span className="ml-auto text-xs text-muted" title={formatDateTime(f.last_failed_at)}>
                last tried {formatRelative(f.last_failed_at)} · first failed {formatDateTime(f.first_failed_at)}
              </span>
            </div>
            <p className="mt-1 text-xs text-red-700 [overflow-wrap:anywhere]">{f.last_error}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
