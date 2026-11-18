/**
 * Chart series colours — validated (lightness band, chroma, CVD & normal-vision
 * separation) with the dataviz palette validator. Fixed order, never cycled.
 * Colour follows the entity: Etsy is always orange, Shopify aqua, Manual blue.
 */
export const SERIES = {
  etsy: "#eb6834",
  shopify: "#1baf7a",
  manual: "#2a78d6",
} as const;

export const SEQUENTIAL = "#16825a"; // single-hue magnitude (brand)
export const GRID = "#eceef2";
export const AXIS_TEXT = "#6b717c";
export const SURFACE = "#ffffff";
