import { Badge } from "@/components/ui/badge";
import {
  INTEGRATION_STATUS,
  ORDER_SOURCE,
  ORDER_STATUS,
  PAYMENT_STATUS,
  PRINTER_STATUS,
  PRINT_RUN_STATUS,
  PRIORITY,
  STAGE_META,
  SYNC_STATUS,
  SHIPMENT_STATUS,
  type IntegrationStatus,
  type OrderSource,
  type OrderStatus,
  type PaymentStatus,
  type PrinterStatus,
  type PrintRunStatus,
  type PriorityLevel,
  type ProductionStage,
  type SyncStatus,
  type ShipmentStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const m = ORDER_STATUS[status];
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const m = PAYMENT_STATUS[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function StageBadge({ stage }: { stage: ProductionStage }) {
  const m = STAGE_META[stage];
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

export function PriorityBadge({ priority, hideNormal }: { priority: PriorityLevel; hideNormal?: boolean }) {
  if (hideNormal && priority === "normal") return null;
  const m = PRIORITY[priority];
  return <Badge tone={m.tone} size="sm">{m.label}</Badge>;
}

export function PrinterStatusBadge({ status }: { status: PrinterStatus }) {
  const m = PRINTER_STATUS[status];
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

export function PrintRunBadge({ status }: { status: PrintRunStatus }) {
  const m = PRINT_RUN_STATUS[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  const m = INTEGRATION_STATUS[status];
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const m = SYNC_STATUS[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const m = SHIPMENT_STATUS[status];
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

/** Marketplace mark: small coloured glyph + label. Not an official logo. */
export function SourceBadge({ source, compact, className }: { source: OrderSource; compact?: boolean; className?: string }) {
  const m = ORDER_SOURCE[source];
  const glyph = {
    etsy: "bg-orange-500 text-white",
    shopify: "bg-brand-600 text-white",
    vinted: "bg-[#c2479b] text-white",
    manual: "bg-zinc-500 text-white",
  }[source];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2", className)}>
      <span className={cn("inline-flex size-[18px] items-center justify-center rounded-[5px] text-[10px] font-bold", glyph)} aria-hidden>
        {m.label[0]}
      </span>
      {compact ? <span className="sr-only">{m.label}</span> : m.label}
    </span>
  );
}
