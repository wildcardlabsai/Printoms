import Link from "next/link";
import { PrintRunBadge } from "@/components/ui/status-badges";
import { formatDateTime, formatMinutes } from "@/lib/utils";
import type { PrintRunRow } from "@/lib/data/printers";

function duration(r: PrintRunRow) {
  if (!r.ended_at) return "—";
  return formatMinutes((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 60000);
}

export function PrintRunsTable({ runs, showPrinter = true }: { runs: PrintRunRow[]; showPrinter?: boolean }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2.5 pr-3 pl-5 font-medium">Started</th>
              <th className="px-3 py-2.5 font-medium">Job</th>
              {showPrinter ? <th className="px-3 py-2.5 font-medium">Printer</th> : null}
              <th className="px-3 py-2.5 font-medium">Result</th>
              <th className="px-3 py-2.5 font-medium">Duration</th>
              <th className="py-2.5 pr-5 pl-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {runs.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="py-3 pr-3 pl-5 whitespace-nowrap text-ink-2 tabular">{formatDateTime(r.started_at)}</td>
                <td className="px-3 py-3">
                  <Link href={`/production?job=${r.job?.id}`} className="font-medium text-ink hover:underline">
                    {r.job?.item?.title ?? "—"}
                  </Link>
                  <p className="text-xs text-muted">
                    {r.job?.job_number} · attempt {r.attempt_number}
                    {r.job?.order ? (
                      <>
                        {" · "}
                        <Link href={`/orders/${r.job.order.id}`} className="hover:underline">{r.job.order.order_number}</Link>
                      </>
                    ) : null}
                  </p>
                </td>
                {showPrinter ? <td className="px-3 py-3 whitespace-nowrap text-ink-2">{r.printer?.name ?? "—"}</td> : null}
                <td className="px-3 py-3">
                  <PrintRunBadge status={r.status} />
                  {r.quantity > 1 || (r.quantity_failed ?? 0) > 0 ? (
                    <span className="mt-1 block text-xs text-muted tabular">
                      {r.quantity_succeeded ?? "–"}/{r.quantity} ok{r.quantity_failed ? <span className="text-red-600"> · {r.quantity_failed} failed</span> : null}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3 whitespace-nowrap tabular text-ink-2">
                  {duration(r)}
                  {r.estimated_minutes ? <span className="block text-xs text-faint">est. {formatMinutes(r.estimated_minutes)}</span> : null}
                </td>
                <td className="max-w-[320px] py-3 pr-5 pl-3 text-xs">
                  {r.failure_reason ? <p className="font-medium text-red-700">{r.failure_reason}</p> : null}
                  {r.notes ? <p className="text-ink-2">{r.notes}</p> : null}
                  {!r.filament_recorded && r.status !== "cancelled" ? <p className="text-amber-700">Filament not recorded</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {runs.map((r) => (
          <li key={r.id} className="space-y-1 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-ink">{r.job?.item?.title ?? "—"}</span>
              <PrintRunBadge status={r.status} />
            </div>
            <p className="text-xs text-muted">
              {r.quantity > 1 || (r.quantity_failed ?? 0) > 0 ? `${r.quantity_succeeded ?? "–"}/${r.quantity} ok · ` : ""}
              {formatDateTime(r.started_at)} · {duration(r)}
              {showPrinter && r.printer ? ` · ${r.printer.name}` : ""} · attempt {r.attempt_number}
            </p>
            {r.failure_reason ? <p className="text-xs font-medium text-red-700">{r.failure_reason}</p> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
