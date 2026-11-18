import type { Metadata } from "next";
import { Info, Printer, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice, TabNav } from "@/components/ui/misc";
import { StatCard } from "@/components/ui/stat-card";
import { PrinterCard } from "@/components/printers/printer-card";
import { PrintRunsTable } from "@/components/printers/print-runs-table";
import { getFilamentOptions, getPrinterStats, listAssignableJobs, listPrinters, listPrintRuns } from "@/lib/data/printers";
import { hasRole, requireUser } from "@/lib/auth";
import { AddPrinterButton } from "./add-printer-button";

export const metadata: Metadata = { title: "Print Farm" };

export default async function PrintersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { tab = "printers" } = await searchParams;
  const canWrite = hasRole(user, "staff");

  const tabs = [
    { id: "printers", label: "Printers", href: "/printers" },
    { id: "history", label: "Print history", href: "/printers?tab=history" },
    { id: "failures", label: "Failure log", href: "/printers?tab=failures" },
  ];

  let body: React.ReactNode;
  if (tab === "history" || tab === "failures") {
    const runs = await listPrintRuns({ status: tab === "failures" ? "failed" : undefined, limit: 100 });
    body = (
      <Card className="overflow-hidden">
        {runs.length === 0 ? (
          <EmptyState
            icon={tab === "failures" ? <TriangleAlert /> : <Printer />}
            title={tab === "failures" ? "No failed prints recorded" : "No finished prints yet"}
            description="Prints appear here once they’re recorded as completed or failed."
          />
        ) : (
          <PrintRunsTable runs={runs} />
        )}
      </Card>
    );
  } else {
    const [printers, assignable, filament, stats] = await Promise.all([
      listPrinters(),
      canWrite ? listAssignableJobs() : Promise.resolve([]),
      canWrite ? getFilamentOptions() : Promise.resolve([]),
      getPrinterStats(),
    ]);
    const counts = {
      available: printers.filter((p) => p.status === "available").length,
      printing: printers.filter((p) => p.status === "printing" || p.status === "paused").length,
      down: printers.filter((p) => p.status === "maintenance" || p.status === "offline").length,
      queued: printers.reduce((s, p) => s + p.queue.length, 0),
    };
    body = (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Available" value={counts.available} tone="brand" />
          <StatCard label="Printing / paused" value={counts.printing} tone="amber" />
          <StatCard label="Maintenance / offline" value={counts.down} tone={counts.down ? "red" : "neutral"} />
          <StatCard label="Jobs queued" value={counts.queued} tone="violet" />
        </div>
        <Notice tone="neutral" icon={<Info />}>
          Printer statuses are updated by your team when prints are started, completed or failed. PrintFlow is not
          connected to live printer monitoring (e.g. Bambu Cloud or Flashforge APIs) — estimated finish times come from
          product print-time estimates.
        </Notice>
        {printers.length === 0 ? (
          <Card>
            <EmptyState icon={<Printer />} title="No printers registered" description="Add your printers to assign jobs and track print history." action={hasRole(user, "admin") ? <AddPrinterButton /> : null} />
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {printers.map((p) => (
              <PrinterCard key={p.id} printer={p} assignable={assignable} filament={filament} canWrite={canWrite} stats={stats[p.id]} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Print Farm"
        description="Printer status, job queues, print history and failures."
        actions={hasRole(user, "admin") ? <AddPrinterButton /> : null}
      />
      <TabNav tabs={tabs} active={tab} className="mb-5" />
      {body}
    </>
  );
}
