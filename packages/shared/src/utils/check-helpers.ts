/**
 * Shared check helpers — compute modifiers and build labels for D&D checks.
 *
 * Used by both the worker (server-side) and the MCP bridge.
 */

import type { CheckRequest } from "../types/game-state";
import type { CharacterData } from "../types/character";
import { getModifier, getSkillModifier, getSavingThrowModifier } from "./character-helpers";

/** Build a descriptive label for a dice roll from check fields. */
export function buildCheckLabel(check: CheckRequest): string {
  const abilityAbbr = check.ability?.slice(0, 3).toUpperCase();
  switch (check.type) {
    case "saving_throw":
      return abilityAbbr
        ? `${abilityAbbr} Save${check.reason ? ` — ${check.reason}` : ""}`
        : `Save${check.reason ? ` — ${check.reason}` : ""}`;
    case "skill": {
      const skill = check.skill ? check.skill.charAt(0).toUpperCase() + check.skill.slice(1) : null;
      return skill
        ? `${skill}${check.reason && check.reason.toLowerCase() !== skill.toLowerCase() ? ` — ${check.reason}` : ""}`
        : check.reason;
    }
    case "ability":
      return abilityAbbr
        ? `${abilityAbbr} Check${check.reason ? ` — ${check.reason}` : ""}`
        : check.reason;
    case "attack": {
      const atkType = check.attackType ? ` (${check.attackType})` : "";
      return `Attack${atkType}${check.reason ? ` — ${check.reason}` : ""}`;
    }
    default:
      return check.reason;
  }
}

/** Compute the modifier for a check based on the character's stats. */
export function computeCheckModifier(char: CharacterData, check: CheckRequest): number {
  const s = char.static;

  if (check.type === "skill" && check.skill) {
    const skill = s.skills.find((sk) => sk.name.toLowerCase() === check.skill!.toLowerCase());
    if (skill) {
      return getSkillModifier(skill, s.abilities, s.proficiencyBonus);
    }
  }

  if (check.type === "saving_throw" && check.ability) {
    const save = s.savingThrows.find((sv) => sv.ability === check.ability);
    if (save) {
      return getSavingThrowModifier(save, s.abilities, s.proficiencyBonus);
    }
    // Fallback: raw ability modifier
    const abilityKey = check.ability as keyof typeof s.abilities;
    if (s.abilities[abilityKey] !== undefined) {
      return getModifier(s.abilities[abilityKey]);
    }
  }

  if (check.type === "ability" && check.ability) {
    const abilityKey = check.ability as keyof typeof s.abilities;
    if (s.abilities[abilityKey] !== undefined) {
      return getModifier(s.abilities[abilityKey]);
    }
  }

  if (check.type === "attack") {
    // Spell attacks use spellAttackBonus directly
    if (check.attackType === "spell" && s.spellAttackBonus !== undefined) {
      return s.spellAttackBonus;
    }

    // Weapon attacks: ability mod + proficiency + combat bonuses
    // If ability is explicitly provided (e.g. Finesse weapon choosing DEX), use that.
    // Otherwise: melee → STR, ranged → DEX
    let abilityMod: number;
    if (check.ability) {
      const key = check.ability as keyof typeof s.abilities;
      abilityMod = s.abilities[key] !== undefined ? getModifier(s.abilities[key]) : 0;
    } else if (check.attackType === "ranged") {
      abilityMod = getModifier(s.abilities.dexterity);
    } else {
      // melee (default)
      abilityMod = getModifier(s.abilities.strength);
    }
    let modifier = abilityMod + s.proficiencyBonus;

    // Apply unconditional combat bonuses matching the attack type
    if (s.combatBonuses) {
      for (const bonus of s.combatBonuses) {
        if (bonus.type === "attack" && !bonus.condition) {
          if (!bonus.attackType || bonus.attackType === check.attackType) {
            modifier += bonus.value;
          }
        }
      }
    }

    return modifier;
  }

  return 0;
}
