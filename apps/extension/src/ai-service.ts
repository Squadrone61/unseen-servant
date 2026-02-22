import type { ExtensionAIConfig } from "./types";

const DEFAULT_MAX_TOKENS = 4096;

interface AIProviderInfo {
  baseUrl: string;
  format: "anthropic" | "openai" | "gemini";
}

const PROVIDERS: Record<string, AIProviderInfo> = {
  anthropic: { baseUrl: "https://api.anthropic.com", format: "anthropic" },
  openai: { baseUrl: "https://api.openai.com/v1", format: "openai" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", format: "openai" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", format: "openai" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com", format: "gemini" },
  xai: { baseUrl: "https://api.x.ai/v1", format: "openai" },
  mistral: { baseUrl: "https://api.mistral.ai/v1", format: "openai" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", format: "openai" },
};

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawMessage = Record<string, any>;

export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface CallAIRawResult {
  text: string | null;
  toolCalls: ToolCallInfo[];
  stopReason: "text" | "tool_use";
  rawAssistantMessage: RawMessage;
}

function getProviderInfo(providerId: string): AIProviderInfo {
  const info = PROVIDERS[providerId];
  if (!info) throw new Error(`Unknown AI provider: ${providerId}`);
  return info;
}

/**
 * Determine auth headers for a provider.
 */
function getAuthHeaders(config: ExtensionAIConfig, info: AIProviderInfo): Record<string, string> {
  if (info.format === "anthropic") {
    return {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    };
  }
  if (info.format === "gemini") {
    return {}; // API key goes in URL
  }
  return {
    Authorization: `Bearer ${config.apiKey}`,
  };
}

/**
 * Simple AI call without tool support.
 */
export async function callAI(
  config: ExtensionAIConfig,
  systemPrompt: string,
  messages: ConversationMessage[],
): Promise<{ text: string }> {
  const info = getProviderInfo(config.provider);

  switch (info.format) {
    case "openai":
      return callOpenAI(config, info, systemPrompt, messages);
    case "anthropic":
      return callAnthropic(config, info, systemPrompt, messages);
    case "gemini":
      return callGemini(config, info, systemPrompt, messages);
  }
}

async function callOpenAI(
  config: ExtensionAIConfig,
  info: AIProviderInfo,
  systemPrompt: string,
  messages: ConversationMessage[],
): Promise<{ text: string }> {
  const url = `${info.baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders(config, info) },
    body: JSON.stringify({
      model: config.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  if (!response.ok) throw new Error(await parseError(response, config.provider));

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return { text: data.choices?.[0]?.message?.content ?? "" };
}

async function callAnthropic(
  config: ExtensionAIConfig,
  info: AIProviderInfo,
  systemPrompt: string,
  messages: ConversationMessage[],
): Promise<{ text: string }> {
  const url = `${info.baseUrl}/v1/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders(config, info) },
    body: JSON.stringify({
      model: config.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) throw new Error(await parseError(response, config.provider));

  const data = await response.json() as { content: Array<{ type: string; text?: string }> };
  return { text: data.content?.find((b) => b.type === "text")?.text ?? "" };
}

async function callGemini(
  config: ExtensionAIConfig,
  info: AIProviderInfo,
  systemPrompt: string,
  messages: ConversationMessage[],
): Promise<{ text: string }> {
  const url = `${info.baseUrl}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: DEFAULT_MAX_TOKENS },
    }),
  });

  if (!response.ok) throw new Error(await parseError(response, config.provider));

  const data = await response.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "" };
}

/**
 * Raw AI call with tool-use support (Anthropic + OpenAI only).
 */
export async function callAIRaw(
  config: ExtensionAIConfig,
  systemPrompt: string,
  messages: RawMessage[],
  tools?: unknown,
): Promise<CallAIRawResult> {
  const info = getProviderInfo(config.provider);

  switch (info.format) {
    case "anthropic":
      return callAnthropicRaw(config, info, systemPrompt, messages, tools);
    case "openai":
      return callOpenAIRaw(config, info, systemPrompt, messages, tools);
    case "gemini":
      return callGeminiRaw(config, info, systemPrompt, messages, tools);
  }
}

async function callAnthropicRaw(
  config: ExtensionAIConfig,
  info: AIProviderInfo,
  systemPrompt: string,
  messages: RawMessage[],
  tools: unknown,
): Promise<CallAIRawResult> {
  const url = `${info.baseUrl}/v1/messages`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model: config.model,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: systemPrompt,
    messages,
  };
  if (tools) body.tools = tools;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders(config, info) },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(await parseError(response, config.provider));

  const data = await response.json() as {
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    stop_reason: string;
  };

  const text = data.content.filter((b) => b.type === "text").map((b) => b.text || "").join("") || null;
  const toolCalls: ToolCallInfo[] = data.content
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ id: b.id!, name: b.name!, arguments: b.input || {} }));

  return {
    text,
    toolCalls,
    stopReason: data.stop_reason === "tool_use" ? "tool_use" : "text",
    rawAssistantMessage: { role: "assistant", content: data.content },
  };
}

async function callOpenAIRaw(
  config: ExtensionAIConfig,
  info: AIProviderInfo,
  systemPrompt: string,
  messages: RawMessage[],
  tools: unknown,
): Promise<CallAIRawResult> {
  const url = `${info.baseUrl}/chat/completions`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model: config.model,
    max_tokens: DEFAULT_MAX_TOKENS,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  };
  if (tools) body.tools = tools;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders(config, info) },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(await parseError(response, config.provider));

  const data = await response.json() as {
    choices: Array<{
      message: {
        content: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
      finish_reason: string;
    }>;
  };

  const choice = data.choices?.[0];
  if (!choice) throw new Error(`${config.provider}: empty response`);

  const text = choice.message.content || null;
  const toolCalls: ToolCallInfo[] = (choice.message.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: safeParseJSON(tc.function.arguments),
  }));

  return {
    text,
    toolCalls,
    stopReason: choice.finish_reason === "tool_calls" ? "tool_use" : "text",
    rawAssistantMessage: {
      role: "assistant",
      content: choice.message.content,
      ...(choice.message.tool_calls ? { tool_calls: choice.message.tool_calls } : {}),
    },
  };
}

async function callGeminiRaw(
  config: ExtensionAIConfig,
  info: AIProviderInfo,
  systemPrompt: string,
  messages: RawMessage[],
  tools: unknown,
): Promise<CallAIRawResult> {
  const url = `${info.baseUrl}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

  // Convert messages to Gemini format — messages may already be in Gemini native
  // format (role: "model", parts with functionCall/functionResponse) from prior
  // tool-loop rounds, or simple { role, content } strings from the initial call.
  const contents = messages.map((m) => {
    if (m.parts) return m; // Already in Gemini native format
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: DEFAULT_MAX_TOKENS },
  };
  if (tools) body.tools = [tools];

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(await parseError(response, config.provider));

  const data = await response.json() as {
    candidates: Array<{
      content: { role: string; parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> };
      finishReason: string;
    }>;
  };

  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error(`${config.provider}: empty response`);

  const parts = candidate.content?.parts || [];
  const textParts = parts.filter((p) => p.text).map((p) => p.text!);
  const text = textParts.length > 0 ? textParts.join("") : null;

  const toolCalls: ToolCallInfo[] = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({
      id: `gemini-fc-${i}`,
      name: p.functionCall!.name,
      arguments: p.functionCall!.args || {},
    }));

  return {
    text,
    toolCalls,
    stopReason: toolCalls.length > 0 ? "tool_use" : "text",
    rawAssistantMessage: { role: "model", parts },
  };
}

export function buildGeminiToolResults(
  results: Array<{ name: string; content: string }>,
): RawMessage {
  return {
    role: "user",
    parts: results.map((r) => ({
      functionResponse: {
        name: r.name,
        response: { result: r.content },
      },
    })),
  };
}

export function buildAnthropicToolResults(
  results: Array<{ toolUseId: string; content: string; isError: boolean }>,
): RawMessage {
  return {
    role: "user",
    content: results.map((r) => ({
      type: "tool_result",
      tool_use_id: r.toolUseId,
      content: r.content,
      is_error: r.isError,
    })),
  };
}

export function buildOpenAIToolResults(
  results: Array<{ toolCallId: string; content: string }>,
): RawMessage[] {
  return results.map((r) => ({
    role: "tool",
    tool_call_id: r.toolCallId,
    content: r.content,
  }));
}

async function parseError(response: Response, provider: string): Promise<string> {
  try {
    const body = await response.text();
    try {
      const json = JSON.parse(body);
      const msg = json?.error?.message ?? json?.message ?? json?.error?.status;
      if (msg) return `${provider} API error (${response.status}): ${msg}`;
    } catch { /* not JSON */ }
    return `${provider} API error (${response.status}): ${body.slice(0, 200)}`;
  } catch {
    return `${provider} API error (${response.status}): ${response.statusText}`;
  }
}

function safeParseJSON(str: string): Record<string, unknown> {
  try { return JSON.parse(str); } catch { return {}; }
}
