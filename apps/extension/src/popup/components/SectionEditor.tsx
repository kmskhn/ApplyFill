import React from "react";
import type { UserProfile } from "@applyfill/shared";
import { Card } from "@applyfill/ui";
import { Input } from "@applyfill/ui";

interface SectionEditorProps {
  title: string;
  /** The profile section data object */
  data: Record<string, string>;
  /** Field definitions: key → label mapping */
  fields: Array<{ key: string; label: string; type?: string; placeholder?: string }>;
  /** Called when any field changes */
  onChange: (key: string, value: string) => void;
  /** Whether this section starts collapsed */
  defaultOpen?: boolean;
}

/**
 * Renders an editable card for a profile section.
 * Fields are laid out in a two-column grid where appropriate.
 */
export function SectionEditor({
  title,
  data,
  fields,
  onChange,
  defaultOpen = true,
}: SectionEditorProps) {
  return (
    <Card title={title} collapsible defaultOpen={defaultOpen}>
      <div className="af-section-fields">
        {fields.map((field) => (
          <Input
            key={field.key}
            label={field.label}
            type={field.type || "text"}
            placeholder={field.placeholder || ""}
            value={data[field.key] || ""}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        ))}
      </div>
    </Card>
  );
}

/** Field definitions for each profile section */
export const PERSONAL_FIELDS = [
  { key: "firstName", label: "First Name", placeholder: "Jane" },
  { key: "lastName", label: "Last Name", placeholder: "Doe" },
  { key: "email", label: "Email", type: "email", placeholder: "jane@example.com" },
  { key: "phone", label: "Phone", type: "tel", placeholder: "+966 55 123 4567" },
  { key: "location", label: "Location", placeholder: "Riyadh, Saudi Arabia" },
  { key: "city", label: "City", placeholder: "Riyadh" },
  { key: "state", label: "State/Province", placeholder: "Riyadh Region" },
  { key: "country", label: "Country", placeholder: "Saudi Arabia" },
  { key: "nationality", label: "Nationality", placeholder: "Saudi" },
];

export const PROFESSIONAL_FIELDS = [
  { key: "currentCompany", label: "Current Company", placeholder: "Acme Corp" },
  { key: "currentTitle", label: "Current Title", placeholder: "Senior Software Engineer" },
  { key: "currentSalary", label: "Current Salary / CTC", placeholder: "e.g. 18 LPA or $120,000" },
  { key: "yearsOfExperience", label: "Years of Experience", placeholder: "5" },
  { key: "linkedinUrl", label: "LinkedIn URL", type: "url", placeholder: "https://linkedin.com/in/janedoe" },
  { key: "githubUrl", label: "GitHub URL", type: "url", placeholder: "https://github.com/janedoe" },
  { key: "portfolioUrl", label: "Portfolio URL", type: "url", placeholder: "https://janedoe.dev" },
  { key: "websiteUrl", label: "Website URL", type: "url", placeholder: "https://janedoe.com" },
];

export const PREFERENCES_FIELDS = [
  { key: "salaryExpectation", label: "Expected Salary", placeholder: "$150,000" },
  { key: "noticePeriod", label: "Notice Period", placeholder: "1 month" },
  { key: "workAuthorization", label: "Work Authorization", placeholder: "Yes" },
  { key: "sponsorshipNeeded", label: "Visa Sponsorship Needed", placeholder: "No" },
];

export const DEMOGRAPHICS_FIELDS = [
  { key: "gender", label: "Gender", placeholder: "Prefer not to say" },
  { key: "ethnicity", label: "Race/Ethnicity", placeholder: "Prefer not to say" },
  { key: "veteranStatus", label: "Veteran Status", placeholder: "I am not a protected veteran" },
  { key: "disabilityStatus", label: "Disability Status", placeholder: "I don't wish to answer" },
];
