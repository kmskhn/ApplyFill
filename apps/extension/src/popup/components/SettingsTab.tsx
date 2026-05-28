import React, { useState } from "react";
import { ATSPlatform } from "@applyfill/shared";
import type { UserSettings } from "@applyfill/shared";

interface SettingsTabProps {
  settings: UserSettings;
  onTogglePlatform: (platform: ATSPlatform, enabled: boolean) => void;
  onUpdateSettings: (updates: Partial<UserSettings>) => void;
}

const PLATFORM_LABELS: Record<ATSPlatform, string> = {
  [ATSPlatform.GREENHOUSE]: "Greenhouse",
  [ATSPlatform.LEVER]: "Lever",
  [ATSPlatform.GENERIC]: "All Other Sites",
  [ATSPlatform.UNKNOWN]: "Unknown",
};

const PLATFORM_URLS: Record<ATSPlatform, string> = {
  [ATSPlatform.GREENHOUSE]: "boards.greenhouse.io",
  [ATSPlatform.LEVER]: "jobs.lever.co",
  [ATSPlatform.GENERIC]: "Any job application form",
  [ATSPlatform.UNKNOWN]: "",
};

const SUPPORTED_PLATFORMS = [ATSPlatform.GREENHOUSE, ATSPlatform.LEVER, ATSPlatform.GENERIC] as const;

/**
 * Settings tab — platform toggles + AI configuration.
 */
export function SettingsTab({ settings, onTogglePlatform, onUpdateSettings }: SettingsTabProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.geminiApiKey ?? "");

  const handleApiKeySave = () => {
    onUpdateSettings({ geminiApiKey: apiKeyDraft.trim() });
  };

  return (
    <div className="af-settings">
      {/* ── AI Settings ─────────────────────── */}
      <div className="af-settings-section">
        <div className="af-settings-section-title">✨ AI-Powered Answers</div>
        <p className="af-settings-hint">
          Use Gemini to automatically answer custom job application questions based on your resume.
        </p>

        {/* AI enabled toggle */}
        <div className="af-settings-toggle-row" style={{ marginBottom: "10px" }}>
          <div className="af-settings-toggle-info">
            <span className="af-settings-toggle-label">Enable AI Answers</span>
            <span className="af-settings-toggle-url">Gemini 2.0 Flash</span>
          </div>
          <button
            id="toggle-ai"
            role="switch"
            aria-checked={settings.aiEnabled}
            className={`af-toggle ${settings.aiEnabled ? "af-toggle-on" : "af-toggle-off"}`}
            onClick={() => onUpdateSettings({ aiEnabled: !settings.aiEnabled })}
            title={`${settings.aiEnabled ? "Disable" : "Enable"} AI answers`}
          >
            <span className="af-toggle-thumb" />
          </button>
        </div>

        {/* API Key input */}
        <div className="af-ai-key-section">
          <label className="af-ai-key-label">Gemini API Key</label>
          <div className="af-ai-key-row">
            <input
              id="gemini-api-key"
              type={showApiKey ? "text" : "password"}
              className="af-ai-key-input"
              placeholder="AIza..."
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              onBlur={handleApiKeySave}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="af-ai-key-toggle"
              onClick={() => setShowApiKey((v) => !v)}
              title={showApiKey ? "Hide key" : "Show key"}
            >
              {showApiKey ? "🙈" : "👁"}
            </button>
          </div>
          <p className="af-ai-key-hint">
            Get a free key at{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="af-ai-key-link"
            >
              aistudio.google.com
            </a>
            {apiKeyDraft && (
              <span className="af-ai-key-status">
                {" "}· {settings.geminiApiKey ? "✓ Saved" : "Unsaved"}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Autofill Platforms ───────────────── */}
      <div className="af-settings-section">
        <div className="af-settings-section-title">Autofill Platforms</div>
        <p className="af-settings-hint">
          Enable or disable ApplyFill for each job platform.
        </p>
        <div className="af-settings-toggles">
          {SUPPORTED_PLATFORMS.map((platform) => {
            const enabled = settings.enabledPlatforms[platform] ?? true;
            return (
              <div key={platform} className="af-settings-toggle-row">
                <div className="af-settings-toggle-info">
                  <span className="af-settings-toggle-label">{PLATFORM_LABELS[platform]}</span>
                  <span className="af-settings-toggle-url">{PLATFORM_URLS[platform]}</span>
                </div>
                <button
                  id={`toggle-${platform}`}
                  role="switch"
                  aria-checked={enabled}
                  className={`af-toggle ${enabled ? "af-toggle-on" : "af-toggle-off"}`}
                  onClick={() => onTogglePlatform(platform, !enabled)}
                  title={`${enabled ? "Disable" : "Enable"} autofill on ${PLATFORM_LABELS[platform]}`}
                >
                  <span className="af-toggle-thumb" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── About ────────────────────────────── */}
      <div className="af-settings-section">
        <div className="af-settings-section-title">About</div>
        <p className="af-settings-hint">
          ApplyFill v0.1.0 · All data stays on your device.
          <br />
          No tracking, no accounts, no servers.
        </p>
      </div>
    </div>
  );
}
