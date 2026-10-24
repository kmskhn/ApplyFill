/*
 * The floating "Fill" button and the results panel, inside a shadow root so the page's CSS
 * can't change it (and ours can't change the page).
 *
 *   const ui = AF.panel.mount(document, { onFill, onSave, onSettings });
 *   ui.show(); ui.hide(); ui.status("..."); ui.results(rows);
 */
(function (root) {
  const AF = (root.AF = root.AF || {});
  const util = AF.util || require("./util.js");

  const HOST_ID = "applyfill-root";

  // Row source -> color and short tag in the panel.
  const LOOK = {
    rule: { color: "green", tag: "profile" },
    profile: { color: "green", tag: "profile" },
    memory: { color: "green", tag: "saved" },
    check: { color: "yellow", tag: "check" },
    ai: { color: "yellow", tag: "AI" },
    consent: { color: "red", tag: "you" },
    sensitive: { color: "red", tag: "you" },
    manual: { color: "red", tag: "you" },
    failed: { color: "red", tag: "failed" },
    filled: { color: "grey", tag: "kept" },
  };

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .wrap { --bg: #ffffff; --fg: #111827; --muted: #6b7280; --line: #e5e7eb; --chip: #f3f4f6; --accent: #2563eb; --accent-fg: #ffffff;
            --green: #16a34a; --yellow: #d97706; --red: #dc2626; --grey: #9ca3af;
            position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; color: var(--fg); }
    @media (prefers-color-scheme: dark) {
      .wrap { --bg: #1f2937; --fg: #f9fafb; --muted: #9ca3af; --line: #374151; --chip: #111827; --accent: #3b82f6; }
    }
    .fab { border: 0; border-radius: 999px; padding: 12px 18px; background: var(--accent); color: var(--accent-fg); font-size: 14px; font-weight: 600;
           box-shadow: 0 6px 20px rgba(0,0,0,.25); cursor: pointer; display: flex; align-items: center; gap: 8px; }
    .fab:hover { filter: brightness(1.08); }
    .fab:disabled { opacity: .7; cursor: progress; }
    .panel { width: min(380px, calc(100vw - 32px)); max-height: min(70vh, 640px); background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
             box-shadow: 0 12px 40px rgba(0,0,0,.25); display: none; flex-direction: column; overflow: hidden; font-size: 13px; }
    .panel.open { display: flex; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--line); font-weight: 600; font-size: 14px; }
    header button { border: 0; background: transparent; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; padding: 2px 6px; }
    .status { padding: 8px 12px; color: var(--muted); border-bottom: 1px solid var(--line); }
    .counts { display: flex; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--line); }
    .counts span { display: flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    .dot.green { background: var(--green); } .dot.yellow { background: var(--yellow); } .dot.red { background: var(--red); } .dot.grey { background: var(--grey); }
    ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
    li button { width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: var(--fg); padding: 8px 12px;
                display: grid; grid-template-columns: 10px 1fr auto; gap: 4px 8px; align-items: start; cursor: pointer; font-size: 13px; }
    li button:hover { background: var(--chip); }
    li .dot { margin-top: 4px; }
    .q { font-weight: 500; overflow-wrap: anywhere; }
    .v { grid-column: 2 / 4; color: var(--muted); overflow-wrap: anywhere; }
    .tag { font-size: 11px; color: var(--muted); background: var(--chip); border-radius: 6px; padding: 1px 6px; }
    footer { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--line); flex-wrap: wrap; }
    footer button { flex: 1; border: 1px solid var(--line); background: var(--chip); color: var(--fg); border-radius: 8px; padding: 8px; cursor: pointer; font-size: 13px; }
    footer button.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .note { padding: 0 12px 10px; color: var(--muted); font-size: 12px; }
    .hidden { display: none !important; }
  `;

  function el(doc, tag, attrs = {}, text = "") {
    const node = doc.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);

    if (text) node.textContent = text;

    return node;
  }

  function describe(row) {
    if (row.note && (row.value === null || row.value === undefined || row.value === "")) return row.note;

    const value = Array.isArray(row.value) ? row.value.join(", ") : typeof row.value === "boolean" ? (row.value ? "checked" : "unchecked") : row.value === "resume" && row.field.kind === "file" ? "your resume" : String(row.value ?? "");

    return [util.truncate(value, 140), row.note].filter(Boolean).join(" · ");
  }

  function mount(doc, { onFill, onSave, onSettings } = {}) {
    let host = doc.getElementById(HOST_ID);

    if (host) host.remove();

    host = el(doc, "div", { id: HOST_ID });

    const shadow = host.attachShadow({ mode: "open" });
    const style = el(doc, "style");

    style.textContent = CSS;

    const wrap = el(doc, "div", { class: "wrap hidden" });
    const panel = el(doc, "section", { class: "panel", "aria-label": "ApplyFill" });

    const header = el(doc, "header");
    const title = el(doc, "span", {}, "ApplyFill");
    const close = el(doc, "button", { type: "button", "aria-label": "Close" }, "×");

    header.append(title, close);

    const status = el(doc, "div", { class: "status" }, "");
    const counts = el(doc, "div", { class: "counts hidden" });
    const list = el(doc, "ul");
    const note = el(doc, "div", { class: "note" }, "It never submits. Check yellow and red, then submit yourself.");

    const footer = el(doc, "footer");
    const save = el(doc, "button", { type: "button", class: "primary" }, "Save my answers");
    const again = el(doc, "button", { type: "button" }, "Fill again");
    const settings = el(doc, "button", { type: "button" }, "Settings");

    footer.append(save, again, settings);
    panel.append(header, status, counts, list, footer, note);

    const fab = el(doc, "button", { type: "button", class: "fab", title: "Fill this form (Alt+Shift+F)" }, "⚡ Fill");

    wrap.append(panel, fab);
    shadow.append(style, wrap);
    doc.documentElement.append(host);

    const open = () => panel.classList.add("open");

    fab.addEventListener("click", () => onFill?.());
    again.addEventListener("click", () => onFill?.());
    save.addEventListener("click", () => onSave?.());
    settings.addEventListener("click", () => onSettings?.());
    close.addEventListener("click", () => panel.classList.remove("open"));

    return {
      host,
      show: () => wrap.classList.remove("hidden"),
      hide: () => {
        if (!panel.classList.contains("open")) wrap.classList.add("hidden");
      },
      isOpen: () => panel.classList.contains("open"),
      busy(on) {
        fab.disabled = on;
        again.disabled = on;
        save.disabled = on;
        fab.textContent = on ? "… Filling" : "⚡ Fill";
      },
      status(text) {
        open();
        status.textContent = text;
      },
      results(rows) {
        open();
        list.replaceChildren();

        const tally = { green: 0, yellow: 0, red: 0, grey: 0 };

        for (const row of rows) {
          const look = LOOK[row.source] || LOOK.manual;

          tally[look.color] += 1;

          const item = el(doc, "li");
          const button = el(doc, "button", { type: "button", title: "Show this field" });

          button.append(el(doc, "span", { class: `dot ${look.color}` }), el(doc, "span", { class: "q" }, util.truncate(row.field.label || "(no label)", 120)), el(doc, "span", { class: "tag" }, look.tag), el(doc, "span", { class: "v" }, describe(row)));

          button.addEventListener("click", () => {
            (row.field.box || row.field.el).scrollIntoView?.({ block: "center", behavior: "smooth" });
            row.field.el.focus?.({ preventScroll: true });
          });

          item.append(button);
          list.append(item);
        }

        counts.replaceChildren(
          ...[
            ["green", "filled"],
            ["yellow", "check"],
            ["red", "you"],
            ["grey", "kept"],
          ]
            .filter(([color]) => tally[color] > 0)
            .map(([color, word]) => {
              const span = el(doc, "span");

              span.append(el(doc, "span", { class: `dot ${color}` }), doc.createTextNode(`${tally[color]} ${word}`));

              return span;
            }),
        );
        counts.classList.toggle("hidden", rows.length === 0);
      },
    };
  }

  AF.panel = { mount, LOOK, HOST_ID };

  if (typeof module !== "undefined" && module.exports) module.exports = AF.panel;
})(globalThis);
