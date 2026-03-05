import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  lookupSpell,
  lookupMonster,
  lookupCondition,
  formatSpellForAI,
  formatMonsterForAI,
  formatConditionForAI,
} from "../services/dnd-api.js";

export function registerDndTools(server: McpServer): void {
  server.tool(
    "lookup_spell",
    "Look up a D&D 5e spell by name from the SRD API. Returns level, casting time, range, components, duration, damage, saving throw, area of effect, and classes. Call this BEFORE resolving any spell cast.",
    {
      spell_name: z
        .string()
        .describe("Spell name, e.g. 'fireball', 'cure wounds', 'shield'"),
    },
    async ({ spell_name }) => {
      const spell = await lookupSpell(spell_name);
      if (!spell) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Spell "${spell_name}" not found in the D&D 5e SRD. It may be from a published sourcebook not in the SRD, or the name may be misspelled. Use your training knowledge as fallback.`,
            },
          ],
        };
      }
      return {
        content: [{ type: "text" as const, text: formatSpellForAI(spell) }],
      };
    }
  );

  server.tool(
    "lookup_monster",
    "Look up a D&D 5e monster/creature stat block from the SRD API. Returns HP, AC, speed, ability scores, actions, special abilities, and CR. Call this for every enemy type BEFORE combat to ensure accurate stats.",
    {
      monster_name: z
        .string()
        .describe(
          "Monster name, e.g. 'goblin', 'adult-red-dragon', 'beholder'"
        ),
    },
    async ({ monster_name }) => {
      const monster = await lookupMonster(monster_name);
      if (!monster) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Monster "${monster_name}" not found in the D&D 5e SRD. Use your training knowledge for this creature's stats.`,
            },
          ],
        };
      }
      return {
        content: [
          { type: "text" as const, text: formatMonsterForAI(monster) },
        ],
      };
    }
  );

  server.tool(
    "lookup_condition",
    "Look up the exact mechanical effects of a D&D 5e condition from the SRD API. Call this BEFORE applying any condition to ensure correct side effects.",
    {
      condition_name: z
        .string()
        .describe(
          "Condition name, e.g. 'poisoned', 'stunned', 'prone', 'frightened'"
        ),
    },
    async ({ condition_name }) => {
      const condition = await lookupCondition(condition_name);
      if (!condition) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Condition "${condition_name}" not found in the D&D 5e SRD.`,
            },
          ],
        };
      }
      return {
        content: [
          { type: "text" as const, text: formatConditionForAI(condition) },
        ],
      };
    }
  );

  server.tool(
    "roll_dice",
    "Roll dice using standard D&D notation. Supports NdS, NdS+M, NdS-M formats, and advantage/disadvantage for d20 rolls.",
    {
      notation: z
        .string()
        .describe(
          "Dice notation, e.g. '2d6+3', 'd20', '4d8', '1d20+5'"
        ),
      advantage: z
        .boolean()
        .optional()
        .describe("Roll with advantage (roll 2d20, take higher)"),
      disadvantage: z
        .boolean()
        .optional()
        .describe("Roll with disadvantage (roll 2d20, take lower)"),
    },
    async ({ notation, advantage, disadvantage }) => {
      const result = rollDice(notation, advantage, disadvantage);
      return {
        content: [{ type: "text" as const, text: result }],
      };
    }
  );
}

function rollDice(
  notation: string,
  advantage?: boolean,
  disadvantage?: boolean
): string {
  const match = notation.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!match) {
    return `Invalid dice notation: "${notation}". Use format like "2d6+3", "d20", "4d8".`;
  }

  const count = parseInt(match[1] || "1", 10);
  const sides = parseInt(match[2], 10);
  const modifier = parseInt(match[3] || "0", 10);

  // Advantage/disadvantage only applies to single d20 rolls
  if (sides === 20 && count === 1 && (advantage || disadvantage)) {
    const roll1 = randomInt(1, 20);
    const roll2 = randomInt(1, 20);
    const chosen = advantage
      ? Math.max(roll1, roll2)
      : Math.min(roll1, roll2);
    const total = chosen + modifier;
    const modStr = modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : "";
    const label = advantage ? "advantage" : "disadvantage";
    const crit = chosen === 20 ? " (CRITICAL HIT!)" : chosen === 1 ? " (CRITICAL FAIL!)" : "";
    return `d20 with ${label}: [${roll1}, ${roll2}] → ${chosen}${modStr} = ${total}${crit}`;
  }

  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(randomInt(1, sides));
  }
  const sum = rolls.reduce((a, b) => a + b, 0);
  const total = sum + modifier;
  const modStr = modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : "";
  const rollsStr = rolls.length > 1 ? ` [${rolls.join(", ")}]` : "";

  let crit = "";
  if (sides === 20 && count === 1) {
    if (rolls[0] === 20) crit = " (CRITICAL HIT!)";
    else if (rolls[0] === 1) crit = " (CRITICAL FAIL!)";
  }

  return `${notation}:${rollsStr} ${sum}${modStr} = ${total}${crit}`;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
