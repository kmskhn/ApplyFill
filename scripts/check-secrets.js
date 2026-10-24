#!/usr/bin/env node
/*
 * Run before every commit: npm run check-secrets
 * Fails when a file that git would commit holds an API key, a private key, a resume PDF or an
 * ApplyFill backup (backups hold your profile and resume).
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");

const PATTERNS = [
  ["Google / Gemini API key", /AIza[0-9A-Za-z_-]{35}/],
  ["OpenRouter key", /sk-or-v1-[0-9a-f]{20,}/],
  ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI-style key", /\bsk-(proj-)?[A-Za-z0-9_-]{32,}/],
  ["Groq key", /\bgsk_[A-Za-z0-9]{20,}/],
  ["GitHub token", /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["ApplyFill backup", /"app":\s*"applyfill"/],
];

const BAD_FILES = [
  [/(^|\/)\.env(\.|$)/, ".env file"],
  [/\.pdf$/i, "PDF (resume?)"],
  [/\.(pem|key|p12|pfx)$/i, "key file"],
];

// Everything git would commit: tracked, staged and new files not ignored.
const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => fs.existsSync(file) && !file.startsWith("node_modules/"));

const problems = [];

for (const file of files) {
  for (const [pattern, what] of BAD_FILES) if (pattern.test(file)) problems.push(`${file}: ${what}`);

  const text = fs.readFileSync(file, "utf8");

  if (file === "scripts/check-secrets.js") continue;

  for (const [what, pattern] of PATTERNS) if (pattern.test(text)) problems.push(`${file}: ${what}`);
}

if (problems.length) {
  console.error(`Do not commit. Found:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

console.log(`OK: no keys or private files in ${files.length} files.`);
