/*
 * Puts values into fields the way a person would, so React and other frameworks see the change.
 *
 *   await fillField(field, value, { resume }) -> true when the field now holds the value
 *
 * Never clicks a submit button.
 */
(function (root) {
  const AF = (root.AF = root.AF || {});
  const util = AF.util || require("./util.js");
  const match = AF.match || require("./match.js");
  const scanner = AF.scan || require("./scan.js");

  const COLORS = { green: "#16a34a", yellow: "#d97706", red: "#dc2626", grey: "#9ca3af" };

  const win = (el) => el.ownerDocument.defaultView;

  function fire(el, type, Kind = "Event", init = {}) {
    const W = win(el);
    const Ctor = W[Kind] || W.Event;

    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, ...init }));
  }

  /**
   * React keeps its own copy of an input's value. Setting el.value directly is ignored by it;
   * the prototype's setter + an "input" event is what React listens to.
   */
  function setNativeValue(el, value) {
    const W = win(el);
    const proto = el.tagName === "TEXTAREA" ? W.HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? W.HTMLSelectElement.prototype : W.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;

    setter.call(el, value);
  }

  function typeInto(el, text) {
    el.focus?.();
    fire(el, "focus", "FocusEvent", { bubbles: false });
    fire(el, "focusin", "FocusEvent");
    setNativeValue(el, text);
    fire(el, "input", "InputEvent", { inputType: "insertText", data: text });
    fire(el, "change");
  }

  function leave(el) {
    fire(el, "blur", "FocusEvent", { bubbles: false });
    fire(el, "focusout", "FocusEvent");
    el.blur?.();
  }

  /**
   * Types like a keyboard, one character at a time (keydown, beforeinput, input, keyup).
   * Custom dropdowns (react-select on Greenhouse) and place search boxes (Lever) only react to this.
   */
  async function typeChars(el, text) {
    el.focus?.();
    setNativeValue(el, "");
    fire(el, "input", "InputEvent", { inputType: "deleteContentBackward" });

    let value = "";

    for (const char of String(text)) {
      value += char;
      fire(el, "keydown", "KeyboardEvent", { key: char });
      fire(el, "keypress", "KeyboardEvent", { key: char });
      fire(el, "beforeinput", "InputEvent", { inputType: "insertText", data: char });
      setNativeValue(el, value);
      fire(el, "input", "InputEvent", { inputType: "insertText", data: char });
      fire(el, "keyup", "KeyboardEvent", { key: char });
      await util.sleep(20);
    }
  }

  function key(el, name) {
    fire(el, "keydown", "KeyboardEvent", { key: name, code: name });
    fire(el, "keyup", "KeyboardEvent", { key: name, code: name });
  }

  function press(el) {
    fire(el, "pointerdown", "PointerEvent", { button: 0, buttons: 1 });
    fire(el, "mousedown", "MouseEvent", { button: 0, buttons: 1 });
    fire(el, "pointerup", "PointerEvent", { button: 0 });
    fire(el, "mouseup", "MouseEvent", { button: 0 });
    el.click();
  }

  const indexOf = (field, label) => field.options.findIndex((option) => option.label === label);

  function fillText(field, text) {
    const value = field.maxlength ? String(text).slice(0, field.maxlength) : String(text);

    typeInto(field.el, value);
    leave(field.el);
  }

  function fillSelect(field, label) {
    const option = field.options[indexOf(field, label)];

    if (!option) return;

    setNativeValue(field.el, option.value);
    fire(field.el, "input");
    fire(field.el, "change");
  }

  function fillChoice(field, label) {
    const target = field.els[indexOf(field, label)];

    if (!target) return;

    if (field.kind === "buttons") {
      press(target);

      return;
    }

    if (!target.checked) target.click();

    // Some sites hide the input and only react to clicks on its label.
    if (!target.checked && target.labels?.[0]) target.labels[0].click();
  }

  function fillCheckbox(field, on) {
    if (field.el.checked !== on) field.el.click();
  }

  function fillCheckboxes(field, labels) {
    const wanted = new Set(Array.isArray(labels) ? labels : [labels]);

    field.els.forEach((el, index) => {
      const on = wanted.has(field.options[index].label);

      if (el.checked !== on) el.click();
    });
  }

  function fileFrom(el, resume) {
    const W = win(el);
    const bytes = Uint8Array.from(W.atob(resume.base64), (char) => char.charCodeAt(0));

    return new W.File([bytes], resume.name || "resume.pdf", { type: resume.type || "application/pdf" });
  }

  function fillFile(field, resume) {
    const W = win(field.el);

    if (!resume?.base64 || !W.DataTransfer) return;

    const transfer = new W.DataTransfer();

    transfer.items.add(fileFrom(field.el, resume));
    field.el.files = transfer.files;
    fire(field.el, "input");
    fire(field.el, "change");
  }

  /** Options shown for a combobox right now (by its listbox id, else any visible [role=option]). */
  function visibleOptions(field) {
    const doc = field.el.ownerDocument;
    const listbox = field.listbox ? doc.getElementById(field.listbox) : null;
    const scope = listbox || doc;
    const byReactSelect = field.el.id ? [...doc.querySelectorAll(`[id^="react-select-${CSS_escape(field.el.id)}-option"]`)] : [];
    const options = byReactSelect.length ? byReactSelect : [...scope.querySelectorAll("[role='option']")];

    return options.filter(util.isVisible).map((node) => ({ label: scanner.textOf(node), value: scanner.textOf(node), node }));
  }

  function CSS_escape(value) {
    return String(value).replace(/["\\]/g, "\\$&");
  }

  async function waitForOptions(field, ms) {
    const until = Date.now() + ms;

    for (;;) {
      const options = visibleOptions(field);

      if (options.length || Date.now() > until) return options;

      await util.sleep(100);
    }
  }

  /** ArrowDown opens most custom dropdowns; a left-button press opens the rest. */
  async function openCombobox(field) {
    field.el.focus?.();
    key(field.el, "ArrowDown");

    if ((await waitForOptions(field, 300)).length) return;

    press(field.el);
  }

  function closeCombobox(el) {
    key(el, "Escape");
    leave(el);
  }

  /** Opens the dropdown, reads its options, closes it. Empty for search-as-you-type boxes. */
  async function readComboboxOptions(field) {
    await openCombobox(field);

    const options = await waitForOptions(field, 1200);

    closeCombobox(field.el);

    return options.map(({ label, value }) => ({ label, value })).filter((option) => option.label);
  }

  /** Type the text, wait for the list, click the best option. */
  async function fillCombobox(field, text) {
    const el = field.el;

    await typeChars(el, String(text));

    let options = await waitForOptions(field, 2500);

    // Some lists don't filter on typing: open the full list instead.
    if (!options.length) {
      setNativeValue(el, "");
      fire(el, "input", "InputEvent");
      await openCombobox(field);
      options = await waitForOptions(field, 1200);
    }

    const best = match.pickOption(options, text) || (options.length === 1 ? options[0] : null);

    if (!best) {
      setNativeValue(el, "");
      fire(el, "input", "InputEvent");
      closeCombobox(el);

      return;
    }

    press(best.node);
    await util.sleep(150);
  }

  const SUGGESTION = "[role='option'], .dropdown-location, [class*='suggestion' i] li, [class*='autocomplete' i] li, .pac-item, [class*='result' i] > [class*='location' i]";

  /** Place search boxes: suggestions show near the input, not in a listbox. */
  function suggestions(el) {
    for (let box = el.parentElement, level = 0; box && level < 3; box = box.parentElement, level += 1) {
      const found = [...box.querySelectorAll(SUGGESTION)].filter((node) => util.isVisible(node) && scanner.textOf(node));

      if (found.length) return found.map((node) => ({ label: scanner.textOf(node), value: scanner.textOf(node), node }));
    }

    return [];
  }

  /**
   * "Porto, Portugal" vs "Portogruaro, Venice, ITA" and "Porto, Porto District, PRT":
   * the exact city first (else a city that starts the same), then the one that names the country.
   */
  function pickPlace(options, text) {
    const exact = match.pickOption(options, text);

    if (exact) return exact;

    const [city, ...rest] = String(text)
      .split(",")
      .map((part) => util.normalize(part))
      .filter(Boolean);
    const first = (option) => util.normalize(String(option.label).split(",")[0]);
    const sameCity = options.filter((option) => first(option) === city);
    const pool = sameCity.length ? sameCity : options.filter((option) => util.normalize(option.label).startsWith(city));
    const hint = (option) => rest.some((part) => util.normalize(option.label).includes(part) || util.normalize(option.label).includes(part.slice(0, 3)));

    return pool.find(hint) || pool[0] || null;
  }

  /** Types the city, waits for suggestions, clicks the best. Without suggestions the full text stays. */
  async function fillSuggest(field, text) {
    const el = field.el;
    const query = String(text).split(",")[0].trim();

    await typeChars(el, query);

    const until = Date.now() + 3000;
    let options = [];

    while (!options.length && Date.now() < until) {
      await util.sleep(150);
      options = suggestions(el);
    }

    const best = pickPlace(options, text);

    if (best) {
      press(best.node);
      await util.sleep(200);

      return;
    }

    await typeChars(el, String(text));
    leave(el);
  }

  // Date and number inputs drop any other text (Chrome logs a warning): leave those fields to you.
  const FORMAT = { date: /^\d{4}-\d{2}-\d{2}$/, number: /^-?\d+(\.\d+)?$/ };

  /** value: text, option label, array of labels, true/false, or "resume". */
  async function fillField(field, value, { resume } = {}) {
    if (FORMAT[field.kind] && !FORMAT[field.kind].test(String(value).trim())) return false;

    switch (field.kind) {
      case "select":
        fillSelect(field, value);
        break;
      case "radio":
      case "buttons":
        fillChoice(field, value);
        // The page shows the choice after React re-renders.
        await util.sleep(150);
        break;
      case "checkbox":
        fillCheckbox(field, Boolean(value));
        break;
      case "checkboxes":
        fillCheckboxes(field, value);
        break;
      case "file":
        fillFile(field, resume);
        break;
      case "combobox":
        await fillCombobox(field, Array.isArray(value) ? value[0] : value);
        break;
      default:
        if (field.suggest) await fillSuggest(field, match.valueToText(value));
        else fillText(field, match.valueToText(value));
    }

    return !scanner.isEmpty(field) || (field.kind === "checkbox" && value === false);
  }

  function outline(field, color) {
    const box = field.box || field.el;

    if (!box?.style) return;

    if (box.dataset.afOutline === undefined) box.dataset.afOutline = box.style.outline || "";

    box.style.outline = `2px solid ${COLORS[color] || color}`;
    box.style.outlineOffset = "2px";
  }

  function clearOutlines(doc = document) {
    for (const box of doc.querySelectorAll("[data-af-outline]")) {
      box.style.outline = box.dataset.afOutline;
      box.style.outlineOffset = "";
      delete box.dataset.afOutline;
    }
  }

  AF.fill = { fillField, readComboboxOptions, setNativeValue, pickPlace, outline, clearOutlines, COLORS };

  if (typeof module !== "undefined" && module.exports) module.exports = AF.fill;
})(globalThis);
