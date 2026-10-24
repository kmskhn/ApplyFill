Project rules (details in README "Rules it follows"):

- Free only: every feature must work on free tiers that need no payment details. No paid APIs, no server.
- The extension never submits a form.
- Sensitive questions (gender, race, disability, ...) never go to AI.
- Consent boxes are never ticked.
- Email, phone and address never go to AI.
- No LinkedIn.
- No API keys, resumes or backups in git: run `npm run check-secrets` before every commit.
