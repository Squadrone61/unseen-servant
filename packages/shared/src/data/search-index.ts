/**
 * Unified cross-category search index for the D&D 2024 database.
 *
 * Flattens every lookup-able entity (spells, monsters, conditions, magic items,
 * feats, classes, species, backgrounds, optional features, actions, languages,
 * diseases, and class/subclass features) into a single array of SearchEntry
 * records. Fed to Fuse.js at the MCP tool layer so a single `lookup_rule` tool
 * can disambiguate across categories with IDF-aware multi-word ranking —
 * replacing the bespoke per-category fuzzyLookup calls that hijacked stuffed
 * queries and couldn't find nested class/subclass features.
 *
 * The index is built once at module load; data is static JSON so no
 * invalidation is needed.
 */

import type {
  SpellDb,
  MonsterDb,
  ConditionDb,
  MagicItemDb,
  FeatDb,
  ClassDb,
  SpeciesDb,
  BackgroundDb,
  OptionalFeatureDb,
  ActionDb,
  LanguageDb,
  DiseaseDb,
  ClassFeatureDb,
} from "../types/data";
// NOTE: intentionally importing raw JSON directly rather than via ./index to
// avoid a module cycle. ./index re-exports this file's `searchIndex`, so
// pulling the arrays from ./index here would deadlock the "Cannot access X
// before initialization" path at load time.
import spellsData from "./spells.json";
import bestiaryData from "./bestiary.json";
import conditionsData from "./conditions.json";
import magicItemsData from "./items/magic.json";
import featsData from "./feats.json";
import speciesData from "./species.json";
import backgroundsData from "./backgrounds.json";
import optionalFeaturesData from "./optional-features.json";
import actionsData from "./actions.json";
import languagesData from "./languages.json";
import diseasesData from "./diseases.json";
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

const spellsArray = spellsData as unknown as SpellDb[];
const monstersArray = bestiaryData as unknown as MonsterDb[];
const conditionsArray = conditionsData as unknown as ConditionDb[];
const magicItemsArray = magicItemsData as unknown as MagicItemDb[];
const featsArray = featsData as unknown as FeatDb[];
const speciesArray = speciesData as unknown as SpeciesDb[];
const backgroundsArray = backgroundsData as unknown as BackgroundDb[];
const optionalFeaturesArray = optionalFeaturesData as unknown as OptionalFeatureDb[];
const actionsArray = actionsData as unknown as ActionDb[];
const languagesArray = languagesData as unknown as LanguageDb[];
const diseasesArray = diseasesData as unknown as DiseaseDb[];
const classesArray = [
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
] as unknown as ClassDb[];

export const LOOKUP_CATEGORIES = [
  "spell",
  "monster",
  "condition",
  "magic_item",
  "feat",
  "class",
  "species",
  "background",
  "optional_feature",
  "action",
  "language",
  "disease",
  "class_feature",
] as const;

export type LookupCategory = (typeof LOOKUP_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<LookupCategory, string> = {
  spell: "Spell",
  monster: "Monster",
  condition: "Condition",
  magic_item: "Magic Item",
  feat: "Feat",
  class: "Class",
  species: "Species",
  background: "Background",
  optional_feature: "Optional Feature",
  action: "Action",
  language: "Language",
  disease: "Disease",
  class_feature: "Class Feature",
};

/**
 * One indexed entity. Search keys used by Fuse:
 *  - name:        primary key, highest weight
 *  - source:      disambiguator for features (e.g. "Paladin / Oath of Vengeance")
 *  - description: low-weight field so content queries still find matches
 *
 * `ref` carries the original DB entry so downstream formatters can pull full
 * detail without re-looking-up by name.
 */
export interface SearchEntry {
  category: LookupCategory;
  name: string;
  /** For class/subclass features: "ClassName" or "ClassName / SubclassName". */
  source?: string;
  description: string;
  ref:
    | SpellDb
    | MonsterDb
    | ConditionDb
    | MagicItemDb
    | FeatDb
    | ClassDb
    | SpeciesDb
    | BackgroundDb
    | OptionalFeatureDb
    | ActionDb
    | LanguageDb
    | DiseaseDb
    | ClassFeatureRef;
}

/**
 * A class/subclass feature reference returned for class_feature hits.
 * Not a top-level DB entity — features live inside ClassDb.features and
 * ClassDb.subclasses[].features — so this wraps the feature plus its source
 * class/subclass for display.
 */
export interface ClassFeatureRef {
  feature: ClassFeatureDb;
  className: string;
  subclassName?: string;
}

function pushCategory<T extends { name: string; description?: string }>(
  out: SearchEntry[],
  category: LookupCategory,
  items: T[],
  getDescription: (item: T) => string,
): void {
  for (const item of items) {
    out.push({
      category,
      name: item.name,
      description: getDescription(item),
      ref: item as unknown as SearchEntry["ref"],
    });
  }
}

function buildIndex(): SearchEntry[] {
  const out: SearchEntry[] = [];

  pushCategory(out, "spell", spellsArray, (s) => s.description);
  pushCategory(out, "monster", monstersArray, () => "");
  pushCategory(out, "condition", conditionsArray, (c) => c.description);
  pushCategory(out, "magic_item", magicItemsArray, (i) => i.description);
  pushCategory(out, "feat", featsArray, (f) => f.description);
  pushCategory(out, "class", classesArray, (c) => c.description);
  pushCategory(out, "species", speciesArray, (s) => s.description);
  pushCategory(out, "background", backgroundsArray, (b) => b.description);
  pushCategory(out, "optional_feature", optionalFeaturesArray, (f) => f.description);
  pushCategory(out, "action", actionsArray, (a) => a.description);
  pushCategory(out, "language", languagesArray, (l) => l.description ?? "");
  pushCategory(out, "disease", diseasesArray, (d) => d.description);

  // Class + subclass features — previously unreachable via lookup. Nested
  // inside ClassDb; flatten here so queries like "Vow of Enmity" or
  // "Divine Sense" resolve.
  for (const cls of classesArray) {
    for (const feat of cls.features) {
      out.push({
        category: "class_feature",
        name: feat.name,
        source: cls.name,
        description: feat.description,
        ref: { feature: feat, className: cls.name },
      });
    }
    for (const sub of cls.subclasses) {
      for (const feat of sub.features) {
        out.push({
          category: "class_feature",
          name: feat.name,
          source: `${cls.name} / ${sub.name}`,
          description: feat.description,
          ref: { feature: feat, className: cls.name, subclassName: sub.name },
        });
      }
    }
  }

  return out;
}

export const searchIndex: SearchEntry[] = buildIndex();
