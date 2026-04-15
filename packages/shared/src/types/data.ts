// D&D 2024 Database Types — Simplified Application Format
// These types define our own database schema. Raw 5e.tools data is converted
// to this format by the rules expert. All categorical fields use string literal
// unions so TypeScript validates DB JSON at compile time.
//
// Descriptions use rich text with {category:name|display text} links.
// See .testing/EFFECT_FORMAT_SPEC.md for the full specification.

import type { Entry } from "./entry-types";
import type { EntityEffects, FeatureChoice, Ability, DamageType, Prerequisite } from "./effects";

// Re-export shared enums defined in effects.ts so data consumers can import from here
export type { Ability, DamageType } from "./effects";

// ─── Enumerations ──────────────────────────────────────────

export type SpellSchool =
  | "Abjuration"
  | "Conjuration"
  | "Divination"
  | "Enchantment"
  | "Evocation"
  | "Illusion"
  | "Necromancy"
  | "Transmutation";

export type SpellLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type ClassName =
  | "Barbarian"
  | "Bard"
  | "Cleric"
  | "Druid"
  | "Fighter"
  | "Monk"
  | "Paladin"
  | "Ranger"
  | "Rogue"
  | "Sorcerer"
  | "Warlock"
  | "Wizard";

export type CasterProgression = "full" | "half" | "third" | "pact";

export type FeatCategory = "General" | "Origin" | "Fighting Style" | "Epic Boon";

export type ItemRarity = "common" | "uncommon" | "rare" | "very rare" | "legendary" | "artifact";

export type WeaponCategory = "simple" | "martial";

export type CreatureSize = "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan";

export type LanguageType = "standard" | "rare" | "secret";

// Base item type codes — builder uses these for armor class calculation
export type BaseItemType =
  | "LA"
  | "MA"
  | "HA"
  | "S" // Light/Medium/Heavy Armor, Shield
  | "M"
  | "R" // Melee/Ranged Weapon
  | "A"
  | "AF" // Ammunition, Ammunition (futuristic)
  | "AT"
  | "GS"
  | "INS" // Artisan's Tool, Gaming Set, Instrument
  | "T"
  | "TG" // Tool, Trade Good
  | "OTH"
  | "P"
  | "SC" // Other, Potion, Scroll
  | "WD"
  | "RD"
  | "RG"
  | "WN"; // Wand, Rod, Ring, Wondrous

// ─── Common Base ───────────────────────────────────────────

/** Base shape for all entities that can carry mechanical effects */
export interface DbEntity {
  name: string;
  /** Rich text description with {category:name|display text} links */
  description: string;
  /** Passive effects — always apply while the character has this entity */
  effects?: EntityEffects;
  /**
   * Activation effects — only apply when the feature is actively used (Rage,
   * Wild Shape, Channel Divinity, etc.). The game engine creates a runtime
   * EffectBundle from this payload when the DM activates the feature.
   */
  activation?: EntityEffects;
  /** Player decision points resolved by the builder (permanent) or game engine (runtime) */
  choices?: FeatureChoice[];
}

// ─── Spells ────────────────────────────────────────────────

export interface SpellDb extends DbEntity {
  level: SpellLevel;
  school: SpellSchool;
  /** Pre-formatted: "1 action", "1 bonus action", "1 reaction" */
  castingTime: string;
  /** Pre-formatted: "120 feet", "Self", "Touch", "Self (30-foot cone)" */
  range: string;
  /** Pre-formatted: "V, S, M (a bit of fleece)" */
  components: string;
  /** Pre-formatted: "Concentration, up to 1 minute", "Instantaneous" */
  duration: string;
  ritual: boolean;
  concentration: boolean;
  classes: ClassName[];
  damageType?: DamageType[];
  savingThrow?: Ability[];
  /** Pre-flattened at-higher-levels text */
  higherLevels?: string;
}

// ─── Classes ───────────────────────────────────────────────

export interface ClassMulticlassing {
  /** Minimum ability score requirements to multiclass into this class */
  requirements: Record<string, number>;
  /** Proficiencies gained when multiclassing into this class (not the full set) */
  proficienciesGained?: {
    armor?: string[];
    weapons?: string[];
    tools?: string[];
    skills?: { from: string[]; count: number };
  };
}

export interface ClassDb extends DbEntity {
  hitDiceFaces: number;
  casterProgression?: CasterProgression;
  skillChoices: { from: string[]; count: number };
  /** 20 rows × 9 columns, casters only */
  spellSlotTable?: number[][];
  cantripProgression?: number[];
  /** Fixed spells-known table for known casters (Bard, Sorcerer, Warlock). */
  preparedSpellsProgression?: number[];
  /** Formula for prepared casters (Wizard, Cleric, Druid, Paladin, Ranger). */
  preparedSpellFormula?: { ability: Ability; levelScale: "full" | "half" };
  features: ClassFeatureDb[];
  subclasses: SubclassDb[];
  /** Multiclassing requirements and proficiencies gained (D&D 2024 rules) */
  multiclassing?: ClassMulticlassing;
  spellcastingAbility?: Ability;
  canRitualCast?: boolean;
}

/** Action economy classification for a feature. Undefined = passive. */
export type FeatureActivation = "action" | "bonus" | "reaction";

export interface ClassFeatureDb extends DbEntity {
  level: number;
  className: ClassName;
  activationType?: FeatureActivation;
}

export interface SubclassDb {
  name: string;
  shortName: string;
  className: ClassName;
  description: string;
  casterProgression?: CasterProgression;
  spellcastingAbility?: Ability;
  /** Normalized to an array of {spell, minLevel}. Source JSON may be string[], array of objects, or level-keyed record — all forms are coerced in `normalizeClassData`. */
  additionalSpells?: Array<{ spell: string; minLevel: number }>;
  /** Spell slot table: 20 rows (index 0 = level 1), same format as ClassDb.spellSlotTable */
  spellSlotTable?: number[][];
  features: SubclassFeatureDb[];
}

export interface SubclassFeatureDb extends DbEntity {
  level: number;
  className: ClassName;
  subclassName: string;
  activationType?: FeatureActivation;
}

// ─── Feats ─────────────────────────────────────────────────

export interface FeatDb extends DbEntity {
  category: FeatCategory;
  /**
   * Structured prerequisite for programmatic enforcement.
   * Use `prerequisiteText` for display.
   */
  prerequisite?: Prerequisite;
  /**
   * Human-readable prerequisite string for display: "Level 4+", "Strength 13+".
   */
  prerequisiteText?: string;
  repeatable?: boolean;
  activationType?: FeatureActivation;
}

// ─── Species ───────────────────────────────────────────────

export interface SpeciesDb extends DbEntity {
  size: CreatureSize[];
  /** Base walking speed in feet */
  speed: number;
}

// ─── Backgrounds ───────────────────────────────────────────

export interface BackgroundDb extends DbEntity {
  feat?: string;
  abilityScores: { from: Ability[]; weights: number[] };
}

// ─── Conditions, Diseases, Statuses ────────────────────────

export type ConditionDb = DbEntity;
export type DiseaseDb = DbEntity;
export type StatusDb = DbEntity;

// ─── Magic Items ───────────────────────────────────────────

export interface MagicItemDb extends DbEntity {
  type?: string;
  rarity: ItemRarity;
  attunement?: boolean | string;
  charges?: number;
  recharge?: string;
  attachedSpells?: string[];
}

// ─── Base Items (weapons, armor, gear) ─────────────────────

export interface BaseItemDb {
  name: string;
  description?: string;
  type: BaseItemType;
  ac?: number;
  armor?: boolean;
  weapon?: boolean;
  weaponCategory?: WeaponCategory;
  /** Primary damage dice: "1d8" */
  damage?: string;
  damageType?: DamageType;
  /** Versatile damage dice: "1d10" */
  versatileDamage?: string;
  /** Pre-decoded property names: ["Finesse", "Light"] */
  properties?: string[];
  /** Pre-decoded mastery names: ["Topple"] */
  mastery?: string[];
  range?: string;
  weight?: number;
  /** Imposes stealth disadvantage */
  stealth?: boolean;
  /** Strength requirement: "13" */
  strength?: string;
  /**
   * Structured mechanical effects. Phase 10: weapons carry
   * effects.action (attack outcome). Other base items (armor, gear)
   * carry effects.modifiers / effects.properties where applicable.
   */
  effects?: EntityEffects;
}

// ─── Equipment Packs ────────────────────────────────────

export interface PackDb {
  name: string;
  contents: Array<{ item: string; quantity: number }>;
}

// ─── Optional Features ─────────────────────────────────────

export interface OptionalFeatureDb extends DbEntity {
  /** Feature type codes: "EI", "MV:B", etc. Used by getOptionalFeaturesByType */
  featureType: string[];
  /** Pre-formatted prerequisite string */
  prerequisite?: string;
}

// ─── Monsters (rich stat blocks for AI DM, no effects) ─────

export interface MonsterDb {
  name: string;
  size: CreatureSize[];
  type: string | { type: string; tags?: (string | { tag: string; prefix?: string })[] };
  alignment?: string[];
  ac: (number | { ac: number; from?: string[]; condition?: string })[];
  hp: { average?: number; formula?: string; special?: string };
  speed: Record<string, number | { number: number; condition?: string }> & { hover?: boolean };
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  save?: Record<string, string>;
  skill?: Record<string, string>;
  passive: number;
  resist?: (string | { resist?: string[]; note?: string; cond?: boolean })[];
  immune?: (string | { immune?: string[]; note?: string; cond?: boolean })[];
  vulnerable?: (string | { vulnerable?: string[]; note?: string })[];
  conditionImmune?: (string | { conditionImmune: string[]; note?: string })[];
  senses?: string[];
  languages?: string[];
  cr: string | { cr: string; lair?: string; coven?: string };
  trait?: MonsterActionEntry[];
  action?: MonsterActionEntry[];
  bonus?: MonsterActionEntry[];
  reaction?: MonsterActionEntry[];
  legendary?: MonsterActionEntry[];
  legendaryHeader?: Entry[];
  legendaryActions?: number;
  spellcasting?: MonsterSpellcasting[];
  environment?: string[];
}

export interface MonsterActionEntry {
  name: string;
  entries: Entry[];
  /** Structured outcome — populated by Phase 11 DB migration for supported action types. */
  action?: import("./effects").ActionEffect;
}

export interface MonsterSpellcasting {
  name: string;
  type: string;
  headerEntries?: Entry[];
  footerEntries?: Entry[];
  will?: string[];
  daily?: Record<string, string[]>;
  spells?: Record<string, { spells: string[]; slots?: number; lower?: number }>;
  ability?: string;
  displayAs?: string;
  hidden?: string[];
}

// ─── Languages ─────────────────────────────────────────────

export interface LanguageDb {
  name: string;
  type: LanguageType;
  typicalSpeakers?: string[];
  script?: string;
  description?: string;
}

// ─── Actions ───────────────────────────────────────────────

export interface ActionDb extends DbEntity {
  /** Pre-formatted: "1 action", "1 bonus action" */
  time?: string;
}
