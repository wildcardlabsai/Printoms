import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isBlankPersonalisation, isPersonalisationLabel, splitOptions } from "../../src/lib/integrations/personalisation";

describe("isPersonalisationLabel", () => {
  const personal = [
    "Personalisation",
    "Personalization",
    "personalization",
    "Add your personalization",
    "Personalised message",
    "Personalized Message",
    "Custom text",
    "Custom Message",
    "Custom name",
    "Name to engrave",
    "Text to engrave",
    "Engraving",
    "Enter your name",
    "Please enter the names",
    "Your name",
    "Pet's name",
    "Child's Name",
    "Names for the sign",
    "Name",
    "Initials",
    "Monogram",
    "Gift message",
    "Message",
    "Buyer instructions",
    "Special instructions",
    "Note to seller",
    "Wording",
  ];
  for (const label of personal) {
    it(`treats "${label}" as personalisation`, () => assert.equal(isPersonalisationLabel(label), true));
  }

  const variations = ["Size", "Colour", "Color", "Primary color", "Material", "Style", "Finish", "Font", "Font style", "Quantity", "Pack size", "Plant pot size", "Height", "Shape", "Design", "Base", "Format", ""];
  for (const label of variations) {
    it(`keeps "${label}" as a variation`, () => assert.equal(isPersonalisationLabel(label), false));
  }
});

describe("isBlankPersonalisation", () => {
  it("recognises Etsy's placeholder for skipped optional personalisation", () => {
    assert.equal(isBlankPersonalisation("Not requested on this item."), true);
    assert.equal(isBlankPersonalisation("Not requested on this item"), true);
    assert.equal(isBlankPersonalisation("  "), true);
  });
  it("keeps real values, including the word None", () => {
    assert.equal(isBlankPersonalisation("None"), false);
    assert.equal(isBlankPersonalisation("Amelia"), false);
  });
});

describe("splitOptions", () => {
  it("returns the bare value for a single generic Personalisation option", () => {
    const r = splitOptions([
      { name: "Colour", value: "Sage" },
      { name: "Personalization", value: "Amelia" },
    ]);
    assert.equal(r.personalisation, "Amelia");
    assert.deepEqual(r.variations, [{ name: "Colour", value: "Sage" }]);
  });

  it("keeps question labels for multi-question personalisation", () => {
    const r = splitOptions([
      { name: "Name to engrave", value: "Leo" },
      { name: "Size", value: "Large" },
      { name: "Gift message", value: "Happy birthday!" },
    ]);
    assert.equal(r.personalisation, "Name to engrave: Leo\nGift message: Happy birthday!");
    assert.deepEqual(r.variations, [{ name: "Size", value: "Large" }]);
  });

  it("keeps a descriptive label even when there is only one question", () => {
    assert.equal(splitOptions([{ name: "Enter your name", value: "Isla" }]).personalisation, "Enter your name: Isla");
  });

  it("drops skipped personalisation placeholders but keeps variations", () => {
    const r = splitOptions([
      { name: "Personalization", value: "Not requested on this item." },
      { name: "Colour", value: "Black" },
    ]);
    assert.equal(r.personalisation, null);
    assert.deepEqual(r.variations, [{ name: "Colour", value: "Black" }]);
  });

  it("does not treat unknown options as personalisation", () => {
    const r = splitOptions([{ name: "Hook type", value: "Brass" }]);
    assert.equal(r.personalisation, null);
    assert.equal(r.variations.length, 1);
  });
});
