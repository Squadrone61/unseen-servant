// === Character Data Types ===
// Structured to separate static (imported) data from dynamic (gameplay) data.

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
}

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
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

export interface ClassResource {
  name: string;
  maxUses: number;
  resetType: "short" | "long";
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
  classResources: ClassResource[];
  proficiencies: ProficiencyGroup;
  skills: SkillProficiency[];
  savingThrows: SavingThrowProficiency[];
  senses: string[]; // "Darkvision 60 ft.", "Passive Perception 14"
  languages: string[]; // "Common", "Elvish"
  spells: CharacterSpell[];
  spellcastingAbility?: keyof AbilityScores;
  spellSaveDC?: number;
  spellAttackBonus?: number;
  advantages: AdvantageEntry[];
  traits: CharacterTraits;
  appearance?: CharacterAppearance;
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
  pactMagicSlots: SpellSlotLevel[]; // Warlock pact magic (tracked separately, recharges on short rest)
  resourcesUsed: Record<string, number>; // class resource usage keyed by name
  conditions: string[]; // "poisoned", "stunned", etc.
  deathSaves: DeathSaves;
  inventory: InventoryItem[];
  currency: Currency;
  xp: number;
  heroicInspiration: boolean;
}

/**
 * Complete character data — static + dynamic.
 */
export interface CharacterData {
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
