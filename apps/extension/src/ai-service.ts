import type { ExtensionAIConfig } from "./types";

const DEFAULT_NUM_PREDICT = 4096;

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

/**
 * Simple AI call without tool support — POST to Ollama /api/chat.
 */
export async function callAI(
  config: ExtensionAIConfig,
  systemPrompt: string,
  messages: ConversationMessage[],
): Promise<{ text: string }> {
  const url = `${config.ollamaUrl}/api/chat`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      options: { num_predict: DEFAULT_NUM_PREDICT },
    }),
  });

  if (!response.ok) throw new Error(await parseOllamaError(response));

  const data = await response.json() as { message: { content: string } };
  return { text: data.message?.content ?? "" };
}

/**
 * Raw AI call with tool-use support — POST to Ollama /api/chat with tools.
 * Ollama returns tool_calls with `arguments` already parsed (object, not string).
 * Ollama does not return `tool_call_id`, so we generate synthetic IDs.
 */
export async function callAIRaw(
  config: ExtensionAIConfig,
  systemPrompt: string,
  messages: RawMessage[],
  tools?: unknown,
): Promise<CallAIRawResult> {
  const url = `${config.ollamaUrl}/api/chat`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model: config.model,
    stream: false,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    options: { num_predict: DEFAULT_NUM_PREDICT },
  };
  if (tools) body.tools = tools;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(await parseOllamaError(response));

  const data = await response.json() as {
    message: {
      role: string;
      content: string;
      tool_calls?: Array<{
        function: { name: string; arguments: Record<string, unknown> };
      }>;
    };
  };

  const msg = data.message;
  const text = msg.content || null;

  const toolCalls: ToolCallInfo[] = (msg.tool_calls || []).map((tc, i) => ({
    id: `ollama-tc-${Date.now()}-${i}`,
    name: tc.function.name,
    arguments: tc.function.arguments || {},
  }));

  return {
    text,
    toolCalls,
    stopReason: toolCalls.length > 0 ? "tool_use" : "text",
    rawAssistantMessage: msg,
  };
}

/**
 * Build Ollama tool result messages.
 * Ollama expects one { role: "tool", content } message per tool result.
 */
export function buildOllamaToolResults(
  results: Array<{ content: string }>,
): RawMessage[] {
  return results.map((r) => ({
    role: "tool",
    content: r.content,
  }));
}

async function parseOllamaError(response: Response): Promise<string> {
  try {
    const body = await response.text();
    try {
      const json = JSON.parse(body);
      if (json?.error) return `Ollama error (${response.status}): ${json.error}`;
    } catch { /* not JSON */ }
    return `Ollama error (${response.status}): ${body.slice(0, 200)}`;
  } catch {
    return `Ollama error (${response.status}): ${response.statusText}`;
  }
}
