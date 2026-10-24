const test = require("node:test");
const assert = require("node:assert/strict");
const { dom, fixture, scan } = require("./helpers.js");

const summary = (fields) => fields.map((one) => [one.kind, one.label]);

test("Greenhouse: labels, kinds, and the hidden helper inputs are skipped", () => {
  const { doc } = fixture("greenhouse-form.html");
  const fields = scan.scan(doc);

  assert.deepEqual(summary(fields).slice(0, 8), [
    ["text", "First Name"],
    ["text", "Last Name"],
    ["text", "Email"],
    ["combobox", "Country"],
    ["tel", "Phone"],
    ["file", "Resume/CV"],
    ["file", "Cover Letter"],
    ["combobox", "GDPR notice acknowledgement"],
  ]);
  assert.equal(fields.length, 13);
  assert.ok(fields.every((one) => one.label), "every field has a label");
  assert.equal(fields[0].autocomplete, "given-name");
  assert.equal(fields[0].required, true);
  assert.equal(fields[3].listbox !== undefined, true);
});

test("Lever: wrapping labels lose their hidden helper texts", () => {
  const { doc } = fixture("lever-form.html");
  const fields = scan.scan(doc);
  const labels = fields.map((one) => one.label);

  assert.ok(labels.includes("Current location"), labels.join(" | "));
  assert.ok(labels.includes("Full name"));
  assert.ok(!labels.some((label) => /No location found|Analyzing resume/.test(label)));

  const permit = fields.find((one) => one.label === "Work Permit");

  assert.equal(permit.kind, "select");
  assert.deepEqual(
    permit.options.map((option) => option.label),
    ["No Permit", "B", "C", "L", "Swiss Citizen"],
  );
});

test("radio groups, checkbox groups, single checkbox, yes/no buttons", () => {
  const { doc } = dom(`<form>
    <fieldset><legend>Do you need sponsorship?</legend>
      <label><input type="radio" name="sp" value="y"> Yes</label>
      <label><input type="radio" name="sp" value="n"> No</label>
    </fieldset>
    <div><p>Which stacks have you used?</p>
      <div><input type="checkbox" name="st[]" id="a" value="react"><label for="a">React</label></div>
      <div><input type="checkbox" name="st[]" id="b" value="vue"><label for="b">Vue</label></div>
    </div>
    <label><input type="checkbox" name="ok"> I agree to the privacy policy</label>
    <div><div class="q">Are you open to relocation?</div><div><button type="button">Yes</button><button type="button">No</button></div></div>
  </form>`);
  const fields = scan.scan(doc);

  assert.deepEqual(summary(fields), [
    ["radio", "Do you need sponsorship?"],
    ["checkboxes", "Which stacks have you used?"],
    ["checkbox", "I agree to the privacy policy"],
    ["buttons", "Are you open to relocation?"],
  ]);
  assert.deepEqual(
    fields[0].options.map((option) => option.label),
    ["Yes", "No"],
  );
  assert.deepEqual(
    fields[1].options.map((option) => option.label),
    ["React", "Vue"],
  );
});

test("labels from aria-labelledby, nearby text, placeholder; hidden and password fields skipped", () => {
  const { doc } = dom(`<form>
    <span id="l1">Notice period</span><input aria-labelledby="l1">
    <div><div>Tell us about a project you are proud of</div><div><textarea name="q2"></textarea></div></div>
    <input placeholder="Your website">
    <input type="hidden" name="token"><input type="password" name="pw"><div style="display:none"><input name="hidden1"></div>
  </form>`);

  assert.deepEqual(summary(scan.scan(doc)), [
    ["text", "Notice period"],
    ["textarea", "Tell us about a project you are proud of"],
    ["text", "Your website"],
  ]);
});

test("currentValue / isEmpty per kind", () => {
  const { doc } = dom(`<form>
    <label>Name <input id="t" value="Alex"></label>
    <label>City <select id="s"><option value="">Select...</option><option value="1">Toronto</option></select></label>
    <fieldset><legend>Q</legend><label><input type="radio" name="r" value="a" checked> A</label><label><input type="radio" name="r" value="b"> B</label></fieldset>
  </form>`);
  const [text, select, radio] = scan.scan(doc);

  assert.equal(scan.currentValue(text), "Alex");
  assert.equal(scan.isEmpty(select), true);
  assert.equal(scan.currentValue(radio), "A");
});

test("toPublic sends no elements and no current values", () => {
  const { doc } = fixture("greenhouse-form.html");
  const [first] = scan.scan(doc);

  assert.deepEqual(scan.toPublic(first), { id: first.id, kind: "text", label: "First Name", required: true, max_length: 255 });
});
