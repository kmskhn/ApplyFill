/**
 * Background service worker.
 *
 * Responsibilities:
 * - Relay keyboard shortcut commands to the active tab's content script
 * - Handle AI_ANSWER_FIELDS messages from content scripts (Gemini API calls)
 * - Update extension badge based on profile status
 */

import { answerFieldsWithAI } from "@applyfill/ats-engine";
import type { AIAnswerRequest } from "@applyfill/ats-engine";

/** Message types handled by the background worker */
interface AIAnswerMessage {
  type: "AI_ANSWER_FIELDS";
  payload: AIAnswerRequest;
}

interface TriggerAutofillMessage {
  type: "TRIGGER_AUTOFILL";
}

type BackgroundMessage = AIAnswerMessage | TriggerAutofillMessage;

// Handle messages from content scripts
chrome.runtime.onMessage.addListener(
  (msg: BackgroundMessage, _sender, sendResponse) => {
    if (msg.type === "AI_ANSWER_FIELDS") {
      // Call Gemini from the background worker (avoids CORS issues in content scripts)
      answerFieldsWithAI(msg.payload)
        .then((result) => sendResponse(result))
        .catch((err) =>
          sendResponse({
            answers: {},
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        );
      return true; // Keep the message channel open for async response
    }
    return false;
  },
);

// Relay keyboard shortcut to content script
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "trigger-autofill") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_AUTOFILL" });
      } catch {
        // Content script not loaded on this page — ignore
      }
    }
  }
});

// Log extension lifecycle events for debugging
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[applyfill] Extension ${details.reason}: v${chrome.runtime.getManifest().version}`);
});

export {};
