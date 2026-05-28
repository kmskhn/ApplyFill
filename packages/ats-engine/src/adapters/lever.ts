import { ATSPlatform, ATS_URL_PATTERNS } from "@applyfill/shared";
import { BaseAdapter } from "./base-adapter";

/**
 * Lever ATS adapter.
 *
 * Lever application forms are at:
 * - jobs.lever.co/{company}/{jobId}/apply
 * - jobs.lever.co/{company}/{jobId}
 *
 * Lever forms are relatively consistent: they use a posting-page
 * layout with a main application form.
 */
export class LeverAdapter extends BaseAdapter {
  readonly id = ATSPlatform.LEVER;
  readonly name = "Lever";
  readonly urlPatterns = ATS_URL_PATTERNS[ATSPlatform.LEVER];

  isApplicationPage(doc: Document): boolean {
    // Lever application pages have an application form container
    return !!(
      doc.querySelector(".application-form") ||
      doc.querySelector('[class*="application"]') ||
      doc.querySelector(".postings-btn-wrapper") ||
      doc.querySelector('form[action*="applications"]') ||
      // Lever uses a specific page structure with posting content
      doc.querySelector(".posting-page")
    );
  }

  getFormRoot(doc: Document): Element | null {
    return (
      doc.querySelector(".application-form") ||
      doc.querySelector('[class*="application-form"]') ||
      doc.querySelector("form") ||
      doc.querySelector(".posting-page") ||
      doc.querySelector("main") ||
      doc.body
    );
  }
}
