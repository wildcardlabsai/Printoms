import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/empty-state";
import { PrinterCard } from "@/components/printers/printer-card";
import { PrintRunsTable } from "@/components/printers/print-runs-table";
import { NotesPanel } from "@/components/orders/notes-panel";
import { getNotes } from "@/lib/data/orders";
import { getFilamentOptions, getPrinter, getPrinterStats, listAssignableJobs, listPrintRuns } from "@/lib/data/printers";
import { hasRole, requireUser } from "@/lib/auth";
import { EditPrinterButton } from "../add-printer-button";

export const metadata: Metadata = { title: "Printer" };

export default async function PrinterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canWrite = hasRole(user, "staff");
  const printer = await getPrinter(id);
  if (!printer) notFound();
  const [runs, assignable, filament, stats, notes] = await Promise.all([
    listPrintRuns({ printerId: id, limit: 100 }),
    canWrite ? listAssignableJobs() : Promise.resolve([]),
    canWrite ? getFilamentOptions() : Promise.resolve([]),
    getPrinterStats(),
    getNotes("printer", id),
  ]);
  const s = stats[id];

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/printers" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Print farm
        </Link>
        {canWrite ? (
          <EditPrinterButton
            id={printer.id}
            initial={{
              name: printer.name,
              manufacturer: printer.manufacturer,
              model: printer.model,
              printer_type: printer.printer_type,
              build_volume_x_mm: printer.build_volume_x_mm,
              build_volume_y_mm: printer.build_volume_y_mm,
              build_volume_z_mm: printer.build_volume_z_mm,
              nozzle_size_mm: printer.nozzle_size_mm,
              supported_materials: printer.supported_materials,
              has_multi_material: printer.has_multi_material,
              maintenance_notes: printer.maintenance_notes,
              is_active: printer.is_active,
            }}
          />
        ) : null}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <PrinterCard printer={printer} assignable={assignable} filament={filament} canWrite={canWrite} stats={s} detailed />
          <Card className="overflow-hidden">
            <CardHeader icon={<History />} title="Print history" description="Every attempt on this printer, including failures." />
            {runs.length ? <PrintRunsTable runs={runs} showPrinter={false} /> : <EmptyState compact title="No prints recorded yet" />}
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Specification" />
            <CardContent>
              <DescriptionList
                items={[
                  { label: "Manufacturer", value: printer.manufacturer },
                  { label: "Model", value: printer.model },
                  { label: "Type", value: printer.printer_type },
                  {
                    label: "Build volume",
                    value: printer.build_volume_x_mm ? `${printer.build_volume_x_mm} × ${printer.build_volume_y_mm} × ${printer.build_volume_z_mm} mm` : "—",
                  },
                  { label: "Nozzle", value: printer.nozzle_size_mm ? `${printer.nozzle_size_mm} mm` : "—" },
                  { label: "Materials", value: printer.supported_materials.join(", ") || "—" },
                  { label: "Multi-material", value: printer.has_multi_material ? "Yes" : "No" },
                  { label: "Monitoring", value: "Manual (no live connection)" },
                  { label: "Last 30 days", value: s ? `${s.runs} runs · ${s.failed} failed · ${s.hours.toFixed(1)} h` : "No runs" },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader icon={<Wrench />} title="Maintenance log" />
            <CardContent>
              {printer.maintenance_notes ? (
                <p className="text-sm whitespace-pre-wrap text-ink-2">{printer.maintenance_notes}</p>
              ) : (
                <p className="text-sm text-muted">No maintenance notes. Notes added when setting maintenance/offline appear here.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Team notes" />
            <CardContent>
              <NotesPanel entityType="printer" entityId={printer.id} notes={notes} currentUserId={user.id} canWrite={canWrite} revalidate={`/printers/${printer.id}`} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
