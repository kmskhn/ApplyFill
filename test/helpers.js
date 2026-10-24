const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

// Load order = manifest order. Each file also puts itself on globalThis.AF.
const util = require("../content/util.js");
const match = require("../content/match.js");
const memory = require("../content/memory.js");
const scan = require("../content/scan.js");
const fill = require("../content/fill.js");
const panel = require("../content/panel.js");
const main = require("../content/main.js");
const detect = require("../content/detect.js");
const ai = require("../ai.js");

function dom(html, url = "https://jobs.example.com/apply") {
  const jsdom = new JSDOM(html, { url, pretendToBeVisual: true });

  return { jsdom, doc: jsdom.window.document, win: jsdom.window };
}

function fixture(name, url) {
  return dom(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"), url);
}

const PROFILE = {
  first_name: "Alex",
  last_name: "Doe",
  email: "alex@example.com",
  phone: "+1 555 010 0199",
  city: "Toronto",
  country: "Canada",
  address: "12 Example Road",
  linkedin: "https://www.linkedin.com/in/example/",
  github: "https://github.com/example",
  current_title: "Senior Software Engineer",
  current_company: "Example Corp",
  years_experience: 7,
  salary_expectation: "EUR 75,000",
  notice_period: "30 days",
  how_heard: "Company website",
  needs_sponsorship: true,
  work_countries: ["Canada"],
  willing_to_relocate: true,
  technologies: ["React", "TypeScript"],
  eeo: { gender: "Prefer not to say", race: "Prefer not to say", veteran: "", disability: "Prefer not to say" },
};

/** A field object like scan() returns, for tests that need no DOM. */
function field(kind, label, options = [], extra = {}) {
  return { id: "f1", kind, label, name: "", idAttr: "", autocomplete: "", placeholder: "", required: false, options: options.map((one) => (typeof one === "string" ? { label: one, value: one } : one)), ...extra };
}

/** chrome.storage.local stand-in. */
function memoryStorage(initial = {}) {
  const data = structuredClone(initial);

  return {
    data,
    get: async (keys) => Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, structuredClone(data[key])])),
    set: async (items) => Object.assign(data, structuredClone(items)),
  };
}

module.exports = { dom, fixture, field, memoryStorage, PROFILE, util, match, memory, scan, fill, panel, main, detect, ai };
