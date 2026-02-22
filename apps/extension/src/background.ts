/**
 * Background service worker: handles AI API calls and tool-use loops.
 * Receives dm_request from content script, makes the AI call, returns response.
 */

import type { ExtensionAIConfig } from "./types";
import { callAI } from "./ai-service";
import { callAIWithTools, providerSupportsTools } from "./ai-tool-loop";

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "dm_request") {
    handleDMRequest(message).then(sendResponse).catch((err) => {
      sendResponse({ text: "", error: err instanceof Error ? err.message : String(err) });
    });
    return true; // Keep channel open for async response
  }
});

async function handleDMRequest(message: {
  requestId: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
}): Promise<{ text: string; error?: string }> {
  // Read config from storage
  const stored = await chrome.storage.local.get(["aiConfig"]);
  const config = stored.aiConfig as ExtensionAIConfig | undefined;

  if (!config || !config.apiKey) {
    return { text: "", error: "No AI provider configured in the AIDND DM Extension. Open the extension popup to set up." };
  }

  try {
    let result: { text: string };

    if (config.supportsTools && providerSupportsTools(config.provider)) {
      result = await callAIWithTools(config, message.systemPrompt, message.messages);
    } else {
      result = await callAI(config, message.systemPrompt, message.messages);
    }

    return { text: result.text };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[AIDND Background] AI call failed:", msg);
    return { text: "", error: msg };
  }
}

console.log("[AIDND Extension] Background service worker loaded");
