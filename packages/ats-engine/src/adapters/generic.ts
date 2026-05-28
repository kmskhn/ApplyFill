import { ATSPlatform, ATS_URL_PATTERNS } from "@applyfill/shared";
import { BaseAdapter } from "./base-adapter";

/**
 * Generic fallback adapter for any job application form.
 *
 * Works on any website — uses heuristics to detect if the current page
 * looks like a job application form (has relevant inputs, form elements, etc.)
 * and falls back to full-document field discovery.
 *
 * Handles:
 * - Standard HTML <form> elements
 * - Div-based forms (Tesla TDS, Workday, etc.) with name-attributed inputs
 * - Multi-step applications (detects first visible step)
 */
export class GenericAdapter extends BaseAdapter {
  readonly id = ATSPlatform.GENERIC;
  readonly name = "Generic";
  readonly urlPatterns = ATS_URL_PATTERNS[ATSPlatform.GENERIC];

  isApplicationPage(doc: Document): boolean {
    // 1. Classic: <form> with at least one user-fillable input
    const forms = Array.from(doc.querySelectorAll("form"));
    for (const form of forms) {
      const inputs = form.querySelectorAll(
        'input[type="text"], input[type="email"], input[type="tel"], textarea, select',
      );
      if (inputs.length >= 1) return true;
    }

    // 2. Div-based forms (Tesla TDS, Workday, Angular SPAs, etc.)
    // These don't use <form> tags but have div containers with fillable inputs
    // that have meaningful name attributes (e.g., name="personal.firstName")
    const namedInputs = doc.querySelectorAll(
      'input[name], textarea[name], select[name]',
    );
    const applicationNamePatterns = [
      /first.?name/i,
      /last.?name/i,
      /email/i,
      /phone/i,
      /address/i,
      /resume/i,
      /personal\./i,
      /applicant/i,
      /candidate/i,
    ];
    let namedMatchCount = 0;
    for (const el of namedInputs) {
      const name = el.getAttribute("name") ?? "";
      if (applicationNamePatterns.some((p) => p.test(name))) {
        namedMatchCount++;
      }
    }
    if (namedMatchCount >= 2) return true;

    // 3. Tesla TDS-specific: .tds-form-layout or .tds-form-fieldset
    if (
      doc.querySelector(".tds-form-layout, .tds-form-fieldset, .tds-form-item")
    ) {
      const tdsInputs = doc.querySelectorAll(".tds-form-input-text, .tds-form-input input");
      if (tdsInputs.length >= 1) return true;
    }

    // 4. Fallback: multiple labeled inputs that look like an application form
    const standaloneInputs = doc.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], textarea',
    );
    return standaloneInputs.length >= 3;
  }

  getFormRoot(doc: Document): Element | null {
    // Tesla TDS: prefer the application step container
    const tdsForm = doc.querySelector(
      ".tds-form-layout, [class*='step--'], .tds-form-fieldset",
    );
    if (tdsForm) return tdsForm;

    // Prefer the form with the most text inputs (likely the application form)
    const forms = Array.from(doc.querySelectorAll("form"));
    if (forms.length > 0) {
      const scored = forms
        .map((form) => ({
          form,
          score: form.querySelectorAll(
            'input[type="text"], input[type="email"], input[type="tel"], textarea, select',
          ).length,
        }))
        .sort((a, b) => b.score - a.score);

      if (scored[0] && scored[0].score > 0) return scored[0].form;
    }

    // Fallback: main content area or body
    return doc.querySelector("main") || doc.querySelector('[role="main"]') || doc.body;
  }
}
