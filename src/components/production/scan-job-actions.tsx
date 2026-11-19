"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { moveJobAction } from "@/lib/actions/production";
import type { ProductionStage } from "@/lib/constants";

type Move = { to: ProductionStage; label: string; help?: string };

const MOVES: Partial<Record<ProductionStage, Move[]>> = {
  new_order: [{ to: "ready_to_print", label: "Ready to print" }, { to: "awaiting_preparation", label: "Needs preparation" }],
  awaiting_preparation: [{ to: "ready_to_print", label: "Prepared — ready to print" }],
  printing: [{ to: "quality_check", label: "Print finished → Quality check", help: "Records the print as successful." }],
  quality_check: [{ to: "ready_to_pack", label: "Passed QC → Ready to pack" }],
};

const LINKS: Partial<Record<ProductionStage, { href: string; label: string }[]>> = {
  ready_to_print: [{ href: "/printers", label: "Start it on a printer" }],
  printing: [{ href: "/printers", label: "Print failed? Record it on the printer" }],
  quality_check: [{ href: "/production?job=:id", label: "Failed QC? Record it on the job" }],
  ready_to_pack: [{ href: "/fulfilment", label: "Pack this order" }],
};

export function ScanJobActions({ jobId, stage, canWrite }: { jobId: string; stage: ProductionStage; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<Move | null>(null);
  const [pending, startTransition] = React.useTransition();

  const move = (m: Move, force = false) =>
    startTransition(async () => {
      setError(null);
      const res = await moveJobAction(jobId, m.to, undefined, { force });
      if (!res.ok && res.code === "OUTSTANDING_UNITS") return setConfirm(m);
      if (!res.ok) return setError(res.error);
      setConfirm(null);
      toast({ title: `Moved: ${m.label}` });
      router.refresh();
    });

  const moves = canWrite ? (MOVES[stage] ?? []) : [];
  const links = LINKS[stage] ?? [];

  return (
    <div className="space-y-3">
      <FormError message={error} />
      {confirm ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">Some units haven’t been printed yet. Move anyway?</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>Keep it here</Button>
            <Button size="sm" loading={pending} onClick={() => move(confirm, true)}>Move anyway</Button>
          </div>
        </div>
      ) : null}
      {moves.map((m, i) => (
        <Button key={m.to} size="lg" variant={i === 0 ? "primary" : "outline"} className="w-full justify-between" loading={pending} onClick={() => move(m)}>
          <span className="flex items-center gap-2"><CircleCheck /> {m.label}</span>
          <ArrowRight />
        </Button>
      ))}
      {moves.some((m) => m.help) ? <p className="text-xs text-muted">{moves.find((m) => m.help)!.help}</p> : null}
      {links.map((l) => (
        <ButtonLink key={l.href + l.label} href={l.href.replace(":id", jobId)} variant="outline" size="lg" className="w-full justify-between">
          {l.label} <ArrowRight />
        </ButtonLink>
      ))}
      {!moves.length && !links.length ? <p className="text-sm text-muted">Nothing to do from here at this stage.</p> : null}
      <p className="pt-2 text-center text-xs text-muted">
        <Link href="/production" className="hover:underline">Open the production board</Link>
      </p>
    </div>
  );
}
