/**
 * Classifies marketplace option labels (Etsy variation names, Shopify line-item
 * property keys) as buyer personalisation or ordinary product variations.
 *
 * Rules, in order:
 *  1. Known variation labels (size, colour, material…) are always variations.
 *  2. Labels that describe free-text buyer input (personalisation, custom text,
 *     name to engrave, enter your name, message, initials…) are personalisation.
 *  3. Anything else stays a variation — we never assume an option is
 *     personalisation just because we don't recognise it.
 *
 * Placeholder values Etsy uses when an optional personalisation was left blank
 * ("Not requested on this item.") are treated as no personalisation.
 */

const VARIATION_LABELS =
  /^(size|sizes|colou?rs?|primary colou?r|secondary colou?r|material|materials|style|styles|finish|length|width|height|depth|diameter|dimensions?|quantity|qty|pack|pack size|set|set size|type|format|option|options|variant|variation|model|shape|pattern|design|theme|scent|font|font style|font colou?r|text colou?r|thread colou?r|filament|plastic|weight|edition|bundle|frame|base|stand)$/i;

const PERSONALISATION_PATTERNS: RegExp[] = [
  /personali[sz](ation|ed|e)\b/i,
  /\bcustom(i[sz]ed|i[sz]ation)?\s+(text|message|name|names|wording|words|engraving|inscription|request|note|details|lettering)\b/i,
  /\bengrav(e|ed|ing)\b/i,
  /\binscription\b/i,
  /\bmonogram\b/i,
  /\binitials?\b/i,
  /\bwording\b/i,
  /\blettering\b/i,
  /\b(enter|add|type|write|provide)\b.*\b(name|names|text|message|initials|wording|date|details)\b/i,
  /\b(your|their|child'?s|baby'?s|pet'?s|dog'?s|cat'?s|recipient'?s?|bride'?s|groom'?s|couple'?s)\s+(names?|text|message|initials|details)\b/i,
  /\bnames?\s+(to|for|on)\b/i,
  /^names?$/i,
  /\b(gift|card|special|custom|personal|personalised|personalized)\s+(message|note)\b/i,
  /^message$/i,
  /\bbuyer\s+(instructions|notes?|request)\b/i,
  /\bnote\s+(to|for)\s+(seller|maker)\b/i,
  /\b(special|custom)\s+(instructions|requests?)\b/i,
];

const BLANK_VALUES = /^(not requested on this item\.?|not requested\.?|no personali[sz]ation(\s+requested)?\.?)$/i;

export function isPersonalisationLabel(label: string | null | undefined): boolean {
  const l = (label ?? "").trim();
  if (!l) return false;
  if (VARIATION_LABELS.test(l)) return false;
  return PERSONALISATION_PATTERNS.some((re) => re.test(l));
}

export function isBlankPersonalisation(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v === "" || BLANK_VALUES.test(v);
}

const GENERIC_LABEL = /^personali[sz]ation$/i;

export type LabelledValue = { name: string; value: string };

/**
 * Split labelled options into personalisation text and display variations.
 * Personalisation keeps its question label unless it's the generic
 * "Personalisation" label, so multi-question personalisation stays readable.
 */
export function splitOptions(options: LabelledValue[]): { personalisation: string | null; variations: LabelledValue[] } {
  const personal: LabelledValue[] = [];
  const variations: LabelledValue[] = [];
  for (const o of options) {
    if (isPersonalisationLabel(o.name)) {
      if (!isBlankPersonalisation(o.value)) personal.push(o);
    } else {
      variations.push(o);
    }
  }
  const single = personal.length === 1 && GENERIC_LABEL.test(personal[0]!.name.trim());
  const personalisation = personal.length
    ? single
      ? personal[0]!.value.trim()
      : personal.map((p) => `${p.name.trim()}: ${p.value.trim()}`).join("\n")
    : null;
  return { personalisation, variations };
}
