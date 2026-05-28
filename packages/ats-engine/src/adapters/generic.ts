import { ATSPlatform, ATS_URL_PATTERNS } from "@applyfill/shared";
import { BaseAdapter } from "./base-adapter";

/**
 * Generic fallback adapter for any job application form.
 *
 * Works on any website — uses heuristics to detect if the current page
 * looks like a job application form (has relevant inputs, form elements, etc.)
 * and falls back to full-document field discovery.
 */
export class GenericAdapter extends BaseAdapter {
  readonly id = ATSPlatform.GENERIC;
  readonly name = "Generic";
  readonly urlPatterns = ATS_URL_PATTERNS[ATSPlatform.GENERIC];

  isApplicationPage(doc: Document): boolean {
    // Consider any page with a <form> that has at least one text input an application page.
    const forms = Array.from(doc.querySelectorAll("form"));
    for (const form of forms) {
      const inputs = form.querySelectorAll(
        'input[type="text"], input[type="email"], input[type="tel"], textarea, select'
      );
      if (inputs.length >= 1) return true;
    }

    // Also accept pages that have relevant labeled inputs even without a <form> wrapper
    const standaloneInputs = doc.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], textarea'
    );
    return standaloneInputs.length >= 2;
  }

  getFormRoot(doc: Document): Element | null {
    // Prefer the form with the most text inputs (likely the application form)
    const forms = Array.from(doc.querySelectorAll("form"));
    if (forms.length > 0) {
      const scored = forms
        .map((form) => ({
          form,
          score: form.querySelectorAll(
            'input[type="text"], input[type="email"], input[type="tel"], textarea, select'
          ).length,
        }))
        .sort((a, b) => b.score - a.score);

      if (scored[0] && scored[0].score > 0) return scored[0].form;
    }

    // Fallback: main content area or body
    return doc.querySelector("main") || doc.querySelector('[role="main"]') || doc.body;
  }
}
