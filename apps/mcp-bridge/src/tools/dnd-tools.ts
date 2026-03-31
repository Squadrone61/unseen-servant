import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WSClient } from "../ws-client.js";
import type { RollResult } from "@unseen-servant/shared/types";
import { rollDamage, rollCheck } from "@unseen-servant/shared/utils";

export function registerDndTools(server: McpServer, wsClient: WSClient): void {
  server.registerTool(
    "roll_dice",
    {
      description:
        "Roll dice. With player → interactive roll (player sees a Roll button on their client). Without player → DM rolls server-side (for monsters/NPCs). checkType is always required. Use 'damage' for damage rolls (notation required), 'custom' for arbitrary rolls (notation required), or 'ability'/'skill'/'saving_throw'/'attack' for d20 checks. All rolls are shown to players in chat.",
      inputSchema: {
        checkType: z
          .enum(["ability", "skill", "saving_throw", "attack", "custom", "damage"])
          .describe(
            "Type of roll. 'ability'/'skill'/'saving_throw'/'attack' = d20 check. 'damage' = damage dice (notation required). 'custom' = arbitrary roll (notation required).",
          ),
        notation: z
          .string()
          .optional()
          .describe(
            "Dice notation, e.g. '2d6+3', '1d20+5'. Required for 'damage' and 'custom'. Optional for d20 checks (modifier is auto-calculated from character sheet when player is provided).",
          ),
        reason: z
          .string()
          .optional()
          .describe("Why the roll is happening, e.g. 'Goblin attack damage', 'Spot the trap'"),
        player: z
          .string()
          .optional()
          .describe("Character name for interactive player roll. Omit for DM server-side roll."),
        ability: z
          .string()
          .optional()
          .describe(
            "Ability score for the check, e.g. 'wisdom', 'strength'. For attacks: overrides the default ability (STR for melee, DEX for ranged) — use for Finesse weapons.",
          ),
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
        attackType: z
          .enum(["melee", "ranged", "spell"])
          .optional()
          .describe(
            "For attack rolls: 'melee' for weapon melee, 'ranged' for weapon ranged (enables bonuses like Archery +2), 'spell' for spell attacks (uses spellAttackBonus).",
          ),
      },
    },
    async ({
      checkType,
      notation,
      reason,
      player,
      ability,
      skill,
      dc,
      advantage,
      disadvantage,
      attackType,
    }) => {
      // ── Validate conditionally required parameters ──
      const errors: string[] = [];

      if ((checkType === "damage" || checkType === "custom") && !notation) {
        errors.push(`notation is required for '${checkType}' rolls.`);
      }
      if (checkType === "attack" && !attackType) {
        errors.push(
          "attackType ('melee', 'ranged', or 'spell') is required for attack rolls — it determines modifier calculation and enables combat bonuses.",
        );
      }
      if (checkType === "attack" && attackType === "melee" && !ability) {
        errors.push(
          "ability is required for melee attacks (e.g. 'strength', or 'dexterity' for Finesse weapons like rapier/shortsword).",
        );
      }
      if (checkType === "attack" && dc === undefined) {
        errors.push(
          "dc (target AC) is required for attack rolls — it shows Success/Failure in the player UI.",
        );
      }
      if (checkType === "skill" && !skill) {
        errors.push("skill is required for skill checks (e.g. 'perception', 'stealth').");
      }
      if ((checkType === "saving_throw" || checkType === "ability") && !ability) {
        errors.push(`ability is required for '${checkType}' checks (e.g. 'wisdom', 'strength').`);
      }

      if (errors.length > 0) {
        return {
          content: [{ type: "text" as const, text: `Error: ${errors.join(" ")}` }],
        };
      }

      // Interactive player roll
      if (player) {
        try {
          const result = await wsClient.sendCheckRequest({
            checkType,
            targetCharacter: player,
            ability,
            skill,
            dc,
            advantage,
            disadvantage,
            reason: reason || `${checkType} check`,
            notation: checkType === "damage" ? notation : undefined,
            attackType: checkType === "attack" ? attackType : undefined,
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

      // DM server-side roll
      // For d20-based check types, use rollCheck to support advantage/disadvantage
      const isD20Check = checkType !== "damage" && checkType !== "custom";

      let roll: RollResult;

      if (isD20Check) {
        // Parse modifier from notation if provided (e.g. "1d20+5" → 5), otherwise 0
        let modifier = 0;
        if (notation) {
          const modMatch = notation.match(/^1?d20([+-]\d+)$/i);
          if (modMatch) modifier = parseInt(modMatch[1], 10);
        }
        roll = rollCheck({
          modifier,
          advantage,
          disadvantage,
          label: reason || notation || `${checkType} check`,
        });
      } else {
        roll = rollDamage(notation!);
      }

      // Send to worker so all players see it in chat
      wsClient.sendDiceRoll(roll, reason);

      const rollsStr = ` [${roll.rolls.map((r) => r.result).join(", ")}]`;
      const advStr = roll.advantage ? " (advantage)" : roll.disadvantage ? " (disadvantage)" : "";
      const modStr =
        roll.modifier !== 0 ? (roll.modifier > 0 ? ` +${roll.modifier}` : ` ${roll.modifier}`) : "";
      const critStr = roll.criticalHit
        ? " (CRITICAL HIT!)"
        : roll.criticalFail
          ? " (CRITICAL FAIL!)"
          : "";
      const reasonStr = reason ? ` (${reason})` : "";
      const displayNotation = notation || "d20";

      return {
        content: [
          {
            type: "text" as const,
            text: `${displayNotation}:${rollsStr}${modStr} = ${roll.total}${advStr}${critStr}${reasonStr}`,
          },
        ],
      };
    },
  );
}
