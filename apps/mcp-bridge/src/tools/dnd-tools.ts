import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WSClient } from "../ws-client.js";
import { rollDamage } from "@unseen-servant/shared/utils";

export function registerDndTools(server: McpServer, wsClient: WSClient): void {
  server.registerTool(
    "roll_dice",
    {
      description:
        "Roll dice. Two modes: (1) DM/direct roll — just notation + reason. (2) Interactive player roll — add target + checkType so the player rolls on their client. If target is provided → Mode 2, otherwise → Mode 1. All rolls are shown to players in chat.",
      inputSchema: {
        notation: z.string().describe("Dice notation, e.g. '2d6+3', 'd20', '4d8', '1d20+5'"),
        reason: z
          .string()
          .optional()
          .describe("Why the roll is happening, e.g. 'Goblin attack damage', 'Spot the trap'"),
        target: z
          .string()
          .optional()
          .describe("Character name for interactive player check (triggers Mode 2)"),
        checkType: z
          .enum(["ability", "skill", "saving_throw", "attack", "custom", "damage"])
          .optional()
          .describe(
            "Type of check: 'ability', 'skill', 'saving_throw', 'attack', 'custom', or 'damage'. Required when target is provided. 'damage' also requires notation.",
          ),
        ability: z
          .string()
          .optional()
          .describe("Ability score for the check, e.g. 'wisdom', 'strength'"),
        skill: z
          .string()
          .optional()
          .describe("Skill name for skill checks, e.g. 'perception', 'stealth'"),
        dc: z.coerce.number().optional().describe("Difficulty Class for the check"),
        advantage: z.boolean().optional().describe("Roll with advantage (roll 2d20, take higher)"),
        disadvantage: z
          .boolean()
          .optional()
          .describe("Roll with disadvantage (roll 2d20, take lower)"),
      },
    },
    async ({
      notation,
      reason,
      target,
      checkType,
      ability,
      skill,
      dc,
      advantage,
      disadvantage,
    }) => {
      // Mode 2: Interactive player check
      if (target) {
        if (!checkType) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: checkType is required when target is provided. Use 'ability', 'skill', 'saving_throw', 'attack', or 'custom'.",
              },
            ],
          };
        }

        try {
          const result = await wsClient.sendCheckRequest({
            checkType,
            targetCharacter: target,
            ability,
            skill,
            dc,
            advantage,
            disadvantage,
            reason: reason || `${checkType} check`,
            notation: checkType === "damage" ? notation : undefined,
          });

          // Damage rolls: report individual dice + total
          if (checkType === "damage") {
            const diceStr =
              result.roll.rolls.length > 0
                ? `[${result.roll.rolls.map((r) => r.result).join(", ")}]`
                : "";
            return {
              content: [
                {
                  type: "text" as const,
                  text: `${result.characterName} rolled ${notation}: ${diceStr} = ${result.roll.total} damage (${result.roll.label})`,
                },
              ],
            };
          }

          const successStr =
            result.dc !== undefined
              ? ` — ${result.success ? "SUCCESS" : "FAILURE"} (DC ${result.dc})`
              : "";
          const critStr = result.roll.criticalHit
            ? " CRITICAL HIT!"
            : result.roll.criticalFail
              ? " CRITICAL FAIL!"
              : "";

          // Extract natural d20 roll so Claude can report it accurately
          const naturalRoll =
            result.roll.rolls.length > 0 ? result.roll.rolls[0].result : result.roll.total;

          const modStr =
            result.roll.modifier !== 0
              ? result.roll.modifier > 0
                ? `+${result.roll.modifier}`
                : `${result.roll.modifier}`
              : "";

          return {
            content: [
              {
                type: "text" as const,
                text: `${result.characterName} rolled d20(${naturalRoll})${modStr} = ${result.roll.total} on ${result.roll.label}${successStr}${critStr}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Check request failed: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      }

      // Mode 1: Direct DM roll
      const roll = rollDamage(notation);

      // Send to worker so all players see it in chat
      wsClient.sendDiceRoll(roll, reason);

      const rollsStr = ` [${roll.rolls.map((r) => r.result).join(", ")}]`;
      const modStr =
        roll.modifier !== 0 ? (roll.modifier > 0 ? ` +${roll.modifier}` : ` ${roll.modifier}`) : "";
      const critStr = roll.criticalHit
        ? " (CRITICAL HIT!)"
        : roll.criticalFail
          ? " (CRITICAL FAIL!)"
          : "";
      const reasonStr = reason ? ` (${reason})` : "";

      return {
        content: [
          {
            type: "text" as const,
            text: `${notation}:${rollsStr}${modStr} = ${roll.total}${critStr}${reasonStr}`,
          },
        ],
      };
    },
  );
}
