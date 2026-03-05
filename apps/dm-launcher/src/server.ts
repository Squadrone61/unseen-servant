/**
 * Server mode — runs the MCP bridge (stdio transport).
 * Reuses all code from apps/mcp-bridge/src/ (bundled by esbuild).
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MessageQueue } from "../../mcp-bridge/src/message-queue.js";
import { WSClient } from "../../mcp-bridge/src/ws-client.js";
import { CampaignManager } from "../../mcp-bridge/src/services/campaign-manager.js";
import { createMcpServer } from "../../mcp-bridge/src/mcp-server.js";

declare const PRODUCTION_WORKER_URL: string;

export async function startServer(): Promise<void> {
  const roomCode = process.env.AIDND_ROOM_CODE;
  const workerUrl =
    process.env.AIDND_WORKER_URL ||
    (typeof PRODUCTION_WORKER_URL !== "undefined"
      ? PRODUCTION_WORKER_URL
      : "http://localhost:8787");

  if (!roomCode) {
    console.error(
      "Error: AIDND_ROOM_CODE environment variable is required.\n" +
        "This is set automatically by the CLI launcher."
    );
    process.exit(1);
  }

  const messageQueue = new MessageQueue();
  const campaignManager = new CampaignManager();

  const wsClient = new WSClient({
    workerUrl,
    roomCode,
    messageQueue,
    campaignManager,
  });

  const mcpServer = createMcpServer(messageQueue, wsClient, campaignManager);

  wsClient.connect();

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  console.error(
    `[aidnd-dm] MCP server started, connected to room ${roomCode} via ${workerUrl}`
  );
}
