import * as fs from "fs";
import * as path from "path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MessageQueue } from "./message-queue.js";
import { WSClient } from "./ws-client.js";
import { CampaignManager } from "./services/campaign-manager.js";
import { createMcpServer } from "./mcp-server.js";

// Redirect stderr to a log file so bridge diagnostics are visible
const logPath = path.join(process.env.UNSEEN_CAMPAIGNS_DIR || ".", "..", "bridge.log");
const logStream = fs.createWriteStream(logPath, { flags: "a" });
const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: any, ...args: any[]) => {
  logStream.write(chunk);
  return origStderrWrite(chunk, ...args);
}) as typeof process.stderr.write;

console.error(`\n[mcp-bridge] === Bridge started at ${new Date().toISOString()} ===`);

const roomCode = process.env.UNSEEN_ROOM_CODE;
const workerUrl = process.env.UNSEEN_WORKER_URL || "http://127.0.0.1:8787";

if (!roomCode) {
  console.error(
    "Error: UNSEEN_ROOM_CODE environment variable is required.\n" +
      "Usage: UNSEEN_ROOM_CODE=ABC123 npx tsx apps/mcp-bridge/src/index.ts",
  );
  process.exit(1);
}

// Create shared state
const messageQueue = new MessageQueue();
const campaignManager = new CampaignManager();

// Create WebSocket client to worker
const wsClient = new WSClient({
  workerUrl,
  roomCode,
  messageQueue,
  campaignManager,
});

// Create MCP server with all tools (async — loads extended D&D database)
const mcpServer = await createMcpServer(messageQueue, wsClient, campaignManager);

// Connect WebSocket to worker room
wsClient.connect();

// Start MCP stdio transport
const transport = new StdioServerTransport();
await mcpServer.connect(transport);

console.error(`[mcp-bridge] MCP server started, connected to room ${roomCode}`);
