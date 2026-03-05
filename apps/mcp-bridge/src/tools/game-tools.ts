import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MessageQueue } from "../message-queue.js";
import type { WSClient } from "../ws-client.js";

export function registerGameTools(
  server: McpServer,
  messageQueue: MessageQueue,
  wsClient: WSClient
): void {
  server.tool(
    "wait_for_message",
    "Block until a player message or DM request arrives via WebSocket. Returns the request with systemPrompt and conversation messages. This is the main loop driver — call this repeatedly to process game turns.",
    {},
    async () => {
      const msg = await messageQueue.waitForNext();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                requestId: msg.requestId,
                systemPrompt: msg.systemPrompt,
                messages: msg.messages,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "send_response",
    "Send the DM narrative response back to the game room via WebSocket. The worker will broadcast it to all players and resolve any structured actions.",
    {
      requestId: z
        .string()
        .describe("The requestId from the dm_request to respond to"),
      text: z
        .string()
        .describe("The DM narrative text to send back to the players"),
    },
    async ({ requestId, text }) => {
      wsClient.sendDMResponse(requestId, text);
      return {
        content: [
          {
            type: "text" as const,
            text: `Response sent for request ${requestId} (${text.length} chars)`,
          },
        ],
      };
    }
  );

  server.tool(
    "get_players",
    "Get the current player list with character summaries. Useful for understanding who is in the party and their current state.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                connected: wsClient.connected,
                storyStarted: wsClient.storyStarted,
                players: wsClient.players,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
