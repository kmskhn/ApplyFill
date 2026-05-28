/**
 * AI-powered form field answerer using Gemini 2.0 Flash.
 *
 * Sends ALL form fields to Gemini with structured profile data + resume text.
 * Gemini understands the context of each field (even complex dropdowns and
 * radio groups) and returns the best value for each.
 */

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export interface AIFieldRequest {
  /** Label text of the field */
  label: string;
  /** "input" | "textarea" | "select" */
  inputType: string;
  /** Available options for select/radio fields */
  options?: string[];
}

/** Structured profile data passed to AI as context */
export interface ProfileContext {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  nationality?: string;
  country?: string;
  city?: string;
  location?: string;
  currentTitle?: string;
  currentCompany?: string;
  currentSalary?: string;
  yearsExperience?: string;
  linkedIn?: string;
  github?: string;
  portfolio?: string;
  salaryExpectation?: string;
  noticePeriod?: string;
  workAuthorization?: string;
}

export interface AIAnswerRequest {
  fields: AIFieldRequest[];
  profile: ProfileContext;
  resumeText: string;
  /** Page title + URL for job context */
  jobContext: string;
  apiKey: string;
}

export interface AIAnswerResult {
  /** Maps field label → AI-generated answer */
  answers: Record<string, string>;
  error?: string;
}

/**
 * Calls Gemini to generate answers for ALL job application fields.
 * Uses both structured profile data and resume text as context.
 * Returns a map of { label → answer }.
 */
export async function answerFieldsWithAI(
  req: AIAnswerRequest,
): Promise<AIAnswerResult> {
  if (!req.apiKey || req.fields.length === 0) {
    return { answers: {} };
  }

  const prompt = buildPrompt(req);

  try {
    const response = await fetch(`${GEMINI_API_BASE}?key=${req.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[applyfill/ai] Gemini API error:", response.status, errBody);
      return {
        answers: {},
        error: `Gemini API error ${response.status}: ${response.statusText}`,
      };
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const answers = parseAnswers(text, req.fields);
    return { answers };
  } catch (err) {
    console.error("[applyfill/ai] Network error:", err);
    return {
      answers: {},
      error: err instanceof Error ? err.message : "Network error calling Gemini",
    };
  }
}

/**
 * Builds the prompt sent to Gemini.
 * Includes structured profile data so Gemini can answer even simple fields
 * (nationality, country, name) from the profile — not just from the resume.
 */
function buildPrompt(req: AIAnswerRequest): string {
  const p = req.profile;

  // Build structured profile section
  const profileLines: string[] = [];
  if (p.fullName || (p.firstName && p.lastName)) {
    profileLines.push(`Full Name: ${p.fullName ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim()}`);
  }
  if (p.firstName) profileLines.push(`First Name: ${p.firstName}`);
  if (p.lastName) profileLines.push(`Last Name: ${p.lastName}`);
  if (p.email) profileLines.push(`Email: ${p.email}`);
  if (p.phone) profileLines.push(`Phone: ${p.phone}`);
  if (p.nationality) profileLines.push(`Nationality: ${p.nationality}`);
  if (p.country) profileLines.push(`Country: ${p.country}`);
  if (p.city) profileLines.push(`City: ${p.city}`);
  if (p.location) profileLines.push(`Location: ${p.location}`);
  if (p.currentTitle) profileLines.push(`Current Job Title: ${p.currentTitle}`);
  if (p.currentCompany) profileLines.push(`Current Company: ${p.currentCompany}`);
  if (p.currentSalary) profileLines.push(`Current Salary / CTC: ${p.currentSalary}`);
  if (p.yearsExperience) profileLines.push(`Total Years of Experience: ${p.yearsExperience}`);
  if (p.linkedIn) profileLines.push(`LinkedIn: ${p.linkedIn}`);
  if (p.github) profileLines.push(`GitHub: ${p.github}`);
  if (p.salaryExpectation) profileLines.push(`Expected Salary / Package: ${p.salaryExpectation}`);
  if (p.noticePeriod) profileLines.push(`Notice Period: ${p.noticePeriod}`);
  if (p.workAuthorization) profileLines.push(`Work Authorization: ${p.workAuthorization}`);

  const profileSection =
    profileLines.length > 0
      ? `APPLICANT PROFILE:\n${profileLines.map((l) => `  ${l}`).join("\n")}`
      : "APPLICANT PROFILE: (not provided)";

  const resumeSection = req.resumeText.trim()
    ? `RESUME TEXT:\n${req.resumeText.trim()}`
    : "RESUME TEXT: (not provided)";

  const fieldsJson = JSON.stringify(
    req.fields.map((f) => ({
      label: f.label,
      type: f.inputType,
      ...(f.options && f.options.length > 0 ? { options: f.options } : {}),
    })),
    null,
    2,
  );

  return `You are helping a job applicant fill out an online application form.
Use the applicant's profile data AND resume to determine the best answer for each field.

RULES:
- For fields like Name, Email, Phone, Nationality, Country, City — use the profile data directly
- For LinkedIn/GitHub/Portfolio URL fields — use the URLs from the profile
- For dropdown/select fields: you MUST pick EXACTLY one of the provided options (closest match to profile/resume)
- For radio fields: pick EXACTLY one of the provided options
- For motivation/interest questions ("why do you want to join", "why are you interested", "what excites you") — write 2-3 concise professional sentences using the company name from the job page and the applicant's skills from the resume
- For availability/start date questions — use the Notice Period from profile if set, otherwise answer "Immediately"
- For consent/agreement/opt-in questions ("do you agree", "consent to receive", "I agree to", "check yes or no") — always answer "Yes"
- For skill/expertise questions ("are you expert in X", "experience with Y") — answer Yes or No based on the resume
- For general open-ended questions — write a concise professional 2-3 sentence answer from the resume
- SKIP fields where you truly have NO information (omit from JSON entirely)
- Respond ONLY with a valid JSON object: {"Field Label": "answer value", ...}
- Do not include any explanation or markdown outside the JSON

${profileSection}

${resumeSection}

JOB PAGE: ${req.jobContext}

FORM FIELDS TO FILL (answer all you can):
${fieldsJson}

Respond with ONLY a JSON object:`;
}

/**
 * Parses Gemini's JSON response into a label→answer map.
 * Handles markdown code fences and fuzzy label matching.
 */
function parseAnswers(
  text: string,
  fields: AIFieldRequest[],
): Record<string, string> {
  try {
    const cleaned = text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const answers: Record<string, string> = {};
    const labelSet = new Set(fields.map((f) => f.label));

    // Exact label match
    for (const [key, value] of Object.entries(parsed)) {
      if (labelSet.has(key) && typeof value === "string" && value.trim()) {
        answers[key] = value.trim();
      }
    }

    // Fuzzy label matching (Gemini sometimes paraphrases labels slightly)
    for (const field of fields) {
      if (answers[field.label]) continue;
      const fieldLower = field.label.toLowerCase();
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== "string" || !value.trim()) continue;
        const keyLower = key.toLowerCase();
        if (
          keyLower.includes(fieldLower) ||
          fieldLower.includes(keyLower) ||
          levenshteinDistance(keyLower, fieldLower) <= 3
        ) {
          answers[field.label] = value.trim();
          break;
        }
      }
    }

    return answers;
  } catch {
    console.warn("[applyfill/ai] Failed to parse Gemini response:", text);
    return {};
  }
}

/** Simple Levenshtein distance for fuzzy label matching */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 5) return 99;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [];
    for (let j = 0; j <= n; j++) {
      if (i === 0) dp[i]![j] = j;
      else if (j === 0) dp[i]![j] = i;
      else dp[i]![j] = 0;
    }
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = cost === 0
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

/** Minimal type for the Gemini REST API response */
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}
