// D&D 2024 Database Types — Simplified Application Format
// These types define our own database schema. Raw 5e.tools data is converted
// to this format by the rules expert. All categorical fields use string literal
// unions so TypeScript validates DB JSON at compile time.
//
// Descriptions use rich text with {category:name|display text} links.
// See .testing/EFFECT_FORMAT_SPEC.md for the full specification.

import type { Entry } from "./entry-types";
import type { EntityEffects, FeatureChoice, Ability, DamageType } from "./effects";

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

export interface ClassDb extends DbEntity {
  hitDiceFaces: number;
  casterProgression?: CasterProgression;
  savingThrows: Ability[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  skillChoices: { from: string[]; count: number };
  /** 20 rows × 9 columns, casters only */
  spellSlotTable?: number[][];
  cantripProgression?: number[];
  preparedSpellsProgression?: number[];
  features: ClassFeatureDb[];
  subclasses: SubclassDb[];
}

export interface ClassFeatureDb extends DbEntity {
  level: number;
  className: ClassName;
}

export interface SubclassDb {
  name: string;
  shortName: string;
  className: ClassName;
  description: string;
  casterProgression?: CasterProgression;
  additionalSpells?: string[];
  features: SubclassFeatureDb[];
}

export interface SubclassFeatureDb extends DbEntity {
  level: number;
  className: ClassName;
  subclassName: string;
}

// ─── Feats ─────────────────────────────────────────────────

export interface FeatDb extends DbEntity {
  category: FeatCategory;
  /** Pre-formatted: "Level 4+", "Strength 13+" */
  prerequisite?: string;
  repeatable?: boolean;
}

// ─── Species ───────────────────────────────────────────────

export interface SpeciesDb extends DbEntity {
  size: CreatureSize[];
  /** Base walking speed in feet */
  speed: number;
  /** Darkvision range in feet */
  darkvision?: number;
}

// ─── Backgrounds ───────────────────────────────────────────

export interface BackgroundDb extends DbEntity {
  skills: string[];
  tools: string[];
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

// ─── Base Items (armor/weapon reference, no effects) ───────

export interface BaseItemDb {
  name: string;
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

// ═══════════════════════════════════════════════════════════
// Legacy 5e.tools-native types — used by data/index.ts,
// utils/5etools.ts, builders/character-builder.ts for raw JSON
// files not yet migrated to *Db format.
// TODO: Remove during Phase C consumer migration.
// ═══════════════════════════════════════════════════════════

// ─── Spells (legacy) ───────────────────────────────────────

export interface SpellData {
  name: string;
  source: string;
  page?: number;
  level: number;
  school: string; // V=Evocation, A=Abjuration, C=Conjuration, D=Divination, E=Enchantment, I=Illusion, N=Necromancy, T=Transmutation
  time: { number: number; unit: string; condition?: string }[];
  range: SpellRange;
  components: {
    v?: boolean;
    s?: boolean;
    m?: string | { text: string; cost?: number; consume?: boolean | string };
  };
  duration: SpellDuration[];
  entries: Entry[];
  entriesHigherLevel?: Entry[];
  scalingLevelDice?: ScalingLevelDice | ScalingLevelDice[];
  damageInflict?: string[];
  savingThrow?: string[];
  conditionInflict?: string[];
  spellAttack?: string[];
  meta?: { ritual?: boolean };
  miscTags?: string[];
  areaTags?: string[];
  classes?: { fromClassList?: { name: string; source: string }[] };
  srd52?: boolean;
  basicRules2024?: boolean;
}

export interface SpellRange {
  type: string; // "point" | "self" | "touch" | "sight" | "unlimited" | "special"
  distance?: { type: string; amount?: number };
}

export interface SpellDuration {
  type: string; // "instant" | "timed" | "permanent" | "special"
  duration?: { type: string; amount: number };
  concentration?: boolean;
  ends?: string[];
}

export interface ScalingLevelDice {
  label?: string;
  scaling: Record<string, string>;
}

// ─── Monsters (legacy) — different shape from MonsterDb ────

export interface MonsterData {
  name: string;
  source: string;
  page?: number;
  size: string[]; // Size codes: T, S, M, L, H, G
  type: string | MonsterType;
  alignment?: string[];
  ac: (number | MonsterAc)[];
  hp: MonsterHp;
  speed: MonsterSpeed;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  save?: Record<string, string>;
  skill?: Record<string, string>;
  passive: number;
  resist?: (string | MonsterDamageEntry)[];
  immune?: (string | MonsterDamageEntry)[];
  vulnerable?: (string | MonsterDamageEntry)[];
  conditionImmune?: (string | MonsterConditionEntry)[];
  senses?: string[];
  languages?: string[];
  cr: string | MonsterCr;
  trait?: MonsterActionEntry[];
  action?: MonsterActionEntry[];
  bonus?: MonsterActionEntry[];
  reaction?: MonsterActionEntry[];
  legendary?: MonsterActionEntry[];
  legendaryGroup?: { name: string; source: string };
  legendaryActions?: number;
  legendaryHeader?: Entry[];
  mythic?: MonsterActionEntry[];
  mythicHeader?: Entry[];
  lair?: MonsterActionEntry[];
  spellcasting?: MonsterSpellcasting[];
  environment?: string[];
  treasure?: string[];
  tokenUrl?: string;
  hasToken?: boolean;
  hasFluff?: boolean;
  hasFluffImages?: boolean;
  srd52?: boolean;
  basicRules2024?: boolean;
  _copy?: { name: string; source: string; _mod?: unknown };
}

export interface MonsterType {
  type: string;
  tags?: (string | { tag: string; prefix?: string })[];
  swarmSize?: string;
}

export interface MonsterAc {
  ac: number;
  from?: string[];
  condition?: string;
  braces?: boolean;
}

export interface MonsterHp {
  average?: number;
  formula?: string;
  special?: string;
}

export interface MonsterSpeed {
  walk?: number | MonsterSpeedEntry;
  fly?: number | MonsterSpeedEntry;
  swim?: number | MonsterSpeedEntry;
  climb?: number | MonsterSpeedEntry;
  burrow?: number | MonsterSpeedEntry;
  hover?: boolean;
  canHover?: boolean;
}

export interface MonsterSpeedEntry {
  number: number;
  condition?: string;
}

export interface MonsterDamageEntry {
  resist?: string[];
  immune?: string[];
  vulnerable?: string[];
  note?: string;
  preNote?: string;
  special?: string;
  cond?: boolean;
}

export interface MonsterConditionEntry {
  conditionImmune: string[];
  preNote?: string;
  note?: string;
}

export interface MonsterCr {
  cr: string;
  lair?: string;
  coven?: string;
}

// ─── Classes (legacy) ──────────────────────────────────────

export interface ClassRaw {
  name: string;
  source: string;
  page?: number;
  edition?: string;
  hd: { number: number; faces: number };
  proficiency: string[];
  primaryAbility: Record<string, boolean>[];
  startingProficiencies: {
    armor?: (string | { proficiency: string; full?: boolean })[];
    weapons?: (string | { proficiency: string; optional?: boolean })[];
    tools?: (string | { anyOf?: number })[];
    skills?: { choose: { from: string[]; count: number } }[];
  };
  startingEquipment?: {
    additionalFromBackground?: boolean;
    defaultData?: { A?: unknown[]; B?: unknown[] }[];
    default?: string[];
    goldAlternative?: string;
  };
  multiclassing?: {
    requirements?: Record<string, number | Record<string, number>>;
    proficienciesGained?: {
      armor?: string[];
      weapons?: string[];
      tools?: string[];
      skills?: { choose: { from: string[]; count: number } };
    };
  };
  classTableGroups?: ClassTableGroup[];
  classFeatures: (string | { classFeature: string; gainSubclassFeature?: boolean })[];
  casterProgression?: string;
  preparedSpellsProgression?: number[];
  cantripProgression?: number[];
  spellsKnownProgression?: number[];
  spellsKnownProgressionFixed?: Record<string, number>[];
  additionalSpells?: AdditionalSpellEntry[];
  optionalfeatureProgression?: OptionalFeatureProgression[];
  featProgression?: { name: string; category: string[]; progression: Record<string, number> }[];
  subclassTitle?: string;
  fluff?: unknown;
}

export interface ClassTableGroup {
  title?: string;
  colLabels: string[];
  rows?: (string | number | Entry)[][];
  rowsSpellProgression?: number[][];
  subclasses?: { name: string; source: string }[];
}

export interface OptionalFeatureProgression {
  name: string;
  featureType: string[];
  progression: Record<string, number>;
}

export interface AdditionalSpellEntry {
  name?: string;
  ability?: string | { choose: string[] };
  known?: Record<string, unknown>;
  prepared?: Record<string, string[]>;
  innate?: Record<string, unknown>;
}

export interface ClassFeatureRaw {
  name: string;
  source: string;
  page?: number;
  className: string;
  classSource: string;
  level: number;
  entries: Entry[];
  isClassFeatureVariant?: boolean;
  optionalfeatureProgression?: OptionalFeatureProgression[];
  consumes?: { name: string; amount?: number };
  header?: number;
}

export interface SubclassRaw {
  name: string;
  source: string;
  page?: number;
  className: string;
  classSource: string;
  shortName: string;
  subclassFeatures: string[];
  additionalSpells?: AdditionalSpellEntry[];
  spellcastingAbility?: string;
  casterProgression?: string;
  subclassTableGroups?: ClassTableGroup[];
  edition?: string;
}

export interface SubclassFeatureRaw {
  name: string;
  source: string;
  page?: number;
  className: string;
  classSource: string;
  subclassShortName: string;
  subclassSource: string;
  level: number;
  entries: Entry[];
  isClassFeatureVariant?: boolean;
  header?: number;
  consumes?: { name: string; amount?: number };
}

export interface ClassAssembled extends ClassRaw {
  resolvedFeatures: ClassFeatureRaw[];
  resolvedSubclasses: SubclassAssembled[];
}

export interface SubclassAssembled extends SubclassRaw {
  resolvedFeatures: SubclassFeatureRaw[];
}

// ─── Feats (legacy) ────────────────────────────────────────

export interface FeatData {
  name: string;
  source: string;
  page?: number;
  category: string;
  prerequisite?: FeatPrerequisite[];
  repeatable?: boolean;
  repeatableHidden?: boolean;
  ability?: FeatAbility[];
  entries: Entry[];
  additionalSpells?: AdditionalSpellEntry[];
  skillProficiencies?: Record<string, boolean>[];
  toolProficiencies?: Record<string, boolean>[];
  expertise?: Record<string, boolean>[];
  senses?: Record<string, number>;
  resist?: string[];
  speed?: number | Record<string, number>;
  weaponProficiencies?: Record<string, boolean>[];
  armorProficiencies?: Record<string, boolean>[];
  languageProficiencies?: Record<string, boolean>[];
  savingThrowProficiencies?: Record<string, boolean>[];
  srd52?: boolean;
  basicRules2024?: boolean;
}

export interface FeatPrerequisite {
  level?: number | { level: number; class?: { name: string } };
  ability?: Record<string, number>[];
  spellcasting?: boolean;
  pact?: string;
  feature?: string[];
  feat?: string[];
  other?: string;
  otherSummary?: { entry: string; entrySummary?: string };
}

export interface FeatAbility {
  choose?: {
    from: string[];
    count?: number;
    amount?: number;
  };
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
}

// ─── Species (legacy) ──────────────────────────────────────

export interface SpeciesData {
  name: string;
  source: string;
  page?: number;
  edition?: string;
  size: string[];
  speed: number | Record<string, number>;
  darkvision?: number;
  creatureTypes?: string[];
  resist?: (string | { choose: { from: string[]; count?: number } })[];
  entries: Entry[];
  additionalSpells?: AdditionalSpellEntry[];
  languageProficiencies?: Record<string, boolean>[];
  skillProficiencies?: Record<string, boolean>[];
  feats?: Record<string, boolean>[];
  traitTags?: string[];
  _versions?: SpeciesVersion[];
  soundClip?: { type: string; path: string };
  hasFluff?: boolean;
  hasFluffImages?: boolean;
  srd52?: boolean;
  basicRules2024?: boolean;
}

export interface SubraceData {
  name: string;
  source: string;
  raceName: string;
  raceSource: string;
  page?: number;
  entries?: Entry[];
  additionalSpells?: AdditionalSpellEntry[];
  resist?: string[];
  darkvision?: number;
  overwrite?: Record<string, unknown>;
  traitTags?: string[];
  hasFluff?: boolean;
}

export interface SpeciesVersion {
  name?: string;
  source?: string;
  _mod?: unknown;
  _abstract?: { name: string; source: string; _mod: unknown };
  _implementations?: unknown[];
  additionalSpells?: AdditionalSpellEntry[];
}

// ─── Backgrounds (legacy) ──────────────────────────────────

export interface BackgroundData {
  name: string;
  source: string;
  page?: number;
  edition?: string;
  ability?: BackgroundAbility[];
  feats?: Record<string, boolean>[];
  skillProficiencies?: Record<string, boolean>[];
  toolProficiencies?: Record<string, boolean>[];
  startingEquipment?: { A?: unknown[]; B?: unknown[] }[];
  entries?: Entry[];
  hasFluff?: boolean;
  srd52?: boolean;
  basicRules2024?: boolean;
}

export interface BackgroundAbility {
  choose?: {
    weighted?: {
      from: string[];
      weights: number[];
    };
    from?: string[];
    count?: number;
    amount?: number;
  };
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
}

// ─── Conditions & Diseases (legacy) ────────────────────────

export interface ConditionData {
  name: string;
  source: string;
  page?: number;
  entries: Entry[];
  srd52?: boolean;
  basicRules2024?: boolean;
}

export interface DiseaseData {
  name: string;
  source: string;
  page?: number;
  entries: Entry[];
}

export interface StatusData {
  name: string;
  source?: string;
  page?: number;
  entries: Entry[];
  srd52?: boolean;
  basicRules2024?: boolean;
}

// ─── Items — Base Equipment (legacy) ───────────────────────

export interface BaseItemData {
  name: string;
  source: string;
  page?: number;
  type?: string;
  rarity: string;
  weight?: number;
  value?: number;
  weaponCategory?: string;
  property?: string[];
  mastery?: string[];
  dmg1?: string;
  dmg2?: string;
  dmgType?: string;
  ac?: number;
  strength?: string;
  stealth?: boolean;
  weapon?: boolean;
  armor?: boolean;
  range?: string;
  reload?: number;
  firearm?: boolean;
  entries?: Entry[];
  packContents?: { item: string; quantity?: number }[];
  containerCapacity?: unknown;
  scfType?: string;
  age?: string;
  hasFluff?: boolean;
  hasFluffImages?: boolean;
  srd52?: boolean;
  basicRules2024?: boolean;
}

export interface ItemPropertyData {
  abbreviation: string;
  source?: string;
  page?: number;
  name?: string;
  entries?: Entry[];
  template?: Entry[];
}

export interface ItemTypeData {
  abbreviation: string;
  source?: string;
  name?: string;
  entries?: Entry[];
}

export interface ItemMasteryData {
  name: string;
  source: string;
  page?: number;
  entries: Entry[];
  srd52?: boolean;
  basicRules2024?: boolean;
}

export interface ItemEntryData {
  type?: string;
  source?: string;
  entriesTemplate?: Entry[];
}

// ─── Items — Magic (legacy) ─────────────────────────────────

export interface MagicItemData {
  name: string;
  source: string;
  page?: number;
  type?: string;
  rarity: string;
  reqAttune?: boolean | string;
  reqAttuneTags?: { class?: string; background?: string }[];
  wondrous?: boolean;
  weight?: number;
  entries: Entry[];
  baseItem?: string;
  bonusWeapon?: string;
  bonusWeaponAttack?: string;
  bonusWeaponDamage?: string;
  bonusAc?: string;
  bonusSpellAttack?: string;
  bonusSpellSaveDc?: string;
  bonusSavingThrow?: string;
  dmg1?: string;
  dmgType?: string;
  weaponCategory?: string;
  property?: string[];
  focus?: string[] | boolean;
  tier?: string;
  value?: number;
  charges?: number;
  recharge?: string;
  rechargeAmount?: string | { formula: string };
  attachedSpells?: string[];
  lootTables?: string[];
  hasFluff?: boolean;
  hasFluffImages?: boolean;
  srd52?: boolean;
  basicRules2024?: boolean;
}

export interface ItemGroupData {
  name: string;
  source: string;
  page?: number;
  items: string[];
  rarity?: string;
  type?: string;
  entries?: Entry[];
}

// ─── Optional Features (legacy) ────────────────────────────

export interface OptionalFeatureData {
  name: string;
  source: string;
  page?: number;
  featureType: string[];
  prerequisite?: FeatPrerequisite[];
  consumes?: { name: string; amount?: number };
  entries: Entry[];
  additionalSpells?: AdditionalSpellEntry[];
  skillProficiencies?: Record<string, boolean>[];
  srd52?: boolean;
  basicRules2024?: boolean;
}

// ─── Languages (legacy) ────────────────────────────────────

export interface LanguageData {
  name: string;
  source: string;
  page?: number;
  type: string;
  typicalSpeakers?: string[];
  script?: string;
  origin?: string;
  dialects?: string[];
  entries?: Entry[];
  srd52?: boolean;
  basicRules2024?: boolean;
}

export interface LanguageScriptData {
  name: string;
  fonts?: string[];
}

// ─── Actions (legacy) ──────────────────────────────────────

export interface ActionData {
  name: string;
  source: string;
  page?: number;
  time?: { number: number; unit: string }[];
  entries: Entry[];
  seeAlsoAction?: string[];
  srd52?: boolean;
  basicRules2024?: boolean;
}

// ─── Class Resources (legacy) ──────────────────────────────

export interface ClassResourceTemplate {
  name: string;
  levelAvailable: number;
  resetType: "short" | "long";
  uses: number | { abilityMod: string; minimum?: number };
  usesTable?: Record<number, number>;
}
