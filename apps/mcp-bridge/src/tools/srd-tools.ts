import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SrdLookup } from "../services/srd-lookup.js";
import type { WSClient } from "../ws-client.js";

/** Send a visible "[Rules]" system event to the activity log when BOTH SRDs fail. */
function logLookupFailure(wsClient: WSClient, category: string, name: string): void {
  wsClient.broadcastSystemEvent(
    `[Rules] "${name}" not found in either SRD — DM is using training knowledge`
  );
  console.error(`[srd-tools] ${category} lookup failed in both SRDs: "${name}"`);
}

const FALLBACK_PREFIX = "⚠️ Using 2014 SRD 5.1 stats (not in 2024 SRD 5.2):\n\n";

export function registerSrdTools(
  server: McpServer,
  srd52: SrdLookup,
  srd51: SrdLookup,
  wsClient: WSClient
): void {
  server.tool(
    "lookup_spell",
    "Look up a spell from D&D rules. Checks 2024 SRD 5.2 first, falls back to 2014 SRD 5.1. Returns full spell details including casting time, range, components, duration, damage, and higher-level effects. Call this BEFORE resolving any spell cast.",
    {
      spell_name: z.string().describe("Spell name, e.g. 'Fireball', 'Cure Wounds', 'Shield'"),
    },
    async ({ spell_name }) => {
      wsClient.sendTypingIndicator(true);
      const content = srd52.lookupSpell(spell_name);
      if (content) {
        return { content: [{ type: "text" as const, text: content }] };
      }

      const fallback = srd51.lookupSpell(spell_name);
      if (fallback) {
        return { content: [{ type: "text" as const, text: FALLBACK_PREFIX + fallback }] };
      }

      logLookupFailure(wsClient, "Spell", spell_name);
      return {
        content: [{
          type: "text" as const,
          text: `⚠️ "${spell_name}" not found in either SRD. It may be from a published sourcebook not in the SRD. Use your training knowledge as fallback.`,
        }],
      };
    }
  );

  server.tool(
    "lookup_monster",
    "Look up a monster/creature stat block from D&D rules. Checks 2024 SRD 5.2 first, falls back to 2014 SRD 5.1. Returns full stat block with AC, HP, speed, abilities, actions, and CR. Call this for every enemy type BEFORE combat.",
    {
      monster_name: z.string().describe("Monster name, e.g. 'Goblin', 'Adult Red Dragon', 'Bugbear'"),
    },
    async ({ monster_name }) => {
      wsClient.sendTypingIndicator(true);
      const content = srd52.lookupMonster(monster_name);
      if (content) {
        return { content: [{ type: "text" as const, text: content }] };
      }

      const fallback = srd51.lookupMonster(monster_name);
      if (fallback) {
        return { content: [{ type: "text" as const, text: FALLBACK_PREFIX + fallback }] };
      }

      logLookupFailure(wsClient, "Monster", monster_name);
      return {
        content: [{
          type: "text" as const,
          text: `⚠️ "${monster_name}" not found in either SRD. Use your training knowledge for this creature's stats.`,
        }],
      };
    }
  );

  server.tool(
    "lookup_condition",
    "Look up the exact mechanical effects of a D&D condition. Checks 2024 SRD 5.2 first, falls back to 2014 SRD 5.1. Call this BEFORE applying any condition.",
    {
      condition_name: z.string().describe("Condition name, e.g. 'Grappled', 'Stunned', 'Prone', 'Frightened'"),
    },
    async ({ condition_name }) => {
      wsClient.sendTypingIndicator(true);
      const content = srd52.lookupCondition(condition_name);
      if (content) {
        return { content: [{ type: "text" as const, text: content }] };
      }

      // 5.2: also try glossary as fallback (some conditions may not have the tag)
      const glossary = srd52.lookupGlossary(condition_name);
      if (glossary) {
        return { content: [{ type: "text" as const, text: glossary }] };
      }

      // Fall back to 5.1
      const fallback = srd51.lookupCondition(condition_name);
      if (fallback) {
        return { content: [{ type: "text" as const, text: FALLBACK_PREFIX + fallback }] };
      }

      logLookupFailure(wsClient, "Condition", condition_name);
      return {
        content: [{
          type: "text" as const,
          text: `⚠️ Condition "${condition_name}" not found in either SRD.`,
        }],
      };
    }
  );

  server.tool(
    "lookup_magic_item",
    "Look up a magic item from D&D rules. Checks 2024 SRD 5.2 first, falls back to 2014 SRD 5.1. Returns rarity, attunement, and full description.",
    {
      item_name: z.string().describe("Magic item name, e.g. 'Bag of Holding', 'Flame Tongue'"),
    },
    async ({ item_name }) => {
      wsClient.sendTypingIndicator(true);
      const content = srd52.lookupMagicItem(item_name);
      if (content) {
        return { content: [{ type: "text" as const, text: content }] };
      }

      const fallback = srd51.lookupMagicItem(item_name);
      if (fallback) {
        return { content: [{ type: "text" as const, text: FALLBACK_PREFIX + fallback }] };
      }

      logLookupFailure(wsClient, "Magic Item", item_name);
      return {
        content: [{
          type: "text" as const,
          text: `⚠️ Magic item "${item_name}" not found in either SRD. Use your training knowledge as fallback.`,
        }],
      };
    }
  );

  server.tool(
    "lookup_feat",
    "Look up a feat from D&D rules. Checks 2024 SRD 5.2 first, falls back to 2014 SRD 5.1. Returns prerequisites, description, and mechanical effects.",
    {
      feat_name: z.string().describe("Feat name, e.g. 'Alert', 'Great Weapon Master'"),
    },
    async ({ feat_name }) => {
      wsClient.sendTypingIndicator(true);
      const content = srd52.lookupFeat(feat_name);
      if (content) {
        return { content: [{ type: "text" as const, text: content }] };
      }

      const fallback = srd51.lookupFeat(feat_name);
      if (fallback) {
        return { content: [{ type: "text" as const, text: FALLBACK_PREFIX + fallback }] };
      }

      logLookupFailure(wsClient, "Feat", feat_name);
      return {
        content: [{
          type: "text" as const,
          text: `⚠️ Feat "${feat_name}" not found in either SRD. Use your training knowledge as fallback.`,
        }],
      };
    }
  );

  server.tool(
    "search_rules",
    "Search all D&D rules (2024 SRD 5.2 + 2014 SRD 5.1) for any topic: combat mechanics, class features, equipment, gameplay rules, etc. Returns the most relevant rule sections, preferring 2024 rules when available.",
    {
      query: z.string().describe("Search query, e.g. 'opportunity attack', 'two-weapon fighting', 'death saving throw'"),
      limit: z.number().optional().default(3).describe("Max results to return (default 3)"),
    },
    async ({ query, limit }) => {
      wsClient.sendTypingIndicator(true);

      // Search both SRDs, merge results with 5.2 ranked higher
      const results52 = srd52.searchRules(query, limit);
      const results51 = srd51.searchRules(query, limit);

      // Tag 5.1 results and merge
      const tagged51 = results51.map(r => ({
        ...r,
        source: `${r.source} [2014 SRD 5.1]`,
      }));

      // Interleave: all 5.2 results first, then 5.1 results (deduped by name)
      const seen = new Set(results52.map(r => r.name.toLowerCase()));
      const merged = [
        ...results52,
        ...tagged51.filter(r => !seen.has(r.name.toLowerCase())),
      ].slice(0, limit);

      if (merged.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `No rules found matching "${query}" in either SRD. Use your training knowledge as fallback.`,
          }],
        };
      }

      const text = merged
        .map((r, i) => `--- Result ${i + 1}: ${r.name} (${r.source}) ---\n${r.content}`)
        .join("\n\n");

      return { content: [{ type: "text" as const, text }] };
    }
  );
}
