import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SourceBadge } from "@/components/ui/status-badges";
import { ScanJobActions } from "@/components/production/scan-job-actions";
import { getTicketJobs, parseIds } from "@/lib/data/print";
import { hasRole, requireUser } from "@/lib/auth";
import { PRODUCTION_STAGES } from "@/lib/constants";

export const metadata: Metadata = { title: "Scanned job" };

/** Opened by scanning a printed job ticket: the job and one-tap next steps. */
export default async function ScanJobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const [id] = parseIds((await params).id);
  if (!id) notFound();
  const [job] = await getTicketJobs({ ids: [id] });
  if (!job) notFound();
  const stage = PRODUCTION_STAGES.find((s) => s.id === job.stage)!;

  return (
    <>
      <PageHeader eyebrow="Scanned job ticket" title={job.job_number} description={job.product?.name ?? job.item?.title ?? "Item"} />
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge source={job.order.source} />
              <Link href={`/orders/${job.order.id}`} className="font-medium text-brand-700 hover:underline">Order {job.order.order_number}</Link>
              <span className="text-muted">· {job.order.customer_name}</span>
            </div>
            <p>
              <span className="text-muted">Stage:</span> <strong>{stage.label}</strong>
              <span className="text-muted"> · Qty {job.quantity}{job.quantity_printed ? ` (${job.quantity_printed} printed)` : ""}</span>
            </p>
            {job.item?.personalisation ? (
              <div className="rounded-lg border border-line bg-subtle p-3">
                <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">Personalisation</p>
                <p className="mt-0.5 text-base font-semibold whitespace-pre-wrap [overflow-wrap:anywhere]">{job.item.personalisation}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <ScanJobActions jobId={job.id} stage={job.stage} canWrite={hasRole(user, "staff")} />
      </div>
    </>
  );
}
