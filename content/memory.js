/*
 * Saved answers: the same question gets the same answer next time.
 *
 * Stored in chrome.storage.local "answers" as { [questionKey]: entry }.
 * entry = { label, kind, answer, options, host, count, updated_at }
 * answer: text, or an array of option labels for multi-select fields.
 */
(function (root) {
  const AF = (root.AF = root.AF || {});
  const { normalize } = AF.util || require("./util.js");
  const match = AF.match || require("./match.js");

  // Words that change nothing about the question.
  const FILLER = new Set(["please", "kindly", "the", "a", "an", "your", "you", "do", "are", "is", "if", "any", "this", "required", "optional", "select", "one", "here", "below"]);

  /** "1. Are you willing to relocate? *" -> "willing to relocate" */
  function questionKey(label) {
    return normalize(String(label ?? "").replace(/^\s*\d+[.)]\s*/, ""))
      .split(" ")
      .filter((word) => word && !FILLER.has(word))
      .join(" ");
  }

  const tokens = (key) => new Set(key.split(" ").filter((word) => word.length > 2));

  function similarity(a, b) {
    const x = tokens(a);
    const y = tokens(b);

    if (x.size === 0 || y.size === 0) return 0;

    let shared = 0;

    for (const word of x) if (y.has(word)) shared += 1;

    return shared / (x.size + y.size - shared);
  }

  /** The saved entry for this field's question: same key, or one very close to it (Jaccard >= 0.85). */
  function findEntry(answers, field) {
    const key = questionKey(field.label);

    if (!key) return null;

    if (answers[key]) return answers[key];

    let best = null;
    let bestScore = 0;

    for (const [other, entry] of Object.entries(answers)) {
      const score = similarity(key, other);

      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }

    return bestScore >= 0.85 ? best : null;
  }

  /**
   * The saved answer, made to fit this field (an option label for choice fields), or null.
   * A saved answer that matches none of today's options is not used.
   */
  function lookup(answers, field) {
    const entry = findEntry(answers || {}, field);

    if (!entry || entry.answer === undefined || entry.answer === null || entry.answer === "") return null;

    if (field.kind === "checkbox") {
      if (typeof entry.answer === "boolean") return entry.answer;

      return /^(yes|true|checked)$/i.test(String(entry.answer)) ? true : /^(no|false|unchecked)$/i.test(String(entry.answer)) ? false : null;
    }

    if (match.isChoice(field)) return match.fitValue(field, entry.answer);

    if (field.kind === "file") return null;

    return Array.isArray(entry.answer) ? entry.answer.join(", ") : String(entry.answer);
  }

  /** Saves (or replaces) the answer for this field's question. Returns the new answers object. */
  function remember(answers, field, answer, { host = "", now = new Date() } = {}) {
    const key = questionKey(field.label);

    if (!key || answer === null || answer === undefined || answer === "" || (Array.isArray(answer) && answer.length === 0)) return answers;

    const old = answers[key];

    return {
      ...answers,
      [key]: {
        label: field.label,
        kind: field.kind,
        answer,
        options: field.options?.length ? field.options.map((option) => option.label).slice(0, 50) : undefined,
        host,
        count: (old?.count || 0) + 1,
        updated_at: now.toISOString(),
      },
    };
  }

  AF.memory = { questionKey, similarity, findEntry, lookup, remember };

  if (typeof module !== "undefined" && module.exports) module.exports = AF.memory;
})(globalThis);
