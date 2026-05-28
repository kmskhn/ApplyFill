import { useCallback, useEffect, useRef, useState } from "react";
import { Storage } from "@plasmohq/storage";
import { useStorage } from "@plasmohq/storage/hook";
import {
  type UserProfile,
  createEmptyProfile,
  parseStoredProfile,
  STORAGE_KEYS,
} from "@applyfill/shared";

const storage = new Storage({ area: "local" });

/**
 * Hook for profile CRUD operations.
 * Uses @plasmohq/storage for cross-context sync (popup ↔ content script).
 */
export function useProfile() {
  const [rawProfile, setRawProfile] = useStorage<UserProfile | null>({
    key: STORAGE_KEYS.PROFILE,
    instance: storage,
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Track whether we've completed the initial storage read.
  // This prevents the useEffect from writing an empty profile before
  // the real stored profile has been loaded (race condition).
  const hasInitialized = useRef(false);

  // Parse/validate stored profile, rescuing data if Zod strict validation fails
  const profile: UserProfile = rawProfile
    ? parseStoredProfile(rawProfile) ?? rescueProfile(rawProfile)
    : createEmptyProfile();

  // Initialize profile in storage ONLY if it genuinely doesn't exist.
  // IMPORTANT: undefined = still loading (don't touch storage yet)
  //            null = key doesn't exist → safe to create
  useEffect(() => {
    if (rawProfile === undefined) {
      // Storage hasn't responded yet — do nothing, wait for real value
      return;
    }

    if (hasInitialized.current) return;
    hasInitialized.current = true;

    if (rawProfile === null) {
      // Key doesn't exist in storage → safe to create a fresh profile
      console.log("[applyfill] No stored profile found, creating new one");
      const empty = createEmptyProfile();
      setRawProfile(empty);
    } else {
      console.log("[applyfill] Loaded existing profile:", rawProfile?.id);
    }
  }, [rawProfile, setRawProfile]);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      setSaveStatus("saving");
      const updated = {
        ...profile,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      await setRawProfile(updated);
      setSaveStatus("saved");

      // Reset saved indicator after a brief delay
      setTimeout(() => setSaveStatus("idle"), 1500);
    },
    [profile, setRawProfile],
  );

  /**
   * Updates a nested section of the profile.
   * E.g., updateSection("personal", { firstName: "John" })
   */
  const updateSection = useCallback(
    async <K extends keyof UserProfile>(
      section: K,
      updates: Partial<UserProfile[K]>,
    ) => {
      const currentSection = profile[section];
      if (typeof currentSection === "object" && currentSection !== null) {
        await updateProfile({
          [section]: { ...currentSection, ...updates },
        } as Partial<UserProfile>);
      }
    },
    [profile, updateProfile],
  );

  const clearProfile = useCallback(async () => {
    hasInitialized.current = false;
    await setRawProfile(createEmptyProfile());
  }, [setRawProfile]);

  return {
    profile,
    updateProfile,
    updateSection,
    clearProfile,
    saveStatus,
    isLoading: rawProfile === undefined,
  };
}

/**
 * Fallback parser: if Zod strict validation fails (e.g. after schema changes),
 * this rescues whatever data is in storage rather than losing it.
 * Returns a valid UserProfile with the rescued data merged in.
 */
function rescueProfile(raw: unknown): UserProfile {
  const base = createEmptyProfile();

  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  // Preserve the original ID and timestamps if they look valid
  if (typeof r.id === "string" && r.id.length > 0) base.id = r.id;
  if (typeof r.version === "number") base.version = r.version;
  if (typeof r.createdAt === "string") base.createdAt = r.createdAt;

  // Rescue personal fields
  if (r.personal && typeof r.personal === "object") {
    const p = r.personal as Record<string, unknown>;
    Object.keys(base.personal).forEach((key) => {
      if (typeof p[key] === "string") {
        (base.personal as Record<string, string>)[key] = p[key] as string;
      }
    });
  }

  // Rescue professional fields
  if (r.professional && typeof r.professional === "object") {
    const p = r.professional as Record<string, unknown>;
    Object.keys(base.professional).forEach((key) => {
      if (typeof p[key] === "string") {
        (base.professional as Record<string, string>)[key] = p[key] as string;
      }
    });
  }

  // Rescue preferences fields
  if (r.preferences && typeof r.preferences === "object") {
    const p = r.preferences as Record<string, unknown>;
    Object.keys(base.preferences).forEach((key) => {
      if (typeof p[key] === "string") {
        (base.preferences as Record<string, string>)[key] = p[key] as string;
      }
    });
  }

  // Rescue demographics fields
  if (r.demographics && typeof r.demographics === "object") {
    const p = r.demographics as Record<string, unknown>;
    Object.keys(base.demographics).forEach((key) => {
      if (typeof p[key] === "string") {
        (base.demographics as Record<string, string>)[key] = p[key] as string;
      }
    });
  }

  // Rescue custom fields
  if (r.customFields && typeof r.customFields === "object") {
    base.customFields = r.customFields as Record<string, string>;
  }

  console.warn("[applyfill] Zod validation failed, rescued profile data for:", base.id);
  return base;
}
