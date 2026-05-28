import { z } from "zod";

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Zod schema for the user profile.
 * Used for runtime validation of stored data and migration safety.
 */
export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),

  personal: z.object({
    firstName: z.string().default(""),
    lastName: z.string().default(""),
    email: z.string().default(""),
    phone: z.string().default(""),
    location: z.string().default(""),
    city: z.string().default(""),
    state: z.string().default(""),
    country: z.string().default(""),
    nationality: z.string().default(""),
  }),

  professional: z.object({
    currentCompany: z.string().default(""),
    currentTitle: z.string().default(""),
    currentSalary: z.string().default(""),
    yearsOfExperience: z.string().default(""),
    linkedinUrl: z.string().default(""),
    githubUrl: z.string().default(""),
    portfolioUrl: z.string().default(""),
    websiteUrl: z.string().default(""),
  }),

  preferences: z.object({
    salaryExpectation: z.string().default(""),
    noticePeriod: z.string().default(""),
    workAuthorization: z.string().default(""),
    sponsorshipNeeded: z.string().default(""),
  }),

  demographics: z.object({
    gender: z.string().default(""),
    ethnicity: z.string().default(""),
    veteranStatus: z.string().default(""),
    disabilityStatus: z.string().default(""),
  }),

  customFields: z.record(z.string(), z.string()).default({}),

  /** Plain text content of the user's resume, used for AI-powered field answering */
  resumeText: z.string().default(""),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * Creates a blank profile with all defaults.
 */
export function createEmptyProfile(): UserProfile {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    version: CURRENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    personal: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      location: "",
      city: "",
      state: "",
      country: "",
      nationality: "",
    },
    professional: {
      currentCompany: "",
      currentTitle: "",
      currentSalary: "",
      yearsOfExperience: "",
      linkedinUrl: "",
      githubUrl: "",
      portfolioUrl: "",
      websiteUrl: "",
    },
    preferences: {
      salaryExpectation: "",
      noticePeriod: "",
      workAuthorization: "",
      sponsorshipNeeded: "",
    },
    demographics: {
      gender: "",
      ethnicity: "",
      veteranStatus: "",
      disabilityStatus: "",
    },
    customFields: {},
    resumeText: "",
  };
}

/**
 * Validates and parses stored profile data.
 * Returns null if validation fails (triggers re-creation).
 */
export function parseStoredProfile(data: unknown): UserProfile | null {
  const result = UserProfileSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn("[applyfill] Profile validation failed:", result.error.issues);
  return null;
}
