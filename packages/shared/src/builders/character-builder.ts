/**
 * Shared character builder — single source of truth for D&D mechanics.
 *
 * Parsers extract CharacterIdentifiers (player choices), then delegate to
 * buildCharacter() which computes everything else from the D&D 2024 database.
 */

import type {
  CharacterData,
  CharacterStaticData,
  CharacterDynamicData,
  CharacterFeature,
  CombatBonus,
  ClassResource,
  ProficiencyGroup,
  SkillProficiency,
  SavingThrowProficiency,
  SpellSlotLevel,
  AbilityScores,
} from "../types/character";
import type { CharacterIdentifiers } from "./types";
import {
  getClass,
  getSpecies,
  getSpell,
  getFeat,
  getBaseItem,
  getClassFeatures,
  getCasterMultiplier,
  THIRD_CASTER_SLOTS,
} from "../data/index";
import { SKILL_ABILITY_MAP } from "../utils/5etools";

// ─── Class Resource Template (local, builder-only) ────────

interface ClassResourceTemplate {
  name: string;
  levelAvailable: number;
  resetType: "long" | "short";
  uses: number | { abilityMod: string; minimum?: number };
  usesTable?: Record<number, number>;
}

const CLASS_RESOURCES: Record<string, ClassResourceTemplate[]> = {
  barbarian: [
    {
      name: "Rage",
      levelAvailable: 1,
      resetType: "long",
      uses: 2,
      usesTable: { 1: 2, 3: 3, 6: 4, 17: 5, 20: 6 },
    },
  ],
  bard: [
    {
      name: "Bardic Inspiration",
      levelAvailable: 1,
      resetType: "short",
      uses: { abilityMod: "cha", minimum: 1 },
    },
  ],
  cleric: [
    {
      name: "Channel Divinity",
      levelAvailable: 1,
      resetType: "short",
      uses: 1,
      usesTable: { 1: 1, 6: 2, 18: 3 },
    },
  ],
  druid: [
    { name: "Wild Shape", levelAvailable: 2, resetType: "short", uses: 2 },
    {
      name: "Channel Nature",
      levelAvailable: 1,
      resetType: "long",
      uses: 1,
      usesTable: { 1: 1, 6: 2, 18: 3 },
    },
  ],
  fighter: [
    {
      name: "Second Wind",
      levelAvailable: 1,
      resetType: "short",
      uses: 1,
      usesTable: { 1: 1, 2: 2, 9: 3, 13: 4, 17: 5 },
    },
    {
      name: "Action Surge",
      levelAvailable: 2,
      resetType: "short",
      uses: 1,
      usesTable: { 2: 1, 17: 2 },
    },
    {
      name: "Indomitable",
      levelAvailable: 9,
      resetType: "long",
      uses: 1,
      usesTable: { 9: 1, 13: 2, 17: 3 },
    },
  ],
  monk: [
    {
      name: "Focus Points",
      levelAvailable: 2,
      resetType: "short",
      uses: 2,
      usesTable: {
        2: 2,
        3: 3,
        4: 4,
        5: 5,
        6: 6,
        7: 7,
        8: 8,
        9: 9,
        10: 10,
        11: 11,
        12: 12,
        13: 13,
        14: 14,
        15: 15,
        16: 16,
        17: 17,
        18: 18,
        19: 19,
        20: 20,
      },
    },
  ],
  paladin: [
    {
      name: "Lay on Hands",
      levelAvailable: 1,
      resetType: "long",
      uses: 5,
      usesTable: {
        1: 5,
        2: 10,
        3: 15,
        4: 20,
        5: 25,
        6: 30,
        7: 35,
        8: 40,
        9: 45,
        10: 50,
        11: 55,
        12: 60,
        13: 65,
        14: 70,
        15: 75,
        16: 80,
        17: 85,
        18: 90,
        19: 95,
        20: 100,
      },
    },
    {
      name: "Channel Divinity",
      levelAvailable: 3,
      resetType: "long",
      uses: 1,
      usesTable: { 3: 1, 11: 2, 15: 3 },
    },
  ],
  ranger: [],
  rogue: [],
  sorcerer: [
    {
      name: "Sorcery Points",
      levelAvailable: 2,
      resetType: "long",
      uses: 2,
      usesTable: {
        2: 2,
        3: 3,
        4: 4,
        5: 5,
        6: 6,
        7: 7,
        8: 8,
        9: 9,
        10: 10,
        11: 11,
        12: 12,
        13: 13,
        14: 14,
        15: 15,
        16: 16,
        17: 17,
        18: 18,
        19: 19,
        20: 20,
      },
    },
  ],
  warlock: [],
  wizard: [{ name: "Arcane Recovery", levelAvailable: 1, resetType: "long", uses: 1 }],
};

function getClassResources(className: string): ClassResourceTemplate[] {
  return CLASS_RESOURCES[className.toLowerCase()] ?? [];
}

// ─── Helpers ─────────────────────────────────────────────

function getAbilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

// Multiclass spell slot table (caster levels 1-20) — from PHB
const MULTICLASS_SPELL_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Third-caster subclasses that grant spellcasting */
const THIRD_CASTER_SUBCLASSES = new Set(["eldritch knight", "arcane trickster"]);

// Spellcasting ability by class name (derived from 5e.tools additionalSpells/casterProgression)
const CLASS_SPELLCASTING_ABILITY: Record<string, keyof AbilityScores> = {
  bard: "charisma",
  cleric: "wisdom",
  druid: "wisdom",
  paladin: "charisma",
  ranger: "wisdom",
  sorcerer: "charisma",
  warlock: "charisma",
  wizard: "intelligence",
};

// ─── Main Builder ────────────────────────────────────────

export function buildCharacter(ids: CharacterIdentifiers): {
  character: CharacterData;
  warnings: string[];
} {
  const warnings: string[] = [];

  const totalLevel = ids.classes.reduce((sum, c) => sum + c.level, 0);
  const proficiencyBonus = Math.ceil(totalLevel / 4) + 1;

  // === HP adjustments from feats/species ===
  let maxHP = ids.maxHP;
  const featureNames = new Set((ids.additionalFeatures ?? []).map((f) => f.name.toLowerCase()));
  if (featureNames.has("tough")) {
    maxHP += 2 * totalLevel;
  }
  // Dwarven Toughness
  const speciesLowerForHP = ids.race.toLowerCase().replace(/\s*\(.*\)/, "");
  if (speciesLowerForHP === "dwarf") {
    maxHP += totalLevel;
  }

  // === AC ===
  const armorClass = ids.armorClass ?? computeArmorClass(ids);

  // === Speed ===
  const speed = ids.speed ?? computeSpeed(ids, featureNames);

  // === Skills ===
  const skills = computeSkills(ids);

  // === Saving Throws ===
  const savingThrows = computeSavingThrows(ids);

  // === Spellcasting ===
  const spellcasting = computeSpellcasting(ids, proficiencyBonus);

  // === Spell Slots ===
  const { regularSlots, pactSlots } = computeSpellSlots(ids);

  // === Enrich Spells ===
  const spells = ids.spells.map((spell) => {
    const dbSpell = getSpell(spell.name);
    if (dbSpell) {
      return {
        ...spell,
        description: spell.description || dbSpell.description,
        school: spell.school || dbSpell.school,
        castingTime: spell.castingTime || dbSpell.castingTime,
        range: spell.range || dbSpell.range,
        components: spell.components || dbSpell.components,
        duration: spell.duration || dbSpell.duration,
        concentration: spell.concentration ?? dbSpell.concentration,
        ritual: spell.ritual ?? dbSpell.ritual,
      };
    }
    return spell;
  });

  // === Features ===
  const features = computeFeatures(ids, warnings);

  // === Class Resources ===
  const classResources = computeClassResources(ids);

  // === Proficiencies ===
  const proficiencies = computeProficiencies(ids);

  // === Senses ===
  const senses = computeSenses(ids, proficiencyBonus, skills);

  const speciesName = ids.race;

  const staticData: CharacterStaticData = {
    name: ids.name,
    species: speciesName,
    race: speciesName, // legacy alias
    classes: ids.classes,
    abilities: ids.abilities,
    maxHP: Math.max(1, maxHP),
    armorClass,
    proficiencyBonus,
    speed,
    features,
    classResources,
    proficiencies,
    skills,
    savingThrows,
    senses,
    languages: ids.languages,
    spells,
    spellcastingAbility: spellcasting.spellcastingAbility,
    spellSaveDC: spellcasting.spellSaveDC,
    spellAttackBonus: spellcasting.spellAttackBonus,
    combatBonuses: computeCombatBonuses(ids, proficiencyBonus),
    advantages: ids.advantages ?? [],
    traits: ids.traits ?? {},
    appearance: ids.appearance,
    backstory: ids.backstory || undefined,
    importedAt: Date.now(),
    source: ids.source,
  };

  const dynamicData: CharacterDynamicData = {
    currentHP: staticData.maxHP,
    tempHP: 0,
    spellSlotsUsed: regularSlots,
    pactMagicSlots: pactSlots,
    resourcesUsed: {},
    conditions: [],
    deathSaves: { successes: 0, failures: 0 },
    inventory: ids.equipment,
    currency: ids.currency ?? { cp: 0, sp: 0, gp: 0, pp: 0 },
    heroicInspiration: false,
  };

  return {
    character: { static: staticData, dynamic: dynamicData },
    warnings,
  };
}

// ─── AC Computation ──────────────────────────────────────

function computeArmorClass(ids: CharacterIdentifiers): number {
  const dexMod = getAbilityMod(ids.abilities.dexterity);
  const conMod = getAbilityMod(ids.abilities.constitution);
  const wisMod = getAbilityMod(ids.abilities.wisdom);

  // Find equipped armor and shields from equipment
  let baseAC = 10 + dexMod;
  let hasBodyArmor = false;
  let hasShield = false;

  for (const item of ids.equipment) {
    if (!item.equipped) continue;
    if (item.type === "Shield") {
      hasShield = true;
      continue;
    }
    if (item.type === "Armor" && item.name) {
      const baseItem = getBaseItem(item.name);
      if (baseItem?.armor && baseItem.ac != null) {
        hasBodyArmor = true;
        const typeCode = baseItem.type?.split("|")[0];
        switch (typeCode) {
          case "LA": // Light armor
            baseAC = baseItem.ac + dexMod;
            break;
          case "MA": // Medium armor
            baseAC = baseItem.ac + Math.min(dexMod, 2);
            break;
          case "HA": // Heavy armor
            baseAC = baseItem.ac;
            break;
        }
      } else if (!baseItem && item.armorClass) {
        // Fallback to item's AC if not found in DB
        hasBodyArmor = true;
        baseAC = item.armorClass + dexMod; // assume light
      }
    }
  }

  // Unarmored Defense
  if (!hasBodyArmor) {
    const classNames = ids.classes.map((c) => c.name.toLowerCase());
    if (classNames.includes("barbarian")) {
      baseAC = Math.max(baseAC, 10 + dexMod + conMod);
    }
    if (classNames.includes("monk") && !hasShield) {
      baseAC = Math.max(baseAC, 10 + dexMod + wisMod);
    }
    // Draconic Resilience (Sorcerer with Draconic subclass)
    if (
      ids.classes.some(
        (c) =>
          c.name.toLowerCase() === "sorcerer" && c.subclass?.toLowerCase()?.includes("draconic"),
      )
    ) {
      baseAC = Math.max(baseAC, 13 + dexMod);
    }
  }

  if (hasShield) {
    baseAC += 2;
  }

  // Defense fighting style: +1 AC when wearing armor
  if (hasBodyArmor) {
    const featNames = (ids.additionalFeatures ?? []).map((f) => f.name.toLowerCase());
    if (featNames.includes("defense") || featNames.includes("fighting style: defense")) {
      baseAC += 1;
    }
  }

  return baseAC;
}

// ─── Speed Computation ───────────────────────────────────

function computeSpeed(ids: CharacterIdentifiers, featureNames: Set<string>): number {
  // Look up species base speed
  const speciesLower = ids.race.toLowerCase().replace(/\s*\(.*\)/, "");
  const speciesData = getSpecies(speciesLower);
  let speed = speciesData ? speciesData.speed : 30;

  const totalLevel = ids.classes.reduce((sum, c) => sum + c.level, 0);
  const classNames = ids.classes.map((c) => c.name.toLowerCase());

  // Barbarian Fast Movement (+10 at level 5+)
  if (classNames.includes("barbarian") && totalLevel >= 5) {
    speed += 10;
  }

  // Monk Unarmored Movement
  const monkClass = ids.classes.find((c) => c.name.toLowerCase() === "monk");
  if (monkClass && monkClass.level >= 2) {
    const lvl = monkClass.level;
    const monkBonus = lvl >= 18 ? 30 : lvl >= 14 ? 25 : lvl >= 10 ? 20 : lvl >= 6 ? 15 : 10;
    speed += monkBonus;
  }

  // Feat-based speed bonuses
  if (featureNames.has("mobile")) speed += 10;
  if (featureNames.has("speedy")) speed += 10;
  if (featureNames.has("squat nimbleness")) speed += 5;

  return speed;
}

// ─── Skills Computation ──────────────────────────────────

function computeSkills(ids: CharacterIdentifiers): SkillProficiency[] {
  const profSet = new Set(ids.skillProficiencies);
  const expertiseSet = new Set(ids.skillExpertise);

  return Object.entries(SKILL_ABILITY_MAP).map(([skillSlug, ability]) => ({
    name: skillSlug,
    ability,
    proficient: profSet.has(skillSlug),
    expertise: expertiseSet.has(skillSlug),
    bonus: ids.skillBonuses?.get(skillSlug) || undefined,
  }));
}

// ─── Saving Throws ───────────────────────────────────────

function computeSavingThrows(ids: CharacterIdentifiers): SavingThrowProficiency[] {
  const profSet = new Set(ids.saveProficiencies);

  const abilityList: (keyof AbilityScores)[] = [
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
  ];

  return abilityList.map((ability) => ({
    ability,
    proficient: profSet.has(ability),
    bonus: ids.saveBonuses?.get(ability) || undefined,
  }));
}

// ─── Spellcasting ────────────────────────────────────────

function computeSpellcasting(
  ids: CharacterIdentifiers,
  proficiencyBonus: number,
): {
  spellcastingAbility?: keyof AbilityScores;
  spellSaveDC?: number;
  spellAttackBonus?: number;
} {
  // Find the highest-level class that can cast spells
  let bestAbility: keyof AbilityScores | undefined;
  let bestLevel = 0;

  for (const cls of ids.classes) {
    const classData = getClass(cls.name);
    const clsLower = cls.name.toLowerCase();

    // Check for spellcasting ability from our map
    const scAbility = CLASS_SPELLCASTING_ABILITY[clsLower];
    if (scAbility && classData?.casterProgression) {
      if (cls.level > bestLevel) {
        bestAbility = scAbility;
        bestLevel = cls.level;
      }
      continue;
    }

    // Check for third-caster subclasses
    const subLc = (cls.subclass ?? "").toLowerCase();
    if (THIRD_CASTER_SUBCLASSES.has(subLc)) {
      if (cls.level > bestLevel) {
        bestAbility = "intelligence";
        bestLevel = cls.level;
      }
    }
  }

  if (!bestAbility) return {};

  const mod = getAbilityMod(ids.abilities[bestAbility]);
  return {
    spellcastingAbility: bestAbility,
    spellSaveDC: 8 + proficiencyBonus + mod,
    spellAttackBonus: proficiencyBonus + mod,
  };
}

// ─── Spell Slots ─────────────────────────────────────────

function getClassSpellSlotsFromData(className: string, level: number): number[] {
  const cls = getClass(className);
  if (!cls) return [];

  const slotTable = cls.spellSlotTable;
  if (slotTable && level >= 1 && level <= slotTable.length) {
    return slotTable[level - 1];
  }

  return [];
}

function computeSpellSlots(ids: CharacterIdentifiers): {
  regularSlots: SpellSlotLevel[];
  pactSlots: SpellSlotLevel[];
} {
  const regularSlots: SpellSlotLevel[] = [];
  const pactSlots: SpellSlotLevel[] = [];

  // Separate warlock from non-warlock caster classes
  const casterClasses: { name: string; level: number; subclass?: string }[] = [];
  let warlockLevel = 0;

  for (const cls of ids.classes) {
    const lc = cls.name.toLowerCase();
    if (lc === "warlock") {
      warlockLevel = cls.level;
      continue;
    }
    const classData = getClass(cls.name);
    const subLc = (cls.subclass ?? "").toLowerCase();
    if (classData?.casterProgression || THIRD_CASTER_SUBCLASSES.has(subLc)) {
      casterClasses.push(cls);
    }
  }

  // Warlock pact magic
  if (warlockLevel > 0) {
    const slots = getClassSpellSlotsFromData("Warlock", warlockLevel);
    if (slots && slots.length > 0) {
      for (let i = slots.length - 1; i >= 0; i--) {
        if (slots[i] > 0) {
          pactSlots.push({ level: i + 1, total: slots[i], used: 0 });
          break;
        }
      }
    }
  }

  if (casterClasses.length === 0) {
    return { regularSlots, pactSlots };
  }

  let slotRow: number[] | undefined;

  if (casterClasses.length === 1) {
    // Single caster class
    const cls = casterClasses[0];
    const subLc = (cls.subclass ?? "").toLowerCase();

    if (THIRD_CASTER_SUBCLASSES.has(subLc)) {
      slotRow = THIRD_CASTER_SLOTS[cls.level] ?? [];
    } else {
      slotRow = getClassSpellSlotsFromData(cls.name, cls.level);
    }
  } else {
    // Multiclass: compute weighted caster level
    let combinedCasterLevel = 0;
    for (const cls of casterClasses) {
      const lc = cls.name.toLowerCase();
      const multiplier = getCasterMultiplier(lc);
      const subLc = (cls.subclass ?? "").toLowerCase();
      const thirdCasterMult = THIRD_CASTER_SUBCLASSES.has(subLc) ? 1 / 3 : 0;
      combinedCasterLevel += cls.level * (multiplier || thirdCasterMult);
    }
    const effectiveLevel = Math.min(Math.max(Math.floor(combinedCasterLevel), 1), 20);
    slotRow = MULTICLASS_SPELL_SLOTS[effectiveLevel - 1];
  }

  if (slotRow) {
    for (let i = 0; i < slotRow.length; i++) {
      if (slotRow[i] > 0) {
        regularSlots.push({ level: i + 1, total: slotRow[i], used: 0 });
      }
    }
  }

  return { regularSlots, pactSlots };
}

// ─── Combat Bonuses ─────────────────────────────────────

function computeCombatBonuses(ids: CharacterIdentifiers, proficiencyBonus: number): CombatBonus[] {
  const bonuses: CombatBonus[] = [];
  const featNames = (ids.additionalFeatures ?? []).map((f) => f.name.toLowerCase());

  // Archery: +2 to ranged attack rolls
  if (featNames.includes("archery")) {
    bonuses.push({ type: "attack", value: 2, attackType: "ranged", source: "Archery" });
  }

  // Alert: add proficiency bonus to initiative rolls
  if (featNames.includes("alert")) {
    bonuses.push({ type: "initiative", value: proficiencyBonus, source: "Alert" });
  }

  // Dueling: +2 melee damage (conditional — stored for DM visibility)
  if (featNames.includes("dueling")) {
    bonuses.push({
      type: "damage",
      value: 2,
      attackType: "melee",
      source: "Dueling",
      condition: "holding a melee weapon in one hand and no other weapons",
    });
  }

  // Thrown Weapon Fighting: +2 ranged damage with thrown weapons (conditional)
  if (featNames.includes("thrown weapon fighting")) {
    bonuses.push({
      type: "damage",
      value: 2,
      attackType: "ranged",
      source: "Thrown Weapon Fighting",
      condition: "thrown weapon ranged attacks only",
    });
  }

  return bonuses;
}

// ─── Features ────────────────────────────────────────────

function computeFeatures(ids: CharacterIdentifiers, _warnings: string[]): CharacterFeature[] {
  const features: CharacterFeature[] = [];
  const seen = new Set<string>();

  const addFeature = (f: CharacterFeature) => {
    if (!seen.has(f.name)) {
      seen.add(f.name);
      features.push(f);
    }
  };

  // Parser-provided features first (they may have richer data)
  if (ids.additionalFeatures) {
    for (const f of ids.additionalFeatures) {
      addFeature(f);
    }
  }

  // Class features from DB (now using Entry[] → text)
  for (const cls of ids.classes) {
    const dbFeatures = getClassFeatures(cls.name, cls.level);
    for (const dbf of dbFeatures) {
      addFeature({
        name: dbf.name,
        description: dbf.description,
        source: "class",
        sourceLabel: cls.name,
        requiredLevel: dbf.level,
      });
    }

    // Subclass features from assembled data
    if (cls.subclass && !seen.has(cls.subclass)) {
      const classData = getClass(cls.name);
      const subclassData = classData?.subclasses.find(
        (s: { name: string; shortName: string }) =>
          s.name.toLowerCase() === cls.subclass!.toLowerCase() ||
          s.shortName.toLowerCase() === cls.subclass!.toLowerCase(),
      );
      if (subclassData) {
        for (const sf of subclassData.features) {
          if (sf.level <= cls.level) {
            addFeature({
              name: sf.name,
              description: sf.description,
              source: "class",
              sourceLabel: `${cls.name} (${cls.subclass})`,
              requiredLevel: sf.level,
            });
          }
        }
      }
      if (!seen.has(cls.subclass)) {
        addFeature({
          name: cls.subclass,
          description: `${cls.name} subclass`,
          source: "class",
          sourceLabel: cls.name,
          requiredLevel: 3,
        });
      }
    }
  }

  // Feat features from DB
  for (const feat of ids.additionalFeatures?.filter((f) => f.source === "feat") ?? []) {
    const dbFeat = getFeat(feat.name);
    if (dbFeat && (!feat.description || feat.description === feat.name)) {
      // Enrich with DB description
      const idx = features.findIndex((f) => f.name === feat.name);
      if (idx >= 0) {
        features[idx] = { ...features[idx], description: dbFeat.description };
      }
    }
  }

  // Species traits from DB
  const speciesLower = ids.race.toLowerCase().replace(/\s*\(.*\)/, "");
  const speciesData = getSpecies(speciesLower);
  if (speciesData?.description) {
    addFeature({
      name: ids.race,
      description: speciesData.description,
      source: "race",
      sourceLabel: ids.race,
    });
  }

  return features;
}

// ─── Class Resources ─────────────────────────────────────

function computeClassResources(ids: CharacterIdentifiers): ClassResource[] {
  const resources: ClassResource[] = [];
  const seen = new Set<string>();
  const totalLevel = ids.classes.reduce((sum, c) => sum + c.level, 0);
  const proficiencyBonus = Math.ceil(totalLevel / 4) + 1;

  for (const cls of ids.classes) {
    const templates = getClassResources(cls.name);

    for (const template of templates) {
      if (cls.level < template.levelAvailable) continue;
      if (seen.has(template.name)) continue;
      seen.add(template.name);

      const maxUses = resolveResourceUses(template, cls.level, ids.abilities);
      if (maxUses <= 0) continue;

      resources.push({
        name: template.name,
        maxUses,
        resetType: template.resetType,
        source: cls.name,
      });
    }
  }

  // Lucky feat: PB luck points, long rest
  const featureNames = (ids.additionalFeatures ?? []).map((f) => f.name.toLowerCase());
  if (featureNames.includes("lucky") && !seen.has("Luck Points")) {
    resources.push({
      name: "Luck Points",
      maxUses: proficiencyBonus,
      resetType: "long",
      source: "Lucky",
    });
  }

  return resources;
}

function resolveResourceUses(
  template: ClassResourceTemplate,
  level: number,
  abilities: AbilityScores,
): number {
  // Check usesTable: find the highest level entry at or below current level
  if (template.usesTable) {
    const applicableLevels = Object.keys(template.usesTable)
      .map(Number)
      .filter((l) => l <= level)
      .sort((a, b) => b - a);
    if (applicableLevels.length > 0) {
      return template.usesTable[applicableLevels[0]];
    }
  }

  // Resolve uses value
  if (typeof template.uses === "number") {
    return template.uses;
  }

  // Ability modifier-based uses
  const abilityKey = template.uses.abilityMod.toLowerCase() as keyof AbilityScores;
  const mod = getAbilityMod(abilities[abilityKey] ?? 10);
  const minimum = template.uses.minimum ?? 1;
  return Math.max(minimum, mod);
}

// ─── Proficiencies ───────────────────────────────────────

function computeProficiencies(ids: CharacterIdentifiers): ProficiencyGroup {
  // If parser provided explicit proficiencies, use those
  if (ids.armorProficiencies || ids.weaponProficiencies) {
    return {
      armor: ids.armorProficiencies ?? [],
      weapons: ids.weaponProficiencies ?? [],
      tools: ids.toolProficiencies ?? [],
      other: ids.otherProficiencies ?? [],
    };
  }

  // Compute from DB using 5e.tools utility functions
  const armorSet = new Set<string>();
  const weaponSet = new Set<string>();

  for (const cls of ids.classes) {
    const classData = getClass(cls.name);
    if (!classData) continue;
    for (const a of classData.armorProficiencies) armorSet.add(a);
    for (const w of classData.weaponProficiencies) weaponSet.add(w);
  }

  return {
    armor: [...armorSet],
    weapons: [...weaponSet],
    tools: ids.toolProficiencies ?? [],
    other: ids.otherProficiencies ?? [],
  };
}

// ─── Senses ──────────────────────────────────────────────

function computeSenses(
  ids: CharacterIdentifiers,
  proficiencyBonus: number,
  skills: SkillProficiency[],
): string[] {
  // If parser provided custom senses, use those directly
  if (ids.senses) return ids.senses;

  const senses: string[] = [];
  const wisMod = getAbilityMod(ids.abilities.wisdom);

  // Darkvision from species
  const speciesLower = ids.race.toLowerCase().replace(/\s*\(.*\)/, "");
  const speciesData = getSpecies(speciesLower);
  if (speciesData?.darkvision) {
    senses.push(`Darkvision ${speciesData.darkvision} ft.`);
  }

  // Passive Perception
  const perceptionSkill = skills.find((s) => s.name === "perception");
  let passivePerception = 10 + wisMod;
  if (perceptionSkill?.proficient) {
    passivePerception += proficiencyBonus;
    if (perceptionSkill.expertise) {
      passivePerception += proficiencyBonus;
    }
  }
  if (perceptionSkill?.bonus) {
    passivePerception += perceptionSkill.bonus;
  }
  senses.push(`Passive Perception ${passivePerception}`);

  return senses;
}
