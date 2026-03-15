// D&D 2024 Database Types — Native 5e.tools Format
// These types match the 5e.tools JSON structure directly.

import type { Entry } from "./entry-types";

// ─── Spells ─────────────────────────────────────────────

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
  distance?: { type: string; amount?: number }; // type: "feet" | "miles" | "self" | "touch" | "sight" | "unlimited"
}

export interface SpellDuration {
  type: string; // "instant" | "timed" | "permanent" | "special"
  duration?: { type: string; amount: number }; // type: "round" | "minute" | "hour" | "day" | "year"
  concentration?: boolean;
  ends?: string[];
}

export interface ScalingLevelDice {
  label?: string;
  scaling: Record<string, string>;
}

// ─── Monsters ───────────────────────────────────────────

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
  save?: Record<string, string>; // e.g. { "dex": "+5", "wis": "+3" }
  skill?: Record<string, string>; // e.g. { "perception": "+7" }
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
  // Copy-paste source tracking
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

export interface MonsterActionEntry {
  name: string;
  entries: Entry[];
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

// ─── Classes ────────────────────────────────────────────

export interface ClassRaw {
  name: string;
  source: string;
  page?: number;
  edition?: string;
  hd: { number: number; faces: number };
  proficiency: string[]; // Saving throw proficiencies (ability codes)
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
  casterProgression?: string; // "full" | "1/2" | "1/3" | "pact"
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
  progression: Record<string, number>; // level → count
}

export interface AdditionalSpellEntry {
  name?: string;
  ability?: string | { choose: string[] };
  known?: Record<string, unknown>; // Values can be string[], or objects like { "_": [{ "choose": "..." }] }
  prepared?: Record<string, string[]>;
  innate?: Record<string, unknown>; // Level-keyed innate spells: { "3": { "daily": { "1": ["spell"] } } }
}

// ─── Class Features ─────────────────────────────────────

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

// ─── Subclasses ─────────────────────────────────────────

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

// ─── Assembled (resolved at import time) ────────────────

export interface ClassAssembled extends ClassRaw {
  resolvedFeatures: ClassFeatureRaw[];
  resolvedSubclasses: SubclassAssembled[];
}

export interface SubclassAssembled extends SubclassRaw {
  resolvedFeatures: SubclassFeatureRaw[];
}

// ─── Feats ──────────────────────────────────────────────

export interface FeatData {
  name: string;
  source: string;
  page?: number;
  category: string; // G=General, O=Origin, FS=Fighting Style, EB=Epic Boon
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

// ─── Species ────────────────────────────────────────────

export interface SpeciesData {
  name: string;
  source: string;
  page?: number;
  edition?: string;
  size: string[]; // Size codes: S, M, etc.
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

// ─── Backgrounds ────────────────────────────────────────

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

// ─── Conditions & Diseases ──────────────────────────────

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

// ─── Items (Base Equipment) ─────────────────────────────

export interface BaseItemData {
  name: string;
  source: string;
  page?: number;
  type?: string; // Item type code: M=Melee Weapon, R=Ranged Weapon, LA=Light Armor, etc.
  rarity: string;
  weight?: number;
  value?: number; // In copper pieces
  weaponCategory?: string; // "simple" | "martial"
  property?: string[]; // Property codes: "V|XPHB", "F|XPHB", etc.
  mastery?: string[]; // Mastery codes: "Topple|XPHB", etc.
  dmg1?: string; // Primary damage dice
  dmg2?: string; // Versatile damage dice
  dmgType?: string; // Damage type code: S, B, P, etc.
  ac?: number;
  strength?: string; // Strength requirement (e.g., "13")
  stealth?: boolean; // Stealth disadvantage
  weapon?: boolean;
  armor?: boolean;
  range?: string; // e.g., "80/320"
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

// ─── Items (Magic) ──────────────────────────────────────

export interface MagicItemData {
  name: string;
  source: string;
  page?: number;
  type?: string; // Item type code
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

// ─── Optional Features ──────────────────────────────────

export interface OptionalFeatureData {
  name: string;
  source: string;
  page?: number;
  featureType: string[]; // EI=Eldritch Invocation, MV:B=Battle Master Maneuver, etc.
  prerequisite?: FeatPrerequisite[];
  consumes?: { name: string; amount?: number };
  entries: Entry[];
  additionalSpells?: AdditionalSpellEntry[];
  skillProficiencies?: Record<string, boolean>[];
  srd52?: boolean;
  basicRules2024?: boolean;
}

// ─── Languages ──────────────────────────────────────────

export interface LanguageData {
  name: string;
  source: string;
  page?: number;
  type: string; // "standard" | "rare" | "secret"
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

// ─── Actions ────────────────────────────────────────────

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

// ─── Legacy Equipment Types (kept for character builder) ──

export interface ClassResourceTemplate {
  name: string;
  levelAvailable: number;
  resetType: "short" | "long";
  uses: number | { abilityMod: string; minimum?: number };
  usesTable?: Record<number, number>;
}
