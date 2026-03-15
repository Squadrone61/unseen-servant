import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CampaignManager } from "../services/campaign-manager.js";
import type { WSClient } from "../ws-client.js";

export function registerCampaignTools(
  server: McpServer,
  campaignManager: CampaignManager,
  wsClient: WSClient,
): void {
  // --- Campaign lifecycle ---

  server.tool(
    "create_campaign",
    "Create a new campaign folder with manifest and empty structure. Returns the campaign manifest.",
    {
      name: z.string().describe("Human-readable campaign name, e.g. 'Curse of the Crimson Keep'"),
    },
    async ({ name }) => {
      try {
        const manifest = campaignManager.createCampaign(name);
        return {
          content: [
            {
              type: "text" as const,
              text: `Campaign "${manifest.name}" created (slug: ${manifest.slug}).\n\nFolder structure initialized at .unseen/campaigns/${manifest.slug}/`,
            },
          ],
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

  server.tool(
    "list_campaigns",
    "List all campaigns on disk. Returns slug, name, session count, and last played date for each.",
    {},
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
      return {
        content: [
          {
            type: "text" as const,
            text: `Campaigns:\n${lines.join("\n")}`,
          },
        ],
      };
    },
  );

  server.tool(
    "load_campaign_context",
    "Load the startup context for the active campaign: manifest + system prompt + active context + latest session summary + character summaries. Call once at session start.",
    {},
    async () => {
      try {
        const context = campaignManager.getStartupContext();
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

  server.tool(
    "end_session",
    "End the current session: write a session summary, update active-context, snapshot characters, and increment session count. Call at session end.",
    {
      summary: z
        .string()
        .describe(
          "Session summary: key events, state at end, open threads. Will be saved as sessions/session-NNN.md",
        ),
      activeContext: z
        .string()
        .describe(
          'Updated active-context.md content: "What\'s happening now" — current scene, pending threads, next steps. Keep under ~800 tokens.',
        ),
    },
    async ({ summary, activeContext }) => {
      wsClient.sendTypingIndicator(true);
      try {
        // Pass current characters for snapshotting and player list update
        const characters = wsClient.characters;
        const hasCharacters = Object.keys(characters).length > 0;
        const result = campaignManager.endSession(
          summary,
          activeContext,
          hasCharacters ? characters : undefined,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Session ${result.sessionNumber} ended. Summary saved, active context updated.${hasCharacters ? " Characters snapshotted." : ""}`,
            },
          ],
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

  // --- File operations ---

  server.tool(
    "save_campaign_file",
    "Save or update a campaign file. Supports subdirectory paths like 'world/npcs', 'sessions/session-003'. Automatically adds .md extension if none provided.",
    {
      path: z
        .string()
        .describe(
          "Relative file path within the campaign folder (without extension for markdown), e.g. 'world/npcs', 'world/locations', 'sessions/session-001', 'active-context'",
        ),
      content: z.string().describe("The file content (markdown or JSON)"),
    },
    async ({ path: filePath, content }) => {
      wsClient.sendTypingIndicator(true);
      try {
        const savedAs = campaignManager.writeFile(filePath, content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Saved: ${savedAs} (${content.length} chars)`,
            },
          ],
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

  server.tool(
    "read_campaign_file",
    "Read a file from the active campaign. Supports paths like 'world/npcs', 'world/locations', 'active-context', 'system-prompt'.",
    {
      path: z
        .string()
        .describe("Relative file path within the campaign folder (without extension for markdown)"),
    },
    async ({ path: filePath }) => {
      try {
        const content = campaignManager.readFile(filePath);
        if (content === null) {
          return {
            content: [
              {
                type: "text" as const,
                text: `File "${filePath}" not found. Use list_campaign_files to see available files.`,
              },
            ],
          };
        }
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

  server.tool(
    "list_campaign_files",
    "List all files in the active campaign as a tree.",
    {},
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
        return {
          content: [
            {
              type: "text" as const,
              text: `Campaign files (${slug}):\n${tree}`,
            },
          ],
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
}
