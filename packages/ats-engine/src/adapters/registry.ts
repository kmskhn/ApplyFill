import type { ATSAdapter } from "./base-adapter";
import { GreenhouseAdapter } from "./greenhouse";
import { LeverAdapter } from "./lever";
import { GenericAdapter } from "./generic";

/**
 * Registry of all available ATS adapters.
 * Adding a new ATS = create adapter file + add instance here.
 * GenericAdapter must be last — it matches all URLs as a fallback.
 */
const adapters: ATSAdapter[] = [new GreenhouseAdapter(), new LeverAdapter(), new GenericAdapter()];

/**
 * Returns the adapter for the given URL, or null if no ATS is detected.
 */
export function getAdapterForUrl(url: string): ATSAdapter | null {
  for (const adapter of adapters) {
    if (adapter.urlPatterns.some((p) => p.test(url))) {
      return adapter;
    }
  }
  return null;
}

/**
 * Returns all registered adapters.
 */
export function getAllAdapters(): readonly ATSAdapter[] {
  return adapters;
}
