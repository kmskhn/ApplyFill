import React, { useState, useEffect, useCallback, useRef } from "react";
import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo";
import { Storage } from "@plasmohq/storage";
import type { UserProfile, DiscoveredField, AutofillResult, UserSettings } from "@applyfill/shared";
import type { AIAnswerResult, ProfileContext } from "@applyfill/ats-engine";
import {
  STORAGE_KEYS,
  parseStoredProfile,
  parseStoredSettings,
  ATSPlatform,
  FieldType,
} from "@applyfill/shared";
import { getAdapterForUrl, autofill, setInputValue } from "@applyfill/ats-engine";
import cssText from "data-text:./autofill-overlay.css";

export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  run_at: "document_idle",
  all_frames: false,
};

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style");
  style.textContent = cssText;
  return style;
};

const storage = new Storage({ area: "local" });

type FillStatus =
  | "idle"
  | "scanning"
  | "ready"
  | "ai-thinking"
  | "review"      // NEW: show all fields + proposed values before filling
  | "filling"
  | "done"
  | "error";

/** A field with its proposed fill value */
interface FieldProposal {
  field: DiscoveredField;
  value: string;
  source: "profile" | "ai" | "empty";
}

// File inputs and unknown fields we can't fill
const SKIP_TYPES = new Set<FieldType>([
  FieldType.RESUME,
  FieldType.COVER_LETTER,
  FieldType.UNKNOWN,
]);

/**
 * Floating autofill overlay rendered via Plasmo CSUI (Shadow DOM).
 *
 * New flow:
 * 1. Scan the page for form fields
 * 2. Click "Fill Application" → AI analyses ALL fields using profile + resume
 * 3. Review screen shows every field with its proposed value (editable)
 * 4. Click "Fill All" → fills everything at once
 */
function AutofillOverlay() {
  const [status, setStatus] = useState<FillStatus>("idle");
  const [allFields, setAllFields] = useState<DiscoveredField[]>([]);
  const [proposals, setProposals] = useState<FieldProposal[]>([]);
  const [result, setResult] = useState<AutofillResult | null>(null);
  const [platform, setPlatform] = useState<ATSPlatform>(ATSPlatform.UNKNOWN);
  const [isMinimized, setIsMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDisabled, setIsDisabled] = useState(false);
  const scanDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scan fields on mount and re-scan when DOM changes
  useEffect(() => {
    const adapter = getAdapterForUrl(window.location.href);
    if (!adapter || adapter.id === ATSPlatform.UNKNOWN) {
      setIsDisabled(true);
      return;
    }

    const currentPlatform = adapter.id;
    setPlatform(currentPlatform);

    storage
      .get<UserSettings>(STORAGE_KEYS.SETTINGS)
      .then((stored) => {
        const settings = parseStoredSettings(stored ?? {});
        if (!settings.enabledPlatforms[currentPlatform]) {
          setIsDisabled(true);
          return;
        }

        setTimeout(() => scanFields(adapter), 1000);

        const observer = new MutationObserver(() => {
          if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
          scanDebounceRef.current = setTimeout(() => {
            if (status === "idle" || status === "scanning" || status === "ready") {
              scanFields(adapter);
            }
          }, 800);
        });

        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
          observer.disconnect();
          if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
        };
      })
      .catch(() => scanFields(adapter));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanFields = useCallback(
    (adapter: ReturnType<typeof getAdapterForUrl>) => {
      if (!adapter) return;
      setStatus("scanning");
      try {
        if (!adapter.isApplicationPage(document)) {
          setStatus("idle");
          return;
        }
        const formRoot = adapter.getFormRoot(document);
        if (!formRoot) {
          setStatus("idle");
          return;
        }
        const discovered = adapter.discoverFields(formRoot);
        // Exclude file inputs and totally invisible elements
        const fillable = discovered.filter(
          (f) => f.inputType !== "file" && !SKIP_TYPES.has(f.fieldType as FieldType),
        );
        setAllFields(fillable);
        setStatus(fillable.length > 0 ? "ready" : "idle");
      } catch (err) {
        console.error("[applyfill] Field scan error:", err);
        setStatus("idle");
      }
    },
    [status],
  );

  /**
   * Main handler: load profile + run AI on ALL fields, then show review screen.
   */
  const handleAnalyze = useCallback(async () => {
    if (allFields.length === 0) return;
    setError(null);

    // Load profile
    const rawProfile = await storage.get<UserProfile>(STORAGE_KEYS.PROFILE);
    const profile = rawProfile ? parseStoredProfile(rawProfile) : null;

    const hasProfileData = profile && [
      profile.personal.firstName,
      profile.personal.lastName,
      profile.personal.email,
      profile.personal.phone,
    ].some((v) => v && v.trim().length > 0);

    // Load settings + resume
    const [resumeText, rawSettings] = await Promise.all([
      storage.get<string>(STORAGE_KEYS.RESUME_TEXT),
      storage.get<UserSettings>(STORAGE_KEYS.SETTINGS),
    ]);
    const settings = parseStoredSettings(rawSettings ?? {});

    // Build profile context for AI
    const profileCtx: ProfileContext = profile
      ? {
          fullName: [profile.personal.firstName, profile.personal.lastName].filter(Boolean).join(" "),
          firstName: profile.personal.firstName,
          lastName: profile.personal.lastName,
          email: profile.personal.email,
          phone: profile.personal.phone,
          nationality: profile.personal.nationality,
          country: profile.personal.country,
          city: profile.personal.city,
          location: profile.personal.location,
          currentTitle: profile.professional.currentTitle,
          currentCompany: profile.professional.currentCompany,
          currentSalary: profile.professional.currentSalary,
          yearsExperience: profile.professional.yearsOfExperience,
          linkedIn: profile.professional.linkedinUrl,
          github: profile.professional.githubUrl,
          portfolio: profile.professional.portfolioUrl,
          salaryExpectation: profile.preferences.salaryExpectation,
          noticePeriod: profile.preferences.noticePeriod,
          workAuthorization: profile.preferences.workAuthorization,
        }
      : {};

    // If AI is enabled, send ALL fields to Gemini
    let aiAnswers: Record<string, string> = {};
    if (settings.aiEnabled && settings.geminiApiKey) {
      setStatus("ai-thinking");

      // Build field list for AI — include all fields with labels
      const aiFields = allFields
        .filter((f) => f.labelText)
        .map((f) => {
          let options: string[] | undefined;
          // For React Select (combobox) — list visible options if already open or find them
          if (f.inputType === "select") {
            if (f.element instanceof HTMLSelectElement) {
              options = Array.from(f.element.options)
                .map((o) => o.textContent?.trim() ?? "")
                .filter((t) => t && t !== "Select..." && t !== "— Select —");
            }
          }
          // For radio groups — collect button values/labels
          if (f.element.getAttribute("role") === "radiogroup") {
            const buttons = Array.from(
              f.element.querySelectorAll('[role="radio"]'),
            ) as HTMLElement[];
            options = buttons
              .map((b) => {
                const val = b.getAttribute("value") ?? "";
                const label = b.parentElement?.textContent?.trim() ?? val;
                return label || val;
              })
              .filter(Boolean);
          }
          return {
            label: f.labelText!,
            inputType: f.inputType,
            options,
          };
        });

      try {
        const aiResult = await chrome.runtime.sendMessage({
          type: "AI_ANSWER_FIELDS",
          payload: {
            fields: aiFields,
            profile: profileCtx,
            resumeText: typeof resumeText === "string" ? resumeText : "",
            jobContext: `${document.title} — ${window.location.hostname}`,
            apiKey: settings.geminiApiKey,
          },
        }) as AIAnswerResult;

        aiAnswers = aiResult?.answers ?? {};
      } catch (err) {
        console.warn("[applyfill] AI request failed:", err);
      }
    } else if (!hasProfileData) {
      setStatus("error");
      setError(
        "Your profile is empty and AI is not enabled. Fill in the Profile tab in the popup to get started.",
      );
      return;
    }

    // Build proposals: AI answer > profile rule-based match > empty
    const newProposals: FieldProposal[] = allFields.map((field) => {
      const label = field.labelText ?? "";

      // Try AI answer first (AI understood the full context)
      if (label && aiAnswers[label]) {
        return { field, value: aiAnswers[label], source: "ai" };
      }

      // Fall back to rule-based profile matching
      if (profile) {
        const profileValue = getProfileValueForField(field, profile);
        if (profileValue) {
          return { field, value: profileValue, source: "profile" };
        }
      }

      return { field, value: "", source: "empty" };
    });

    setProposals(newProposals);
    setStatus("review");
  }, [allFields]);

  /**
   * Fill all fields using the current proposals.
   */
  const handleFillAll = useCallback(async () => {
    setStatus("filling");
    let filled = 0;
    let failed = 0;

    for (const proposal of proposals) {
      if (!proposal.value.trim()) continue;
      try {
        const success = setInputValue(proposal.field.element, proposal.value);
        if (success) filled++;
        else failed++;
      } catch {
        failed++;
      }
    }

    const fillResult: AutofillResult = {
      platform,
      totalFieldsDetected: proposals.length,
      fieldsFilled: filled,
      fieldsSkipped: proposals.filter((p) => !p.value.trim()).length,
      fieldsFailed: failed,
      details: [],
      timestamp: new Date().toISOString(),
    };

    setResult(fillResult);
    setStatus("done");
    await storage.set(STORAGE_KEYS.LAST_FILL_RESULT, fillResult);

    setTimeout(() => {
      setStatus("ready");
      setResult(null);
      setProposals([]);
    }, 6000);
  }, [proposals, platform]);

  // Don't render if disabled or no fields found
  if (isDisabled || (status === "idle" && allFields.length === 0)) return null;

  if (isMinimized) {
    return (
      <button
        className="af-overlay-fab"
        onClick={() => setIsMinimized(false)}
        title="ApplyFill — Click to expand"
      >
        ⚡
      </button>
    );
  }

  return (
    <div className="af-overlay">
      <div className="af-overlay-header">
        <span className="af-overlay-logo">⚡</span>
        <span className="af-overlay-title">ApplyFill</span>
        <button
          className="af-overlay-minimize"
          onClick={() => setIsMinimized(true)}
          title="Minimize"
        >
          ─
        </button>
      </div>

      <div className="af-overlay-body">
        {/* Scanning */}
        {status === "scanning" && (
          <div className="af-overlay-status af-overlay-status-info">Scanning form...</div>
        )}

        {/* Ready — show Fill Application button */}
        {status === "ready" && (
          <>
            <div className="af-overlay-status af-overlay-status-ready">
              {allFields.length} field{allFields.length !== 1 ? "s" : ""} detected
            </div>
            <button className="af-overlay-fill-btn" onClick={handleAnalyze}>
              🚀 Fill Application
            </button>
          </>
        )}

        {/* AI thinking */}
        {status === "ai-thinking" && (
          <div className="af-overlay-status af-overlay-status-ai">
            <span className="af-overlay-spinner">✨</span> AI is reading your resume...
          </div>
        )}

        {/* Review screen — ALL fields with proposed values */}
        {status === "review" && (
          <div className="af-overlay-review">
            <div className="af-overlay-review-header">
              Review — {proposals.filter((p) => p.value).length} of {proposals.length} fields ready
            </div>
            <div className="af-overlay-review-list">
              {proposals.map((proposal, i) => {
                const label = proposal.field.labelText ?? `Field ${i + 1}`;
                const isAI = proposal.source === "ai";
                const isEmpty = !proposal.value;
                return (
                  <div key={i} className={`af-overlay-review-item${isEmpty ? " af-overlay-review-item-empty" : ""}`}>
                    <div className="af-overlay-review-label">
                      {label}
                      {isAI && (
                        <span className="af-overlay-ai-badge" title="AI-generated">
                          ✨ AI
                        </span>
                      )}
                    </div>
                    <input
                      className={`af-overlay-review-input${isAI ? " af-overlay-prompt-input-ai" : ""}`}
                      type="text"
                      placeholder={isEmpty ? "No value — type to add" : ""}
                      value={proposal.value}
                      onChange={(e) => {
                        setProposals((prev) =>
                          prev.map((p, idx) =>
                            idx === i ? { ...p, value: e.target.value, source: "profile" } : p,
                          ),
                        );
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="af-overlay-prompt-actions">
              <button className="af-overlay-fill-btn" onClick={handleFillAll}>
                ✅ Fill All
              </button>
              <button
                className="af-overlay-skip-btn"
                onClick={() => {
                  setStatus("ready");
                  setProposals([]);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Filling */}
        {status === "filling" && (
          <div className="af-overlay-status af-overlay-status-info">Filling fields...</div>
        )}

        {/* Done */}
        {status === "done" && result && (
          <div className="af-overlay-status af-overlay-status-done">
            ✓ Filled {result.fieldsFilled} of {result.totalFieldsDetected} fields
            {result.fieldsFailed > 0 && (
              <span className="af-overlay-warning"> · {result.fieldsFailed} failed</span>
            )}
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="af-overlay-status af-overlay-status-error">
            {error || "An error occurred"}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Gets a profile value for a known field type using rule-based matching.
 * Used as fallback when AI is not enabled or doesn't return an answer.
 */
function getProfileValueForField(field: DiscoveredField, profile: UserProfile): string | null {
  const p = profile.personal;
  const pro = profile.professional;
  const pref = profile.preferences;

  switch (field.fieldType) {
    case FieldType.FIRST_NAME: return p.firstName || null;
    case FieldType.LAST_NAME: return p.lastName || null;
    case FieldType.FULL_NAME:
      return [p.firstName, p.lastName].filter(Boolean).join(" ") || null;
    case FieldType.EMAIL: return p.email || null;
    case FieldType.PHONE: return p.phone || null;
    case FieldType.CITY: return p.city || null;
    case FieldType.STATE: return p.state || null;
    case FieldType.COUNTRY: return p.country || null;
    case FieldType.NATIONALITY: return p.nationality || null;
    case FieldType.LOCATION: return p.location || null;
    case FieldType.ADDRESS: return p.location || p.city || null;
    case FieldType.CURRENT_TITLE: return pro.currentTitle || null;
    case FieldType.CURRENT_COMPANY: return pro.currentCompany || null;
    case FieldType.CURRENT_SALARY: return pro.currentSalary || null;
    case FieldType.YEARS_EXPERIENCE: return pro.yearsOfExperience || null;
    case FieldType.LINKEDIN_URL: return pro.linkedinUrl || null;
    case FieldType.GITHUB_URL: return pro.githubUrl || null;
    case FieldType.PORTFOLIO_URL: return pro.portfolioUrl || null;
    case FieldType.WEBSITE_URL:
      return pro.portfolioUrl || pro.linkedinUrl || null;
    case FieldType.SALARY_EXPECTATION: return pref.salaryExpectation || null;
    case FieldType.NOTICE_PERIOD: return pref.noticePeriod || null;
    case FieldType.WORK_AUTHORIZATION: return pref.workAuthorization || null;
    default: return null;
  }
}

export default AutofillOverlay;
