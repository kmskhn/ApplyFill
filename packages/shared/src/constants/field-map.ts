import type { UserProfile } from "../types/profile";
import { FieldType } from "../types/ats";

/**
 * Maps canonical FieldType to the corresponding UserProfile path.
 * Used by the autofill engine to look up values from the profile.
 */
export function getProfileValue(profile: UserProfile, fieldType: FieldType): string | null {
  switch (fieldType) {
    // Personal
    case FieldType.FIRST_NAME:
      return profile.personal.firstName || null;
    case FieldType.LAST_NAME:
      return profile.personal.lastName || null;
    case FieldType.FULL_NAME:
      return [profile.personal.firstName, profile.personal.lastName].filter(Boolean).join(" ") || null;
    case FieldType.EMAIL:
      return profile.personal.email || null;
    case FieldType.PHONE:
      return profile.personal.phone || null;
    case FieldType.LOCATION:
      return profile.personal.location || null;
    case FieldType.ADDRESS:
      // Address maps to location — most users store their city/region as location
      return profile.personal.location || null;
    case FieldType.CITY:
      return profile.personal.city || null;
    case FieldType.STATE:
      return profile.personal.state || null;
    case FieldType.COUNTRY:
      return profile.personal.country || null;
    case FieldType.NATIONALITY:
      // Nationality falls back to country if not set separately
      return profile.personal.nationality || profile.personal.country || null;

    // Professional
    case FieldType.LINKEDIN_URL:
      return profile.professional.linkedinUrl || null;
    case FieldType.GITHUB_URL:
      return profile.professional.githubUrl || null;
    case FieldType.PORTFOLIO_URL:
      return profile.professional.portfolioUrl || null;
    case FieldType.WEBSITE_URL:
      return profile.professional.websiteUrl || null;
    case FieldType.CURRENT_COMPANY:
      return profile.professional.currentCompany || null;
    case FieldType.CURRENT_TITLE:
      return profile.professional.currentTitle || null;
    case FieldType.CURRENT_SALARY:
      return profile.professional.currentSalary || null;
    case FieldType.YEARS_EXPERIENCE:
      return profile.professional.yearsOfExperience || null;

    // Preferences
    case FieldType.SALARY_EXPECTATION:
      return profile.preferences.salaryExpectation || null;
    case FieldType.NOTICE_PERIOD:
      return profile.preferences.noticePeriod || null;
    case FieldType.WORK_AUTHORIZATION:
      return profile.preferences.workAuthorization || null;
    case FieldType.SPONSORSHIP_NEEDED:
      return profile.preferences.sponsorshipNeeded || null;

    // Demographics
    case FieldType.GENDER:
      return profile.demographics.gender || null;
    case FieldType.ETHNICITY:
      return profile.demographics.ethnicity || null;
    case FieldType.VETERAN_STATUS:
      return profile.demographics.veteranStatus || null;
    case FieldType.DISABILITY_STATUS:
      return profile.demographics.disabilityStatus || null;

    case FieldType.RESUME:
    case FieldType.COVER_LETTER:
    case FieldType.CUSTOM_TEXT:
    case FieldType.CUSTOM_SELECT:
    case FieldType.CUSTOM_TEXTAREA:
    case FieldType.UNKNOWN:
      return null;
  }
}

/**
 * Storage keys used across the extension.
 */
export const STORAGE_KEYS = {
  PROFILE: "user_profile",
  SETTINGS: "user_settings",
  LAST_FILL_RESULT: "last_fill_result",
  RESUME_TEXT: "resume_text",
} as const;
