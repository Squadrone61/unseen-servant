/**
 * Shared check helpers — compute modifiers and build labels for D&D checks.
 *
 * Used by both the worker (server-side) and the MCP bridge.
 */

import type { CheckRequest } from "../types/game-state";
import type { CharacterData } from "../types/character";
import { getModifier, getSkillModifier, getSavingThrowModifier } from "./character-helpers";

// ─── Check type parsing ───

/** All 18 D&D 5e skills mapped to their key ability. */
export const SKILL_ABILITY_MAP: Record<string, string> = {
  acrobatics: "dexterity",
  animal_handling: "wisdom",
  arcana: "intelligence",
  athletics: "strength",
  deception: "charisma",
  history: "intelligence",
  insight: "wisdom",
  intimidation: "charisma",
  investigation: "intelligence",
  medicine: "wisdom",
  nature: "intelligence",
  perception: "wisdom",
  performance: "charisma",
  persuasion: "charisma",
  religion: "intelligence",
  sleight_of_hand: "dexterity",
  stealth: "dexterity",
  survival: "wisdom",
};

export const ABILITIES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;

export type ParsedCheck =
  | { category: "skill"; skill: string; ability: string }
  | { category: "ability"; ability: string }
  | { category: "saving_throw"; ability: string }
  | { category: "attack"; attackType: "melee" | "ranged" | "spell" | "finesse" };

/**
 * Parse a flat checkType string into a structured ParsedCheck.
 * Returns null if the string is not recognised.
 *
 * Recognised values:
 *   Skills:  "perception", "stealth", "athletics", etc.
 *   Ability: "strength", "dexterity", etc.
 *   Save:    "strength_save", "dexterity_save", etc.
 *   Attack:  "melee_attack", "ranged_attack", "spell_attack", "finesse_attack"
 */
export function parseCheckType(checkType: string): ParsedCheck | null {
  const key = checkType.toLowerCase().replace(/\s+/g, "_");

  // Skill check
  if (SKILL_ABILITY_MAP[key]) {
    return { category: "skill", skill: key, ability: SKILL_ABILITY_MAP[key] };
  }

  // Ability check
  if ((ABILITIES as readonly string[]).includes(key)) {
    return { category: "ability", ability: key };
  }

  // Saving throw: "{ability}_save"
  if (key.endsWith("_save")) {
    const ability = key.slice(0, -5);
    if ((ABILITIES as readonly string[]).includes(ability)) {
      return { category: "saving_throw", ability };
    }
  }

  // Attack types
  if (key === "melee_attack") return { category: "attack", attackType: "melee" };
  if (key === "ranged_attack") return { category: "attack", attackType: "ranged" };
  if (key === "spell_attack") return { category: "attack", attackType: "spell" };
  if (key === "finesse_attack") return { category: "attack", attackType: "finesse" };

  return null;
}

/** Build a descriptive label for a dice roll from a CheckRequest. */
export function buildCheckLabel(check: CheckRequest): string {
  const { checkType, reason } = check;

  if (!checkType) return reason;

  const parsed = parseCheckType(checkType);
  if (!parsed) return reason;

  switch (parsed.category) {
    case "skill": {
      const skillLabel = parsed.skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return reason && reason.toLowerCase() !== parsed.skill.replace(/_/g, " ")
        ? `${skillLabel} — ${reason}`
        : skillLabel;
    }
    case "ability": {
      const abbr = parsed.ability.slice(0, 3).toUpperCase();
      return `${abbr} Check${reason ? ` — ${reason}` : ""}`;
    }
    case "saving_throw": {
      const abbr = parsed.ability.slice(0, 3).toUpperCase();
      return `${abbr} Save${reason ? ` — ${reason}` : ""}`;
    }
    case "attack": {
      const atkLabel = parsed.attackType.charAt(0).toUpperCase() + parsed.attackType.slice(1);
      return `${atkLabel} Attack${reason ? ` — ${reason}` : ""}`;
    }
  }
}

/** Compute the modifier for a check based on the character's stats. */
export function computeCheckModifier(char: CharacterData, check: CheckRequest): number {
  const s = char.static;

  if (!check.checkType) return 0;

  const parsed = parseCheckType(check.checkType);
  if (!parsed) return 0;

  if (parsed.category === "skill") {
    const skill = s.skills.find((sk) => sk.name.toLowerCase() === parsed.skill);
    if (skill) {
      return getSkillModifier(skill, s.abilities, s.proficiencyBonus);
    }
  }

  if (parsed.category === "saving_throw") {
    const save = s.savingThrows.find((sv) => sv.ability === parsed.ability);
    if (save) {
      return getSavingThrowModifier(save, s.abilities, s.proficiencyBonus);
    }
    // Fallback: raw ability modifier
    const abilityKey = parsed.ability as keyof typeof s.abilities;
    if (s.abilities[abilityKey] !== undefined) {
      return getModifier(s.abilities[abilityKey]);
    }
  }

  if (parsed.category === "ability") {
    const abilityKey = parsed.ability as keyof typeof s.abilities;
    if (s.abilities[abilityKey] !== undefined) {
      return getModifier(s.abilities[abilityKey]);
    }
  }

  if (parsed.category === "attack") {
    // Spell attacks use spellAttackBonus directly
    if (parsed.attackType === "spell" && s.spellAttackBonus !== undefined) {
      return s.spellAttackBonus;
    }

    // Finesse: max(STR, DEX) mod + proficiency
    if (parsed.attackType === "finesse") {
      const strMod = getModifier(s.abilities.strength);
      const dexMod = getModifier(s.abilities.dexterity);
      let modifier = Math.max(strMod, dexMod) + s.proficiencyBonus;

      if (s.combatBonuses) {
        for (const bonus of s.combatBonuses) {
          if (bonus.type === "attack" && !bonus.condition) {
            if (!bonus.attackType || bonus.attackType === "melee") {
              modifier += bonus.value;
            }
          }
        }
      }

      return modifier;
    }

    // Ranged → DEX mod; Melee → STR mod
    const abilityMod =
      parsed.attackType === "ranged"
        ? getModifier(s.abilities.dexterity)
        : getModifier(s.abilities.strength);

    let modifier = abilityMod + s.proficiencyBonus;

    // Apply unconditional combat bonuses matching the attack type
    const bonusAttackType = parsed.attackType as "melee" | "ranged" | "spell";
    if (s.combatBonuses) {
      for (const bonus of s.combatBonuses) {
        if (bonus.type === "attack" && !bonus.condition) {
          if (!bonus.attackType || bonus.attackType === bonusAttackType) {
            modifier += bonus.value;
          }
        }
      }
    }

    return modifier;
  }

  return 0;
}
