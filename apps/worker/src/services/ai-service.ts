import type { AIConfig } from "@aidnd/shared/types";
import { getProvider, DEFAULT_MAX_TOKENS } from "@aidnd/shared";
import type { AIProvider } from "@aidnd/shared";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface CallAIParams {
  aiConfig: AIConfig;
  systemPrompt: string;
  messages: ConversationMessage[];
  maxTokens?: number;
}

interface CallAIResult {
  text: string;
}

export async function callAI(params: CallAIParams): Promise<CallAIResult> {
  const provider = getProvider(params.aiConfig.provider);
  if (!provider) {
    throw new Error(`Unknown AI provider: ${params.aiConfig.provider}`);
  }

  const model = params.aiConfig.model || provider.defaultModel;
  const maxTokens = params.maxTokens ?? DEFAULT_MAX_TOKENS;

  switch (provider.format) {
    case "openai":
      return callOpenAICompatible(provider, params.aiConfig.apiKey, model, params.systemPrompt, params.messages, maxTokens);
    case "anthropic":
      return callAnthropic(provider, params.aiConfig.apiKey, model, params.systemPrompt, params.messages, maxTokens);
    case "gemini":
      return callGemini(provider, params.aiConfig.apiKey, model, params.systemPrompt, params.messages, maxTokens);
    default:
      throw new Error(`Unsupported provider format: ${provider.format}`);
  }
}

// --- OpenAI-compatible format ---
// Covers: OpenAI, Groq, DeepSeek, xAI, Mistral, OpenRouter

async function callOpenAICompatible(
  provider: AIProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ConversationMessage[],
  maxTokens: number,
): Promise<CallAIResult> {
  const url = `${provider.baseUrl}/chat/completions`;

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await parseErrorResponse(response, provider.name);
    throw new Error(errorText);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = data.choices?.[0]?.message?.content ?? "";
  return { text };
}

// --- Anthropic format ---

async function callAnthropic(
  provider: AIProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ConversationMessage[],
  maxTokens: number,
): Promise<CallAIResult> {
  const url = `${provider.baseUrl}/v1/messages`;

  const body = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await parseErrorResponse(response, provider.name);
    throw new Error(errorText);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  const text =
    data.content?.find((block) => block.type === "text")?.text ?? "";
  return { text };
}

// --- Google Gemini format ---

async function callGemini(
  provider: AIProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ConversationMessage[],
  maxTokens: number,
): Promise<CallAIResult> {
  const url = `${provider.baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await parseErrorResponse(response, provider.name);
    throw new Error(errorText);
  }

  const data = (await response.json()) as {
    candidates: Array<{
      content: { parts: Array<{ text: string }> };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { text };
}

// --- Error parsing ---

async function parseErrorResponse(
  response: Response,
  providerName: string,
): Promise<string> {
  try {
    const body = await response.text();
    let errorMessage: string | undefined;

    try {
      const json = JSON.parse(body);
      // OpenAI format: { error: { message: "..." } }
      // Anthropic format: { error: { message: "..." } }
      // Gemini format: { error: { message: "..." } }
      errorMessage =
        json?.error?.message ??
        json?.message ??
        json?.error?.status ??
        undefined;
    } catch {
      // Not JSON, use raw body
      errorMessage = body.slice(0, 200);
    }

    return `${providerName} API error (${response.status}): ${errorMessage || response.statusText}`;
  } catch {
    return `${providerName} API error (${response.status}): ${response.statusText}`;
  }
}
