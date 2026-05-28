/**
 * Canonical field types for job application forms.
 * Each type maps to a specific piece of user profile data.
 */
export enum FieldType {
  // Personal
  FIRST_NAME = "first_name",
  LAST_NAME = "last_name",
  FULL_NAME = "full_name",
  EMAIL = "email",
  PHONE = "phone",
  LOCATION = "location",
  ADDRESS = "address",
  CITY = "city",
  STATE = "state",
  COUNTRY = "country",
  NATIONALITY = "nationality",

  // Professional
  LINKEDIN_URL = "linkedin_url",
  GITHUB_URL = "github_url",
  PORTFOLIO_URL = "portfolio_url",
  WEBSITE_URL = "website_url",
  CURRENT_COMPANY = "current_company",
  CURRENT_TITLE = "current_title",
  CURRENT_SALARY = "current_salary",
  YEARS_EXPERIENCE = "years_experience",

  // Preferences
  SALARY_EXPECTATION = "salary_expectation",
  NOTICE_PERIOD = "notice_period",
  WORK_AUTHORIZATION = "work_authorization",
  SPONSORSHIP_NEEDED = "sponsorship_needed",

  // Demographics (EEO)
  GENDER = "gender",
  ETHNICITY = "ethnicity",
  VETERAN_STATUS = "veteran_status",
  DISABILITY_STATUS = "disability_status",

  // File inputs (Phase 1: detected but not filled)
  RESUME = "resume",
  COVER_LETTER = "cover_letter",

  // Unclassified
  CUSTOM_TEXT = "custom_text",
  CUSTOM_SELECT = "custom_select",
  CUSTOM_TEXTAREA = "custom_textarea",
  UNKNOWN = "unknown",
}

/**
 * Supported ATS platforms.
 */
export enum ATSPlatform {
  GREENHOUSE = "greenhouse",
  LEVER = "lever",
  GENERIC = "generic",
  UNKNOWN = "unknown",
}

/**
 * The type of HTML element a discovered field wraps.
 */
export type FieldInputType = "input" | "select" | "textarea" | "file";

/**
 * A form field discovered on the page, before matching to a profile field.
 */
export interface DiscoveredField {
  /** The actual DOM element */
  element: HTMLElement;
  /** What kind of input element this is */
  inputType: FieldInputType;
  /** The classified field type */
  fieldType: FieldType;
  /** Confidence score 0.0–1.0 for the classification */
  confidence: number;
  /** The label text found for this field (if any) */
  labelText: string | null;
  /** The raw attributes collected for debugging */
  attributes: FieldAttributes;
}

/**
 * Raw HTML attributes collected from a form field for classification.
 */
export interface FieldAttributes {
  name: string | null;
  id: string | null;
  type: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  autocomplete: string | null;
}

/**
 * Result of attempting to autofill a single field.
 */
export interface FieldFillResult {
  fieldType: FieldType;
  success: boolean;
  /** The value that was set (or attempted) */
  valueFilled: string | null;
  /** If failed, the reason */
  error?: string;
}

/**
 * Aggregate result of an autofill operation.
 */
export interface AutofillResult {
  platform: ATSPlatform;
  totalFieldsDetected: number;
  fieldsFilled: number;
  fieldsSkipped: number;
  fieldsFailed: number;
  details: FieldFillResult[];
  timestamp: string;
}
