import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WSClient } from "../ws-client.js";
import { rollNotation, buildOutputFromResult, formatRollOutput } from "../services/dice-engine.js";
import { parseCheckType } from "@unseen-servant/shared/utils";

export function registerDndTools(server: McpServer, wsClient: WSClient): void {
  server.registerTool(
    "roll_dice",
    {
      description: `Roll dice. notation is always required.

When checkType is provided with player, the modifier is auto-computed from the character sheet — do NOT include a modifier in notation. Just use bare dice:
  - "1d20" for a normal check
  - "2d20kh1" for advantage
  - "2d20kl1" for disadvantage

checkType values (modifier auto-calculated, requires player):
  Skills: "perception", "stealth", "athletics", "acrobatics", "arcana", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "performance", "persuasion", "religion", "sleight_of_hand", "animal_handling", "survival"
  Abilities: "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"
  Saves: "strength_save", "dexterity_save", "constitution_save", "intelligence_save", "wisdom_save", "charisma_save"
  Attacks: "melee_attack" (STR + prof), "ranged_attack" (DEX + prof), "spell_attack" (spell bonus), "finesse_attack" (max(STR,DEX) + prof)

When checkType is omitted, notation is rolled exactly as-is — include any modifiers yourself.

Examples:
  Player perception check:  { notation: "1d20", player: "Arlon", checkType: "perception", dc: 15 }
  Player DEX save (adv):    { notation: "2d20kh1", player: "Arlon", checkType: "dexterity_save", dc: 14 }
  Monster attack (DM roll): { notation: "1d20+6", dc: 15, reason: "Goblin attacks Arlon" }
  Damage roll:              { notation: "2d6+3", reason: "Goblin shortsword damage" }
  Player rolls damage:      { notation: "1d8+2d6+3", player: "Rogue", reason: "Sneak attack" }`,
      inputSchema: {
        notation: z
          .string()
          .describe(
            "Dice notation: '1d20', '2d20kh1' (advantage), '2d20kl1' (disadvantage), '2d6+3', '4d6dl1'. When using checkType, omit modifier — it's auto-calculated.",
          ),
        checkType: z
          .string()
          .optional()
          .describe(
            "Auto-compute modifier from character sheet. Requires player. See tool description for valid values.",
          ),
        player: z
          .string()
          .optional()
          .describe(
            "Character name for interactive roll (player sees Roll button). Omit for DM server-side roll.",
          ),
        dc: z.coerce
          .number()
          .optional()
          .describe("Difficulty Class — shows Success/Failure to players."),
        reason: z
          .string()
          .optional()
          .describe("Why: 'Goblin attack', 'Spot the trap', 'Fireball damage'"),
      },
    },
    async ({ notation, checkType, player, dc, reason }) => {
      // ── Validate checkType ──
      if (checkType) {
        const parsed = parseCheckType(checkType);
        if (!parsed) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Unrecognized checkType "${checkType}". Valid values: skill names (perception, stealth...), ability names (strength, dexterity...), saves (dexterity_save...), attacks (melee_attack, ranged_attack, spell_attack, finesse_attack).`,
              },
            ],
          };
        }
        if (!player) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: checkType requires player — need a character sheet to compute modifier. Either provide player or include modifier in notation directly.`,
              },
            ],
          };
        }
      }

      // ── Interactive player roll ──
      if (player) {
        try {
          const result = await wsClient.sendCheckRequest({
            notation,
            checkType,
            targetCharacter: player,
            dc,
            reason: reason || "Roll",
          });

          const output = buildOutputFromResult(result.roll, notation);
          const formatted = formatRollOutput(output, {
            dc: result.dc,
            success: result.success,
            criticalHit: result.roll.criticalHit,
            criticalFail: result.roll.criticalFail,
            characterName: result.characterName,
            checkLabel: result.roll.label,
          });

          return { content: [{ type: "text" as const, text: formatted }] };
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

      // ── DM server-side roll ──
      const { result: roll, output } = rollNotation(notation, reason || notation);

      // Send to all players
      wsClient.sendDiceRoll(roll, reason);

      // Check success against DC
      const success = dc !== undefined ? roll.total >= dc : undefined;

      const formatted = formatRollOutput(output, {
        dc,
        success,
        criticalHit: roll.criticalHit,
        criticalFail: roll.criticalFail,
      });

      return { content: [{ type: "text" as const, text: formatted }] };
    },
  );
}
