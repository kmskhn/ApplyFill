/*
 * Settings page: profile, resume, AI keys, saved answers, backup. Everything lives in
 * chrome.storage.local (this browser only).
 */

// type: text | number | yesno | list (comma separated) | textarea
const SCHEMA = [
  {
    title: "About you",
    fields: [
      ["first_name", "First name"],
      ["last_name", "Last name"],
      ["preferred_name", "Preferred name"],
      ["email", "Email"],
      ["phone", "Phone (with country code)", "text", "+1 555 010 0199"],
      ["phone_country_code", "Phone country code", "text", "+1"],
      ["city", "City"],
      ["state", "State / region"],
      ["country", "Country"],
      ["postal_code", "Postal code"],
      ["address", "Street address", "text", "", true],
    ],
  },
  {
    title: "Links",
    fields: [
      ["linkedin", "LinkedIn URL"],
      ["github", "GitHub URL"],
      ["portfolio", "Portfolio / website"],
    ],
  },
  {
    title: "Work",
    fields: [
      ["current_title", "Current title"],
      ["current_company", "Current company"],
      ["years_experience", "Years of experience", "number"],
      ["notice_period", "Notice period", "text", "30 days"],
      ["start_date", "Earliest start date", "text", "1 month after offer, or 2026-12-01"],
      ["salary_expectation", "Salary expectation (used when the job shows no range)", "text", "EUR 75,000 a year"],
      ["how_heard", '"How did you hear about us?"', "text", "Company website"],
    ],
  },
  {
    title: "Work rights",
    fields: [
      ["needs_sponsorship", "Need visa sponsorship?", "yesno"],
      ["work_countries", "Countries you can already work in", "list", "e.g. Canada, United States"],
      ["willing_to_relocate", "Willing to relocate?", "yesno"],
      ["over_18", "Over 18?", "yesno"],
    ],
  },
  {
    title: "Education and languages",
    fields: [
      ["school", "School / university"],
      ["degree", "Degree", "text", "e.g. Bachelor of Science"],
      ["field_of_study", "Field of study"],
      ["graduation_year", "Graduation year"],
      ["languages", "Languages", "text", "English (fluent), Spanish (native)", true],
    ],
  },
  {
    title: "For the AI",
    fields: [
      ["technologies", "Skills (comma separated)", "list", "e.g. Python, SQL, Project management", true],
      ["ai_notes", "Anything else the AI should know", "textarea", "e.g. Open to hybrid, up to 3 office days a week. Not open to travel more than 20%.", true],
    ],
  },
  {
    title: "Personal questions (never sent to AI)",
    note: 'Used for gender, race, veteran, disability questions. "Prefer not to say" picks the site\'s decline option. Leave empty to answer each time.',
    fields: [
      ["eeo.gender", "Gender"],
      ["eeo.race", "Race / ethnicity"],
      ["eeo.hispanic", "Hispanic or Latino?"],
      ["eeo.veteran", "Veteran status"],
      ["eeo.disability", "Disability"],
      ["eeo.sexual_orientation", "Sexual orientation"],
      ["eeo.transgender", "Transgender?"],
      ["pronouns", "Pronouns"],
      ["nationality", "Nationality", "text", "e.g. Canada"],
      ["date_of_birth", "Date of birth", "text", "YYYY-MM-DD"],
    ],
  },
];

const EEO_DEFAULT = "Prefer not to say";

const $ = (selector) => document.querySelector(selector);

const store = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
};

const getPath = (obj, path) => path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), obj);

function setPath(obj, path, value) {
  const keys = path.split(".");
  let node = obj;

  keys.slice(0, -1).forEach((key) => {
    node[key] = node[key] && typeof node[key] === "object" ? node[key] : {};
    node = node[key];
  });

  if (value === undefined) delete node[keys.at(-1)];
  else node[keys.at(-1)] = value;
}

// ---------- profile form ----------

function renderProfile(profile) {
  const form = $("#profile");

  form.replaceChildren();

  for (const section of SCHEMA) {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");

    legend.textContent = section.title;
    fieldset.append(legend);

    if (section.note) {
      const note = document.createElement("p");

      note.className = "muted small";
      note.textContent = section.note;
      fieldset.append(note);
    }

    const grid = document.createElement("div");

    grid.className = "grid";

    for (const [key, label, type = "text", placeholder = "", wide = false] of section.fields) {
      const wrap = document.createElement("div");
      const id = `p-${key.replace(/\./g, "-")}`;

      wrap.className = `field${wide || type === "textarea" ? " wide" : ""}`;

      const labelEl = document.createElement("label");

      labelEl.htmlFor = id;
      labelEl.textContent = label;

      let input;

      if (type === "yesno") {
        input = document.createElement("select");

        for (const [value, text] of [
          ["", "—"],
          ["yes", "Yes"],
          ["no", "No"],
        ]) {
          input.append(new Option(text, value));
        }
      } else if (type === "textarea") {
        input = document.createElement("textarea");
        input.rows = 3;
      } else {
        input = document.createElement("input");
        input.type = type === "number" ? "number" : "text";
      }

      input.id = id;
      input.dataset.key = key;
      input.dataset.type = type;
      input.placeholder = placeholder;

      const value = getPath(profile, key);

      if (type === "yesno") input.value = value === true ? "yes" : value === false ? "no" : "";
      else if (type === "list") input.value = Array.isArray(value) ? value.join(", ") : value || "";
      else input.value = value ?? "";

      input.addEventListener("input", dirty);
      wrap.append(labelEl, input);
      grid.append(wrap);
    }

    fieldset.append(grid);
    form.append(fieldset);
  }
}

function readProfile(base = {}) {
  const profile = structuredClone(base);

  for (const input of document.querySelectorAll("#profile [data-key]")) {
    const { key, type } = input.dataset;
    const raw = input.value.trim();
    let value;

    if (type === "yesno") value = raw === "yes" ? true : raw === "no" ? false : undefined;
    else if (type === "number") value = raw === "" ? undefined : Number(raw);
    else if (type === "list")
      value = raw
        ? raw
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
        : undefined;
    else value = raw || undefined;

    setPath(profile, key, value);
  }

  return profile;
}

/** Fills only empty inputs. Returns how many were filled. */
function fillEmpty(values) {
  let count = 0;

  for (const input of document.querySelectorAll("#profile [data-key]")) {
    const value = getPath(values, input.dataset.key);

    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0) || value === 0) continue;

    if (input.value.trim() !== "") continue;

    if (input.dataset.type === "yesno") input.value = value === true ? "yes" : value === false ? "no" : "";
    else input.value = Array.isArray(value) ? value.join(", ") : String(value);

    count += 1;
  }

  if (count) dirty();

  return count;
}

// ---------- save ----------

let state = { profile: {}, resume: null, answers: {}, settings: {}, ai_state: {} };

function dirty() {
  $("#saved").textContent = "Unsaved changes";
}

async function save() {
  const profile = readProfile(state.profile);
  const settings = {
    ...state.settings,
    gemini_key: $("#gemini-key").value.trim(),
    openrouter_key: $("#openrouter-key").value.trim(),
    button_hidden: $("#button-hidden").checked,
  };
  const items = { profile, settings };

  if (state.resume || $("#resume-text").value.trim()) items.resume = { ...(state.resume || {}), text: $("#resume-text").value };

  await store.set(items);
  Object.assign(state, items);
  $("#saved").textContent = "Saved";
}

// ---------- resume ----------

function showResume() {
  const resume = state.resume;

  $("#resume-name").textContent = resume?.base64 ? `${resume.name} · ${Math.round((resume.size || 0) / 1024)} KB` : "No resume yet.";
  $("#resume-text").value = resume?.text || "";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function onResumeFile(event) {
  const file = event.target.files[0];

  if (!file) return;

  const base64 = await fileToBase64(file);

  state.resume = { ...(state.resume || {}), name: file.name, type: file.type || "application/pdf", size: file.size, base64, text: $("#resume-text").value };
  await store.set({ resume: state.resume });
  showResume();
  $("#saved").textContent = "Resume saved";
  event.target.value = "";
}

async function onReadResume() {
  const button = $("#read-resume");

  button.disabled = true;
  button.textContent = "Reading…";

  try {
    await save();

    const reply = await chrome.runtime.sendMessage({ type: "read-resume" });

    if (!reply?.ok) throw new Error(reply?.error || "failed");

    $("#resume-text").value = reply.text;

    const filled = fillEmpty(reply.profile || {});

    await save();
    $("#saved").textContent = `Resume text saved${filled ? ` · ${filled} empty profile fields filled: check them` : ""}`;
  } catch (error) {
    $("#saved").textContent = `Could not read: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Read text from PDF with AI";
  }
}

// ---------- AI ----------

function showUsage() {
  const lines = Object.entries(state.ai_state || {}).map(([provider, day]) => `${provider}: ${day.used || 0} requests on ${day.day}${day.exhausted?.length ? ` · used up: ${day.exhausted.join(", ")}` : ""}`);

  $("#ai-usage").textContent = lines.length ? lines.join(" — ") : "No AI requests yet.";
}

async function onTest() {
  const out = $("#ai-result");

  out.textContent = "Testing…";
  await save();

  const reply = await chrome.runtime.sendMessage({ type: "ai-test" });

  out.textContent = reply?.ok ? `Works: ${reply.provider} ${reply.model}` : `Failed: ${reply?.error}`;
  state.ai_state = (await store.get(["ai_state"])).ai_state || {};
  showUsage();
}

// ---------- saved answers ----------

function renderAnswers() {
  const box = $("#answers");
  const filter = $("#answers-filter").value.trim().toLowerCase();
  const entries = Object.entries(state.answers || {})
    .filter(([key, entry]) => !filter || key.includes(filter) || String(entry.label).toLowerCase().includes(filter))
    .sort((a, b) => String(b[1].updated_at).localeCompare(String(a[1].updated_at)));

  box.replaceChildren();

  if (entries.length === 0) {
    const empty = document.createElement("p");

    empty.className = "muted";
    empty.textContent = filter ? "No match." : "No saved answers yet.";
    box.append(empty);

    return;
  }

  for (const [key, entry] of entries) {
    const row = document.createElement("div");
    const question = document.createElement("div");
    const remove = document.createElement("button");
    const answer = document.createElement("textarea");
    const meta = document.createElement("div");

    row.className = "answer";
    question.className = "q";
    question.textContent = entry.label;
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Delete";
    answer.rows = Array.isArray(entry.answer) || String(entry.answer).length < 80 ? 1 : 4;
    answer.value = Array.isArray(entry.answer) ? entry.answer.join(", ") : String(entry.answer);
    meta.className = "meta";
    meta.textContent = [entry.kind, entry.host, entry.options?.length ? `options: ${entry.options.slice(0, 6).join(" | ")}${entry.options.length > 6 ? " …" : ""}` : "", `used ${entry.count || 1}×`].filter(Boolean).join(" · ");

    answer.addEventListener("change", async () => {
      const text = answer.value.trim();

      state.answers[key] = {
        ...entry,
        answer: Array.isArray(entry.answer)
          ? text
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean)
          : typeof entry.answer === "boolean"
            ? /^(yes|true)$/i.test(text)
            : text,
        updated_at: new Date().toISOString(),
      };
      await store.set({ answers: state.answers });
      $("#saved").textContent = "Answer saved";
    });

    remove.addEventListener("click", async () => {
      delete state.answers[key];
      await store.set({ answers: state.answers });
      renderAnswers();
    });

    row.append(question, remove, answer, meta);
    box.append(row);
  }
}

// ---------- backup ----------

async function onExport() {
  await save();

  const { profile, resume, answers } = await store.get(["profile", "resume", "answers"]);
  const blob = new Blob([JSON.stringify({ app: "applyfill", version: 1, exported_at: new Date().toISOString(), profile, resume, answers }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");

  link.href = URL.createObjectURL(blob);
  link.download = `applyfill-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function onImportBackup(event) {
  const file = event.target.files[0];

  if (!file) return;

  try {
    const json = JSON.parse(await file.text());

    if (json.app !== "applyfill") throw new Error("not an ApplyFill backup");

    const items = {};

    if (json.profile) items.profile = json.profile;
    if (json.resume) items.resume = json.resume;
    if (json.answers) items.answers = json.answers;

    await store.set(items);
    await load();
    $("#saved").textContent = "Backup imported";
  } catch (error) {
    $("#saved").textContent = `Import failed: ${error.message}`;
  }

  event.target.value = "";
}

// ---------- tabs and start ----------

function showTab(name) {
  for (const button of document.querySelectorAll(".tabs button")) button.setAttribute("aria-selected", String(button.dataset.tab === name));
  for (const tab of document.querySelectorAll(".tab")) tab.hidden = tab.id !== `tab-${name}`;

  if (name === "answers") renderAnswers();
  if (name === "ai") showUsage();

  try {
    localStorage.setItem("tab", name);
  } catch {
    // Private window: the tab is just not remembered.
  }
}

async function load() {
  const data = await store.get(["profile", "resume", "answers", "settings", "ai_state"]);

  state = { profile: data.profile || {}, resume: data.resume || null, answers: data.answers || {}, settings: data.settings || {}, ai_state: data.ai_state || {} };

  // First run: personal questions default to "Prefer not to say".
  if (!data.profile) {
    state.profile = { over_18: true, eeo: Object.fromEntries(["gender", "race", "hispanic", "veteran", "disability", "sexual_orientation", "transgender"].map((key) => [key, EEO_DEFAULT])) };
  }

  renderProfile(state.profile);
  showResume();
  $("#gemini-key").value = state.settings.gemini_key || "";
  $("#openrouter-key").value = state.settings.openrouter_key || "";
  $("#button-hidden").checked = Boolean(state.settings.button_hidden);
  renderAnswers();
  showUsage();
  $("#saved").textContent = data.profile ? "" : "New profile: fill it in and Save";
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", async () => {
  for (const button of document.querySelectorAll(".tabs button")) button.addEventListener("click", () => showTab(button.dataset.tab));

  $("#save").addEventListener("click", save);
  $("#resume-file").addEventListener("change", onResumeFile);
  $("#read-resume").addEventListener("click", onReadResume);
  $("#resume-text").addEventListener("input", dirty);
  $("#gemini-key").addEventListener("input", dirty);
  $("#openrouter-key").addEventListener("input", dirty);
  $("#button-hidden").addEventListener("change", dirty);
  $("#ai-test").addEventListener("click", onTest);
  $("#answers-filter").addEventListener("input", renderAnswers);
  $("#export").addEventListener("click", onExport);
  $("#import-backup").addEventListener("change", onImportBackup);
  for (const link of document.querySelectorAll("[data-go]")) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showTab(link.dataset.go);
    });
  }

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "s") {
      event.preventDefault();
      save();
    }
  });

  await load();

  let tab = "profile";

  try {
    tab = localStorage.getItem("tab") || tab;
  } catch {
    // ignore
  }

  showTab(tab);
});

