import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MessageQueue } from "./message-queue.js";
import { WSClient } from "./ws-client.js";
import { CampaignManager } from "./services/campaign-manager.js";
import { createMcpServer } from "./mcp-server.js";

const roomCode = process.env.AIDND_ROOM_CODE;
const workerUrl = process.env.AIDND_WORKER_URL || "http://localhost:8787";

if (!roomCode) {
  console.error(
    "Error: AIDND_ROOM_CODE environment variable is required.\n" +
      "Usage: AIDND_ROOM_CODE=ABC123 npx tsx apps/mcp-bridge/src/index.ts"
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

// Create MCP server with all tools
const mcpServer = createMcpServer(messageQueue, wsClient, campaignManager);

// Connect WebSocket to worker room
wsClient.connect();

// Start MCP stdio transport
const transport = new StdioServerTransport();
await mcpServer.connect(transport);

console.error(`[mcp-bridge] MCP server started, connected to room ${roomCode}`);
