/*
 * AI answers for the questions no rule or saved answer covers. Runs in the background worker.
 *
 *   const ai = createAi({ keys, state, saveState });
 *   const answers = await ai.answerFields({ profile, resumeText, job, fields });   // { [fieldId]: value }
 *   const { text, profile } = await ai.readResume({ base64 });
 *
 * - Free only: Gemini (free key from AI Studio, no card), then OpenRouter free models.
 * - One request per Fill click. A model that says "quota" is skipped for the rest of its day.
 * - Email, phone, address and personal (EEO) answers are never sent: see publicProfile / redact.
 * - The answer must be JSON; checkAnswers drops unknown ids and options that don't exist.
 *
 * Free model names checked in Oct 2026. If a provider renames or retires a model, edit MODELS:
 * an unknown model (404) is skipped for the day, so a stale list costs one request, not a failure.
 */
(function (root) {
  const AF = (root.AF = root.AF || {});
  const match = AF.match || require("./content/match.js");

  const MODELS = {
    gemini: ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"],
    openrouter: ["openrouter/free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3-super-120b-a12b:free"],
  };

  const TIMEOUT_MS = 30000;
  const QUOTA = /quota|rate.?limit|too many requests|limit exceeded|resource.?exhausted|insufficient (credits|funds)|free-models-per-day/i;

  // Never sent to AI.
  const PRIVATE_KEYS = ["email", "phone", "phone_country_code", "address", "postal_code", "state", "date_of_birth", "nationality", "eeo", "pronouns", "over_18"];

  function publicProfile(profile = {}) {
    const out = {};

    for (const [key, value] of Object.entries(profile)) {
      if (PRIVATE_KEYS.includes(key)) continue;
      if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) continue;

      out[key] = value;
    }

    return out;
  }

  const escapeRe = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /** Resume text without email addresses, phone numbers or the profile's address. */
  function redact(text, profile = {}) {
    let out = String(text || "")
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
      .replace(/\+?\d[\d\s().-]{7,}\d/g, (found) => {
        const groups = found.match(/\d+/g);

        // Dates like "2019 - 2021" stay: the AI needs them.
        if (groups.join("").length < 9 || groups.every((group) => /^(19|20)\d{2}$/.test(group))) return found;

        return "[phone]";
      });

    for (const key of ["address", "postal_code"]) {
      if (profile[key] && String(profile[key]).trim().length > 3) out = out.replace(new RegExp(escapeRe(String(profile[key]).trim()), "gi"), `[${key}]`);
    }

    return out;
  }

  const SYSTEM = [
    "You fill in job application forms for one candidate. You get the candidate's profile, resume text, the job page text, and a list of form questions.",
    "",
    "Rules:",
    "- Use only facts from the profile and resume. Never invent employers, titles, dates, degrees, numbers, links or skills.",
    '- If the facts do not answer a question, return "" for it. An empty answer is better than a guess.',
    '- Questions with "options": the value must be exactly one of the options, or an array of options when "multiple" is true.',
    "- Yes/no questions about skills or experience: answer from the resume. Questions about preferences (office days, travel, relocation, remote work, notice): answer from the profile and its ai_notes; if nothing fits, \"\".",
    '- Write every answer in English, even when the form or job page is in another language. Questions with "options": still return the option text exactly as given.',
    "- Free-text questions: first person, basic everyday English. Short common words, short sentences, no fancy words, buzzwords or flattery. 1 to 3 short sentences unless the question asks for a minimum length, never more than max_length characters. Use real projects and skills from the resume that fit this job and company.",
    '- Fields of kind "number": digits only.',
    '- Never answer questions about gender, race, ethnicity, disability, veteran status, sexual orientation, religion, age or nationality: return "".',
    '- Never agree to terms, consents or certifications: return "".',
    "",
    'Return JSON only: {"answers":[{"id":"<question id>","value":"<answer>"}]}',
  ].join("\n");

  function buildPrompt({ profile = {}, resumeText = "", job = {}, fields = [] }) {
    const input = {
      candidate: publicProfile(profile),
      resume: redact(resumeText, profile).slice(0, 12000),
      job: { page_title: job.title || "", site: job.host || "", text: String(job.text || "").slice(0, 6000) },
      questions: fields,
    };

    return { system: SYSTEM, prompt: JSON.stringify(input, null, 1) };
  }

  /** Text -> the first JSON object in it. Handles code fences and <think> blocks. Throws if none. */
  function extractJsonObject(text) {
    const cleaned = String(text ?? "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end <= start) throw new Error("no JSON object in the answer");

    const parsed = JSON.parse(cleaned.slice(start, end + 1));

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("the JSON is not an object");

    return parsed;
  }

  /**
   * AI JSON -> { [fieldId]: value } with only usable answers:
   * known ids, real options for choice fields, text cut to max_length, no empty values.
   */
  function checkAnswers(fields, json) {
    const byId = new Map(fields.map((field) => [String(field.id), field]));
    const out = {};

    for (const item of Array.isArray(json?.answers) ? json.answers : []) {
      const field = byId.get(String(item?.id));
      const value = item?.value;

      if (!field || value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) continue;

      if (field.kind === "checkbox") {
        if (typeof value === "boolean") out[field.id] = value;
        else if (/^(yes|true)$/i.test(String(value))) out[field.id] = true;
        else if (/^(no|false)$/i.test(String(value))) out[field.id] = false;

        continue;
      }

      if (field.options?.length) {
        const options = field.options.map((label) => ({ label }));

        if (field.multiple) {
          const picked = (Array.isArray(value) ? value : [value]).map((one) => match.pickOption(options, one)?.label).filter(Boolean);

          if (picked.length) out[field.id] = [...new Set(picked)];
        } else {
          const picked = match.pickOption(options, Array.isArray(value) ? value[0] : value);

          if (picked) out[field.id] = picked.label;
        }

        continue;
      }

      let text = (Array.isArray(value) ? value.join(", ") : String(value)).trim();

      if (field.kind === "number") text = text.replace(/[^\d.]/g, "");
      if (field.max_length) text = text.slice(0, field.max_length).trim();

      if (text) out[field.id] = text;
    }

    return out;
  }

  const DAY = {
    // Google's free daily quota resets at midnight US Pacific time, OpenRouter's at midnight UTC.
    gemini: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }),
    openrouter: new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }),
  };

  class AiError extends Error {
    constructor(message, status) {
      super(message);

      this.status = status;
    }
  }

  function shortMessage(text) {
    try {
      const json = JSON.parse(text);

      return String(json?.error?.message || json?.message || json?.error || text).replace(/\s+/g, " ").slice(0, 160);
    } catch {
      return String(text).replace(/\s+/g, " ").slice(0, 160);
    }
  }

  function geminiRequest(model, { system, prompt, pdf }, key) {
    const parts = [...(pdf ? [{ inline_data: { mime_type: "application/pdf", data: pdf } }] : []), { text: prompt }];

    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        // Thinking counts against this limit: a small one leaves no room for the answer.
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: "application/json" },
      },
      text: (json) => (json?.candidates?.[0]?.content?.parts || []).filter((part) => !part.thought).map((part) => part.text || "").join(""),
    };
  }

  function openrouterRequest(model, { system, prompt }, key) {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: 4000,
        temperature: 0.2,
      },
      text: (json) => json?.choices?.[0]?.message?.content,
    };
  }

  /**
   * keys: { gemini, openrouter }. state: { [provider]: { day, used, exhausted:[models] } } (saved by
   * the caller in chrome.storage). fetchImpl / now: for tests.
   */
  function createAi({ keys = {}, state = {}, saveState = async () => {}, fetchImpl = (...args) => fetch(...args), now = () => new Date(), log = () => {} } = {}) {
    const today = (provider) => DAY[provider].format(now());

    function slot(provider) {
      if (!state[provider] || state[provider].day !== today(provider)) state[provider] = { day: today(provider), used: 0, exhausted: [] };

      return state[provider];
    }

    async function request(provider, model, options) {
      const build = provider === "gemini" ? geminiRequest : openrouterRequest;
      const req = build(model, options, keys[provider]);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      slot(provider).used += 1;
      await saveState(state);

      try {
        const response = await fetchImpl(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body), signal: controller.signal });
        const body = await response.text();

        if (!response.ok) throw new AiError(`${response.status}: ${shortMessage(body)}`, response.status);

        const json = JSON.parse(body);

        // OpenRouter can answer 200 with an error inside.
        if (json?.error) throw new AiError(shortMessage(body), json.error.code || 500);

        const text = req.text(json);

        if (!text) throw new AiError("empty answer", 500);

        return extractJsonObject(text);
      } catch (error) {
        if (error.name === "AbortError") throw new AiError(`no answer in ${TIMEOUT_MS / 1000} s`, 408);

        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    /** -> { data, provider, model }. Tries every free model in order. */
    async function ask(options) {
      const attempts = [];
      let quotaHits = 0;
      let configured = 0;

      for (const provider of ["gemini", "openrouter"]) {
        if (!keys[provider]) continue;
        if (options.pdf && provider !== "gemini") continue;

        configured += 1;

        for (const model of MODELS[provider]) {
          const day = slot(provider);

          if (day.exhausted.includes(model) || day.exhausted.includes("*")) continue;

          try {
            const data = await request(provider, model, options);

            log(`${provider} ${model}: ok`);

            return { data, provider, model };
          } catch (error) {
            attempts.push(`${provider} ${model}: ${error.message}`);
            log(`${provider} ${model}: ${error.message}`);

            // Google says 400 "API key not valid" for a bad key.
            if (error.status === 401 || error.status === 403 || (error.status === 400 && /api.?key/i.test(error.message))) {
              attempts.push(`${provider}: key not accepted`);
              break;
            }

            // OpenRouter's free limit is per account: all its models are done for the day.
            if (error.status === 429 || QUOTA.test(error.message)) {
              quotaHits += 1;
              day.exhausted.push(provider === "openrouter" ? "*" : model);
              await saveState(state);

              if (provider === "openrouter") break;

              continue;
            }

            // Unknown model name: skip it for today too.
            if (error.status === 404) {
              day.exhausted.push(model);
              await saveState(state);
            }
          }
        }
      }

      if (configured === 0) throw new Error(options.pdf ? "Add a Gemini key in settings (reading a PDF needs Gemini)." : "Add a Gemini or OpenRouter key in settings.");

      if (quotaHits > 0 && attempts.every((line) => QUOTA.test(line) || /429|exhausted|key not accepted/i.test(line))) throw new Error("Free AI limit used up for today. Fill the rest by hand or try tomorrow.");

      const rejected = attempts.filter((line) => line.endsWith(": key not accepted")).map((line) => line.split(":")[0]);

      if (rejected.length === configured) throw new Error(`AI key not accepted (${rejected.join(", ")}): check it in settings.`);

      throw new Error(`AI failed: ${attempts.slice(-3).join(" · ") || "no model left for today"}`);
    }

    async function answerFields(input) {
      if (!input.fields?.length) return { answers: {} };

      const { data, provider, model } = await ask(buildPrompt(input));

      return { answers: checkAnswers(input.fields, data), provider, model };
    }

    async function readResume({ base64 }) {
      const system = "You read resumes. Copy the text exactly; do not summarize or change it.";
      const prompt = [
        "Return JSON only:",
        '{"text": "<the full resume text, plain, keep line breaks>",',
        ' "profile": {"first_name":"","last_name":"","email":"","phone":"","city":"","country":"","linkedin":"","github":"","portfolio":"",',
        '  "current_title":"","current_company":"","years_experience":0,"school":"","degree":"","field_of_study":"","graduation_year":"","languages":"","technologies":[]}}',
        'Use "" (or 0, []) when the resume does not say.',
      ].join("\n");

      const { data, model } = await ask({ system, prompt, pdf: base64 });

      return { text: String(data.text || ""), profile: data.profile && typeof data.profile === "object" ? data.profile : {}, model };
    }

    async function test() {
      const { data, provider, model } = await ask({ system: "Answer with JSON only.", prompt: 'Return {"ok": true}' });

      return { ok: data.ok === true, provider, model };
    }

    return { ask, answerFields, readResume, test, state };
  }

  AF.ai = { createAi, buildPrompt, checkAnswers, publicProfile, redact, extractJsonObject, MODELS, SYSTEM };

  if (typeof module !== "undefined" && module.exports) module.exports = AF.ai;
})(globalThis);
