/*
 * Which answer does a field get, and from where?
 *
 *   classify(field, profile, lookupMemory, job) -> { source, value, note }
 *
 * Order (first hit wins):
 *   1. consent / "I agree" / marketing boxes  -> never filled ("consent", red)
 *   2. sensitive (gender, race, disability ...) -> only profile or saved answers, never AI
 *   3. rules from the profile (name, email, sponsorship ...)   ("rule", green; "check" = yellow)
 *   4. saved answers                                            ("memory", green)
 *   5. files that are not the resume                            ("manual", red)
 *   6. everything else                                          ("ai")
 */
(function (root) {
  const AF = (root.AF = root.AF || {});
  const { normalize } = AF.util || require("./util.js");

  const TEXT_KINDS = new Set(["text", "email", "tel", "url", "number", "textarea", "date"]);

  // Choice fields have a fixed list of options. A combobox without known options is typed into.
  const isChoice = (field) => ["select", "radio", "checkboxes", "buttons"].includes(field.kind) || (field.kind === "combobox" && field.options?.length > 0);
  const isTyped = (field) => TEXT_KINDS.has(field.kind) || (field.kind === "combobox" && !field.options?.length);

  const words = (text) => (text ? text.split(" ").length : 0);

  // ---------- consent and sensitive ----------

  const CONSENT =
    /\b(i (agree|accept|consent|acknowledge|confirm|certify|understand|have read)|agree to|consent|acknowledg\w*|certif(y|ication that)|attest|terms (and|&) conditions|terms of (use|service)|privacy (policy|notice|statement)|data (protection|processing|privacy)|gdpr|datenschutz\w*|retain my (data|information|details)|marketing|newsletter|subscribe|talent (community|pool|network)|future (job )?(opportunities|openings|roles|vacancies)|keep (my|me) (data|details|information|application|informed|updated))\b/;

  /** Never filled by the extension, not even from saved answers: you tick these yourself. */
  function isConsent(field) {
    if (TEXT_KINDS.has(field.kind) || field.kind === "file") return false;

    return CONSENT.test(normalize(field.label));
  }

  // key = where the answer lives in the profile.
  const SENSITIVE = [
    { cat: "gender", re: /\b(gender|sex)\b/, key: "eeo.gender" },
    { cat: "transgender", re: /\b(transgender|trans)\b/, key: "eeo.transgender" },
    { cat: "orientation", re: /\b(sexual orientation|orientation|lgbt\w*)\b/, key: "eeo.sexual_orientation" },
    { cat: "hispanic", re: /\b(hispanic|latin[oax]|latine)\b/, key: "eeo.hispanic" },
    { cat: "race", re: /\b(race|racial|ethnic|ethnicity)\b/, key: "eeo.race" },
    { cat: "veteran", re: /\b(veteran|military|armed forces)\b/, key: "eeo.veteran" },
    { cat: "disability", re: /\b(disabilit\w*|disabled|handicap\w*)\b/, key: "eeo.disability" },
    { cat: "pronouns", re: /\bpronouns?\b/, key: "pronouns" },
    { cat: "religion", re: /\b(religio\w*|caste)\b/, key: null },
    { cat: "marital", re: /\bmarital\b/, key: null },
    { cat: "birth", re: /\b(date of birth|birth ?date|birthday|dob)\b/, key: "date_of_birth" },
    { cat: "nationality", re: /\b(nationality|citizenship|citizen of)\b/, key: "nationality" },
    { cat: "criminal", re: /\b(criminal|convict\w*|felony)\b/, key: null },
  ];

  // "I identify as": Man / Woman / Non-binary. The options say it is about gender.
  const GENDER_OPTION = /^(man|woman|male|female|non binary|nonbinary)$/;

  function sensitiveCategory(field) {
    const label = normalize(field.label);
    const byLabel = SENSITIVE.find((item) => item.re.test(label));

    if (byLabel) return byLabel;

    const genders = (field.options || []).filter((option) => GENDER_OPTION.test(normalize(option.label))).length;

    return genders >= 2 ? SENSITIVE[0] : null;
  }

  // ---------- options ----------

  const YES = /^(yes|true|ja|oui|si|y)\b/;
  const NO = /^(no|false|nein|non|n)\b/;
  // "Prefer not to say", "I don't wish to answer", "Decline to self-identify" ... all mean the same.
  const DECLINE = /\b(prefer not|rather not|decline|do not wish|don t wish|dont wish|not to (say|answer|disclose)|choose not|wish not|not disclose|no answer)\b/;

  /** "3-5 years" -> {min 3, max 5}; "10+" -> {min 10}; "less than 2" -> {max 2, open}. */
  function range(label) {
    const text = normalize(label);
    const nums = (text.match(/\d+(\.\d+)?/g) || []).map(Number);

    if (nums.length === 0) return null;

    if (/\b(less than|under|below|fewer than|up to)\b/.test(text)) return { max: nums[0], open: !/\bup to\b/.test(text) };

    if (/\+|\b(more than|over|above|at least|or more|plus)\b/.test(String(label).toLowerCase())) return { min: nums[0] };

    if (nums.length >= 2) return { min: nums[0], max: nums[1] };

    return { min: nums[0], max: nums[0] };
  }

  function inRange(r, n) {
    if (!r) return false;

    if (r.min !== undefined && n < r.min) return false;
    if (r.max !== undefined && (r.open ? n >= r.max : n > r.max)) return false;

    return true;
  }

  /**
   * The option that means `value`, or null.
   * value: true/false (yes/no), a number (ranges like "3-5 years"), or text.
   */
  function pickOption(options, value) {
    const list = (options || []).filter((option) => normalize(option.label));

    if (list.length === 0 || value === null || value === undefined || value === "") return null;

    if (typeof value === "boolean") return list.find((option) => (value ? YES : NO).test(normalize(option.label))) || null;

    if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value).trim())) {
      const n = Number(value);
      const exact = list.find((option) => normalize(option.label) === String(n));

      if (exact) return exact;

      const hit = list.find((option) => inRange(range(option.label), n));

      if (hit) return hit;
    }

    const want = normalize(value);

    if (!want) return null;

    if (want === "yes" || want === "no") return pickOption(list, want === "yes");

    if (DECLINE.test(want)) return list.find((option) => DECLINE.test(normalize(option.label))) || null;

    const label = (option) => normalize(option.label);

    return (
      list.find((option) => label(option) === want) ||
      list.find((option) => normalize(option.value) === want) ||
      list.find((option) => label(option).startsWith(want) || want.startsWith(label(option))) ||
      list.find((option) => want.length >= 3 && label(option).length >= 3 && (label(option).includes(want) || want.includes(label(option)))) ||
      bestOverlap(list, want)
    );
  }

  function bestOverlap(list, want) {
    const wanted = new Set(want.split(" ").filter((word) => word.length > 2));

    if (wanted.size === 0) return null;

    let best = null;
    let bestScore = 0;

    for (const option of list) {
      const have = normalize(option.label).split(" ").filter((word) => word.length > 2);
      const shared = have.filter((word) => wanted.has(word)).length;
      const score = shared / Math.max(wanted.size, have.length);

      if (score > bestScore) {
        best = option;
        bestScore = score;
      }
    }

    return bestScore >= 0.5 ? best : null;
  }

  // ---------- rules ----------

  const get = (profile, key) => key.split(".").reduce((obj, part) => (obj == null ? undefined : obj[part]), profile);

  const present = (value) => value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0);

  /** Common countries and the other names they go by in forms. Countries in the profile are matched too. */
  const COUNTRY_WORDS = {
    "united kingdom": ["uk", "u k", "united kingdom", "great britain", "britain", "england", "scotland", "wales"],
    // Not "us": "work for us" is not the United States.
    "united states": ["u s", "usa", "united states", "united states of america", "america"],
    canada: ["canada"],
    mexico: ["mexico"],
    brazil: ["brazil", "brasil"],
    germany: ["germany", "deutschland"],
    netherlands: ["netherlands", "holland", "the netherlands"],
    switzerland: ["switzerland", "schweiz", "suisse"],
    austria: ["austria", "osterreich"],
    belgium: ["belgium"],
    france: ["france"],
    spain: ["spain", "espana"],
    portugal: ["portugal"],
    italy: ["italy", "italia"],
    ireland: ["ireland"],
    denmark: ["denmark", "danmark"],
    sweden: ["sweden", "sverige"],
    norway: ["norway", "norge"],
    finland: ["finland", "suomi"],
    poland: ["poland", "polska"],
    "czech republic": ["czech republic", "czechia"],
    "european union": ["eu", "european union", "eea", "europe", "schengen"],
    "united arab emirates": ["uae", "united arab emirates", "emirates", "dubai"],
    "saudi arabia": ["saudi arabia", "ksa", "saudi"],
    israel: ["israel"],
    india: ["india"],
    pakistan: ["pakistan"],
    singapore: ["singapore"],
    japan: ["japan"],
    "south korea": ["south korea", "korea"],
    china: ["china"],
    australia: ["australia"],
    "new zealand": ["new zealand"],
    "south africa": ["south africa"],
  };

  function canonicalCountry(name) {
    const n = normalize(name);
    const hit = Object.entries(COUNTRY_WORDS).find(([country, names]) => country === n || names.includes(n));

    return hit ? hit[0] : n;
  }

  /** Countries named in a label: the list above plus the profile's own countries (any name). */
  function countriesIn(text, extra = []) {
    const padded = ` ${text} `;
    const known = Object.entries(COUNTRY_WORDS)
      .filter(([, names]) => names.some((name) => padded.includes(` ${name} `)))
      .map(([country]) => country);
    const own = extra.map(normalize).filter((name) => name && padded.includes(` ${name} `)).map(canonicalCountry);

    return [...new Set([...known, ...own])];
  }

  function authorizedToWork(profile, label) {
    const mine = (profile.work_countries || []).map(canonicalCountry);
    const named = countriesIn(label, profile.work_countries || []);

    if (named.length > 0) return named.some((country) => mine.includes(country));

    // No country named: they ask about the job's country. Needing a sponsor means "no".
    return profile.needs_sponsorship === false;
  }

  const techWords = (profile) => (profile.technologies || []).map((tech) => normalize(tech)).filter((tech) => tech.length > 1);

  // ---------- salary range in the job post ----------

  const CURRENCY = "[$€£¥₹]|\\b(?:usd|eur|gbp|chf|cad|aud|nzd|sgd|inr|pln|sek|nok|dkk|czk|aed|jpy)\\b";
  // "80,000", "80.000", "100'000", "80k", "80.5k". Plain spaces are not thousands separators: "80,000 100 people".
  const AMOUNT = "(?<![\\d.,])(\\d{1,3}(?:[,.'’\\u00a0\\u202f]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(k\\b)?";
  const SALARY_RANGE = new RegExp(`(${CURRENCY})?\\s*${AMOUNT}\\s*(${CURRENCY})?\\s*(?:-|–|—|to|bis|and)\\s*(${CURRENCY})?\\s*${AMOUNT}\\s*(${CURRENCY})?`, "gi");
  const SALARY_WORDS = /\b(salary|salaries|compensation|pay|base|range|ote|remuneration|wage|gehalt)\b/i;
  const SYMBOL_CODE = { $: "usd", "€": "eur", "£": "gbp", "¥": "jpy", "₹": "inr" };

  const currencyCode = (text) => {
    const found = String(text || "").match(new RegExp(CURRENCY, "i"))?.[0] || "";

    return SYMBOL_CODE[found] || found.toLowerCase();
  };

  function amount(digits, k) {
    const n = /^\d{1,3}([,.'’  ]\d{3})+$/.test(digits) ? Number(digits.replace(/\D/g, "")) : Number(digits.replace(",", "."));

    return k ? n * 1000 : n;
  }

  /**
   * The top of a salary range in a text: "€60,000 - €80,000" -> { value: 80000, text: "€80,000" }. Or null.
   * Without a currency the text before it must say salary, pay, ... ("2019 - 2021" is not a salary).
   * Several ranges (one per country): the one in `currency` (e.g. the profile's "EUR 75,000") wins, else the first.
   */
  function topSalary(text, currency = "") {
    const found = [];

    for (const m of String(text || "").matchAll(SALARY_RANGE)) {
      const cur = m[5] || m[8] || m[1] || m[4] || "";
      const high = amount(m[6], m[7]);
      // "€60-80k": the k is for both.
      const low = amount(m[2], m[3]) * (m[7] && !m[3] ? 1000 : 1);
      const before = text.slice(Math.max(0, m.index - 100), m.index);

      if (high <= low || (cur ? high < 1000 : high < 10000 || !SALARY_WORDS.test(before))) continue;

      const number = high.toLocaleString("en-US");

      found.push({ value: high, currency: currencyCode(cur), text: !cur ? number : /^[a-z]+$/i.test(cur) ? `${cur.toUpperCase()} ${number}` : `${cur}${number}` });
    }

    const mine = currencyCode(currency);

    return found.find((one) => mine && one.currency === mine) || found[0] || null;
  }

  // A range in the question itself first ("Expected salary (range: €60k-€80k)"), then the job post.
  const jobSalary = (p, f, job = {}) => topSalary(f.label, p.salary_expectation) || topSalary(job.text, p.salary_expectation);

  // "Salary (number format without special characters)": digits only, like a number field.
  const wantsDigits = (f) => f.kind === "number" || /\b(number format|numbers? only|digits? only|only (numbers|digits)|without (special characters|currency|symbols)|no (special characters|currency|symbols))\b/.test(normalize(f.label));

  /*
   * Each rule: test(label, field, hay) -> true when it applies. value(profile, field, label, job) -> answer
   * (null = this rule has no answer: go on). kinds: "typed" | "choice" | "any" | "file".
   * check: true = a guess about a legal question, shown yellow. A function -> a note to show yellow with, or "".
   */
  const RULES = [
    { key: "over_18", kinds: "any", test: (l) => /\b(over|at least|older than|above) (the age of )?18\b|\b18 (years )?(of age|or older)\b/.test(l), value: (p) => p.over_18 ?? true },

    { key: "first_name", kinds: "typed", test: (l, f) => /\b(first|given|fore) ?name\b/.test(l) || f.autocomplete === "given-name", value: (p) => p.first_name },
    { key: "last_name", kinds: "typed", test: (l, f) => /\b(last|family|sur) ?name\b|\bsurname\b/.test(l) || f.autocomplete === "family-name", value: (p) => p.last_name },
    { key: "middle_name", kinds: "typed", test: (l) => /\bmiddle (name|initial)\b/.test(l), value: () => null },
    { key: "preferred_name", kinds: "typed", test: (l) => /\b(preferred|nick) ?name\b|\bname you (go by|prefer)\b/.test(l), value: (p) => p.preferred_name || p.first_name },
    {
      key: "full_name",
      kinds: "typed",
      test: (l, f, hay) => /^(full |your |legal |complete )?name$|\b(full|legal) name\b/.test(l) || f.autocomplete === "name" || /^(name|_systemfield_name|full_name)$/.test(f.name || ""),
      value: (p) => [p.first_name, p.last_name].filter(Boolean).join(" ") || null,
    },

    { key: "email", kinds: "typed", test: (l, f) => /\be ?mail\b/.test(l) || f.kind === "email" || f.autocomplete === "email", value: (p) => p.email },
    { key: "phone_country_code", kinds: "any", test: (l) => /\b(country|dial(ing)?|area) code\b/.test(l), value: (p) => p.phone_country_code },
    { key: "phone", kinds: "typed", test: (l, f) => /\b(phone|mobile|cell|telephone|tel)\b/.test(l) || f.kind === "tel", value: (p) => p.phone },

    { key: "linkedin", kinds: "typed", test: (l, f, hay) => /\blinked ?in\b/.test(hay), value: (p) => p.linkedin },
    { key: "github", kinds: "typed", test: (l, f, hay) => /\bgit ?hub\b/.test(hay), value: (p) => p.github },
    { key: "social", kinds: "typed", test: (l, f, hay) => /\b(twitter|x com|dribbble|behance|stack ?overflow|instagram|facebook)\b/.test(hay), value: () => null },
    { key: "portfolio", kinds: "typed", test: (l, f, hay) => /\b(portfolio|personal (web ?)?site|web ?site|personal url|blog|other website)\b/.test(hay), value: (p) => p.portfolio || p.github },

    {
      key: "current_company",
      kinds: "typed",
      test: (l, f) => /\b(current|present|most recent|latest) (company|employer|organi[sz]ation)\b/.test(l) || (/^(company|employer|organi[sz]ation)( name)?$/.test(l)) || f.name === "org",
      value: (p) => p.current_company,
    },
    { key: "current_title", kinds: "typed", test: (l) => /\b(current|present|most recent|latest) (job )?(title|role|position)\b|^(job )?title$/.test(l), value: (p) => p.current_title },

    { key: "relocate", kinds: "any", test: (l) => /\breloca\w*/.test(l), value: (p) => p.willing_to_relocate },
    { key: "sponsorship_without", kinds: "any", check: true, test: (l) => /\bwithout\b.*\b(sponsor\w*|visa)\b/.test(l), value: (p) => (p.needs_sponsorship === undefined ? null : !p.needs_sponsorship) },
    { key: "sponsorship", kinds: "any", check: true, test: (l) => /\bsponsor\w*\b/.test(l) || (/\bvisa\b/.test(l) && /\b(require|need|support)\b/.test(l)), value: (p) => p.needs_sponsorship },
    {
      key: "work_authorization",
      kinds: "any",
      check: true,
      test: (l) => /\b(authori[sz]ed|eligible|eligibility|right|permitted|allowed|entitled|legally able)\b.*\bwork\b|\bwork (permit|authori[sz]ation|visa)\b|\bright to work\b/.test(l),
      value: (p, f, l) => authorizedToWork(p, l),
    },

    { key: "notice_period", kinds: "any", test: (l) => /\bnotice( period)?\b/.test(l), value: (p) => p.notice_period },
    {
      key: "start_date",
      kinds: "any",
      test: (l) => /\b(earliest|possible|available|availability|when can you|when could you|able to|can you|could you)\b.*\bstart\b|\bstart (date|working)\b|\bjoining date\b|\bdate available\b/.test(l),
      value: (p, f) => (f.kind === "date" ? (/^\d{4}-\d{2}-\d{2}$/.test(p.start_date || "") ? p.start_date : null) : p.start_date),
    },
    {
      key: "salary",
      kinds: "typed",
      test: (l) => /\b(salary|compensation|remuneration|pay|wage|ctc|gehalt)\b/.test(l) && !/\bcurrent\b/.test(l),
      // The top of the job's own range if the page shows one, else your default.
      check: (p, f, l, job) => (jobSalary(p, f, job) ? "Top of the job's salary range: check it" : ""),
      value: (p, f, l, job) => {
        const top = jobSalary(p, f, job);

        if (top) return wantsDigits(f) ? String(top.value) : top.text;

        return wantsDigits(f) ? String(p.salary_expectation || "").replace(/[^\d]/g, "") || null : p.salary_expectation;
      },
    },

    {
      key: "how_heard",
      kinds: "any",
      test: (l) => /\bhow did you (hear|find|learn|come across)\b|\bwhere did you (hear|find|see)\b|\bhear about\b|^(referral )?source$/.test(l),
      value: (p) => p.how_heard,
    },

    { key: "school", kinds: "typed", test: (l) => words(l) <= 6 && /\b(school|university|college|institution)\b/.test(l), value: (p) => p.school },
    { key: "degree", kinds: "any", test: (l) => words(l) <= 6 && /\bdegree\b/.test(l), value: (p) => p.degree },
    { key: "field_of_study", kinds: "typed", test: (l) => words(l) <= 6 && /\b(field of study|major|discipline|area of study)\b/.test(l), value: (p) => p.field_of_study },
    { key: "graduation_year", kinds: "typed", test: (l) => words(l) <= 6 && /\bgraduat\w*\b/.test(l), value: (p) => p.graduation_year },
    { key: "languages", kinds: "typed", test: (l) => words(l) <= 6 && /\blanguages?\b/.test(l) && !/\bprogramming\b/.test(l), value: (p) => p.languages },

    {
      key: "years_experience",
      kinds: "any",
      // "years of experience with React" is about one skill: AI reads that from the resume.
      test: (l, f, hay, p) => /\byears?\b.*\bexperience\b|\bexperience\b.*\byears?\b/.test(l) && !techWords(p).some((tech) => ` ${l} `.includes(` ${tech} `)),
      value: (p) => (present(p.years_experience) ? Number(p.years_experience) : null),
    },

    { key: "postal_code", kinds: "typed", test: (l, f) => /\b(postal|post|zip) ?code\b|\bpostcode\b/.test(l) || f.autocomplete === "postal-code", value: (p) => p.postal_code },
    { key: "address", kinds: "typed", test: (l, f) => (words(l) <= 5 && /\b(street )?address\b/.test(l) && !/\be ?mail\b/.test(l)) || /address-line1|street-address/.test(f.autocomplete || ""), value: (p) => p.address },
    { key: "state", kinds: "typed", test: (l) => /^(state|province|region|county)\b/.test(l), value: (p) => p.state },
    {
      key: "country",
      kinds: "any",
      test: (l, f) => (words(l) <= 6 && /\bcountry\b/.test(l)) || f.autocomplete === "country-name",
      value: (p) => p.country,
    },
    {
      key: "location",
      kinds: "any",
      test: (l, f, hay) => (words(l) <= 6 && /\b(location|city|town|where are you (based|located)|based in)\b/.test(l)) || /^(location|_systemfield_location)$/.test(f.name || ""),
      value: (p, f) => (f.kind === "combobox" ? p.city : [p.city, p.country].filter(Boolean).join(", ")) || null,
    },

    {
      key: "resume",
      kinds: "file",
      test: (l, f, hay) => /\b(resume|cv|lebenslauf|curriculum)\b/.test(hay) && !/\bcover\b/.test(hay) && !/\b(autofill|auto fill|parse)\b/.test(hay),
      value: () => "resume",
    },
  ];

  function kindFits(rule, field) {
    if (rule.kinds === "file") return field.kind === "file";
    if (field.kind === "file") return false;
    if (rule.kinds === "typed") return isTyped(field);
    if (rule.kinds === "choice") return isChoice(field);

    return true;
  }

  /** The first rule that applies, with its value made to fit the field. Or null. job: { text } of the page. */
  function ruleFor(field, profile = {}, job = {}) {
    const label = normalize(field.label);
    const hay = normalize([field.label, field.name, field.idAttr, field.placeholder, field.autocomplete].filter(Boolean).join(" "));

    for (const rule of RULES) {
      if (!kindFits(rule, field)) continue;

      if (!rule.test(label, field, hay, profile)) continue;

      const raw = rule.value(profile, field, label, job);

      // The rule knows the question but the profile has no answer: stop here, the AI can't know either
      // for facts like email or phone. Only these few go on to the next step.
      if (!present(raw)) {
        if (["how_heard", "degree", "years_experience", "location", "country", "start_date", "salary", "notice_period", "middle_name", "social", "relocate"].includes(rule.key)) return null;

        return { key: rule.key, value: null };
      }

      const value = fitValue(field, raw);

      if (value === null) return null;

      const note = typeof rule.check === "function" ? rule.check(profile, field, label, job) : rule.check ? "Legal question: check it" : "";

      return { key: rule.key, value, check: Boolean(note), note };
    }

    return null;
  }

  /** Text for typed fields, the option label for choice fields; null when no option fits. */
  function fitValue(field, raw) {
    if (field.kind === "file") return raw;

    if (field.kind === "checkbox") return typeof raw === "boolean" ? raw : null;

    if (isChoice(field)) {
      if (field.kind === "checkboxes") {
        const values = Array.isArray(raw) ? raw : [raw];
        const picked = values.map((value) => pickOption(field.options, value)).filter(Boolean);

        return picked.length ? picked.map((option) => option.label) : null;
      }

      const option = pickOption(field.options, raw);

      return option ? option.label : null;
    }

    return valueToText(raw);
  }

  function valueToText(raw) {
    if (typeof raw === "boolean") return raw ? "Yes" : "No";
    if (Array.isArray(raw)) return raw.join(", ");

    return String(raw);
  }

  /**
   * The plan for one field. lookupMemory(field) -> label/text or null. job: { text } of the page.
   * Returns { source, value, note } where source is consent | sensitive | profile | rule | check | memory | manual | ai.
   */
  function classify(field, profile = {}, lookupMemory = () => null, job = {}) {
    if (isConsent(field)) return { source: "consent", value: null, note: "Consent: tick it yourself" };

    const age = RULES[0];

    if (kindFits(age, field) && age.test(normalize(field.label))) {
      const value = fitValue(field, age.value(profile));

      if (value !== null) return { source: "rule", value };
    }

    const sensitive = sensitiveCategory(field);

    if (sensitive) {
      const own = sensitive.key ? get(profile, sensitive.key) : null;
      const value = present(own) ? fitValue(field, own) : null;

      if (value !== null) return { source: "profile", value };

      const saved = lookupMemory(field);

      if (saved !== null && saved !== undefined) return { source: "memory", value: saved };

      return { source: "sensitive", value: null, note: "Personal question: you decide" };
    }

    const rule = ruleFor(field, profile, job);

    if (rule && rule.value !== null) return { source: rule.check ? "check" : "rule", value: rule.value, key: rule.key, note: rule.note };

    const saved = lookupMemory(field);

    if (saved !== null && saved !== undefined) return { source: "memory", value: saved };

    if (rule && rule.value === null) return { source: "manual", value: null, key: rule.key, note: `Add "${rule.key.replace(/_/g, " ")}" in settings` };

    if (field.kind === "file") return { source: "manual", value: null, note: "File: add it yourself" };

    return { source: "ai", value: null };
  }

  AF.match = { classify, ruleFor, pickOption, fitValue, valueToText, isConsent, sensitiveCategory, isChoice, isTyped, range, countriesIn, topSalary };

  if (typeof module !== "undefined" && module.exports) module.exports = AF.match;
})(globalThis);
