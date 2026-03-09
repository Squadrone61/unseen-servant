import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { MessageQueue } from "./message-queue.js";
import type { WSClient } from "./ws-client.js";
import type { CampaignManager } from "./services/campaign-manager.js";
import { SrdLookup, LAYOUT_51 } from "./services/srd-lookup.js";
import { registerGameTools } from "./tools/game-tools.js";
import { registerDndTools } from "./tools/dnd-tools.js";
import { registerSrdTools } from "./tools/srd-tools.js";
import { registerCampaignTools } from "./tools/campaign-tools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createMcpServer(
  messageQueue: MessageQueue,
  wsClient: WSClient,
  campaignManager: CampaignManager
): McpServer {
  const server = new McpServer({
    name: "aidnd-dm",
    version: "1.0.0",
  });

  // SRD data lives at repo_root/data/srd-{version}/
  const srd52 = new SrdLookup(resolve(__dirname, "../../../data/srd-5.2"));
  const srd51 = new SrdLookup(resolve(__dirname, "../../../data/srd-5.1"), LAYOUT_51);

  registerGameTools(server, messageQueue, wsClient);
  registerDndTools(server, wsClient);
  registerSrdTools(server, srd52, srd51, wsClient);
  registerCampaignTools(server, campaignManager, wsClient);

  return server;
}
