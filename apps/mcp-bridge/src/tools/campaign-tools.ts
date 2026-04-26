import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CampaignManager } from "../services/campaign-manager.js";
import type { WSClient } from "../ws-client.js";
import type { GameLogger } from "../services/game-logger.js";
import { encounterBundleSchema } from "@unseen-servant/shared/schemas";

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
      description:
        "Load campaign context for the active campaign. Default scope 'compact' is best for conductor session start and most specialist calls — it loads manifest + active-context.md + last 2 session summaries + party (~3-5k tokens). Use 'full' only when you need a deep review of all world/NPC/faction/quest files + all sessions (can be 30k+ on mature campaigns). Use 'agent:<name>' (e.g. 'agent:rules-advisor') to load a specialist's private notes alongside the compact context.",
      inputSchema: {
        scope: z
          .string()
          .optional()
          .default("compact")
          .describe(
            'Scope: "compact" (default — manifest + active-context + last 2 sessions + party), "full" (everything — previous behavior), or "agent:<specialist>" (compact + that specialist\'s agents/<name>/ folder).',
          ),
      },
    },
    async ({ scope }) => {
      try {
        const effectiveScope = scope ?? "compact";
        let context: string;
        if (effectiveScope === "full") {
          context = campaignManager.getStartupContext();
        } else if (effectiveScope.startsWith("agent:")) {
          const agentName = effectiveScope.slice("agent:".length).trim();
          if (!agentName) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: agent scope requires a name, e.g. "agent:rules-advisor".`,
                },
              ],
              isError: true,
            };
          }
          context = campaignManager.getAgentContext(agentName);
        } else {
          context = campaignManager.getCompactContext();
        }
        gameLogger.toolCall("load_campaign_context", { scope: effectiveScope }, context);
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
        if (campaignManager.activeSlug) {
          gameLogger.sessionEnd(campaignManager.activeSlug);
        }
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

  // --- Encounter Bundles ---
  // Owned by encounter-designer (write) and combat-resolver (read).
  // Bundle = pre-resolved monster stats + abilities, eliminating per-turn
  // lookup_rule churn. See plans/encounter-bundle.md.

  server.registerTool(
    "save_encounter_bundle",
    {
      description:
        "Persist a pre-designed encounter to dm/encounters/<slug>.json. Encounter-designer calls this once at /combat-prep time, capturing every monster's verified stats and abilities so the resolver doesn't re-look-up each turn. Pass the slug to start_combat afterward via encounter_bundle_slug.",
      inputSchema: {
        bundle: encounterBundleSchema.describe("Full EncounterBundle JSON"),
      },
    },
    async ({ bundle }) => {
      try {
        const savedAs = campaignManager.saveEncounterBundle(bundle);
        const text = `Saved encounter bundle "${bundle.slug}" → ${savedAs} (${bundle.combatants.length} combatants, ${bundle.difficulty})`;
        gameLogger.toolCall("save_encounter_bundle", { slug: bundle.slug }, text);
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

  // --- Standing Crew memory ---
  // Per-encounter turn-log (combat-resolver) and per-session scratch
  // (lorekeeper / narrative continuity). See plans/standing-crew.md.

  server.registerTool(
    "append_turn_log",
    {
      description:
        "Append one entry to the per-encounter turn-log at dm/encounter-logs/<slug>.md. Combat-resolver uses this after each NPC turn so future turns of the same encounter see prior reasoning (target focus, used reactions, miss patterns). The log is archived to <slug>.archive.md when end_combat fires. Pass `entry` as a fully-formed markdown line — e.g. '## Round 2' for a header, or '- **Grixx**: Multiattack on Theron → hit, miss. HP 21/21.' for a bullet. The file is created with an H1 header on first call.",
      inputSchema: {
        encounterSlug: z
          .string()
          .describe("Bundle slug for the active combat (matches CombatState.bundleSlug)."),
        entry: z
          .string()
          .describe(
            "Markdown line(s) to append. Append round headers, bullet entries, or a `## Pattern notes` section as needed.",
          ),
      },
    },
    async ({ encounterSlug, entry }) => {
      try {
        const savedAs = campaignManager.appendTurnLog(encounterSlug, entry);
        const text = `Appended to ${savedAs} (${entry.length} chars)`;
        gameLogger.toolCall("append_turn_log", { encounterSlug }, text);
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
    "read_turn_log",
    {
      description:
        "Read the per-encounter turn-log. Combat-resolver calls this once at the start of each turn (alongside load_encounter_bundle) to see prior-turn reasoning and pattern notes. Default `lastNRounds: 3` keeps the read tight for context-sensitive tactic selection without bloating the resolver's prompt.",
      inputSchema: {
        encounterSlug: z.string().describe("Bundle slug for the active combat."),
        lastNRounds: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Trim to the last N `## Round N` sections. Omit to read the full log. Defaults to 3 if unspecified.",
          ),
      },
    },
    async ({ encounterSlug, lastNRounds }) => {
      try {
        const window = lastNRounds ?? 3;
        const log = campaignManager.readTurnLog(encounterSlug, window);
        if (log === null) {
          const text = `No turn-log yet for "${encounterSlug}". Resolver should treat this as round 1 with no prior context.`;
          gameLogger.toolCall("read_turn_log", { encounterSlug, lastNRounds: window }, text);
          return { content: [{ type: "text" as const, text }] };
        }
        gameLogger.toolCall(
          "read_turn_log",
          { encounterSlug, lastNRounds: window },
          `[${log.length} chars]`,
        );
        return { content: [{ type: "text" as const, text: log }] };
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
    "append_session_scratch",
    {
      description:
        "Append a brief note to the active-session scratch file at dm/session-scratch/session-NNN.md. Used for intra-session memory that isn't yet world-canonical: NPCs introduced this session, suspicious quotes, side-quest hooks the players bit on. Cleared automatically at end_session (since the session summary supersedes it). Lorekeeper reads this for in-session recap; the conductor may append spontaneously.",
      inputSchema: {
        entry: z
          .string()
          .describe(
            "Markdown line(s). Single bullets are typical, e.g. '- Met {npc:Brogan}, dwarven smith at the Iron Anvil. Suspicious of the party.'",
          ),
      },
    },
    async ({ entry }) => {
      try {
        const savedAs = campaignManager.appendSessionScratch(entry);
        const text = `Appended to ${savedAs} (${entry.length} chars)`;
        gameLogger.toolCall("append_session_scratch", {}, text);
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
    "read_session_scratch",
    {
      description:
        "Read the active-session scratch file. Returns null-equivalent text if no scratch has been written yet this session.",
    },
    async () => {
      try {
        const content = campaignManager.readSessionScratch();
        if (content === null) {
          const text =
            "No session scratch yet. The session has not produced any intra-session notes.";
          gameLogger.toolCall("read_session_scratch", {}, text);
          return { content: [{ type: "text" as const, text }] };
        }
        gameLogger.toolCall("read_session_scratch", {}, `[${content.length} chars]`);
        return { content: [{ type: "text" as const, text: content }] };
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
    "load_encounter_bundle",
    {
      description:
        "Load a previously saved encounter bundle. Combat-resolver calls this once per turn (cheap — single JSON file read) to get pre-resolved monster stats + abilities + tactic hints, instead of re-looking-up each ability via lookup_rule. The current bundle slug is in get_combat_summary.bundleSlug.",
      inputSchema: {
        slug: z.string().describe("Bundle slug, e.g. 'goblin-ambush-river'"),
      },
    },
    async ({ slug }) => {
      try {
        const bundle = campaignManager.loadEncounterBundle(slug);
        if (!bundle) {
          const text = `Bundle "${slug}" not found. Encounter may have been started without a bundle (legacy path) — fall back to lookup_rule for monster stats.`;
          gameLogger.toolCall("load_encounter_bundle", { slug }, text);
          return { content: [{ type: "text" as const, text }] };
        }
        const text = JSON.stringify(bundle, null, 2);
        gameLogger.toolCall(
          "load_encounter_bundle",
          { slug },
          `[bundle: ${bundle.combatants.length} combatants]`,
        );
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
