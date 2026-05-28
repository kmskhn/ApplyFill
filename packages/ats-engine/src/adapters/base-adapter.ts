import type { DiscoveredField } from "@applyfill/shared";
import { ATSPlatform } from "@applyfill/shared";
import { discoverFields } from "../detector/field-detector";

/**
 * Interface for platform-specific ATS adapters.
 * Each adapter knows how to find and interact with its platform's forms.
 */
export interface ATSAdapter {
  readonly id: ATSPlatform;
  readonly name: string;
  readonly urlPatterns: RegExp[];

  /** Returns true if the current page is a job application form */
  isApplicationPage(doc: Document): boolean;

  /** Finds the root element of the application form */
  getFormRoot(doc: Document): Element | null;

  /** Discovers fields — can override generic detection with platform-specific logic */
  discoverFields(formRoot: Element): DiscoveredField[];
}

/**
 * Base adapter that provides generic field discovery.
 * Platform-specific adapters extend this and override what's needed.
 */
export abstract class BaseAdapter implements ATSAdapter {
  abstract readonly id: ATSPlatform;
  abstract readonly name: string;
  abstract readonly urlPatterns: RegExp[];

  abstract isApplicationPage(doc: Document): boolean;
  abstract getFormRoot(doc: Document): Element | null;

  /**
   * Default field discovery using the generic detector.
   * Subclasses can override to add platform-specific logic.
   */
  discoverFields(formRoot: Element): DiscoveredField[] {
    return discoverFields(formRoot);
  }
}
