/**
 * Background service worker: handles AI API calls and tool-use loops.
 * Receives dm_request from content script, makes the AI call, returns response.
 */

import type { ExtensionAIConfig } from "./types";
import { callAI } from "./ai-service";
import { callAIWithTools, providerSupportsTools } from "./ai-tool-loop";

const MAX_RETRIES = 3;

/** Parse "try again in X.XXXs" or "Retry-After: N" from error messages. */
function parseRetryDelay(errorMsg: string): number | null {
  const match = errorMsg.match(/try again in (\d+(?:\.\d+)?)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let result: { text: string };

      if (config.supportsTools && providerSupportsTools(config.provider)) {
        result = await callAIWithTools(config, message.systemPrompt, message.messages);
      } else {
        result = await callAI(config, message.systemPrompt, message.messages);
      }

      return { text: result.text };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      const isRateLimit = lastError.includes("(429)");

      if (isRateLimit && attempt < MAX_RETRIES) {
        const parsed = parseRetryDelay(lastError);
        const delay = parsed ?? (5000 * Math.pow(2, attempt)); // 5s, 10s, 20s
        console.warn(`[AIDND Background] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }

      console.error("[AIDND Background] AI call failed:", lastError);
      return { text: "", error: lastError };
    }
  }

  return { text: "", error: lastError };
}

console.log("[AIDND Extension] Background service worker loaded");
