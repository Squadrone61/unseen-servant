// === Character Data Types ===
// Structured to separate static (imported) data from dynamic (gameplay) data.

import type { ConditionEntry } from "./game-state";
import type { EffectBundle } from "./effects";
import type { BuilderState } from "./builder";
import type { Spell } from "./spell";
import type { Item } from "./item";

export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface CharacterClass {
  name: string;
  level: number;
  subclass?: string;
}

export type { Spell, Item };

export interface SpellSlotLevel {
  level: number; // 1-9
  total: number;
  used: number;
}

export interface Currency {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
}

export interface CharacterTraits {
  personalityTraits?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
}

export interface CharacterAppearance {
  gender?: string;
  age?: string;
  height?: string;
  weight?: string;
  hair?: string;
  eyes?: string;
  skin?: string;
}

export interface DeathSaves {
  successes: number;
  failures: number;
}

/**
 * A DB pointer to a class/subclass/feat/species/background feature.
 * Replaces CharacterFeature (which copied description text) so that descriptions
 * are resolved on demand via resolveFeatureDescription(ref) in data/index.ts
 * rather than stored redundantly.
 *
 * - dbKind: which DB category to look up
 * - dbName: the entity name ("Barbarian", "Alert", "Tiefling")
 * - featureName: the specific sub-feature within the entity ("Rage", "Reckless Attack")
 * - sourceLabel: human-readable label for display ("Barbarian 3", "Alert Feat")
 * - requiredLevel: minimum class level to gain this feature (class features only)
 */
export interface CharacterFeatureRef {
  dbKind: "class" | "subclass" | "feat" | "species" | "background";
  dbName: string; // "Barbarian", "Alert", "Tiefling"
  featureName?: string; // "Rage", "Reckless Attack"
  sourceLabel: string; // "Barbarian 3"
  requiredLevel?: number;
}

export interface CombatBonus {
  type: "attack" | "damage" | "initiative";
  value: number;
  attackType?: "melee" | "ranged" | "spell";
  source: string;
  condition?: string;
}

export interface ClassResource {
  name: string;
  maxUses: number;
  /** Amount recovered on long rest. "all" = full recovery, number = partial. */
  longRest: number | "all";
  /** Amount recovered on short rest. Omit if not recovered on short rest. */
  shortRest?: number | "all";
  source: string; // class name: "Paladin", "Cleric", "Monk", etc.
}

export interface ProficiencyGroup {
  armor: string[];
  weapons: string[];
  tools: string[];
  other: string[];
}

/**
 * An advantage or disadvantage modifier from DDB.
 * subType identifies what it applies to (e.g. "saving-throws", "stealth", "initiative").
 * restriction is optional text describing conditions (e.g. "Against Poison").
 */
export interface AdvantageEntry {
  type: "advantage" | "disadvantage";
  subType: string; // DDB subType slug: "saving-throws", "strength-saving-throws", "stealth", "initiative", "attack-rolls", etc.
  restriction?: string; // conditional text: "Against being frightened", "Against Poison", etc.
  source: string; // where it came from: "Brave" (feat), "Dwarven Resilience" (race), etc.
}

export interface SkillProficiency {
  name: string; // slug: "athletics", "sleight-of-hand", etc.
  ability: keyof AbilityScores; // governing ability
  proficient: boolean;
  expertise: boolean; // double proficiency
  bonus?: number; // flat bonus from items/features
}

export interface SavingThrowProficiency {
  ability: keyof AbilityScores;
  proficient: boolean;
  bonus?: number; // flat bonus from items/features
}

export interface CharacterSpeed {
  walk: number;
  fly?: number;
  swim?: number;
  climb?: number;
  burrow?: number;
}

/**
 * Static data from the character builder.
 * Only changes when the character is re-imported.
 *
 * Phase 7: derivable fields (AC, maxHP, speed, skills, savingThrows, senses,
 * spellcasting, combatBonuses, advantages, classResources, proficiencies,
 * proficiencyBonus) have been removed. All mechanical derivation happens at
 * accessor call time via the resolver in `character/resolve.ts`.
 * The `effects` field stores all permanent build-time effect bundles
 * (species, class features, subclass features, feats) so the resolver has
 * the information it needs without hitting the DB on every call.
 */
export interface CharacterStaticData {
  name: string;
  species?: string; // species/race name (2024 terminology, optional for backward compat)
  race: string; // primary species/race field
  classes: CharacterClass[];
  abilities: AbilityScores;
  languages: string[]; // "Common", "Elvish"
  spells: Spell[];
  features: CharacterFeatureRef[];
  traits: CharacterTraits;
  appearance?: CharacterAppearance;
  backstory?: string;
  alignment?: string;
  importedAt: number; // timestamp
  source?: "builder"; // import source
  /**
   * All permanent build-time effect bundles: species traits, class features,
   * subclass features, feats, background features. Resolver accessors in
   * `character/resolve.ts` combine these with `dynamic.activeEffects` and
   * implicit equipped-item/condition/concentration bundles to derive all stats
   * on demand.
   */
  effects: EffectBundle[];
}

/**
 * Dynamic data owned by our system — changes during gameplay.
 * Preserved across re-imports; initialized from static data on first import.
 */
export interface CharacterDynamicData {
  currentHP: number;
  tempHP: number;
  spellSlotsUsed: SpellSlotLevel[];
  pactMagicSlots?: SpellSlotLevel[]; // Warlock pact magic (tracked separately, recharges on short rest)
  resourcesUsed?: Record<string, number>; // class resource usage keyed by name
  conditions: ConditionEntry[]; // "poisoned", "stunned", etc.
  /**
   * Exhaustion level (0–10). Each level applies -2 to all d20 rolls and spell save DC.
   * Speed reduced by 5ft × level. Long rest removes 1 level. Death at level 10.
   * Omitted when 0 (no exhaustion).
   */
  exhaustionLevel?: number;
  deathSaves: DeathSaves;
  inventory: Item[];
  currency: Currency;
  heroicInspiration?: boolean;
  concentratingOn?: { spellName: string; since?: number };
  /** Runtime effect bundles from conditions, spells, activatable features, etc. */
  activeEffects?: EffectBundle[];
}

/**
 * Complete character data — builder snapshot + static + dynamic.
 * The `builder` field stores the full BuilderState for lossless edit round-trips.
 * It is stripped before being sent to DM tools or other players.
 */
export interface CharacterData {
  builder: BuilderState;
  static: CharacterStaticData;
  dynamic: CharacterDynamicData;
}

/**
 * Player info with online/offline tracking.
 */
export interface PlayerInfo {
  name: string;
  online: boolean;
  isHost: boolean;
  isDM?: boolean;
}
