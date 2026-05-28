import { useState, useEffect, useCallback } from "react";
import { Storage } from "@plasmohq/storage";
import type { UserSettings } from "@applyfill/shared";
import { DEFAULT_SETTINGS, parseStoredSettings, STORAGE_KEYS } from "@applyfill/shared";
import type { ATSPlatform } from "@applyfill/shared";

const storage = new Storage({ area: "local" });

interface UseSettingsReturn {
  settings: UserSettings;
  togglePlatform: (platform: ATSPlatform, enabled: boolean) => void;
  updateSettings: (updates: Partial<UserSettings>) => void;
  isLoading: boolean;
}

/**
 * Hook for reading and writing user settings.
 * Auto-saves on change.
 */
export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    storage
      .get<UserSettings>(STORAGE_KEYS.SETTINGS)
      .then((stored) => {
        setSettings(parseStoredSettings(stored ?? {}));
      })
      .catch((err) => {
        console.error("[applyfill] Failed to load settings:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const save = useCallback((next: UserSettings) => {
    storage.set(STORAGE_KEYS.SETTINGS, next).catch((err) => {
      console.error("[applyfill] Failed to save settings:", err);
    });
  }, []);

  const togglePlatform = useCallback(
    (platform: ATSPlatform, enabled: boolean) => {
      setSettings((prev) => {
        const next: UserSettings = {
          ...prev,
          enabledPlatforms: { ...prev.enabledPlatforms, [platform]: enabled },
        };
        save(next);
        return next;
      });
    },
    [save],
  );

  const updateSettings = useCallback(
    (updates: Partial<UserSettings>) => {
      setSettings((prev) => {
        const next: UserSettings = { ...prev, ...updates };
        save(next);
        return next;
      });
    },
    [save],
  );

  return { settings, togglePlatform, updateSettings, isLoading };
}
