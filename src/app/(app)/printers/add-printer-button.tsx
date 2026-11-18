"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrinterFormDialog, type PrinterFormValues } from "@/components/printers/printer-form-dialog";

export function AddPrinterButton() {
  return <PrinterFormDialog trigger={(open) => <Button onClick={open}><Plus /> Add printer</Button>} />;
}

export function EditPrinterButton({ id, initial }: { id: string; initial: PrinterFormValues }) {
  return (
    <PrinterFormDialog
      printerId={id}
      initial={initial}
      trigger={(open) => <Button variant="outline" onClick={open}>Edit printer</Button>}
    />
  );
}
