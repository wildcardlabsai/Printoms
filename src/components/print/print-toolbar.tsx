"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar({ title, count, back, empty }: { title: string; count: number; back: { href: string; label: string }; empty?: string }) {
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-white/95 px-4 py-3 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-3">
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> {back.label}
        </Link>
        <p className="text-sm font-semibold text-ink">
          {title} <span className="font-normal text-muted">· {count}</span>
        </p>
        <Button className="ml-auto" onClick={() => window.print()} disabled={count === 0}>
          <Printer /> Print
        </Button>
      </div>
      {count === 0 && empty ? <p className="mx-auto mt-2 max-w-[210mm] text-sm text-muted">{empty}</p> : null}
    </div>
  );
}
