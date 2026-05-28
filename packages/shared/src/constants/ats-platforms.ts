import { ATSPlatform } from "../types/ats";

/**
 * URL patterns for each ATS platform.
 * Used by both the platform detector and the manifest content_scripts matches.
 */
export const ATS_URL_PATTERNS: Record<ATSPlatform, RegExp[]> = {
  [ATSPlatform.GREENHOUSE]: [
    /^https:\/\/boards\.greenhouse\.io\//,
    /^https:\/\/job-boards\.greenhouse\.io\//,
    /^https:\/\/[^/]+\.greenhouse\.io\/.*\/jobs\//,
  ],
  [ATSPlatform.LEVER]: [
    /^https:\/\/jobs\.lever\.co\//,
  ],
  [ATSPlatform.GENERIC]: [
    // Matches all https pages — used as a generic fallback
    /^https?:\/\//,
  ],
  [ATSPlatform.UNKNOWN]: [],
};

/**
 * Manifest-compatible URL match patterns for content script injection.
 * Run on all HTTPS pages so the generic adapter can work anywhere.
 */
export const CONTENT_SCRIPT_MATCHES = [
  "https://*/*",
  "http://*/*",
];
