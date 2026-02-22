/**
 * Content script: relays messages between the game page and the extension background SW.
 *
 * Page → content script → background:  dm_request
 * Background → content script → page:  dm_response
 * Popup → content script → page:       dm_config
 */

// Listen for messages from the page (dm_request relay)
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "aidnd:dm_request") {
    const { requestId, systemPrompt, messages } = event.data.payload;

    try {
      // Forward to background service worker
      const response = await chrome.runtime.sendMessage({
        type: "dm_request",
        requestId,
        systemPrompt,
        messages,
      });

      // Forward response back to page
      window.postMessage(
        {
          type: "aidnd:dm_response",
          payload: {
            type: "client:dm_response",
            requestId,
            text: response?.text ?? "",
            error: response?.error,
          },
        },
        "*",
      );
    } catch (error) {
      // Extension might not be ready or crashed
      window.postMessage(
        {
          type: "aidnd:dm_response",
          payload: {
            type: "client:dm_response",
            requestId,
            text: "",
            error: error instanceof Error ? error.message : "Extension communication failed",
          },
        },
        "*",
      );
    }
  }
});

// Listen for messages from the extension popup (config changes)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "dm_config") {
    window.postMessage(
      {
        type: "aidnd:dm_config",
        payload: {
          type: "client:dm_config",
          provider: message.provider,
          supportsTools: message.supportsTools,
        },
      },
      "*",
    );
  }
});

// On load, send saved config to the page (if extension was configured before the page opened)
(async () => {
  try {
    const stored = await chrome.storage.local.get(["aiConfig"]);
    const config = stored.aiConfig as { provider: string; supportsTools: boolean } | undefined;
    if (config) {
      window.postMessage(
        {
          type: "aidnd:dm_config",
          payload: {
            type: "client:dm_config",
            provider: config.provider,
            supportsTools: config.supportsTools,
          },
        },
        "*",
      );
    }
  } catch {
    // storage access might fail during early load
  }
})();

console.log("[AIDND Extension] Content script loaded");
