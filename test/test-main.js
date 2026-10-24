const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture, dom, main, detect, memoryStorage, PROFILE } = require("./helpers.js");

const WAITS = { quietMs: 20, maxMs: 200 };

function runner(doc, { data = {}, reply } = {}) {
  const storage = memoryStorage({ profile: PROFILE, settings: { gemini_key: "k" }, answers: {}, ...data });
  const messages = [];
  const ask = async (message) => {
    messages.push(message);

    return reply ? reply(message) : { ok: true, answers: {} };
  };

  return { run: main.createRunner({ doc, storage, ask, waits: WAITS }), storage, messages };
}

test("Greenhouse: profile facts filled, consents untouched, one AI request without contact details", async () => {
  const { doc } = fixture("greenhouse-form.html", "https://job-boards.greenhouse.io/acme/jobs/1");
  const { run, messages } = runner(doc, {
    reply: (message) => ({ ok: true, answers: Object.fromEntries(message.fields.map((one) => [one.id, "Yes"])) }),
  });
  const rows = await run.fill();
  const by = (label) => rows.find((row) => row.field.label === label);

  assert.equal(doc.getElementById("first_name").value, "Alex");
  assert.equal(doc.getElementById("email").value, "alex@example.com");
  assert.equal(by("First Name").source, "rule");
  assert.equal(by("GDPR notice acknowledgement").source, "consent");
  assert.equal(by("Cover Letter").source, "manual");
  // No resume stored: you are told to add one.
  assert.equal(by("Resume/CV").note, "Add your resume PDF in settings");

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "ai-answer");
  assert.deepEqual(
    messages[0].fields.map((one) => one.label),
    ["Our New Ways of Working require weekly office attendance. Are you open to coming to the office up 3 times a week?"],
  );
  assert.doesNotMatch(JSON.stringify(messages), /alex@example\.com|555 010/);
});

test("no AI key: AI questions are marked for you, nothing is sent", async () => {
  const { doc } = fixture("greenhouse-form.html");
  const { run, messages } = runner(doc, { data: { settings: {} } });
  const rows = await run.fill();

  assert.equal(messages.length, 0);
  assert.ok(rows.some((row) => row.note === "No AI key: add one in settings"));
});

test("fields you already filled are kept", async () => {
  const { doc } = fixture("greenhouse-form.html");

  doc.getElementById("first_name").value = "Kal";

  const { run } = runner(doc);
  const rows = await run.fill();

  assert.equal(doc.getElementById("first_name").value, "Kal");
  assert.equal(rows.find((row) => row.field.label === "First Name").source, "filled");
});

test("save: your answers are stored, profile facts and consents are not; next fill uses them without AI", async () => {
  const html = `<form>
    <label>Email <input type="email" id="e"></label>
    <label>Why do you want to work here? <textarea id="w"></textarea></label>
    <label><input type="checkbox" id="c"> I agree to the privacy policy</label>
  </form>`;
  const first = dom(html);
  const { run, storage } = runner(first.doc);

  await run.fill();
  first.doc.getElementById("w").value = "I use your product every day.";
  first.doc.getElementById("c").checked = true;

  assert.equal(await run.save(), 1);
  // "here", "you", "do" are filler words in the key.
  assert.deepEqual(Object.keys(storage.data.answers), ["why want to work"]);

  const second = dom(html);
  const again = main.createRunner({ doc: second.doc, storage, ask: async () => assert.fail("no AI needed"), waits: WAITS });
  const rows = await again.fill();

  assert.equal(second.doc.getElementById("w").value, "I use your product every day.");
  assert.equal(rows.find((row) => row.field.label.startsWith("Why")).source, "memory");
  assert.equal(second.doc.getElementById("c").checked, false);
});

test("AI failure: questions are marked for you with the reason", async () => {
  const { doc } = fixture("greenhouse-form.html");
  const { run } = runner(doc, { reply: () => ({ ok: false, error: "Free AI limit used up for today." }) });
  const rows = await run.fill();

  assert.ok(rows.some((row) => row.source === "manual" && row.note === "Free AI limit used up for today."));
});

test("never submits", async () => {
  const { doc } = fixture("greenhouse-form.html");
  let submitted = false;

  doc.addEventListener("submit", () => (submitted = true), true);

  for (const button of doc.querySelectorAll("button[type='submit'], input[type='submit']")) button.addEventListener("click", () => (submitted = true));

  await runner(doc).run.fill();
  assert.equal(submitted, false);
});

test("detect: job forms yes; login forms, small forms and LinkedIn no", () => {
  assert.equal(detect.looksLikeJobForm(fixture("greenhouse-form.html", "https://job-boards.greenhouse.io/x/jobs/1").doc), true);
  assert.equal(detect.looksLikeJobForm(fixture("lever-form.html", "https://jobs.lever.co/x/1/apply").doc), true);
  assert.equal(detect.looksLikeJobForm(dom(`<form><input name="user"><input type="password"><input name="a"><input name="b"></form>`).doc), false);
  assert.equal(detect.looksLikeJobForm(dom(`<form><input name="q"><input type="email"></form>`).doc), false);
  assert.equal(detect.looksLikeJobForm(fixture("lever-form.html", "https://www.linkedin.com/jobs/apply").doc), false);
});
