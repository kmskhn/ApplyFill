# ApplyFill

A Chrome extension that fills job application forms for you.

On a job's apply page, a **⚡ Fill** button shows up. Click it (or press **Alt+Shift+F**) and the form is filled from:

1. **your profile**: name, email, links, work rights, salary, ...
2. **answers you saved before**: the same question gets the same answer
3. **free AI** (Google Gemini) for new questions, written from your resume

You check the form and click Submit yourself. **ApplyFill never submits.**

It's free: no account, no server, no card. Your data stays in your browser.

## Colors

| Color | Meaning |
| --- | --- |
| green | from your profile or a saved answer |
| yellow | AI answer, or a legal question (sponsorship, work permit): check it |
| red | yours to do: consent boxes, personal questions without a saved answer, other files, or a field it couldn't fill |
| grey | you had already filled it: left as is |

## Where it works

- **Best:** Ashby, Greenhouse and Lever forms, all tested on live job pages.
- **Other sites:** fields with normal labels work. Custom widgets may need a hand.
- **Not supported:** LinkedIn (see "Rules" below).
- **Not tested:** Workday, and sites that make you log in or create an account first.

## Install

You need Google Chrome (or Edge, Brave, or another Chromium browser).

1. Download this repo: **Code → Download ZIP** on GitHub, then unzip it. Or run `git clone https://github.com/kmskhn/ApplyFill.git`.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the folder that holds `manifest.json`.
4. The ApplyFill settings page opens. Follow **Get started** there (next section).

To open the settings later, click the ApplyFill icon in the toolbar (pin it from the puzzle-piece menu).

## Set up (about 5 minutes)

1. **Get a free Gemini key**
   - Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey), sign in with a Google account, and click **Create API key**. No card is needed.
   - Paste it on the **AI** tab, click **Save**, then **Test AI**.
2. **Add your resume**
   - **Resume** tab → **Upload PDF**. ApplyFill attaches this file to "Resume/CV" fields.
   - Click **Read text from PDF with AI**. It reads the text the AI writes answers from, and fills the empty fields on the Profile tab.
3. **Check your profile**
   - **Profile** tab: fix anything wrong and fill in the rest. The work-rights fields matter most: sponsorship, the countries you can already work in, salary and notice period.
   - Click **Save**.
4. **Apply**
   - Open a job's apply page and click **⚡ Fill**.
   - Check everything yellow and red, then submit yourself.

### About the free AI

- One Fill click makes **at most 1 AI request**, and only when a question has no profile answer and no saved answer.
- Free Gemini allows about 20 requests a day per model, and ApplyFill moves through several models. For job applications, that's plenty.
- When the free limit is used up, the panel says so. Fill the rest by hand, or try again the next day.
- **OpenRouter** (optional, also free) is a fallback: add a key from [openrouter.ai/keys](https://openrouter.ai/keys) on the AI tab.
- If you use Gemini for other apps, create the ApplyFill key in a **new project**: free limits are per project.

## It learns your answers

- Change anything ApplyFill filled, then click **Save my answers** in the panel. Next time the same question fills from memory (green), with no AI.
- Submitting a form after Fill also saves your answers.
- Not saved:
  - profile facts (change those in settings)
  - consent boxes
  - files
- See, edit and delete saved answers on the **Saved answers** tab.

## Privacy

- Everything is stored only in your browser (`chrome.storage.local`): your profile, resume, saved answers and AI keys. There is no ApplyFill server.
- **Backup** tab: export everything except your AI keys to one JSON file, and import it on another computer.
- **Keep backup files private.** They hold your profile and resume.
- Nothing leaves the browser until you click Fill.
- When AI is needed, the AI gets:
  - your profile **without** email, phone, address, nationality, date of birth, or personal (EEO) answers
  - your resume text, with email addresses and phone numbers removed
  - the job page text
  - the questions
- Google's free Gemini tier may use prompts to improve its products. If that matters to you, don't add a key: ApplyFill still fills everything from your profile and saved answers.
- Exception: **Read text from PDF with AI** sends the whole PDF once, contact details included. To avoid that, paste your resume text yourself.

## Rules it follows

- **Never submits.** You always review and click Submit.
- **No LinkedIn.** LinkedIn's terms forbid automation, so the extension doesn't run there.
- **Personal questions never go to AI.** This covers gender, race, ethnicity, veteran status, disability, orientation, pronouns, religion, nationality, date of birth and criminal record.
  - Answers come only from your profile or your saved answers. Otherwise the field is left for you (red).
  - New profiles default to "Prefer not to say", which picks the site's decline option.
- **Consent boxes are never ticked**: "I agree", "I certify", privacy, GDPR, marketing. Not even from saved answers.
- **Legal yes/no questions come from your profile but show yellow.** These are sponsorship and right-to-work questions.
  - "Authorized to work in X?" is Yes only for countries listed in "Countries you can already work in".
  - A question that names no country is taken to mean the job's country. If you need sponsorship, the answer is "No".
- **Resume first.** The resume is uploaded before anything else, so the site's own resume reader can't overwrite the answers. ApplyFill waits until the page stops changing.
  - Ashby's "Autofill from resume" box is skipped.
- **Free only.** It uses Gemini's free tier, then OpenRouter's free models. A model that hits its daily limit is skipped until the limit resets.

## Troubleshooting

- **No Fill button.** The page may not look like a job form: it needs at least 4 fields and an email or file field, or a known job site. Press **Alt+Shift+F** instead. Also check "Hide the floating button" on the AI tab.
- **A field shows "Could not fill".** Some custom widgets block scripts. Fill it by hand; with **Save my answers**, the next time is usually green.
- **"AI key not accepted".** Copy the key again from AI Studio, then click **Save** and **Test AI**.
- **After you update the code:** on `chrome://extensions`, click the reload icon on ApplyFill, then reload the job page.

## For developers

Plain JavaScript, Manifest V3, no build step: edit a file, then reload the extension.

```
npm install
npm test               # jsdom tests against real Greenhouse and Lever form markup
npm run check-secrets  # run before every commit: fails on API keys, PDFs, .env and backup files
```

| File | Job |
| --- | --- |
| `content/detect.js` | decides if a page is a job form, shows the button, handles the shortcut |
| `content/scan.js` | reads fields: label, kind, options |
| `content/match.js` | picks the answer and its source (rules, consent list, personal list) |
| `content/memory.js` | saved answers |
| `content/fill.js` | puts values in (React-safe, typed dropdowns, place search boxes, resume upload) |
| `content/main.js` | one Fill click, start to end; "Save my answers" |
| `content/panel.js` | floating button and panel (shadow DOM) |
| `background.js`, `ai.js` | AI calls (Gemini, then OpenRouter) and checks of the AI's JSON |
| `options/` | settings page |

Gotchas found on live pages (Oct 2026), each with a test in `test/`:

- **Greenhouse dropdowns (react-select):** they open only on keys typed one character at a time, or on ArrowDown. Setting the value plus one input event is not enough.
- **Lever "Current location":** you must click a suggestion, or the box is cleared. ApplyFill types the city and picks the suggestion that names your country.
- **Ashby Yes/No buttons:** each has a hidden checkbox next to it, which is not a question. The chosen button shows only after React re-renders.
- **Gemini and bad keys:** Gemini answers a bad key with 400 "API key not valid", not 401.

Free model names are in `ai.js` (`MODELS`). If Google renames a model, edit the list. An unknown model is skipped for the day.
