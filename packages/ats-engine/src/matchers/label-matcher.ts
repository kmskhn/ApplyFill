import type { FieldAttributes } from "@applyfill/shared";
import { FieldType } from "@applyfill/shared";
import {
  LABEL_PATTERNS,
  NAME_ATTRIBUTE_PATTERNS,
  TYPE_ATTRIBUTE_MAP,
} from "@applyfill/shared";

interface ClassificationResult {
  fieldType: FieldType;
  confidence: number;
}

/**
 * Classifies a form field into a canonical FieldType using multi-signal scoring.
 *
 * Signal priority:
 * 1. Label text (highest — 1.0 exact, 0.85 regex)
 * 2. name attribute (0.8)
 * 3. id attribute (0.7)
 * 4. type attribute (0.6)
 * 5. placeholder (0.5)
 * 6. autocomplete (0.6)
 */
export function classifyField(
  labelText: string | null,
  attributes: FieldAttributes,
): ClassificationResult {
  // 1. Try label text matching (highest confidence)
  if (labelText) {
    const normalized = normalizeText(labelText);
    const labelResult = matchLabelText(normalized);
    if (labelResult) return labelResult;
  }

  // 2. Try name attribute
  if (attributes.name) {
    const nameResult = matchNameAttribute(attributes.name);
    if (nameResult) return nameResult;
  }

  // 3. Try id attribute (reuse name patterns — IDs often follow similar conventions)
  if (attributes.id) {
    const idResult = matchNameAttribute(attributes.id);
    if (idResult) return { fieldType: idResult.fieldType, confidence: 0.7 };
  }

  // 4. Try type attribute
  if (attributes.type) {
    const typeResult = TYPE_ATTRIBUTE_MAP[attributes.type];
    if (typeResult) {
      return { fieldType: typeResult, confidence: 0.6 };
    }
  }

  // 5. Try placeholder text
  if (attributes.placeholder) {
    const normalized = normalizeText(attributes.placeholder);
    let placeholderResult = matchLabelText(normalized);
    if (!placeholderResult) {
      const cleaned = normalized.replace(/^(enter|input|your|provide|type|write|please|fill|select|e\.g\.)\s+(your\s+)?/gi, "").trim();
      placeholderResult = matchLabelText(cleaned);
    }
    if (placeholderResult) {
      return { fieldType: placeholderResult.fieldType, confidence: 0.5 };
    }
  }

  // 6. Try autocomplete attribute
  if (attributes.autocomplete) {
    const autocompleteResult = matchAutocomplete(attributes.autocomplete);
    if (autocompleteResult) return autocompleteResult;
  }

  // Couldn't classify — return UNKNOWN
  return { fieldType: FieldType.UNKNOWN, confidence: 0 };
}

/**
 * Matches normalized label text against the LABEL_PATTERNS dictionary.
 */
function matchLabelText(normalized: string): ClassificationResult | null {
  for (const [fieldType, patterns] of Object.entries(LABEL_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        // Exact string match gets highest confidence, regex match gets slightly less
        const isExact = normalized === normalized.match(pattern)?.[0];
        return {
          fieldType: fieldType as FieldType,
          confidence: isExact ? 1.0 : 0.85,
        };
      }
    }
  }
  return null;
}

/**
 * Matches name/id attribute against known patterns.
 */
function matchNameAttribute(nameOrId: string): ClassificationResult | null {
  for (const { pattern, fieldType } of NAME_ATTRIBUTE_PATTERNS) {
    if (pattern.test(nameOrId)) {
      return { fieldType, confidence: 0.8 };
    }
  }
  return null;
}

/**
 * Maps HTML autocomplete values to field types.
 */
function matchAutocomplete(value: string): ClassificationResult | null {
  const map: Record<string, FieldType> = {
    "given-name": FieldType.FIRST_NAME,
    "family-name": FieldType.LAST_NAME,
    name: FieldType.FULL_NAME,
    email: FieldType.EMAIL,
    tel: FieldType.PHONE,
    "address-level2": FieldType.CITY,
    "address-level1": FieldType.STATE,
    country: FieldType.COUNTRY,
    "country-name": FieldType.COUNTRY,
    organization: FieldType.CURRENT_COMPANY,
    "organization-title": FieldType.CURRENT_TITLE,
    url: FieldType.WEBSITE_URL,
  };

  const fieldType = map[value.toLowerCase()];
  if (fieldType) {
    return { fieldType, confidence: 0.6 };
  }
  return null;
}

/**
 * Normalizes text for pattern matching: lowercase, trim, collapse whitespace,
 * strip trailing asterisks/colons.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[*:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}
