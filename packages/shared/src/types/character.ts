// === Character Data Types ===
// Structured to separate static (imported) data from dynamic (gameplay) data.

import type { ConditionEntry } from "./game-state";
import type { EffectBundle } from "./effects";
import type { BuilderState } from "./builder";

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

export interface CharacterSpell {
  name: string;
  level: number; // 0 = cantrip
  prepared: boolean;
  alwaysPrepared: boolean; // from class/subclass features (domain spells, etc.)
  spellSource: "class" | "race" | "feat" | "item" | "background";
  knownByClass: boolean; // in spellbook/known list (e.g. wizard spells in book)
  sourceClass?: string; // which class this spell comes from (e.g. "Paladin", "Warlock")
  school?: string; // "Evocation", "Abjuration", etc.
  castingTime?: string; // "1 action", "1 bonus action", etc.
  range?: string; // "120 feet", "Self", "Touch"
  components?: string; // "V, S, M (a pinch of sulfur)"
  duration?: string; // "Instantaneous", "Concentration, up to 1 minute"
  description?: string; // Full text description (HTML stripped)
  ritual?: boolean;
  concentration?: boolean;
}

export interface SpellSlotLevel {
  level: number; // 1-9
  total: number;
  used: number;
}

export interface InventoryItem {
  name: string;
  equipped: boolean;
  quantity: number;
  type?: string; // "Weapon", "Armor", "Shield", "Gear", etc.
  armorClass?: number; // for armor/shields
  description?: string; // Full text description (HTML stripped)
  damage?: string; // "1d8" or "2d6"
  damageType?: string; // "slashing", "fire", etc.
  range?: string; // "5 ft." or "20/60 ft." for weapons
  attackBonus?: number; // computed: proficiency + ability mod
  properties?: string[]; // ["Versatile", "Light", "Finesse"]
  weight?: number;
  rarity?: string; // "Common", "Uncommon", "Rare", etc.
  attunement?: boolean;
  isAttuned?: boolean;
  isMagicItem?: boolean;
  mastery?: { name: string; description: string };
  fromPack?: string;
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

export interface CharacterFeature {
  name: string;
  description: string;
  source: "class" | "race" | "feat" | "background";
  sourceLabel: string; // "Wizard", "Half-Orc", "War Caster"
  requiredLevel?: number; // class features only
  activationType?: string; // "1 action", "1 bonus action", "1 reaction", etc.
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

/**
 * Static data from the character builder.
 * Only changes when the character is re-imported.
 */
export interface CharacterStaticData {
  name: string;
  species?: string; // species/race name (2024 terminology, optional for backward compat)
  race: string; // primary species/race field
  classes: CharacterClass[];
  abilities: AbilityScores;
  maxHP: number;
  armorClass: number;
  proficiencyBonus: number;
  speed: number;
  features: CharacterFeature[];
  classResources?: ClassResource[];
  proficiencies: ProficiencyGroup;
  skills: SkillProficiency[];
  savingThrows: SavingThrowProficiency[];
  senses: string[]; // "Darkvision 60 ft.", "Passive Perception 14"
  languages: string[]; // "Common", "Elvish"
  spells: CharacterSpell[];
  spellcasting?: Record<
    string,
    {
      ability: keyof AbilityScores;
      dc: number;
      attackBonus: number;
    }
  >;
  advantages: AdvantageEntry[];
  combatBonuses?: CombatBonus[];
  traits: CharacterTraits;
  appearance?: CharacterAppearance;
  backstory?: string;
  alignment?: string;
  importedAt: number; // timestamp
  source?: "builder"; // import source
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
  inventory: InventoryItem[];
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
