import type { AbilityScores, CharacterSpell, InventoryItem, Currency, CharacterFeature } from "@aidnd/shared/types";
import type { CharacterIdentifiers } from "@aidnd/shared/builders";
import type { SpeciesData, FeatData } from "@aidnd/shared/data";
import {
  getClass,
  getSpecies,
  getBackground,
  getSpell,
  getFeat,
  getWeapon,
  getArmor,
  getGear,
  getTool,
  speciesArray,
  featsArray,
  formatWeaponProperty,
} from "@aidnd/shared/data";
import type { BuilderState, BuilderStep, EquipmentEntry, TraitChoiceDefinition, FeatureChoiceDefinition } from "./types";

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
      // Feat +1 to chosen ability
      result[sel.featAbilityChoice] = Math.min(20, result[sel.featAbilityChoice] + 1);
    }
  }

  return result;
}

export const STANDARD_ARRAY_DEFAULT: AbilityScores = {
  strength: 0,
  dexterity: 0,
  constitution: 0,
  intelligence: 0,
  wisdom: 0,
  charisma: 0,
};

export const DEFAULT_ABILITIES: AbilityScores = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
};

export const POINT_BUY_DEFAULT: AbilityScores = {
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
};

// ─── ASI Level Helpers ──────────────────────────────────

/** Returns the class levels at which ASI/feat choices are available */
export function getASILevels(className: string, level: number): number[] {
  const standard = [4, 8, 12, 16, 19];
  const lc = className.toLowerCase();

  let all = [...standard];
  if (lc === "fighter") {
    all.push(6, 14);
  }
  if (lc === "rogue") {
    all.push(10);
  }
  all.sort((a, b) => a - b);
  return all.filter((l) => l <= level);
}

/** Returns feats eligible for selection at a given level */
export function getEligibleFeats(level: number): FeatData[] {
  return featsArray.filter((f) => {
    if (f.category === "origin") return false;
    if (f.category === "fighting-style") return false;
    // "Ability Score Improvement" is redundant — we have a dedicated ASI toggle
    if (f.name === "Ability Score Improvement") return false;
    if (f.category === "epic-boon") return level >= 19;
    // General feats available at L4+
    return f.category === "general";
  });
}

/** Normalize ability abbreviations (str/dex/con/int/wis/cha) to full names */
const ABILITY_ABBREV_MAP: Record<string, keyof AbilityScores> = {
  str: "strength", strength: "strength",
  dex: "dexterity", dexterity: "dexterity",
  con: "constitution", constitution: "constitution",
  int: "intelligence", intelligence: "intelligence",
  wis: "wisdom", wisdom: "wisdom",
  cha: "charisma", charisma: "charisma",
};

/** Normalize and deduplicate abilityScoreIncrease from feat data */
export function getFeatAbilityChoices(feat: FeatData): (keyof AbilityScores)[] {
  if (!feat.abilityScoreIncrease) return [];
  const result: (keyof AbilityScores)[] = [];
  for (const raw of feat.abilityScoreIncrease) {
    const normalized = ABILITY_ABBREV_MAP[raw.toLowerCase().trim()];
    if (normalized && !result.includes(normalized)) {
      result.push(normalized);
    }
  }
  return result;
}

// ─── HP Computation ─────────────────────────────────────

function computeHP(className: string, level: number, conMod: number): number {
  const cls = getClass(className);
  if (!cls) return 10 + conMod;
  const hitDice = cls.hitDice;
  let hp = hitDice + conMod;
  for (let i = 1; i < level; i++) {
    hp += Math.floor(hitDice / 2) + 1 + conMod;
  }
  // NOTE: Tough and Dwarf Toughness HP bonuses are applied in
  // character-builder.ts:buildCharacter() to avoid double-counting
  return Math.max(1, hp);
}

// ─── Spell Count Tables ─────────────────────────────────

const CANTRIPS_KNOWN: Record<string, number[]> = {
  bard:     [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  cleric:   [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
  druid:    [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  sorcerer: [4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6],
  warlock:  [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  wizard:   [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
};

const SPELLS_KNOWN: Record<string, number[]> = {
  bard:     [4,5,6,7,8,9,10,11,12,14,15,15,16,18,19,19,20,22,22,22],
  ranger:   [0,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11],
  sorcerer: [2,3,4,5,6,7,8,9,10,11,12,12,13,13,14,14,15,15,15,15],
  warlock:  [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15],
};

export function getCantripsKnown(className: string, level: number): number {
  const table = CANTRIPS_KNOWN[className.toLowerCase()];
  if (!table) return 0;
  return table[Math.min(level, 20) - 1] ?? 0;
}

export function getSpellsKnownOrPrepared(
  className: string,
  level: number,
  abilityMod: number
): { type: "known" | "prepared"; count: number } {
  const lc = className.toLowerCase();

  const knownTable = SPELLS_KNOWN[lc];
  if (knownTable) {
    return { type: "known", count: knownTable[Math.min(level, 20) - 1] ?? 0 };
  }

  const cls = getClass(className);
  if (cls?.spellcastingAbility) {
    return { type: "prepared", count: Math.max(1, abilityMod + level) };
  }

  return { type: "known", count: 0 };
}

export function getMaxSpellLevel(className: string, level: number): number {
  const lc = className.toLowerCase();

  if (lc === "warlock") {
    const cls = getClass(className);
    if (cls?.pactSlotTable) {
      const entry = cls.pactSlotTable.find((e) => e.level === level);
      return entry?.slotLevel ?? 0;
    }
    return 0;
  }

  if (lc === "paladin" || lc === "ranger") {
    if (level < 2) return 0;
    const cls = getClass(className);
    if (cls?.spellSlotTable) {
      const row = cls.spellSlotTable[level - 1];
      if (row) {
        for (let i = row.length - 1; i >= 0; i--) {
          if (row[i] > 0) return i + 1;
        }
      }
    }
    return 0;
  }

  const cls = getClass(className);
  if (cls?.spellSlotTable) {
    const row = cls.spellSlotTable[Math.min(level, 20) - 1];
    if (row) {
      for (let i = row.length - 1; i >= 0; i--) {
        if (row[i] > 0) return i + 1;
      }
    }
  }

  return 0;
}

export function isCasterClass(className: string): boolean {
  const cls = getClass(className);
  if (!cls) return false;
  return !!cls.casterType;
}

// ─── Background Ability Score Parser ─────────────────────

/** Parse ability score names from 2024 background descriptions like "Ability Scores: Strength, Dexterity, Intelligence" */
export function parseBackgroundAbilityScores(description: string): string[] {
  const match = description.match(/Ability Scores?[:\s]*\*{0,2}\s*([A-Za-z,\s]+?)(?:\n|\*|$)/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].includes(s));
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

// ─── Background Helpers ─────────────────────────────────

export function parseBackgroundFeat(featString: string): string {
  const name = featString.split("|")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── Species Trait Choice Registry ──────────────────────

const SPECIES_TRAIT_CHOICES: Record<string, TraitChoiceDefinition[]> = {
  human: [
    { traitName: "Skillful", choiceType: "skill" },
    { traitName: "Versatile", choiceType: "feat", featCategory: "origin" },
  ],
  elf: [
    {
      traitName: "Keen Senses",
      choiceType: "skill",
      options: ["insight", "perception", "survival"],
    },
    {
      traitName: "Elven Lineage",
      choiceType: "lineage",
      lineageOptions: [
        { name: "Drow", description: "Dancing Lights cantrip (Lv.1), Faerie Fire (Lv.3), Darkness (Lv.5)" },
        { name: "High Elf", description: "Prestidigitation cantrip (Lv.1), Detect Magic (Lv.3), Misty Step (Lv.5)" },
        { name: "Wood Elf", description: "Druidcraft cantrip (Lv.1), Longstrider (Lv.3), Pass without Trace (Lv.5)" },
      ],
      secondaryChoice: {
        type: "spellcasting-ability",
        options: ["intelligence", "wisdom", "charisma"],
      },
    },
  ],
  "half-elf": [
    { traitName: "Skill Versatility", choiceType: "skills", count: 2 },
  ],
  dragonborn: [
    {
      traitName: "Draconic Ancestry",
      choiceType: "ancestry",
      lineageOptions: [
        { name: "Black", description: "Acid damage — 15 ft. line (DEX save)" },
        { name: "Blue", description: "Lightning damage — 15 ft. line (DEX save)" },
        { name: "Brass", description: "Fire damage — 15 ft. line (DEX save)" },
        { name: "Bronze", description: "Lightning damage — 15 ft. line (DEX save)" },
        { name: "Copper", description: "Acid damage — 15 ft. line (DEX save)" },
        { name: "Gold", description: "Fire damage — 15 ft. cone (DEX save)" },
        { name: "Green", description: "Poison damage — 15 ft. cone (CON save)" },
        { name: "Red", description: "Fire damage — 15 ft. cone (DEX save)" },
        { name: "Silver", description: "Cold damage — 15 ft. cone (CON save)" },
        { name: "White", description: "Cold damage — 15 ft. cone (CON save)" },
      ],
    },
  ],
  gnome: [
    {
      traitName: "Gnomish Lineage",
      choiceType: "lineage",
      lineageOptions: [
        { name: "Forest Gnome", description: "Minor Illusion cantrip, Speak with Small Beasts" },
        { name: "Rock Gnome", description: "Mending + Prestidigitation cantrips, Tinker's Tools proficiency" },
      ],
      secondaryChoice: {
        type: "spellcasting-ability",
        options: ["intelligence", "wisdom", "charisma"],
      },
    },
  ],
  tiefling: [
    {
      traitName: "Fiendish Legacy",
      choiceType: "lineage",
      lineageOptions: [
        { name: "Abyssal", description: "Poison resistance. Poison Spray (Lv.1), Ray of Sickness (Lv.3), Hold Person (Lv.5)" },
        { name: "Chthonic", description: "Necrotic resistance. Chill Touch (Lv.1), False Life (Lv.3), Ray of Enfeeblement (Lv.5)" },
        { name: "Infernal", description: "Fire resistance. Fire Bolt (Lv.1), Hellish Rebuke (Lv.3), Darkness (Lv.5)" },
      ],
      secondaryChoice: {
        type: "spellcasting-ability",
        options: ["intelligence", "wisdom", "charisma"],
      },
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
};

export function getSpeciesTraitChoices(speciesName: string): TraitChoiceDefinition[] {
  return SPECIES_TRAIT_CHOICES[speciesName.toLowerCase()] ?? [];
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

// ─── Class Feature Choice Registry ──────────────────────

const CLASS_FEATURE_CHOICES: FeatureChoiceDefinition[] = [
  {
    className: "fighter",
    featureName: "Fighting Style",
    level: 1,
    count: 1,
    options: [
      { name: "Archery", description: "+2 bonus to attack rolls with ranged weapons" },
      { name: "Defense", description: "+1 bonus to AC while wearing armor" },
      { name: "Dueling", description: "+2 damage when wielding one melee weapon and no other weapons" },
      { name: "Great Weapon Fighting", description: "Reroll 1s and 2s on damage with two-handed/versatile weapons" },
      { name: "Protection", description: "Impose disadvantage on attacks against nearby allies (requires Shield)" },
      { name: "Two-Weapon Fighting", description: "Add ability modifier to the damage of off-hand attacks" },
    ],
  },
  {
    className: "paladin",
    featureName: "Fighting Style",
    level: 2,
    count: 1,
    options: [
      { name: "Defense", description: "+1 bonus to AC while wearing armor" },
      { name: "Dueling", description: "+2 damage when wielding one melee weapon and no other weapons" },
      { name: "Great Weapon Fighting", description: "Reroll 1s and 2s on damage with two-handed/versatile weapons" },
      { name: "Protection", description: "Impose disadvantage on attacks against nearby allies (requires Shield)" },
    ],
  },
  {
    className: "ranger",
    featureName: "Fighting Style",
    level: 2,
    count: 1,
    options: [
      { name: "Archery", description: "+2 bonus to attack rolls with ranged weapons" },
      { name: "Defense", description: "+1 bonus to AC while wearing armor" },
      { name: "Dueling", description: "+2 damage when wielding one melee weapon and no other weapons" },
      { name: "Two-Weapon Fighting", description: "Add ability modifier to the damage of off-hand attacks" },
    ],
  },
  {
    className: "sorcerer",
    featureName: "Metamagic",
    level: 2,
    count: 2,
    countAtLevel: { 2: 2, 10: 4, 17: 6 },
    options: [
      { name: "Careful Spell", description: "Allies automatically succeed on saves against your spell (1 SP)" },
      { name: "Distant Spell", description: "Double the range of a spell, or make touch spells 30 ft. (1 SP)" },
      { name: "Empowered Spell", description: "Reroll up to CHA mod damage dice, keep new rolls (1 SP)" },
      { name: "Extended Spell", description: "Double a spell's duration up to 24 hours (1 SP)" },
      { name: "Heightened Spell", description: "One target has disadvantage on first save against spell (2 SP)" },
      { name: "Quickened Spell", description: "Change casting time from Action to Bonus Action (2 SP)" },
      { name: "Seeking Spell", description: "Reroll a missed spell attack roll (1 SP)" },
      { name: "Subtle Spell", description: "Cast without verbal or somatic components (1 SP)" },
      { name: "Transmuted Spell", description: "Change damage type to acid, cold, fire, lightning, poison, or thunder (1 SP)" },
      { name: "Twinned Spell", description: "Target a second creature in range with a single-target spell (SP = spell level, min 1)" },
    ],
  },
  {
    className: "warlock",
    featureName: "Eldritch Invocations",
    level: 1,
    count: 1,
    countAtLevel: { 1: 1, 2: 3, 5: 5, 7: 6, 9: 7, 12: 8, 15: 9, 18: 10 },
    options: [
      { name: "Agonizing Blast", description: "Add CHA modifier to Eldritch Blast damage" },
      { name: "Armor of Shadows", description: "Cast Mage Armor on yourself at will without a spell slot" },
      { name: "Eldritch Mind", description: "Advantage on Constitution saves to maintain Concentration" },
      { name: "Eldritch Spear", description: "Eldritch Blast range becomes 300 feet" },
      { name: "Fiendish Vigor", description: "Cast False Life on yourself at will as a level 1 spell" },
      { name: "Gaze of Two Minds", description: "Use action to perceive through a willing creature's senses" },
      { name: "Lessons of the First Ones", description: "Gain one Origin feat of your choice" },
      { name: "Mask of Many Faces", description: "Cast Disguise Self at will without a spell slot" },
      { name: "Misty Visions", description: "Cast Silent Image at will without a spell slot" },
      { name: "Pact of the Blade", description: "Conjure a pact weapon, use CHA for attacks, Charisma-based" },
      { name: "Pact of the Chain", description: "Learn Find Familiar, special familiar forms available" },
      { name: "Pact of the Tome", description: "Gain a Book of Shadows with three cantrips from any class" },
      { name: "Repelling Blast", description: "Push creature 10 feet when hit by Eldritch Blast" },
    ],
  },
];

export function getFeatureChoicesForClass(
  className: string,
  level: number
): FeatureChoiceDefinition[] {
  const lc = className.toLowerCase();
  return CLASS_FEATURE_CHOICES.filter(
    (f) => f.className === lc && f.level <= level
  );
}

export function getFeatureChoiceCount(def: FeatureChoiceDefinition, level: number): number {
  if (!def.countAtLevel) return def.count;
  let count = def.count;
  for (const [lvl, c] of Object.entries(def.countAtLevel)) {
    if (level >= Number(lvl)) count = c;
  }
  return count;
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

// ─── Subclass Always-Prepared Spells ────────────────────

const SUBCLASS_SPELLS: Record<string, Record<number, string[]>> = {
  // Cleric Domains
  "Life Domain": {
    3: ["Aid", "Bless", "Cure Wounds", "Lesser Restoration"],
    5: ["Mass Healing Word", "Revivify"],
    7: ["Aura of Life", "Death Ward"],
    9: ["Greater Restoration", "Mass Cure Wounds"],
  },
  "Light Domain": {
    3: ["Burning Hands", "Faerie Fire"],
    5: ["Flaming Sphere", "Scorching Ray"],
    7: ["Daylight", "Fireball"],
    9: ["Guardian of Faith", "Wall of Fire"],
  },
  "Trickery Domain": {
    3: ["Charm Person", "Disguise Self"],
    5: ["Mirror Image", "Pass without Trace"],
    7: ["Blink", "Dispel Magic"],
    9: ["Dimension Door", "Polymorph"],
  },
  "War Domain": {
    3: ["Divine Favor", "Shield of Faith"],
    5: ["Magic Weapon", "Spiritual Weapon"],
    7: ["Crusader's Mantle", "Spirit Guardians"],
    9: ["Freedom of Movement", "Stoneskin"],
  },
  "Knowledge Domain": {
    3: ["Command", "Identify"],
    5: ["Augury", "Suggestion"],
    7: ["Nondetection", "Speak with Dead"],
    9: ["Arcane Eye", "Confusion"],
  },
  "Tempest Domain": {
    3: ["Fog Cloud", "Thunderwave"],
    5: ["Gust of Wind", "Shatter"],
    7: ["Call Lightning", "Sleet Storm"],
    9: ["Control Water", "Ice Storm"],
  },
  "Nature Domain": {
    3: ["Animal Friendship", "Speak with Animals"],
    5: ["Barkskin", "Spike Growth"],
    7: ["Plant Growth", "Wind Wall"],
    9: ["Dominate Beast", "Grasping Vine"],
  },
  // Paladin Oaths
  "Oath of Devotion": {
    3: ["Protection from Evil and Good", "Sanctuary"],
    5: ["Lesser Restoration", "Zone of Truth"],
    9: ["Beacon of Hope", "Dispel Magic"],
    13: ["Freedom of Movement", "Guardian of Faith"],
    17: ["Commune", "Flame Strike"],
  },
  "Oath of the Ancients": {
    3: ["Ensnaring Strike", "Speak with Animals"],
    5: ["Misty Step", "Moonbeam"],
    9: ["Plant Growth", "Protection from Energy"],
    13: ["Ice Storm", "Stoneskin"],
    17: ["Commune with Nature", "Tree Stride"],
  },
  "Oath of Vengeance": {
    3: ["Bane", "Hunter's Mark"],
    5: ["Hold Person", "Misty Step"],
    9: ["Haste", "Protection from Energy"],
    13: ["Banishment", "Dimension Door"],
    17: ["Hold Monster", "Scrying"],
  },
  "Oath of Glory": {
    3: ["Guiding Bolt", "Heroism"],
    5: ["Enhance Ability", "Magic Weapon"],
    9: ["Haste", "Protection from Energy"],
    13: ["Compulsion", "Freedom of Movement"],
    17: ["Commune", "Flame Strike"],
  },
  // Druid Circles
  "Circle of the Land": {
    3: ["Speak with Animals", "Spike Growth"],
    5: ["Lightning Bolt", "Plant Growth"],
    7: ["Freedom of Movement", "Wall of Fire"],
    9: ["Insect Plague", "Tree Stride"],
  },
  "Circle of the Moon": {
    3: ["Cure Wounds", "Moonbeam"],
    5: ["Conjure Animals"],
    7: ["Fount of Moonlight"],
    9: ["Mass Cure Wounds"],
  },
  "Circle of the Sea": {
    3: ["Fog Cloud", "Gust of Wind"],
    5: ["Lightning Bolt", "Water Breathing"],
    7: ["Control Water", "Ice Storm"],
    9: ["Conjure Elemental", "Maelstrom"],
  },
  "Circle of Stars": {
    3: ["Guiding Bolt", "Faerie Fire"],
    5: ["Moonbeam", "Shatter"],
    7: ["Aura of Vitality", "Call Lightning"],
    9: ["Arcane Eye", "Wall of Fire"],
  },
};

export function getAlwaysPreparedSpells(subclass: string | null, level: number): string[] {
  if (!subclass) return [];
  const table = SUBCLASS_SPELLS[subclass];
  if (!table) return [];

  const spells: string[] = [];
  for (const [lvl, spellList] of Object.entries(table)) {
    if (level >= Number(lvl)) {
      spells.push(...spellList);
    }
  }
  return spells;
}

// ─── Ritual Casting ─────────────────────────────────────

export const RITUAL_CASTER_CLASSES = new Set(["bard", "cleric", "druid", "wizard"]);

// ─── Equipment Helpers ──────────────────────────────────

function equipmentToInventoryItem(entry: EquipmentEntry): InventoryItem {
  const item: InventoryItem = {
    name: entry.name,
    equipped: entry.equipped,
    quantity: entry.quantity,
  };

  switch (entry.source) {
    case "weapon": {
      const w = getWeapon(entry.name);
      if (w) {
        item.type = "Weapon";
        item.damage = w.damage;
        item.damageType = w.damageType;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        item.properties = (w.properties as any[])?.map(formatWeaponProperty);
        item.weight = w.weight;
        if (w.range) item.range = w.range;
      } else {
        item.type = "Weapon";
      }
      break;
    }
    case "armor": {
      const a = getArmor(entry.name);
      if (a) {
        item.type = a.category === "shield" ? "Shield" : "Armor";
        item.armorClass = a.ac;
        item.weight = a.weight;
      } else {
        item.type = "Armor";
      }
      break;
    }
    case "gear": {
      const g = getGear(entry.name);
      if (g) {
        item.type = "Gear";
        item.weight = g.weight;
        if (g.description) item.description = g.description;
      } else {
        item.type = "Gear";
      }
      break;
    }
    case "tool": {
      const t = getTool(entry.name);
      if (t) {
        item.type = "Tool";
        item.weight = t.weight;
        if (t.description) item.description = t.description;
      } else {
        item.type = "Tool";
      }
      break;
    }
    case "item": {
      item.type = entry.itemType || "Gear";
      if (entry.weight) item.weight = entry.weight;
      if (entry.description) item.description = entry.description;
      break;
    }
  }

  return item;
}

// ─── Assemble Identifiers ───────────────────────────────

export function assembleIdentifiers(state: BuilderState): CharacterIdentifiers {
  const finalAbilities = getFinalAbilities(state);
  const conMod = getAbilityMod(finalAbilities.constitution);
  const className = state.className!;
  const cls = getClass(className);
  const speciesData = state.species ? getSpecies(state.species) : null;
  const bgData = state.background ? getBackground(state.background) : null;

  // Combine background skills + species skills + class picks
  const bgSkills = bgData?.skillProficiencies ?? [];
  const speciesSkills = getSpeciesSkills(state);
  const allSkills = [...new Set([...bgSkills, ...speciesSkills, ...state.skillProficiencies])];

  // Save proficiencies from class DB (mutable — feats can add to this)
  const saveProficiencies: (keyof AbilityScores)[] = (cls?.savingThrows ?? []).map(
    (s) => s.toLowerCase() as keyof AbilityScores
  );

  // Always-prepared spells from subclass
  const alwaysPrepared = getAlwaysPreparedSpells(state.subclass, state.level);

  // Build spells
  const spells: CharacterSpell[] = [
    // Always-prepared subclass spells
    ...alwaysPrepared.map((name) => {
      const db = getSpell(name);
      return {
        name,
        level: db?.level ?? 1,
        prepared: true,
        alwaysPrepared: true,
        spellSource: "class" as const,
        knownByClass: true,
        sourceClass: className,
        school: db?.school,
        castingTime: db?.castingTime,
        range: db?.range,
        components: db?.components,
        duration: db?.duration,
        concentration: db?.concentration,
        ritual: db?.ritual,
      };
    }),
    // Selected cantrips
    ...state.selectedCantrips.map((name) => {
      const db = getSpell(name);
      return {
        name,
        level: 0,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class" as const,
        knownByClass: true,
        sourceClass: className,
        school: db?.school,
        castingTime: db?.castingTime,
        range: db?.range,
        components: db?.components,
        duration: db?.duration,
        concentration: db?.concentration,
        ritual: db?.ritual,
      };
    }),
    // Selected leveled spells
    ...state.selectedSpells.map((name) => {
      const db = getSpell(name);
      return {
        name,
        level: db?.level ?? 1,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class" as const,
        knownByClass: true,
        sourceClass: className,
        school: db?.school,
        castingTime: db?.castingTime,
        range: db?.range,
        components: db?.components,
        duration: db?.duration,
        concentration: db?.concentration,
        ritual: db?.ritual,
      };
    }),
  ];

  // Equipment
  const equipment: InventoryItem[] = state.equipment.map(equipmentToInventoryItem);

  // Languages
  const languages = speciesData?.languages
    ? [...speciesData.languages]
    : ["Common"];

  // Tool proficiencies from background
  const toolProficiencies = bgData?.toolProficiency ? [bgData.toolProficiency] : [];

  const name = state.name.trim() || state.nameFromSpeciesStep.trim() || "Unnamed";

  const currency: Currency = { ...state.currency };

  // Convert feature choices (fighting styles, invocations, etc.) to CharacterFeature[]
  const additionalFeatures: CharacterFeature[] = [];
  for (const [featureName, choices] of Object.entries(state.featureChoices)) {
    for (const choice of choices) {
      additionalFeatures.push({
        name: choice,
        description: `${featureName}: ${choice}`,
        source: "class",
        sourceLabel: className,
      });
    }
  }

  // Add selected feats from ASI levels
  for (const sel of state.asiSelections) {
    if (sel.type === "feat" && sel.featName) {
      const featData = getFeat(sel.featName);
      additionalFeatures.push({
        name: sel.featName,
        description: featData?.description ?? `Feat selected at level ${sel.level}`,
        source: "feat",
        sourceLabel: `Level ${sel.level}`,
      });
      // Feat-granted proficiencies
      if (featData?.proficiencies) {
        if (featData.proficiencies.tools) {
          toolProficiencies.push(...featData.proficiencies.tools);
        }
      }
      // Feat-granted spells (Fey Touched, Shadow Touched, Magic Initiate, etc.)
      if (sel.featSubChoices) {
        // Add cantrips from feat sub-choices
        for (const cantripName of sel.featSubChoices["cantrips"] ?? []) {
          const db = getSpell(cantripName);
          if (db) {
            spells.push({
              name: cantripName, level: 0, prepared: true, alwaysPrepared: true,
              spellSource: "feat" as const, knownByClass: false,
              school: db.school, castingTime: db.castingTime, range: db.range,
              components: db.components, duration: db.duration,
              concentration: db.concentration, ritual: db.ritual,
            });
          }
        }
        // Add leveled spells from feat sub-choices
        for (const spellName of sel.featSubChoices["spells"] ?? []) {
          const db = getSpell(spellName);
          if (db) {
            spells.push({
              name: spellName, level: db.level, prepared: true, alwaysPrepared: true,
              spellSource: "feat" as const, knownByClass: false,
              school: db.school, castingTime: db.castingTime, range: db.range,
              components: db.components, duration: db.duration,
              concentration: db.concentration, ritual: db.ritual,
            });
          }
        }
      }
      // Resilient feat: add save proficiency
      if (sel.featName.toLowerCase() === "resilient" && sel.featAbilityChoice) {
        saveProficiencies.push(sel.featAbilityChoice);
      }
      // Skilled feat: add skill proficiencies from sub-choices
      if (sel.featName.toLowerCase() === "skilled" && sel.featSubChoices?.["skills"]) {
        allSkills.push(...sel.featSubChoices["skills"]);
      }
      // Skill Expert: add skill proficiency + expertise
      if (sel.featName.toLowerCase() === "skill expert" && sel.featSubChoices) {
        if (sel.featSubChoices["skills"]) allSkills.push(...sel.featSubChoices["skills"]);
      }
    }
  }

  // Collect all origin feat names (from background + species "Versatile" trait)
  const originFeatNames: string[] = [];
  const bgOriginFeat = bgData?.feat ? parseBackgroundFeat(bgData.feat) : null;
  if (bgOriginFeat) originFeatNames.push(bgOriginFeat);

  // Human "Versatile" trait grants an origin feat
  const versatileChoice = state.speciesChoices["Versatile"];
  if (versatileChoice && typeof versatileChoice.selected === "string" && versatileChoice.selected) {
    const speciesFeat = versatileChoice.selected;
    if (!originFeatNames.some((n) => n.toLowerCase() === speciesFeat.toLowerCase())) {
      originFeatNames.push(speciesFeat);
    }
  }

  for (const originFeatName of originFeatNames) {
    const originFeat = getFeat(originFeatName);
    if (originFeat) {
      additionalFeatures.push({
        name: originFeatName,
        description: originFeat.description,
        source: "feat",
        sourceLabel: bgData?.name ?? "Background",
      });
    }

    const lowerFeat = originFeatName.toLowerCase();
    // Magic Initiate: add cantrips + spell
    if (lowerFeat.startsWith("magic initiate") && state.originFeatOverrides.cantrips) {
      for (const cantripName of state.originFeatOverrides.cantrips) {
        const db = getSpell(cantripName);
        if (db) {
          spells.push({
            name: cantripName, level: 0, prepared: true, alwaysPrepared: true,
            spellSource: "feat" as const, knownByClass: false,
            school: db.school, castingTime: db.castingTime, range: db.range,
            components: db.components, duration: db.duration,
            concentration: db.concentration, ritual: db.ritual,
          });
        }
      }
      if (state.originFeatOverrides.spell) {
        const db = getSpell(state.originFeatOverrides.spell);
        if (db) {
          spells.push({
            name: state.originFeatOverrides.spell, level: 1, prepared: true,
            alwaysPrepared: true, spellSource: "feat" as const, knownByClass: false,
            school: db.school, castingTime: db.castingTime, range: db.range,
            components: db.components, duration: db.duration,
            concentration: db.concentration, ritual: db.ritual,
          });
        }
      }
    }
    // Skilled: add 3 skill/tool proficiencies
    if (lowerFeat === "skilled" && state.originFeatOverrides.skillChoices) {
      allSkills.push(...state.originFeatOverrides.skillChoices);
    }
    if (lowerFeat === "skilled" && state.originFeatOverrides.toolChoices) {
      toolProficiencies.push(...state.originFeatOverrides.toolChoices);
    }
    // Crafter: add 3 artisan tool proficiencies
    if (lowerFeat === "crafter" && state.originFeatOverrides.toolChoices) {
      toolProficiencies.push(...state.originFeatOverrides.toolChoices);
    }
    // Musician: add 3 instrument proficiencies
    if (lowerFeat === "musician" && state.originFeatOverrides.toolChoices) {
      toolProficiencies.push(...state.originFeatOverrides.toolChoices);
    }
  }

  // Species lineage spells
  const lineageSpells = getLineageSpells(state);
  spells.push(...lineageSpells);

  // Deduplicate skills
  const uniqueSkills = [...new Set(allSkills)];

  // Jack of All Trades: Bard level 2+ adds half-prof to non-proficient ability checks
  let skillBonuses: Map<string, number> | undefined;
  if (className.toLowerCase() === "bard" && state.level >= 2) {
    const halfProf = Math.floor((Math.ceil(state.level / 4) + 1) / 2);
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
    classes: [
      {
        name: className,
        level: state.level,
        subclass: state.subclass ?? undefined,
      },
    ],
    background: bgData?.name,
    abilities: finalAbilities,
    maxHP: computeHP(className, state.level, conMod),
    skillProficiencies: uniqueSkills,
    skillExpertise: state.skillExpertise,
    skillBonuses,
    saveProficiencies: [...new Set(saveProficiencies)],
    spells,
    equipment,
    languages,
    toolProficiencies,
    traits: Object.keys(state.traits).length > 0 ? state.traits as any : undefined,
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
      return state.className !== null;
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
      if (!state.className) return false;
      const asiLevels = getASILevels(state.className, state.level);
      if (asiLevels.length === 0) return true;
      // Each ASI level must have a complete selection
      return asiLevels.every((lvl) => {
        const sel = state.asiSelections.find((s) => s.level === lvl);
        if (!sel) return false;
        if (sel.type === "asi") {
          if (!sel.asiChoice) return false;
          const total = Object.values(sel.asiChoice.abilities).reduce((s, v) => s + (v ?? 0), 0);
          return total === 2; // +2 to one ability OR +1 to two = total of 2
        }
        return !!sel.featName;
      });
    }
    case "skills": {
      if (!state.className) return false;
      const cls = getClass(state.className);
      if (!cls) return false;
      return state.skillProficiencies.length === cls.skillChoices.count;
    }
    case "spells": {
      if (!state.className || !isCasterClass(state.className)) return true;
      const maxCantrips = getCantripsKnown(state.className, state.level);
      if (state.selectedCantrips.length > maxCantrips) return false;
      return true;
    }
    case "equipment":
      return true;
    case "details":
      return true;
    case "review":
      return true;
  }
}

/** Returns true if a step has meaningful data entered (not just defaults) */
export function isStepTouched(state: BuilderState, step: BuilderStep): boolean {
  switch (step) {
    case "species":
      return state.species !== null;
    case "background":
      return state.background !== null;
    case "class":
      return state.className !== null;
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
      return state.selectedCantrips.length > 0 || state.selectedSpells.length > 0;
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
  if (state.className && !isCasterClass(state.className)) {
    skip.add("spells");
  }
  if (state.level < 4) {
    skip.add("feats");
  }
  return skip;
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

// ─── Species Lineage Spells ─────────────────────────────

const LINEAGE_SPELLS: Record<string, { level: number; spells: string[] }[]> = {
  Drow: [
    { level: 1, spells: ["Dancing Lights"] },
    { level: 3, spells: ["Faerie Fire"] },
    { level: 5, spells: ["Darkness"] },
  ],
  "High Elf": [
    { level: 1, spells: ["Prestidigitation"] },
    { level: 3, spells: ["Detect Magic"] },
    { level: 5, spells: ["Misty Step"] },
  ],
  "Wood Elf": [
    { level: 1, spells: ["Druidcraft"] },
    { level: 3, spells: ["Longstrider"] },
    { level: 5, spells: ["Pass without Trace"] },
  ],
  Abyssal: [
    { level: 1, spells: ["Poison Spray"] },
    { level: 3, spells: ["Ray of Sickness"] },
    { level: 5, spells: ["Hold Person"] },
  ],
  Chthonic: [
    { level: 1, spells: ["Chill Touch"] },
    { level: 3, spells: ["False Life"] },
    { level: 5, spells: ["Ray of Enfeeblement"] },
  ],
  Infernal: [
    { level: 1, spells: ["Fire Bolt"] },
    { level: 3, spells: ["Hellish Rebuke"] },
    { level: 5, spells: ["Darkness"] },
  ],
  "Forest Gnome": [
    { level: 1, spells: ["Minor Illusion"] },
  ],
  "Rock Gnome": [
    { level: 1, spells: ["Mending", "Prestidigitation"] },
  ],
};

function getLineageSpells(state: BuilderState): CharacterSpell[] {
  const result: CharacterSpell[] = [];

  // Find lineage choice from species choices
  for (const [, choice] of Object.entries(state.speciesChoices)) {
    const lineageName = typeof choice.selected === "string" ? choice.selected : null;
    if (!lineageName) continue;

    const spellTable = LINEAGE_SPELLS[lineageName];
    if (!spellTable) continue;

    for (const entry of spellTable) {
      if (state.level >= entry.level) {
        for (const spellName of entry.spells) {
          const db = getSpell(spellName);
          if (db) {
            result.push({
              name: spellName,
              level: db.level,
              prepared: true,
              alwaysPrepared: true,
              spellSource: "race" as const,
              knownByClass: false,
              school: db.school,
              castingTime: db.castingTime,
              range: db.range,
              components: db.components,
              duration: db.duration,
              concentration: db.concentration,
              ritual: db.ritual,
            });
          }
        }
      }
    }
  }

  return result;
}

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
