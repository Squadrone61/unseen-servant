import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WSClient } from "../ws-client.js";
import { rollDamage } from "@aidnd/shared/utils";

export function registerDndTools(server: McpServer, wsClient: WSClient): void {
  server.tool(
    "roll_dice",
    `Roll dice — ALL rolls are shown to players in chat.

**Mode 1 — Direct DM roll** (monster attacks, damage, hidden rolls):
Just provide \`notation\` and optional \`reason\`. Roll happens immediately, result appears in chat.

**Mode 2 — Player check** (interactive):
Include \`targetCharacter\` + \`checkType\`. The player sees a "Roll d20" button, clicks it, modifiers are computed from their character sheet, and the result appears in chat.

**Mode 2b — Player damage roll** (interactive):
Include \`targetCharacter\` + \`checkType: "damage"\` + full \`notation\`. The player sees a "Roll Damage" button and rolls the provided dice notation.

If \`targetCharacter\` is provided → Mode 2/2b. Otherwise → Mode 1.`,
    {
      notation: z
        .string()
        .describe("Dice notation, e.g. '2d6+3', 'd20', '4d8', '1d20+5'"),
      reason: z
        .string()
        .optional()
        .describe("Why the roll is happening, e.g. 'Goblin attack damage', 'Spot the trap'"),
      targetCharacter: z
        .string()
        .optional()
        .describe("Character name for interactive player check (triggers Mode 2)"),
      checkType: z
        .enum(["ability", "skill", "saving_throw", "attack", "custom", "damage"])
        .optional()
        .describe("Type of check (required when targetCharacter is set). Use 'damage' for interactive player damage rolls."),
      ability: z
        .string()
        .optional()
        .describe("Ability score for the check, e.g. 'wisdom', 'strength'"),
      skill: z
        .string()
        .optional()
        .describe("Skill name for skill checks, e.g. 'perception', 'stealth'"),
      dc: z
        .number()
        .optional()
        .describe("Difficulty Class for the check"),
      advantage: z
        .boolean()
        .optional()
        .describe("Roll with advantage (roll 2d20, take higher)"),
      disadvantage: z
        .boolean()
        .optional()
        .describe("Roll with disadvantage (roll 2d20, take lower)"),
    },
    async ({ notation, reason, targetCharacter, checkType, ability, skill, dc, advantage, disadvantage }) => {
      wsClient.sendTypingIndicator(true);
      // Mode 2: Interactive player check
      if (targetCharacter) {
        if (!checkType) {
          return {
            content: [{
              type: "text" as const,
              text: "Error: checkType is required when targetCharacter is provided. Use 'ability', 'skill', 'saving_throw', 'attack', or 'custom'.",
            }],
          };
        }

        try {
          const result = await wsClient.sendCheckRequest({
            checkType,
            targetCharacter,
            ability,
            skill,
            dc,
            advantage,
            disadvantage,
            reason: reason || `${checkType} check`,
            notation: checkType === "damage" ? notation : undefined,
          });

          const successStr = result.dc !== undefined
            ? ` — ${result.success ? "SUCCESS" : "FAILURE"} (DC ${result.dc})`
            : "";
          const critStr = result.roll.criticalHit ? " CRITICAL HIT!" : result.roll.criticalFail ? " CRITICAL FAIL!" : "";

          // Extract natural d20 roll so Claude can report it accurately
          const naturalRoll = result.roll.rolls.length > 0
            ? result.roll.rolls.length > 1  // advantage/disadvantage: pick the used die
              ? (result.roll.advantage
                ? Math.max(...result.roll.rolls.map(r => r.result))
                : result.roll.disadvantage
                  ? Math.min(...result.roll.rolls.map(r => r.result))
                  : result.roll.rolls[0].result)
              : result.roll.rolls[0].result
            : result.roll.total;

          const modStr = result.roll.modifier !== 0
            ? (result.roll.modifier > 0 ? `+${result.roll.modifier}` : `${result.roll.modifier}`)
            : "";

          return {
            content: [{
              type: "text" as const,
              text: `${result.characterName} rolled d20(${naturalRoll})${modStr} = ${result.roll.total} on ${result.roll.label}${successStr}${critStr}`,
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text" as const,
              text: `Check request failed: ${error instanceof Error ? error.message : String(error)}`,
            }],
          };
        }
      }

      // Mode 1: Direct DM roll
      const roll = rollDamage(notation);

      // Send to worker so all players see it in chat
      wsClient.sendDiceRoll(roll, reason);

      const rollsStr = roll.rolls.length > 1
        ? ` [${roll.rolls.map(r => r.result).join(", ")}]`
        : "";
      const modStr = roll.modifier !== 0
        ? (roll.modifier > 0 ? `+${roll.modifier}` : `${roll.modifier}`)
        : "";
      const critStr = roll.criticalHit ? " (CRITICAL HIT!)" : roll.criticalFail ? " (CRITICAL FAIL!)" : "";
      const reasonStr = reason ? ` (${reason})` : "";

      return {
        content: [{
          type: "text" as const,
          text: `${notation}:${rollsStr} ${roll.rolls.reduce((s, r) => s + r.result, 0)}${modStr} = ${roll.total}${critStr}${reasonStr}`,
        }],
      };
    }
  );
}
