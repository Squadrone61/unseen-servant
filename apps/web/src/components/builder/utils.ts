import type { AbilityScores, CharacterSpell, InventoryItem, Currency, CharacterFeature } from "@aidnd/shared/types";
import type { CharacterIdentifiers } from "@aidnd/shared/builders";
import type { SpeciesData, FeatData, SpellData, ClassAssembled, OptionalFeatureData } from "@aidnd/shared/data";
import {
  getClass,
  getSpecies,
  getBackground,
  getSpell,
  getFeat,
  getBaseItem,
  getItem,
  speciesArray,
  featsArray,
  languagesArray,
  getClassFeatures,
  getOptionalFeaturesByType,
} from "@aidnd/shared/data";
import {
  formatSchool,
  formatCastingTime,
  formatRange,
  formatComponents,
  formatDuration,
  isConcentration,
  isRitual,
  entriesToText,
  getBackgroundFeat,
  getSkillChoices,
  decodeProperty,
  formatDamageType,
  getSavingThrows,
  getSpellSlotTable,
  getPactSlotTable,
  getCasterType,
  getHitDiceFaces,
  getBackgroundSkills,
  getBackgroundTools,
} from "@aidnd/shared";
import type { BuilderState, BuilderStep, EquipmentEntry, TraitChoiceDefinition, ClassEntry } from "./types";

// ─── Ability Score Helpers ──────────────────────────────

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

const POINT_BUY_COSTS: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

export const POINT_BUY_POOL = 27;

export function getPointBuyCost(scores: AbilityScores): number {
  return Object.values(scores).reduce(
    (sum, v) => sum + (POINT_BUY_COSTS[v] ?? 0),
    0
  );
}

export function getAbilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function getFinalAbilities(state: BuilderState): AbilityScores {
  const base = state.baseAbilities;
  const asi = state.asiAssignments;
  const result: AbilityScores = {
    strength: base.strength + (asi.strength ?? 0),
    dexterity: base.dexterity + (asi.dexterity ?? 0),
    constitution: base.constitution + (asi.constitution ?? 0),
    intelligence: base.intelligence + (asi.intelligence ?? 0),
    wisdom: base.wisdom + (asi.wisdom ?? 0),
    charisma: base.charisma + (asi.charisma ?? 0),
  };

  // Apply class-level ASI selections
  for (const sel of state.asiSelections) {
    if (sel.type === "asi" && sel.asiChoice) {
      for (const [ability, bonus] of Object.entries(sel.asiChoice.abilities)) {
        const key = ability as keyof AbilityScores;
        result[key] = Math.min(20, result[key] + (bonus ?? 0));
      }
    } else if (sel.type === "feat" && sel.featAbilityChoice) {
      result[sel.featAbilityChoice] = Math.min(20, result[sel.featAbilityChoice] + 1);
    }
  }

  return result;
}

export const STANDARD_ARRAY_DEFAULT: AbilityScores = {
  strength: 0, dexterity: 0, constitution: 0,
  intelligence: 0, wisdom: 0, charisma: 0,
};

export const DEFAULT_ABILITIES: AbilityScores = {
  strength: 10, dexterity: 10, constitution: 10,
  intelligence: 10, wisdom: 10, charisma: 10,
};

export const POINT_BUY_DEFAULT: AbilityScores = {
  strength: 8, dexterity: 8, constitution: 8,
  intelligence: 8, wisdom: 8, charisma: 8,
};

// ─── ASI Level Helpers (DATA-DRIVEN) ────────────────────

/** Returns ASI levels for a single class by scanning class features for "Ability Score Improvement" */
function getASILevelsForSingleClass(className: string, level: number): number[] {
  const features = getClassFeatures(className, level);
  return features
    .filter(f => f.name === "Ability Score Improvement" || f.name === "Epic Boon")
    .map(f => f.level)
    .sort((a, b) => a - b);
}

/** Returns ASI levels across all classes in a multiclass build */
export function getASILevelsForClasses(
  classes: { className: string; level: number; classIndex?: number }[]
): { classIndex: number; level: number; className: string }[] {
  const result: { classIndex: number; level: number; className: string }[] = [];
  for (let i = 0; i < classes.length; i++) {
    const { className, level } = classes[i];
    const asiLevels = getASILevelsForSingleClass(className, level);
    for (const lvl of asiLevels) {
      result.push({ classIndex: i, level: lvl, className });
    }
  }
  return result.sort((a, b) => a.classIndex !== b.classIndex ? a.classIndex - b.classIndex : a.level - b.level);
}

/** Returns feats eligible for selection at a given total level */
export function getEligibleFeats(level: number): FeatData[] {
  return featsArray.filter((f) => {
    if (!f.category) return false;
    if (f.category === "O") return false;
    if (f.category.startsWith("FS")) return false;
    if (f.name === "Ability Score Improvement") return false;
    if (f.category === "EB") return level >= 19;
    return f.category === "G";
  });
}

/** Normalize ability abbreviations to full names */
const ABILITY_ABBREV_MAP: Record<string, keyof AbilityScores> = {
  str: "strength", strength: "strength",
  dex: "dexterity", dexterity: "dexterity",
  con: "constitution", constitution: "constitution",
  int: "intelligence", intelligence: "intelligence",
  wis: "wisdom", wisdom: "wisdom",
  cha: "charisma", charisma: "charisma",
};

/** Normalize and deduplicate ability choices from feat data */
export function getFeatAbilityChoices(feat: FeatData): (keyof AbilityScores)[] {
  if (!feat.ability) return [];
  const result: (keyof AbilityScores)[] = [];
  for (const abilityEntry of feat.ability) {
    if (abilityEntry.choose?.from) {
      for (const raw of abilityEntry.choose.from) {
        const normalized = ABILITY_ABBREV_MAP[raw.toLowerCase().trim()];
        if (normalized && !result.includes(normalized)) {
          result.push(normalized);
        }
      }
    }
    for (const [key, val] of Object.entries(abilityEntry)) {
      if (key === "choose") continue;
      if (val) {
        const normalized = ABILITY_ABBREV_MAP[key.toLowerCase()];
        if (normalized && !result.includes(normalized)) {
          result.push(normalized);
        }
      }
    }
  }
  return result;
}

// ─── HP Computation ─────────────────────────────────────

function computeSingleClassHP(className: string, level: number, conMod: number): number {
  const cls = getClass(className);
  if (!cls) return 10 + conMod;
  const hitDice = getHitDiceFaces(cls);
  let hp = hitDice + conMod;
  for (let i = 1; i < level; i++) {
    hp += Math.floor(hitDice / 2) + 1 + conMod;
  }
  return Math.max(1, hp);
}

/** Compute HP for multiclass: first class max HD + con, subsequent levels average + con */
function computeMulticlassHP(classes: ClassEntry[], conMod: number): number {
  if (classes.length === 0) return 10 + conMod;
  if (classes.length === 1) return computeSingleClassHP(classes[0].className, classes[0].level, conMod);

  let hp = 0;
  for (let ci = 0; ci < classes.length; ci++) {
    const cls = getClass(classes[ci].className);
    if (!cls) continue;
    const hitDice = getHitDiceFaces(cls);
    for (let lv = 0; lv < classes[ci].level; lv++) {
      if (ci === 0 && lv === 0) {
        // First level of first class: max hit dice
        hp += hitDice + conMod;
      } else {
        // All other levels: average
        hp += Math.floor(hitDice / 2) + 1 + conMod;
      }
    }
  }
  return Math.max(1, hp);
}

// ─── Spell Helpers ──────────────────────────────────────

export function getCantripsKnown(className: string, level: number): number {
  const cls = getClass(className);
  if (!cls?.cantripProgression) return 0;
  return cls.cantripProgression[Math.min(level, 20) - 1] ?? 0;
}

export function getSpellsKnownOrPrepared(
  className: string,
  level: number,
  abilityMod: number
): { type: "known" | "prepared"; count: number } {
  const cls = getClass(className);
  if (!cls) return { type: "known", count: 0 };

  // Known-caster: use spellsKnownProgression from class data
  if (cls.spellsKnownProgression) {
    return { type: "known", count: cls.spellsKnownProgression[Math.min(level, 20) - 1] ?? 0 };
  }

  // Prepared caster: derive from preparedSpellsProgression in class data
  if (getCasterType(cls) && cls.preparedSpellsProgression) {
    return { type: "prepared", count: cls.preparedSpellsProgression[Math.min(level, 20) - 1] ?? 0 };
  }

  // Fallback for casters without progression data
  if (getCasterType(cls)) {
    return { type: "prepared", count: Math.max(1, abilityMod + level) };
  }

  return { type: "known", count: 0 };
}

export function getMaxSpellLevel(className: string, level: number): number {
  const lc = className.toLowerCase();

  if (lc === "warlock") {
    const cls = getClass(className);
    if (cls) {
      const pactTable = getPactSlotTable(cls);
      if (pactTable) {
        const entry = pactTable.find((e: { level: number; slotLevel: number }) => e.level === level);
        return entry?.slotLevel ?? 0;
      }
    }
    return 0;
  }

  if (lc === "paladin" || lc === "ranger") {
    if (level < 2) return 0;
  }

  const cls = getClass(className);
  if (cls) {
    const slotTable = getSpellSlotTable(cls);
    if (slotTable) {
      const row = slotTable[Math.min(level, 20) - 1];
      if (row) {
        for (let i = row.length - 1; i >= 0; i--) {
          if (row[i] > 0) return i + 1;
        }
      }
    }
  }

  return 0;
}

export function isCasterClass(className: string): boolean {
  const cls = getClass(className);
  if (!cls) return false;
  return !!getCasterType(cls);
}

/** Check if any class in the build is a caster */
function hasAnyCaster(classes: ClassEntry[]): boolean {
  return classes.some(c => isCasterClass(c.className));
}

/** Get total character level across all classes */
function getTotalLevel(classes: ClassEntry[]): number {
  return classes.reduce((sum, c) => sum + c.level, 0);
}

// ─── Background Helpers ─────────────────────────────────

function parseBackgroundFeat(featString: string): string {
  const name = featString.split("|")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── Species Filter ─────────────────────────────────────

const MONSTER_SPECIES = new Set([
  "bullywug", "gnoll", "grimlock", "kuo-toa", "skeleton", "troglodyte", "zombie",
]);

function filterPlayerSpecies(arr: SpeciesData[]): SpeciesData[] {
  return arr.filter((s) => !MONSTER_SPECIES.has(s.name.toLowerCase()));
}

export function getFilteredSpecies(): SpeciesData[] {
  return filterPlayerSpecies(speciesArray);
}

// ─── Species Trait Choice (DATA-DRIVEN + Registry) ──────

/** Find a trait name from species entries that relates to skill proficiency */
function findSkillTraitName(species: SpeciesData): string | null {
  for (const entry of species.entries) {
    if (typeof entry === "object" && entry !== null) {
      const obj = entry as unknown as Record<string, unknown>;
      if (obj.name && obj.entries && Array.isArray(obj.entries)) {
        const text = (obj.entries as unknown[]).join(" ").toLowerCase();
        if (text.includes("proficiency") || text.includes("skill")) {
          return obj.name as string;
        }
      }
    }
  }
  return null;
}

/**
 * Derive trait choices from native SpeciesData structured fields.
 * Handles: skillProficiencies, feats, languageProficiencies, additionalSpells, size choices.
 * Falls back to ANCESTRY_CHOICES for text-described choices (Dragonborn, Goliath).
 */
function deriveSpeciesChoices(species: SpeciesData): TraitChoiceDefinition[] {
  const choices: TraitChoiceDefinition[] = [];

  // Skill proficiency choices
  if (species.skillProficiencies) {
    for (const sp of species.skillProficiencies) {
      const anyCount = (sp as Record<string, unknown>)["any"];
      if (typeof anyCount === "number") {
        choices.push({
          traitName: "Skillful",
          choiceType: anyCount === 1 ? "skill" : "skills",
          count: anyCount,
        });
      } else {
        // Specific skill choices: { choose: { from: [...], count: N } }
        const chooseData = (sp as Record<string, unknown>)["choose"];
        if (chooseData && typeof chooseData === "object" && "from" in (chooseData as Record<string, unknown>)) {
          const choose = chooseData as { from: string[]; count?: number };
          // Derive trait name from species entries (e.g., Elf → "Keen Senses")
          const skillTraitName = findSkillTraitName(species) ?? "Skill Proficiency";
          choices.push({
            traitName: skillTraitName,
            choiceType: (choose.count ?? 1) > 1 ? "skills" : "skill",
            count: choose.count ?? 1,
            options: choose.from.map((s: string) => s.replace(/ /g, "-")),
          });
        }
      }
    }
  }

  // Feat choices (e.g., Human Versatile, Custom Lineage Feat)
  if (species.feats) {
    for (const fp of species.feats) {
      const rec = fp as Record<string, unknown>;
      if (rec["anyFromCategory"]) {
        // Specific category (e.g., Human → Origin feats "O")
        const catData = rec["anyFromCategory"] as { category: string[]; count: number };
        choices.push({
          traitName: species.name === "Human" ? "Versatile" : "Feat",
          choiceType: "feat",
          featCategory: catData.category[0],
        });
      } else if (rec["any"]) {
        // Any feat (e.g., Custom Lineage)
        choices.push({
          traitName: "Feat",
          choiceType: "feat",
        });
      }
    }
  }

  // Language proficiency choices
  if (species.languageProficiencies) {
    for (const lp of species.languageProficiencies) {
      const rec = lp as Record<string, unknown>;
      const anyStandard = typeof rec["anyStandard"] === "number" ? rec["anyStandard"] as number : 0;
      if (anyStandard > 0) {
        // Fixed languages already granted
        const fixedLangs = new Set(
          Object.keys(rec).filter(k => rec[k] === true).map(k => k.toLowerCase())
        );
        // Standard languages as options, excluding already-granted ones
        const options = languagesArray
          .filter(l => l.type === "standard" && !fixedLangs.has(l.name.toLowerCase()))
          .map(l => l.name);
        choices.push({
          traitName: "Languages",
          choiceType: "language",
          count: anyStandard,
          options,
        });
      }
    }
  }

  // Size choice (some species can be S or M)
  if (species.size && species.size.length > 1) {
    choices.push({
      traitName: "Size",
      choiceType: "size",
      options: species.size,
    });
  }

  // Lineage spells from additionalSpells (Elf, Gnome, Tiefling, etc.)
  if (species.additionalSpells && species.additionalSpells.length > 0) {
    // Check if there are multiple lineage options (entries describe the lineage names)
    const lineageChoices = extractLineageChoices(species);
    if (lineageChoices) {
      choices.push(lineageChoices);
    }
  }

  // Ancestry choices (text-described, not structured)
  const ancestry = ANCESTRY_CHOICES[species.name.toLowerCase()];
  if (ancestry) {
    choices.push(...ancestry);
  }

  return choices;
}

/** Extract lineage choices from species entries — e.g., Elf has Drow/High Elf/Wood Elf lineages */
function extractLineageChoices(species: SpeciesData): TraitChoiceDefinition | null {
  if (!species.additionalSpells || species.additionalSpells.length === 0) return null;

  // Multiple additionalSpells entries = multiple lineage options
  if (species.additionalSpells.length > 1) {
    const lineageOptions = species.additionalSpells
      .filter(as => as.name)
      .map(as => {
        const spellNames: string[] = [];
        // Extract from known spells
        if (as.known) {
          for (const [, spells] of Object.entries(as.known)) {
            if (Array.isArray(spells)) {
              for (const s of spells) {
                if (typeof s === "string") spellNames.push(s.split("|")[0].replace(/#c$/, ""));
              }
            }
            // Object format like { "_": [{ "choose": "level=0|class=Wizard" }] } — skip, it's a choice
          }
        }
        // Extract from innate spells
        if (as.innate) {
          for (const [, levelData] of Object.entries(as.innate)) {
            if (levelData && typeof levelData === "object" && "daily" in levelData) {
              const daily = (levelData as { daily: Record<string, string[]> }).daily;
              for (const [, spells] of Object.entries(daily)) {
                if (Array.isArray(spells)) {
                  for (const s of spells) {
                    if (typeof s === "string") spellNames.push(s.split("|")[0]);
                  }
                }
              }
            }
          }
        }
        return {
          name: as.name!,
          description: spellNames.length > 0
            ? `Spells: ${spellNames.join(", ")}`
            : as.name!,
        };
      });

    if (lineageOptions.length > 0) {
      // Check for spellcasting ability choice
      const firstWithAbility = species.additionalSpells.find(
        as => as.ability && typeof as.ability === "object" && "choose" in as.ability
      );
      const abilityChoices = firstWithAbility?.ability &&
        typeof firstWithAbility.ability === "object" && "choose" in firstWithAbility.ability
        ? (firstWithAbility.ability as { choose: string[] }).choose
        : undefined;

      return {
        traitName: getLineageTraitName(species.name),
        choiceType: "lineage",
        lineageOptions,
        secondaryChoice: abilityChoices
          ? { type: "spellcasting-ability", options: abilityChoices }
          : undefined,
      };
    }
  }

  return null;
}

function getLineageTraitName(speciesName: string): string {
  const map: Record<string, string> = {
    elf: "Elven Lineage",
    gnome: "Gnomish Lineage",
    tiefling: "Fiendish Legacy",
  };
  return map[speciesName.toLowerCase()] ?? `${speciesName} Lineage`;
}

/**
 * Ancestry choices that can't be derived from structured data
 * (described in entries text, not in structured fields)
 */
const ANCESTRY_CHOICES: Record<string, TraitChoiceDefinition[]> = {
  dragonborn: [
    {
      traitName: "Draconic Ancestry",
      choiceType: "ancestry",
      lineageOptions: [
        { name: "Black", description: "Acid damage" },
        { name: "Blue", description: "Lightning damage" },
        { name: "Brass", description: "Fire damage" },
        { name: "Bronze", description: "Lightning damage" },
        { name: "Copper", description: "Acid damage" },
        { name: "Gold", description: "Fire damage" },
        { name: "Green", description: "Poison damage" },
        { name: "Red", description: "Fire damage" },
        { name: "Silver", description: "Cold damage" },
        { name: "White", description: "Cold damage" },
      ],
    },
  ],
  goliath: [
    {
      traitName: "Giant Ancestry",
      choiceType: "ancestry",
      lineageOptions: [
        { name: "Cloud's Jaunt", description: "As a Bonus Action, teleport up to 30 feet to an unoccupied space you can see" },
        { name: "Fire's Burn", description: "When you hit with an attack, deal extra 1d10 fire damage" },
        { name: "Frost's Chill", description: "When you hit with an attack, deal extra 1d6 cold damage and reduce speed by 10 ft." },
        { name: "Hill's Tumble", description: "As a Bonus Action, knock a Large or smaller creature prone when within 5 ft." },
        { name: "Stone's Endurance", description: "As a Reaction, reduce damage by 1d12 + CON modifier" },
        { name: "Storm's Thunder", description: "As a Reaction, deal 1d8 thunder damage and push 15 ft. when hit by an attack" },
      ],
    },
  ],
  "half-elf": [
    { traitName: "Skill Versatility", choiceType: "skills", count: 2 },
  ],
  genasi: [
    {
      traitName: "Elemental Lineage",
      choiceType: "ancestry",
      lineageOptions: [
        { name: "Air", description: "Lightning Resistance, Shocking Grasp cantrip, Feather Fall, Levitate — Speed 35 ft." },
        { name: "Earth", description: "Blade Ward cantrip, Pass without Trace — Earth Walk (ignore difficult terrain)" },
        { name: "Fire", description: "Fire Resistance, Produce Flame cantrip, Burning Hands, Flame Blade" },
        { name: "Water", description: "Acid Resistance, Acid Splash cantrip, Create or Destroy Water, Water Walk — Swim speed" },
      ],
    },
  ],
};

/** Backward-compat wrapper */
export function getSpeciesTraitChoices(speciesName: string): TraitChoiceDefinition[] {
  const data = getSpecies(speciesName);
  if (!data) return [];
  return deriveSpeciesChoices(data);
}

// ─── Species-Granted Skills ─────────────────────────────

export function getSpeciesSkills(state: BuilderState): string[] {
  const skills: string[] = [];
  const traitChoices = state.species ? getSpeciesTraitChoices(state.species) : [];
  for (const def of traitChoices) {
    if (def.choiceType === "skill" || def.choiceType === "skills") {
      const choice = state.speciesChoices[def.traitName];
      if (choice) {
        const selected = choice.selected;
        if (Array.isArray(selected)) {
          skills.push(...selected);
        } else if (selected) {
          skills.push(selected);
        }
      }
    }
  }
  return skills;
}

// ─── Class Feature Choices (DATA-DRIVEN) ────────────────

/**
 * Get optional features available for a class at a given level.
 * Reads from ClassRaw.optionalfeatureProgression and ClassRaw.featProgression.
 */
export function getClassOptionalFeatures(
  className: string,
  level: number
): { name: string; featureTypes: string[]; count: number; options: OptionalFeatureData[] }[] {
  const cls = getClass(className);
  if (!cls) return [];

  const result: { name: string; featureTypes: string[]; count: number; options: OptionalFeatureData[] }[] = [];

  // optionalfeatureProgression (Warlock Invocations, Sorcerer Metamagic, etc.)
  if (cls.optionalfeatureProgression) {
    for (const prog of cls.optionalfeatureProgression) {
      let count = 0;
      if (Array.isArray(prog.progression)) {
        // Array format: index = level-1
        count = prog.progression[Math.min(level, 20) - 1] ?? 0;
      } else {
        // Record format: { "2": 2, "10": 4 }
        for (const [lvl, c] of Object.entries(prog.progression)) {
          if (level >= Number(lvl)) count = c;
        }
      }

      if (count > 0) {
        const options: OptionalFeatureData[] = [];
        for (const ft of prog.featureType) {
          options.push(...getOptionalFeaturesByType(ft));
        }
        result.push({
          name: prog.name,
          featureTypes: prog.featureType,
          count,
          options,
        });
      }
    }
  }

  // featProgression for Fighting Styles (category "FS", "FS:P", "FS:R")
  if (cls.featProgression) {
    for (const prog of cls.featProgression) {
      if (!prog.category?.some(c => c.startsWith("FS"))) continue;

      let available = false;
      for (const [lvl] of Object.entries(prog.progression)) {
        if (level >= Number(lvl)) available = true;
      }

      if (available) {
        // Get Fighting Style feats matching the categories
        const fsFeats = featsArray.filter(f =>
          prog.category!.some(cat => f.category === cat || (cat === "FS" && f.category === "FS"))
        );

        result.push({
          name: prog.name,
          featureTypes: prog.category!,
          count: 1,
          options: fsFeats.map(f => ({
            name: f.name,
            source: f.source,
            featureType: [f.category],
            entries: f.entries,
          })) as OptionalFeatureData[],
        });
      }
    }
  }

  return result;
}

// ─── Subclass Always-Prepared Spells (DATA-DRIVEN) ──────

/**
 * Get always-prepared spells from subclass data.
 * Reads subclass.additionalSpells[].prepared directly.
 */
export function getSubclassAlwaysPrepared(className: string, subclassName: string | null, level: number): string[] {
  if (!subclassName) return [];
  const cls = getClass(className);
  if (!cls) return [];

  const subclass = cls.resolvedSubclasses.find(
    sc => sc.name === subclassName || sc.shortName === subclassName
  );
  if (!subclass?.additionalSpells) return [];

  const spells: string[] = [];
  for (const entry of subclass.additionalSpells) {
    if (entry.prepared) {
      for (const [lvl, spellList] of Object.entries(entry.prepared)) {
        if (level >= Number(lvl)) {
          for (const s of spellList) {
            if (typeof s === "string") {
              spells.push(s.split("|")[0]); // strip source tag
            }
          }
        }
      }
    }
  }
  return spells;
}

// ─── Species Lineage Spells (DATA-DRIVEN) ───────────────

/**
 * Get lineage spells from species.additionalSpells.known.
 * Reads from native SpeciesData instead of hardcoded tables.
 */
function getSpeciesSpells(state: BuilderState): CharacterSpell[] {
  if (!state.species) return [];
  const speciesData = getSpecies(state.species);
  if (!speciesData?.additionalSpells) return [];

  const result: CharacterSpell[] = [];
  const totalLevel = getTotalLevel(state.classes);

  // Find which lineage is selected (if applicable)
  let selectedLineage: string | null = null;
  for (const [, choice] of Object.entries(state.speciesChoices)) {
    if (typeof choice.selected === "string" && choice.selected) {
      // Check if this matches an additionalSpells entry name
      const matchesLineage = speciesData.additionalSpells!.some(
        as => as.name === choice.selected
      );
      if (matchesLineage) {
        selectedLineage = choice.selected as string;
        break;
      }
    }
  }

  for (const entry of speciesData.additionalSpells) {
    // If there are named entries (lineages), only use the selected one
    if (entry.name && selectedLineage && entry.name !== selectedLineage) continue;
    if (entry.name && !selectedLineage && speciesData.additionalSpells!.length > 1) continue;

    if (entry.known) {
      for (const [lvlStr, spellNames] of Object.entries(entry.known)) {
        if (!Array.isArray(spellNames)) continue; // Skip object formats like { "_": [{ "choose": ... }] }
        const lvl = Number(lvlStr);
        if (totalLevel >= lvl) {
          for (const rawName of spellNames) {
            if (typeof rawName !== "string") continue;
            const spellName = rawName.split("|")[0];
            const db = getSpell(spellName);
            if (db) {
              result.push(spellFromDb(db, {
                name: spellName, prepared: true, alwaysPrepared: true,
                spellSource: "race" as const, knownByClass: false,
              }));
            }
          }
        }
      }
    }
  }

  return result;
}

// ─── Weapon Mastery Registry ────────────────────────────

const WEAPON_MASTERY_CLASSES: Record<string, { level: number; count: number; restriction?: "melee" }> = {
  barbarian: { level: 1, count: 2, restriction: "melee" },
  fighter: { level: 1, count: 3 },
  paladin: { level: 1, count: 2, restriction: "melee" },
  ranger: { level: 1, count: 2 },
};

export function getWeaponMasteryConfig(className: string, level: number) {
  const config = WEAPON_MASTERY_CLASSES[className.toLowerCase()];
  if (!config || level < config.level) return null;
  return config;
}

// ─── Ritual Casting ─────────────────────────────────────

export const RITUAL_CASTER_CLASSES = new Set(["bard", "cleric", "druid", "wizard"]);

// ─── Multiclass Validation ──────────────────────────────

/**
 * Validate multiclass prerequisites. Returns error message or null if valid.
 * In 2024 PHB, multiclass requirements are not formalized in structured data,
 * so we use the standard 13-in-primary-ability rule.
 */
function validateMulticlassPrereqs(
  abilities: AbilityScores,
  className: string
): string | null {
  const cls = getClass(className);
  if (!cls?.multiclassing?.requirements) return null;

  // Not all classes define requirements in the data; fall back to standard rules
  return null; // Prerequisites not strictly enforced in builder (show warnings instead)
}

/**
 * Get multiclass skill choices for subsequent classes.
 * First class gets full skill count; subsequent get multiclassing.proficienciesGained.skills
 */
function getMulticlassSkillInfo(classes: ClassEntry[]): {
  primarySkillChoices: { from: string[]; count: number } | null;
  secondarySkillChoices: { className: string; from: string[]; count: number }[];
} {
  if (classes.length === 0) return { primarySkillChoices: null, secondarySkillChoices: [] };

  // First class gets full skill choices
  const primaryCls = getClass(classes[0].className);
  const primarySkillChoices = primaryCls ? (getSkillChoices(primaryCls) ?? null) : null;

  // Subsequent classes get multiclassing skill gains
  const secondarySkillChoices: { className: string; from: string[]; count: number }[] = [];
  for (let i = 1; i < classes.length; i++) {
    const cls = getClass(classes[i].className);
    if (!cls?.multiclassing?.proficienciesGained?.skills) continue;
    const skills = cls.multiclassing.proficienciesGained.skills;
    if (Array.isArray(skills)) {
      for (const s of skills) {
        if (s.choose) {
          secondarySkillChoices.push({
            className: classes[i].className,
            from: s.choose.from,
            count: s.choose.count,
          });
        }
      }
    } else if (skills && typeof skills === "object" && "choose" in skills) {
      const choose = (skills as { choose: { from: string[]; count: number } }).choose;
      secondarySkillChoices.push({
        className: classes[i].className,
        from: choose.from,
        count: choose.count,
      });
    }
  }

  return { primarySkillChoices, secondarySkillChoices };
}

// ─── Spell Helpers ──────────────────────────────────────

/** Build CharacterSpell from native 5e.tools SpellData */
function spellFromDb(
  db: SpellData,
  overrides: Partial<CharacterSpell> & { name: string }
): CharacterSpell {
  return {
    level: db.level,
    prepared: false,
    alwaysPrepared: false,
    spellSource: "class",
    knownByClass: false,
    ...overrides,
    school: formatSchool(db.school),
    castingTime: formatCastingTime(db),
    range: formatRange(db.range),
    components: formatComponents(db),
    duration: formatDuration(db),
    concentration: isConcentration(db),
    ritual: isRitual(db),
  };
}

// ─── Equipment Helpers ──────────────────────────────────

function equipmentToInventoryItem(entry: EquipmentEntry): InventoryItem {
  const item: InventoryItem = {
    name: entry.name,
    equipped: entry.equipped,
    quantity: entry.quantity,
  };

  switch (entry.source) {
    case "weapon": {
      const w = getBaseItem(entry.name);
      if (w && w.weapon) {
        item.type = "Weapon";
        item.damage = w.dmg1 ? `${w.dmg1}` : undefined;
        item.damageType = w.dmgType ? formatDamageType(w.dmgType) : undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        item.properties = (w.property as any[])?.map((p: string) => decodeProperty(p));
        item.weight = w.weight;
        if (w.range) item.range = w.range;
      } else {
        item.type = "Weapon";
      }
      break;
    }
    case "armor": {
      const a = getBaseItem(entry.name);
      if (a) {
        const typeCode = a.type?.split("|")[0];
        item.type = typeCode === "S" ? "Shield" : "Armor";
        item.armorClass = a.ac;
        item.weight = a.weight;
      } else {
        item.type = "Armor";
      }
      break;
    }
    case "gear":
    case "tool": {
      const g = getBaseItem(entry.name) ?? getItem(entry.name);
      if (g) {
        item.type = entry.source === "tool" ? "Tool" : "Gear";
        item.weight = g.weight;
        if (g.entries) item.description = entriesToText(g.entries);
        if (g.rarity && g.rarity !== "none") {
          item.isMagicItem = true;
          item.rarity = g.rarity;
        }
      } else {
        item.type = entry.source === "tool" ? "Tool" : "Gear";
      }
      break;
    }
    case "magic-item": {
      item.type = entry.itemType || "Wondrous Item";
      item.isMagicItem = true;
      if (entry.weight) item.weight = entry.weight;
      if (entry.description) item.description = entry.description;
      if (entry.rarity) item.rarity = entry.rarity;
      if (entry.attunement) item.attunement = true;
      if (entry.armorClass != null) item.armorClass = entry.armorClass;
      if (entry.damage) item.damage = entry.damage;
      if (entry.damageType) item.damageType = entry.damageType;
      if (entry.attackBonus != null) item.attackBonus = entry.attackBonus;
      if (entry.properties?.length) item.properties = entry.properties;
      break;
    }
    case "item": {
      item.type = entry.itemType || "Gear";
      if (entry.weight) item.weight = entry.weight;
      if (entry.description) item.description = entry.description;
      if (entry.armorClass != null) item.armorClass = entry.armorClass;
      if (entry.damage) item.damage = entry.damage;
      if (entry.damageType) item.damageType = entry.damageType;
      if (entry.range) item.range = entry.range;
      if (entry.attackBonus != null) item.attackBonus = entry.attackBonus;
      if (entry.properties?.length) item.properties = entry.properties;
      if (entry.rarity) item.rarity = entry.rarity;
      if (entry.attunement) item.attunement = true;
      if (entry.isMagicItem) item.isMagicItem = true;
      break;
    }
  }

  return item;
}

// ─── Assemble Identifiers ───────────────────────────────

export function assembleIdentifiers(state: BuilderState): CharacterIdentifiers {
  const finalAbilities = getFinalAbilities(state);
  const conMod = getAbilityMod(finalAbilities.constitution);

  // Primary class (first in array)
  const primaryClass = state.classes[0];
  if (!primaryClass) {
    throw new Error("No class selected");
  }

  const primaryCls = getClass(primaryClass.className);
  const speciesData = state.species ? getSpecies(state.species) : null;
  const bgData = state.background ? getBackground(state.background) : null;

  // Build classes array
  const classEntries = state.classes.map(c => ({
    name: c.className,
    level: c.level,
    subclass: c.subclass ?? undefined,
  }));

  // Combine background skills + species skills + class picks
  const bgSkills: string[] = bgData ? getBackgroundSkills(bgData) : [];
  const speciesSkills = getSpeciesSkills(state);
  const allSkills = [...new Set([...bgSkills, ...speciesSkills, ...state.skillProficiencies])];

  // Save proficiencies from primary class
  const saveProficiencies: (keyof AbilityScores)[] = (primaryCls ? getSavingThrows(primaryCls) : []).map(
    (s: string) => s.toLowerCase() as keyof AbilityScores
  );

  // Build spells from all classes
  const spells: CharacterSpell[] = [];

  for (const classEntry of state.classes) {
    const className = classEntry.className;

    // Always-prepared spells from subclass
    const alwaysPrepared = getSubclassAlwaysPrepared(className, classEntry.subclass, classEntry.level);
    for (const name of alwaysPrepared) {
      const db = getSpell(name);
      if (db) {
        spells.push(spellFromDb(db, {
          name, prepared: true, alwaysPrepared: true,
          spellSource: "class" as const, knownByClass: true, sourceClass: className,
        }));
      } else {
        spells.push({
          name, level: 1, prepared: true, alwaysPrepared: true,
          spellSource: "class" as const, knownByClass: true, sourceClass: className,
        });
      }
    }

    // Selected cantrips for this class
    const classSpells = state.spellSelections[className];
    if (classSpells) {
      for (const name of classSpells.cantrips) {
        const db = getSpell(name);
        if (db) {
          spells.push(spellFromDb(db, {
            name, level: 0, prepared: true, alwaysPrepared: false,
            spellSource: "class" as const, knownByClass: true, sourceClass: className,
          }));
        } else {
          spells.push({
            name, level: 0, prepared: true, alwaysPrepared: false,
            spellSource: "class" as const, knownByClass: true, sourceClass: className,
          });
        }
      }

      // Selected leveled spells for this class
      for (const name of classSpells.spells) {
        const db = getSpell(name);
        if (db) {
          spells.push(spellFromDb(db, {
            name, prepared: true, alwaysPrepared: false,
            spellSource: "class" as const, knownByClass: true, sourceClass: className,
          }));
        } else {
          spells.push({
            name, level: 1, prepared: true, alwaysPrepared: false,
            spellSource: "class" as const, knownByClass: true, sourceClass: className,
          });
        }
      }
    }
  }

  // Equipment
  const equipment: InventoryItem[] = state.equipment.map(equipmentToInventoryItem);

  // Languages — Common is always known, plus 2 from background (2024 PHB rule)
  const languages: string[] = ["Common"];
  // Add background language choices
  if (state.backgroundLanguages?.length) {
    languages.push(...state.backgroundLanguages);
  }
  // Add any species-granted languages (legacy/non-2024 species)
  if (speciesData?.languageProficiencies) {
    for (const lp of speciesData.languageProficiencies) {
      const rec = lp as Record<string, unknown>;
      for (const [key, val] of Object.entries(rec)) {
        if (val === true) {
          const lang = key.charAt(0).toUpperCase() + key.slice(1);
          if (!languages.includes(lang)) languages.push(lang);
        }
      }
    }
  }
  // Add chosen languages from species choices
  const langChoice = state.speciesChoices["Languages"];
  if (langChoice) {
    const selected = langChoice.selected;
    if (Array.isArray(selected)) {
      for (const l of selected) { if (!languages.includes(l)) languages.push(l); }
    } else if (selected && !languages.includes(selected)) {
      languages.push(selected);
    }
  }

  // Tool proficiencies from background
  const toolProficiencies: string[] = bgData ? getBackgroundTools(bgData) : [];

  const name = state.name.trim() || state.nameFromSpeciesStep.trim() || "Unnamed";
  const currency: Currency = { ...state.currency };

  // Convert optional feature selections to CharacterFeature[]
  const additionalFeatures: CharacterFeature[] = [];
  for (const classEntry of state.classes) {
    for (const [featureType, choices] of Object.entries(classEntry.optionalFeatureSelections)) {
      for (const choice of choices) {
        const optData = getOptionalFeaturesByType(featureType).find(
          f => f.name === choice
        );
        additionalFeatures.push({
          name: choice,
          description: optData ? entriesToText(optData.entries) : choice,
          source: "class",
          sourceLabel: classEntry.className,
        });
      }
    }
  }

  // Add selected feats from ASI levels
  for (const sel of state.asiSelections) {
    if (sel.type === "feat" && sel.featName) {
      const featData = getFeat(sel.featName);
      additionalFeatures.push({
        name: sel.featName,
        description: featData ? entriesToText(featData.entries) : `Feat selected at level ${sel.level}`,
        source: "feat",
        sourceLabel: `Level ${sel.level}`,
      });
      // Feat-granted proficiencies
      if (featData?.toolProficiencies) {
        for (const tp of featData.toolProficiencies) {
          toolProficiencies.push(...Object.keys(tp));
        }
      }
      // Feat-granted spells
      if (sel.featSubChoices) {
        for (const cantripName of sel.featSubChoices["cantrips"] ?? []) {
          const db = getSpell(cantripName);
          if (db) {
            spells.push(spellFromDb(db, {
              name: cantripName, level: 0, prepared: true, alwaysPrepared: true,
              spellSource: "feat" as const, knownByClass: false,
            }));
          }
        }
        for (const spellName of sel.featSubChoices["spells"] ?? []) {
          const db = getSpell(spellName);
          if (db) {
            spells.push(spellFromDb(db, {
              name: spellName, level: db.level, prepared: true, alwaysPrepared: true,
              spellSource: "feat" as const, knownByClass: false,
            }));
          }
        }
      }
      // Resilient feat
      if (sel.featName.toLowerCase() === "resilient" && sel.featAbilityChoice) {
        saveProficiencies.push(sel.featAbilityChoice);
      }
      // Skilled feat
      if (sel.featName.toLowerCase() === "skilled" && sel.featSubChoices?.["skills"]) {
        allSkills.push(...sel.featSubChoices["skills"]);
      }
      // Skill Expert
      if (sel.featName.toLowerCase() === "skill expert" && sel.featSubChoices?.["skills"]) {
        allSkills.push(...sel.featSubChoices["skills"]);
      }
    }
  }

  // Origin feats (background + species Versatile trait)
  const originFeatNames: string[] = [];
  const bgOriginFeat = bgData ? getBackgroundFeat(bgData) ?? null : null;
  if (bgOriginFeat) originFeatNames.push(bgOriginFeat);

  const versatileChoice = state.speciesChoices["Versatile"];
  if (versatileChoice && typeof versatileChoice.selected === "string" && versatileChoice.selected) {
    const speciesFeat = versatileChoice.selected;
    const isDuplicate = originFeatNames.some((n) => n.toLowerCase() === speciesFeat.toLowerCase());
    if (!isDuplicate || getFeat(speciesFeat)?.repeatable) {
      originFeatNames.push(speciesFeat);
    }
  }

  // Track occurrences so repeatable feats use the correct overrides
  const featOccurrences: Record<string, number> = {};
  for (const originFeatName of originFeatNames) {
    const lowerFeat = originFeatName.toLowerCase();
    featOccurrences[lowerFeat] = (featOccurrences[lowerFeat] ?? 0) + 1;
    const occurrence = featOccurrences[lowerFeat];
    // First occurrence = background overrides, second = species overrides
    const overrides = occurrence === 1 ? state.originFeatOverrides : state.speciesOriginFeatOverrides;

    const originFeat = getFeat(originFeatName);
    if (originFeat) {
      additionalFeatures.push({
        name: originFeatName,
        description: entriesToText(originFeat.entries),
        source: "feat",
        sourceLabel: occurrence === 1 ? (bgData?.name ?? "Background") : (state.species ?? "Species"),
      });
    }

    if (lowerFeat.startsWith("magic initiate") && overrides.cantrips) {
      for (const cantripName of overrides.cantrips) {
        const db = getSpell(cantripName);
        if (db) {
          spells.push(spellFromDb(db, {
            name: cantripName, level: 0, prepared: true, alwaysPrepared: true,
            spellSource: "feat" as const, knownByClass: false,
          }));
        }
      }
      if (overrides.spell) {
        const db = getSpell(overrides.spell);
        if (db) {
          spells.push(spellFromDb(db, {
            name: overrides.spell, level: 1, prepared: true,
            alwaysPrepared: true, spellSource: "feat" as const, knownByClass: false,
          }));
        }
      }
    }
    if (lowerFeat === "skilled" && overrides.skillChoices) {
      allSkills.push(...overrides.skillChoices);
    }
    if ((lowerFeat === "skilled" || lowerFeat === "crafter" || lowerFeat === "musician") &&
        overrides.toolChoices) {
      toolProficiencies.push(...overrides.toolChoices);
    }
  }

  // Species lineage spells
  const lineageSpells = getSpeciesSpells(state);
  spells.push(...lineageSpells);

  // Deduplicate skills
  const uniqueSkills = [...new Set(allSkills)];

  // Jack of All Trades: Bard level 2+
  let skillBonuses: Map<string, number> | undefined;
  const bardEntry = state.classes.find(c => c.className.toLowerCase() === "bard");
  if (bardEntry && bardEntry.level >= 2) {
    const totalLevel = getTotalLevel(state.classes);
    const halfProf = Math.floor((Math.ceil(totalLevel / 4) + 1) / 2);
    const profSet = new Set(uniqueSkills);
    skillBonuses = new Map();
    for (const skillSlug of Object.keys(SKILL_ABILITY_MAP)) {
      if (!profSet.has(skillSlug)) {
        skillBonuses.set(skillSlug, halfProf);
      }
    }
  }

  return {
    name,
    race: speciesData?.name ?? state.species ?? "Unknown",
    classes: classEntries,
    background: bgData?.name,
    abilities: finalAbilities,
    maxHP: computeMulticlassHP(state.classes, conMod),
    skillProficiencies: uniqueSkills,
    skillExpertise: state.skillExpertise,
    skillBonuses,
    saveProficiencies: [...new Set(saveProficiencies)],
    spells,
    equipment,
    languages,
    toolProficiencies,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    traits: Object.keys(state.traits).length > 0 ? state.traits as any : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appearance: Object.keys(state.appearance).length > 0 ? state.appearance as any : undefined,
    currency,
    additionalFeatures: additionalFeatures.length > 0 ? additionalFeatures : undefined,
    source: "builder",
  };
}

// ─── Step Validation ────────────────────────────────────

export function isStepValid(state: BuilderState, step: BuilderStep): boolean {
  switch (step) {
    case "species":
      return state.species !== null;
    case "background":
      return state.background !== null;
    case "class":
      return state.classes.length > 0;
    case "abilities": {
      if (state.abilityMethod === "standard-array") {
        const values = Object.values(state.baseAbilities);
        const sorted = [...values].sort((a, b) => b - a);
        const stdSorted = [...STANDARD_ARRAY].sort((a, b) => b - a);
        return JSON.stringify(sorted) === JSON.stringify(stdSorted);
      }
      if (state.abilityMethod === "point-buy") {
        const cost = getPointBuyCost(state.baseAbilities);
        return cost <= POINT_BUY_POOL &&
          Object.values(state.baseAbilities).every((v) => v >= 8 && v <= 15);
      }
      return Object.values(state.baseAbilities).every((v) => v > 0);
    }
    case "feats": {
      if (state.classes.length === 0) return false;
      const allAsiLevels = getASILevelsForClasses(
        state.classes.map((c, i) => ({ className: c.className, level: c.level, classIndex: i }))
      );
      if (allAsiLevels.length === 0) return true;
      return allAsiLevels.every(({ classIndex, level }) => {
        const sel = state.asiSelections.find(s => s.classIndex === classIndex && s.level === level);
        if (!sel) return false;
        if (sel.type === "asi") {
          if (!sel.asiChoice) return false;
          const total = Object.values(sel.asiChoice.abilities).reduce((s, v) => s + (v ?? 0), 0);
          return total === 2;
        }
        return !!sel.featName;
      });
    }
    case "skills": {
      if (state.classes.length === 0) return false;
      const primaryCls = getClass(state.classes[0].className);
      if (!primaryCls) return false;
      return state.skillProficiencies.length === (getSkillChoices(primaryCls)?.count ?? 0);
    }
    case "spells": {
      if (state.classes.length === 0) return true;
      if (!hasAnyCaster(state.classes)) return true;
      // Check cantrip counts per class
      for (const classEntry of state.classes) {
        if (!isCasterClass(classEntry.className)) continue;
        const maxCantrips = getCantripsKnown(classEntry.className, classEntry.level);
        const sel = state.spellSelections[classEntry.className];
        if (sel && sel.cantrips.length > maxCantrips) return false;
      }
      return true;
    }
    case "equipment":
    case "details":
    case "review":
      return true;
  }
}

/** Returns true if a step has meaningful data entered */
export function isStepTouched(state: BuilderState, step: BuilderStep): boolean {
  switch (step) {
    case "species":
      return state.species !== null;
    case "background":
      return state.background !== null;
    case "class":
      return state.classes.length > 0;
    case "abilities": {
      const defaultVal = state.abilityMethod === "standard-array" ? 0 : state.abilityMethod === "point-buy" ? 8 : 10;
      return !Object.values(state.baseAbilities).every((v) => v === defaultVal) ||
        Object.keys(state.asiAssignments).length > 0;
    }
    case "feats":
      return state.asiSelections.length > 0;
    case "skills":
      return state.skillProficiencies.length > 0;
    case "spells":
      return Object.values(state.spellSelections).some(
        sel => sel.cantrips.length > 0 || sel.spells.length > 0
      );
    case "equipment":
      return state.equipment.length > 0;
    case "details":
      return !!(state.name.trim() || state.nameFromSpeciesStep.trim() ||
        state.alignment || state.backstory);
    case "review":
      return false;
  }
}

export function getStepsToSkip(state: BuilderState): Set<BuilderStep> {
  const skip = new Set<BuilderStep>();
  if (state.classes.length > 0 && !hasAnyCaster(state.classes)) {
    skip.add("spells");
  }
  const totalLevel = getTotalLevel(state.classes);
  if (totalLevel < 4) {
    skip.add("feats");
  }
  return skip;
}

// ─── Starting Equipment Presets ──────────────────────────

export function resolveStartingEquipment(className: string, choice: "A" | "B"): { items: EquipmentEntry[]; currency: Currency } {
  const cls = getClass(className);
  if (!cls?.startingEquipment?.defaultData?.[0]) return { items: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } };

  const data = cls.startingEquipment.defaultData[0];
  const entries = (data[choice] ?? []) as { item?: string; quantity?: number; value?: number; equipmentType?: string }[];
  const items: EquipmentEntry[] = [];
  const currency: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

  for (const entry of entries) {
    if (entry.value != null) {
      // Value is in copper pieces — convert to gold
      currency.gp += Math.floor(entry.value / 100);
      const remainder = entry.value % 100;
      if (remainder >= 10) currency.sp += Math.floor(remainder / 10);
      if (remainder % 10 > 0) currency.cp += remainder % 10;
    } else if (entry.item) {
      const itemName = entry.item.split("|")[0];
      const baseItem = getBaseItem(itemName);
      const displayName = baseItem?.name ?? itemName.charAt(0).toUpperCase() + itemName.slice(1);
      const isWeapon = baseItem?.weapon === true;
      const isArmor = baseItem?.armor === true;
      const isShield = baseItem?.type?.split("|")[0] === "S";
      items.push({
        name: displayName,
        quantity: entry.quantity ?? 1,
        equipped: isWeapon || isArmor || isShield,
        source: isWeapon ? "weapon" : (isArmor || isShield) ? "armor" : "gear",
      });
    } else if (entry.equipmentType) {
      // Generic equipment type (e.g., "instrumentMusical") — skip, player picks manually
    }
  }

  return { items, currency };
}

export function getStartingEquipmentDescription(className: string): { A: string; B: string } | null {
  const cls = getClass(className);
  if (!cls?.startingEquipment) return null;
  const se = cls.startingEquipment as unknown as { entries?: string[] };
  if (!se.entries?.length) return null;

  const text = se.entries[0];
  if (typeof text !== "string") return null;

  // Strip {@tag ...} markup
  const strip = (s: string) => s.replace(/\{@\w+\s+([^|}]+?)(?:\|[^}]*)?\}/g, "$1").trim();
  // Parse the entries format: "{@i Choose A, B, or C:} (A) ...; (B) ...; or (C) ..."
  // Also handles two-option format: "(A) ...; or (B) ..."
  const matchThree = text.match(/\(A\)\s*([\s\S]+?);\s*\(B\)\s*([\s\S]+?);\s*or\s*\(C\)\s*([\s\S]+)/);
  if (matchThree) return { A: strip(matchThree[1]), B: strip(matchThree[2]) };
  const matchTwo = text.match(/\(A\)\s*([\s\S]+?);\s*or\s*\(B\)\s*([\s\S]+)/);
  if (matchTwo) return { A: strip(matchTwo[1]), B: strip(matchTwo[2]) };
  return { A: strip(text), B: "" };
}

// ─── Skill Names ────────────────────────────────────────

export const SKILL_ABILITY_MAP: Record<string, keyof AbilityScores> = {
  athletics: "strength",
  acrobatics: "dexterity",
  "sleight-of-hand": "dexterity",
  stealth: "dexterity",
  arcana: "intelligence",
  history: "intelligence",
  investigation: "intelligence",
  nature: "intelligence",
  religion: "intelligence",
  "animal-handling": "wisdom",
  insight: "wisdom",
  medicine: "wisdom",
  perception: "wisdom",
  survival: "wisdom",
  deception: "charisma",
  intimidation: "charisma",
  performance: "charisma",
  persuasion: "charisma",
};

export const ALL_SKILLS = Object.keys(SKILL_ABILITY_MAP);

export function formatSkillName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Subclass Deduplication ─────────────────────────────

export function deduplicateSubclasses(
  subclasses: { name: string; source: string }[]
): { name: string; source: string }[] {
  const byName = new Map<string, { name: string; source: string }>();
  for (const sc of subclasses) {
    const existing = byName.get(sc.name.toLowerCase());
    if (!existing || sc.source.toLowerCase().includes("xphb")) {
      byName.set(sc.name.toLowerCase(), sc);
    }
  }
  return [...byName.values()];
}

// ─── Alignment Options ──────────────────────────────────

export const ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
];

