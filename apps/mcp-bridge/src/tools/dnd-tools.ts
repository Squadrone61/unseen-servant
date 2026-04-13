import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WSClient } from "../ws-client.js";
import type { GameLogger } from "../services/game-logger.js";
import { rollNotation, buildOutputFromResult, formatRollOutput } from "../services/dice-engine.js";
import { parseCheckType, getCheckAdvantageInfo } from "@unseen-servant/shared/utils";
import { getCombatBonus } from "@unseen-servant/shared/character";
import { resolveActionRef } from "@unseen-servant/shared/data";
import type { ActionRef } from "@unseen-servant/shared/data";
import { getAction } from "@unseen-servant/shared";

export function registerDndTools(
  server: McpServer,
  wsClient: WSClient,
  gameLogger: GameLogger,
): void {
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

When checkType + player are provided, the tool checks active effects for advantage/disadvantage and returns hints (e.g., "Advantage on STR checks from Rage"). Use these hints to decide whether to roll with advantage/disadvantage.

Examples:
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
          .describe(
            "Difficulty Class — shows Success/Failure to players. Overrides action_ref DC if provided.",
          ),
        reason: z
          .string()
          .optional()
          .describe("Why: 'Goblin attack', 'Spot the trap', 'Fireball damage'"),
        action_ref: z
          .object({
            source: z.enum(["spell", "weapon", "item", "monster"]),
            name: z.string(),
            monsterActionName: z.string().optional(),
          })
          .optional()
          .describe(
            "Auto-fill save DC from a DB entity's ActionEffect save.dc. Used with checkType ending in '_save'. Provide caster_spell_save_dc if the action uses 'spell_save_dc'.",
          ),
        caster_spell_save_dc: z.coerce
          .number()
          .optional()
          .describe(
            "Caster's spell save DC — substituted when action_ref resolves to 'spell_save_dc'.",
          ),
      },
    },
    async ({ notation, checkType, player, dc, reason, action_ref, caster_spell_save_dc }) => {
      // Auto-fill DC from action_ref if dc not explicitly provided
      let resolvedDC = dc;
      if (resolvedDC === undefined && action_ref && checkType?.endsWith("_save")) {
        const ref: ActionRef = action_ref;
        const resolved = resolveActionRef(ref);
        const contextualAction = resolved.action
          ? getAction(
              { effects: { action: resolved.action } },
              { spellSaveDC: caster_spell_save_dc },
            )
          : null;
        if (contextualAction?.save) {
          const saveDC = contextualAction.save.dc;
          if (typeof saveDC === "number") {
            resolvedDC = saveDC;
          }
        }
      }
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

      // ── Build advantage/disadvantage hints from active effects ──
      let effectHints = "";
      if (checkType && player) {
        const char = Object.values(wsClient.gameStateManager.characters).find(
          (c) => c.static.name.toLowerCase() === player.toLowerCase(),
        );
        if (char) {
          const advInfo = getCheckAdvantageInfo(char, checkType);
          if (advInfo.sources.length > 0) {
            effectHints = "\n⚡ " + advInfo.sources.join("; ");
            if (advInfo.advantage && advInfo.disadvantage) {
              effectHints += " (advantage and disadvantage cancel out → normal roll)";
            }
          }
        }
      }

      // ── Build damage bonus hints from combatBonuses + active effects ──
      let damageBonusHints = "";
      if (!checkType && player) {
        const char = Object.values(wsClient.gameStateManager.characters).find(
          (c) => c.static.name.toLowerCase() === player.toLowerCase(),
        );
        if (char) {
          // Phase 7: getCombatBonus() derives from effects
          const dmgBonuses = getCombatBonus(char).filter((b) => b.type === "damage");
          if (dmgBonuses.length > 0) {
            const parts = dmgBonuses.map(
              (b) =>
                `${b.value >= 0 ? "+" : ""}${b.value} ${b.attackType ?? ""} damage (${b.source})${b.condition ? ` [${b.condition}]` : ""}`,
            );
            damageBonusHints = "\n📋 Damage bonuses: " + parts.join(", ");
          }
        }
      }

      // ── Interactive player roll ──
      if (player) {
        try {
          const result = await wsClient.sendCheckRequest({
            notation,
            checkType,
            targetCharacter: player,
            dc: resolvedDC,
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

          const fullResult = formatted + effectHints + damageBonusHints;
          gameLogger.toolCall(
            "roll_dice",
            { notation, checkType, player, dc: resolvedDC, reason },
            fullResult,
          );
          return { content: [{ type: "text" as const, text: fullResult }] };
        } catch (error) {
          const errMsg = `Check request failed: ${error instanceof Error ? error.message : String(error)}`;
          gameLogger.toolCall(
            "roll_dice",
            { notation, checkType, player, dc: resolvedDC, reason },
            errMsg,
          );
          return {
            content: [
              {
                type: "text" as const,
                text: errMsg,
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
      const success = resolvedDC !== undefined ? roll.total >= resolvedDC : undefined;

      const formatted = formatRollOutput(output, {
        dc: resolvedDC,
        success,
        criticalHit: roll.criticalHit,
        criticalFail: roll.criticalFail,
      });

      gameLogger.toolCall("roll_dice", { notation, dc: resolvedDC, reason }, formatted);
      return { content: [{ type: "text" as const, text: formatted }] };
    },
  );
}
