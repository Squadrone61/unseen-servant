import * as fs from "fs";
import * as path from "path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MessageQueue } from "./message-queue.js";
import { WSClient } from "./ws-client.js";
import { CampaignManager } from "./services/campaign-manager.js";
import { GameLogger } from "./services/game-logger.js";
import { createMcpServer } from "./mcp-server.js";
import { log } from "./logger.js";

// Redirect stderr to a log file so bridge diagnostics are visible
const logPath = path.join(process.env.UNSEEN_CAMPAIGNS_DIR || ".", "..", "bridge.log");
const logStream = fs.createWriteStream(logPath, { flags: "a" });
const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: any, ...args: any[]) => {
  logStream.write(chunk);
  return origStderrWrite(chunk, ...args);
}) as typeof process.stderr.write;

log("mcp-bridge", `=== Bridge started at ${new Date().toISOString()} ===`);

const roomCode = process.env.UNSEEN_ROOM_CODE;
const workerUrl = process.env.UNSEEN_WORKER_URL || "http://127.0.0.1:8787";

if (!roomCode) {
  log(
    "mcp-bridge",
    "Error: UNSEEN_ROOM_CODE environment variable is required.\n" +
      "Usage: UNSEEN_ROOM_CODE=ABC123 npx tsx apps/mcp-bridge/src/index.ts",
  );
  process.exit(1);
}

// Create shared state
const messageQueue = new MessageQueue();
const campaignManager = new CampaignManager();
const gameLogger = new GameLogger(campaignManager);

// Create WebSocket client to worker
const wsClient = new WSClient({
  workerUrl,
  roomCode,
  messageQueue,
  campaignManager,
  gameLogger,
});

// Create MCP server with all tools (async — loads extended D&D database)
const mcpServer = await createMcpServer(messageQueue, wsClient, campaignManager, gameLogger);

// Connect WebSocket to worker room
wsClient.connect();

// Start MCP stdio transport
const transport = new StdioServerTransport();
await mcpServer.connect(transport);

log("mcp-bridge", `MCP server started, connected to room ${roomCode}`);

// Graceful shutdown: close WebSocket cleanly so the worker detects DM disconnect
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log("mcp-bridge", `Received ${sig}, flushing state and closing...`);
    wsClient.gameStateManager.forceFlush();
    gameLogger.close();
    wsClient.close();
    process.exit(0);
  });
}
