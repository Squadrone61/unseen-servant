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
    case "attack":
      return `Attack${check.reason ? ` — ${check.reason}` : ""}`;
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
    // Use spell attack bonus or proficiency + STR/DEX
    if (s.spellAttackBonus !== undefined) {
      return s.spellAttackBonus;
    }
    // Melee: STR + prof, Ranged: DEX + prof
    const strMod = getModifier(s.abilities.strength);
    const dexMod = getModifier(s.abilities.dexterity);
    return Math.max(strMod, dexMod) + s.proficiencyBonus;
  }

  return 0;
}
