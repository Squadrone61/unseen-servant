import type { ExtensionAIConfig } from "./types";
import { providerSupportsTools } from "./ai-tool-loop";

interface ProviderEntry {
  id: string;
  name: string;
  baseUrl: string;
  format: string;
  defaultModel: string;
  modelsEndpoint: string;
  keyPlaceholder: string;
  keyHelpUrl: string;
  keyOptional?: boolean;
}

const PROVIDERS: ProviderEntry[] = [
  { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com", format: "anthropic", defaultModel: "claude-sonnet-4-5-20250929", modelsEndpoint: "/v1/models", keyPlaceholder: "sk-ant-api03-...", keyHelpUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", format: "openai", defaultModel: "gpt-4o", modelsEndpoint: "/v1/models", keyPlaceholder: "sk-...", keyHelpUrl: "https://platform.openai.com/api-keys" },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", format: "openai", defaultModel: "llama-3.3-70b-versatile", modelsEndpoint: "/openai/v1/models", keyPlaceholder: "gsk_...", keyHelpUrl: "https://console.groq.com/keys" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", format: "openai", defaultModel: "deepseek-chat", modelsEndpoint: "/models", keyPlaceholder: "sk-...", keyHelpUrl: "https://platform.deepseek.com/api_keys" },
  { id: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com", format: "gemini", defaultModel: "gemini-2.5-flash", modelsEndpoint: "/v1beta/models", keyPlaceholder: "AIza...", keyHelpUrl: "https://aistudio.google.com/apikey" },
  { id: "xai", name: "xAI (Grok)", baseUrl: "https://api.x.ai/v1", format: "openai", defaultModel: "grok-3", modelsEndpoint: "/v1/models", keyPlaceholder: "xai-...", keyHelpUrl: "https://console.x.ai/" },
  { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1", format: "openai", defaultModel: "mistral-large-latest", modelsEndpoint: "/v1/models", keyPlaceholder: "...", keyHelpUrl: "https://console.mistral.ai/api-keys/" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", format: "openai", defaultModel: "anthropic/claude-sonnet-4.5", modelsEndpoint: "/api/v1/models", keyPlaceholder: "sk-or-v1-...", keyHelpUrl: "https://openrouter.ai/keys" },
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const providerSelect = $<HTMLSelectElement>("provider");
const apiKeyInput = $<HTMLInputElement>("apiKey");
const keyHelpLink = $<HTMLAnchorElement>("key-help");
const modelSelect = $<HTMLSelectElement>("model");
const modelsLoading = $<HTMLSpanElement>("models-loading");
const saveBtn = $<HTMLButtonElement>("save");
const statusDiv = $<HTMLDivElement>("status");

// Populate provider dropdown
for (const p of PROVIDERS) {
  const opt = document.createElement("option");
  opt.value = p.id;
  opt.textContent = p.name;
  providerSelect.appendChild(opt);
}

let currentProvider = PROVIDERS[0];

function updateUI() {
  const provider = PROVIDERS.find((p) => p.id === providerSelect.value) || PROVIDERS[0];
  currentProvider = provider;

  apiKeyInput.placeholder = provider.keyPlaceholder;
  if (provider.keyHelpUrl) {
    keyHelpLink.href = provider.keyHelpUrl;
    keyHelpLink.style.display = "inline-block";
  } else {
    keyHelpLink.style.display = "none";
  }

  // Reset model to default
  modelSelect.innerHTML = "";
  const defaultOpt = document.createElement("option");
  defaultOpt.value = provider.defaultModel;
  defaultOpt.textContent = provider.defaultModel;
  modelSelect.appendChild(defaultOpt);

  // Try to fetch models if we have an API key
  if (apiKeyInput.value) fetchModels(provider, apiKeyInput.value);
}

async function fetchModels(provider: ProviderEntry, apiKey: string) {
  modelsLoading.style.display = "inline";

  try {
    let url: string;
    const headers: Record<string, string> = { Accept: "application/json" };

    if (provider.format === "gemini") {
      url = `${provider.baseUrl}${provider.modelsEndpoint}?key=${apiKey}`;
    } else if (provider.format === "anthropic") {
      url = `${provider.baseUrl}${provider.modelsEndpoint}`;
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      url = `${provider.baseUrl.replace(/\/v1$/, "")}${provider.modelsEndpoint}`;
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      modelsLoading.style.display = "none";
      return;
    }

    const data = await response.json();

    // Parse models based on format
    let models: Array<{ id: string; name: string }> = [];

    if (provider.format === "gemini") {
      models = (data.models || [])
        .filter((m: { name: string }) => m.name.includes("gemini"))
        .map((m: { name: string; displayName?: string }) => ({
          id: m.name.replace("models/", ""),
          name: m.displayName || m.name.replace("models/", ""),
        }));
    } else if (provider.format === "anthropic") {
      models = (data.data || []).map((m: { id: string; display_name?: string }) => ({
        id: m.id,
        name: m.display_name || m.id,
      }));
    } else {
      models = (data.data || [])
        .filter((m: { id: string }) => !m.id.includes("whisper") && !m.id.includes("tts") && !m.id.includes("dall-e") && !m.id.includes("embedding"))
        .map((m: { id: string }) => ({ id: m.id, name: m.id }))
        .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
    }

    if (models.length > 0) {
      modelSelect.innerHTML = "";
      for (const m of models) {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;
        modelSelect.appendChild(opt);
      }
      // Try to select the default model
      const defaultIdx = models.findIndex((m) => m.id === provider.defaultModel);
      if (defaultIdx >= 0) modelSelect.selectedIndex = defaultIdx;
    }
  } catch (err) {
    console.warn("Failed to fetch models:", err);
  } finally {
    modelsLoading.style.display = "none";
  }
}

providerSelect.addEventListener("change", updateUI);

// Fetch models when API key changes (debounced)
let debounceTimer: ReturnType<typeof setTimeout>;
apiKeyInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (apiKeyInput.value.length > 10) {
      fetchModels(currentProvider, apiKeyInput.value);
    }
  }, 500);
});

// Save configuration
saveBtn.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showStatus("Please enter an API key", "error");
    return;
  }

  const config: ExtensionAIConfig = {
    provider: currentProvider.id,
    apiKey,
    model: modelSelect.value || currentProvider.defaultModel,
    supportsTools: providerSupportsTools(currentProvider.id),
  };

  await chrome.storage.local.set({ aiConfig: config });

  // Notify all game tabs about the config change
  const gameTabs = await chrome.tabs.query({
    url: ["http://localhost:3000/*", "https://aidnd-web.safats61.workers.dev/*"],
  });
  for (const tab of gameTabs) {
    if (tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "dm_config",
          provider: config.provider,
          supportsTools: config.supportsTools,
        });
      } catch {
        // Content script might not be loaded on this tab
      }
    }
  }

  showStatus("Saved! Extension connected.", "success");
});

function showStatus(message: string, type: "success" | "error" | "info") {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
}

// Load saved config on popup open
(async () => {
  const stored = await chrome.storage.local.get(["aiConfig"]);
  const config = stored.aiConfig as ExtensionAIConfig | undefined;

  if (config) {
    providerSelect.value = config.provider;
    apiKeyInput.value = config.apiKey;
    updateUI();

    // updateUI resets the model dropdown; restore saved model after fetch completes
    const savedModel = config.model;
    if (savedModel) {
      // Set immediately (default option), then re-set after models load
      modelSelect.value = savedModel;
      const observer = new MutationObserver(() => {
        modelSelect.value = savedModel;
        observer.disconnect();
      });
      observer.observe(modelSelect, { childList: true });
    }

    showStatus("Configured — ready to DM", "info");
  } else {
    updateUI();
  }
})();
