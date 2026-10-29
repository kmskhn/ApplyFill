/*
 * Reads the form on the page: every field with its question text, kind and options.
 *
 *   scan(document) -> fields[]
 *   field = { id, kind, label, name, idAttr, autocomplete, placeholder, options:[{label,value}],
 *             required, maxlength, multiple, el, els, box }
 *   kind  = text | email | tel | url | number | date | textarea | select | combobox |
 *           radio | checkbox | checkboxes | buttons | file
 *
 * el = the main element, els = all elements of a group (radios, checkboxes, buttons),
 * box = the element to outline on screen.
 */
(function (root) {
  const AF = (root.AF = root.AF || {});
  const util = AF.util || require("./util.js");
  const { cleanLabel, isVisible, normalize } = util;

  const SKIP_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "password", "search"]);
  const TYPED = new Set(["email", "tel", "url", "number", "date"]);
  const GENERIC_LABEL = /^(attach|upload|upload file|choose file|choose|browse|enter manually|select|select\.\.\.|please select|choose\.\.\.|--+|type here|type your response|start typing\.*)$/i;
  const FIELD_SELECTOR = "input, select, textarea";
  const HOST_ID = "applyfill-root";

  const NO_TEXT = "input, select, textarea, option, script, style, svg, noscript, [aria-hidden='true'], .visually-hidden, .sr-only";

  /**
   * Text of an element without the text of fields, options, scripts and hidden helpers
   * (in a browser, also without elements hidden by CSS). before: only the text that comes before
   * this element (a label that wraps its field also wraps helper texts after it).
   */
  function textOf(node, { before = null } = {}) {
    if (!node) return "";

    const win = node.ownerDocument?.defaultView;
    const layout = util.hasLayout(win);
    const parts = [];

    const walk = (current) => {
      for (const child of current.childNodes) {
        if (before && child !== before && !(child.compareDocumentPosition(before) & 4) && !child.contains?.(before)) return false;

        if (child === before) return false;

        if (child.nodeType === 3) {
          parts.push(child.nodeValue);

          continue;
        }

        if (child.nodeType !== 1 || child.matches(NO_TEXT)) continue;

        if (layout) {
          const style = win.getComputedStyle(child);

          if (style.display === "none" || style.visibility === "hidden") continue;
        }

        if (walk(child) === false) return false;
      }

      return true;
    };

    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, " ").trim();

    walk(node);

    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  /** A label's text; for a label that wraps its field, only the part before the field. */
  function labelText(label, el) {
    if (label.contains(el)) {
      const text = textOf(label, { before: el });

      if (text) return text;
    }

    return textOf(label);
  }

  function byIds(doc, ids) {
    return String(ids || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => textOf(doc.getElementById(id)))
      .filter(Boolean)
      .join(" ");
  }

  const hasField = (node) => node.matches?.(FIELD_SELECTOR) || Boolean(node.querySelector?.(FIELD_SELECTOR));

  /**
   * The question text near a field that has no real label: walk up from the field and take the
   * closest earlier sibling that has text. Stop at a sibling that holds another field: its text
   * belongs to that field.
   */
  function nearbyText(node, stopAt) {
    for (let level = 0, current = node; current && current !== stopAt && level < 6; level += 1, current = current.parentElement) {
      for (let sib = current.previousElementSibling; sib; sib = sib.previousElementSibling) {
        if (hasField(sib)) return "";

        const text = textOf(sib);

        if (text && text.length <= 400 && !GENERIC_LABEL.test(text)) return text;
      }

      if (current.parentElement?.tagName === "FORM" || current.parentElement?.tagName === "BODY") break;
    }

    return "";
  }

  /** Raw label text (may end with "*"), from the best source that has real words. */
  function rawLabel(doc, el, stopAt) {
    const tries = [
      () => byIds(doc, el.getAttribute("aria-labelledby")),
      () => [...(el.labels || [])].map((label) => labelText(label, el)).filter(Boolean).join(" "),
      () => el.getAttribute("aria-label"),
      () => el.getAttribute("title"),
      () => nearbyText(el, stopAt),
      () => el.getAttribute("placeholder"),
      () => humanize(el.getAttribute("name") || el.id),
    ];

    for (const tryOne of tries) {
      const text = String(tryOne() || "").replace(/\s+/g, " ").trim();

      if (text && !GENERIC_LABEL.test(cleanLabel(text))) return text;
    }

    return "";
  }

  function humanize(name) {
    return String(name || "")
      .replace(/^_?systemfield_/, "")
      .replace(/\[\]$/, "")
      .replace(/[_\-[\]]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim();
  }

  /** The label of a radio or checkbox inside a group: its own label, else text right after it. */
  function optionLabel(doc, el) {
    const own = [...(el.labels || [])].map((label) => textOf(label)).filter(Boolean).join(" ") || el.getAttribute("aria-label") || byIds(doc, el.getAttribute("aria-labelledby"));

    if (own) return own;

    const next = el.nextElementSibling || el.parentElement?.nextElementSibling;

    // "on" is the browser's default value for a checkbox, not a label.
    return textOf(next) || (el.value && el.value !== "on" ? el.value : "");
  }

  function commonAncestor(els) {
    let node = els[0]?.parentElement;

    while (node && !els.every((el) => node.contains(el))) node = node.parentElement;

    return node;
  }

  /** Question text of a group (radios, checkboxes, buttons). */
  function groupLabel(doc, els, container, stopAt) {
    const fieldset = els[0].closest("fieldset");

    if (fieldset && els.every((el) => fieldset.contains(el))) {
      const legend = fieldset.querySelector("legend");

      if (legend && textOf(legend)) return textOf(legend);
    }

    const group = els[0].closest("[role='radiogroup'], [role='group']");

    if (group && els.every((el) => group.contains(el))) {
      const text = byIds(doc, group.getAttribute("aria-labelledby")) || group.getAttribute("aria-label");

      if (text) return text;
    }

    // The question often sits inside the same box, before the first option.
    const inside = textOf(container, { before: els[0] });

    if (inside && inside.length <= 400 && !GENERIC_LABEL.test(inside)) return inside;

    return nearbyText(container, stopAt) || humanize(els[0].getAttribute("name"));
  }

  function isRequired(el, raw) {
    return Boolean(el.required || el.getAttribute("aria-required") === "true" || /[*✱]\s*$/.test(raw || ""));
  }

  function selectOptions(el) {
    return [...el.options]
      .filter((option) => !option.disabled && option.value !== "" && !GENERIC_LABEL.test(option.textContent.trim()))
      .map((option) => ({ label: option.textContent.replace(/\s+/g, " ").trim(), value: option.value }));
  }

  function kindOf(el) {
    if (el.tagName === "SELECT") return "select";
    if (el.tagName === "TEXTAREA") return "textarea";
    if (el.getAttribute("role") === "combobox") return "combobox";

    const type = (el.getAttribute("type") || "text").toLowerCase();

    if (type === "file" || type === "radio" || type === "checkbox") return type;
    if (TYPED.has(type)) return type;

    return "text";
  }

  const usable = (el) => !el.disabled && !el.closest(`#${HOST_ID}`);

  /** Radios and checkboxes are often hidden and styled through their label. */
  const shown = (el) => isVisible(el) || [...(el.labels || [])].some(isVisible);

  /** Yes/No made of buttons (no real inputs), as some sites draw them. */
  function buttonGroups(doc, scope) {
    const groups = [];
    const seen = new Set();

    for (const button of scope.querySelectorAll("button, [role='button']")) {
      const parent = button.parentElement;

      if (!parent || seen.has(parent)) continue;

      seen.add(parent);

      const buttons = [...parent.children].filter((child) => child.matches("button, [role='button']"));
      const texts = buttons.map((child) => normalize(textOf(child)));

      if (buttons.length >= 2 && buttons.length <= 3 && texts.includes("yes") && texts.includes("no") && buttons.every(isVisible)) groups.push(buttons);
    }

    return groups;
  }

  function scan(doc = document, { scope = doc.body } = {}) {
    const fields = [];
    const radios = new Map();
    const checkboxes = [];
    let counter = 0;

    const nextId = () => `f${(counter += 1)}`;

    const add = (field, mark) => {
      field.id = nextId();
      mark.setAttribute("data-af-id", field.id);
      fields.push(field);
    };

    const base = (el, raw) => ({
      label: cleanLabel(raw),
      name: el.getAttribute("name") || "",
      idAttr: el.id || "",
      autocomplete: (el.getAttribute("autocomplete") || "").toLowerCase(),
      placeholder: el.getAttribute("placeholder") || "",
      required: isRequired(el, raw),
      options: [],
    });

    for (const el of scope.querySelectorAll(FIELD_SELECTOR)) {
      if (!usable(el)) continue;

      const kind = kindOf(el);
      const type = (el.getAttribute("type") || "").toLowerCase();

      if (SKIP_TYPES.has(type)) continue;

      // "Autofill from resume" boxes (Ashby) are the site's own parser, not a question.
      if (kind === "file" && el.closest("[class*='autofill' i], [id*='autofill' i]")) continue;

      if (kind === "radio") {
        const key = el.name || commonAncestor([el])?.outerHTML.slice(0, 80);

        if (!radios.has(key)) radios.set(key, []);

        radios.get(key).push(el);

        continue;
      }

      if (kind === "checkbox") {
        checkboxes.push(el);

        continue;
      }

      // Hidden helper inputs (for example a "required" proxy next to a custom select).
      if (kind !== "file" && (el.getAttribute("aria-hidden") === "true" || el.tabIndex < 0) && kind !== "combobox") continue;

      if (kind !== "file" && !isVisible(el)) continue;

      if (el.readOnly && kind !== "combobox") continue;

      const raw = rawLabel(doc, el, scope);
      const field = { ...base(el, raw), kind, el, els: [el], box: kind === "file" ? visibleBox(el) : kind === "combobox" ? comboBox(el) : el };

      if (kind === "select") {
        field.options = selectOptions(el);
        field.multiple = el.multiple;
      }

      if (el.maxLength > 0 && el.maxLength < 100000) field.maxlength = el.maxLength;

      if (kind === "file") field.accept = el.getAttribute("accept") || "";

      if (kind === "combobox") field.listbox = el.getAttribute("aria-controls") || el.getAttribute("aria-owns") || "";

      // Place search boxes (Lever "Current location"): type, then pick a suggestion.
      if (kind === "text" && (el.getAttribute("aria-autocomplete") === "list" || el.hasAttribute("list") || /location|autocomplete|typeahead/i.test(`${el.className} ${el.id}`))) field.suggest = true;

      add(field, el);
    }

    for (const els of radios.values()) {
      if (!els.some(shown)) continue;

      const container = commonAncestor(els) || els[0].parentElement;
      const raw = groupLabel(doc, els, container, scope);

      add(
        {
          ...base(els[0], raw),
          kind: "radio",
          required: els.some((el) => isRequired(el, raw)),
          options: els.map((el) => ({ label: cleanLabel(optionLabel(doc, el)), value: el.value })),
          el: els[0],
          els,
          box: container,
        },
        els[0],
      );
    }

    // Yes/No buttons often keep a hidden checkbox next to them: that checkbox is not a question.
    const buttonSets = buttonGroups(doc, scope);
    const inButtons = (el) => buttonSets.some((buttons) => buttons[0].parentElement.contains(el));

    // Checkboxes: same name (or same fieldset) and more than one = a multi-select question.
    const groups = new Map();

    for (const el of checkboxes) {
      if (!shown(el) || inButtons(el)) continue;

      const fieldset = el.closest("fieldset, [role='group']");
      const key = el.name && checkboxes.filter((other) => other.name === el.name).length > 1 ? `n:${el.name}` : fieldset && fieldset.querySelectorAll("input[type='checkbox']").length > 1 ? fieldset : el;

      if (!groups.has(key)) groups.set(key, []);

      groups.get(key).push(el);
    }

    for (const els of groups.values()) {
      if (els.length === 1) {
        const el = els[0];
        const raw = optionLabel(doc, el) || rawLabel(doc, el, scope);

        add({ ...base(el, raw), kind: "checkbox", el, els, box: el.labels?.[0] || el.parentElement || el }, el);

        continue;
      }

      const container = commonAncestor(els) || els[0].parentElement;
      const raw = groupLabel(doc, els, container, scope);

      add(
        {
          ...base(els[0], raw),
          kind: "checkboxes",
          required: els.some((el) => isRequired(el, raw)),
          options: els.map((el) => ({ label: cleanLabel(optionLabel(doc, el)), value: el.value })),
          el: els[0],
          els,
          box: container,
        },
        els[0],
      );
    }

    for (const buttons of buttonSets) {
      const container = buttons[0].parentElement;
      const raw = nearbyText(container, scope);

      if (!raw) continue;

      add({ ...base(buttons[0], raw), kind: "buttons", options: buttons.map((button) => ({ label: textOf(button), value: textOf(button) })), el: buttons[0], els: buttons, box: container }, buttons[0]);
    }

    // Page order, so the panel and the AI see the questions as you do.
    const order = (a, b) => (a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1);

    return fields.sort(order);
  }

  /** A custom dropdown's input is tiny: outline its whole control (react-select "…__control"). */
  function comboBox(el) {
    return el.parentElement?.closest("[class*='control' i]") || el.parentElement?.parentElement || el;
  }

  /** File inputs are hidden behind a button: outline the nearest visible box instead. */
  function visibleBox(el) {
    for (let node = el.parentElement, level = 0; node && level < 4; node = node.parentElement, level += 1) {
      if (isVisible(node)) return node;
    }

    return el.parentElement || el;
  }

  /** What the field holds now: text, option label, array of labels, true/false, or file name. */
  function currentValue(field) {
    const { el, els, kind } = field;

    switch (kind) {
      case "select":
        return el.selectedIndex >= 0 && el.value !== "" ? el.options[el.selectedIndex].textContent.trim() : "";
      case "radio": {
        const index = els.findIndex((one) => one.checked);

        return index >= 0 ? field.options[index].label : "";
      }
      case "checkboxes":
        return els.map((one, index) => (one.checked ? field.options[index].label : null)).filter(Boolean);
      case "checkbox":
        return el.checked;
      case "buttons": {
        const index = els.findIndex((one) => one.getAttribute("aria-pressed") === "true" || one.getAttribute("aria-checked") === "true" || /\b(active|selected|checked)\b/i.test(one.className));

        return index >= 0 ? field.options[index].label : "";
      }
      case "file":
        return el.files?.length ? el.files[0].name : "";
      case "combobox":
        return el.value || comboboxShown(el);
      default:
        return el.value || "";
    }
  }

  const SHOWN_VALUE = "[class*='single-value' i], [class*='singleValue' i], [class*='multi-value' i], [class*='multiValue' i]";

  /** Custom selects (react-select) show the chosen value in a nearby element, not in the input. */
  function comboboxShown(el) {
    for (let node = el.parentElement, level = 0; node && level < 4; node = node.parentElement, level += 1) {
      const shownValue = node.querySelector(SHOWN_VALUE);

      if (shownValue) return textOf(shownValue);
    }

    return "";
  }

  function isEmpty(field) {
    const value = currentValue(field);

    if (field.kind === "checkbox") return value === false;

    return Array.isArray(value) ? value.length === 0 : String(value).trim() === "";
  }

  /** What the AI gets about a field: no elements, no current values. */
  function toPublic(field) {
    return {
      id: field.id,
      kind: field.kind,
      label: field.label,
      ...(field.options?.length ? { options: field.options.map((option) => option.label) } : {}),
      ...(field.required ? { required: true } : {}),
      ...(field.maxlength ? { max_length: field.maxlength } : {}),
      ...(field.kind === "checkboxes" || field.multiple ? { multiple: true } : {}),
    };
  }

  /** The job text on the page, for the AI: the longest description-like block, else the body. */
  function jobContext(doc = document) {
    const candidates = [...doc.querySelectorAll("[class*='description' i], [id*='description' i], [class*='posting' i], [data-qa*='job-description'], [class*='job-post' i], article, main")];
    const texts = candidates.map((node) => textOf(node)).filter((text) => text.length > 200);
    const best = texts.sort((a, b) => b.length - a.length)[0] || textOf(doc.body);

    return {
      title: doc.title || "",
      host: doc.location?.hostname || "",
      // Whole text: the salary range is often at the end. ai.js cuts what it sends.
      text: best,
    };
  }

  AF.scan = { scan, currentValue, isEmpty, toPublic, jobContext, textOf, rawLabel };

  if (typeof module !== "undefined" && module.exports) module.exports = AF.scan;
})(globalThis);
