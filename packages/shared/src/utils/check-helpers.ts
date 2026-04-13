/**
 * Shared check helpers — compute modifiers and build labels for D&D checks.
 *
 * Used by both the worker (server-side) and the MCP bridge.
 */

import type { CheckRequest } from "../types/game-state";
import type { CharacterData } from "../types/character";
import type { ModifierTarget, AdvantageTarget } from "../types/effects";
import { getModifier } from "./character-helpers";
import {
  resolveEffectiveStat,
  getActiveEffects,
  buildResolveContext,
  resolveStat,
  hasAdvantage,
  hasDisadvantage,
} from "./effect-resolver";
import { getSkills, getSavingThrows, getSpellcasting, getCombatBonus } from "../character/resolve";

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

/**
 * Resolve an ability score through activeEffects (e.g., Gauntlets of Ogre Power sets STR=19).
 * Falls back to the static score if no effects modify it.
 */
function resolveAbilityScore(
  char: CharacterData,
  ability: keyof typeof char.static.abilities,
): number {
  const bundles = getActiveEffects(char);
  if (bundles.length === 0) return char.static.abilities[ability];
  return resolveEffectiveStat(char, ability as ModifierTarget, char.static.abilities[ability]);
}

/**
 * Get the flat bonus from activeEffects for a specific modifier target.
 * This captures bonuses like Bless (+1d4 to attacks/saves) — for constant-value
 * modifiers only (expression/dice values are skipped since we can't add them to
 * a flat modifier).
 */
function getEffectBonus(char: CharacterData, target: ModifierTarget): number {
  const bundles = getActiveEffects(char);
  if (bundles.length === 0) return 0;
  const ctx = buildResolveContext(char);
  // resolveStat with base=0 gives us just the effect delta
  return resolveStat(bundles, target, 0, ctx);
}

/**
 * Derive proficiency bonus from total level (Phase 7: no longer stored on static).
 */
function deriveProfBonus(char: CharacterData): number {
  const totalLevel = char.static.classes.reduce((sum, c) => sum + c.level, 0);
  return Math.floor((totalLevel - 1) / 4) + 2;
}

/** Compute the modifier for a check based on the character's stats and activeEffects. */
export function computeCheckModifier(char: CharacterData, check: CheckRequest): number {
  if (!check.checkType) return 0;

  const parsed = parseCheckType(check.checkType);
  if (!parsed) return 0;

  const profBonus = deriveProfBonus(char);

  if (parsed.category === "skill") {
    // Phase 7: getSkills() derives from effects
    const skills = getSkills(char);
    const skill = skills.find((sk) => sk.name.toLowerCase() === parsed.skill);
    if (skill) {
      const effectiveAbilityScore = resolveAbilityScore(
        char,
        SKILL_ABILITY_MAP[parsed.skill] as keyof typeof char.static.abilities,
      );
      const abilityMod = getModifier(effectiveAbilityScore);
      const skillProfBonus = skill.proficient ? profBonus * (skill.expertise ? 2 : 1) : 0;
      return abilityMod + skillProfBonus + (skill.bonus ?? 0) + getEffectBonus(char, "d20");
    }
  }

  if (parsed.category === "saving_throw") {
    const effectiveAbilityScore = resolveAbilityScore(
      char,
      parsed.ability as keyof typeof char.static.abilities,
    );
    const abilityMod = getModifier(effectiveAbilityScore);
    // Phase 7: getSavingThrows() derives from effects
    const savingThrows = getSavingThrows(char);
    const save = savingThrows.find((sv) => sv.ability === parsed.ability);
    const saveProfBonus = save?.proficient ? profBonus : 0;
    const target = `save_${parsed.ability}` as ModifierTarget;
    const flatBonus = save?.bonus ?? 0;
    return abilityMod + saveProfBonus + flatBonus + getEffectBonus(char, target);
  }

  if (parsed.category === "ability") {
    const effectiveAbilityScore = resolveAbilityScore(
      char,
      parsed.ability as keyof typeof char.static.abilities,
    );
    return getModifier(effectiveAbilityScore) + getEffectBonus(char, "d20");
  }

  if (parsed.category === "attack") {
    // Spell attacks use the first (or only) spellcasting entry + effect bonuses
    // Phase 7: getSpellcasting() derives from effects
    if (parsed.attackType === "spell") {
      for (const cls of char.static.classes) {
        const sc = getSpellcasting(char, cls.name);
        if (sc) {
          return sc.attackBonus + getEffectBonus(char, "attack_spell");
        }
      }
    }

    // Finesse: max(STR, DEX) mod + proficiency
    if (parsed.attackType === "finesse") {
      const strMod = getModifier(resolveAbilityScore(char, "strength"));
      const dexMod = getModifier(resolveAbilityScore(char, "dexterity"));
      let modifier = Math.max(strMod, dexMod) + profBonus;

      // Phase 7: getCombatBonus() derives from effects
      const combatBonuses = getCombatBonus(char);
      for (const bonus of combatBonuses) {
        if (bonus.type === "attack" && !bonus.condition) {
          if (!bonus.attackType || bonus.attackType === "melee") {
            modifier += bonus.value;
          }
        }
      }

      return modifier + getEffectBonus(char, "attack_melee");
    }

    // Ranged → DEX mod; Melee → STR mod (resolved through effects)
    const abilityMod =
      parsed.attackType === "ranged"
        ? getModifier(resolveAbilityScore(char, "dexterity"))
        : getModifier(resolveAbilityScore(char, "strength"));

    let modifier = abilityMod + profBonus;

    // Phase 7: getCombatBonus() derives from effects
    const bonusAttackType = parsed.attackType as "melee" | "ranged" | "spell";
    const combatBonuses = getCombatBonus(char);
    for (const bonus of combatBonuses) {
      if (bonus.type === "attack" && !bonus.condition) {
        if (!bonus.attackType || bonus.attackType === bonusAttackType) {
          modifier += bonus.value;
        }
      }
    }

    const target = `attack_${parsed.attackType}` as ModifierTarget;
    return modifier + getEffectBonus(char, target);
  }

  return 0;
}

/**
 * Map a ParsedCheck to the AdvantageTarget(s) that should be checked for
 * advantage/disadvantage from active effects.
 */
function checkToAdvantageTargets(parsed: ParsedCheck): AdvantageTarget[] {
  switch (parsed.category) {
    case "skill": {
      // Check the specific skill + its parent ability check + generic ability_check
      const abilityCheck = `${SKILL_ABILITY_MAP[parsed.skill]}_check` as AdvantageTarget;
      return [parsed.skill as AdvantageTarget, abilityCheck, "ability_check"];
    }
    case "ability":
      return [`${parsed.ability}_check` as AdvantageTarget, "ability_check"];
    case "saving_throw":
      return [`save_${parsed.ability}` as AdvantageTarget, "save"];
    case "attack": {
      const specific = `attack_${parsed.attackType}` as AdvantageTarget;
      return [specific, "attack"];
    }
  }
}

/**
 * Check if a character has advantage or disadvantage on a given check type
 * from their active effect bundles.
 *
 * Returns { advantage, disadvantage, sources } where sources describe where
 * the advantage/disadvantage comes from.
 */
export function getCheckAdvantageInfo(
  char: CharacterData,
  checkType: string,
): { advantage: boolean; disadvantage: boolean; sources: string[] } {
  const parsed = parseCheckType(checkType);
  if (!parsed) return { advantage: false, disadvantage: false, sources: [] };

  const bundles = getActiveEffects(char);
  if (bundles.length === 0) return { advantage: false, disadvantage: false, sources: [] };

  const targets = checkToAdvantageTargets(parsed);
  let advantage = false;
  let disadvantage = false;
  const sources: string[] = [];

  for (const target of targets) {
    if (hasAdvantage(bundles, target)) {
      advantage = true;
      // Find the source bundle(s)
      for (const b of bundles) {
        if (
          b.effects.properties?.some(
            (p) => p.type === "advantage" && p.on.toLowerCase() === target.toLowerCase(),
          )
        ) {
          sources.push(`advantage on ${target} from ${b.source.featureName ?? b.source.name}`);
        }
      }
    }
    if (hasDisadvantage(bundles, target)) {
      disadvantage = true;
      for (const b of bundles) {
        if (
          b.effects.properties?.some(
            (p) => p.type === "disadvantage" && p.on.toLowerCase() === target.toLowerCase(),
          )
        ) {
          sources.push(`disadvantage on ${target} from ${b.source.featureName ?? b.source.name}`);
        }
      }
    }
  }

  return { advantage, disadvantage, sources };
}
