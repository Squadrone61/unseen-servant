import type { ExtensionAIConfig } from "./types";
import {
  callAIRaw,
  buildAnthropicToolResults,
  buildOpenAIToolResults,
  buildGeminiToolResults,
  type ConversationMessage,
  type RawMessage,
} from "./ai-service";
import { DND_TOOLS, toAnthropicTools, toOpenAITools, toGeminiTools, executeToolCall } from "./dnd-tools";

const MAX_TOOL_ROUNDS = 3;

const PROVIDERS_FORMAT: Record<string, "anthropic" | "openai" | "gemini"> = {
  anthropic: "anthropic",
  openai: "openai",
  groq: "openai",
  deepseek: "openai",
  gemini: "gemini",
  xai: "openai",
  mistral: "openai",
  openrouter: "openai",
};

/**
 * Call AI with D&D 5e tool-use support.
 * Handles the tool-use loop internally (up to MAX_TOOL_ROUNDS rounds).
 * Returns the final text response.
 */
export async function callAIWithTools(
  config: ExtensionAIConfig,
  systemPrompt: string,
  messages: ConversationMessage[],
): Promise<{ text: string }> {
  const format = PROVIDERS_FORMAT[config.provider] ?? "openai";
  const tools = format === "anthropic" ? toAnthropicTools(DND_TOOLS)
    : format === "gemini" ? toGeminiTools(DND_TOOLS)
    : toOpenAITools(DND_TOOLS);

  // Convert conversation to native format
  const tempMessages: RawMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
  let textAccumulator = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await callAIRaw(config, systemPrompt, tempMessages, tools);

    if (result.text) textAccumulator += result.text;

    if (result.stopReason === "text" || result.toolCalls.length === 0) {
      return { text: textAccumulator || result.text || "" };
    }

    // Execute tool calls
    const toolResults = await Promise.all(
      result.toolCalls.map(async (tc) => {
        const execResult = await executeToolCall(tc.name, tc.arguments);
        return {
          id: tc.id,
          name: tc.name,
          content: execResult.content,
          isError: execResult.isError,
        };
      }),
    );

    for (const tr of toolResults) {
      console.log(`[tool-loop] ${tr.name}: ${tr.isError ? "ERROR" : "OK"} (${tr.content.length} chars)`);
    }

    // Append assistant message and tool results
    tempMessages.push(result.rawAssistantMessage);

    if (format === "anthropic") {
      tempMessages.push(buildAnthropicToolResults(
        toolResults.map((r) => ({ toolUseId: r.id, content: r.content, isError: r.isError })),
      ));
    } else if (format === "gemini") {
      tempMessages.push(buildGeminiToolResults(
        toolResults.map((r) => ({ name: r.name, content: r.content })),
      ));
    } else {
      tempMessages.push(...buildOpenAIToolResults(
        toolResults.map((r) => ({ toolCallId: r.id, content: r.content })),
      ));
    }
  }

  // Exhausted tool rounds — force text completion without tools
  console.warn(`[tool-loop] Exhausted ${MAX_TOOL_ROUNDS} tool rounds, forcing text completion`);
  const finalResult = await callAIRaw(config, systemPrompt, tempMessages);
  return { text: textAccumulator + (finalResult.text || "") };
}

/**
 * Check if a provider supports native tool-use.
 */
export function providerSupportsTools(providerId: string): boolean {
  if (providerId === "anthropic") return true;
  if (providerId === "openai") return true;
  if (providerId === "gemini") return true;
  return false;
}
