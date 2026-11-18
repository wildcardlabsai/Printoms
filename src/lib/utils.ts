import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEFAULT_LOCALE = "en-GB";

export function formatCurrency(amount: number | string | null | undefined, currency = "GBP", opts?: { compact?: boolean }) {
  const value = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  try {
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: "currency",
      currency: currency || "GBP",
      notation: opts?.compact ? "compact" : "standard",
      maximumFractionDigits: opts?.compact ? 1 : 2,
      minimumFractionDigits: opts?.compact ? 0 : 2,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `${currency} ${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
  }
}

export function formatNumber(value: number | string | null | undefined, maximumFractionDigits = 0) {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat(DEFAULT_LOCALE, { maximumFractionDigits }).format(Number.isFinite(n) ? n : 0);
}

export function formatDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, opts ?? { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined) {
  return formatDate(value, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatShortDate(value: string | Date | null | undefined) {
  return formatDate(value, { day: "numeric", month: "short" });
}

/** "in 3 hours", "2 days ago" */
export function formatRelative(value: string | Date | null | undefined, now: Date = new Date()) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: "auto" });
  const minute = 60_000, hour = 60 * minute, day = 24 * hour;
  if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), "day");
  return formatDate(d);
}

export function formatMinutes(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function formatGrams(grams: number | string | null | undefined) {
  const g = typeof grams === "string" ? Number(grams) : grams;
  if (g == null || !Number.isFinite(g)) return "—";
  if (Math.abs(g) >= 1000) return `${(g / 1000).toFixed(2).replace(/\.?0+$/, "")} kg`;
  return `${Math.round(g)} g`;
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Add business days (Mon–Fri) to a date. */
export function addBusinessDays(date: Date, days: number) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

export function isOverdue(dispatchBy: string | null | undefined, status?: string | null) {
  if (!dispatchBy) return false;
  if (status && ["dispatched", "completed", "cancelled"].includes(status)) return false;
  return new Date(dispatchBy).getTime() < Date.now();
}

export type Address = {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  phone?: string | null;
};

export function addressLines(addr: unknown): string[] {
  if (!addr || typeof addr !== "object") return [];
  const a = addr as Address;
  return [a.name, a.line1, a.line2, [a.city, a.region].filter(Boolean).join(", "), a.postal_code, a.country_code]
    .map((v) => (v ?? "").toString().trim())
    .filter(Boolean);
}

/** Marketplace order number for display, without a duplicated leading "#". */
export function externalRef(order: { external_order_number?: string | null; external_order_id?: string | null }) {
  const raw = order.external_order_number ?? order.external_order_id;
  if (!raw) return null;
  const tail = raw.startsWith("gid://") ? raw.split("/").pop()! : raw;
  return `#${tail.replace(/^#/, "")}`;
}
