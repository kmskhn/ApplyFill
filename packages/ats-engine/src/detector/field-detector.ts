import type { FieldAttributes, FieldInputType } from "@applyfill/shared";
import { FieldType } from "@applyfill/shared";
import { classifyField } from "../matchers/label-matcher";

/**
 * Represents a raw form field found on the page before classification.
 * Internal to the detector — gets enriched into DiscoveredField.
 */
interface RawField {
  element: HTMLElement;
  inputType: FieldInputType;
  attributes: FieldAttributes;
  labelText: string | null;
}

/**
 * CSS selector for all fillable form elements.
 * Excludes hidden, submit, and button inputs.
 * Also includes:
 * - input[role="combobox"] — React Select / Radix UI custom dropdowns
 */
const FILLABLE_SELECTOR = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
  "textarea",
  "select",
].join(",");

/**
 * Discovers all fillable form fields within a root element.
 * Returns classified fields with confidence scores.
 */
export function discoverFields(formRoot: Element) {
  const seen = new Set<HTMLElement>();
  const rawFields: RawField[] = [];

  // ── 1. Standard inputs/textareas/selects ────────────────────────────────
  const elements = formRoot.querySelectorAll(FILLABLE_SELECTOR);
  for (const el of elements) {
    const htmlEl = el as HTMLElement;
    if (seen.has(htmlEl)) continue;

    // Skip radio/checkbox — handled via radio group detection below
    const type = (htmlEl as HTMLInputElement).type?.toLowerCase();
    if (type === "radio" || type === "checkbox") continue;

    // Skip invisible elements (use multiple visibility checks)
    if (!isVisible(htmlEl)) continue;

    // Skip React Select's hidden input (the visible combobox input is handled separately)
    if (htmlEl.getAttribute("aria-hidden") === "true") continue;

    const inputType = getInputType(htmlEl);
    const attributes = extractAttributes(htmlEl);
    const labelText = resolveLabel(htmlEl);

    seen.add(htmlEl);
    rawFields.push({ element: htmlEl, inputType, attributes, labelText });
  }

  // ── 2. React Select / combobox inputs ────────────────────────────────────
  // These are often invisible to offsetParent checks but ARE visible to users.
  // Identified by role="combobox" or class="select__input"
  const comboboxInputs = formRoot.querySelectorAll(
    'input[role="combobox"], input.select__input',
  );
  for (const el of comboboxInputs) {
    const htmlEl = el as HTMLElement;
    if (seen.has(htmlEl)) continue;
    // Must have a parent that looks like a React Select container
    if (!htmlEl.closest('.css-b62m3t-container, [class*="select__"]')) continue;

    const attributes = extractAttributes(htmlEl);
    // Try to find the label by walking up to the field container
    const labelText = resolveLabel(htmlEl);

    seen.add(htmlEl);
    rawFields.push({
      element: htmlEl,
      inputType: "select", // treat as select for fill logic
      attributes,
      labelText,
    });
  }

  // ── 3. Radio button groups ────────────────────────────────────────────────
  // Sites like jisr.net use <button role="radio"> instead of <input type="radio">
  const radioGroups = formRoot.querySelectorAll('[role="radiogroup"]');
  for (const group of radioGroups) {
    if (!isVisible(group as HTMLElement)) continue;

    const labelText = resolveGroupLabel(group as HTMLElement);
    const attributes: FieldAttributes = {
      name: group.getAttribute("name"),
      id: group.getAttribute("id"),
      type: "radio",
      placeholder: null,
      ariaLabel: group.getAttribute("aria-label"),
      autocomplete: null,
    };

    // Use the group element itself as the "element" to interact with
    seen.add(group as HTMLElement);
    rawFields.push({
      element: group as HTMLElement,
      inputType: "input", // custom — filled via click on radio button
      attributes,
      labelText,
    });
  }

  // Classify each field using multi-signal matching
  return rawFields.map((raw) => {
    const classification = classifyField(raw.labelText, raw.attributes);
    return {
      element: raw.element,
      inputType: raw.inputType,
      fieldType: classification.fieldType,
      confidence: classification.confidence,
      labelText: raw.labelText,
      attributes: raw.attributes,
    };
  });
}

/**
 * Checks if an element is visible to the user using multiple heuristics.
 */
function isVisible(el: HTMLElement): boolean {
  // offsetParent is null for display:none elements (and position:fixed ancestors)
  if (el.offsetParent === null) {
    // Allow position:fixed elements (they don't have offsetParent but are visible)
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
  }
  // Width/height check as a fallback
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
}

/**
 * Determines the input type of an HTML element.
 */
function getInputType(el: HTMLElement): FieldInputType {
  const tag = el.tagName.toLowerCase();
  if (tag === "select") return "select";
  if (tag === "textarea") return "textarea";
  if (tag === "input") {
    const type = (el as HTMLInputElement).type?.toLowerCase();
    if (type === "file") return "file";
  }
  return "input";
}

/**
 * Extracts relevant HTML attributes from a form element.
 */
function extractAttributes(el: HTMLElement): FieldAttributes {
  return {
    name: el.getAttribute("name"),
    id: el.getAttribute("id"),
    type: el.getAttribute("type"),
    placeholder: el.getAttribute("placeholder"),
    ariaLabel: el.getAttribute("aria-label"),
    autocomplete: el.getAttribute("autocomplete"),
  };
}

/**
 * Resolves the label text for a form field using multiple strategies.
 *
 * Strategy order (highest → lowest reliability):
 * 1. <label for="id"> — explicit association (exact id match)
 * 2. Ancestor <label> wrapping the input
 * 3. aria-labelledby reference
 * 4. aria-label attribute
 * 5. Shared field container — walk up to a common [data-slot="field"],
 *    [role="group"], or fieldset and find a label/legend within it
 * 6. Closest preceding sibling/ancestor text
 */
function resolveLabel(el: HTMLElement): string | null {
  // Strategy 1: <label for="id"> exact match
  const id = el.getAttribute("id");
  if (id) {
    try {
      const label = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) {
        const text = extractLabelText(label);
        if (text) return text;
      }
    } catch {
      // CSS.escape might fail for unusual IDs
    }
  }

  // Strategy 2: Ancestor <label>
  const ancestorLabel = el.closest("label");
  if (ancestorLabel) {
    const text = extractLabelText(ancestorLabel);
    if (text) return text;
  }

  // Strategy 3: aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    // May be space-separated list of IDs
    for (const refId of labelledBy.split(/\s+/)) {
      const labelEl = el.ownerDocument.getElementById(refId);
      if (labelEl) {
        const text = labelEl.textContent?.trim().replace(/\s*\*\s*$/, "").trim();
        if (text) return text;
      }
    }
  }

  // Strategy 4: aria-label
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim().replace(/\s*\*\s*$/, "").trim();

  // Strategy 5: Shared field container
  const containerLabel = findLabelInFieldContainer(el);
  if (containerLabel) return containerLabel;

  // Strategy 6: Preceding sibling label (Rippling, Lever, custom ATS forms)
  // Pattern: a <p> or heading element is a sibling of the [data-testid="field"]
  // container (or its ancestor), placed directly before it in the parent.
  const siblingLabel = findPrecedingSiblingLabel(el);
  if (siblingLabel) return siblingLabel;

  // Strategy 7: Preceding sibling text (fallback)
  const parent = el.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children);
    const elIndex = siblings.indexOf(el);
    for (let i = elIndex - 1; i >= 0; i--) {
      const sib = siblings[i];
      if (sib && (sib.tagName === "LABEL" || sib.tagName === "SPAN" || sib.tagName === "DIV")) {
        const text = sib.textContent?.trim().replace(/\s*\*\s*$/, "").trim();
        if (text && text.length < 100) return text;
      }
    }

    const parentText = getDirectTextContent(parent);
    if (parentText && parentText.length < 100) return parentText;
  }

  return null;
}

/**
 * Resolves a label for a radio group element by searching the surrounding
 * field container for a <label> or <legend>.
 */
function resolveGroupLabel(group: HTMLElement): string | null {
  return findLabelInFieldContainer(group) ?? resolveLabel(group);
}

/**
 * Strategy 5b: Rippling / custom ATS preceding-sibling label detection.
 *
 * Rippling (and other ATS like Lever v2) place the question text as a <p> or
 * heading BEFORE the [data-testid="field"] container in a shared wrapper div:
 *
 *   <div class="marginY--36">                    ← shared wrapper
 *     <div class="paddingX--16">                ← sibling 1 (contains the label)
 *       <p>In 2-3 lines, summarize why you want to join Mozn?</p>
 *     </div>
 *     <div data-testid="field"> ... </div>       ← sibling 2 (field container)
 *   </div>
 *
 * The label `<p>` can be directly inside the preceding sibling or nested.
 * Walks up to 6 levels to find the [data-testid="field"] ancestor, then
 * looks at the previous sibling of each ancestor within its parent.
 */
function findPrecedingSiblingLabel(el: HTMLElement): string | null {
  // Field container markers — walk up to find one
  const FIELD_CONTAINERS = [
    '[data-testid="field"]',
    '[data-slot="field"]',
    'fieldset',
    '[role="group"]',
  ];

  let current: HTMLElement | null = el.parentElement;
  let depth = 0;

  while (current && depth < 6) {
    const isFieldContainer = FIELD_CONTAINERS.some((sel) => {
      try { return current!.matches(sel); } catch { return false; }
    });

    if (isFieldContainer) {
      // Look at siblings that come BEFORE this field container
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const containerIndex = siblings.indexOf(current);

        // Search backwards through preceding siblings
        for (let i = containerIndex - 1; i >= 0; i--) {
          const sib = siblings[i] as HTMLElement;
          // Look for <p>, <span>, heading, or any element with label-like text
          const textEl = sib.querySelector("p, h1, h2, h3, h4, h5, h6, span") ?? sib;
          const text = extractLabelText(textEl);
          if (text && text.length > 2 && text.length < 300) {
            return text;
          }
        }
      }
    }

    current = current.parentElement;
    depth++;
  }

  return null;
}


/**
 * Walks up the DOM tree looking for a "field container" element —
 * a wrapper that groups a label and its input together.
 *
 * Recognized containers:
 * - [data-slot="field"]   (Astralis/jisr.net design system)
 * - [role="group"]
 * - fieldset
 * - .form-group, .form-field, .field-wrapper, .field-container (common class names)
 *
 * Once found, searches within it for a <label> or <legend>.
 */
function findLabelInFieldContainer(el: HTMLElement): string | null {
  const CONTAINER_SELECTORS = [
    '[data-slot="field"]',
    'fieldset',
    '[role="group"]',
    '.form-group',
    '.form-field',
    '.field-wrapper',
    '.field-container',
    '.input-group',
    '.field',
  ];

  let current: HTMLElement | null = el.parentElement;
  let depth = 0;

  while (current && depth < 8) {
    const isContainer = CONTAINER_SELECTORS.some((sel) => {
      try { return current!.matches(sel); } catch { return false; }
    });

    if (isContainer) {
      // Found a field container — look for a label or legend within it
      // Prefer [data-slot="field-label"] (Astralis), then regular label
      const candidates = [
        '[data-slot="field-label"]',
        "label",
        "legend",
        "[class*='label']",
      ];

      for (const sel of candidates) {
        const labelEl = current.querySelector(sel);
        if (labelEl && !labelEl.contains(el)) {
          const text = extractLabelText(labelEl);
          if (text) return text;
        }
      }
    }

    current = current.parentElement;
    depth++;
  }

  return null;
}

/**
 * Extracts clean text from a label element, removing input children and asterisks.
 */
function extractLabelText(label: Element): string | null {
  const clone = label.cloneNode(true) as Element;
  clone.querySelectorAll("input, select, textarea, button, svg, .sr-only").forEach((el) =>
    el.remove(),
  );
  const text = clone.textContent
    ?.replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\*\s*$/, "")
    .trim();
  return text || null;
}

/**
 * Gets only the direct text content of an element (not from children).
 */
function getDirectTextContent(el: Element): string | null {
  const texts: string[] = [];
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) texts.push(text);
    }
  }
  const result = texts.join(" ").trim().replace(/\s*\*\s*$/, "").trim();
  return result || null;
}
