# ⚡ ApplyFill

> AI-powered Chrome extension that auto-fills job application forms in one click — using your profile data and resume.

---

## What It Does

ApplyFill sits as a floating button on any job application page. When you click **Fill Application**, it:

1. **Scans** all form fields on the page (inputs, dropdowns, radio buttons, React Select, custom components)
2. **Analyzes** every field using AI (Gemini 2.0 Flash) with your full profile + resume text as context
3. **Shows a review screen** with every proposed value — you can edit anything before committing
4. **Fills** all fields at once, including tricky custom dropdowns and screening questions

Fields it handles automatically from your profile: name, email, phone, city, country, nationality, current title, current company, current salary, expected salary, notice period, LinkedIn, GitHub, work authorization, and more.

Fields it answers from your resume via AI: open-ended screening questions, skill assessments (e.g. "Are you expert in X?"), years of experience in specific areas, cover letter prompts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension framework | [Plasmo](https://www.plasmo.com/) |
| UI | React + Shadow DOM (isolated CSS) |
| Storage | `@plasmohq/storage` (Chrome local storage) |
| AI | Google Gemini 2.0 Flash REST API |
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript (strict) |
| Validation | Zod |

---

## Project Structure

```
applyfill/
├── apps/
│   ├── extension/          # Chrome extension (Plasmo)
│   │   └── src/
│   │       ├── popup/      # Extension popup (Profile, Settings, Resume tabs)
│   │       ├── contents/   # Content scripts injected into web pages
│   │       └── background/ # Service worker (Gemini API proxy)
│   └── web/                # (Future) Landing page
│
└── packages/
    ├── shared/             # Types, constants, profile schema (Zod)
    │   └── src/
    │       ├── types/      # UserProfile, FieldType, UserSettings
    │       └── constants/  # Field label patterns, name→FieldType maps
    │
    ├── ats-engine/         # Form detection & autofill logic
    │   └── src/
    │       ├── detector/   # Discovers & classifies form fields
    │       ├── matchers/   # Label text → FieldType classification
    │       ├── autofill/   # Value filling, React Select, radio buttons, AI answerer
    │       └── adapters/   # Per-platform form root detection (Greenhouse, Lever, Generic)
    │
    └── ui/                 # Shared React component library (Card, Input, etc.)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Google Chrome

### Install dependencies

```bash
pnpm install
```

### Run in development mode

```bash
pnpm dev
```

This starts the Plasmo dev server with hot reload. Load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select `apps/extension/.plasmo/chrome-mv3-dev` (created after first `pnpm dev`)

### Build for production

```bash
pnpm build
```

Output is at `apps/extension/.plasmo/chrome-mv3-prod`.

---

## Configuration

### Profile Setup

Click the extension icon → **Profile** tab. Fill in:

| Section | Fields |
|---|---|
| **Personal** | First/Last Name, Email, Phone, City, Country, Nationality, Location |
| **Professional** | Current Company, Current Title, Current Salary/CTC, Years of Experience, LinkedIn, GitHub, Portfolio |
| **Preferences** | Expected Salary, Notice Period, Work Authorization, Visa Sponsorship |
| **Demographics** | Gender, Ethnicity, Veteran Status, Disability Status (EEO fields) |

### AI Setup (optional but recommended)

1. Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com/app/apikey)
2. Click the extension icon → **Settings** tab
3. Paste your API key and enable AI
4. Click the extension icon → **Resume** tab → paste your resume text

With AI enabled, the extension answers open-ended screening questions (e.g. "Why do you want this role?", "Are you expert in Laravel?") using your resume.

---

## How Field Detection Works

The `ats-engine` uses a multi-signal classification pipeline:

```
HTML Element
    │
    ├─ Label text    → LABEL_PATTERNS regex match (confidence: 0.85–1.0)
    ├─ name attr     → NAME_ATTRIBUTE_PATTERNS match (confidence: 0.80)
    ├─ id attr       → Same as name patterns (confidence: 0.70)
    ├─ type attr     → TYPE_ATTRIBUTE_MAP (confidence: 0.60)
    ├─ placeholder   → Label text matching (confidence: 0.50)
    └─ autocomplete  → Autocomplete value map (confidence: 0.60)
        │
        └─ → FieldType (FIRST_NAME, EMAIL, PHONE, SALARY_EXPECTATION, ...)
```

**Label resolution strategies** (in order of priority):
1. `<label for="id">` — explicit association
2. Ancestor `<label>` wrapping the input
3. `aria-labelledby` reference
4. `aria-label` attribute
5. **Shared field container** — walks up to `[data-slot="field"]`, `[role="group"]`, `.form-group` etc. and finds a label within (handles modern design systems like Astralis/jisr.net)
6. Preceding sibling text

**Special element support:**
- React Select / headless UI comboboxes (`input[role="combobox"]`) — types value then clicks matching option
- Radix UI radio button groups (`[role="radiogroup"]`) — clicks the matching `[role="radio"]` button
- Native `<select>` — fuzzy option matching (6 fallback strategies)

---

## AI Integration

When you click Fill Application with AI enabled:

1. All detected fields are sent to Gemini 2.0 Flash in a single API call
2. The prompt includes:
   - Your full structured profile (name, nationality, salary, etc.)
   - Your resume text
   - The page URL/title for job context
   - For select/radio fields: the actual available options
3. Gemini returns values for every field it can answer
4. Profile values take precedence over AI for factual fields (name, email, phone)
5. AI fills open-ended questions, skill assessments, and fields not in your profile

The Gemini API call is routed through the **background service worker** to avoid CORS restrictions in content scripts.

---

## Supported ATS Platforms

| Platform | Status |
|---|---|
| Greenhouse | ✅ Full support |
| Lever | ✅ Full support |
| Jisr (jisr.net) | ✅ Tested |
| Generic (any site) | ✅ Best-effort |
| Workday | 🔜 Planned |
| SmartRecruiters | 🔜 Planned |

---

## Development

### Package scripts

```bash
pnpm dev          # Start all packages in watch mode
pnpm build        # Build all packages
pnpm lint         # Run ESLint across all packages
pnpm typecheck    # Run tsc --noEmit across all packages
```

### Adding a new field type

1. Add the enum value to `packages/shared/src/types/ats.ts` → `FieldType`
2. Add label patterns to `packages/shared/src/constants/field-labels.ts` → `LABEL_PATTERNS`
3. Add name/id patterns to `packages/shared/src/constants/field-labels.ts` → `NAME_ATTRIBUTE_PATTERNS`
4. Map it to a profile value in `packages/shared/src/constants/field-map.ts` → `getProfileValue()`
5. If it needs a new profile field, add it to the Zod schema in `packages/shared/src/types/profile.ts`

### Adding a new ATS adapter

Create `packages/ats-engine/src/adapters/myplatform.ts` implementing `ATSAdapter`:

```typescript
export const myPlatformAdapter: ATSAdapter = {
  id: ATSPlatform.MY_PLATFORM,
  name: "My Platform",
  isApplicationPage: (doc) => /myplatform\.com\/jobs\/apply/.test(doc.URL),
  getFormRoot: (doc) => doc.querySelector("form#application-form"),
  discoverFields: (root) => discoverFields(root),
};
```

Then register it in `packages/ats-engine/src/adapters/registry.ts`.

---

## Privacy

- All data stays **local to your browser** (Chrome local storage)
- Your profile and resume are **never sent to any server** except Gemini when answering AI fields
- The Gemini API call includes only: field labels, your profile data, and resume text
- No analytics, no tracking, no account required

---

## License

MIT
