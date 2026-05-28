import type { UserProfile, DiscoveredField, AutofillResult, FieldFillResult } from "@applyfill/shared";
import { ATSPlatform, FieldType, getProfileValue } from "@applyfill/shared";
import { setInputValue } from "./value-setter";

/** Minimum confidence to auto-fill a field */
const AUTO_FILL_THRESHOLD = 0.5;

/**
 * Autofills a set of discovered fields using profile data.
 *
 * Only fills fields with confidence >= threshold.
 * Skips file inputs, unknown fields, and fields with no matching profile value.
 */
export function autofill(
  fields: DiscoveredField[],
  profile: UserProfile,
  platform: ATSPlatform,
): AutofillResult {
  const details: FieldFillResult[] = [];
  let filled = 0;
  let skipped = 0;
  let failed = 0;

  for (const field of fields) {
    // Skip file inputs — can't programmatically set these
    if (field.inputType === "file") {
      skipped++;
      details.push({
        fieldType: field.fieldType,
        success: false,
        valueFilled: null,
        error: "File inputs cannot be auto-filled",
      });
      continue;
    }

    // Skip unclassified fields
    if (
      field.fieldType === FieldType.UNKNOWN ||
      field.fieldType === FieldType.CUSTOM_TEXT ||
      field.fieldType === FieldType.CUSTOM_SELECT ||
      field.fieldType === FieldType.CUSTOM_TEXTAREA
    ) {
      skipped++;
      details.push({
        fieldType: field.fieldType,
        success: false,
        valueFilled: null,
        error: "Unrecognized field type",
      });
      continue;
    }

    // Skip low-confidence matches
    if (field.confidence < AUTO_FILL_THRESHOLD) {
      skipped++;
      details.push({
        fieldType: field.fieldType,
        success: false,
        valueFilled: null,
        error: `Confidence too low: ${field.confidence}`,
      });
      continue;
    }

    // Get the value from the profile
    const value = getProfileValue(profile, field.fieldType);
    if (!value) {
      skipped++;
      details.push({
        fieldType: field.fieldType,
        success: false,
        valueFilled: null,
        error: "No profile value for this field",
      });
      continue;
    }

    // Skip already-filled fields to avoid overwriting user edits
    const currentValue = getCurrentValue(field.element);
    if (currentValue && currentValue.trim().length > 0) {
      skipped++;
      details.push({
        fieldType: field.fieldType,
        success: false,
        valueFilled: null,
        error: "Field already has a value",
      });
      continue;
    }

    // Attempt to fill
    const success = setInputValue(field.element, value);
    if (success) {
      filled++;
      details.push({
        fieldType: field.fieldType,
        success: true,
        valueFilled: value,
      });
    } else {
      failed++;
      details.push({
        fieldType: field.fieldType,
        success: false,
        valueFilled: value,
        error: "Failed to set value on element",
      });
    }
  }

  return {
    platform,
    totalFieldsDetected: fields.length,
    fieldsFilled: filled,
    fieldsSkipped: skipped,
    fieldsFailed: failed,
    details,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Gets the current value of a form element.
 */
function getCurrentValue(element: HTMLElement): string | null {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value;
  }
  return element.textContent;
}
