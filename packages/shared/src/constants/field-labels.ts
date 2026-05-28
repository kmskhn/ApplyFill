import { FieldType } from "../types/ats";

/**
 * Regex patterns for matching label text to canonical field types.
 * Ordered by specificity — more specific patterns first within each field type.
 * All patterns are case-insensitive.
 */
export const LABEL_PATTERNS: Record<FieldType, RegExp[]> = {
  [FieldType.FIRST_NAME]: [
    /^first\s*name$/i,
    /^given\s*name$/i,
    /^legal\s*first\s*name$/i,
    /^preferred\s*(first\s*)?name$/i,
    /^prénom$/i,
    /^nombre$/i,
    /legal\s*first\s*name/i,
    /first\s*name/i,
    /given\s*name/i,
  ],
  [FieldType.LAST_NAME]: [
    /^last\s*name$/i,
    /^family\s*name$/i,
    /^surname$/i,
    /^legal\s*last\s*name$/i,
    /^nom(\s+de\s+famille)?$/i,
    /^apellido$/i,
    /legal\s*last\s*name/i,
    /last\s*name/i,
    /family\s*name/i,
  ],
  [FieldType.FULL_NAME]: [
    /^full\s*name(\s*\(arabic\))?$/i,
    /^full\s*name$/i,
    /^name$/i,
    /^your\s*name$/i,
    /^candidate\s*name$/i,
    /^applicant\s*name$/i,
    /full\s*name/i,
  ],
  [FieldType.EMAIL]: [
    /^e[\-\s]?mail(\s*address)?$/i,
    /^email$/i,
    /e[\-\s]?mail/i,
  ],
  [FieldType.PHONE]: [
    /^phone(\s*number)?$/i,
    /^telephone(\s*number)?$/i,
    /^mobile(\s*number)?$/i,
    /^cell(\s*phone)?$/i,
    /^contact\s*number$/i,
    /phone\s*number/i,
    /mobile\s*number/i,
    /^phone$/i,
  ],
  [FieldType.LOCATION]: [
    /^location$/i,
    /^current\s*location$/i,
    /^where\s*are\s*you\s*(currently\s*)?located/i,
  ],
  [FieldType.ADDRESS]: [
    /^address$/i,
    /^street\s*(address)?$/i,
    /^home\s*address$/i,
    /^mailing\s*address$/i,
    /^residential\s*address$/i,
    /address/i,
  ],
  [FieldType.CITY]: [
    /^city$/i,
    /^town$/i,
    /^city\s*\/\s*town$/i,
  ],
  [FieldType.STATE]: [
    /^state$/i,
    /^province$/i,
    /^state\s*\/?s*province$/i,
    /^region$/i,
  ],
  [FieldType.COUNTRY]: [
    /^country(\s*of\s*(residence|living|origin))?$/i,
    /^country\s*\/?s*region$/i,
    /country\s*of\s*(residence|living)/i,
  ],
  [FieldType.NATIONALITY]: [
    /^nationality$/i,
    /^citizenship$/i,
    /^national\s*origin$/i,
    /nationality/i,
    /citizenship/i,
  ],
  [FieldType.LINKEDIN_URL]: [
    /linkedin/i,
    /linked\s*in/i,
  ],
  [FieldType.GITHUB_URL]: [
    /github/i,
    /git\s*hub/i,
  ],
  [FieldType.PORTFOLIO_URL]: [
    /portfolio/i,
    /portfolio\s*(url|link|website)/i,
  ],
  [FieldType.WEBSITE_URL]: [
    /^website$/i,
    /^personal\s*(website|site|url|link)$/i,
    /^url$/i,
    /^web\s*site$/i,
  ],
  [FieldType.CURRENT_COMPANY]: [
    /^(current\s*)?company$/i,
    /^(current\s*)?employer$/i,
    /^(current\s*)?organization$/i,
    /^company\s*name$/i,
  ],
  [FieldType.CURRENT_TITLE]: [
    /^(current\s*)?title$/i,
    /^(current\s*)?job\s*title$/i,
    /^(current\s*)?position$/i,
    /^(current\s*)?role$/i,
    /job\s*title/i,
  ],
  [FieldType.YEARS_EXPERIENCE]: [
    /years?\s*(of\s*)?experience/i,
    /experience\s*\(years?\)/i,
    /how\s*many\s*years/i,
    /years?.*lead/i,
    /years?.*manag/i,
    /lead.*years?/i,
    /manag.*years?/i,
  ],
  [FieldType.CURRENT_SALARY]: [
    /current\s*(total\s*)?(salary|package|ctc|compensation|pay|remuneration)/i,
    /current\s*ctc/i,
    /total\s*(current\s*)?(package|ctc)/i,
    /present\s*(salary|package|ctc)/i,
    /existing\s*(salary|package|ctc)/i,
    /current\s*income/i,
    /^ctc$/i,
  ],
  [FieldType.SALARY_EXPECTATION]: [
    /expected\s*(salary|package|ctc|compensation)/i,
    /salary\s*expect/i,
    /desired\s*(salary|compensation|pay|package)/i,
    /salary\s*requirement/i,
    /compensation\s*expect/i,
    /expected\s*pay/i,
    /what\s*(is\s*your\s*)?(salary|compensation|pay|package)\s*expect/i,
  ],
  [FieldType.NOTICE_PERIOD]: [
    /notice\s*period/i,
    /notice\s*required/i,
    /how\s*(soon|quickly)\s*(can|could)\s*you\s*(start|join)/i,
    /availability\s*(to\s*start|date)/i,
    /when\s*(can|could)\s*you\s*(start|join)/i,
    /joining\s*(notice|period)/i,
    /^notice$/i,
  ],
  [FieldType.WORK_AUTHORIZATION]: [
    /work\s*authoriz/i,
    /authorized?\s*to\s*work/i,
    /legally\s*authorized/i,
    /right\s*to\s*work/i,
    /work\s*permit/i,
    /eligible\s*to\s*work/i,
  ],
  [FieldType.SPONSORSHIP_NEEDED]: [
    /sponsor/i,
    /visa\s*sponsor/i,
    /require\s*(visa\s*)?sponsor/i,
    /need\s*(visa\s*)?sponsor/i,
    /immigration\s*sponsor/i,
  ],
  [FieldType.GENDER]: [
    /^gender$/i,
    /gender\s*identity/i,
  ],
  [FieldType.ETHNICITY]: [
    /^(race|ethnicity)$/i,
    /race\s*\/?s*ethnicity/i,
    /ethnic\s*background/i,
  ],
  [FieldType.VETERAN_STATUS]: [
    /veteran/i,
    /protected\s*veteran/i,
    /military\s*service/i,
  ],
  [FieldType.DISABILITY_STATUS]: [
    /disability/i,
    /disabled/i,
  ],
  [FieldType.RESUME]: [
    /^resume$/i,
    /^cv$/i,
    /resume\s*\/?s*cv/i,
    /upload\s*(your\s*)?(resume|cv)/i,
  ],
  [FieldType.COVER_LETTER]: [
    /cover\s*letter/i,
    /letter\s*of\s*(interest|motivation)/i,
  ],
  // These catch-all types don't have label patterns — they're fallbacks
  [FieldType.CUSTOM_TEXT]: [],
  [FieldType.CUSTOM_SELECT]: [],
  [FieldType.CUSTOM_TEXTAREA]: [],
  [FieldType.UNKNOWN]: [],
};

/**
 * Maps HTML input `name` attribute patterns to field types.
 * Used as secondary signal when label text is unavailable.
 */
export const NAME_ATTRIBUTE_PATTERNS: Array<{ pattern: RegExp; fieldType: FieldType }> = [
  { pattern: /first.?name/i, fieldType: FieldType.FIRST_NAME },
  { pattern: /last.?name/i, fieldType: FieldType.LAST_NAME },
  { pattern: /full.?name/i, fieldType: FieldType.FULL_NAME },
  { pattern: /^name$/i, fieldType: FieldType.FULL_NAME },
  { pattern: /email/i, fieldType: FieldType.EMAIL },
  { pattern: /phone|tel/i, fieldType: FieldType.PHONE },
  { pattern: /city/i, fieldType: FieldType.CITY },
  { pattern: /state|province/i, fieldType: FieldType.STATE },
  { pattern: /country/i, fieldType: FieldType.COUNTRY },
  { pattern: /nationality|citizenship/i, fieldType: FieldType.NATIONALITY },
  { pattern: /location/i, fieldType: FieldType.LOCATION },
  { pattern: /linkedin/i, fieldType: FieldType.LINKEDIN_URL },
  { pattern: /github/i, fieldType: FieldType.GITHUB_URL },
  { pattern: /portfolio/i, fieldType: FieldType.PORTFOLIO_URL },
  { pattern: /website|url/i, fieldType: FieldType.WEBSITE_URL },
  { pattern: /company|employer|org/i, fieldType: FieldType.CURRENT_COMPANY },
  { pattern: /title|position|role/i, fieldType: FieldType.CURRENT_TITLE },
  { pattern: /salary|compensation/i, fieldType: FieldType.SALARY_EXPECTATION },
  { pattern: /notice.?period|notice/i, fieldType: FieldType.NOTICE_PERIOD },
];

/**
 * Maps HTML input `type` attribute to field types.
 * Lowest priority signal — only used when no other signals match.
 */
export const TYPE_ATTRIBUTE_MAP: Record<string, FieldType> = {
  email: FieldType.EMAIL,
  tel: FieldType.PHONE,
  url: FieldType.WEBSITE_URL,
  file: FieldType.RESUME,
};
