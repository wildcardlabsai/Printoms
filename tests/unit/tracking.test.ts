import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findCarrier, trackingUrlFor, validateTracking, validateTrackingUrl } from "../../src/lib/integrations/carriers";
import { categoriseError } from "../../src/lib/integrations/fulfilment";
import { IntegrationError } from "../../src/lib/integrations/types";

describe("tracking number validation", () => {
  it("accepts and normalises real-looking numbers", () => {
    const r = validateTracking("Royal Mail", "ab 1234 5678 9gb");
    assert.ok(r.ok && r.normalised === "AB123456789GB" && r.warning === null);
    const ups = validateTracking("UPS", "1Z999AA10123456784");
    assert.ok(ups.ok && ups.warning === null);
  });
  it("rejects missing, placeholder and malformed numbers", () => {
    for (const bad of ["", "   ", "TBC", "N/A", "SAMPLE100001GB", "TEST12345678", "00000000", "12345678", "AB12#4567", "SHORT"]) {
      assert.equal(validateTracking("Royal Mail", bad).ok, false, bad);
    }
  });
  it("warns (but allows) when the format doesn't match the carrier", () => {
    const r = validateTracking("UPS", "AB123456789GB");
    assert.ok(r.ok && r.warning && /UPS/.test(r.warning));
  });
  it("only accepts https tracking links", () => {
    assert.equal(validateTrackingUrl("http://example.com/x").ok, false);
    assert.equal(validateTrackingUrl("not a url").ok, false);
    assert.deepEqual(validateTrackingUrl(""), { ok: true, url: null });
    assert.ok(validateTrackingUrl("https://www.royalmail.com/track").ok);
  });
  it("maps carriers per marketplace and builds standard links", () => {
    assert.equal(findCarrier("DPD").shopify, "DPD UK");
    assert.equal(findCarrier("dhl").shopify, "DHL Express");
    assert.equal(findCarrier("Unknown Courier").id, "other");
    assert.match(trackingUrlFor("Royal Mail", "AB123456789GB")!, /royalmail\.com/);
    assert.equal(trackingUrlFor("Other", "X12345678"), null);
  });
});

describe("fulfilment error categories", () => {
  it("classifies marketplace failures", () => {
    assert.equal(categoriseError(new IntegrationError("x", null, false, 401)).category, "credentials");
    assert.equal(categoriseError(new IntegrationError("Etsy access could not be refreshed. reconnect", null, false, 401)).category, "credentials");
    assert.deepEqual(
      { c: categoriseError(new IntegrationError("busy", null, true, 429)).category, r: categoriseError(new IntegrationError("busy", null, true, 429)).retryable },
      { c: "rate_limited", r: true },
    );
    assert.equal(categoriseError(new IntegrationError("boom", null, true, 503)).category, "marketplace_error");
    assert.equal(categoriseError(new IntegrationError("bad", null, false, 422)).category, "marketplace_rejected");
    assert.equal(categoriseError(new TypeError("fetch failed: socket hang up")).category, "network");
  });
});
