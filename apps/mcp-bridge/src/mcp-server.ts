import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MessageQueue } from "./message-queue.js";
import type { WSClient } from "./ws-client.js";
import type { CampaignManager } from "./services/campaign-manager.js";
import type { GameLogger } from "./services/game-logger.js";
import { registerGameTools } from "./tools/game-tools.js";
import { registerDndTools } from "./tools/dnd-tools.js";
import { registerSrdTools } from "./tools/srd-tools.js";
import { registerCampaignTools } from "./tools/campaign-tools.js";

export async function createMcpServer(
  messageQueue: MessageQueue,
  wsClient: WSClient,
  campaignManager: CampaignManager,
  gameLogger: GameLogger,
): Promise<McpServer> {
  const server = new McpServer({
    name: "unseen-servant",
    version: "1.0.0",
  });

  registerGameTools(server, messageQueue, wsClient, gameLogger);
  registerDndTools(server, wsClient, gameLogger);
  registerSrdTools(server, wsClient, gameLogger);
  registerCampaignTools(server, campaignManager, wsClient, gameLogger);

  return server;
}
