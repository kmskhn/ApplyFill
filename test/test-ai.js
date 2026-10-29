const test = require("node:test");
const assert = require("node:assert/strict");
const { ai, PROFILE } = require("./helpers.js");

const RESUME = "Alex Doe\nalex@example.com | +1 555 010 0199\nExample Corp, Software Engineer, 2022 - 2025\nBuilt React dashboards.";

test("the prompt has no email, phone, address or EEO answers; dates stay", () => {
  const { prompt, system } = ai.buildPrompt({ profile: PROFILE, resumeText: RESUME, job: { title: "Frontend Engineer at Acme", text: "We build..." }, fields: [{ id: "f1", kind: "textarea", label: "Why Acme?" }] });

  assert.doesNotMatch(prompt, /alex@example\.com|555 010|12 Example Road|Prefer not to say/);
  assert.match(prompt, /2022 - 2025/);
  assert.match(prompt, /Built React dashboards/);
  assert.match(prompt, /"Why Acme\?"/);
  assert.match(system, /Never invent/);
  assert.match(system, /every answer in English/);
});

test("checkAnswers keeps only usable answers", () => {
  const fields = [
    { id: "f1", kind: "select", label: "Office?", options: ["Yes", "No"] },
    { id: "f2", kind: "textarea", label: "Why?", max_length: 10 },
    { id: "f3", kind: "checkboxes", label: "Stack", options: ["React", "Vue"], multiple: true },
    { id: "f4", kind: "number", label: "Years with React" },
    { id: "f5", kind: "select", label: "Level", options: ["Junior", "Senior"] },
    { id: "f6", kind: "text", label: "Empty" },
  ];
  const json = {
    answers: [
      { id: "f1", value: "yes" },
      { id: "f2", value: "Because I really like it" },
      { id: "f3", value: ["React", "Svelte"] },
      { id: "f4", value: "about 6 years" },
      { id: "f5", value: "Principal" },
      { id: "f6", value: "" },
      { id: "f99", value: "unknown id" },
    ],
  };

  assert.deepEqual(ai.checkAnswers(fields, json), { f1: "Yes", f2: "Because I", f3: ["React"], f4: "6" });
  assert.deepEqual(ai.checkAnswers(fields, { nope: 1 }), {});
});

test("extractJsonObject handles fences and thinking", () => {
  assert.deepEqual(ai.extractJsonObject('<think>hmm</think>```json\n{"answers": []}\n```'), { answers: [] });
  assert.throws(() => ai.extractJsonObject("no json"));
});

function fakeFetch(script) {
  const calls = [];

  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });

    const step = script[Math.min(calls.length - 1, script.length - 1)];

    return { ok: step.status === 200, status: step.status, text: async () => JSON.stringify(step.body) };
  };

  return { calls, fetchImpl };
}

const geminiOk = (obj) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] } });

test("Gemini quota on one model: the next model answers, the first is skipped for the day", async () => {
  const { calls, fetchImpl } = fakeFetch([{ status: 429, body: { error: { message: "Quota exceeded for metric PerDay" } } }, geminiOk({ answers: [{ id: "f1", value: "Yes" }] })]);
  const state = {};
  const client = ai.createAi({ keys: { gemini: "k" }, state, fetchImpl, now: () => new Date("2026-10-24T12:00:00Z") });
  const result = await client.answerFields({ profile: PROFILE, resumeText: RESUME, job: {}, fields: [{ id: "f1", kind: "select", label: "Q", options: ["Yes", "No"] }] });

  assert.deepEqual(result.answers, { f1: "Yes" });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /gemini-3\.7-flash/);
  assert.match(calls[1].url, /gemini-3\.6-flash/);
  assert.equal(calls[0].headers["x-goog-api-key"], "k");
  assert.deepEqual(state.gemini.exhausted, ["gemini-3.7-flash"]);
  assert.equal(state.gemini.used, 2);
});

test("bad Gemini key: OpenRouter takes over", async () => {
  const { calls, fetchImpl } = fakeFetch([{ status: 403, body: { error: { message: "API key not valid" } } }, { status: 200, body: { choices: [{ message: { content: '{"ok": true}' } }] } }]);
  const client = ai.createAi({ keys: { gemini: "bad", openrouter: "or" }, state: {}, fetchImpl });
  const result = await client.test();

  assert.equal(result.provider, "openrouter");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].headers.Authorization, "Bearer or");
});

test("no keys, and all limits used up: clear messages", async () => {
  await assert.rejects(ai.createAi({ keys: {} }).test(), /Add a Gemini or OpenRouter key/);

  const { fetchImpl } = fakeFetch([{ status: 429, body: { error: { message: "RESOURCE_EXHAUSTED" } } }]);

  await assert.rejects(ai.createAi({ keys: { gemini: "k" }, state: {}, fetchImpl }).test(), /limit used up/);
});

test("reading a PDF needs Gemini and sends the file inline", async () => {
  const { calls, fetchImpl } = fakeFetch([geminiOk({ text: "Alex Doe resume", profile: { first_name: "Alex" } })]);
  const result = await ai.createAi({ keys: { gemini: "k" }, state: {}, fetchImpl }).readResume({ base64: "UERG" });

  assert.equal(result.text, "Alex Doe resume");
  assert.equal(calls[0].body.contents[0].parts[0].inline_data.mime_type, "application/pdf");
  await assert.rejects(ai.createAi({ keys: { openrouter: "or" } }).readResume({ base64: "UERG" }), /needs Gemini/);
});

test("dates from AI must be YYYY-MM-DD; the prompt says what day it is", () => {
  const fields = [{ id: "d1", kind: "date", label: "Earliest start date" }, { id: "d2", kind: "date", label: "Start" }];

  assert.deepEqual(ai.checkAnswers(fields, { answers: [{ id: "d1", value: "2026-12-01" }, { id: "d2", value: "1 month after offer" }] }), { d1: "2026-12-01" });
  assert.match(ai.buildPrompt({ fields, today: "2026-10-30" }).prompt, /"today": "2026-10-30"/);
});
