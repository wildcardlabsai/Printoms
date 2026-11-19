import { requireUser } from "@/lib/auth";

/** Print views: no app shell, A4 sheets, a toolbar that is hidden when printing. */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="min-h-dvh bg-zinc-200 print:bg-white">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .print-sheet { box-shadow: none !important; margin: 0 !important; break-after: page; }
          .print-sheet:last-child { break-after: auto; }
        }
        .print-sheet { width: 210mm; min-height: 297mm; }
        @media screen and (max-width: 840px) {
          .print-scale { zoom: calc((100vw - 16px) / 210mm); }
        }
      `}</style>
      {children}
    </div>
  );
}
