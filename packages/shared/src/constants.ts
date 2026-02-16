export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS_PER_ROOM = 6;
export const MAX_MESSAGE_LENGTH = 2000;
export const DEFAULT_MAX_TOKENS = 1024;

// === AI Provider Registry ===

export type AIProviderFormat = "openai" | "anthropic" | "gemini";

export interface AIProviderModel {
  id: string;
  name: string;
}

export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  format: AIProviderFormat;
  defaultModel: string;
  modelsEndpoint: string;
  keyPlaceholder: string;
  keyHelpUrl: string;
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    format: "anthropic",
    defaultModel: "claude-sonnet-4-5-20250929",
    modelsEndpoint: "/v1/models",
    keyPlaceholder: "sk-ant-api03-...",
    keyHelpUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    format: "openai",
    defaultModel: "gpt-4o",
    modelsEndpoint: "/v1/models",
    keyPlaceholder: "sk-...",
    keyHelpUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    format: "openai",
    defaultModel: "llama-3.3-70b-versatile",
    modelsEndpoint: "/openai/v1/models",
    keyPlaceholder: "gsk_...",
    keyHelpUrl: "https://console.groq.com/keys",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    format: "openai",
    defaultModel: "deepseek-chat",
    modelsEndpoint: "/models",
    keyPlaceholder: "sk-...",
    keyHelpUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    format: "gemini",
    defaultModel: "gemini-2.5-flash",
    modelsEndpoint: "/v1beta/models",
    keyPlaceholder: "AIza...",
    keyHelpUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    format: "openai",
    defaultModel: "grok-3",
    modelsEndpoint: "/v1/models",
    keyPlaceholder: "xai-...",
    keyHelpUrl: "https://console.x.ai/",
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    format: "openai",
    defaultModel: "mistral-large-latest",
    modelsEndpoint: "/v1/models",
    keyPlaceholder: "...",
    keyHelpUrl: "https://console.mistral.ai/api-keys/",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    format: "openai",
    defaultModel: "anthropic/claude-sonnet-4.5",
    modelsEndpoint: "/api/v1/models",
    keyPlaceholder: "sk-or-v1-...",
    keyHelpUrl: "https://openrouter.ai/keys",
  },
];

export function getProvider(id: string): AIProvider | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}
