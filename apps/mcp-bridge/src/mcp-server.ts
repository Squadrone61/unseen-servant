import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MessageQueue } from "./message-queue.js";
import type { WSClient } from "./ws-client.js";
import type { CampaignManager } from "./services/campaign-manager.js";
import { registerGameTools } from "./tools/game-tools.js";
import { registerDndTools } from "./tools/dnd-tools.js";
import { registerCampaignTools } from "./tools/campaign-tools.js";

export function createMcpServer(
  messageQueue: MessageQueue,
  wsClient: WSClient,
  campaignManager: CampaignManager
): McpServer {
  const server = new McpServer({
    name: "aidnd-dm",
    version: "1.0.0",
  });

  registerGameTools(server, messageQueue, wsClient);
  registerDndTools(server);
  registerCampaignTools(server, campaignManager);

  return server;
}
