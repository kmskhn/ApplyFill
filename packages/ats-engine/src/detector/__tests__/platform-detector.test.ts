import { describe, it, expect } from "vitest";
import { ATSPlatform } from "@applyfill/shared";
import { detectPlatform } from "../platform-detector";

describe("detectPlatform", () => {
  it("detects Greenhouse from boards.greenhouse.io", () => {
    expect(detectPlatform("https://boards.greenhouse.io/acme/jobs/123")).toBe(
      ATSPlatform.GREENHOUSE,
    );
  });

  it("detects Greenhouse from job-boards.greenhouse.io", () => {
    expect(detectPlatform("https://job-boards.greenhouse.io/acme/jobs/456")).toBe(
      ATSPlatform.GREENHOUSE,
    );
  });

  it("detects Greenhouse from custom subdomain", () => {
    expect(detectPlatform("https://acme.greenhouse.io/embed/jobs/789")).toBe(
      ATSPlatform.GREENHOUSE,
    );
  });

  it("detects Lever from jobs.lever.co", () => {
    expect(detectPlatform("https://jobs.lever.co/acme/abc-123")).toBe(ATSPlatform.LEVER);
  });

  it("returns UNKNOWN for non-ATS URLs", () => {
    expect(detectPlatform("https://google.com")).toBe(ATSPlatform.UNKNOWN);
    expect(detectPlatform("https://linkedin.com/jobs")).toBe(ATSPlatform.UNKNOWN);
  });
});
