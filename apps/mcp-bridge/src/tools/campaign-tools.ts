import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CampaignManager } from "../services/campaign-manager.js";
import type { WSClient } from "../ws-client.js";
import type { GameLogger } from "../services/game-logger.js";

export function registerCampaignTools(
  server: McpServer,
  campaignManager: CampaignManager,
  wsClient: WSClient,
  gameLogger: GameLogger,
): void {
  // --- Campaign lifecycle ---

  server.registerTool(
    "create_campaign",
    {
      description:
        "Create a new campaign folder with manifest and empty structure. Returns the campaign manifest.",
      inputSchema: {
        name: z.string().describe("Human-readable campaign name, e.g. 'Curse of the Crimson Keep'"),
      },
    },
    async ({ name }) => {
      try {
        const manifest = campaignManager.createCampaign(name);
        const text = `Campaign "${manifest.name}" created (slug: ${manifest.slug}).\n\nFolder structure initialized at .unseen/campaigns/${manifest.slug}/`;
        gameLogger.toolCall("create_campaign", { name }, text);
        return { content: [{ type: "text" as const, text }] };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "list_campaigns",
    {
      description:
        "List all campaigns on disk. Returns slug, name, session count, and last played date for each.",
    },
    async () => {
      const campaigns = campaignManager.listCampaigns();
      if (campaigns.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No campaigns found. Use create_campaign to start one.",
            },
          ],
        };
      }

      const lines = campaigns.map(
        (c) =>
          `- **${c.name}** (${c.slug}) — ${c.sessionCount} sessions, last played ${c.lastPlayedAt}`,
      );
      const text = `Campaigns:\n${lines.join("\n")}`;
      gameLogger.toolCall("list_campaigns", {}, text);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.registerTool(
    "load_campaign_context",
    {
      description: "Load the startup context for the active campaign.",
    },
    async () => {
      try {
        const context = campaignManager.getStartupContext();
        gameLogger.toolCall("load_campaign_context", {}, context);
        return {
          content: [{ type: "text" as const, text: context }],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "end_session",
    {
      description:
        "End the current session: save summary, update context, snapshot characters, increment session count.",
      inputSchema: {
        summary: z
          .string()
          .describe(
            "Session summary: key events, state at end, open threads. Will be saved as sessions/session-NNN.md",
          ),
        activeContext: z
          .string()
          .describe(
            'Updated active-context.md content: "What\'s happening now" — current scene, pending threads, next steps. Keep under ~800 tokens (~3000 characters of prose).',
          ),
      },
    },
    async ({ summary, activeContext }) => {
      try {
        // Use GSM's characters — they have up-to-date dynamic data from tool mutations
        const characters = wsClient.gameStateManager.characters;
        const hasCharacters = Object.keys(characters).length > 0;
        const result = campaignManager.endSession(
          summary,
          activeContext,
          hasCharacters ? characters : undefined,
        );
        const text = `Session ${result.sessionNumber} ended. Summary saved, active context updated.${hasCharacters ? " Characters snapshotted." : ""}`;
        gameLogger.toolCall("end_session", { summary: summary.slice(0, 100) + "..." }, text);
        return { content: [{ type: "text" as const, text }] };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // --- File operations ---

  server.registerTool(
    "save_campaign_file",
    {
      description: "Save or update a campaign file. Auto-adds .md extension.",
      inputSchema: {
        path: z
          .string()
          .describe(
            "Relative file path within the campaign folder (without extension for markdown), e.g. 'world/npcs', 'world/locations', 'sessions/session-001', 'active-context'",
          ),
        content: z.string().describe("The file content (markdown or JSON)"),
      },
    },
    async ({ path, content }) => {
      try {
        const savedAs = campaignManager.writeFile(path, content);
        const text = `Saved: ${savedAs} (${content.length} chars)`;
        gameLogger.toolCall("save_campaign_file", { path }, text);
        return { content: [{ type: "text" as const, text }] };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "read_campaign_file",
    {
      description: "Read a file from the active campaign.",
      inputSchema: {
        path: z
          .string()
          .describe(
            "Relative file path within the campaign folder (without extension for markdown)",
          ),
      },
    },
    async ({ path }) => {
      try {
        const content = campaignManager.readFile(path);
        if (content === null) {
          const text = `File "${path}" not found. Use list_campaign_files to see available files.`;
          gameLogger.toolCall("read_campaign_file", { path }, text);
          return { content: [{ type: "text" as const, text }] };
        }
        gameLogger.toolCall("read_campaign_file", { path }, `[${content.length} chars]`);
        return {
          content: [{ type: "text" as const, text: content }],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "list_campaign_files",
    {
      description: "List all files in the active campaign as a tree.",
    },
    async () => {
      try {
        const files = campaignManager.listFiles();
        if (files.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No files in campaign yet.",
              },
            ],
          };
        }

        const tree = files.map((f) => `  ${f}`).join("\n");
        const slug = campaignManager.activeSlug || "unknown";
        const text = `Campaign files (${slug}):\n${tree}`;
        gameLogger.toolCall("list_campaign_files", {}, text);
        return { content: [{ type: "text" as const, text }] };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
