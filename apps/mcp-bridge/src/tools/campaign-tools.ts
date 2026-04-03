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

  server.registerTool(
    "load_campaign_context",
    {
      description: "Load the startup context for the active campaign.",
    },
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

  server.registerTool(
    "save_campaign_file",
    {
      description: "Save or update a campaign file. Auto-adds .md extension.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            "Relative file path within the campaign folder (without extension for markdown), e.g. 'world/npcs', 'world/locations', 'sessions/session-001', 'active-context'",
          ),
        filename: z
          .string()
          .optional()
          .describe(
            "Alias for 'path'. Use 'path' instead (preferred). .md extension added automatically if not provided.",
          ),
        content: z.string().describe("The file content (markdown or JSON)"),
      },
    },
    async ({ path: pathParam, filename, content }) => {
      const filePath = pathParam || filename;
      if (!filePath) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ERROR: save_campaign_file requires a "path" parameter.`,
            },
          ],
          isError: true,
        };
      }
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

  server.registerTool(
    "read_campaign_file",
    {
      description: "Read a file from the active campaign.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            "Relative file path within the campaign folder (without extension for markdown)",
          ),
        filename: z.string().optional().describe("Alias for path"),
      },
    },
    async ({ path: pathParam, filename }) => {
      const filePath = pathParam || filename;
      if (!filePath) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ERROR: read_campaign_file requires a "path" parameter.`,
            },
          ],
          isError: true,
        };
      }
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
