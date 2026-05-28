import { describe, it, expect } from "vitest";
import { FieldType } from "@applyfill/shared";
import { classifyField } from "../label-matcher";

/**
 * Tests for the label matcher — the core intelligence of field detection.
 * Each test verifies that common label variations correctly classify.
 */

const emptyAttrs = {
  name: null,
  id: null,
  type: null,
  placeholder: null,
  ariaLabel: null,
  autocomplete: null,
};

describe("classifyField — label text matching", () => {
  const cases: Array<[string, FieldType]> = [
    // Personal
    ["First Name", FieldType.FIRST_NAME],
    ["first name", FieldType.FIRST_NAME],
    ["FirstName", FieldType.FIRST_NAME],
    ["Given Name", FieldType.FIRST_NAME],
    ["Last Name", FieldType.LAST_NAME],
    ["Family Name", FieldType.LAST_NAME],
    ["Surname", FieldType.LAST_NAME],
    ["Full Name", FieldType.FULL_NAME],
    ["Name", FieldType.FULL_NAME],
    ["Your Name", FieldType.FULL_NAME],
    ["Email", FieldType.EMAIL],
    ["E-mail", FieldType.EMAIL],
    ["Email Address", FieldType.EMAIL],
    ["Phone", FieldType.PHONE],
    ["Phone Number", FieldType.PHONE],
    ["Mobile Number", FieldType.PHONE],
    ["Contact Number", FieldType.PHONE],

    // Professional
    ["LinkedIn", FieldType.LINKEDIN_URL],
    ["LinkedIn URL", FieldType.LINKEDIN_URL],
    ["GitHub", FieldType.GITHUB_URL],
    ["Portfolio", FieldType.PORTFOLIO_URL],
    ["Website", FieldType.WEBSITE_URL],
    ["Personal Website", FieldType.WEBSITE_URL],
    ["Company", FieldType.CURRENT_COMPANY],
    ["Current Company", FieldType.CURRENT_COMPANY],
    ["Current Title", FieldType.CURRENT_TITLE],
    ["Job Title", FieldType.CURRENT_TITLE],
    ["Years of Experience", FieldType.YEARS_EXPERIENCE],

    // Preferences
    ["Salary Expectation", FieldType.SALARY_EXPECTATION],
    ["Desired Compensation", FieldType.SALARY_EXPECTATION],
    ["Are you authorized to work", FieldType.WORK_AUTHORIZATION],
    ["Work Authorization", FieldType.WORK_AUTHORIZATION],
    ["Do you require visa sponsorship", FieldType.SPONSORSHIP_NEEDED],
    ["Sponsorship", FieldType.SPONSORSHIP_NEEDED],

    // Location
    ["Location", FieldType.LOCATION],
    ["Current Location", FieldType.LOCATION],
    ["City", FieldType.CITY],
    ["State", FieldType.STATE],
    ["Country", FieldType.COUNTRY],

    // Demographics
    ["Gender", FieldType.GENDER],
    ["Race/Ethnicity", FieldType.ETHNICITY],
    ["Veteran Status", FieldType.VETERAN_STATUS],
    ["Disability", FieldType.DISABILITY_STATUS],
  ];

  for (const [label, expected] of cases) {
    it(`classifies "${label}" as ${expected}`, () => {
      const result = classifyField(label, emptyAttrs);
      expect(result.fieldType).toBe(expected);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });
  }
});

describe("classifyField — label text with noise", () => {
  it("handles trailing asterisks (required fields)", () => {
    const result = classifyField("First Name *", emptyAttrs);
    expect(result.fieldType).toBe(FieldType.FIRST_NAME);
  });

  it("handles trailing colons", () => {
    const result = classifyField("Email:", emptyAttrs);
    expect(result.fieldType).toBe(FieldType.EMAIL);
  });

  it("handles extra whitespace", () => {
    const result = classifyField("  Phone   Number  ", emptyAttrs);
    expect(result.fieldType).toBe(FieldType.PHONE);
  });
});

describe("classifyField — attribute fallbacks", () => {
  it("falls back to name attribute when no label", () => {
    const result = classifyField(null, { ...emptyAttrs, name: "first_name" });
    expect(result.fieldType).toBe(FieldType.FIRST_NAME);
    expect(result.confidence).toBe(0.8);
  });

  it("falls back to id attribute", () => {
    const result = classifyField(null, { ...emptyAttrs, id: "applicant_email" });
    expect(result.fieldType).toBe(FieldType.EMAIL);
    expect(result.confidence).toBe(0.7);
  });

  it("falls back to type attribute", () => {
    const result = classifyField(null, { ...emptyAttrs, type: "email" });
    expect(result.fieldType).toBe(FieldType.EMAIL);
    expect(result.confidence).toBe(0.6);
  });

  it("falls back to placeholder", () => {
    const result = classifyField(null, { ...emptyAttrs, placeholder: "Enter your phone number" });
    expect(result.fieldType).toBe(FieldType.PHONE);
    expect(result.confidence).toBe(0.5);
  });

  it("falls back to autocomplete", () => {
    const result = classifyField(null, { ...emptyAttrs, autocomplete: "given-name" });
    expect(result.fieldType).toBe(FieldType.FIRST_NAME);
    expect(result.confidence).toBe(0.6);
  });
});

describe("classifyField — unknown fields", () => {
  it("returns UNKNOWN for unrecognized labels", () => {
    const result = classifyField("What is your spirit animal?", emptyAttrs);
    expect(result.fieldType).toBe(FieldType.UNKNOWN);
    expect(result.confidence).toBe(0);
  });

  it("returns UNKNOWN when no signals available", () => {
    const result = classifyField(null, emptyAttrs);
    expect(result.fieldType).toBe(FieldType.UNKNOWN);
    expect(result.confidence).toBe(0);
  });
});

describe("classifyField — priority ordering", () => {
  it("prefers label text over attribute when both available", () => {
    // Label says "Phone" but name attr says "email" — label should win
    const result = classifyField("Phone Number", { ...emptyAttrs, name: "email" });
    expect(result.fieldType).toBe(FieldType.PHONE);
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });
});
