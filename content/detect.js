/*
 * Entry point (loaded last). Shows the Fill button only on pages that look like a job application,
 * and keeps checking while single-page apps change the page.
 *
 * Job form = at least 4 visible fields, no password field, not LinkedIn, and one of:
 * a file field, an email field, or a known job site.
 * Nothing leaves the browser until you click Fill.
 */
(function (root) {
  const AF = (root.AF = root.AF || {});
  const util = AF.util || require("./util.js");

  const JOB_SITES = /(^|\.)(ashbyhq\.com|greenhouse\.io|lever\.co|workable\.com|smartrecruiters\.com|teamtailor\.com|recruitee\.com|personio\.(de|com)|jobvite\.com|breezy\.hr|bamboohr\.com|rippling\.com|join\.com)$/i;
  const NEVER = /(^|\.)linkedin\.com$/i;
  const NOT_FIELDS = new Set(["hidden", "submit", "button", "reset", "image"]);

  function looksLikeJobForm(doc) {
    const host = doc.location?.hostname || "";

    if (NEVER.test(host)) return false;

    const inputs = [...doc.querySelectorAll("input, select, textarea")].filter((el) => !el.closest(`#${AF.panel?.HOST_ID || "applyfill-root"}`));

    if (inputs.length < 4) return false;

    if (inputs.some((el) => el.type === "password" && util.isVisible(el))) return false;

    const fields = inputs.filter((el) => !NOT_FIELDS.has(el.type) && (el.type === "file" || util.isVisible(el)));

    if (fields.length < 4) return false;

    const hasEmail = fields.some((el) => el.type === "email" || /e-?mail/i.test(`${el.name} ${el.id} ${el.getAttribute("autocomplete") || ""}`));

    return JOB_SITES.test(host) || hasEmail || fields.some((el) => el.type === "file");
  }

  AF.detect = { looksLikeJobForm, JOB_SITES };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AF.detect;

    return;
  }

  if (typeof chrome === "undefined" || !chrome.runtime?.id || root.__jobAutofillStarted) return;

  root.__jobAutofillStarted = true;

  const storage = { get: (keys) => chrome.storage.local.get(keys), set: (items) => chrome.storage.local.set(items) };
  const ask = (message) => chrome.runtime.sendMessage(message).catch((error) => ({ ok: false, error: error.message }));

  let ui = null;
  let runner = null;
  let isJobForm = false;

  function ensureUi() {
    if (ui && document.documentElement.contains(ui.host)) return;

    ui = AF.panel.mount(document, {
      onFill: () => runner.fill(),
      onSave: () => runner.save(),
      onSettings: () => ask({ type: "open-options" }),
    });
    runner = AF.main.createRunner({ doc: document, storage, ask, ui, log: (error) => console.warn("[ApplyFill]", error) });
  }

  async function check() {
    const { settings } = await storage.get(["settings"]);

    if (settings?.button_hidden) return;

    isJobForm = looksLikeJobForm(document);

    if (isJobForm) {
      ensureUi();
      ui.show();
    } else if (ui) {
      ui.hide();
    }
  }

  let timer = null;

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => check().catch(() => {}), 800);
  };

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();

  // Keyboard shortcut (Alt+Shift+F) from the background worker. Every frame gets it; only a frame
  // with a job form acts.
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "fill") return;

    if (!looksLikeJobForm(document)) return;

    ensureUi();
    ui.show();
    runner.fill();
  });
})(globalThis);
