import { z } from "zod";
import { ATSPlatform } from "./ats";

/**
 * User settings schema.
 * Phase 1: per-ATS enable/disable toggle only.
 */
export const UserSettingsSchema = z.object({
  /** Whether autofill is enabled per ATS platform */
  enabledPlatforms: z
    .object({
      [ATSPlatform.GREENHOUSE]: z.boolean().default(true),
      [ATSPlatform.LEVER]: z.boolean().default(true),
      [ATSPlatform.GENERIC]: z.boolean().default(true),
    })
    .default({ greenhouse: true, lever: true, generic: true }),

  /** AI-powered answering settings */
  aiEnabled: z.boolean().default(false),
  geminiApiKey: z.string().default(""),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

/**
 * Default settings — all platforms enabled.
 */
export const DEFAULT_SETTINGS: UserSettings = {
  enabledPlatforms: {
    [ATSPlatform.GREENHOUSE]: true,
    [ATSPlatform.LEVER]: true,
    [ATSPlatform.GENERIC]: true,
  },
  aiEnabled: false,
  geminiApiKey: "",
};

/**
 * Validates and parses stored settings.
 * Falls back to defaults on validation failure.
 */
export function parseStoredSettings(data: unknown): UserSettings {
  const result = UserSettingsSchema.safeParse(data);
  if (result.success) return result.data;
  console.warn("[applyfill] Settings validation failed, using defaults:", result.error.issues);
  return DEFAULT_SETTINGS;
}
