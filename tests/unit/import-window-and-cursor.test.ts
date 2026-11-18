import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allowedImportOptions, clampSince, maxImportDays } from "../../src/lib/integrations/import-window";
import { validateResyncRequest } from "../../src/lib/integrations/resync";
import { computeNextCursor, maxTimestamp } from "../../src/lib/integrations/sync";

describe("historical import windows", () => {
  it("Shopify is limited to 60 days without read_all_orders", () => {
    assert.equal(maxImportDays("shopify", ["read_orders"]), 60);
    assert.deepEqual(allowedImportOptions("shopify", ["read_orders"]), [14, 30, 60]);
    assert.equal(maxImportDays("shopify", null), 60);
  });
  it("Shopify allows a year with read_all_orders", () => {
    assert.equal(maxImportDays("shopify", ["read_orders", "read_all_orders"]), 365);
    assert.deepEqual(allowedImportOptions("shopify", ["read_all_orders"]), [14, 30, 60, 90, 180, 365]);
  });
  it("Etsy allows the full window", () => assert.equal(maxImportDays("etsy", []), 365));
  it("clamps requests older than the permitted history", () => {
    const now = Date.parse("2026-11-19T00:00:00Z");
    const r = clampSince("shopify", [], new Date(now - 200 * 86_400_000), now);
    assert.equal(r.clamped, true);
    assert.equal(r.since.toISOString(), new Date(now - 60 * 86_400_000).toISOString());
    assert.equal(clampSince("etsy", [], new Date(now - 200 * 86_400_000), now).clamped, false);
  });
});

describe("sync cursor safety", () => {
  it("advances to the high-water mark when nothing failed", () => {
    assert.equal(computeNextCursor("2026-11-10T00:00:00Z", []), "2026-11-10T00:00:00Z");
  });
  it("never moves past the earliest held failure", () => {
    assert.equal(
      computeNextCursor("2026-11-10T00:00:00Z", ["2026-11-08T05:00:00.000Z", "2026-11-09T00:00:00Z"]),
      "2026-11-08T05:00:00.000Z",
    );
  });
  it("compares instants, not strings (mixed timestamp formats)", () => {
    assert.equal(maxTimestamp("2026-11-10T10:00:00+00:00", "2026-11-10T09:30:00.000Z"), "2026-11-10T10:00:00+00:00");
    assert.equal(computeNextCursor("2026-11-10T10:00:00+00:00", ["2026-11-10T10:00:00.500Z"]), "2026-11-10T10:00:00+00:00");
  });
  it("handles a run where only failures were seen", () => {
    assert.equal(computeNextCursor(null, ["2026-11-01T00:00:00Z"]), "2026-11-01T00:00:00Z");
  });
});

describe("resync request validation", () => {
  const now = Date.parse("2026-11-19T00:00:00Z");
  it("requires explicit confirmation", () => {
    assert.equal(validateResyncRequest({ days: 30 }, "etsy", { scopes: [], settings: {} }, now).ok, false);
    assert.equal(validateResyncRequest(null, "etsy", { scopes: [], settings: {} }, now).ok, false);
  });
  it("rejects windows the permissions can't serve", () => {
    const r = validateResyncRequest({ confirm: true, days: 365 }, "shopify", { scopes: ["read_orders"], settings: {} }, now);
    assert.equal(r.ok, false);
    assert.equal(validateResyncRequest({ confirm: true, days: 365 }, "shopify", { scopes: ["read_all_orders"], settings: {} }, now).ok, true);
    assert.equal(validateResyncRequest({ confirm: true, days: 45 }, "etsy", { scopes: [], settings: {} }, now).ok, false);
  });
  it("computes the window start", () => {
    const r = validateResyncRequest({ confirm: true, days: 30 }, "etsy", { scopes: [], settings: {} }, now);
    assert.ok(r.ok && r.since.getTime() === now - 30 * 86_400_000);
  });
  it("resumes a paused resync with an overlap", () => {
    const r = validateResyncRequest({ confirm: true, resume: true }, "etsy", { scopes: [], settings: { pending_resync: { from: "2026-11-10T00:00:00Z" } } }, now);
    assert.ok(r.ok && r.since.toISOString() === "2026-11-09T23:55:00.000Z");
    assert.equal(validateResyncRequest({ confirm: true, resume: true }, "etsy", { scopes: [], settings: {} }, now).ok, false);
  });
});
