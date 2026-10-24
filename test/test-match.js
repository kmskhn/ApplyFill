const test = require("node:test");
const assert = require("node:assert/strict");
const { match, field, PROFILE } = require("./helpers.js");

const plan = (kind, label, options, profile = PROFILE, saved = null) => match.classify(field(kind, label, options), profile, () => saved);

test("contact facts come from the profile", () => {
  assert.deepEqual([plan("text", "First Name").value, plan("text", "Last Name").value, plan("text", "Full name").value], ["Alex", "Doe", "Alex Doe"]);
  assert.equal(plan("email", "Email").value, "alex@example.com");
  assert.equal(plan("tel", "Phone").value, "+1 555 010 0199");
  assert.equal(plan("text", "Please provide your LinkedIn profile").value, PROFILE.linkedin);
  assert.equal(plan("textarea", "If you have a GitHub profile or any code repositories, please share the link here:").value, PROFILE.github);
  assert.equal(plan("text", "Current location").value, "Toronto, Canada");
  assert.equal(plan("text", "Current company").source, "rule");
});

test("a missing contact fact asks you, never the AI", () => {
  const result = plan("tel", "Phone", [], { ...PROFILE, phone: "" });

  assert.equal(result.source, "manual");
  assert.match(result.note, /settings/);
});

test("consent boxes and GDPR selects are never filled", () => {
  for (const [kind, label] of [
    ["checkbox", "Yes, ANYbotics can contact me about future job opportunities for up to 2 years"],
    ["combobox", "GDPR notice acknowledgement"],
    ["checkbox", "I agree to the Privacy Policy"],
    ["select", "I certify that the information above is accurate"],
  ]) {
    assert.equal(plan(kind, label, ["Yes", "No"], PROFILE, "Yes").source, "consent", label);
  }
});

test("sensitive questions: profile or saved answer only, else red", () => {
  const options = ["Male", "Female", "Non-binary", "I don't wish to answer"];

  assert.deepEqual(plan("select", "Gender", options), { source: "profile", value: "I don't wish to answer" });
  assert.equal(plan("select", "Veteran status", ["I am a veteran", "I am not a veteran"]).source, "sensitive");
  assert.equal(plan("select", "Veteran status", ["I am a veteran", "I am not a veteran"], PROFILE, "I am not a veteran").source, "memory");
  // Never "ai", even with no profile at all.
  assert.equal(plan("text", "What is your ethnicity?", [], {}).source, "sensitive");
});

test("sponsorship and work rights use the profile, marked to check", () => {
  assert.deepEqual(plan("select", "Will you now or in the future require visa sponsorship?", ["Yes", "No"]).value, "Yes");
  assert.equal(plan("select", "Will you now or in the future require visa sponsorship?", ["Yes", "No"]).source, "check");
  assert.equal(plan("radio", "Are you able to work without sponsorship?", ["Yes", "No"]).value, "No");
  assert.equal(plan("select", "Work Permit", ["No Permit", "B", "C", "L", "Swiss Citizen"]).value, "No Permit");
  assert.equal(plan("radio", "Are you legally authorized to work in Canada?", ["Yes", "No"]).value, "Yes");
  assert.equal(plan("radio", "Are you legally authorized to work in the UK?", ["Yes", "No"]).value, "No");
  // "work for us" names no country: the job's country, and needing a sponsor means "No".
  assert.equal(plan("radio", "Are you legally authorized to work for us?", ["Yes", "No"]).value, "No");
  // A country that is only in the profile (not in the built-in list) is still found.
  assert.equal(plan("radio", "Are you authorized to work in Kenya?", ["Yes", "No"], { ...PROFILE, work_countries: ["Kenya"] }).value, "Yes");
});

test("years of experience: number, range option, or AI when it names a skill", () => {
  assert.equal(plan("number", "Years of experience").value, "7");
  assert.equal(plan("select", "How many years of experience do you have?", ["0-2 years", "3-5 years", "6-8 years", "9+ years"]).value, "6-8 years");
  assert.equal(plan("select", "Years of experience", ["Less than 3", "3 to 6", "More than 6"]).value, "More than 6");
  assert.equal(plan("text", "How many years of experience do you have with React?").source, "ai");
});

test("open questions go to AI; saved answers win over AI", () => {
  assert.equal(plan("textarea", "Why do you want to work at Acme?").source, "ai");
  assert.equal(plan("combobox", "Are you open to coming to the office up to 3 times a week?").source, "ai");
  assert.deepEqual(plan("textarea", "Why do you want to work at Acme?", [], PROFILE, "Because…"), { source: "memory", value: "Because…" });
});

test("rules that know the question but have no value fall through to saved answers / AI", () => {
  assert.equal(plan("text", "When are you able to start?").source, "ai");
  assert.equal(plan("text", "When are you able to start?", [], { ...PROFILE, start_date: "January 2027" }).value, "January 2027");
  assert.equal(plan("select", "How did you hear about us?", ["LinkedIn", "Indeed", "Other"]).source, "ai");
  assert.equal(plan("select", "How did you hear about us?", ["LinkedIn", "Company Website", "Other"]).value, "Company Website");
});

test("files: resume is a rule, other files are yours", () => {
  assert.equal(plan("file", "Resume/CV").value, "resume");
  assert.equal(plan("file", "Cover Letter").source, "manual");
  assert.equal(plan("file", "Upload Letter of Motivation").source, "manual");
});

test("pickOption", () => {
  const opts = (...labels) => labels.map((label) => ({ label, value: label }));

  assert.equal(match.pickOption(opts("Yes, I will", "No, I will not"), true).label, "Yes, I will");
  assert.equal(match.pickOption(opts("Yes", "No"), "no").label, "No");
  assert.equal(match.pickOption(opts("Germany", "India", "Indonesia"), "india").label, "India");
  assert.equal(match.pickOption(opts("Decline to self-identify", "Male"), "Prefer not to say").label, "Decline to self-identify");
  assert.equal(match.pickOption(opts("Male", "Female"), "Prefer not to say"), null);
  assert.equal(match.pickOption(opts("Berlin, Germany", "Bern, Switzerland"), "Berlin").label, "Berlin, Germany");
  assert.equal(match.pickOption(opts("Red", "Blue"), "Green"), null);
});
