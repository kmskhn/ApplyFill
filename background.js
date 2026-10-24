/*
 * Background worker: AI calls (the page can't call Gemini itself: CORS and the key stays here),
 * the keyboard shortcut, and the toolbar button (opens settings).
 */
importScripts("content/util.js", "content/match.js", "ai.js");

async function makeAi() {
  const { settings = {}, ai_state: state = {} } = await chrome.storage.local.get(["settings", "ai_state"]);

  return AF.ai.createAi({
    keys: { gemini: settings.gemini_key || "", openrouter: settings.openrouter_key || "" },
    state,
    saveState: (next) => chrome.storage.local.set({ ai_state: next }),
    log: (line) => console.log("[ApplyFill]", line),
  });
}

async function handle(message) {
  switch (message?.type) {
    case "ai-answer": {
      const { profile = {}, resume = null } = await chrome.storage.local.get(["profile", "resume"]);
      const ai = await makeAi();

      return ai.answerFields({ profile, resumeText: resume?.text || "", job: message.job || {}, fields: message.fields || [] });
    }

    case "read-resume": {
      const { resume } = await chrome.storage.local.get(["resume"]);

      if (!resume?.base64) throw new Error("Upload your resume PDF first.");

      return (await makeAi()).readResume({ base64: resume.base64 });
    }

    case "ai-test":
      return (await makeAi()).test();

    case "open-options":
      await chrome.runtime.openOptionsPage();

      return {};

    default:
      throw new Error(`unknown message ${message?.type}`);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message).then(
    (result) => sendResponse({ ok: true, ...result }),
    (error) => sendResponse({ ok: false, error: error.message }),
  );

  // Keep the channel open for the async answer.
  return true;
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "fill-form") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "fill" }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.runtime.openOptionsPage();
});
