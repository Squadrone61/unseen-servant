import {
  lookupSpell,
  lookupMonster,
  lookupCondition,
  lookupRule,
  searchSpells,
  formatSpellForAI,
  formatMonsterForAI,
  formatConditionForAI,
  formatRuleForAI,
} from "./dnd-api";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const DND_TOOLS: ToolDefinition[] = [
  {
    name: "lookup_spell",
    description:
      "Look up a D&D 5e spell by exact name. Returns level, casting time, range, components, duration, damage dice, saving throw type, area of effect, and classes. You MUST call this BEFORE resolving any spell cast to get accurate mechanics.",
    parameters: {
      type: "object",
      properties: {
        spell_name: {
          type: "string",
          description: "Spell name, e.g. 'fireball', 'cure wounds', 'shield'",
        },
      },
      required: ["spell_name"],
    },
  },
  {
    name: "lookup_monster",
    description:
      "Look up a D&D 5e monster/creature stat block. Returns HP, AC, speed, ability scores, actions, special abilities, and challenge rating. You MUST call this for EVERY enemy type BEFORE emitting combat_start to ensure accurate stats.",
    parameters: {
      type: "object",
      properties: {
        monster_name: {
          type: "string",
          description: "Monster name, e.g. 'goblin', 'adult-red-dragon', 'beholder'",
        },
      },
      required: ["monster_name"],
    },
  },
  {
    name: "lookup_condition",
    description:
      "Look up the exact mechanical effects of a D&D 5e condition. You MUST call this BEFORE applying any condition to ensure correct side effects (disadvantage, incapacitation, speed reduction, etc.).",
    parameters: {
      type: "object",
      properties: {
        condition_name: {
          type: "string",
          description: "Condition name, e.g. 'poisoned', 'stunned', 'prone', 'frightened'",
        },
      },
      required: ["condition_name"],
    },
  },
  {
    name: "lookup_rule",
    description:
      "Look up a D&D 5e rule section for exact mechanical rulings. Use for combat rules, spellcasting rules, movement, opportunity attacks, cover, grappling, etc.",
    parameters: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description: "Rule section index, e.g. 'casting-a-spell', 'the-order-of-combat', 'damage-and-healing', 'saving-throws'",
        },
      },
      required: ["section"],
    },
  },
  {
    name: "search_spells",
    description:
      "Search for D&D 5e spells by partial name when unsure of exact spelling. Returns a list of matching spell names and levels.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Partial spell name to search for, e.g. 'fire', 'heal', 'shield'",
        },
      },
      required: ["query"],
    },
  },
];

export interface ToolCallResult {
  content: string;
  isError: boolean;
}

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  try {
    switch (name) {
      case "lookup_spell": {
        const spellName = String(args.spell_name || "");
        if (!spellName) return { content: "Error: spell_name is required", isError: true };
        const spell = await lookupSpell(spellName);
        if (!spell) return { content: `Spell "${spellName}" not found in the D&D 5e SRD. It may be from a published sourcebook not in the SRD, or the name may be misspelled.`, isError: false };
        return { content: formatSpellForAI(spell), isError: false };
      }
      case "lookup_monster": {
        const monsterName = String(args.monster_name || "");
        if (!monsterName) return { content: "Error: monster_name is required", isError: true };
        const monster = await lookupMonster(monsterName);
        if (!monster) return { content: `Monster "${monsterName}" not found in the D&D 5e SRD. Use your training knowledge for this creature.`, isError: false };
        return { content: formatMonsterForAI(monster), isError: false };
      }
      case "lookup_condition": {
        const conditionName = String(args.condition_name || "");
        if (!conditionName) return { content: "Error: condition_name is required", isError: true };
        const condition = await lookupCondition(conditionName);
        if (!condition) return { content: `Condition "${conditionName}" not found in the D&D 5e SRD.`, isError: false };
        return { content: formatConditionForAI(condition), isError: false };
      }
      case "lookup_rule": {
        const section = String(args.section || "");
        if (!section) return { content: "Error: section is required", isError: true };
        const rule = await lookupRule(section);
        if (!rule) return { content: `Rule section "${section}" not found. Try a different section index.`, isError: false };
        return { content: formatRuleForAI(rule), isError: false };
      }
      case "search_spells": {
        const query = String(args.query || "");
        if (!query) return { content: "Error: query is required", isError: true };
        const results = await searchSpells(query);
        if (results.length === 0) return { content: `No spells found matching "${query}".`, isError: false };
        const list = results.map((r) => `- ${r.name} (Level ${r.level})`).join("\n");
        return { content: `Spells matching "${query}":\n${list}`, isError: false };
      }
      default:
        return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (error) {
    console.error(`[dnd-tools] Error executing ${name}:`, error);
    return {
      content: `Error looking up ${name}: ${error instanceof Error ? error.message : "unknown error"}. Use your training knowledge as fallback.`,
      isError: true,
    };
  }
}

export function toOpenAITools(
  tools: ToolDefinition[],
): Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
