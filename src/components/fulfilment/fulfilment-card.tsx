"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronDown, MapPin, PackageCheck, Send, Sparkles, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SampleBadge, Badge } from "@/components/ui/badge";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { PriorityBadge, ShipmentStatusBadge, SourceBadge } from "@/components/ui/status-badges";
import { useToast } from "@/components/ui/toast";
import { markDispatchedAction, markPackedAction } from "@/lib/actions/fulfilment";
import { pushShipmentAction } from "@/lib/actions/settings";
import { CARRIERS } from "@/lib/constants";
import { addressLines, cn, formatDate, formatDateTime, formatRelative, isOverdue } from "@/lib/utils";
import type { FulfilmentOrder } from "@/lib/data/fulfilment";

export function FulfilmentCard({
  order,
  checklistTemplate,
  connected,
  canWrite,
  defaultOpen,
}: {
  order: FulfilmentOrder;
  checklistTemplate: string[];
  connected: string[];
  canWrite: boolean;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const ref = React.useRef<HTMLDivElement>(null);
  const shipment = order.shipments?.sort((a, b) => (b.dispatched_at ?? "").localeCompare(a.dispatched_at ?? ""))[0];
  const [open, setOpen] = React.useState(Boolean(defaultOpen));
  const savedChecklist = Array.isArray(shipment?.checklist) ? (shipment!.checklist as { label: string; done: boolean }[]) : [];
  const [checklist, setChecklist] = React.useState(
    checklistTemplate.map((label) => ({ label, done: savedChecklist.find((c) => c.label === label)?.done ?? order.status === "packed" })),
  );
  const [packNotes, setPackNotes] = React.useState(shipment?.packaging_notes ?? "");
  const [carrier, setCarrier] = React.useState(shipment?.carrier ?? "Royal Mail");
  const [tracking, setTracking] = React.useState("");
  const [trackingUrl, setTrackingUrl] = React.useState("");
  const [method, setMethod] = React.useState(order.shipping_method ?? "");
  const [cost, setCost] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (defaultOpen) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [defaultOpen]);

  const address = addressLines(order.shipping_address);
  const units = order.order_items.reduce((s, i) => s + i.quantity, 0);
  const allChecked = checklist.every((c) => c.done);
  const overdue = isOverdue(order.dispatch_by, order.status);
  const dispatched = order.status === "dispatched" || order.status === "completed";
  const canPush = shipment && dispatched && order.source !== "manual" && connected.includes(order.source) && shipment.marketplace_push_status !== "sent";

  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        toast({ title: res.message ?? "Done" });
        after?.();
        router.refresh();
      } else setError(res.error ?? "Something went wrong");
    });

  return (
    <Card ref={ref} className={cn("overflow-hidden transition", open && "ring-2 ring-brand-500/25")}>
      <button className="flex w-full items-start gap-3 px-4 py-4 text-left sm:px-5" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{order.order_number}</span>
            <SourceBadge source={order.source} compact />
            <PriorityBadge priority={order.priority} hideNormal />
            {order.is_sample ? <SampleBadge /> : null}
            {shipment && dispatched ? <ShipmentStatusBadge status={shipment.status} /> : null}
          </div>
          <p className="truncate text-sm text-ink-2">
            {order.customer_name} · {units} item{units === 1 ? "" : "s"}
            {order.shipping_method ? ` · ${order.shipping_method}` : ""}
          </p>
          {dispatched ? (
            <p className="text-xs text-muted">
              Dispatched {formatRelative(order.dispatched_at)}
              {order.carrier ? ` · ${order.carrier}` : ""}
              {order.tracking_number ? ` · ${order.tracking_number}` : ""}
            </p>
          ) : order.dispatch_by ? (
            <p className={cn("inline-flex items-center gap-1 text-xs", overdue ? "font-semibold text-red-600" : "text-muted")}>
              <CalendarClock className="size-3.5" /> Dispatch by {formatDate(order.dispatch_by)} ({formatRelative(order.dispatch_by)})
            </p>
          ) : null}
        </div>
        <ChevronDown className={cn("mt-1 size-5 shrink-0 text-faint transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="grid gap-5 border-t border-line bg-subtle/40 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink">Items to pack</p>
              <ul className="space-y-2">
                {order.order_items.map((i) => (
                  <li key={i.id} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm">
                    <p className="font-medium text-ink">
                      <span className="mr-1.5 inline-flex min-w-7 justify-center rounded bg-ink px-1.5 text-xs font-semibold text-white tabular">{i.quantity}×</span>
                      {i.product?.name ?? i.title}
                    </p>
                    {i.variant_title || i.sku ? <p className="mt-0.5 text-xs text-muted">{[i.variant_title, i.sku && `SKU ${i.sku}`].filter(Boolean).join(" · ")}</p> : null}
                    {i.personalisation ? (
                      <p className="mt-1.5 flex gap-1 rounded bg-violet-50 px-2 py-1 text-xs text-violet-900">
                        <Sparkles className="mt-0.5 size-3 shrink-0" /> <span className="whitespace-pre-wrap">{i.personalisation}</span>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3 text-sm">
              <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink"><MapPin className="size-4 text-faint" /> Deliver to</p>
              {address.length ? (
                <address className="text-ink-2 not-italic leading-relaxed">{address.map((l, i) => <span key={i} className="block">{l}</span>)}</address>
              ) : (
                <p className="text-muted">No delivery address on this order</p>
              )}
              {order.customer_email ? <p className="mt-1.5 text-xs text-muted">{order.customer_email}</p> : null}
            </div>
            {order.customer_note || order.production_notes ? (
              <div className="space-y-2 text-sm">
                {order.customer_note ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950"><strong className="font-semibold">Customer:</strong> {order.customer_note}</p> : null}
                {order.production_notes ? <p className="rounded-lg border border-line bg-surface px-3 py-2 text-ink-2"><strong className="font-semibold text-ink">Notes:</strong> {order.production_notes}</p> : null}
              </div>
            ) : null}
            <Link href={`/orders/${order.id}`} className="inline-block text-[13px] font-medium text-brand-700 hover:underline">Open full order →</Link>
          </div>

          <div className="space-y-4">
            <FormError message={error} />
            {dispatched && shipment ? (
              <div className="space-y-3 rounded-xl border border-line bg-surface p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-ink"><Truck className="size-4 text-brand-600" /> Shipment</p>
                <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[13px]">
                  <dt className="text-muted">Carrier</dt><dd className="text-ink">{shipment.carrier ?? "—"}</dd>
                  <dt className="text-muted">Tracking</dt>
                  <dd className="text-ink [overflow-wrap:anywhere]">
                    {shipment.tracking_url ? <a className="text-brand-700 hover:underline" href={shipment.tracking_url} target="_blank" rel="noopener noreferrer">{shipment.tracking_number}</a> : shipment.tracking_number ?? "—"}
                  </dd>
                  <dt className="text-muted">Method</dt><dd className="text-ink">{shipment.shipping_method ?? "—"}</dd>
                  <dt className="text-muted">Dispatched</dt><dd className="text-ink">{formatDateTime(shipment.dispatched_at)}</dd>
                  <dt className="text-muted">Marketplace</dt>
                  <dd>
                    {shipment.marketplace_push_status === "sent" ? <Badge tone="green">Tracking sent {formatRelative(shipment.marketplace_pushed_at)}</Badge>
                      : shipment.marketplace_push_status === "failed" ? <Badge tone="red">Update failed</Badge>
                      : shipment.marketplace_push_status === "pending" ? <Badge tone="amber">Not yet sent</Badge>
                      : <Badge>Not required</Badge>}
                  </dd>
                </dl>
                {shipment.marketplace_push_error ? <p className="text-xs text-red-700 [overflow-wrap:anywhere]">{shipment.marketplace_push_error}</p> : null}
                {canWrite && canPush ? (
                  <Button size="sm" variant="outline" loading={pending} onClick={() => act(() => pushShipmentAction(shipment.id))}>
                    <Send /> Send tracking to {order.source === "etsy" ? "Etsy" : "Shopify"}
                  </Button>
                ) : shipment.marketplace_push_status === "pending" && order.source !== "manual" ? (
                  <p className="text-xs text-muted">Connect {order.source === "etsy" ? "Etsy" : "Shopify"} to send tracking automatically, or mark it shipped on the marketplace.</p>
                ) : null}
              </div>
            ) : canWrite ? (
              <>
                <div className="rounded-xl border border-line bg-surface p-4">
                  <p className="mb-3 flex items-center justify-between text-[13px] font-semibold text-ink">
                    Packing checklist
                    <span className="text-xs font-normal text-muted tabular">{checklist.filter((c) => c.done).length}/{checklist.length}</span>
                  </p>
                  <ul className="space-y-2">
                    {checklist.map((c, i) => (
                      <li key={c.label}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-sm text-ink-2 hover:bg-subtle">
                          <Checkbox
                            className="size-[18px]"
                            checked={c.done}
                            onChange={(e) => setChecklist((list) => list.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))}
                          />
                          <span className={cn(c.done && "text-muted line-through")}>{c.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <Field label="Packaging notes" htmlFor={`pn-${order.id}`} className="mt-3">
                    <Textarea id={`pn-${order.id}`} rows={2} value={packNotes} onChange={(e) => setPackNotes(e.target.value)} placeholder="Box size, gift wrap, inserts…" />
                  </Field>
                  {order.status === "ready_to_pack" ? (
                    <Button
                      className="mt-3 w-full"
                      variant="outline"
                      disabled={!allChecked}
                      loading={pending}
                      onClick={() => act(() => markPackedAction({ order_id: order.id, checklist, packaging_notes: packNotes }))}
                    >
                      <PackageCheck /> {allChecked ? "Mark as packed" : "Complete the checklist to pack"}
                    </Button>
                  ) : (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-brand-700"><PackageCheck className="size-4" /> Packed</p>
                  )}
                </div>

                <div className="rounded-xl border border-line bg-surface p-4">
                  <p className="mb-3 text-[13px] font-semibold text-ink">Dispatch</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Carrier" htmlFor={`c-${order.id}`}>
                      <Select id={`c-${order.id}`} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                        {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </Select>
                    </Field>
                    <Field label="Tracking number" htmlFor={`t-${order.id}`}>
                      <Input id={`t-${order.id}`} value={tracking} onChange={(e) => setTracking(e.target.value)} autoComplete="off" />
                    </Field>
                    <Field label="Shipping method" htmlFor={`m-${order.id}`}>
                      <Input id={`m-${order.id}`} value={method} onChange={(e) => setMethod(e.target.value)} />
                    </Field>
                    <Field label="Postage cost" htmlFor={`pc-${order.id}`} hint="Used in estimated profit">
                      <Input id={`pc-${order.id}`} type="number" min={0} step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
                    </Field>
                    <Field label="Tracking link" htmlFor={`u-${order.id}`} className="sm:col-span-2">
                      <Input id={`u-${order.id}`} type="url" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://" />
                    </Field>
                  </div>
                  {!tracking ? <p className="mt-2 text-xs text-amber-700">No tracking number — the marketplace can’t be updated with tracking.</p> : null}
                  <Button
                    className="mt-3 w-full"
                    size="lg"
                    loading={pending}
                    onClick={() =>
                      act(() =>
                        markDispatchedAction({
                          order_id: order.id,
                          carrier,
                          tracking_number: tracking,
                          shipping_method: method,
                          tracking_url: trackingUrl,
                          shipping_cost: cost,
                        }),
                      )
                    }
                  >
                    <Truck /> Mark as dispatched
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">You have read-only access.</p>
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
