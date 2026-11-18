/**
 * Carrier registry: one place that maps a PrintFlow carrier to what each
 * marketplace expects, plus tracking-number formats and tracking links.
 *
 * NOTE (requires live verification): Etsy's createReceiptShipment and Shopify's
 * trackingInfo.company accept free-text carrier names and recognise known ones
 * to build tracking links. The names below are the commonly used display names;
 * confirm against a live account before relying on automatic tracking links.
 */
export type Carrier = {
  id: string;
  label: string;
  etsy: string;
  shopify: string;
  /** Known formats (after normalisation). A mismatch is a warning, not an error. */
  patterns: RegExp[];
  trackingUrl?: (n: string) => string;
};

const S10 = /^[A-Z]{2}\d{9}[A-Z]{2}$/; // UPU international format, e.g. AB123456789GB

export const CARRIER_REGISTRY: Carrier[] = [
  { id: "royal-mail", label: "Royal Mail", etsy: "Royal Mail", shopify: "Royal Mail", patterns: [S10, /^[A-Z0-9]{16}$/], trackingUrl: (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${n}` },
  { id: "evri", label: "Evri", etsy: "Evri", shopify: "Evri", patterns: [/^[A-Z0-9]{16}$/], trackingUrl: (n) => `https://www.evri.com/track/parcel/${n}` },
  { id: "dpd", label: "DPD", etsy: "DPD", shopify: "DPD UK", patterns: [/^\d{14}$/, /^\d{10}$/], trackingUrl: (n) => `https://track.dpd.co.uk/parcels/${n}` },
  { id: "parcelforce", label: "Parcelforce", etsy: "Parcelforce", shopify: "Parcelforce", patterns: [/^[A-Z]{2}\d{7}$/, S10], trackingUrl: (n) => `https://www.parcelforce.com/track-trace?trackNumber=${n}` },
  { id: "ups", label: "UPS", etsy: "UPS", shopify: "UPS", patterns: [/^1Z[0-9A-Z]{16}$/], trackingUrl: (n) => `https://www.ups.com/track?tracknum=${n}` },
  { id: "dhl", label: "DHL", etsy: "DHL", shopify: "DHL Express", patterns: [/^\d{10}$/, /^JJD\d{10,}$/] },
  { id: "fedex", label: "FedEx", etsy: "FedEx", shopify: "FedEx", patterns: [/^\d{12}$/, /^\d{15}$/, /^\d{20}$/] },
  { id: "yodel", label: "Yodel", etsy: "Yodel", shopify: "Yodel", patterns: [/^JD\d{16,18}$/, /^[A-Z0-9]{16}$/] },
  { id: "other", label: "Other", etsy: "other", shopify: "Other", patterns: [] },
];

export const CARRIER_LABELS = CARRIER_REGISTRY.map((c) => c.label);

export function findCarrier(labelOrId: string | null | undefined): Carrier {
  const v = (labelOrId ?? "").trim().toLowerCase();
  return CARRIER_REGISTRY.find((c) => c.id === v || c.label.toLowerCase() === v) ?? CARRIER_REGISTRY.at(-1)!;
}

export function normaliseTracking(value: string | null | undefined) {
  return (value ?? "").toUpperCase().replace(/[\s-]+/g, "");
}

const PLACEHOLDER = /^(TBC|TBA|NA|N\/A|NONE|NULL|UNKNOWN|PENDING|TEST|SAMPLE|EXAMPLE|DUMMY|XXX|NOTRACKING|UNTRACKED)/i;

export type TrackingCheck =
  | { ok: true; normalised: string; warning: string | null }
  | { ok: false; error: string };

/** Validate a tracking number before it is stored or sent to a marketplace. */
export function validateTracking(carrier: string | null | undefined, value: string | null | undefined): TrackingCheck {
  const raw = (value ?? "").trim();
  if (!raw) return { ok: false, error: "A tracking number is required to update the marketplace." };
  const n = normaliseTracking(raw);
  if (!/^[A-Z0-9]+$/.test(n)) return { ok: false, error: "Tracking numbers can only contain letters and numbers." };
  if (n.length < 8 || n.length > 40) return { ok: false, error: "That doesn’t look like a tracking number (8–40 letters and numbers)." };
  if (PLACEHOLDER.test(n) || /^(.)\1+$/.test(n) || /^(0123456789|123456789|12345678)/.test(n)) {
    return { ok: false, error: "That looks like a placeholder, not a real tracking number." };
  }
  const c = findCarrier(carrier);
  const warning =
    c.patterns.length && !c.patterns.some((p) => p.test(n))
      ? `This doesn’t match the usual ${c.label} format — double-check it before sending.`
      : null;
  return { ok: true, normalised: n, warning };
}

export type UrlCheck = { ok: true; url: string | null } | { ok: false; error: string };

export function validateTrackingUrl(value: string | null | undefined): UrlCheck {
  const v = (value ?? "").trim();
  if (!v) return { ok: true, url: null };
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return { ok: false, error: "Tracking links must start with https://" };
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false, error: "That tracking link isn’t a valid URL." };
  }
}

/** Use the given link, or build the carrier's standard tracking link. */
export function trackingUrlFor(carrier: string | null | undefined, tracking: string, given?: string | null) {
  if (given) return given;
  return findCarrier(carrier).trackingUrl?.(tracking) ?? null;
}
