// D&D 2024 Database — Simplified Application Format
// Type-safe exports + lookup helpers

import type {
  SpellDb,
  MonsterDb,
  ClassDb,
  ClassFeatureDb,
  FeatDb,
  SpeciesDb,
  BackgroundDb,
  ConditionDb,
  DiseaseDb,
  StatusDb,
  BaseItemDb,
  MagicItemDb,
  OptionalFeatureDb,
  LanguageDb,
  ActionDb,
  PackDb,
  FeatureActivation,
} from "../types/data";
import type { CharacterFeatureRef } from "../types/character";

// ─── Raw JSON imports ──────────────────────────────────

import spellsData from "./spells.json";
import bestiaryData from "./bestiary.json";
import featsData from "./feats.json";
import backgroundsData from "./backgrounds.json";
import speciesData from "./species.json";
import weaponsData from "./items/weapons.json";
import armorData from "./items/armor.json";
import toolsData from "./items/tools.json";
import gearData from "./items/gear.json";
import magicItemsData from "./items/magic.json";
import optionalFeaturesData from "./optional-features.json";
import conditionsData from "./conditions.json";
import diseasesData from "./diseases.json";
import statusesData from "./statuses.json";
import languagesData from "./languages.json";
import actionsData from "./actions.json";
import masteriesData from "./weapon-masteries.json";
import packsData from "./items/packs.json";

// Individual class files (pre-assembled ClassDb format)
import barbarianData from "./classes/barbarian.json";
import bardData from "./classes/bard.json";
import clericData from "./classes/cleric.json";
import druidData from "./classes/druid.json";
import fighterData from "./classes/fighter.json";
import monkData from "./classes/monk.json";
import paladinData from "./classes/paladin.json";
import rangerData from "./classes/ranger.json";
import rogueData from "./classes/rogue.json";
import sorcererData from "./classes/sorcerer.json";
import warlockData from "./classes/warlock.json";
import wizardData from "./classes/wizard.json";

// ─── Type assertions for JSON imports ──────────────────

/**
 * Normalize additionalSpells into `Array<{ spell, minLevel }>`. Source JSON may be:
 *   - `string[]`                                          (e.g. barbarian: always available)
 *   - `Array<{ spell, minLevel?, ... }>`                  (e.g. ranger, cleric)
 *   - `Record<string, string[]>` keyed by class level     (e.g. sorcerer, warlock)
 */
function normalizeClassData(raw: unknown): ClassDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cls = raw as any;
  for (const sub of cls.subclasses ?? []) {
    const src = sub.additionalSpells;
    if (!src) continue;
    const out: Array<{ spell: string; minLevel: number }> = [];
    if (Array.isArray(src)) {
      for (const entry of src) {
        if (typeof entry === "string") {
          out.push({ spell: entry, minLevel: 1 });
        } else {
          const e = entry as { spell: string; minLevel?: number };
          out.push({ spell: e.spell, minLevel: e.minLevel ?? 1 });
        }
      }
    } else if (typeof src === "object") {
      for (const [levelKey, spellNames] of Object.entries(src)) {
        const minLevel = parseInt(levelKey, 10) || 1;
        for (const name of spellNames as string[]) {
          out.push({ spell: name, minLevel });
        }
      }
    }
    sub.additionalSpells = out;
  }
  return cls as ClassDb;
}

const classesArray: ClassDb[] = [
  barbarianData,
  bardData,
  clericData,
  druidData,
  fighterData,
  monkData,
  paladinData,
  rangerData,
  rogueData,
  sorcererData,
  warlockData,
  wizardData,
].map((d) => normalizeClassData(d));

// ─── Case-insensitive lookup maps ───────────────────────

function buildMap<T extends { name: string }>(data: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of data) {
    map.set(item.name.toLowerCase(), item);
  }
  return map;
}

// ─── Exported arrays + maps ────────────────────────────

export { classesArray };
export const classes = buildMap(classesArray);

export const spellsArray = spellsData as unknown as SpellDb[];
export const spells = buildMap(spellsArray);

export const monstersArray = bestiaryData as unknown as MonsterDb[];
export const monsters = buildMap(monstersArray);

export const featsArray = featsData as unknown as FeatDb[];
export const feats = buildMap(featsArray);

export const speciesArray = speciesData as unknown as SpeciesDb[];
export const species = buildMap(speciesArray);

export const backgroundsArray = backgroundsData as unknown as BackgroundDb[];
export const backgrounds = buildMap(backgroundsArray);

// Conditions, Diseases, Statuses
export const conditionsArray = conditionsData as unknown as ConditionDb[];
export const conditions = buildMap(conditionsArray);
export const diseasesArray = diseasesData as unknown as DiseaseDb[];
export const diseases = buildMap(diseasesArray);
export const statusesArray = statusesData as unknown as StatusDb[];
export const statuses = buildMap(statusesArray);

// Base items (equipment) — split by category
export const weaponsArray = weaponsData as unknown as BaseItemDb[];
export const armorArray = armorData as unknown as BaseItemDb[];
export const toolsArray = toolsData as unknown as BaseItemDb[];
export const gearArray = gearData as unknown as BaseItemDb[];
export const baseItemsArray: BaseItemDb[] = [
  ...weaponsArray,
  ...armorArray,
  ...toolsArray,
  ...gearArray,
];
export const baseItems = buildMap(baseItemsArray);

// Magic items
export const magicItemsArray = magicItemsData as unknown as MagicItemDb[];
export const magicItems = buildMap(magicItemsArray);

// All items (base + magic combined)
export const allItemsArray: (BaseItemDb & MagicItemDb)[] = [
  ...baseItemsArray,
  ...magicItemsArray,
] as (BaseItemDb & MagicItemDb)[];
export const allItems = buildMap(allItemsArray);

// Optional features
export const optionalFeaturesArray = optionalFeaturesData as unknown as OptionalFeatureDb[];
export const optionalFeatures = buildMap(optionalFeaturesArray);

// Languages — flat array in new format
export const languagesArray = languagesData as unknown as LanguageDb[];
export const languages = buildMap(languagesArray);

// Actions
export const actionsArray = actionsData as unknown as ActionDb[];
export const actions = buildMap(actionsArray);

// Weapon Masteries
export interface WeaponMastery {
  name: string;
  description: string;
}
export const weaponMasteriesArray = masteriesData as unknown as WeaponMastery[];
export const weaponMasteries = buildMap(weaponMasteriesArray);
export function getWeaponMastery(name: string): WeaponMastery | undefined {
  return weaponMasteries.get(name.toLowerCase());
}

// Equipment Packs
export const packsArray = packsData as unknown as PackDb[];
export const packs = buildMap(packsArray);
export function getPack(name: string): PackDb | undefined {
  return packs.get(name.toLowerCase());
}

// ─── Convenience lookup functions ──────────────────────

export function getClass(name: string): ClassDb | undefined {
  return classes.get(name.toLowerCase());
}

export function getSpell(name: string): SpellDb | undefined {
  return spells.get(name.toLowerCase());
}

export function getMonster(name: string): MonsterDb | undefined {
  return monsters.get(name.toLowerCase());
}

export function getFeat(name: string): FeatDb | undefined {
  return feats.get(name.toLowerCase());
}

export function getSpecies(name: string): SpeciesDb | undefined {
  return species.get(name.toLowerCase());
}

export function getBackground(name: string): BackgroundDb | undefined {
  return backgrounds.get(name.toLowerCase());
}

export function getCondition(name: string): ConditionDb | undefined {
  return conditions.get(name.toLowerCase());
}

export function getDisease(name: string): DiseaseDb | undefined {
  return diseases.get(name.toLowerCase());
}

export function getStatus(name: string): StatusDb | undefined {
  return statuses.get(name.toLowerCase());
}

export function getBaseItem(name: string): BaseItemDb | undefined {
  return baseItems.get(name.toLowerCase());
}

export function getMagicItem(name: string): MagicItemDb | undefined {
  return magicItems.get(name.toLowerCase());
}

export function getItem(name: string): MagicItemDb | undefined {
  return allItems.get(name.toLowerCase()) as MagicItemDb | undefined;
}

export function getOptionalFeature(name: string): OptionalFeatureDb | undefined {
  return optionalFeatures.get(name.toLowerCase());
}

export function getLanguage(name: string): LanguageDb | undefined {
  return languages.get(name.toLowerCase());
}

export function getAction(name: string): ActionDb | undefined {
  return actions.get(name.toLowerCase());
}

// ─── Filtered queries ──────────────────────────────────

export function getSpellsByLevel(level: number): SpellDb[] {
  return spellsArray.filter((s) => s.level === level);
}

export function getClassFeatures(className: string, upToLevel: number): ClassFeatureDb[] {
  const cls = getClass(className);
  if (!cls) return [];
  return cls.features.filter((f) => f.level <= upToLevel);
}

export function getOptionalFeaturesByType(type: string): OptionalFeatureDb[] {
  return optionalFeaturesArray.filter((f) => f.featureType.includes(type));
}

// ─── Class Spell Slot Helpers ──────────────────────────

/** Get the caster level multiplier for a class (for multiclass spell slot computation). */
export function getCasterMultiplier(className: string): number {
  const cls = getClass(className);
  if (!cls) return 0;
  switch (cls.casterProgression) {
    case "full":
      return 1;
    case "half":
      return 0.5;
    case "third":
      return 1 / 3;
    case "pact":
      return 0; // Warlock uses pact magic, handled separately
    default:
      return 0;
  }
}

// ─── Fuzzy lookup ────────────────────────────────────────

export { fuzzyLookup, type FuzzyResult } from "../utils/fuzzy-lookup";

// ─── Search helpers ────────────────────────────────────

export function searchSpells(query: string): SpellDb[] {
  const lower = query.toLowerCase();
  return spellsArray.filter((s) => s.name.toLowerCase().includes(lower));
}

export function searchMonsters(query: string): MonsterDb[] {
  const lower = query.toLowerCase();
  return monstersArray.filter((s) => s.name.toLowerCase().includes(lower));
}

export function searchMagicItems(query: string): MagicItemDb[] {
  const lower = query.toLowerCase();
  return magicItemsArray.filter((s) => s.name.toLowerCase().includes(lower));
}

// ─── Feature Ref Helpers ───────────────────────────────

/** Return all classes in the DB (useful for subclass lookups). */
export function listClasses(): ClassDb[] {
  return classesArray;
}

/**
 * Resolve a human-readable description for a CharacterFeatureRef by looking up
 * the appropriate DB entity. Returns empty string if the entity is not found.
 */
export function resolveFeatureDescription(ref: CharacterFeatureRef): string {
  switch (ref.dbKind) {
    case "class": {
      const cls = getClass(ref.dbName);
      if (!cls) return "";
      if (ref.featureName) {
        const feature = cls.features.find((f) => f.name === ref.featureName);
        return feature?.description ?? "";
      }
      return cls.description;
    }
    case "subclass": {
      for (const cls of classesArray) {
        const sub = cls.subclasses.find(
          (s) =>
            s.name.toLowerCase() === ref.dbName.toLowerCase() ||
            s.shortName.toLowerCase() === ref.dbName.toLowerCase(),
        );
        if (sub) {
          if (ref.featureName) {
            const feature = sub.features.find((f) => f.name === ref.featureName);
            return feature?.description ?? "";
          }
          return sub.description;
        }
      }
      return "";
    }
    case "feat":
      return getFeat(ref.dbName)?.description ?? "";
    case "species":
      return getSpecies(ref.dbName)?.description ?? "";
    case "background":
      return getBackground(ref.dbName)?.description ?? "";
  }
}

/**
 * Resolve the activation type for a CharacterFeatureRef by looking up the
 * appropriate DB entity. Returns undefined for passive features.
 */
export function resolveFeatureActivation(ref: CharacterFeatureRef): FeatureActivation | undefined {
  switch (ref.dbKind) {
    case "class": {
      const cls = getClass(ref.dbName);
      if (!cls) return undefined;
      if (ref.featureName) {
        const feature = cls.features.find((f) => f.name === ref.featureName);
        return feature?.activationType;
      }
      return undefined;
    }
    case "subclass": {
      for (const cls of classesArray) {
        const sub = cls.subclasses.find(
          (s) =>
            s.name.toLowerCase() === ref.dbName.toLowerCase() ||
            s.shortName.toLowerCase() === ref.dbName.toLowerCase(),
        );
        if (sub) {
          if (ref.featureName) {
            const feature = sub.features.find((f) => f.name === ref.featureName);
            return feature?.activationType;
          }
          return undefined;
        }
      }
      return undefined;
    }
    case "feat":
      return getFeat(ref.dbName)?.activationType;
    case "species":
    case "background":
      return undefined;
  }
}

export function searchFeats(query: string): FeatDb[] {
  const lower = query.toLowerCase();
  return featsArray.filter((s) => s.name.toLowerCase().includes(lower));
}

export function searchOptionalFeatures(query: string): OptionalFeatureDb[] {
  const lower = query.toLowerCase();
  return optionalFeaturesArray.filter((s) => s.name.toLowerCase().includes(lower));
}

// ─── Re-export Db types ────────────────────────────────

export type {
  SpellDb,
  MonsterDb,
  MonsterActionEntry,
  MonsterSpellcasting,
  ClassDb,
  ClassFeatureDb,
  FeatDb,
  FeatCategory,
  SpeciesDb,
  BackgroundDb,
  ConditionDb,
  DiseaseDb,
  StatusDb,
  BaseItemDb,
  BaseItemType,
  WeaponCategory,
  MagicItemDb,
  ItemRarity,
  OptionalFeatureDb,
  LanguageDb,
  LanguageType,
  ActionDb,
  CasterProgression,
  SpellSchool,
  SpellLevel,
  ClassName,
  PackDb,
  // Note: CreatureSize is intentionally NOT re-exported here — game-state.ts
  // exports a different CreatureSize (lowercase) via types/index, and re-exporting
  // the titlecase data.ts version would cause a conflict in shared/src/index.ts.
  // Import CreatureSize from "@unseen-servant/shared/types/data" directly if needed.
} from "../types/data";

export type { Entry } from "../types/entry-types";
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
} from "../types/entry-types";

// ─── ActionRef resolver ────────────────────────────────

export { resolveActionRef } from "./resolve-action";
export type { ActionRef, ActionRefSource, ResolvedActionRef } from "./resolve-action";
