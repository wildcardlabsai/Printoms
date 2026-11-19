import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ProductionBoard } from "@/components/production/production-board";
import { getActivePrinters, getBoardJobs } from "@/lib/data/production";
import { hasRole, requireUser } from "@/lib/auth";
import { ButtonLink } from "@/components/ui/button";
import { Printer, Ticket } from "lucide-react";

export const metadata: Metadata = { title: "Production Board" };

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const user = await requireUser();
  const { job } = await searchParams;
  const [jobs, printers] = await Promise.all([getBoardJobs(), getActivePrinters()]);
  const open = jobs.filter((j) => !["dispatched", "completed"].includes(j.stage)).length;

  return (
    <>
      <PageHeader
        title="Production Board"
        description={`${open} active job${open === 1 ? "" : "s"}. Drag cards between stages — every order item is tracked separately.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/print/tickets?stage=ready_to_print" variant="outline" prefetch={false}>
              <Ticket /> Print tickets (Ready to Print)
            </ButtonLink>
            <ButtonLink href="/printers" variant="outline">
              <Printer /> Print farm
            </ButtonLink>
          </div>
        }
      />
      <ProductionBoard
        jobs={jobs}
        printers={printers}
        canWrite={hasRole(user, "staff")}
        initialJobId={job && /^[0-9a-f-]{36}$/i.test(job) ? job : undefined}
      />
    </>
  );
}
