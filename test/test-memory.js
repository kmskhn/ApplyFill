const test = require("node:test");
const assert = require("node:assert/strict");
const { memory, field } = require("./helpers.js");

const NOW = new Date("2026-10-24T10:00:00Z");

test("questionKey drops numbering, punctuation and filler words", () => {
  assert.equal(memory.questionKey("1. Are you willing to relocate? *"), "willing to relocate");
  assert.equal(memory.questionKey("Are YOU willing to relocate"), "willing to relocate");
});

test("remember then lookup: same question, close wording, and option fitting", () => {
  let answers = {};

  answers = memory.remember(answers, field("textarea", "Why do you want to join us?"), "I like your product.", { host: "a.com", now: NOW });
  answers = memory.remember(answers, field("radio", "Are you open to hybrid work (3 days in the office)?", ["Yes", "No"]), "Yes", { now: NOW });

  assert.equal(memory.lookup(answers, field("textarea", "Why do you want to join us?")), "I like your product.");
  assert.equal(memory.lookup(answers, field("textarea", "Why do you want to join us")), "I like your product.");
  // Different options today: the saved "Yes" is fitted to them.
  assert.equal(memory.lookup(answers, field("select", "Are you open to hybrid work (3 days in the office)?", ["Yes, happy to", "No"])), "Yes, happy to");
  // An unrelated question gets nothing.
  assert.equal(memory.lookup(answers, field("textarea", "Describe a hard bug you fixed")), null);
});

test("a saved answer that fits none of today's options is not used", () => {
  const answers = memory.remember({}, field("select", "Preferred office", ["Berlin", "Munich"]), "Berlin", { now: NOW });

  assert.equal(memory.lookup(answers, field("select", "Preferred office", ["London", "Paris"])), null);
});

test("remember counts uses and ignores empty answers", () => {
  const f = field("text", "Notice period details");
  let answers = memory.remember({}, f, "30 days", { now: NOW });

  answers = memory.remember(answers, f, "30 days", { now: NOW });

  assert.equal(answers["notice period details"].count, 2);
  assert.equal(memory.remember(answers, f, "", { now: NOW }), answers);
});
