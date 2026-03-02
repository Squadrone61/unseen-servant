/**
 * Background service worker: handles AI API calls and tool-use loops.
 * Receives dm_request from content script, makes the Ollama AI call, returns response.
 */

import type { ExtensionAIConfig } from "./types";
import { callAI } from "./ai-service";
import { callAIWithTools } from "./ai-tool-loop";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [3000, 6000, 12000]; // Faster backoff for local Ollama

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConnectionError(msg: string): boolean {
  return msg.includes("Failed to fetch") || msg.includes("ERR_CONNECTION_REFUSED") || msg.includes("NetworkError");
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

  if (!config || !config.model) {
    return { text: "", error: "No Ollama model configured in the AIDND DM Extension. Open the extension popup to set up." };
  }

  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let result: { text: string };

      if (config.supportsTools) {
        result = await callAIWithTools(config, message.systemPrompt, message.messages);
      } else {
        result = await callAI(config, message.systemPrompt, message.messages);
      }

      return { text: result.text };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      if (isConnectionError(lastError) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt] ?? 12000;
        console.warn(`[AIDND Background] Connection error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }

      console.error("[AIDND Background] AI call failed:", lastError);
      return { text: "", error: lastError };
    }
  }

  return { text: "", error: lastError };
}

console.log("[AIDND Extension] Background service worker loaded (Ollama)");
