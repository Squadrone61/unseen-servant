/**
 * Character Resolver Accessors
 *
 * On-demand accessors for derived character stats.
 *
 * Phase 2: reads stored static fields directly (fallback mode).
 * Phase 7: will derive all values from effect bundles via the effect resolver.
 *
 * Use these accessors everywhere instead of reading `char.static.*` directly —
 * that way Phase 7 can flip the implementation in one place with no consumer changes.
 */

import type { CharacterData, InventoryItem } from "../types/character";
import type {
  SkillProficiency,
  SavingThrowProficiency,
  CharacterSpeed,
  AdvantageEntry,
  ClassResource,
  CombatBonus,
} from "../types/character";

// Re-export for convenience so consumers don't need two imports.
export type { SkillProficiency, SavingThrowProficiency, CharacterSpeed, AdvantageEntry };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Armor class.
 *
 * Phase 2: returns `char.static.armorClass`.
 * Phase 7: will derive from equipped-armor + shield + Unarmored Defense bundles.
 */
export function getAC(char: CharacterData): number {
  return char.static.armorClass;
}

/**
 * Maximum hit points.
 *
 * Phase 2: returns `char.static.maxHP`.
 * Phase 7: will derive from class hit-dice + CON modifier + hp-modifier effects (Tough feat, etc.).
 *
 * Note: this is MAX HP. Current HP is `char.dynamic.currentHP`.
 */
export function getHP(char: CharacterData): number {
  return char.static.maxHP;
}

/**
 * Movement speeds (walk + optional fly/swim/climb/burrow).
 *
 * Phase 2: returns `char.static.speed`.
 * Phase 7: will derive from base speed + speed-modifier effects (Boots of Speed, Restrained, etc.).
 */
export function getSpeed(char: CharacterData): CharacterSpeed {
  return char.static.speed;
}

/**
 * Skill proficiencies with bonuses.
 *
 * Phase 2: returns `char.static.skills`.
 * Phase 7: will derive from class/species/feat proficiency grants + expertise properties.
 */
export function getSkills(char: CharacterData): SkillProficiency[] {
  return char.static.skills;
}

/**
 * Saving throw proficiencies.
 *
 * Phase 2: returns `char.static.savingThrows`.
 * Phase 7: will derive from class save proficiency grants in effect bundles.
 */
export function getSavingThrows(char: CharacterData): SavingThrowProficiency[] {
  return char.static.savingThrows;
}

/**
 * Sensory capabilities as display strings (e.g. "Darkvision 60 ft.", "Passive Perception 14").
 *
 * Phase 2: returns `char.static.senses`.
 * Phase 7: will derive from sense-type properties in effect bundles.
 */
export function getSenses(char: CharacterData): string[] {
  return char.static.senses;
}

/**
 * Spellcasting stats for a specific class (DC, attack bonus, ability).
 *
 * Phase 2: returns `char.static.spellcasting?.[className]`.
 * Phase 7: will derive from caster class level + spellcasting ability grant in effect bundles.
 */
export function getSpellcasting(
  char: CharacterData,
  className: string,
): { ability: string; dc: number; attackBonus: number } | undefined {
  return char.static.spellcasting?.[className];
}

/**
 * Advantage/disadvantage entries from species, feats, and features.
 *
 * Phase 2: returns `char.static.advantages`.
 * Phase 7: will derive from advantage/disadvantage properties in effect bundles.
 */
export function getAdvantages(char: CharacterData): AdvantageEntry[] {
  return char.static.advantages;
}

/**
 * Proficiency strings for a given kind.
 *
 * Phase 2: returns `char.static.proficiencies[kind]`.
 * Phase 7: will derive from proficiency-type properties in effect bundles.
 */
export function getProficiencies(
  char: CharacterData,
  kind: "armor" | "weapons" | "tools" | "other",
): string[] {
  return char.static.proficiencies[kind];
}

/**
 * Class resources (Rage, Bardic Inspiration, Ki Points, etc.).
 *
 * Phase 2: returns `char.static.classResources ?? []`.
 * Phase 7: will derive from resource-type properties in effect bundles, evaluated
 *          against ResolveContext (supports expression-valued maxUses like "max(cha,1)").
 */
export function getClassResources(char: CharacterData): ClassResource[] {
  return char.static.classResources ?? [];
}

/**
 * Combat bonuses (flat attack/damage/initiative bonuses from feats, magic items, etc.).
 *
 * Phase 2: returns `char.static.combatBonuses ?? []`.
 * Phase 7: will derive from modifier-type effects targeting attack/damage/initiative.
 */
export function getCombatBonus(char: CharacterData): CombatBonus[] {
  return char.static.combatBonuses ?? [];
}

/**
 * Passive Perception score.
 *
 * Formula: 10 + Perception skill bonus (proficiency + WIS modifier, or expertise).
 * The senses array from the builder already contains a "Passive Perception N" string;
 * we parse that as the canonical value. If absent (e.g. older builds), we derive it
 * from the Perception entry in the skills list, mirroring the formula used in
 * `CharacterSheet.tsx` (10 + the trailing number in the "Passive Perception N" sense
 * string, falling back to 10 + WIS modifier).
 *
 * Phase 2: reads from `char.static.senses` + `char.static.skills` + abilities.
 * Phase 7: will compute from WIS modifier + Perception proficiency/expertise from bundles.
 */
export function getPassivePerception(char: CharacterData): number {
  // Primary: parse "Passive Perception N" from senses (builder-computed value).
  const senseLine = char.static.senses.find((s) => s.startsWith("Passive Perception"));
  if (senseLine) {
    const parts = senseLine.split(" ");
    const parsed = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(parsed)) return parsed;
  }

  // Secondary: derive from skills list — 10 + Perception bonus.
  const perception = char.static.skills.find(
    (sk) => sk.name === "perception" || sk.name === "Perception",
  );
  if (perception) {
    const wisMod = abilityMod(char.static.abilities.wisdom);
    const profBonus = char.static.proficiencyBonus;
    let bonus = wisMod;
    if (perception.expertise) {
      bonus += profBonus * 2;
    } else if (perception.proficient) {
      bonus += profBonus;
    }
    if (perception.bonus) bonus += perception.bonus;
    return 10 + bonus;
  }

  // Tertiary: 10 + WIS modifier (no proficiency).
  return 10 + abilityMod(char.static.abilities.wisdom);
}

/**
 * Attack bonus for a weapon item.
 *
 * Phase 2: returns `item.attackBonus` as computed by `buildCharacter`
 *          (proficiency bonus + ability modifier + magic bonus pre-computed).
 * Phase 7: will derive from weapon's ActionEffect.attack.bonus + effect-resolver modifiers.
 *
 * Returns `undefined` for non-weapon items (no `attackBonus` field).
 */
export function getWeaponAttack(char: CharacterData, item: InventoryItem): number | undefined {
  // Phase 2: attackBonus is already computed by buildCharacter at import time.
  // Phase 7: derive from weapon's DB ActionEffect + character effect bundles.
  return item.attackBonus;
}

/**
 * Number of attacks the character can make with their Attack action.
 *
 * The effect system stores extra attacks as a `{ type: "extra_attack"; count: number }`
 * property. Today we detect this signal by looking for "Extra Attack" in combatBonuses
 * (attack-type bonus sourced from the Extra Attack feature) — but combatBonuses is a
 * flat-bonus list, not an extra-attack count. We therefore fall back to scanning the
 * features list for a feature named "Extra Attack":
 *   - 0 features named "Extra Attack" → 1 attack (default single attack)
 *   - 1 feature named "Extra Attack"  → 2 attacks (one extra)
 *   - etc.
 *
 * This is a known approximation. Phase 7 will replace it with a call to
 * `getExtraAttacks(bundles)` from the effect resolver (which reads the structured
 * `extra_attack` property), giving an accurate count from the effect bundles.
 *
 * Phase 2: heuristic — counts "Extra Attack" features; returns at least 1.
 * Phase 7: will call getExtraAttacks() from effect-resolver on the full bundle list.
 */
export function getExtraAttacks(char: CharacterData): number {
  // Count "Extra Attack" features (Fighter 5 has 1 → 2 attacks; Fighter 11 has 2 → 3).
  const extraAttackFeatures = char.static.features.filter((f) => f.name === "Extra Attack").length;
  // Return at minimum 1 (base attack every character has).
  return 1 + extraAttackFeatures;
}
