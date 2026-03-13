// D&D 2024 Database — Native 5e.tools Format
// Type-safe exports + lookup helpers + class assembly

import type {
  SpellData,
  MonsterData,
  ClassRaw,
  ClassFeatureRaw,
  SubclassRaw,
  SubclassFeatureRaw,
  ClassAssembled,
  SubclassAssembled,
  FeatData,
  SpeciesData,
  SubraceData,
  BackgroundData,
  ConditionData,
  DiseaseData,
  StatusData,
  BaseItemData,
  ItemPropertyData,
  ItemTypeData,
  ItemMasteryData,
  ItemEntryData,
  MagicItemData,
  ItemGroupData,
  OptionalFeatureData,
  LanguageData,
  LanguageScriptData,
  ActionData,
  ClassResourceTemplate,
} from "./types";

// ─── Raw JSON imports ──────────────────────────────────

import spellsData from "./spells.json";
import bestiaryData from "./bestiary.json";
import classesData from "./classes.json";
import featsData from "./feats.json";
import backgroundsData from "./backgrounds.json";
import speciesData from "./species.json";
import itemsData from "./items.json";
import itemsBaseData from "./items-base.json";
import optionalFeaturesData from "./optional-features.json";
import conditionsDiseasesData from "./conditions-diseases.json";
import languagesData from "./languages.json";
import actionsData from "./actions.json";

// ─── Type assertions for JSON imports ──────────────────

const rawClasses = (classesData as unknown as {
  class: ClassRaw[];
  subclass: SubclassRaw[];
  classFeature: ClassFeatureRaw[];
  subclassFeature: SubclassFeatureRaw[];
});

const rawSpecies = speciesData as unknown as {
  race: SpeciesData[];
  subrace?: SubraceData[];
};

const rawItems = itemsData as unknown as {
  item: MagicItemData[];
  itemGroup?: ItemGroupData[];
};

const rawItemsBase = itemsBaseData as unknown as {
  baseitem: BaseItemData[];
  itemProperty?: ItemPropertyData[];
  itemType?: ItemTypeData[];
  itemMastery?: ItemMasteryData[];
  itemTypeAdditionalEntries?: unknown[];
  itemEntry?: ItemEntryData[];
};

const rawCondsDiseases = conditionsDiseasesData as unknown as {
  condition: ConditionData[];
  disease?: DiseaseData[];
  status?: StatusData[];
};

const rawLanguages = languagesData as unknown as {
  language: LanguageData[];
  languageScript?: LanguageScriptData[];
};

// ─── Class Assembly ────────────────────────────────────
// Resolve the 4 raw arrays into ClassAssembled[]

function assembleClasses(): ClassAssembled[] {
  return rawClasses.class.map((cls) => {
    const resolvedFeatures = rawClasses.classFeature.filter(
      (f) =>
        f.className.toLowerCase() === cls.name.toLowerCase() &&
        f.classSource === cls.source
    );

    const resolvedSubclasses: SubclassAssembled[] = rawClasses.subclass
      .filter(
        (sc) =>
          sc.className.toLowerCase() === cls.name.toLowerCase() &&
          sc.classSource === cls.source
      )
      .map((sc) => ({
        ...sc,
        resolvedFeatures: rawClasses.subclassFeature.filter(
          (f) =>
            f.className.toLowerCase() === sc.className.toLowerCase() &&
            f.classSource === sc.classSource &&
            f.subclassShortName === sc.shortName &&
            f.subclassSource === sc.source
        ),
      }));

    return {
      ...cls,
      resolvedFeatures,
      resolvedSubclasses,
    };
  });
}

// ─── Case-insensitive lookup maps ───────────────────────

function buildMap<T extends { name: string }>(data: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of data) {
    map.set(item.name.toLowerCase(), item);
  }
  return map;
}

// Assembled classes (resolved features + subclasses)
export const classesArray: ClassAssembled[] = assembleClasses();
export const classes = buildMap(classesArray);

export const spellsArray = spellsData as unknown as SpellData[];
export const spells = buildMap(spellsArray);

export const monstersArray = bestiaryData as unknown as MonsterData[];
export const monsters = buildMap(monstersArray);

export const featsArray = featsData as unknown as FeatData[];
export const feats = buildMap(featsArray);

export const speciesArray = rawSpecies.race;
export const species = buildMap(speciesArray);
export const subracesArray = rawSpecies.subrace ?? [];

export const backgroundsArray = backgroundsData as unknown as BackgroundData[];
export const backgrounds = buildMap(backgroundsArray);

// Conditions, Diseases, Statuses
export const conditionsArray = rawCondsDiseases.condition;
export const conditions = buildMap(conditionsArray);
export const diseasesArray = rawCondsDiseases.disease ?? [];
export const diseases = buildMap(diseasesArray);
export const statusesArray = rawCondsDiseases.status ?? [];
export const statuses = buildMap(statusesArray);

// Base items (equipment)
export const baseItemsArray = rawItemsBase.baseitem;
export const baseItems = buildMap(baseItemsArray);
export const itemProperties = rawItemsBase.itemProperty ?? [];
export const itemTypes = rawItemsBase.itemType ?? [];
export const itemMasteries = rawItemsBase.itemMastery ?? [];
export const itemEntries = rawItemsBase.itemEntry ?? [];

// All items (from items.json — includes mundane gear, magic items, etc.)
export const allItemsArray = rawItems.item;
export const allItems = buildMap(allItemsArray);
export const itemGroupsArray = rawItems.itemGroup ?? [];

// Magic items (for backward compat — filters to rarity !== "none")
export const magicItemsArray = allItemsArray.filter(
  (i: { rarity?: string }) => i.rarity && i.rarity !== "none"
);
export const magicItems = buildMap(magicItemsArray);

// Optional features
export const optionalFeaturesArray = optionalFeaturesData as unknown as OptionalFeatureData[];
export const optionalFeatures = buildMap(optionalFeaturesArray);

// Languages
export const languagesArray = rawLanguages.language;
export const languages = buildMap(languagesArray);
export const languageScripts = rawLanguages.languageScript ?? [];

// Actions
export const actionsArray = actionsData as unknown as ActionData[];
export const actions = buildMap(actionsArray);

// ─── Convenience lookup functions ──────────────────────

export function getClass(name: string): ClassAssembled | undefined {
  return classes.get(name.toLowerCase());
}

export function getSpell(name: string): SpellData | undefined {
  return spells.get(name.toLowerCase());
}

export function getMonster(name: string): MonsterData | undefined {
  return monsters.get(name.toLowerCase());
}

export function getFeat(name: string): FeatData | undefined {
  return feats.get(name.toLowerCase());
}

export function getSpecies(name: string): SpeciesData | undefined {
  return species.get(name.toLowerCase());
}

export function getBackground(name: string): BackgroundData | undefined {
  return backgrounds.get(name.toLowerCase());
}

export function getCondition(name: string): ConditionData | undefined {
  return conditions.get(name.toLowerCase());
}

export function getDisease(name: string): DiseaseData | undefined {
  return diseases.get(name.toLowerCase());
}

export function getStatus(name: string): StatusData | undefined {
  return statuses.get(name.toLowerCase());
}

export function getBaseItem(name: string): BaseItemData | undefined {
  return baseItems.get(name.toLowerCase());
}

export function getMagicItem(name: string): MagicItemData | undefined {
  return magicItems.get(name.toLowerCase());
}

export function getItem(name: string): MagicItemData | undefined {
  return allItems.get(name.toLowerCase());
}

export function getOptionalFeature(name: string): OptionalFeatureData | undefined {
  return optionalFeatures.get(name.toLowerCase());
}

export function getLanguage(name: string): LanguageData | undefined {
  return languages.get(name.toLowerCase());
}

export function getAction(name: string): ActionData | undefined {
  return actions.get(name.toLowerCase());
}

// ─── Filtered queries ──────────────────────────────────

export function getSpellsByLevel(level: number): SpellData[] {
  return spellsArray.filter((s) => s.level === level);
}

export function getSpellsByClass(className: string): SpellData[] {
  const lower = className.toLowerCase();
  return spellsArray.filter((s) =>
    s.classes?.fromClassList?.some((c) => c.name.toLowerCase() === lower)
  );
}

export function getClassFeatures(
  className: string,
  upToLevel: number
): ClassFeatureRaw[] {
  const cls = getClass(className);
  if (!cls) return [];
  return cls.resolvedFeatures.filter((f) => f.level <= upToLevel);
}

export function getOptionalFeaturesByType(type: string): OptionalFeatureData[] {
  return optionalFeaturesArray.filter((f) => f.featureType.includes(type));
}

// ─── Class Spell Slot Helpers ──────────────────────────

/** Get the caster level multiplier for a class (for multiclass spell slot computation). */
export function getCasterMultiplier(className: string): number {
  const cls = getClass(className);
  if (!cls) return 0;
  switch (cls.casterProgression) {
    case "full": return 1;
    case "1/2": return 0.5;
    case "1/3": return 1 / 3;
    case "pact": return 0; // Warlock uses pact magic, handled separately
    default: return 0;
  }
}

// Third-Caster Spell Slot Table (Eldritch Knight, Arcane Trickster)
export const THIRD_CASTER_SLOTS: Record<number, number[]> = {
  1: [], 2: [], 3: [2], 4: [3], 5: [3], 6: [3], 7: [4, 2], 8: [4, 2],
  9: [4, 2], 10: [4, 3], 11: [4, 3], 12: [4, 3], 13: [4, 3, 2], 14: [4, 3, 2],
  15: [4, 3, 2], 16: [4, 3, 3], 17: [4, 3, 3], 18: [4, 3, 3], 19: [4, 3, 3, 1],
  20: [4, 3, 3, 1],
};

// ─── Property / Mastery Lookup Maps ────────────────────

const propertyMap = new Map<string, ItemPropertyData>();
for (const p of itemProperties) {
  propertyMap.set(p.abbreviation.toLowerCase(), p);
}

const masteryMap = new Map<string, ItemMasteryData>();
for (const m of itemMasteries) {
  masteryMap.set(m.name.toLowerCase(), m as unknown as ItemMasteryData);
}

export function getItemProperty(abbreviation: string): ItemPropertyData | undefined {
  const code = abbreviation.split("|")[0].toLowerCase();
  return propertyMap.get(code);
}

export function getItemMastery(name: string): ItemMasteryData | undefined {
  const clean = name.split("|")[0].toLowerCase();
  return masteryMap.get(clean) as ItemMasteryData | undefined;
}

// ─── Search helpers ────────────────────────────────────

export function searchSpells(query: string): SpellData[] {
  const lower = query.toLowerCase();
  return spellsArray.filter((s) => s.name.toLowerCase().includes(lower));
}

export function searchMonsters(query: string): MonsterData[] {
  const lower = query.toLowerCase();
  return monstersArray.filter((s) => s.name.toLowerCase().includes(lower));
}

export function searchMagicItems(query: string): MagicItemData[] {
  const lower = query.toLowerCase();
  return magicItemsArray.filter((s) => s.name.toLowerCase().includes(lower));
}

export function searchFeats(query: string): FeatData[] {
  const lower = query.toLowerCase();
  return featsArray.filter((s) => s.name.toLowerCase().includes(lower));
}

export function searchOptionalFeatures(query: string): OptionalFeatureData[] {
  const lower = query.toLowerCase();
  return optionalFeaturesArray.filter((s) => s.name.toLowerCase().includes(lower));
}

// ─── Weapon Property Decoder (kept for backward compat) ──

const PROPERTY_CODES: Record<string, string> = {
  "2H": "Two-Handed",
  A: "Ammunition",
  AF: "Automatic Fire",
  BF: "Burst Fire",
  F: "Finesse",
  H: "Heavy",
  L: "Light",
  LD: "Loading",
  R: "Reach",
  RLD: "Reload",
  T: "Thrown",
  V: "Versatile",
};

/** Decode a weapon property code like "F|XPHB" → "Finesse" */
export function formatWeaponProperty(raw: string | { uid: string; note?: string }): string {
  const str = typeof raw === "string" ? raw : raw.uid;
  const code = str.split("|")[0];
  const label = PROPERTY_CODES[code] ?? code;
  if (typeof raw !== "string" && raw.note) return `${label} (${raw.note})`;
  return label;
}

// ─── Class Resource Templates ──────────────────────────
// Hard-coded per-class resource data (not available in 5e.tools structured format)

export const CLASS_RESOURCES: Record<string, ClassResourceTemplate[]> = {
  barbarian: [
    { name: "Rage", levelAvailable: 1, resetType: "long", uses: 2, usesTable: { 1: 2, 3: 3, 6: 4, 17: 5, 20: 6 } },
  ],
  bard: [
    { name: "Bardic Inspiration", levelAvailable: 1, resetType: "short", uses: { abilityMod: "cha", minimum: 1 } },
  ],
  cleric: [
    { name: "Channel Divinity", levelAvailable: 1, resetType: "short", uses: 1, usesTable: { 1: 1, 6: 2, 18: 3 } },
  ],
  druid: [
    { name: "Wild Shape", levelAvailable: 2, resetType: "short", uses: 2 },
    { name: "Channel Nature", levelAvailable: 1, resetType: "long", uses: 1, usesTable: { 1: 1, 6: 2, 18: 3 } },
  ],
  fighter: [
    { name: "Second Wind", levelAvailable: 1, resetType: "short", uses: 1, usesTable: { 1: 1, 2: 2, 9: 3, 13: 4, 17: 5 } },
    { name: "Action Surge", levelAvailable: 2, resetType: "short", uses: 1, usesTable: { 2: 1, 17: 2 } },
    { name: "Indomitable", levelAvailable: 9, resetType: "long", uses: 1, usesTable: { 9: 1, 13: 2, 17: 3 } },
  ],
  monk: [
    { name: "Focus Points", levelAvailable: 2, resetType: "short", uses: 2, usesTable: { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15, 16: 16, 17: 17, 18: 18, 19: 19, 20: 20 } },
  ],
  paladin: [
    { name: "Lay on Hands", levelAvailable: 1, resetType: "long", uses: 5, usesTable: { 1: 5, 2: 10, 3: 15, 4: 20, 5: 25, 6: 30, 7: 35, 8: 40, 9: 45, 10: 50, 11: 55, 12: 60, 13: 65, 14: 70, 15: 75, 16: 80, 17: 85, 18: 90, 19: 95, 20: 100 } },
    { name: "Channel Divinity", levelAvailable: 3, resetType: "long", uses: 1, usesTable: { 3: 1, 11: 2, 15: 3 } },
  ],
  ranger: [],
  rogue: [],
  sorcerer: [
    { name: "Sorcery Points", levelAvailable: 2, resetType: "long", uses: 2, usesTable: { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15, 16: 16, 17: 17, 18: 18, 19: 19, 20: 20 } },
  ],
  warlock: [],
  wizard: [
    { name: "Arcane Recovery", levelAvailable: 1, resetType: "long", uses: 1 },
  ],
};

export function getClassResources(className: string): ClassResourceTemplate[] {
  return CLASS_RESOURCES[className.toLowerCase()] ?? [];
}

// ─── Re-export types ───────────────────────────────────

export type {
  SpellData,
  SpellRange,
  SpellDuration,
  ScalingLevelDice,
  MonsterData,
  MonsterType,
  MonsterAc,
  MonsterHp,
  MonsterSpeed,
  MonsterSpeedEntry,
  MonsterActionEntry,
  MonsterDamageEntry,
  MonsterConditionEntry,
  MonsterCr,
  MonsterSpellcasting,
  ClassRaw,
  ClassFeatureRaw,
  SubclassRaw,
  SubclassFeatureRaw,
  ClassAssembled,
  SubclassAssembled,
  ClassTableGroup,
  OptionalFeatureProgression,
  AdditionalSpellEntry,
  FeatData,
  FeatPrerequisite,
  FeatAbility,
  SpeciesData,
  SubraceData,
  SpeciesVersion,
  BackgroundData,
  BackgroundAbility,
  ConditionData,
  DiseaseData,
  StatusData,
  BaseItemData,
  ItemPropertyData,
  ItemTypeData,
  ItemMasteryData,
  ItemEntryData,
  MagicItemData,
  ItemGroupData,
  OptionalFeatureData,
  LanguageData,
  LanguageScriptData,
  ActionData,
  ClassResourceTemplate,
} from "./types";

export type { Entry } from "./entry-types";
export type {
  EntryEntries,
  EntryList,
  EntryItem,
  EntryListItem,
  EntryTable,
  EntryTableGroup,
  EntryInset,
  EntryInsetReadaloud,
  EntryQuote,
  EntryDice,
  EntryBonus,
  EntryBonusSpeed,
  EntryAbilityDc,
  EntryAbilityAttackMod,
  EntryAbilityGeneric,
  EntryCell,
  EntryInline,
  EntryInlineBlock,
  EntrySpellcasting,
  EntryLink,
  EntryOptions,
  EntrySection,
  EntryHr,
  EntryImage,
  EntryFlowchart,
  EntryFlowBlock,
  EntryOptionalFeature,
  EntryClassFeature,
  EntrySubclassFeature,
} from "./entry-types";
