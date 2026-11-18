"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Database, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { loadSampleDataAction, purgeSampleDataAction } from "@/lib/actions/sample-data";

export function SampleDataControls({ hasSample }: { hasSample: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [confirm, setConfirm] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const run = (fn: typeof loadSampleDataAction) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast({ title: res.message ?? "Done" });
        setConfirm(false);
        router.refresh();
      } else toast({ title: res.error, tone: "error" });
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => run(loadSampleDataAction)} loading={pending && !confirm} disabled={hasSample}>
        <Database /> Load sample data
      </Button>
      <Button variant="danger-outline" onClick={() => setConfirm(true)} disabled={!hasSample}>
        <Trash2 /> Remove sample data
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent size="sm" title="Remove all sample data?" description="Only records flagged as sample are deleted. Real orders, products and stock are not affected.">
          <DialogBody>
            <p className="text-sm text-ink-2">Sample orders, their production jobs, print history, sample customers, products and filament spools will be permanently removed.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" loading={pending} onClick={() => run(purgeSampleDataAction)}>Remove sample data</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
