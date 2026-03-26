/**
 * Server mode — runs the MCP bridge (stdio transport).
 * Reuses all code from apps/mcp-bridge/src/ (bundled by esbuild).
 */

import * as fs from "fs";
import * as path from "path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MessageQueue } from "../../mcp-bridge/src/message-queue.js";
import { WSClient } from "../../mcp-bridge/src/ws-client.js";
import { CampaignManager } from "../../mcp-bridge/src/services/campaign-manager.js";
import { createMcpServer } from "../../mcp-bridge/src/mcp-server.js";

declare const PRODUCTION_WORKER_URL: string;

export async function startServer(): Promise<void> {
  // Tee stderr to a log file so bridge diagnostics are visible
  const campaignsDir = process.env.UNSEEN_CAMPAIGNS_DIR || ".";
  const logPath = path.join(campaignsDir, "..", "bridge.log");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: any, ...args: any[]) => {
    logStream.write(chunk);
    return origWrite(chunk, ...args);
  }) as typeof process.stderr.write;
  console.error(`\n[bridge] === Started at ${new Date().toISOString()} ===`);

  const roomCode = process.env.UNSEEN_ROOM_CODE;
  const workerUrl =
    process.env.UNSEEN_WORKER_URL ||
    (typeof PRODUCTION_WORKER_URL !== "undefined"
      ? PRODUCTION_WORKER_URL
      : "http://127.0.0.1:8787");

  if (!roomCode) {
    console.error(
      "Error: UNSEEN_ROOM_CODE environment variable is required.\n" +
        "This is set automatically by the CLI launcher.",
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

  const mcpServer = await createMcpServer(messageQueue, wsClient, campaignManager);

  wsClient.connect();

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  console.error(
    `[unseen-servant] MCP server started, connected to room ${roomCode} via ${workerUrl}`,
  );
}
