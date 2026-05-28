/**
 * Sets a value on a DOM input element in a way that React-controlled
 * components will recognize.
 *
 * Handles:
 * - Native inputs/textareas (React prototype setter trick)
 * - Native <select> elements (fuzzy option matching)
 * - React Select / combobox inputs (type + click matching option)
 * - Radio button groups [role="radiogroup"] (click matching button)
 */

/**
 * Sets a text value on an input, textarea, select, or custom component.
 * Returns true if the value was successfully set.
 */
export function setInputValue(element: HTMLElement, value: string): boolean {
  try {
    // Radio group (e.g. jisr.net screening questions)
    if (element.getAttribute("role") === "radiogroup") {
      return setRadioGroupValue(element, value);
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      // React Select combobox input (only on input elements, not textarea)
      if (
        element instanceof HTMLInputElement &&
        (
          element.getAttribute("role") === "combobox" ||
          element.classList.contains("select__input")
        )
      ) {
        return setReactSelectValue(element, value);
      }

      return setNativeInputValue(element, value);
    }

    if (element instanceof HTMLSelectElement) {
      return setSelectValue(element, value);
    }

    // Contenteditable fallback
    if (element.getAttribute("contenteditable") === "true") {
      element.textContent = value;
      dispatchEvents(element);
      return true;
    }

    return false;
  } catch (error) {
    console.warn("[applyfill] Failed to set value:", error);
    return false;
  }
}

/**
 * Sets value on a native input/textarea using the prototype setter trick.
 * This bypasses React's value tracking so React's onChange fires.
 *
 * For phone inputs: if there's a sibling country-code dropdown, strip
 * the dial code prefix so only the local number is filled.
 */
function setNativeInputValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): boolean {
  let fillValue = value;
  if (element instanceof HTMLInputElement && (element.type === "tel" || element.type === "text")) {
    if (hasSiblingPhoneDialCodeSelect(element)) {
      fillValue = extractLocalPhoneNumber(value);
    }
  }

  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(element, fillValue);
  } else {
    element.value = fillValue;
  }

  dispatchEvents(element);
  return element.value === fillValue;
}

/**
 * Handles React Select (and similar headless UI) combobox inputs.
 *
 * Strategy:
 * 1. Focus and type the value into the input → React Select filters its options
 * 2. After a short delay, find the dropdown option that matches and click it
 *
 * Returns true immediately (async click happens after delay).
 */
function setReactSelectValue(element: HTMLInputElement, value: string): boolean {
  try {
    // Focus the input to open the dropdown
    element.focus();
    element.click();

    // Use the native setter to set the value and trigger React's synthetic events
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(element, value);
    } else {
      element.value = value;
    }

    // Dispatch input event to trigger React Select's internal filtering
    element.dispatchEvent(new Event("focus", { bubbles: true }));
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: value.charAt(0) }),
    );

    // After React Select renders the filtered options, click the best match
    setTimeout(() => {
      const clicked = clickReactSelectOption(element, value);
      if (!clicked) {
        // Fallback: press Enter to accept the first option
        element.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }),
        );
      }
    }, 400);

    return true;
  } catch (err) {
    console.warn("[applyfill] React Select fill failed:", err);
    return false;
  }
}

/**
 * Finds and clicks the React Select option that best matches `value`.
 * Searches within the document-level dropdown menu that React Select renders.
 */
function clickReactSelectOption(trigger: HTMLElement, value: string): boolean {
  const normalizedValue = value.toLowerCase().trim();
  const doc = trigger.ownerDocument;

  // React Select renders options in a portal (outside the input's container)
  // Look for option elements with the React Select class
  const optionSelectors = [
    '[class*="select__option"]',
    '[class*="option"]',
    '[role="option"]',
  ];

  for (const sel of optionSelectors) {
    const options = Array.from(doc.querySelectorAll(sel)) as HTMLElement[];
    if (options.length === 0) continue;

    // Find best matching option
    let best: HTMLElement | null = null;
    let bestScore = 0;

    for (const opt of options) {
      const optText = opt.textContent?.toLowerCase().trim() ?? "";
      if (!optText) continue;

      let score = 0;
      if (optText === normalizedValue) score = 100;
      else if (optText.startsWith(normalizedValue)) score = 80;
      else if (normalizedValue.startsWith(optText)) score = 70;
      else if (optText.includes(normalizedValue)) score = 60;
      else if (normalizedValue.includes(optText) && optText.length > 2) score = 50;

      if (score > bestScore) {
        bestScore = score;
        best = opt;
      }
    }

    if (best && bestScore > 0) {
      best.click();
      best.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      return true;
    }
  }

  return false;
}

/**
 * Sets a value on a [role="radiogroup"] by clicking the button whose
 * value or label matches the profile value.
 */
function setRadioGroupValue(group: HTMLElement, value: string): boolean {
  const normalizedValue = value.toLowerCase().trim();

  // Find all radio buttons within the group — both native and button-based
  const radios = Array.from(
    group.querySelectorAll('[role="radio"], input[type="radio"]'),
  ) as HTMLElement[];

  for (const radio of radios) {
    const radioValue = (radio.getAttribute("value") ?? "").toLowerCase().trim();
    const labelFor = radio.getAttribute("id")
      ? group.ownerDocument.querySelector(`label[for="${CSS.escape(radio.getAttribute("id")!)}"]`)
      : null;
    const labelText = (
      labelFor?.textContent ??
      radio.closest(".flex, .radio-wrapper")?.textContent ??
      ""
    )
      .toLowerCase()
      .trim();

    if (
      radioValue === normalizedValue ||
      radioValue.includes(normalizedValue) ||
      labelText === normalizedValue ||
      labelText.includes(normalizedValue) ||
      normalizedValue.includes(radioValue) && radioValue.length > 1
    ) {
      radio.click();
      radio.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    }
  }

  return false;
}

/**
 * Checks if an input element has a sibling <select> that looks like a phone dial code picker.
 */
function hasSiblingPhoneDialCodeSelect(el: HTMLElement): boolean {
  for (const ancestor of [el.parentElement, el.parentElement?.parentElement]) {
    if (!ancestor) continue;
    const selects = ancestor.querySelectorAll("select");
    for (const sel of selects) {
      if (sel === el) continue;
      const opts = Array.from(sel.options).slice(0, 15);
      const hasDialCode = opts.some(
        (o) =>
          /^\+\d/.test(o.value.trim()) ||
          /^\+\d/.test(o.textContent?.trim() ?? ""),
      );
      if (hasDialCode) return true;
    }
  }
  return false;
}

/**
 * Strips the international dial code from a phone number string.
 * e.g. "+966 55 123 4567" → "55 123 4567"
 */
function extractLocalPhoneNumber(phone: string): string {
  const stripped = phone.replace(/^\+\d{1,3}[\s\-]?/, "").trim();
  return stripped || phone;
}

/**
 * Sets a value on a <select> element by finding the matching option.
 * Uses multiple strategies from exact to fuzzy to handle country/nationality dropdowns.
 */
function setSelectValue(element: HTMLSelectElement, value: string): boolean {
  const normalizedValue = value.toLowerCase().trim();

  // Strategy 1: Exact match by option value
  for (const option of element.options) {
    if (option.value.toLowerCase().trim() === normalizedValue) {
      element.value = option.value;
      dispatchEvents(element);
      return true;
    }
  }

  // Strategy 2: Exact match by option text
  for (const option of element.options) {
    if (option.textContent?.toLowerCase().trim() === normalizedValue) {
      element.value = option.value;
      dispatchEvents(element);
      return true;
    }
  }

  // Strategy 3: Option text starts with our value
  for (const option of element.options) {
    const optText = option.textContent?.toLowerCase().trim() ?? "";
    if (optText.startsWith(normalizedValue) && optText.length > 0) {
      element.value = option.value;
      dispatchEvents(element);
      return true;
    }
  }

  // Strategy 4: Our value starts with the option text
  for (const option of element.options) {
    const optText = option.textContent?.toLowerCase().trim() ?? "";
    if (normalizedValue.startsWith(optText) && optText.length > 2) {
      element.value = option.value;
      dispatchEvents(element);
      return true;
    }
  }

  // Strategy 5: Option text contains our value
  for (const option of element.options) {
    const optText = option.textContent?.toLowerCase().trim() ?? "";
    if (optText.includes(normalizedValue) && optText.length > 0) {
      element.value = option.value;
      dispatchEvents(element);
      return true;
    }
  }

  // Strategy 6: Our value contains the option text
  for (const option of element.options) {
    const optText = option.textContent?.toLowerCase().trim() ?? "";
    if (normalizedValue.includes(optText) && optText.length > 2) {
      element.value = option.value;
      dispatchEvents(element);
      return true;
    }
  }

  return false;
}

/**
 * Dispatches the sequence of events that browsers fire during real user interaction.
 * This ensures form frameworks (React, Vue, Angular) detect the value change.
 */
function dispatchEvents(element: HTMLElement): void {
  element.focus();
  element.dispatchEvent(new Event("focus", { bubbles: true }));
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}
