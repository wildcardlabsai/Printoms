import type { Metadata } from "next";
import { headers } from "next/headers";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { getTicketJobs, parseIds, qrSvg, type TicketJob } from "@/lib/data/print";
import { getBusinessSettings } from "@/lib/data/settings";
import { resolveSiteUrl } from "@/lib/server-env";
import { ORDER_SOURCE, PRODUCTION_STAGES, type ProductionStage } from "@/lib/constants";
import { externalRef, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Job tickets" };

const PER_SHEET = 4;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ ids?: string; stage?: string }> }) {
  const sp = await searchParams;
  const stage = PRODUCTION_STAGES.some((s) => s.id === sp.stage) ? (sp.stage as ProductionStage) : undefined;
  const ids = parseIds(sp.ids);
  const [jobs, settings, h] = await Promise.all([getTicketJobs({ ids, stage }), getBusinessSettings(), headers()]);
  const origin = resolveSiteUrl(h.get("host") ? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}` : undefined);
  const tz = settings?.timezone ?? "Europe/London";
  const qrs = await Promise.all(jobs.map((j) => qrSvg(`${origin}/scan/job/${j.id}`)));
  const sheets: { job: TicketJob; qr: string }[][] = [];
  jobs.forEach((job, i) => {
    if (i % PER_SHEET === 0) sheets.push([]);
    sheets[sheets.length - 1]!.push({ job, qr: qrs[i]! });
  });
  const stageLabel = stage ? PRODUCTION_STAGES.find((s) => s.id === stage)!.label : null;

  return (
    <>
      <PrintToolbar
        title={stageLabel ? `Job tickets — ${stageLabel}` : "Job tickets"}
        count={jobs.length}
        back={{ href: "/production", label: "Production board" }}
        empty="No jobs to print."
      />
      <div className="print-scale space-y-4 py-4 print:space-y-0 print:py-0">
        {sheets.map((sheet, s) => (
          <section key={s} className="print-sheet mx-auto grid grid-cols-2 grid-rows-2 bg-white shadow-raised" style={{ height: "297mm" }}>
            {sheet.map(({ job, qr }) => (
              <Ticket key={job.id} job={job} qr={qr} tz={tz} />
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

function Ticket({ job, qr, tz }: { job: TicketJob; qr: string; tz: string }) {
  const personalisation = job.item?.personalisation?.trim() || null;
  const size = !personalisation ? "" : personalisation.length <= 40 ? "text-[22pt]" : personalisation.length <= 120 ? "text-[15pt]" : "text-[11pt]";
  const title = job.product?.name ?? job.item?.title ?? "Item";
  const due = job.order.dispatch_by ?? job.due_date;
  const ref = externalRef(job.order);
  const colour = job.colour ?? job.product?.default_colour;
  const material = job.material ?? job.product?.material;
  const notes = [job.notes, job.order.production_notes, job.product?.production_instructions].filter((n): n is string => Boolean(n?.trim()));
  const toPrint = Math.max(job.quantity - job.quantity_printed, 0);

  return (
    <article
      className="flex flex-col overflow-hidden border border-dashed border-zinc-300 p-[6mm] text-[9.5pt] leading-snug text-black"
      data-testid="job-ticket"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[8pt] font-semibold tracking-wider text-zinc-500 uppercase">
            {ORDER_SOURCE[job.order.source].label} · {job.order.order_number}
            {ref ? ` · ${ref}` : ""}
          </p>
          <p className="mt-0.5 text-[15pt] font-bold tracking-tight">{job.job_number}</p>
          <p className="truncate text-zinc-700">{job.order.customer_name}</p>
        </div>
        <div className="shrink-0 text-right">
          {job.priority === "urgent" || job.priority === "high" ? (
            <p className="mb-1 inline-block rounded border border-black px-1.5 text-[8pt] font-bold uppercase">{job.priority}</p>
          ) : null}
          {due ? (
            <p className="text-[8pt] text-zinc-500">
              Dispatch by<br />
              <span className="text-[11pt] font-semibold text-black">{formatDate(due, { timeZone: tz, day: "numeric", month: "short" })}</span>
            </p>
          ) : null}
        </div>
      </header>

      <div className="mt-3 border-t border-zinc-300 pt-2">
        <p className="text-[12pt] font-semibold">{title}</p>
        {job.item?.variant_title ? <p className="text-zinc-700">{job.item.variant_title}</p> : null}
        <p className="mt-1 text-zinc-700">
          <strong className="text-black">Qty {job.quantity}</strong>
          {job.quantity_printed > 0 ? ` · ${job.quantity_printed} printed · ${toPrint} to print` : ""}
          {colour ? ` · ${colour}` : ""}
          {material ? ` · ${material}` : ""}
          {job.printer ? ` · ${job.printer.name}` : ""}
        </p>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-md border-2 border-black p-2">
        <p className="text-[7.5pt] font-semibold tracking-wider text-zinc-500 uppercase">Personalisation</p>
        {personalisation ? (
          <p className={`mt-0.5 font-bold whitespace-pre-wrap [overflow-wrap:anywhere] ${size}`}>{personalisation}</p>
        ) : (
          <p className="mt-0.5 text-zinc-500">None</p>
        )}
      </div>

      <footer className="mt-2 flex items-end gap-3">
        <div className="min-w-0 flex-1 space-y-0.5 text-[8pt] text-zinc-700">
          {notes.slice(0, 3).map((n, i) => (
            <p key={i} className="line-clamp-2 [overflow-wrap:anywhere]">• {n}</p>
          ))}
          {job.order.customer_note ? <p className="line-clamp-2 italic [overflow-wrap:anywhere]">Buyer: “{job.order.customer_note}”</p> : null}
          {job.is_sample ? <p className="font-semibold">SAMPLE DATA — not a real order</p> : null}
        </div>
        <div className="shrink-0 text-center">
          <div className="size-[24mm] [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="mt-0.5 text-[6.5pt] text-zinc-500">Scan to update</p>
        </div>
      </footer>
    </article>
  );
}
