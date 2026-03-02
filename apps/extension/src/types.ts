// === Extension internal message types ===

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/** Stored AI configuration (in chrome.storage.local) */
export interface ExtensionAIConfig {
  ollamaUrl: string;
  model: string;
  supportsTools: boolean;
}

/** Model info from Ollama /api/tags */
export interface OllamaModelInfo {
  name: string;
  size: number;
  parameter_size: string;
  quantization_level: string;
}

/** Message from content script to background SW */
export interface DMRequestMessage {
  type: "dm_request";
  requestId: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

/** Response from background SW to content script */
export interface DMResponseMessage {
  type: "dm_response";
  requestId: string;
  text: string;
  error?: string;
}

/** Page → content script → extension */
export interface PageDMRequest {
  type: "aidnd:dm_request";
  payload: {
    type: "server:dm_request";
    requestId: string;
    systemPrompt: string;
    messages: { role: "user" | "assistant"; content: string }[];
  };
}

/** Extension → content script → page */
export interface PageDMResponse {
  type: "aidnd:dm_response";
  payload: {
    type: "client:dm_response";
    requestId: string;
    text: string;
    error?: string;
  };
}

/** Extension → content script → page (config update) */
export interface PageDMConfig {
  type: "aidnd:dm_config";
  payload: {
    type: "client:dm_config";
    provider: string;
    supportsTools: boolean;
  };
}
