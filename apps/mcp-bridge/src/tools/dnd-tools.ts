import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WSClient } from "../ws-client.js";
import type { GameLogger } from "../services/game-logger.js";
import { rollNotation, buildOutputFromResult, formatRollOutput } from "../services/dice-engine.js";
import { parseCheckType, getCheckAdvantageInfo } from "@unseen-servant/shared/utils";
import { getRollMinimums, getSkills, getCritRiders } from "@unseen-servant/shared/character";
import { resolveActionRef } from "@unseen-servant/shared/data";
import type { ActionRef } from "@unseen-servant/shared/data";
import { getAction } from "@unseen-servant/shared";
import {
  computeDamageRoll,
  type DamageRollExtra,
  type DamageRollOptions,
} from "@unseen-servant/shared/utils";

export function registerDndTools(
  server: McpServer,
  wsClient: WSClient,
  gameLogger: GameLogger,
): void {
  server.registerTool(
    "roll_dice",
    {
      description: `Roll dice. notation is required EXCEPT when checkType="damage" with action_ref (the action's dice are auto-resolved).

NEVER ask a player to "roll X" in prose. If a PC must roll — attack, save, check, death save, initiative, damage — call \`roll_dice\` with \`player\` set so the player gets an interactive Roll button. Omit \`player\` ONLY for hidden DM/NPC/monster rolls.

When checkType is provided with player, the modifier is auto-computed from the character sheet — do NOT include a modifier in notation. Just use bare dice:
  - "1d20" for a normal check
  - "2d20kh1" for advantage
  - "2d20kl1" for disadvantage

checkType values (modifier auto-calculated, requires player):
  Skills: "perception", "stealth", "athletics", "acrobatics", "arcana", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "performance", "persuasion", "religion", "sleight_of_hand", "animal_handling", "survival"
  Abilities: "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"
  Saves: "strength_save", "dexterity_save", "constitution_save", "intelligence_save", "wisdom_save", "charisma_save"
  Attacks: "melee_attack" (STR + prof), "ranged_attack" (DEX + prof), "spell_attack" (spell bonus), "finesse_attack" (max(STR,DEX) + prof)
  Damage: "damage" — REQUIRES action_ref. Auto-resolves base dice (with embedded \`spell_mod\`/\`int\`/\`str\`/etc. expression atoms for caster mods) + weapon ability mod from properties + every active damage_* effect (Magic Weapon, Rage, Dueling…) filtered by source-kind. NO manual notation/math needed. Use is_critical_hit for crits, extras for opt-in (Sneak Attack, Smite, Hex, Hunter's Mark, etc.).

When checkType is omitted, notation is rolled exactly as-is — include any modifiers yourself.

Examples:
  Player perception:        { player: "Arlon", notation: "1d20", checkType: "perception", dc: 15 }
  Player DEX save (adv):    { player: "Arlon", notation: "2d20kh1", checkType: "dexterity_save", dc: 14 }
  Longsword damage:         { player: "Arlon", checkType: "damage", action_ref: { source: "weapon", name: "Longsword" } }
  Fireball at slot 5:       { player: "Mira",  checkType: "damage", action_ref: { source: "spell", name: "Fireball" }, upcast_level: 2 }
  Fire Bolt (caster lvl 5): { player: "Mira",  checkType: "damage", action_ref: { source: "spell", name: "Fire Bolt" } }
  Crit longsword + sneak:   { player: "Slip",  checkType: "damage", action_ref: { source: "weapon", name: "Rapier" }, is_critical_hit: true, extras: [{ source: "feature", name: "Sneak Attack" }] }
  Smite at slot 3:          { player: "Lia",   checkType: "damage", action_ref: { source: "weapon", name: "Longsword" }, extras: [{ source: "spell", name: "Divine Smite", upcastLevel: 2 }] }
  Monster attack (DM roll): { notation: "1d20+6", dc: 15, reason: "Goblin attacks Arlon" }
  Goblin damage (DM roll):  { notation: "2d6+3", reason: "Goblin shortsword damage" }`,
      inputSchema: {
        notation: z
          .string()
          .optional()
          .describe(
            "Dice notation: '1d20', '2d20kh1' (advantage), '2d6+3'. Required for non-damage rolls; optional with checkType='damage' + action_ref (the action's dice are resolved automatically). When provided alongside damage+action_ref, treated as additive extra dice.",
          ),
        checkType: z
          .string()
          .optional()
          .describe(
            "Auto-compute modifier from character sheet. Requires player. See tool description for valid values, including 'damage'.",
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
            "Difficulty Class — shows Success/Failure to players. Overrides action_ref DC if provided. Ignored for damage rolls.",
          ),
        reason: z
          .string()
          .optional()
          .describe("Why: 'Goblin attack', 'Spot the trap', 'Fireball damage'"),
        action_ref: z
          .object({
            source: z.enum(["spell", "weapon", "item", "monster", "feature"]),
            name: z.string(),
            monsterActionName: z.string().optional(),
          })
          .optional()
          .describe(
            "Identifies the action being rolled. For checkType ending in '_save': auto-fills DC. For checkType='damage': REQUIRED — auto-resolves dice/ability mod/effect bonuses.",
          ),
        caster_spell_save_dc: z.coerce
          .number()
          .optional()
          .describe(
            "Caster's spell save DC — substituted when action_ref resolves to 'spell_save_dc'.",
          ),
        is_critical_hit: z
          .boolean()
          .optional()
          .describe("checkType='damage' only — doubles all dice (modifiers untouched)."),
        upcast_level: z.coerce
          .number()
          .optional()
          .describe(
            "checkType='damage' only — extra spell levels above the spell's base level (Fireball at slot 5 = 2). Triggers per-level scaling.",
          ),
        ability: z
          .enum(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"])
          .optional()
          .describe(
            "checkType='damage' only — override the ability used for the WEAPON damage modifier (e.g. Monk uses DEX for Monk weapons). Default: derived from weapon properties. Spell ability mods are baked into the spell's dice expression via `spell_mod` and need no override.",
          ),
        extras: z
          .array(
            z.object({
              source: z.enum(["spell", "feature", "feat", "weapon", "item", "monster"]),
              name: z.string(),
              upcastLevel: z.coerce.number().optional(),
              diceOverride: z.string().optional(),
              typeOverride: z.string().optional(),
            }),
          )
          .optional()
          .describe(
            "checkType='damage' only — opt-in extras (Sneak Attack, Divine Smite, Psionic Strike, Hex, Hunter's Mark, etc.). Each ref is resolved against the DB (source: 'feature' for class features, 'spell' for spells like Smite/Hex). Use diceOverride for ad-hoc rolls.",
          ),
      },
    },
    async ({
      notation,
      checkType,
      player,
      dc,
      reason,
      action_ref,
      caster_spell_save_dc,
      is_critical_hit,
      upcast_level,
      ability,
      extras,
    }) => {
      // ── Validate checkType ──
      if (checkType) {
        const parsed = parseCheckType(checkType);
        if (!parsed) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Unrecognized checkType "${checkType}". Valid: skill names, ability names, saves, attacks (melee_attack, ranged_attack, spell_attack, finesse_attack), or "damage".`,
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

      // ── Resolve damage-roll notation up front ──
      // For checkType="damage": resolve action_ref + extras + ability mod + effect
      // bonuses → final notation, breakdown, hints. Notation arg is treated as
      // additive extra dice.
      const isDamageRoll = checkType?.toLowerCase() === "damage";
      let damageNotation: string | undefined;
      let damageBreakdown = "";
      let damageHints = "";
      let damageErrors = "";
      let damagePrimaryType: string | undefined;

      if (isDamageRoll) {
        if (!action_ref) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: checkType="damage" requires action_ref so the dice can be auto-resolved. Example: { player: "Arlon", checkType: "damage", action_ref: { source: "weapon", name: "Longsword" } }.`,
              },
            ],
          };
        }
        const char = Object.values(wsClient.gameStateManager.characters).find(
          (c) => c.static.name.toLowerCase() === (player ?? "").toLowerCase(),
        );
        if (!char) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Could not find character "${player}" for damage roll.`,
              },
            ],
          };
        }

        const opts: DamageRollOptions = {
          ability,
          upcastLevel: upcast_level,
          isCriticalHit: is_critical_hit,
          extras: extras as DamageRollExtra[] | undefined,
        };
        const computed = computeDamageRoll(char, action_ref, opts);
        damageNotation = computed.notation;
        damagePrimaryType = computed.primaryDamageType;

        if (computed.errors.length > 0) {
          damageErrors = "\n⚠️ " + computed.errors.join("; ");
        }

        // Append additive notation if provided (Q8: notation is treated as
        // additive extras for damage rolls).
        if (notation && notation.trim() !== "") {
          damageNotation = damageNotation
            ? `${damageNotation}+${notation.trim()}`
            : notation.trim();
        }

        // Breakdown line.
        if (computed.breakdown.length > 0) {
          const parts = computed.breakdown.map((b) => {
            const dmg = b.damageType ? ` ${b.damageType}` : "";
            if (b.dice && b.flat !== undefined) return `${b.dice}+${b.flat} ${b.label}${dmg}`;
            if (b.dice) return `${b.dice} ${b.label}${dmg}`;
            if (b.flat !== undefined) return `${b.flat >= 0 ? "+" : ""}${b.flat} ${b.label}${dmg}`;
            return b.label;
          });
          damageBreakdown = `\n📊 ${parts.join(", ")}`;
        }
        if (computed.hints.length > 0) {
          damageHints = "\n💡 " + computed.hints.join("; ");
        }

        // If the computed notation is empty, surface error and bail.
        if (!damageNotation || damageNotation === "0") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Could not resolve damage roll for ${action_ref.source}:${action_ref.name}.${damageErrors}`,
              },
            ],
          };
        }
      } else {
        // Non-damage path: notation is required.
        if (!notation || notation.trim() === "") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: notation is required (omit only when checkType="damage" with action_ref).`,
              },
            ],
          };
        }
      }

      // ── Auto-fill DC from action_ref for save checks ──
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

      // ── Build advantage/disadvantage hints from active effects (d20 checks only) ──
      let effectHints = "";
      if (checkType && player && !isDamageRoll) {
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

          // Roll-minimum hints (Reliable Talent, Indomitable Might).
          const parsed = parseCheckType(checkType);
          const minimums = getRollMinimums(char);
          if (parsed && minimums.length > 0) {
            const skillKey =
              parsed.category === "skill" ? parsed.skill.replace(/_/g, "_") : undefined;
            const proficient =
              parsed.category === "skill" && skillKey
                ? getSkills(char).some(
                    (s) => s.name.toLowerCase() === skillKey && (s.proficient || s.expertise),
                  )
                : false;
            const matchingTargets = new Set<string>();
            if (parsed.category === "skill") matchingTargets.add(parsed.skill);
            if (parsed.category === "ability" || parsed.category === "skill") {
              matchingTargets.add("ability_check");
              matchingTargets.add(`${parsed.ability}_check`);
            }
            if (parsed.category === "saving_throw") {
              matchingTargets.add("save");
              matchingTargets.add(`save_${parsed.ability}`);
            }
            if (parsed.category === "attack") {
              matchingTargets.add("attack");
              if (parsed.attackType !== "finesse")
                matchingTargets.add(`attack_${parsed.attackType}`);
            }
            const applicable = minimums.filter(
              (m) => matchingTargets.has(m.on) && (!m.proficientOnly || proficient),
            );
            for (const m of applicable) {
              effectHints +=
                m.mode === "total"
                  ? `\n🎯 Roll floor: if total < ${m.min}, use ${m.min}`
                  : `\n🎯 Roll floor: treat any d20 ≤ ${m.min - 1} as ${m.min}`;
            }
          }

          // Crit-rider hints (Crusher / Slasher / Piercer) on weapon attacks.
          if (parsed && parsed.category === "attack") {
            for (const rider of getCritRiders(char)) {
              const dmg = rider.weaponDamageType;
              let effectText: string;
              switch (rider.effect.kind) {
                case "extra_die":
                  effectText = "roll one extra weapon damage die";
                  break;
                case "advantage_next_attack":
                  effectText = "next attack vs the target has advantage";
                  break;
                case "target_disadvantage_attacks":
                  effectText = "target has Disadvantage on attacks until start of your next turn";
                  break;
              }
              effectHints += `\n💥 On ${dmg} crit: ${effectText}`;
            }
          }
        }
      }

      // ── Damage rolls don't use DC; ignore it if accidentally provided ──
      if (isDamageRoll) {
        resolvedDC = undefined;
      }

      // Final notation: damage path overrides; otherwise use the user-provided
      // notation (which we've already validated is non-empty).
      const finalNotation = damageNotation ?? (notation as string);

      // ── Interactive player roll ──
      if (player) {
        try {
          const result = await wsClient.sendCheckRequest({
            notation: finalNotation,
            checkType,
            targetCharacter: player,
            dc: resolvedDC,
            reason: reason || (isDamageRoll ? "Damage roll" : "Roll"),
          });

          const output = buildOutputFromResult(result.roll, finalNotation);
          const formatted = formatRollOutput(output, {
            dc: result.dc,
            success: result.success,
            criticalHit: result.roll.criticalHit,
            criticalFail: result.roll.criticalFail,
            characterName: result.characterName,
            checkLabel: result.roll.label,
          });

          const noteLine = result.playerMessage
            ? `\n📝 Player note: "${result.playerMessage}"`
            : "";
          const damageTypeLine = isDamageRoll && damagePrimaryType ? ` (${damagePrimaryType})` : "";
          const fullResult =
            formatted +
            damageTypeLine +
            noteLine +
            effectHints +
            damageBreakdown +
            damageHints +
            damageErrors;
          gameLogger.toolCall(
            "roll_dice",
            { notation: finalNotation, checkType, player, dc: resolvedDC, reason },
            fullResult,
          );
          return { content: [{ type: "text" as const, text: fullResult }] };
        } catch (error) {
          const errMsg = `Check request failed: ${error instanceof Error ? error.message : String(error)}`;
          gameLogger.toolCall(
            "roll_dice",
            { notation: finalNotation, checkType, player, dc: resolvedDC, reason },
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
      const { result: roll, output } = rollNotation(finalNotation, reason || finalNotation);

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

      const damageTypeLine = isDamageRoll && damagePrimaryType ? ` (${damagePrimaryType})` : "";
      const fullResult = formatted + damageTypeLine + damageBreakdown + damageHints + damageErrors;
      gameLogger.toolCall(
        "roll_dice",
        { notation: finalNotation, dc: resolvedDC, reason },
        fullResult,
      );
      return { content: [{ type: "text" as const, text: fullResult }] };
    },
  );
}
