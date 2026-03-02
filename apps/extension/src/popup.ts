import { DEFAULT_OLLAMA_URL, type ExtensionAIConfig, type OllamaModelInfo } from "./types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ollamaUrlInput = $<HTMLInputElement>("ollamaUrl");
const checkBtn = $<HTMLButtonElement>("checkBtn");
const connectionStatus = $<HTMLDivElement>("connectionStatus");
const modelSelect = $<HTMLSelectElement>("model");
const modelInfo = $<HTMLDivElement>("modelInfo");
const toolStatus = $<HTMLDivElement>("toolStatus");
const saveBtn = $<HTMLButtonElement>("save");
const statusDiv = $<HTMLDivElement>("status");

let models: OllamaModelInfo[] = [];
let currentSupportsTools = false;

function setConnectionStatus(state: "connected" | "disconnected" | "checking", text: string) {
  connectionStatus.textContent = text;
  connectionStatus.className = `connection-status ${state}`;
}

function setModelPlaceholder(text: string, disabled: boolean) {
  modelSelect.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = text;
  opt.disabled = true;
  opt.selected = true;
  modelSelect.appendChild(opt);
  modelSelect.disabled = disabled;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

async function checkConnection(url: string): Promise<void> {
  setConnectionStatus("checking", "Connecting...");
  setModelPlaceholder("Checking...", true);
  modelInfo.textContent = "";
  toolStatus.className = "tool-status";

  try {
    const response = await fetch(`${url}/api/tags`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json() as {
      models: Array<{
        name: string;
        size: number;
        details: { parameter_size: string; quantization_level: string };
      }>;
    };

    models = (data.models || []).map((m) => ({
      name: m.name,
      size: m.size,
      parameter_size: m.details?.parameter_size ?? "",
      quantization_level: m.details?.quantization_level ?? "",
    }));

    if (models.length === 0) {
      setConnectionStatus("disconnected", "Connected but no models found. Run: ollama pull qwen3");
      setModelPlaceholder("No models available", true);
      return;
    }

    setConnectionStatus("connected", `Connected \u2014 ${models.length} model(s)`);

    // Populate model dropdown
    modelSelect.innerHTML = "";
    modelSelect.disabled = false;
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.name;
      const parts = [m.name];
      if (m.parameter_size) parts.push(m.parameter_size);
      if (m.quantization_level) parts.push(m.quantization_level);
      opt.textContent = parts.join(" \u2014 ");
      modelSelect.appendChild(opt);
    }

    // Auto-check tool support for the first model
    await checkToolSupport(url, models[0].name);
  } catch {
    models = [];
    setConnectionStatus("disconnected", "Cannot reach Ollama. Is it running?");
    setModelPlaceholder("No connection", true);
  }
}

async function checkToolSupport(url: string, modelName: string): Promise<void> {
  currentSupportsTools = false;
  toolStatus.className = "tool-status";

  // Show model info
  const m = models.find((m) => m.name === modelName);
  if (m) {
    const parts: string[] = [];
    if (m.parameter_size) parts.push(m.parameter_size);
    if (m.quantization_level) parts.push(m.quantization_level);
    if (m.size) parts.push(formatFileSize(m.size));
    modelInfo.textContent = parts.join(" \u2022 ");
  } else {
    modelInfo.textContent = "";
  }

  try {
    const response = await fetch(`${url}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) return;

    const data = await response.json() as { template?: string };
    const template = data.template ?? "";

    if (template.includes("{{ .Tools }}") || template.includes("{{.Tools}}") || template.includes("{{ if .Tools }}") || template.includes("{{- if .Tools }}")) {
      currentSupportsTools = true;
      toolStatus.textContent = "D&D tool-use supported";
      toolStatus.className = "tool-status supported";
    } else {
      currentSupportsTools = false;
      toolStatus.textContent = "No tool-use \u2014 will use context injection";
      toolStatus.className = "tool-status unsupported";
    }
  } catch {
    // Can't determine — default to false
    toolStatus.textContent = "Could not check tool support";
    toolStatus.className = "tool-status unsupported";
  }
}

// Event: model change → check tool support
modelSelect.addEventListener("change", () => {
  const url = ollamaUrlInput.value.trim() || DEFAULT_OLLAMA_URL;
  if (modelSelect.value) {
    checkToolSupport(url, modelSelect.value);
  }
});

// Event: URL change → debounced auto-reconnect
let debounceTimer: ReturnType<typeof setTimeout>;
ollamaUrlInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const url = ollamaUrlInput.value.trim() || DEFAULT_OLLAMA_URL;
    checkConnection(url);
  }, 800);
});

// Event: check button → immediate reconnect
checkBtn.addEventListener("click", () => {
  const url = ollamaUrlInput.value.trim() || DEFAULT_OLLAMA_URL;
  checkConnection(url);
});

// Event: save
saveBtn.addEventListener("click", async () => {
  if (!modelSelect.value) {
    showStatus("Please select a model", "error");
    return;
  }

  const config: ExtensionAIConfig = {
    ollamaUrl: ollamaUrlInput.value.trim() || DEFAULT_OLLAMA_URL,
    model: modelSelect.value,
    supportsTools: currentSupportsTools,
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
          provider: "ollama",
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
    ollamaUrlInput.value = config.ollamaUrl || DEFAULT_OLLAMA_URL;

    // Check connection and restore saved model
    const savedModel = config.model;
    await checkConnection(config.ollamaUrl || DEFAULT_OLLAMA_URL);

    if (savedModel) {
      const hasOption = Array.from(modelSelect.options).some((o) => o.value === savedModel);
      if (hasOption) {
        modelSelect.value = savedModel;
        await checkToolSupport(config.ollamaUrl || DEFAULT_OLLAMA_URL, savedModel);
      }
    }

    showStatus("Configured \u2014 ready to DM", "info");
  } else {
    ollamaUrlInput.value = DEFAULT_OLLAMA_URL;
    checkConnection(DEFAULT_OLLAMA_URL);
  }
})();
