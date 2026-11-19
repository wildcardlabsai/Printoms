/**
 * Chart series colours — validated (lightness band, chroma, CVD & normal-vision
 * separation) with the dataviz palette validator. Fixed order, never cycled.
 * Colour follows the entity: Etsy is always orange, Shopify aqua, Vinted magenta,
 * Manual blue. Vinted's #c2479b passes all checks against the other three
 * (all-pairs CVD ΔE ≥ 9.2, normal-vision ΔE ≥ 19.1).
 */
export const SERIES = {
  etsy: "#eb6834",
  shopify: "#1baf7a",
  vinted: "#c2479b",
  manual: "#2a78d6",
} as const;

export const SEQUENTIAL = "#16825a"; // single-hue magnitude (brand)
export const GRID = "#eceef2";
export const AXIS_TEXT = "#6b717c";
export const SURFACE = "#ffffff";
