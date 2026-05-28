import { ATSPlatform, ATS_URL_PATTERNS } from "@applyfill/shared";

/**
 * Detects which ATS platform the current URL belongs to.
 * Simple URL pattern matching — fast and deterministic.
 */
export function detectPlatform(url: string): ATSPlatform {
  for (const [platform, patterns] of Object.entries(ATS_URL_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        return platform as ATSPlatform;
      }
    }
  }
  return ATSPlatform.UNKNOWN;
}
