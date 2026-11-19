import type { Database } from "@/types/database";

type Enums = Database["public"]["Enums"];
export type OrderStatus = Enums["order_status"];
export type OrderSource = Enums["order_source"];
export type PaymentStatus = Enums["payment_status"];
export type ProductionStage = Enums["production_stage"];
export type PriorityLevel = Enums["priority_level"];
export type PrinterStatus = Enums["printer_status"];
export type PrintRunStatus = Enums["print_run_status"];
export type IntegrationProvider = Enums["integration_provider"];
export type IntegrationStatus = Enums["integration_status"];
export type SyncStatus = Enums["sync_status"];
export type ShipmentStatus = Enums["shipment_status"];
export type UserRole = Enums["user_role"];

export type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "violet" | "orange" | "sky" | "slate";

type Meta = { label: string; tone: Tone };

export const ORDER_STATUS: Record<OrderStatus, Meta> = {
  new: { label: "New", tone: "blue" },
  in_production: { label: "In production", tone: "violet" },
  ready_to_pack: { label: "Ready to pack", tone: "amber" },
  packed: { label: "Packed", tone: "orange" },
  dispatched: { label: "Dispatched", tone: "green" },
  completed: { label: "Completed", tone: "slate" },
  on_hold: { label: "On hold", tone: "red" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
export const ORDER_STATUSES = Object.keys(ORDER_STATUS) as OrderStatus[];

export const PAYMENT_STATUS: Record<PaymentStatus, Meta> = {
  paid: { label: "Paid", tone: "green" },
  pending: { label: "Pending", tone: "amber" },
  partially_paid: { label: "Part paid", tone: "amber" },
  partially_refunded: { label: "Part refunded", tone: "orange" },
  refunded: { label: "Refunded", tone: "red" },
  voided: { label: "Voided", tone: "neutral" },
  unknown: { label: "Unknown", tone: "neutral" },
};
export const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS) as PaymentStatus[];

export const ORDER_SOURCE: Record<OrderSource, Meta & { short: string }> = {
  etsy: { label: "Etsy", short: "Etsy", tone: "orange" },
  shopify: { label: "Shopify", short: "Shopify", tone: "green" },
  vinted: { label: "Vinted", short: "Vinted", tone: "sky" },
  manual: { label: "Manual", short: "Manual", tone: "slate" },
};

export const PRODUCTION_STAGES: { id: ProductionStage; label: string; tone: Tone; description: string }[] = [
  { id: "new_order", label: "New Order", tone: "blue", description: "Just received" },
  { id: "awaiting_preparation", label: "Awaiting Preparation", tone: "sky", description: "Files, colours or personalisation to prepare" },
  { id: "ready_to_print", label: "Ready to Print", tone: "violet", description: "Prepared and waiting for a printer" },
  { id: "printing", label: "Printing", tone: "amber", description: "On a printer now" },
  { id: "quality_check", label: "Quality Check", tone: "orange", description: "Inspect before packing" },
  { id: "ready_to_pack", label: "Ready to Pack", tone: "green", description: "Passed QC" },
  { id: "dispatched", label: "Dispatched", tone: "slate", description: "Shipped to customer" },
  { id: "completed", label: "Completed", tone: "neutral", description: "Closed" },
  { id: "on_hold", label: "On Hold", tone: "red", description: "Blocked — needs attention" },
];
export const STAGE_META = Object.fromEntries(PRODUCTION_STAGES.map((s) => [s.id, s])) as Record<
  ProductionStage,
  (typeof PRODUCTION_STAGES)[number]
>;

export const PRIORITY: Record<PriorityLevel, Meta & { rank: number }> = {
  urgent: { label: "Urgent", tone: "red", rank: 4 },
  high: { label: "High", tone: "orange", rank: 3 },
  normal: { label: "Normal", tone: "neutral", rank: 2 },
  low: { label: "Low", tone: "slate", rank: 1 },
};
export const PRIORITIES = ["urgent", "high", "normal", "low"] as PriorityLevel[];

export const PRINTER_STATUS: Record<PrinterStatus, Meta> = {
  available: { label: "Available", tone: "green" },
  printing: { label: "Printing", tone: "amber" },
  paused: { label: "Paused", tone: "sky" },
  maintenance: { label: "Maintenance", tone: "orange" },
  offline: { label: "Offline", tone: "neutral" },
};
export const PRINTER_STATUSES = Object.keys(PRINTER_STATUS) as PrinterStatus[];

export const PRINT_RUN_STATUS: Record<PrintRunStatus, Meta> = {
  printing: { label: "Printing", tone: "amber" },
  succeeded: { label: "Succeeded", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const INTEGRATION_STATUS: Record<IntegrationStatus, Meta> = {
  not_connected: { label: "Not connected", tone: "neutral" },
  connected: { label: "Connected", tone: "green" },
  error: { label: "Error", tone: "red" },
  disabled: { label: "Disabled", tone: "slate" },
};

export const SYNC_STATUS: Record<SyncStatus, Meta> = {
  running: { label: "Running", tone: "blue" },
  success: { label: "Success", tone: "green" },
  partial: { label: "Partial", tone: "amber" },
  failed: { label: "Failed", tone: "red" },
};

export const SHIPMENT_STATUS: Record<ShipmentStatus, Meta> = {
  pending: { label: "Pending", tone: "neutral" },
  packed: { label: "Packed", tone: "orange" },
  dispatched: { label: "Dispatched", tone: "green" },
  delivered: { label: "Delivered", tone: "slate" },
  returned: { label: "Returned", tone: "red" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const ROLE_LABEL: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  viewer: "Viewer",
};
export const ROLE_RANK: Record<UserRole, number> = { owner: 4, admin: 3, staff: 2, viewer: 1 };

export const MATERIALS = ["PLA", "PLA+", "PETG", "TPU", "ABS", "ASA", "Silk PLA", "Matte PLA", "PLA-CF", "PETG-CF"];

export const CARRIERS = ["Royal Mail", "Evri", "DPD", "Parcelforce", "UPS", "DHL", "FedEx", "Yodel", "Other"];

export const FAILURE_REASONS = [
  "Bed adhesion / warping",
  "Spaghetti / detached print",
  "Layer shift",
  "Nozzle clog / under-extrusion",
  "Filament ran out / tangled",
  "Stringing / poor surface quality",
  "Wrong colour or material",
  "Power or firmware issue",
  "Failed quality check",
];
