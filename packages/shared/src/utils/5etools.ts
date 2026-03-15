// 5e.tools Decode Maps + Format Helpers + Tag Parser
// Runtime "translation layer" for coded 5e.tools fields

import type { Entry } from "../data/entry-types";
import type {
  SpellData,
  SpellRange,
  MonsterData,
  MonsterAc,
  MonsterHp,
  MonsterSpeed,
  MonsterType,
  MonsterDamageEntry,
  MonsterConditionEntry,
  MonsterCr,
  ClassRaw,
  ClassAssembled,
  FeatPrerequisite,
  SpeciesData,
  BackgroundData,
  BaseItemData,
} from "../data/types";

// ═══════════════════════════════════════════════════════
// DECODE MAPS
// ═══════════════════════════════════════════════════════

export const SCHOOL_MAP: Record<string, string> = {
  A: "Abjuration",
  C: "Conjuration",
  D: "Divination",
  E: "Enchantment",
  V: "Evocation",
  I: "Illusion",
  N: "Necromancy",
  T: "Transmutation",
};

export const SIZE_MAP: Record<string, string> = {
  T: "Tiny",
  S: "Small",
  M: "Medium",
  L: "Large",
  H: "Huge",
  G: "Gargantuan",
};

export const DMG_TYPE_MAP: Record<string, string> = {
  A: "Acid",
  B: "Bludgeoning",
  C: "Cold",
  F: "Fire",
  O: "Force",
  L: "Lightning",
  N: "Necrotic",
  P: "Piercing",
  I: "Poison",
  Y: "Psychic",
  R: "Radiant",
  S: "Slashing",
  T: "Thunder",
};

export const FEAT_CAT_MAP: Record<string, string> = {
  G: "General",
  O: "Origin",
  FS: "Fighting Style",
  "FS:F": "Fighting Style",
  "FS:P": "Fighting Style",
  "FS:R": "Fighting Style",
  EB: "Epic Boon",
};

export const ITEM_TYPE_MAP: Record<string, string> = {
  M: "Melee Weapon",
  R: "Ranged Weapon",
  LA: "Light Armor",
  MA: "Medium Armor",
  HA: "Heavy Armor",
  S: "Shield",
  A: "Ammunition",
  AF: "Ammunition (futuristic)",
  AT: "Artisan's Tools",
  EXP: "Explosive",
  G: "Adventuring Gear",
  GS: "Gaming Set",
  GV: "Generic Variant",
  INS: "Musical Instrument",
  MNT: "Mount",
  OTH: "Other",
  P: "Potion",
  RD: "Rod",
  RG: "Ring",
  SC: "Scroll",
  SCF: "Spellcasting Focus",
  T: "Tools",
  TAH: "Tack and Harness",
  TG: "Trade Good",
  VEH: "Vehicle",
  WD: "Wand",
  WS: "Weapon Seed",
  $: "Treasure",
  $A: "Art Object",
  $C: "Coinage",
  $G: "Gemstone",
  AIR: "Vehicle (Air)",
  SHP: "Vehicle (Water)",
  SPC: "Vehicle (Space)",
};

export const OPT_FEAT_TYPE_MAP: Record<string, string> = {
  EI: "Eldritch Invocation",
  "MV:B": "Battle Master Maneuver",
  MM: "Metamagic",
  AI: "Artificer Infusion",
  OR: "Onomancy Resonant",
  "FS:F": "Fighting Style (Fighter)",
  "FS:P": "Fighting Style (Paladin)",
  "FS:R": "Fighting Style (Ranger)",
  AS: "Arcane Shot",
  PB: "Pact Boon",
  "AS:V1-UA": "Arcane Shot (V1-UA)",
  "MV:C2-UA": "Cavalier Maneuver",
  ED: "Elemental Discipline",
  RN: "Rune Knight Rune",
  AF: "Alchemical Formula",
};

export const CR_XP_MAP: Record<string, number> = {
  "0": 0,
  "1/8": 25,
  "1/4": 50,
  "1/2": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
  "21": 33000,
  "22": 41000,
  "23": 50000,
  "24": 62000,
  "25": 75000,
  "26": 90000,
  "27": 105000,
  "28": 120000,
  "29": 135000,
  "30": 155000,
};

export const ABILITY_MAP: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const ABILITY_ABBR: Record<string, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

export const PROPERTY_MAP: Record<string, string> = {
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

// ═══════════════════════════════════════════════════════
// SPELL FORMAT FUNCTIONS
// ═══════════════════════════════════════════════════════

export function formatSchool(code: string): string {
  return SCHOOL_MAP[code] ?? code;
}

export function formatCastingTime(spell: SpellData): string {
  if (!spell.time?.length) return "Unknown";
  const t = spell.time[0];
  const base = `${t.number} ${t.unit}`;
  return t.condition ? `${base}, ${t.condition}` : base;
}

export function formatRange(range: SpellRange): string {
  if (!range) return "Unknown";
  if (range.type === "special") return "Special";
  if (!range.distance) return capitalize(range.type);
  if (range.distance.type === "touch") return "Touch";
  if (range.distance.type === "self") return "Self";
  if (range.distance.type === "sight") return "Sight";
  if (range.distance.type === "unlimited") return "Unlimited";
  if (range.distance.amount != null) {
    return `${range.distance.amount} ${range.distance.type}`;
  }
  return capitalize(range.distance.type);
}

export function formatComponents(spell: SpellData): string {
  const parts: string[] = [];
  if (spell.components.v) parts.push("V");
  if (spell.components.s) parts.push("S");
  if (spell.components.m) {
    const m = spell.components.m;
    if (typeof m === "string") {
      parts.push(`M (${m})`);
    } else {
      parts.push(`M (${m.text})`);
    }
  }
  return parts.join(", ");
}

export function formatDuration(spell: SpellData): string {
  if (!spell.duration?.length) return "Unknown";
  const d = spell.duration[0];
  if (d.type === "instant") return "Instantaneous";
  if (d.type === "special") return "Special";
  if (d.type === "permanent") {
    const ends = d.ends?.join(" or ") ?? "";
    return ends ? `Until ${ends}` : "Permanent";
  }
  if (d.duration) {
    const dur = `${d.duration.amount} ${d.duration.type}${d.duration.amount > 1 ? "s" : ""}`;
    return d.concentration ? `Concentration, up to ${dur}` : dur;
  }
  return d.type;
}

export function isConcentration(spell: SpellData): boolean {
  return spell.duration?.some((d) => d.concentration === true) ?? false;
}

export function isRitual(spell: SpellData): boolean {
  return spell.meta?.ritual === true;
}

export function formatSpellLevel(spell: SpellData): string {
  if (spell.level === 0) return "Cantrip";
  const suffix =
    spell.level === 1 ? "st" : spell.level === 2 ? "nd" : spell.level === 3 ? "rd" : "th";
  return `${spell.level}${suffix}-level`;
}

// ═══════════════════════════════════════════════════════
// MONSTER FORMAT FUNCTIONS
// ═══════════════════════════════════════════════════════

export function formatMonsterSize(sizes: string[]): string {
  return sizes.map((s) => SIZE_MAP[s] ?? s).join(" or ");
}

export function formatMonsterType(type: string | MonsterType): string {
  if (typeof type === "string") return capitalize(type);
  let result = capitalize(type.type);
  if (type.tags?.length) {
    const tags = type.tags.map((t) => (typeof t === "string" ? t : t.tag));
    result += ` (${tags.join(", ")})`;
  }
  if (type.swarmSize) {
    result = `Swarm of ${SIZE_MAP[type.swarmSize] ?? type.swarmSize} ${result}s`;
  }
  return result;
}

export function formatMonsterAc(acs: (number | MonsterAc)[]): string {
  return acs
    .map((ac) => {
      if (typeof ac === "number") return String(ac);
      let result = String(ac.ac);
      const notes: string[] = [];
      if (ac.from?.length) notes.push(ac.from.map(stripTags).join(", "));
      if (ac.condition) notes.push(stripTags(ac.condition));
      if (notes.length) result += ` (${notes.join("; ")})`;
      return result;
    })
    .join(", ");
}

export function formatMonsterHp(hp: MonsterHp): string {
  if (hp.special) return hp.special;
  const parts: string[] = [];
  if (hp.average != null) parts.push(String(hp.average));
  if (hp.formula) parts.push(`(${hp.formula})`);
  return parts.join(" ") || "—";
}

export function formatMonsterSpeed(speed: MonsterSpeed): string {
  const parts: string[] = [];
  const fmt = (
    val: number | { number: number; condition?: string } | undefined,
    label?: string,
  ) => {
    if (val == null) return;
    const num = typeof val === "number" ? val : val.number;
    const cond = typeof val === "object" ? val.condition : undefined;
    let s = label ? `${label} ${num} ft.` : `${num} ft.`;
    if (cond) s += ` (${stripTags(cond)})`;
    parts.push(s);
  };
  fmt(speed.walk);
  fmt(speed.fly, "fly");
  fmt(speed.swim, "swim");
  fmt(speed.climb, "climb");
  fmt(speed.burrow, "burrow");
  if (speed.hover || speed.canHover) parts.push("(hover)");
  return parts.join(", ") || "0 ft.";
}

export function formatMonsterCr(cr: string | MonsterCr): string {
  if (typeof cr === "string") return cr;
  let result = cr.cr;
  if (cr.lair) result += ` (${cr.lair} in lair)`;
  if (cr.coven) result += ` (${cr.coven} in coven)`;
  return result;
}

export function crToNumber(cr: string | MonsterCr): number {
  const crStr = typeof cr === "string" ? cr : cr.cr;
  if (crStr.includes("/")) {
    const [num, den] = crStr.split("/");
    return Number(num) / Number(den);
  }
  return Number(crStr);
}

export function crToXp(cr: string | MonsterCr): number {
  const crStr = typeof cr === "string" ? cr : cr.cr;
  return CR_XP_MAP[crStr] ?? 0;
}

export function getAbilityScores(monster: MonsterData): Record<string, number> {
  return {
    str: monster.str,
    dex: monster.dex,
    con: monster.con,
    int: monster.int,
    wis: monster.wis,
    cha: monster.cha,
  };
}

export function formatAbilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : String(mod);
}

export function formatSaves(saves: Record<string, string>): string {
  return Object.entries(saves)
    .map(([ab, val]) => `${ABILITY_ABBR[ab] ?? ab.toUpperCase()} ${val}`)
    .join(", ");
}

export function formatSkills(skills: Record<string, string>): string {
  return Object.entries(skills)
    .map(([skill, val]) => `${capitalize(skill)} ${val}`)
    .join(", ");
}

export function flattenResistances(entries: (string | MonsterDamageEntry)[]): string {
  return entries
    .map((e) => {
      if (typeof e === "string") return e;
      const types = e.resist ?? e.immune ?? e.vulnerable ?? [];
      let result = types.join(", ");
      if (e.preNote) result = `${e.preNote} ${result}`;
      if (e.note) result += ` ${e.note}`;
      if (e.special) return e.special;
      return result;
    })
    .join("; ");
}

export function flattenConditionImmunities(entries: (string | MonsterConditionEntry)[]): string {
  return entries
    .map((e) => {
      if (typeof e === "string") return e;
      let result = e.conditionImmune.join(", ");
      if (e.preNote) result = `${e.preNote} ${result}`;
      if (e.note) result += ` ${e.note}`;
      return result;
    })
    .join("; ");
}

// ═══════════════════════════════════════════════════════
// CLASS FORMAT FUNCTIONS
// ═══════════════════════════════════════════════════════

export function getHitDice(cls: ClassRaw): string {
  return `d${cls.hd.faces}`;
}

export function getHitDiceFaces(cls: ClassRaw): number {
  return cls.hd.faces;
}

export function getSavingThrows(cls: ClassRaw): string[] {
  return cls.proficiency.map((p) => ABILITY_MAP[p] ?? p);
}

export function getArmorProfs(cls: ClassRaw): string[] {
  return (
    cls.startingProficiencies.armor?.map((a) => (typeof a === "string" ? a : a.proficiency)) ?? []
  );
}

export function getWeaponProfs(cls: ClassRaw): string[] {
  return (
    cls.startingProficiencies.weapons?.map((w) => (typeof w === "string" ? w : w.proficiency)) ?? []
  );
}

export function getToolProfs(cls: ClassRaw): string[] {
  return (
    cls.startingProficiencies.tools?.map((t) => {
      if (typeof t === "string") return t;
      if (t.anyOf) return `Any ${t.anyOf} tools`;
      return String(t);
    }) ?? []
  );
}

type AbilityName =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

/** All 18 D&D 5e skills → governing ability */
export const SKILL_ABILITY_MAP: Record<string, AbilityName> = {
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

const ALL_SKILLS = Object.keys(SKILL_ABILITY_MAP);

/** Normalize skill names from 5e.tools format (spaces) to builder format (hyphens) */
function normalizeSkill(s: string): string {
  return s.replace(/ /g, "-");
}

export function getSkillChoices(cls: ClassRaw): { from: string[]; count: number } | undefined {
  const skills = cls.startingProficiencies.skills?.[0];
  if (skills?.choose) {
    return { from: skills.choose.from.map(normalizeSkill), count: skills.choose.count };
  }
  // Handle "any: N" format (e.g., Bard gets any 3 skills)
  if (skills && "any" in skills) {
    return { from: ALL_SKILLS, count: (skills as { any: number }).any };
  }
  return undefined;
}

export function getCasterType(cls: ClassRaw): string | undefined {
  return cls.casterProgression ?? undefined;
}

export function getSpellSlotTable(cls: ClassAssembled): number[][] | undefined {
  // Look for spell slot table in classTableGroups
  // Some classes use rowsSpellProgression (separate spell slot table group)
  const spellProgGroup = cls.classTableGroups?.find((g) => g.rowsSpellProgression);
  if (spellProgGroup?.rowsSpellProgression) {
    return spellProgGroup.rowsSpellProgression;
  }

  // Fallback: look for inline spell slot columns in a regular rows table
  const group = cls.classTableGroups?.find((g) =>
    g.colLabels?.some(
      (l) =>
        /spell\s*slot/i.test(stripTags(typeof l === "string" ? l : "")) ||
        /^1st$/i.test(stripTags(typeof l === "string" ? l : "")),
    ),
  );
  if (!group?.rows) return undefined;

  // Find the columns that represent spell slots (1st through 9th)
  const slotStartIdx = group.colLabels.findIndex((l) =>
    /^1st$/i.test(stripTags(typeof l === "string" ? l : "")),
  );
  if (slotStartIdx === -1) return undefined;

  return group.rows.map((row) => {
    const slots: number[] = [];
    for (let i = slotStartIdx; i < row.length; i++) {
      const cell = row[i];
      const num =
        typeof cell === "number" ? cell : typeof cell === "string" ? parseInt(cell, 10) : 0;
      slots.push(isNaN(num) ? 0 : num);
    }
    return slots;
  });
}

export function getPactSlotTable(
  cls: ClassAssembled,
): { level: number; slots: number; slotLevel: number }[] | undefined {
  // Warlock pact slots from classTableGroups
  const group = cls.classTableGroups?.find((g) =>
    g.colLabels?.some(
      (l) =>
        /spell\s*slot/i.test(stripTags(typeof l === "string" ? l : "")) ||
        /slot\s*level/i.test(stripTags(typeof l === "string" ? l : "")),
    ),
  );
  if (!group || cls.casterProgression !== "pact") return undefined;

  const slotsIdx = group.colLabels.findIndex((l) =>
    /spell\s*slot/i.test(stripTags(typeof l === "string" ? l : "")),
  );
  const levelIdx = group.colLabels.findIndex((l) =>
    /slot\s*level/i.test(stripTags(typeof l === "string" ? l : "")),
  );
  if (slotsIdx === -1 || levelIdx === -1 || !group.rows) return undefined;

  return group.rows.map((row, i) => {
    const slots =
      typeof row[slotsIdx] === "number"
        ? (row[slotsIdx] as number)
        : parseInt(String(row[slotsIdx]), 10) || 0;
    const slotLevelStr = stripTags(String(row[levelIdx]));
    const slotLevel = parseInt(slotLevelStr, 10) || 1;
    return { level: i + 1, slots, slotLevel };
  });
}

// ═══════════════════════════════════════════════════════
// FEAT FORMAT FUNCTIONS
// ═══════════════════════════════════════════════════════

export function formatFeatCategory(code: string): string {
  return FEAT_CAT_MAP[code] ?? code;
}

export function formatPrerequisite(prereqs: FeatPrerequisite[]): string {
  return prereqs
    .map((p) => {
      const parts: string[] = [];
      if (p.level != null) {
        if (typeof p.level === "number") {
          parts.push(`Level ${p.level}`);
        } else {
          let s = `Level ${p.level.level}`;
          if (p.level.class) s += ` ${p.level.class.name}`;
          parts.push(s);
        }
      }
      if (p.ability?.length) {
        const abs = p.ability.map((a) =>
          Object.entries(a)
            .map(([k, v]) => `${ABILITY_MAP[k] ?? k} ${v}+`)
            .join(" or "),
        );
        parts.push(abs.join("; "));
      }
      if (p.spellcasting) parts.push("Spellcasting feature");
      if (p.feature?.length) parts.push(p.feature.join(", "));
      if (p.other) parts.push(p.other);
      if (p.otherSummary)
        parts.push(stripTags(p.otherSummary.entrySummary ?? p.otherSummary.entry));
      return parts.join(", ");
    })
    .filter(Boolean)
    .join("; ");
}

// ═══════════════════════════════════════════════════════
// SPECIES FORMAT FUNCTIONS
// ═══════════════════════════════════════════════════════

export function formatSpeciesSize(sizes: string[]): string {
  return sizes.map((s) => SIZE_MAP[s] ?? s).join(" or ");
}

export function getSpeciesSpeed(species: SpeciesData): number {
  if (typeof species.speed === "number") return species.speed;
  return species.speed.walk ?? 30;
}

// ═══════════════════════════════════════════════════════
// BACKGROUND FORMAT FUNCTIONS
// ═══════════════════════════════════════════════════════

export function getBackgroundSkills(bg: BackgroundData): string[] {
  if (!bg.skillProficiencies?.length) return [];
  return bg.skillProficiencies.flatMap((sp) =>
    Object.keys(sp)
      .filter((k) => sp[k] === true)
      .map(normalizeSkill),
  );
}

export function getBackgroundTools(bg: BackgroundData): string[] {
  if (!bg.toolProficiencies?.length) return [];
  return bg.toolProficiencies.flatMap((tp) => Object.keys(tp).filter((k) => tp[k] === true));
}

export function getBackgroundFeat(bg: BackgroundData): string | undefined {
  if (!bg.feats?.length) return undefined;
  const featObj = bg.feats[0];
  const key = Object.keys(featObj)[0];
  if (!key) return undefined;
  // Parse "magic initiate; cleric|xphb" → "Magic Initiate; Cleric"
  return key
    .split("|")[0]
    .split(";")
    .map((s) => capitalize(s.trim()))
    .join("; ");
}

export function getBackgroundAbilityScores(
  bg: BackgroundData,
): { from: string[]; weights: number[] } | undefined {
  if (!bg.ability?.length) return undefined;
  const first = bg.ability[0];
  if (first.choose?.weighted) {
    return {
      from: first.choose.weighted.from,
      weights: first.choose.weighted.weights,
    };
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════
// ITEM FORMAT FUNCTIONS
// ═══════════════════════════════════════════════════════

export function formatItemCost(valueCp: number | undefined): string {
  if (valueCp == null || valueCp === 0) return "—";
  if (valueCp >= 100) return `${valueCp / 100} gp`;
  if (valueCp >= 10) return `${valueCp / 10} sp`;
  return `${valueCp} cp`;
}

export function formatDamageType(code: string): string {
  return DMG_TYPE_MAP[code] ?? code;
}

export function decodeProperty(raw: string): string {
  const code = raw.split("|")[0];
  return PROPERTY_MAP[code] ?? code;
}

export function decodeMastery(raw: string): string {
  return raw.split("|")[0];
}

export function decodeItemType(code: string): string {
  // Strip source suffix
  const clean = code.split("|")[0];
  return ITEM_TYPE_MAP[clean] ?? clean;
}

export function categorizeBaseItem(
  item: BaseItemData,
): "weapon" | "armor" | "gear" | "tool" | "other" {
  if (item.weapon) return "weapon";
  if (item.armor) return "armor";
  const typeCode = item.type?.split("|")[0];
  if (typeCode === "S") return "armor"; // Shield
  if (typeCode === "AT" || typeCode === "GS" || typeCode === "INS" || typeCode === "T")
    return "tool";
  if (
    typeCode === "G" ||
    typeCode === "SC" ||
    typeCode === "A" ||
    typeCode === "SCF" ||
    typeCode === "AF"
  )
    return "gear";
  return "other";
}

// ═══════════════════════════════════════════════════════
// OPTIONAL FEATURE FORMAT FUNCTIONS
// ═══════════════════════════════════════════════════════

export function formatOptionalFeatureType(types: string[]): string {
  return types.map((t) => OPT_FEAT_TYPE_MAP[t] ?? t).join(", ");
}

// ═══════════════════════════════════════════════════════
// RICH TEXT TAG PARSING
// ═══════════════════════════════════════════════════════

export interface ParsedTag {
  type: string; // "spell", "condition", "item", "damage", "dc", "skill", etc.
  name: string;
  source?: string;
  displayText?: string;
  original: string;
}

const TAG_REGEX = /\{@(\w+)\s+([^}]+)\}/g;

/**
 * Parse 5e.tools rich text tags like {@spell Fireball|XPHB} into structured objects.
 * Returns an array of strings and ParsedTag objects.
 */
export function parseTags(text: string): (string | ParsedTag)[] {
  const result: (string | ParsedTag)[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TAG_REGEX)) {
    const matchIndex = match.index!;
    if (matchIndex > lastIndex) {
      result.push(text.slice(lastIndex, matchIndex));
    }

    const type = match[1];
    const content = match[2];
    const parts = content.split("|");

    const tag: ParsedTag = {
      type,
      name: parts[0],
      original: match[0],
    };

    if (parts.length > 1) tag.source = parts[1];
    // For filter tags, parts[2+] are filter params, not display text
    if (parts.length > 2 && type !== "filter") tag.displayText = parts[2];

    result.push(tag);
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}

/**
 * Strip all 5e.tools tags from text, keeping display text.
 */
export function stripTags(text: string): string {
  return text.replace(TAG_REGEX, (_match, type: string, content: string) => {
    const parts = content.split("|");

    // For some tag types, use display text (3rd part) or name (1st part)
    switch (type) {
      case "damage":
      case "dice":
      case "d20":
      case "hit":
      case "dc":
      case "chance":
      case "scaledice":
      case "scaledamage":
        return parts[0];
      case "atk":
        return formatAtkTag(parts[0]);
      case "atkr":
        return formatAtkTag(parts[0]);
      case "recharge":
        return parts[0] ? `(Recharge ${parts[0]})` : "(Recharge)";
      case "filter":
        return parts[0]; // Display text only
      case "h":
        return ""; // Hit prefix
      default:
        // Use display text if available, otherwise name
        return parts[2] ?? parts[0];
    }
  });
}

function formatAtkTag(code: string): string {
  const types = code.split(",").map((c) => {
    switch (c.trim()) {
      case "mw":
        return "Melee Weapon";
      case "rw":
        return "Ranged Weapon";
      case "ms":
        return "Melee Spell";
      case "rs":
        return "Ranged Spell";
      case "m":
        return "Melee";
      case "r":
        return "Ranged";
      default:
        return c;
    }
  });
  return `${types.join(" or ")} Attack:`;
}

/**
 * Recursively flatten Entry[] to plain readable text.
 * Strips all tags and flattens nested structures.
 */
export function entriesToText(entries: Entry[] | undefined | null, depth: number = 0): string {
  if (!entries) return "";
  const lines: string[] = [];
  const indent = "  ".repeat(depth);

  for (const entry of entries) {
    if (typeof entry === "string") {
      lines.push(indent + stripTags(entry));
      continue;
    }

    if (!entry || typeof entry !== "object") continue;

    switch (entry.type) {
      case "entries":
      case "section":
      case "inset":
      case "insetReadaloud":
      case "quote": {
        const e = entry as { name?: string; entries: Entry[] };
        if (e.name) lines.push(indent + e.name + ".");
        lines.push(entriesToText(e.entries, depth));
        break;
      }
      case "list": {
        const list = entry as { items: (string | Entry)[]; style?: string };
        for (const item of list.items) {
          if (typeof item === "string") {
            lines.push(indent + "• " + stripTags(item));
          } else if (item && typeof item === "object" && "name" in item) {
            const named = item as { name: string; entries?: Entry[]; entry?: Entry };
            let text = indent + "• " + named.name;
            if (named.entries) text += " " + entriesToText(named.entries, 0);
            else if (named.entry) text += " " + entriesToText([named.entry], 0);
            lines.push(text);
          } else {
            lines.push(indent + "• " + entriesToText([item as Entry], 0));
          }
        }
        break;
      }
      case "table": {
        const table = entry as {
          caption?: string;
          colLabels?: string[];
          rows: (string | Entry)[][];
        };
        if (table.caption) lines.push(indent + table.caption);
        if (table.colLabels) {
          lines.push(indent + table.colLabels.map((l) => stripTags(String(l))).join(" | "));
        }
        for (const row of table.rows) {
          lines.push(
            indent +
              row
                .map((cell) =>
                  typeof cell === "string" ? stripTags(cell) : entriesToText([cell], 0),
                )
                .join(" | "),
          );
        }
        break;
      }
      case "item": {
        const item = entry as { name: string; entries?: Entry[]; entry?: Entry };
        let text = indent + item.name + ":";
        if (item.entries) text += " " + entriesToText(item.entries, 0);
        else if (item.entry) text += " " + entriesToText([item.entry], 0);
        lines.push(text);
        break;
      }
      case "bonus": {
        const bonus = entry as { value: number };
        lines.push(`+${bonus.value}`);
        break;
      }
      case "dice": {
        const dice = entry as { toRoll?: { number: number; faces: number }[] };
        if (dice.toRoll?.length) {
          lines.push(dice.toRoll.map((r) => `${r.number}d${r.faces}`).join(" + "));
        }
        break;
      }
      case "inline":
      case "inlineBlock": {
        const inline = entry as { entries: Entry[] };
        lines.push(entriesToText(inline.entries, depth));
        break;
      }
      case "spellcasting": {
        const sc = entry as {
          name: string;
          headerEntries?: Entry[];
          will?: string[];
          daily?: Record<string, string[]>;
          spells?: Record<string, { spells: string[] }>;
        };
        lines.push(indent + sc.name + ".");
        if (sc.headerEntries) lines.push(entriesToText(sc.headerEntries, depth));
        if (sc.will?.length) lines.push(indent + "At will: " + sc.will.map(stripTags).join(", "));
        if (sc.daily) {
          for (const [k, v] of Object.entries(sc.daily)) {
            const perDay = k.replace("e", "");
            lines.push(indent + `${perDay}/day each: ${v.map(stripTags).join(", ")}`);
          }
        }
        if (sc.spells) {
          for (const [level, data] of Object.entries(sc.spells)) {
            const prefix = level === "0" ? "Cantrips" : `${level}${ordSuffix(Number(level))} level`;
            lines.push(indent + `${prefix}: ${data.spells.map(stripTags).join(", ")}`);
          }
        }
        break;
      }
      case "abilityDc": {
        const dc = entry as { name: string; attributes: string[] };
        lines.push(
          indent +
            `${dc.name} save DC = 8 + proficiency bonus + ${dc.attributes.map((a) => ABILITY_ABBR[a] ?? a).join("/")}`,
        );
        break;
      }
      case "abilityAttackMod": {
        const atk = entry as { name: string; attributes: string[] };
        lines.push(
          indent +
            `${atk.name} attack modifier = proficiency bonus + ${atk.attributes.map((a) => ABILITY_ABBR[a] ?? a).join("/")}`,
        );
        break;
      }
      case "hr":
        lines.push(indent + "---");
        break;
      case "refOptionalfeature":
      case "refClassFeature":
      case "refSubclassFeature": {
        const ref = entry as {
          optionalfeature?: string;
          classFeature?: string;
          subclassFeature?: string;
        };
        const refName = ref.optionalfeature ?? ref.classFeature ?? ref.subclassFeature ?? "";
        lines.push(indent + `[See: ${refName.split("|")[0]}]`);
        break;
      }
      default:
        // Unknown entry type — try to extract entries
        if ("entries" in entry && Array.isArray((entry as { entries: unknown }).entries)) {
          const named = entry as { name?: string; entries: Entry[] };
          if (named.name) lines.push(indent + named.name + ".");
          lines.push(entriesToText(named.entries, depth));
        }
        break;
    }
  }

  return lines.filter(Boolean).join("\n");
}

// ═══════════════════════════════════════════════════════
// GENERAL HELPERS
// ═══════════════════════════════════════════════════════

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ordSuffix(n: number): string {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}
