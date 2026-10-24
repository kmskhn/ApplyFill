/*
 * Small helpers shared by all content scripts.
 *
 * Every content file is a plain script (no build step). They share globalThis.AF in the browser,
 * and each one also sets module.exports so `node --test` can load it.
 */
(function (root) {
  const AF = (root.AF = root.AF || {});

  /** Lowercase, no accents, no punctuation, one space between words. */
  function normalize(text) {
    return String(text ?? "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}+#]+/gu, " ")
      .trim();
  }

  /** Label text without "*", "(required)", "(optional)" and extra spaces. */
  function cleanLabel(text) {
    return String(text ?? "")
      .replace(/\s+/g, " ")
      .replace(/\(\s*(required|optional)\s*\)/gi, "")
      .replace(/[\s*✱]+$/g, "")
      .replace(/^[\s*✱]+/g, "")
      .trim()
      .slice(0, 400);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // jsdom has no layout: every rect is empty. Only real browsers check rects.
  const hasLayout = (win) => !/jsdom/i.test(win?.navigator?.userAgent || "");

  /** Shown on screen: not display:none / visibility:hidden / [hidden], and (in a browser) has a box. */
  function isVisible(el) {
    if (!el || !el.ownerDocument) return false;

    const win = el.ownerDocument.defaultView;

    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hidden) return false;

      const style = win.getComputedStyle(node);

      if (style.display === "none" || style.visibility === "hidden") return false;
    }

    if (!hasLayout(win)) return true;

    return el.getClientRects().length > 0;
  }

  /**
   * Resolves when the page has not changed for `quietMs`, or after `maxMs`.
   * Used after a resume upload: some sites read the file and fill fields themselves.
   */
  function waitForQuiet(doc, quietMs = 1500, maxMs = 8000) {
    return new Promise((resolve) => {
      let timer = null;

      const done = () => {
        observer.disconnect();
        clearTimeout(timer);
        clearTimeout(limit);
        resolve();
      };

      const observer = new doc.defaultView.MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(done, quietMs);
      });

      observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });

      timer = setTimeout(done, quietMs);

      const limit = setTimeout(done, maxMs);
    });
  }

  /** Short text for the panel and the AI prompt. */
  function truncate(text, max) {
    const value = String(text ?? "");

    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  AF.util = { normalize, cleanLabel, sleep, isVisible, waitForQuiet, truncate, hasLayout };

  if (typeof module !== "undefined" && module.exports) module.exports = AF.util;
})(globalThis);
