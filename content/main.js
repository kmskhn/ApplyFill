/*
 * What one click on "Fill" does:
 *   1. upload the resume first (some sites read it and fill fields themselves), wait until quiet
 *   2. scan the form, plan every empty field (match.classify)
 *   3. fill profile and saved answers
 *   4. one AI request for the rest, fill those
 *   5. outline every field (green / yellow / red) and list them in the panel
 * Never submits. "Save my answers" (or the page's submit) stores your answers for next time.
 *
 * createRunner({ doc, storage, ask, ui }) -> { fill, save, rows }
 *   storage: { get(keys) -> Promise<obj>, set(obj) -> Promise }  (chrome.storage.local)
 *   ask(message) -> Promise<reply>                               (chrome.runtime.sendMessage)
 */
(function (root) {
  const AF = (root.AF = root.AF || {});
  const util = AF.util || require("./util.js");
  const match = AF.match || require("./match.js");
  const memory = AF.memory || require("./memory.js");
  const scanner = AF.scan || require("./scan.js");
  const filler = AF.fill || require("./fill.js");

  const COLOR = { rule: "green", profile: "green", memory: "green", check: "yellow", ai: "yellow", consent: "red", sensitive: "red", manual: "red", failed: "red" };

  // These answers come from the profile or are yours to give each time: never saved as answers.
  const NOT_SAVED = new Set(["rule", "check", "consent"]);

  // waits: how long to wait for the page to settle after the resume upload (tests use small numbers).
  function createRunner({ doc = document, storage, ask, ui = null, log = () => {}, waits = { quietMs: 1500, maxMs: 8000 } }) {
    let running = false;
    let lastRows = null;

    const say = (text) => ui?.status(text);

    async function load() {
      const data = await storage.get(["profile", "resume", "answers", "settings"]);

      return { profile: data.profile || {}, resume: data.resume || null, answers: data.answers || {}, settings: data.settings || {} };
    }

    const isResumeField = (field, profile) => field.kind === "file" && match.ruleFor(field, profile)?.key === "resume";

    async function uploadResumeFirst(fields, { profile, resume }) {
      const field = fields.find((one) => isResumeField(one, profile) && scanner.isEmpty(one));

      if (!field || !resume?.base64) return null;

      say("Uploading your resume…");

      await filler.fillField(field, "resume", { resume });
      await util.waitForQuiet(doc, waits.quietMs, waits.maxMs);

      return field;
    }

    /** After the upload, sites often replace their file field with the file name: show it as ours. */
    function markUploaded(rows, uploaded, profile) {
      const row = rows.find((one) => isResumeField(one.field, profile) || one.field.el === uploaded.el);

      if (row) Object.assign(row, { field: { ...row.field, label: uploaded.label }, source: "rule", value: "resume", note: "" });
      else rows.unshift({ field: uploaded, source: "rule", value: "resume" });
    }

    function plan(fields, { profile, answers, resume }, job) {
      return fields.map((field) => {
        if (field.kind === "file" && isResumeField(field, profile)) {
          if (!scanner.isEmpty(field)) return { field, source: "filled", value: scanner.currentValue(field) };

          return resume?.base64 ? { field, source: "rule", value: "resume" } : { field, source: "manual", value: null, note: "Add your resume PDF in settings" };
        }

        if (!scanner.isEmpty(field)) return { field, source: "filled", value: scanner.currentValue(field) };

        return { field, ...match.classify(field, profile, (one) => memory.lookup(answers, one), job) };
      });
    }

    async function fillRow(row, resume) {
      try {
        const ok = await filler.fillField(row.field, row.value, { resume });

        if (!ok) Object.assign(row, { source: "failed", note: "Could not fill: do it yourself" });
        // Dropdowns and place boxes may pick a longer option ("Porto" -> "Porto, Porto District, Portugal"): show that.
        else if (row.field.kind === "combobox" || row.field.suggest) row.value = scanner.currentValue(row.field) || row.value;
      } catch (error) {
        log(error);
        Object.assign(row, { source: "failed", note: "Could not fill: do it yourself" });
      }
    }

    async function askAi(rows, settings, job) {
      const pending = rows.filter((row) => row.source === "ai");

      if (pending.length === 0) return;

      if (!settings.gemini_key && !settings.openrouter_key) {
        pending.forEach((row) => Object.assign(row, { source: "manual", note: "No AI key: add one in settings" }));

        return;
      }

      // Custom dropdowns only show their options when open: read them so the AI can pick one.
      for (const row of pending) {
        if (row.field.kind === "combobox" && !row.field.options.length) row.field.options = await filler.readComboboxOptions(row.field);
      }

      say(`Asking AI about ${pending.length} question${pending.length > 1 ? "s" : ""}…`);

      const reply = await ask({ type: "ai-answer", fields: pending.map((row) => scanner.toPublic(row.field)), job });

      if (!reply?.ok) {
        pending.forEach((row) => Object.assign(row, { source: "manual", note: reply?.error || "AI failed" }));

        return reply?.error || "AI failed";
      }

      for (const row of pending) {
        const value = reply.answers?.[row.field.id];

        if (value === undefined) {
          Object.assign(row, { source: "manual", note: "AI had no answer: you decide" });

          continue;
        }

        row.value = value;
        await fillRow(row, null);
      }

      return null;
    }

    async function fill() {
      if (running) return null;

      running = true;
      ui?.busy(true);

      try {
        say("Reading the form…");
        filler.clearOutlines(doc);

        const data = await load();
        let fields = scanner.scan(doc);

        const uploaded = await uploadResumeFirst(fields, data);

        if (uploaded) fields = scanner.scan(doc);

        // The job post: the AI reads it, and a salary range in it sets the expected salary.
        const job = scanner.jobContext(doc);
        const rows = plan(fields, data, job);

        if (uploaded) markUploaded(rows, uploaded, data.profile);

        say("Filling from your profile and saved answers…");

        for (const row of rows) {
          if (["rule", "profile", "memory", "check"].includes(row.source) && row.value !== null) await fillRow(row, data.resume);
        }

        const aiError = await askAi(rows, data.settings, job);

        for (const row of rows) if (COLOR[row.source]) filler.outline(row.field, COLOR[row.source]);

        lastRows = rows;
        listenForSubmit();

        const red = rows.filter((row) => COLOR[row.source] === "red").length;
        const yellow = rows.filter((row) => COLOR[row.source] === "yellow").length;

        say(aiError ? `${aiError}` : rows.length === 0 ? "No fields found on this page." : `Done. ${yellow} to check, ${red} for you. Then submit yourself.`);
        ui?.results(rows);

        return rows;
      } catch (error) {
        log(error);
        say(`Error: ${error.message}`);

        return null;
      } finally {
        running = false;
        ui?.busy(false);
      }
    }

    /** Saves what the form holds now (after your edits). Profile facts and consents are left out. */
    async function save({ quiet = false } = {}) {
      const data = await load();
      const fields = scanner.scan(doc);
      const job = scanner.jobContext(doc);
      let answers = data.answers;
      let count = 0;

      for (const field of fields) {
        if (field.kind === "file") continue;

        const source = match.classify(field, data.profile, () => null, job).source;

        if (NOT_SAVED.has(source)) continue;

        const value = scanner.currentValue(field);

        if (value === "" || (Array.isArray(value) && value.length === 0)) continue;

        // An unticked box says nothing; a ticked one is an answer.
        if (field.kind === "checkbox" && value === false) continue;

        const before = answers;

        answers = memory.remember(answers, field, value, { host: doc.location?.hostname || "" });

        if (answers !== before) count += 1;
      }

      await storage.set({ answers });

      if (!quiet) say(count ? `Saved ${count} answer${count > 1 ? "s" : ""}. They fill in next time.` : "Nothing new to save.");

      return count;
    }

    let listening = false;

    // Pages that fire a real submit (or have a submit button) also save your answers.
    function listenForSubmit() {
      if (listening) return;

      listening = true;

      const onSubmit = () => {
        save({ quiet: true }).catch(log);
      };

      doc.addEventListener("submit", onSubmit, true);
      doc.addEventListener(
        "click",
        (event) => {
          const button = event.target?.closest?.("button, input[type='submit']");

          if (!button || button.closest(`#${AF.panel?.HOST_ID || "applyfill-root"}`)) return;

          const text = `${button.textContent || ""} ${button.value || ""}`.trim();

          if (button.type === "submit" || /^(submit|apply|send)( (application|now))?\b/i.test(text)) onSubmit();
        },
        true,
      );
    }

    return { fill, save, rows: () => lastRows };
  }

  AF.main = { createRunner };

  if (typeof module !== "undefined" && module.exports) module.exports = AF.main;
})(globalThis);
