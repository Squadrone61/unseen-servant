/**
 * D&D Beyond character JSON parser.
 * Normalizes the DDB v5 API response into our CharacterData format.
 *
 * Computation logic based on ddb2alchemy (MIT license) by Alchemy RPG:
 * https://github.com/alchemyrpg/ddb2alchemy
 */

import type {
  CharacterData,
  CharacterStaticData,
  CharacterDynamicData,
  CharacterClass,
  CharacterSpell,
  CharacterFeature,
  ClassResource,
  ProficiencyGroup,
  AdvantageEntry,
  SpellSlotLevel,
  InventoryItem,
  AbilityScores,
  Currency,
  CharacterTraits,
  SkillProficiency,
  SavingThrowProficiency,
} from "@aidnd/shared/types";


// DDB stat IDs → ability score keys
const STAT_ID_MAP: Record<number, keyof AbilityScores> = {
  1: "strength",
  2: "dexterity",
  3: "constitution",
  4: "intelligence",
  5: "wisdom",
  6: "charisma",
};

// Ability score → modifier (scores 1–30). From ddb2alchemy.
const STAT_BONUS: Record<number, number> = {
  1: -5, 2: -4, 3: -4, 4: -3, 5: -3, 6: -2, 7: -2, 8: -1, 9: -1, 10: 0,
  11: 0, 12: 1, 13: 1, 14: 2, 15: 2, 16: 3, 17: 3, 18: 4, 19: 4, 20: 5,
  21: 5, 22: 6, 23: 6, 24: 7, 25: 7, 26: 8, 27: 8, 28: 9, 29: 9, 30: 10,
};

function getAbilityMod(score: number): number {
  return STAT_BONUS[Math.min(30, Math.max(1, score))] ?? Math.floor((score - 10) / 2);
}

// All 18 D&D 5e skills → governing ability
const SKILL_ABILITY_MAP: Record<string, keyof AbilityScores> = {
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

// Saving throw subType patterns
const SAVE_SUBTYPE_MAP: Record<string, keyof AbilityScores> = {
  "strength-saving-throws": "strength",
  "dexterity-saving-throws": "dexterity",
  "constitution-saving-throws": "constitution",
  "intelligence-saving-throws": "intelligence",
  "wisdom-saving-throws": "wisdom",
  "charisma-saving-throws": "charisma",
};

// DDB armor type IDs
const ARMOR_TYPE_LIGHT = 1;
const ARMOR_TYPE_MEDIUM = 2;
const ARMOR_TYPE_HEAVY = 3;
const ARMOR_TYPE_SHIELD = 4;

// DDB proficiency entityTypeId constants (from ddb2alchemy)
const PROF_ENTITY_ARMOR = 174869515;
const PROF_ENTITY_WEAPON = 1782728300;
const PROF_ENTITY_TOOL = 2103445194;

// Multiclass spell slot table (caster levels 1-20) — from PHB. From ddb2alchemy.
// Each row: [1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th]
const MULTICLASS_SPELL_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0], //  1
  [3, 0, 0, 0, 0, 0, 0, 0, 0], //  2
  [4, 2, 0, 0, 0, 0, 0, 0, 0], //  3
  [4, 3, 0, 0, 0, 0, 0, 0, 0], //  4
  [4, 3, 2, 0, 0, 0, 0, 0, 0], //  5
  [4, 3, 3, 0, 0, 0, 0, 0, 0], //  6
  [4, 3, 3, 1, 0, 0, 0, 0, 0], //  7
  [4, 3, 3, 2, 0, 0, 0, 0, 0], //  8
  [4, 3, 3, 3, 1, 0, 0, 0, 0], //  9
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // 10
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // 11
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // 12
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // 13
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // 14
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // 15
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // 16
  [4, 3, 3, 3, 2, 1, 1, 1, 1], // 17
  [4, 3, 3, 3, 3, 1, 1, 1, 1], // 18
  [4, 3, 3, 3, 3, 2, 1, 1, 1], // 19
  [4, 3, 3, 3, 3, 2, 2, 1, 1], // 20
];

// Class → caster level multiplier for multiclass computation. From ddb2alchemy.
const CASTER_LEVEL_MULTIPLIER: Record<string, number> = {
  bard: 1, cleric: 1, druid: 1, sorcerer: 1, wizard: 1,       // full casters
  artificer: 0.5, paladin: 0.5, ranger: 0.5,                    // half casters
  // Warlock uses Pact Magic (handled separately)
};

// Known/spontaneous casters: all learned spells are always available (no daily preparation).
// Prepared casters (cleric, druid, paladin, wizard, artificer) select spells daily.
const KNOWN_CASTER_CLASSES = new Set([
  "bard", "sorcerer", "ranger", "warlock",
]);

// DDB limitedUse resetType IDs → rest type
const DDB_RESET_TYPES: Record<number, "short" | "long" | null> = {
  1: null,    // other/special
  2: "short", // short rest
  3: "long",  // long rest
  4: "long",  // dawn (effectively long rest)
  5: null,    // day (treat as special)
  6: null,    // unknown
};

// DDB activation type IDs → human-readable
const ACTIVATION_TYPES: Record<number, string> = {
  1: "1 action",
  3: "1 bonus action",
  4: "1 reaction",
  6: "1 minute",
  7: "10 minutes",
  8: "1 hour",
  9: "8 hours",
  10: "24 hours",
};

// DDB duration type mapping
const DURATION_TYPES: Record<string, string> = {
  Instantaneous: "Instantaneous",
  Round: "round",
  Minute: "minute",
  Hour: "hour",
  Day: "day",
  Concentration: "Concentration",
  "Until Dispelled": "Until Dispelled",
  Special: "Special",
};


interface DDBModifier {
  type: string;
  subType?: string;
  value?: number | null;
  statId?: number | null;
  modifierTypeId?: number;
  modifierSubTypeId?: number;
  friendlyTypeName?: string;
  friendlySubtypeName?: string;
  restriction?: string;
  componentId?: number;
  componentTypeId?: number;
  entityTypeId?: number;
}

interface DDBClassInfo {
  definition: {
    name: string;
    spellCastingAbilityId?: number | null;
    canCastSpells?: boolean;
    spellRules?: {
      multiClassSpellSlotDivisor?: number;
      levelSpellSlots?: number[][];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  level: number;
  subclassDefinition?: {
    name: string;
    [key: string]: unknown;
  } | null;
  isStartingClass?: boolean;
}


/**
 * Filter all character modifiers by matching criteria.
 * Usage: getModifiers(char, { type: 'bonus', subType: 'armor-class' })
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getModifiers(char: any, criteria: Record<string, unknown>): DDBModifier[] {
  const modMap = char.modifiers || {};
  return (Object.values(modMap) as unknown[][])
    .flat()
    .filter((mod) => {
      const m = mod as Record<string, unknown>;
      return Object.entries(criteria).every(([key, val]) => m[key] === val);
    }) as DDBModifier[];
}

/**
 * Sum values of all modifiers matching criteria.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sumModifiers(char: any, criteria: Record<string, unknown>): number {
  return getModifiers(char, criteria).reduce(
    (sum, m) => sum + (m.value || 0),
    0
  );
}

/**
 * Get the highest value among matching modifiers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function maxModifier(char: any, criteria: Record<string, unknown>): number {
  return getModifiers(char, criteria).reduce(
    (max, m) => Math.max(max, m.value || 0),
    0
  );
}

/**
 * Gather all modifiers into a flat array (for functions that need the full list).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gatherModifiers(char: any): DDBModifier[] {
  const modMap = char.modifiers || {};
  return (Object.values(modMap) as unknown[][]).flat() as DDBModifier[];
}


/**
 * Parse raw DDB v5 JSON into our CharacterData format.
 * Accepts either the full API response (with .data wrapper) or the character object directly.
 */
export function parseDDBCharacter(raw: unknown): {
  character: CharacterData;
  warnings: string[];
} {
  const warnings: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let char: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawObj = raw as any;

  if (rawObj?.data?.name) {
    char = rawObj.data;
  } else if (rawObj?.name && rawObj?.race) {
    char = rawObj;
  } else {
    throw new Error(
      "Invalid D&D Beyond character JSON. Expected an object with character data."
    );
  }

  // === Basic Info ===
  const name: string = char.name || "Unknown Character";
  const race: string =
    char.race?.fullName ||
    char.race?.baseName ||
    char.race?.baseRaceName ||
    "Unknown Race";

  // === Classes ===
  const classes: CharacterClass[] = (char.classes || []).map(
    (c: DDBClassInfo) => ({
      name: c.definition?.name || "Unknown",
      level: c.level || 1,
      subclass: c.subclassDefinition?.name || undefined,
    })
  );
  if (classes.length === 0) {
    classes.push({ name: "Unknown", level: 1 });
    warnings.push("No class data found");
  }

  // === Ability Scores (ddb2alchemy getStatValue approach) ===
  const abilities = computeAbilityScores(char, warnings);

  // === Proficiency Bonus ===
  const totalLevel = classes.reduce((sum, c) => sum + c.level, 0);
  const proficiencyBonus = Math.ceil(totalLevel / 4) + 1;

  // === HP (ddb2alchemy getBaseHp/getMaxHp/getCurrentHp approach) ===
  const { maxHP, currentHP, tempHP } = computeHP(char, abilities);

  // === AC (ddb2alchemy getArmorClass approach) ===
  const armorClass = computeArmorClass(char, abilities);

  // === Speed (ddb2alchemy getSpeed approach) ===
  const speed = computeSpeed(char);

  // === Skills (ddb2alchemy getSkills approach) ===
  const skills = extractSkills(char, proficiencyBonus);

  // === Saving Throws ===
  const savingThrows = extractSavingThrows(char);

  // === Features ===
  const features = extractFeatures(char, classes);

  // === Actions (DDB stores activated abilities separately from class features) ===
  const actionFeatures = extractActions(char);
  const featureNames = new Set(features.map((f) => f.name));
  for (const af of actionFeatures) {
    if (!featureNames.has(af.name)) {
      featureNames.add(af.name);
      features.push(af);
    }
  }

  // === Class Resources (Channel Divinity, Ki, Rage, etc.) ===
  const classResources = extractClassResources(char);

  // === Proficiencies (ddb2alchemy entityTypeId approach) ===
  const proficiencies = extractProficiencies(char);

  // === Languages ===
  const languages = extractLanguages(gatherModifiers(char));

  // === Senses ===
  const senses = extractSenses(char, abilities, proficiencyBonus, skills);

  // === Spells ===
  const spells = extractSpells(char);

  // === Spellcasting (ddb2alchemy getSpellcastingAbility approach) ===
  const spellcasting = computeSpellcasting(char, abilities, proficiencyBonus);

  // === Spell Slots (ddb2alchemy convertSpellSlots approach) ===
  const { regularSlots, pactSlots } = extractSpellSlots(char);

  // === Inventory ===
  const inventory = extractInventory(char, abilities, proficiencyBonus);

  // === Currency ===
  const currency = extractCurrency(char);

  // === Advantages / Disadvantages ===
  const advantages = extractAdvantages(char);

  // === Traits ===
  const traits = extractTraits(char);

  // === XP ===
  const xp: number = char.currentXp || 0;

  const staticData: CharacterStaticData = {
    name,
    race,
    classes,
    abilities,
    maxHP,
    armorClass,
    proficiencyBonus,
    speed,
    features,
    classResources,
    proficiencies,
    skills,
    savingThrows,
    senses,
    languages,
    spells,
    spellcastingAbility: spellcasting.spellcastingAbility,
    spellSaveDC: spellcasting.spellSaveDC,
    spellAttackBonus: spellcasting.spellAttackBonus,
    advantages,
    traits,
    importedAt: Date.now(),
    ddbId: char.id || undefined,
  };

  // Extract initial resource usage from DDB
  const initialResourcesUsed: Record<string, number> = {};
  for (const cls of char.classes || []) {
    for (const feature of cls.classFeatures || []) {
      const lu = feature.definition?.limitedUse ?? feature.limitedUse;
      if (lu && (lu.numberUsed ?? 0) > 0 && feature.definition?.name) {
        initialResourcesUsed[feature.definition.name] = lu.numberUsed;
      }
    }
  }

  const dynamicData: CharacterDynamicData = {
    currentHP,
    tempHP,
    spellSlotsUsed: regularSlots,
    pactMagicSlots: pactSlots,
    resourcesUsed: initialResourcesUsed,
    conditions: [],
    deathSaves: {
      successes: char.deathSaves?.successCount ?? 0,
      failures: char.deathSaves?.failCount ?? 0,
    },
    inventory,
    currency,
    xp,
    heroicInspiration: !!char.inspiration,
  };

  return {
    character: { static: staticData, dynamic: dynamicData },
    warnings,
  };
}


/**
 * Compute ability scores using ddb2alchemy's getStatValue pattern:
 * 1. Base from stats[] (default 10)
 * 2. Override from overrideStats[] (replaces if non-null)
 * 3. Bonus from bonusStats[] (added on top)
 * 4. Modifiers: "set-base" → use highest, "bonus" → sum
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeAbilityScores(char: any, warnings: string[]): AbilityScores {
  const abilities: AbilityScores = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  };

  // Step 1: Base stats
  for (const stat of char.stats || []) {
    const key = STAT_ID_MAP[stat.id];
    if (key && stat.value != null) {
      abilities[key] = stat.value;
    }
  }

  // Step 2: Override stats (replace entirely if set)
  for (const stat of char.overrideStats || []) {
    const key = STAT_ID_MAP[stat.id];
    if (key && stat.value != null) {
      abilities[key] = stat.value;
    }
  }

  // Step 3: Bonus stats (user-entered bonuses, added on top)
  for (const stat of char.bonusStats || []) {
    const key = STAT_ID_MAP[stat.id];
    if (key && stat.value != null) {
      abilities[key] += stat.value;
    }
  }

  // Step 4: Modifiers — "set-base" overrides and "bonus" additions
  // Following ddb2alchemy: iterate all modifier categories, apply set-base
  // (use highest), then add bonuses.
  //
  // 2024 PHB detection: In 2024 D&D, background ability score bonuses are
  // placed in the "race" modifier category (via the "Ability Score Increases"
  // species trait). stats[] already includes these bonuses, so we must skip
  // race-sourced ability score modifiers to avoid double-counting.
  // For 2014 characters, race modifiers are genuine racial bonuses that
  // need to be applied on top of stats[] base values.
  // NOTE: Only check for plural "Ability Score Increases" (2024 species).
  // Singular "Ability Score Increase" is the 2014 racial trait — those
  // modifiers must be applied since stats[] only has base point-buy values.
  const hasAbilityScoreIncreasesTrait = (char.race?.racialTraits || []).some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t: any) => {
      const name: string = t.definition?.name || "";
      return name === "Ability Score Increases";
    }
  );

  // Collect ability score modifier componentIds to skip (2024 double-counting).
  // In 2024, stats[] already includes bonuses from:
  //   1. Race modifiers (in char.modifiers.race)
  //   2. Background ASI feats like "Acolyte Ability Score Improvements" (in char.modifiers.feat)
  const skipAbilityModComponentIds = new Set<number>();
  if (hasAbilityScoreIncreasesTrait) {
    // Skip race-sourced ability score modifiers
    for (const mod of (char.modifiers?.race || []) as DDBModifier[]) {
      if (
        mod.type === "bonus" &&
        mod.subType?.endsWith("-score") &&
        mod.componentId != null
      ) {
        skipAbilityModComponentIds.add(mod.componentId);
      }
    }

    // Skip background ASI feat modifiers ("[Background] Ability Score Improvements")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bgAsiFeatIds = new Set<number>();
    for (const feat of (char.feats || []) as any[]) {
      const featName: string = feat.definition?.name || "";
      if (featName.endsWith("Ability Score Improvements")) {
        if (feat.componentId != null) bgAsiFeatIds.add(feat.componentId);
        if (feat.id != null) bgAsiFeatIds.add(feat.id);
        if (feat.definition?.id != null) bgAsiFeatIds.add(feat.definition.id);
      }
    }
    for (const mod of (char.modifiers?.feat || []) as DDBModifier[]) {
      if (
        mod.type === "bonus" &&
        mod.subType?.endsWith("-score") &&
        mod.componentId != null &&
        bgAsiFeatIds.has(mod.componentId)
      ) {
        skipAbilityModComponentIds.add(mod.componentId);
      }
    }
  }

  const setValues: Partial<Record<keyof AbilityScores, number>> = {};

  for (const statId of [1, 2, 3, 4, 5, 6] as const) {
    const key = STAT_ID_MAP[statId];
    if (!key) continue;

    // "set-base" overrides (e.g., Headband of Intellect sets INT to 19)
    const setBase = maxModifier(char, {
      type: "set",
      subType: `${key}-score`,
    });
    if (setBase > 0) {
      setValues[key] = setBase;
    }

    // "bonus" modifiers (racial, class, feat, item bonuses)
    // For 2024 characters, skip race-sourced ability score modifiers
    // (from "Ability Score Increases" trait) since stats[] already includes them
    const bonusMods = getModifiers(char, {
      type: "bonus",
      subType: `${key}-score`,
    });
    let bonus = 0;
    for (const mod of bonusMods) {
      if (
        skipAbilityModComponentIds.size > 0 &&
        mod.componentId != null &&
        skipAbilityModComponentIds.has(mod.componentId)
      ) {
        continue; // skip double-applied 2024 ASI modifiers (race + background feat)
      }
      bonus += mod.value || 0;
    }
    if (bonus !== 0) {
      abilities[key] += bonus;
    }
  }

  // Apply "set" values: only if higher than computed score
  for (const [key, setValue] of Object.entries(setValues)) {
    const abilityKey = key as keyof AbilityScores;
    if (setValue! > abilities[abilityKey]) {
      abilities[abilityKey] = setValue!;
    }
  }

  // Validate
  for (const [key, val] of Object.entries(abilities)) {
    if (val < 1 || val > 30) {
      warnings.push(`${key} score ${val} is unusual (expected 1-30)`);
    }
  }

  return abilities;
}

/**
 * Compute HP using ddb2alchemy's getBaseHp/getMaxHp/getCurrentHp pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeHP(
  char: any,
  abilities: AbilityScores
): { maxHP: number; currentHP: number; tempHP: number } {
  const conMod = getAbilityMod(abilities.constitution);
  const totalLevel = (char.classes || []).reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sum: number, c: any) => sum + (c.level || 1),
    0
  );

  // Base HP = hit die rolls + CON modifier per level
  const baseHp: number =
    (char.baseHitPoints ?? 10) + conMod * totalLevel;

  // DDB pre-computes all bonus HP (Tough feat, etc.) into bonusHitPoints
  const bonusHP: number = char.bonusHitPoints || 0;

  // Override takes precedence
  const maxHP = Math.max(
    1,
    char.overrideHitPoints || baseHp + bonusHP
  );

  // Current HP
  const removedHP: number = char.removedHitPoints || 0;
  const tempHP: number = char.temporaryHitPoints || 0;
  const currentHP = Math.max(0, maxHP - removedHP);

  return { maxHP, currentHP, tempHP };
}

/**
 * Compute AC using ddb2alchemy's getArmorClass pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeArmorClass(char: any, abilities: AbilityScores): number {
  // Manual override
  if (char.overrideArmorClass) {
    return char.overrideArmorClass;
  }

  const dexMod = getAbilityMod(abilities.dexterity);

  // Find equipped armor and shields
  const equippedArmor: Array<{
    armorClass: number;
    armorTypeId: number;
  }> = [];
  let shieldAC = 0;

  for (const item of char.inventory || []) {
    if (!item.equipped || item.definition?.filterType !== "Armor") continue;
    const typeId = item.definition.armorTypeId;
    const ac = item.definition.armorClass || 0;

    if (typeId === ARMOR_TYPE_SHIELD) {
      shieldAC = Math.max(shieldAC, ac);
    } else if (typeId) {
      equippedArmor.push({ armorClass: ac, armorTypeId: typeId });
    }
  }

  let baseAC: number;
  let hasArmor = false;

  if (equippedArmor.length > 0) {
    // Use the first equipped armor (characters should only have one)
    const armor = equippedArmor[0];
    hasArmor = true;

    if (armor.armorTypeId === ARMOR_TYPE_LIGHT) {
      baseAC = armor.armorClass + dexMod;
    } else if (armor.armorTypeId === ARMOR_TYPE_MEDIUM) {
      baseAC = armor.armorClass + Math.min(dexMod, 2);
    } else {
      // Heavy armor
      baseAC = armor.armorClass;
    }
  } else {
    // Unarmored: base 10 + DEX
    baseAC = 10 + dexMod;

    // Unarmored Defense (Barbarian: +CON, Monk: +WIS when no shield)
    const classNames = (char.classes || []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => ((c.definition?.name as string) || "").toLowerCase()
    );

    const conMod = getAbilityMod(abilities.constitution);
    const wisMod = getAbilityMod(abilities.wisdom);

    if (classNames.includes("barbarian")) {
      baseAC = 10 + dexMod + conMod;
    } else if (classNames.includes("monk") && shieldAC === 0) {
      baseAC = 10 + dexMod + wisMod;
    }
  }

  // Flat AC bonuses (magic items, feats, etc.)
  const bonusAC = sumModifiers(char, {
    type: "bonus",
    subType: "armor-class",
  });

  return baseAC + shieldAC + bonusAC;
}

/**
 * Compute speed using ddb2alchemy's getSpeed approach.
 * Includes base racial speed + modifier bonuses.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeSpeed(char: any): number {
  let baseSpeed: number =
    char.race?.weightSpeeds?.normal?.walk ?? 30;

  // Check for set-type speed modifiers (2024 races like Wood Elf use
  // "innate-speed-walking" to override the default 30 ft base speed)
  const setSpeed = maxModifier(char, {
    type: "set",
    subType: "innate-speed-walking",
  });
  if (setSpeed > 0) {
    baseSpeed = Math.max(baseSpeed, setSpeed);
  }

  // Speed bonuses from modifiers (e.g., Monk Unarmored Movement, Longstrider)
  const speedBonus = sumModifiers(char, { type: "bonus", subType: "speed" });
  const unarmoredBonus = sumModifiers(char, {
    type: "bonus",
    subType: "unarmored-movement",
  });

  return baseSpeed + speedBonus + unarmoredBonus;
}

/**
 * Extract skills using ddb2alchemy's getSkills approach with entityTypeId.
 * Also detects Jack of All Trades (half-proficiency on ability checks)
 * which adds floor(profBonus/2) to all non-proficient skills.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSkills(char: any, proficiencyBonus: number): SkillProficiency[] {
  // Get skill proficiencies using entityTypeId (more reliable than string matching)
  const profMods = getModifiers(char, { type: "proficiency" });
  const expertiseMods = getModifiers(char, { type: "expertise" });
  const bonusMods = gatherModifiers(char).filter(
    (m) => m.type === "bonus" && m.subType && SKILL_ABILITY_MAP[m.subType]
  );

  // Detect Jack of All Trades: half-proficiency on "ability-checks"
  const hasHalfProfOnChecks = getModifiers(char, {
    type: "half-proficiency",
    subType: "ability-checks",
  }).length > 0;
  const halfProfBonus = hasHalfProfOnChecks ? Math.floor(proficiencyBonus / 2) : 0;

  const profSet = new Set<string>();
  const expertiseSet = new Set<string>();
  const bonusMap = new Map<string, number>();

  for (const mod of profMods) {
    if (mod.subType && SKILL_ABILITY_MAP[mod.subType]) {
      profSet.add(mod.subType);
    }
  }

  for (const mod of expertiseMods) {
    if (mod.subType && SKILL_ABILITY_MAP[mod.subType]) {
      expertiseSet.add(mod.subType);
      profSet.add(mod.subType); // expertise implies proficiency
    }
  }

  for (const mod of bonusMods) {
    if (mod.subType && mod.value) {
      bonusMap.set(
        mod.subType,
        (bonusMap.get(mod.subType) || 0) + mod.value
      );
    }
  }

  const skills: SkillProficiency[] = [];
  for (const [skillSlug, ability] of Object.entries(SKILL_ABILITY_MAP)) {
    const isProficient = profSet.has(skillSlug);
    const isExpertise = expertiseSet.has(skillSlug);
    let bonus = bonusMap.get(skillSlug) || 0;

    // Jack of All Trades: add half-prof to non-proficient skills
    if (halfProfBonus > 0 && !isProficient) {
      bonus += halfProfBonus;
    }

    skills.push({
      name: skillSlug,
      ability,
      proficient: isProficient,
      expertise: isExpertise,
      bonus: bonus || undefined,
    });
  }

  return skills;
}

/**
 * Extract saving throw proficiencies.
 * D&D 5e multiclass rule: only the starting class grants save proficiencies.
 * We use DDB's componentId on class modifiers to identify which class they
 * came from, and only include saves from the starting class.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSavingThrows(char: any): SavingThrowProficiency[] {
  const profSet = new Set<keyof AbilityScores>();
  const bonusMap = new Map<keyof AbilityScores, number>();

  // Build set of feature IDs belonging to the starting class
  const startingClassFeatureIds = new Set<number>();
  for (const cls of char.classes || []) {
    if (!cls.isStartingClass) continue;
    for (const feature of cls.classFeatures || []) {
      if (feature.id != null) startingClassFeatureIds.add(feature.id);
      if (feature.definition?.id != null) startingClassFeatureIds.add(feature.definition.id);
    }
  }

  // Process class modifiers: only starting class grants save proficiencies
  for (const mod of (char.modifiers?.class || []) as DDBModifier[]) {
    if (!mod.subType) continue;

    if (mod.type === "proficiency" && SAVE_SUBTYPE_MAP[mod.subType]) {
      // Only include if componentId matches a starting class feature
      if (mod.componentId != null && startingClassFeatureIds.has(mod.componentId)) {
        profSet.add(SAVE_SUBTYPE_MAP[mod.subType]);
      }
    } else if (mod.type === "bonus" && SAVE_SUBTYPE_MAP[mod.subType] && mod.value) {
      // Bonuses are additive from all sources
      const ability = SAVE_SUBTYPE_MAP[mod.subType];
      bonusMap.set(ability, (bonusMap.get(ability) || 0) + mod.value);
    }
  }

  // Process non-class modifiers (race, feat, item, background, condition)
  // These are not class-specific and always apply
  const nonClassCategories = ["race", "feat", "item", "background", "condition"];
  for (const category of nonClassCategories) {
    for (const mod of (char.modifiers?.[category] || []) as DDBModifier[]) {
      if (!mod.subType) continue;

      if (mod.type === "proficiency" && SAVE_SUBTYPE_MAP[mod.subType]) {
        profSet.add(SAVE_SUBTYPE_MAP[mod.subType]);
      } else if (mod.type === "bonus" && SAVE_SUBTYPE_MAP[mod.subType] && mod.value) {
        const ability = SAVE_SUBTYPE_MAP[mod.subType];
        bonusMap.set(ability, (bonusMap.get(ability) || 0) + mod.value);
      }
    }
  }

  const abilityList: (keyof AbilityScores)[] = [
    "strength", "dexterity", "constitution",
    "intelligence", "wisdom", "charisma",
  ];

  return abilityList.map((ability) => ({
    ability,
    proficient: profSet.has(ability),
    bonus: bonusMap.get(ability) || undefined,
  }));
}

/**
 * Compute spellcasting stats using ddb2alchemy's getSpellcastingAbility approach.
 * Uses the highest-level caster class's spellcasting ability.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeSpellcasting(
  char: any,
  abilities: AbilityScores,
  proficiencyBonus: number
): {
  spellcastingAbility?: keyof AbilityScores;
  spellSaveDC?: number;
  spellAttackBonus?: number;
} {
  // Find the highest-level class that can cast spells
  let bestCaster: { abilityId: number; level: number } | null = null;

  for (const cls of char.classes || []) {
    const abilityId = cls.definition?.spellCastingAbilityId;
    const canCast = cls.definition?.canCastSpells;
    if (!canCast || abilityId == null) continue;

    if (!bestCaster || cls.level > bestCaster.level) {
      bestCaster = { abilityId, level: cls.level };
    }
  }

  if (!bestCaster || !STAT_ID_MAP[bestCaster.abilityId]) return {};

  const ability = STAT_ID_MAP[bestCaster.abilityId];
  const mod = getAbilityMod(abilities[ability]);

  return {
    spellcastingAbility: ability,
    spellSaveDC: 8 + proficiencyBonus + mod,
    spellAttackBonus: proficiencyBonus + mod,
  };
}

/**
 * Extract spell slots using ddb2alchemy's convertSpellSlots approach.
 * Handles single-class, multiclass, and Pact Magic.
 * Returns regular slots and pact magic slots separately.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSpellSlots(char: any): {
  regularSlots: SpellSlotLevel[];
  pactSlots: SpellSlotLevel[];
} {
  const slots: SpellSlotLevel[] = [];

  // Build a map of used counts from char.spellSlots
  const usedByLevel = new Map<number, number>();
  for (const slot of char.spellSlots || []) {
    if (slot.level >= 1 && slot.level <= 9 && (slot.used ?? 0) > 0) {
      usedByLevel.set(slot.level, slot.used);
    }
  }

  // Identify caster classes (excluding Warlock which uses Pact Magic)
  const rawClasses: DDBClassInfo[] = char.classes || [];
  const casterClasses = rawClasses.filter(
    (c) => c.definition?.canCastSpells &&
      c.definition.name.toLowerCase() !== "warlock"
  );
  const isMultiCaster = casterClasses.length > 1;

  if (casterClasses.length > 0) {
    let slotRow: number[] | undefined;

    if (isMultiCaster) {
      // Multiclass: compute weighted caster level, use MULTICLASS_SPELL_SLOTS
      let multiCasterLevel = 0;
      for (const cls of casterClasses) {
        const className = (cls.definition?.name || "").toLowerCase();
        const multiplier = CASTER_LEVEL_MULTIPLIER[className] ?? 0;
        multiCasterLevel += cls.level * multiplier;
      }
      const casterLevel = Math.min(
        Math.max(Math.floor(multiCasterLevel), 1),
        20
      );
      slotRow = MULTICLASS_SPELL_SLOTS[casterLevel - 1];
    } else {
      // Single class: use class's own levelSpellSlots table
      const cls = casterClasses[0];
      const table = cls.definition?.spellRules?.levelSpellSlots;
      if (table && cls.level >= 1 && cls.level < table.length) {
        slotRow = table[cls.level];
      } else {
        // Fallback to multiclass table using class multiplier
        const className = (cls.definition?.name || "").toLowerCase();
        const multiplier = CASTER_LEVEL_MULTIPLIER[className] ?? 1;
        const casterLevel = Math.min(
          Math.max(Math.floor(cls.level * multiplier), 1),
          20
        );
        slotRow = MULTICLASS_SPELL_SLOTS[casterLevel - 1];
      }
    }

    if (slotRow) {
      for (let i = 0; i < slotRow.length; i++) {
        if (slotRow[i] > 0) {
          slots.push({
            level: i + 1,
            total: slotRow[i],
            used: usedByLevel.get(i + 1) || 0,
          });
        }
      }
    }
  }

  // Pact Magic (Warlock) — tracked separately from regular slots
  const pactSlots: SpellSlotLevel[] = [];
  const warlockClass = rawClasses.find(
    (c) =>
      c.definition?.canCastSpells &&
      c.definition.name.toLowerCase() === "warlock"
  );
  if (warlockClass) {
    const pactTable = warlockClass.definition?.spellRules?.levelSpellSlots;
    if (pactTable && warlockClass.level >= 1 && warlockClass.level < pactTable.length) {
      const pactRow = pactTable[warlockClass.level];
      const pactUsed = new Map<number, number>();
      for (const slot of char.pactMagic || []) {
        if (slot.level >= 1 && (slot.used ?? 0) > 0) {
          pactUsed.set(slot.level, slot.used);
        }
      }
      if (pactRow) {
        for (let i = 0; i < pactRow.length; i++) {
          if (pactRow[i] > 0) {
            pactSlots.push({
              level: i + 1,
              total: pactRow[i],
              used: pactUsed.get(i + 1) || 0,
            });
          }
        }
      }
    }
  }

  return {
    regularSlots: slots.sort((a, b) => a.level - b.level),
    pactSlots: pactSlots.sort((a, b) => a.level - b.level),
  };
}

/**
 * Extract proficiencies using ddb2alchemy's entityTypeId approach.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractProficiencies(char: any): ProficiencyGroup {
  const group: ProficiencyGroup = {
    armor: [],
    weapons: [],
    tools: [],
    other: [],
  };
  const seen = new Set<string>();

  const profMods = getModifiers(char, { type: "proficiency" });

  for (const mod of profMods) {
    const name = mod.friendlySubtypeName;
    if (!name || seen.has(name)) continue;

    // Skip "Choose a ..." placeholders from DDB character builder
    if (/^choose\s+an?\s+/i.test(name)) continue;

    seen.add(name);

    // Use entityTypeId for reliable categorization
    if (mod.entityTypeId === PROF_ENTITY_ARMOR) {
      group.armor.push(name);
    } else if (mod.entityTypeId === PROF_ENTITY_WEAPON) {
      group.weapons.push(name);
    } else if (mod.entityTypeId === PROF_ENTITY_TOOL) {
      group.tools.push(name);
    } else {
      // Skip saving throws and skill proficiencies (handled elsewhere)
      const lower = name.toLowerCase();
      if (
        lower.includes("saving") ||
        SKILL_ABILITY_MAP[lower] ||
        lower.includes("-saving-throws")
      ) {
        continue;
      }
      // Catch weapon proficiencies by name (2024 characters may lack entityTypeId)
      if (lower.includes("weapon")) {
        group.weapons.push(name);
      } else {
        group.other.push(name);
      }
    }
  }

  return group;
}

/**
 * Extract languages from modifiers.
 */
function extractLanguages(modifiers: DDBModifier[]): string[] {
  const languages = new Set<string>();
  for (const mod of modifiers) {
    if (mod.type === "language" && mod.friendlySubtypeName) {
      languages.add(mod.friendlySubtypeName);
    }
  }
  return [...languages].sort();
}

/**
 * Extract senses (darkvision, passive perception).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSenses(
  char: any,
  abilities: AbilityScores,
  proficiencyBonus: number,
  skills: SkillProficiency[]
): string[] {
  const senses: string[] = [];

  // Check for darkvision from racial traits
  for (const trait of char.race?.racialTraits || []) {
    const traitName: string = trait.definition?.name || "";
    if (traitName.toLowerCase().includes("darkvision")) {
      const desc: string = trait.definition?.description || "";
      const match = desc.match(/(\d+)\s*(?:feet|ft)/i);
      const range = match ? match[1] : "60";
      senses.push(`Darkvision ${range} ft.`);
    }
  }

  // Also check modifiers for darkvision
  const darkvisionSet = maxModifier(char, {
    type: "set",
    subType: "darkvision",
  });
  if (darkvisionSet > 0 && !senses.some((s) => s.startsWith("Darkvision"))) {
    senses.push(`Darkvision ${darkvisionSet} ft.`);
  }

  // Passive Perception
  const wisMod = getAbilityMod(abilities.wisdom);
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


// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFeatures(
  char: any,
  classes: CharacterClass[]
): CharacterFeature[] {
  const features: CharacterFeature[] = [];
  const seen = new Set<string>();

  const addFeature = (f: CharacterFeature) => {
    if (!seen.has(f.name)) {
      seen.add(f.name);
      features.push(f);
    }
  };

  // Class features — filter by level
  for (const cls of char.classes || []) {
    const className: string = cls.definition?.name || "Unknown";
    const classLevel: number = cls.level || 1;

    for (const feature of cls.classFeatures || []) {
      if (!feature.definition?.name) continue;
      const requiredLevel: number | undefined =
        feature.requiredLevel ?? feature.definition?.requiredLevel;
      if (requiredLevel != null && requiredLevel > classLevel) continue;

      addFeature({
        name: feature.definition.name,
        description: feature.definition.description
          ? stripHtml(feature.definition.description)
          : "",
        source: "class",
        sourceLabel: className,
        requiredLevel: requiredLevel ?? undefined,
        activationType: formatCastingTime(feature.definition?.activation ?? feature.activation),
      });
    }
  }

  // Racial traits
  const raceName: string =
    char.race?.fullName ||
    char.race?.baseName ||
    char.race?.baseRaceName ||
    "Race";
  for (const trait of char.race?.racialTraits || []) {
    if (!trait.definition?.name) continue;
    // Skip 2024 "Ability Score Increases" species trait (bonuses come from background)
    if (trait.definition.name === "Ability Score Increases") continue;
    addFeature({
      name: trait.definition.name,
      description: trait.definition.description
        ? stripHtml(trait.definition.description)
        : "",
      source: "race",
      sourceLabel: raceName,
      activationType: formatCastingTime(trait.definition?.activation ?? trait.activation),
    });
  }

  // Feats
  for (const feat of char.feats || []) {
    if (!feat.definition?.name) continue;
    const featName: string = feat.definition.name;
    // Skip campaign option artifacts
    if (featName === "Dark Bargain") continue;
    // Skip "[Background] Ability Score Improvements" (bonuses already in ability scores)
    if (featName.endsWith("Ability Score Improvements")) continue;
    addFeature({
      name: featName,
      description: feat.definition.description
        ? stripHtml(feat.definition.description)
        : "",
      source: "feat",
      sourceLabel: featName,
      activationType: formatCastingTime(feat.definition?.activation ?? feat.activation),
    });
  }

  return features;
}

/**
 * Extract class resources with limited uses (Channel Divinity, Ki, Rage, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractClassResources(char: any): ClassResource[] {
  const resources: ClassResource[] = [];
  const seen = new Set<string>();

  for (const cls of char.classes || []) {
    const className: string = cls.definition?.name || "Unknown";
    const classLevel: number = cls.level || 1;

    for (const feature of cls.classFeatures || []) {
      if (!feature.definition?.name) continue;
      const requiredLevel: number | undefined =
        feature.requiredLevel ?? feature.definition?.requiredLevel;
      if (requiredLevel != null && requiredLevel > classLevel) continue;

      const limitedUse = feature.definition.limitedUse ?? feature.limitedUse;
      if (!limitedUse) continue;

      const maxUses: number = limitedUse.maxUses;
      if (!maxUses || maxUses <= 0) continue;

      const resetType = DDB_RESET_TYPES[limitedUse.resetType] ?? null;
      if (!resetType) continue; // skip resources with special/unknown reset

      const name: string = feature.definition.name;
      if (seen.has(name)) continue;
      seen.add(name);

      resources.push({ name, maxUses, resetType, source: className });
    }
  }

  return resources;
}

/**
 * Extract actions from DDB's char.actions object.
 * DDB stores activated abilities (Breath Weapon, Lay on Hands, etc.) separately
 * from class features. The actions object is keyed by source (race, class, feat, etc.)
 * and each entry has its own activation, description, and limitedUse data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractActions(char: any): CharacterFeature[] {
  const actions: CharacterFeature[] = [];
  const charActions = char.actions;
  if (!charActions || typeof charActions !== "object") return actions;

  const sourceMap: Record<string, CharacterFeature["source"]> = {
    race: "race",
    class: "class",
    feat: "feat",
    background: "background",
  };

  for (const [key, value] of Object.entries(charActions)) {
    if (!Array.isArray(value)) continue;
    const source = sourceMap[key] || "class";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const action of value as any[]) {
      if (!action.name) continue;
      const activationType = formatCastingTime(action.activation);
      if (!activationType) continue; // skip passive/no-activation entries
      actions.push({
        name: action.name,
        description: action.description
          ? stripHtml(action.description)
          : action.snippet
            ? stripHtml(action.snippet)
            : "",
        source,
        sourceLabel: source.charAt(0).toUpperCase() + source.slice(1),
        activationType,
      });
    }
  }

  return actions;
}

/**
 * Extract advantage and disadvantage modifiers from all modifier categories.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAdvantages(char: any): AdvantageEntry[] {
  const entries: AdvantageEntry[] = [];
  const seen = new Set<string>();

  const modCategories = char.modifiers || {};
  for (const category of Object.keys(modCategories)) {
    const mods: DDBModifier[] = modCategories[category] || [];
    for (const mod of mods) {
      const typeLower = (mod.type || "").toLowerCase();
      if (typeLower !== "advantage" && typeLower !== "disadvantage") continue;
      if (!mod.subType) continue;

      const restriction = mod.restriction || undefined;
      const dedupKey = `${typeLower}:${mod.subType}:${restriction || ""}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const source =
        mod.friendlyTypeName && mod.friendlySubtypeName
          ? `${mod.friendlyTypeName} on ${mod.friendlySubtypeName}`
          : mod.friendlySubtypeName || mod.subType;

      entries.push({
        type: typeLower as "advantage" | "disadvantage",
        subType: mod.subType,
        restriction: restriction || undefined,
        source,
      });
    }
  }

  return entries;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSpells(char: any): CharacterSpell[] {
  const spells: CharacterSpell[] = [];
  const seen = new Set<string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function parseSpellDef(
    def: any,
    isPrepared: boolean,
    extra: {
      alwaysPrepared: boolean;
      spellSource: CharacterSpell["spellSource"];
      knownByClass: boolean;
      sourceClass?: string;
    }
  ): CharacterSpell {
    return {
      name: def.name,
      level: def.level ?? 0,
      prepared: isPrepared,
      alwaysPrepared: extra.alwaysPrepared,
      spellSource: extra.spellSource,
      knownByClass: extra.knownByClass,
      sourceClass: extra.sourceClass,
      school: def.school || undefined,
      castingTime: formatCastingTime(def.activation),
      range: formatRange(def.range),
      components: formatComponents(def.components),
      duration: formatDuration(def.duration),
      description: def.description ? stripHtml(def.description) : undefined,
      ritual: def.ritual || false,
      concentration: def.concentration || false,
    };
  }

  // Build class ID → name lookup (original casing for sourceClass, lowercase for known-caster check)
  // DDB uses different ID fields: cls.id (join-table ID) and cls.definition.id (class definition ID)
  const classNameById = new Map<number, string>();
  for (const cls of char.classes || []) {
    const name = cls.definition?.name;
    if (!name) continue;
    if (cls.id != null) classNameById.set(cls.id, name);
    if (cls.definition?.id != null) classNameById.set(cls.definition.id, name);
  }

  // Class spells
  for (const classSpellBlock of char.classSpells || []) {
    // Resolve class name to detect known casters (bard, sorcerer, ranger, warlock)
    const className = classNameById.get(classSpellBlock.characterClassId) || "";
    const isKnownCaster = KNOWN_CASTER_CLASSES.has(className.toLowerCase());

    for (const spell of classSpellBlock.spells || []) {
      const def = spell.definition;
      if (!def?.name || seen.has(def.name)) continue;
      seen.add(def.name);

      const isAlwaysPrepared = spell.alwaysPrepared || false;
      const isPrepared =
        spell.prepared || isAlwaysPrepared || def.level === 0 || isKnownCaster;
      spells.push(
        parseSpellDef(def, isPrepared, {
          alwaysPrepared: isAlwaysPrepared,
          spellSource: "class",
          knownByClass: true,
          sourceClass: className || undefined,
        })
      );
    }
  }

  // Class feature spells (e.g. Evocation Savant, subclass grants)
  // These live in char.spells.class, separate from char.classSpells
  for (const spell of char.spells?.class || []) {
    const def = spell.definition;
    if (!def?.name || seen.has(def.name)) continue;
    seen.add(def.name);
    spells.push(
      parseSpellDef(def, true, {
        alwaysPrepared: true,
        spellSource: "class",
        knownByClass: true,
      })
    );
  }

  // Race spells
  for (const spell of char.spells?.race || []) {
    const def = spell.definition;
    if (!def?.name || seen.has(def.name)) continue;
    seen.add(def.name);
    spells.push(
      parseSpellDef(def, true, {
        alwaysPrepared: true,
        spellSource: "race",
        knownByClass: false,
      })
    );
  }

  // Feat spells
  for (const spell of char.spells?.feat || []) {
    const def = spell.definition;
    if (!def?.name || seen.has(def.name)) continue;
    seen.add(def.name);
    spells.push(
      parseSpellDef(def, true, {
        alwaysPrepared: true,
        spellSource: "feat",
        knownByClass: false,
      })
    );
  }

  // Item spells
  for (const spell of char.spells?.item || []) {
    const def = spell.definition;
    if (!def?.name || seen.has(def.name)) continue;
    seen.add(def.name);
    spells.push(
      parseSpellDef(def, true, {
        alwaysPrepared: true,
        spellSource: "item",
        knownByClass: false,
      })
    );
  }

  return spells.sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name)
  );
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractInventory(
  char: any,
  abilities: AbilityScores,
  proficiencyBonus: number
): InventoryItem[] {
  const items: InventoryItem[] = [];
  const strMod = getAbilityMod(abilities.strength);
  const dexMod = getAbilityMod(abilities.dexterity);

  for (const item of char.inventory || []) {
    const def = item.definition;
    if (!def?.name) continue;

    let damage: string | undefined;
    let damageType: string | undefined;
    if (def.damage?.diceString) {
      damage = def.damage.diceString;
    } else if (def.fixedDamage) {
      damage = String(def.fixedDamage);
    }
    if (def.damageType) {
      damageType = def.damageType;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties: string[] = (def.properties || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => p.name)
      .filter(Boolean);

    // Weapon range
    let range: string | undefined;
    const isWeapon =
      def.filterType === "Weapon" || def.attackType === 1 || def.attackType === 2;
    if (isWeapon) {
      const isRanged = def.attackType === 2;
      const hasThrown = properties.some(
        (p) => p.toLowerCase() === "thrown"
      );
      const hasReach = properties.some(
        (p) => p.toLowerCase() === "reach"
      );

      if (isRanged) {
        // Ranged weapon: range/longRange (e.g. "80/320 ft.")
        const short = def.range || 0;
        const long = def.longRange || 0;
        if (short > 0 && long > 0) {
          range = `${short}/${long} ft.`;
        } else if (short > 0) {
          range = `${short} ft.`;
        }
      } else if (hasThrown) {
        // Thrown melee weapon (e.g. javelin): "20/60 ft."
        const short = def.range || 20;
        const long = def.longRange || short * 3;
        range = `${short}/${long} ft.`;
      } else {
        // Melee weapon
        range = hasReach ? "10 ft." : "5 ft.";
      }
    }

    // Attack bonus and damage modifier for weapons
    let attackBonus: number | undefined;
    if (isWeapon && damage) {
      const isRanged = def.attackType === 2;
      const isFinesse = properties.some(
        (p) => p.toLowerCase() === "finesse"
      );

      let abilityMod: number;
      if (isRanged) {
        abilityMod = dexMod;
      } else if (isFinesse) {
        abilityMod = Math.max(strMod, dexMod);
      } else {
        abilityMod = strMod;
      }

      // Magic bonus from item itself (e.g. +1 weapon)
      const magicBonus = def.magicBonus || 0;
      attackBonus = proficiencyBonus + abilityMod + magicBonus;

      // Append ability + magic modifier to damage string (e.g. "1d12" → "1d12+3")
      const damageMod = abilityMod + magicBonus;
      if (damageMod > 0) {
        damage = `${damage}+${damageMod}`;
      } else if (damageMod < 0) {
        damage = `${damage}${damageMod}`;
      }
    }

    items.push({
      name: def.name,
      equipped: item.equipped || false,
      quantity: item.quantity || 1,
      type: def.filterType || def.type || undefined,
      armorClass: def.armorClass || undefined,
      description: def.description ? stripHtml(def.description) : undefined,
      damage,
      damageType,
      range,
      attackBonus,
      properties: properties.length > 0 ? properties : undefined,
      weight: def.weight || undefined,
      rarity: def.rarity || undefined,
      attunement: def.canAttune || false,
      isAttuned: item.isAttuned || false,
      isMagicItem: def.magic || false,
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCurrency(char: any): Currency {
  const currencies = char.currencies || {};
  return {
    cp: currencies.cp || 0,
    sp: currencies.sp || 0,
    ep: currencies.ep || 0,
    gp: currencies.gp || 0,
    pp: currencies.pp || 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTraits(char: any): CharacterTraits {
  const t = char.traits || {};
  return {
    personalityTraits: t.personalityTraits || undefined,
    ideals: t.ideals || undefined,
    bonds: t.bonds || undefined,
    flaws: t.flaws || undefined,
  };
}


function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/?(ul|ol)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ndash;/gi, "\u2013")
    .replace(/&mdash;/gi, "\u2014")
    .replace(/&lsquo;/gi, "\u2018")
    .replace(/&rsquo;/gi, "\u2019")
    .replace(/&ldquo;/gi, "\u201C")
    .replace(/&rdquo;/gi, "\u201D")
    .replace(/&hellip;/gi, "\u2026")
    .replace(/&times;/gi, "\u00D7")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatCastingTime(activation: any): string | undefined {
  if (!activation) return undefined;
  const type = activation.activationType;
  if (type != null && ACTIVATION_TYPES[type]) {
    return ACTIVATION_TYPES[type];
  }
  const time = activation.activationTime;
  if (time && type) {
    return `${time} ${type}`;
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatRange(range: any): string | undefined {
  if (!range) return undefined;
  if (range.origin === "Self") return "Self";
  if (range.origin === "Touch") return "Touch";
  if (range.rangeValue) return `${range.rangeValue} feet`;
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatComponents(components: any): string | undefined {
  if (!Array.isArray(components) || components.length === 0) return undefined;
  const parts: string[] = [];
  if (components.includes(1)) parts.push("V");
  if (components.includes(2)) parts.push("S");
  if (components.includes(3)) parts.push("M");
  return parts.join(", ") || undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatDuration(duration: any): string | undefined {
  if (!duration) return undefined;
  const type = duration.durationType;
  const interval = duration.durationInterval;
  const unit = duration.durationUnit;

  if (type === "Instantaneous") return "Instantaneous";
  if (type === "Until Dispelled") return "Until Dispelled";
  if (type === "Special") return "Special";
  if (type === "Concentration") {
    if (interval && unit) {
      const unitStr = DURATION_TYPES[unit] || unit;
      return `Concentration, up to ${interval} ${unitStr}${interval > 1 ? "s" : ""}`;
    }
    return "Concentration";
  }
  if (interval && unit) {
    const unitStr = DURATION_TYPES[unit] || unit;
    return `${interval} ${unitStr}${interval > 1 ? "s" : ""}`;
  }
  return undefined;
}
