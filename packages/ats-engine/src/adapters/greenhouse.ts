import { ATSPlatform, ATS_URL_PATTERNS } from "@applyfill/shared";
import { BaseAdapter } from "./base-adapter";

/**
 * Greenhouse ATS adapter.
 *
 * Greenhouse application forms are typically at:
 * - boards.greenhouse.io/{company}/jobs/{id}
 * - job-boards.greenhouse.io/{company}/jobs/{id}
 * - {company}.greenhouse.io/embed/job_app?token={id}
 *
 * The form root is usually an element with id="application" or
 * a <form> element within the page.
 */
export class GreenhouseAdapter extends BaseAdapter {
  readonly id = ATSPlatform.GREENHOUSE;
  readonly name = "Greenhouse";
  readonly urlPatterns = ATS_URL_PATTERNS[ATSPlatform.GREENHOUSE];

  isApplicationPage(doc: Document): boolean {
    // Greenhouse application pages have an application form or the #application div
    return !!(
      doc.querySelector("#application") ||
      doc.querySelector("#application_form") ||
      doc.querySelector('form[action*="applications"]') ||
      doc.querySelector('[data-controller="application"]')
    );
  }

  getFormRoot(doc: Document): Element | null {
    // Priority order: specific application containers, then generic form
    return (
      doc.querySelector("#application") ||
      doc.querySelector("#application_form") ||
      doc.querySelector('form[action*="applications"]') ||
      doc.querySelector("form") ||
      doc.querySelector("main") ||
      doc.body
    );
  }
}
