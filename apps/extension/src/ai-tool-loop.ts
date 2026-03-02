import type { ExtensionAIConfig } from "./types";
import {
  callAIRaw,
  buildOllamaToolResults,
  type ConversationMessage,
  type RawMessage,
} from "./ai-service";
import { DND_TOOLS, toOpenAITools, executeToolCall } from "./dnd-tools";

const MAX_TOOL_ROUNDS = 3;

/**
 * Call Ollama with D&D 5e tool-use support.
 * Handles the tool-use loop internally (up to MAX_TOOL_ROUNDS rounds).
 * Ollama uses OpenAI-compatible tool format.
 */
export async function callAIWithTools(
  config: ExtensionAIConfig,
  systemPrompt: string,
  messages: ConversationMessage[],
): Promise<{ text: string }> {
  const tools = toOpenAITools(DND_TOOLS);
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
    tempMessages.push(...buildOllamaToolResults(
      toolResults.map((r) => ({ content: r.content })),
    ));
  }

  // Exhausted tool rounds — force text completion without tools
  console.warn(`[tool-loop] Exhausted ${MAX_TOOL_ROUNDS} tool rounds, forcing text completion`);
  const finalResult = await callAIRaw(config, systemPrompt, tempMessages);
  return { text: textAccumulator + (finalResult.text || "") };
}
