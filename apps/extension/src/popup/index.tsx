import React, { useCallback, useEffect, useState } from "react";
import { Storage } from "@plasmohq/storage";
import type { UserProfile } from "@applyfill/shared";
import { STORAGE_KEYS } from "@applyfill/shared";
import { Button } from "@applyfill/ui";
import { useProfile } from "./hooks/useProfile";
import { useSettings } from "./hooks/useSettings";
import {
  SectionEditor,
  PERSONAL_FIELDS,
  PROFESSIONAL_FIELDS,
  PREFERENCES_FIELDS,
} from "./components/SectionEditor";
import { StatusBadge } from "./components/StatusBadge";
import { SettingsTab } from "./components/SettingsTab";
import "./popup.css";

type ActiveTab = "profile" | "resume" | "settings";

// Direct storage instance for plain reads/writes (no Zod involved)
const storage = new Storage({ area: "local" });

/**
 * Main popup UI for the extension.
 * Tabs: Profile | Resume | Settings
 */
function Popup() {
  const { profile, updateSection, clearProfile, saveStatus, isLoading } = useProfile();
  const { settings, togglePlatform, updateSettings, isLoading: settingsLoading } = useSettings();
  const [activeTab, setActiveTab] = useState<ActiveTab>("profile");

  // Resume text is stored SEPARATELY from the profile to avoid schema/Zod issues
  const [resumeText, setResumeText] = useState("");
  const [resumeSaved, setResumeSaved] = useState(false);

  // Load resume text directly from storage on mount
  useEffect(() => {
    storage
      .get<string>(STORAGE_KEYS.RESUME_TEXT)
      .then((stored) => {
        if (typeof stored === "string" && stored.length > 0) {
          setResumeText(stored);
        }
      })
      .catch(console.error);
  }, []);

  // Save resume text directly to storage (debounced via blur + change)
  const saveResumeText = useCallback((text: string) => {
    storage
      .set(STORAGE_KEYS.RESUME_TEXT, text)
      .then(() => {
        setResumeSaved(true);
        setTimeout(() => setResumeSaved(false), 2000);
      })
      .catch(console.error);
  }, []);

  const handleResumeChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setResumeText(e.target.value);
    },
    [],
  );

  const handleResumeBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      saveResumeText(e.target.value);
    },
    [saveResumeText],
  );

  const handleSectionChange = useCallback(
    (section: keyof UserProfile) => (key: string, value: string) => {
      updateSection(section, { [key]: value });
    },
    [updateSection],
  );

  if (isLoading || settingsLoading) {
    return (
      <div className="af-popup">
        <div className="af-popup-header">
          <span className="af-popup-logo">⚡</span>
          <div>
            <div className="af-popup-title">ApplyFill</div>
            <div className="af-popup-subtitle">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  const filledCount = countFilledFields(profile);
  const hasResume = resumeText.trim().length > 0;
  const hasApiKey = (settings.geminiApiKey ?? "").trim().length > 0;
  const wordCount = resumeText.trim() ? resumeText.trim().split(/\s+/).length : 0;

  return (
    <div className="af-popup">
      {/* Header */}
      <div className="af-popup-header">
        <span className="af-popup-logo">⚡</span>
        <div style={{ flex: 1 }}>
          <div className="af-popup-title">ApplyFill</div>
          <div className="af-popup-subtitle">
            {activeTab === "profile" && `${filledCount} fields filled · Auto-saves`}
            {activeTab === "resume" && (hasResume ? `${wordCount} words · Saved` : "Paste your resume")}
            {activeTab === "settings" && "Extension Settings"}
          </div>
        </div>
        <StatusBadge status={saveStatus} />
      </div>

      {/* Tab bar */}
      <div className="af-tabs">
        <button
          id="tab-profile"
          className={`af-tab ${activeTab === "profile" ? "af-tab-active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          Profile
        </button>
        <button
          id="tab-resume"
          className={`af-tab ${activeTab === "resume" ? "af-tab-active" : ""}`}
          onClick={() => setActiveTab("resume")}
        >
          Resume
          {hasResume && <span className="af-tab-dot" />}
        </button>
        <button
          id="tab-settings"
          className={`af-tab ${activeTab === "settings" ? "af-tab-active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          AI / Settings
          {hasApiKey && settings.aiEnabled && <span className="af-tab-dot af-tab-dot-ai" />}
        </button>
      </div>

      {/* Body */}
      <div className="af-popup-body">
        {activeTab === "profile" && (
          <>
            {/* Status banner */}
            <div className={`af-status ${filledCount > 5 ? "af-status-success" : "af-status-warning"}`}>
              {filledCount > 5 ? "✓" : "⚠"}{" "}
              {filledCount > 5
                ? "Profile ready for autofill"
                : "Fill out your profile below to enable autofill"}
            </div>

            <SectionEditor
              title="Personal Info"
              data={profile.personal}
              fields={PERSONAL_FIELDS}
              onChange={handleSectionChange("personal")}
              defaultOpen={true}
            />

            <SectionEditor
              title="Professional"
              data={profile.professional}
              fields={PROFESSIONAL_FIELDS}
              onChange={handleSectionChange("professional")}
              defaultOpen={false}
            />

            <SectionEditor
              title="Job Preferences"
              data={profile.preferences}
              fields={PREFERENCES_FIELDS}
              onChange={handleSectionChange("preferences")}
              defaultOpen={false}
            />

            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("Clear all profile data? This cannot be undone.")) {
                    clearProfile();
                  }
                }}
              >
                🗑 Clear Profile
              </Button>
            </div>
          </>
        )}

        {activeTab === "resume" && (
          <div className="af-resume-tab">
            {/* AI status banner */}
            {settings.aiEnabled && hasApiKey ? (
              <div className="af-resume-ai-active">
                ✨ AI answers enabled · Gemini will use this resume to answer custom questions
              </div>
            ) : (
              <div className="af-resume-ai-inactive">
                {!hasApiKey
                  ? "Add your Gemini API key in the AI / Settings tab to enable AI answers"
                  : "Enable AI Answers in the AI / Settings tab to activate"}
              </div>
            )}

            <div className="af-resume-label">
              Resume / CV Text
              <span className="af-resume-hint-inline">
                {resumeSaved ? "✓ Saved" : "Saves on focus change"}
              </span>
            </div>
            <textarea
              id="resume-text"
              className="af-resume-textarea"
              placeholder={
                "Paste your resume here as plain text.\n\nExample:\nJane Doe · jane@email.com · +966 55 123 4567\n\nExperience:\nSenior Software Engineer at Acme Corp (2020–2024)\n· Led a team of 5 engineers\n· Built scalable microservices...\n\nSkills: React, TypeScript, Python..."
              }
              value={resumeText}
              onChange={handleResumeChange}
              onBlur={handleResumeBlur}
              rows={14}
              spellCheck={false}
            />
            <p className="af-resume-footer">
              Your resume stays on your device and is never uploaded anywhere.
            </p>
          </div>
        )}

        {activeTab === "settings" && (
          <SettingsTab
            settings={settings}
            onTogglePlatform={togglePlatform}
            onUpdateSettings={updateSettings}
          />
        )}
      </div>
    </div>
  );
}

function countFilledFields(profile: UserProfile): number {
  let count = 0;
  const sections = [
    profile.personal,
    profile.professional,
    profile.preferences,
  ] as Record<string, string>[];

  for (const section of sections) {
    for (const value of Object.values(section)) {
      if (typeof value === "string" && value.trim().length > 0) {
        count++;
      }
    }
  }
  return count;
}

export default Popup;
