const test = require("node:test");
const assert = require("node:assert/strict");
const { dom, scan, fill } = require("./helpers.js");

/**
 * React keeps a copy of the last value it set. An "input" event whose value equals that copy is
 * ignored. Setting el.value directly updates the copy (React would miss the change); our
 * prototype setter does not. This fake does the same.
 */
function reactLike(el) {
  const proto = Object.getPrototypeOf(el);
  const native = Object.getOwnPropertyDescriptor(proto, "value");
  let tracked = native.get.call(el);
  const seen = [];

  Object.defineProperty(el, "value", {
    configurable: true,
    get: () => native.get.call(el),
    set: (value) => {
      tracked = String(value);
      native.set.call(el, value);
    },
  });
  el.addEventListener("input", () => {
    if (native.get.call(el) !== tracked) {
      tracked = native.get.call(el);
      seen.push(tracked);
    }
  });

  return seen;
}

test("text: React-style inputs see the new value", async () => {
  const { doc } = dom(`<label>Email <input id="e" type="email"></label>`);
  const seen = reactLike(doc.getElementById("e"));
  const [field] = scan.scan(doc);

  assert.equal(await fill.fillField(field, "alex@example.com"), true);
  assert.deepEqual(seen, ["alex@example.com"]);
});

test("text is cut to maxlength", async () => {
  const { doc } = dom(`<label>Short <input maxlength="5"></label>`);
  const [field] = scan.scan(doc);

  await fill.fillField(field, "1234567890");
  assert.equal(field.el.value, "12345");
});

test("select, radio, checkbox group and yes/no buttons", async () => {
  const { doc } = dom(`<form>
    <label>Country <select><option value="">Select</option><option value="de">Germany</option><option value="in">India</option></select></label>
    <fieldset><legend>Relocate?</legend><label><input type="radio" name="r" value="1"> Yes</label><label><input type="radio" name="r" value="0"> No</label></fieldset>
    <fieldset><legend>Stack</legend><label><input type="checkbox" name="s" value="r"> React</label><label><input type="checkbox" name="s" value="v"> Vue</label><label><input type="checkbox" name="s" value="a"> Angular</label></fieldset>
    <div><p>Hybrid ok?</p><div><button type="button" aria-pressed="false">Yes</button><button type="button" aria-pressed="false">No</button></div></div>
  </form>`);
  const [select, radio, boxes, buttons] = scan.scan(doc);
  let changes = 0;

  select.el.addEventListener("change", () => (changes += 1));
  buttons.els[0].addEventListener("click", (event) => event.target.setAttribute("aria-pressed", "true"));

  assert.equal(await fill.fillField(select, "India"), true);
  assert.equal(select.el.value, "in");
  assert.equal(changes, 1);
  assert.equal(await fill.fillField(radio, "No"), true);
  assert.equal(radio.els[1].checked, true);
  assert.equal(await fill.fillField(boxes, ["React", "Angular"]), true);
  assert.deepEqual(
    boxes.els.map((el) => el.checked),
    [true, false, true],
  );
  assert.equal(await fill.fillField(buttons, "Yes"), true);
});

test("file: the resume is attached and a change event fires", async () => {
  const { doc, win } = dom(`<div class="label">Resume/CV</div><div><input id="resume" type="file"></div>`);

  // jsdom has no DataTransfer and its input.files can't be set: small stand-ins.
  win.DataTransfer = class {
    constructor() {
      this.list = [];
      this.items = { add: (file) => this.list.push(file) };
    }

    get files() {
      return this.list;
    }
  };

  const input = doc.getElementById("resume");

  Object.defineProperty(input, "files", { writable: true, value: [] });

  let changed = false;

  input.addEventListener("change", () => (changed = true));

  const [field] = scan.scan(doc);
  const ok = await fill.fillField(field, "resume", { resume: { name: "cv.pdf", type: "application/pdf", base64: Buffer.from("%PDF-1.4 test").toString("base64") } });

  assert.equal(ok, true);
  assert.equal(changed, true);
  assert.equal(input.files[0].name, "cv.pdf");
  assert.equal(await input.files[0].text(), "%PDF-1.4 test");
});

test("combobox: types, waits for the options, clicks the best one", async () => {
  const { doc } = dom(`<label id="c-label" for="country">Country</label>
    <div class="select__control"><div class="select__value-container"><div class="select__placeholder">Select...</div>
    <input id="country" role="combobox" aria-labelledby="c-label" aria-autocomplete="list"></div></div><div id="menu"></div>`);
  const input = doc.getElementById("country");
  const menu = doc.getElementById("menu");

  // A tiny react-select: options show after typing; a click shows the chosen value.
  input.addEventListener("input", () => {
    setTimeout(() => {
      menu.innerHTML = ["Indonesia", "India", "Iceland"].filter((name) => name.toLowerCase().startsWith(input.value.toLowerCase().slice(0, 2))).map((name, index) => `<div role="option" id="react-select-country-option-${index}">${name}</div>`).join("");

      for (const option of menu.children) {
        option.addEventListener("click", () => {
          doc.querySelector(".select__placeholder").outerHTML = `<div class="select__single-value">${option.textContent}</div>`;
          menu.innerHTML = "";
          input.value = "";
        });
      }
    }, 50);
  });

  const [field] = scan.scan(doc);

  assert.equal(field.kind, "combobox");
  assert.equal(await fill.fillField(field, "India"), true);
  assert.equal(scan.currentValue(field), "India");
});

test("outline and clear restore the page's own outline", () => {
  const { doc } = dom(`<label>A <input style="outline: 1px dotted red"></label>`);
  const [field] = scan.scan(doc);

  fill.outline(field, "green");
  assert.match(field.el.style.outline, /2px solid/);
  fill.clearOutlines(doc);
  assert.equal(field.el.style.outline, "1px dotted red");
});

test("live bug: react-select input has class select__input; the shown value is found above it", () => {
  const { doc } = dom(`<label id="l" for="c">Country</label><div class="select__control"><div class="select__value-container">
    <div class="select__single-value"><span>+91</span></div><input id="c" class="select__input" role="combobox" aria-labelledby="l"></div></div>`);
  const [field] = scan.scan(doc);

  assert.equal(scan.currentValue(field), "+91");
  assert.equal(field.box.className, "select__control");
});

test("live bug: yes/no buttons that change state after a re-render count as filled", async () => {
  const { doc } = dom(`<div><label>Office every weekday ok?</label><div class="yesno">
    <button type="button" aria-pressed="false">Yes</button><button type="button" aria-pressed="false">No</button>
    <input type="checkbox" tabindex="-1" name="x"></div></div>`);
  const fields = scan.scan(doc);

  // The hidden checkbox next to the buttons is not a second question.
  assert.deepEqual(
    fields.map((one) => one.kind),
    ["buttons"],
  );

  fields[0].els[0].addEventListener("click", (event) => setTimeout(() => event.target.setAttribute("aria-pressed", "true"), 30));
  assert.equal(await fill.fillField(fields[0], "Yes"), true);
});

test("place boxes: type the city, click the suggestion that names the country", async () => {
  const { doc } = dom(`<div class="application-field"><input class="location-input" id="loc" name="location" type="text">
    <div class="dropdown-container"><div class="dropdown-results"></div></div></div>`);
  const input = doc.getElementById("loc");
  const results = doc.querySelector(".dropdown-results");

  input.addEventListener("keyup", () => {
    results.innerHTML = input.value.length >= 3 ? `<div class="dropdown-location">Portogruaro, Venice, ITA</div><div class="dropdown-location">Porto, Porto District, PRT</div>` : "";

    for (const option of results.children) option.addEventListener("click", () => (input.value = option.textContent));
  });

  const [field] = scan.scan(doc, { scope: doc.body });

  assert.equal(field.suggest, true);
  assert.equal(await fill.fillField(field, "Porto, Portugal"), true);
  assert.equal(input.value, "Porto, Porto District, PRT");
  assert.equal(fill.pickPlace([{ label: "Berlin, Germany" }, { label: "Berlingen, Switzerland" }], "Berlin, Germany").label, "Berlin, Germany");
});

test("Ashby-style 'Autofill from resume' uploader is skipped; the real resume field stays", () => {
  const { doc } = dom(`<div class="ashby-application-form-autofill-uploader"><p>Autofill from resume</p><input type="file"></div>
    <label for="r">Resume</label><input type="file" id="r" name="_systemfield_resume">`);

  assert.deepEqual(
    scan.scan(doc).map((one) => one.label),
    ["Resume"],
  );
});
