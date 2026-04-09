// 5e.tools Decode Maps + Format Helpers + Tag Parser
// Runtime "translation layer" for coded 5e.tools fields

import type { Entry } from "../types/entry-types";
import type { MonsterDb } from "../types/data";

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

// ═══════════════════════════════════════════════════════
// MONSTER FORMAT FUNCTIONS
// ═══════════════════════════════════════════════════════

export function formatMonsterSize(sizes: string[]): string {
  return sizes.map((s: string) => SIZE_MAP[s] ?? s).join(" or ");
}

export function formatMonsterType(type: MonsterDb["type"]): string {
  if (typeof type === "string") return capitalize(type);
  let result = capitalize(type.type);
  if (type.tags?.length) {
    const tags = type.tags.map((t: string | { tag: string; prefix?: string }) =>
      typeof t === "string" ? t : t.tag,
    );
    result += ` (${tags.join(", ")})`;
  }
  return result;
}

export function formatMonsterAc(acs: MonsterDb["ac"]): string {
  return acs
    .map((ac: number | { ac: number; from?: string[]; condition?: string }) => {
      if (typeof ac === "number") return String(ac);
      let result = String(ac.ac);
      const notes: string[] = [];
      if (ac.from?.length) notes.push(ac.from.map((f: string) => stripTags(f)).join(", "));
      if (ac.condition) notes.push(stripTags(ac.condition));
      if (notes.length) result += ` (${notes.join("; ")})`;
      return result;
    })
    .join(", ");
}

export function formatMonsterHp(hp: MonsterDb["hp"]): string {
  if (hp.special) return hp.special;
  const parts: string[] = [];
  if (hp.average != null) parts.push(String(hp.average));
  if (hp.formula) parts.push(`(${hp.formula})`);
  return parts.join(" ") || "—";
}

export function formatMonsterSpeed(speed: MonsterDb["speed"]): string {
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
  fmt(speed["walk"] as number | { number: number; condition?: string } | undefined);
  fmt(speed["fly"] as number | { number: number; condition?: string } | undefined, "fly");
  fmt(speed["swim"] as number | { number: number; condition?: string } | undefined, "swim");
  fmt(speed["climb"] as number | { number: number; condition?: string } | undefined, "climb");
  fmt(speed["burrow"] as number | { number: number; condition?: string } | undefined, "burrow");
  if (speed.hover) parts.push("(hover)");
  return parts.join(", ") || "0 ft.";
}

export function formatMonsterCr(cr: MonsterDb["cr"]): string {
  if (typeof cr === "string") return cr;
  let result = cr.cr;
  if (cr.lair) result += ` (${cr.lair} in lair)`;
  if (cr.coven) result += ` (${cr.coven} in coven)`;
  return result;
}

export function crToNumber(cr: MonsterDb["cr"]): number {
  const crStr = typeof cr === "string" ? cr : cr.cr;
  if (crStr.includes("/")) {
    const [num, den] = crStr.split("/");
    return Number(num) / Number(den);
  }
  return Number(crStr);
}

export function crToXp(cr: MonsterDb["cr"]): number {
  const crStr = typeof cr === "string" ? cr : cr.cr;
  return CR_XP_MAP[crStr] ?? 0;
}

export function getAbilityScores(monster: MonsterDb): Record<string, number> {
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
    .map(([ab, val]: [string, string]) => `${ABILITY_ABBR[ab] ?? ab.toUpperCase()} ${val}`)
    .join(", ");
}

export function formatSkills(skills: Record<string, string>): string {
  return Object.entries(skills)
    .map(([skill, val]: [string, string]) => `${capitalize(skill)} ${val}`)
    .join(", ");
}

export function flattenResistances(entries: NonNullable<MonsterDb["resist"]>): string {
  return entries
    .map((e: string | { resist?: string[]; note?: string; cond?: boolean }) => {
      if (typeof e === "string") return e;
      const types = e.resist ?? [];
      let result = types.join(", ");
      if (e.note) result += ` ${e.note}`;
      return result;
    })
    .join("; ");
}

export function flattenImmunities(entries: NonNullable<MonsterDb["immune"]>): string {
  return entries
    .map((e: string | { immune?: string[]; note?: string; cond?: boolean }) => {
      if (typeof e === "string") return e;
      const types = e.immune ?? [];
      let result = types.join(", ");
      if (e.note) result += ` ${e.note}`;
      return result;
    })
    .join("; ");
}

export function flattenConditionImmunities(
  entries: NonNullable<MonsterDb["conditionImmune"]>,
): string {
  return entries
    .map((e: string | { conditionImmune: string[]; note?: string }) => {
      if (typeof e === "string") return e;
      let result = e.conditionImmune.join(", ");
      if (e.note) result += ` ${e.note}`;
      return result;
    })
    .join("; ");
}

// ═══════════════════════════════════════════════════════
// FEAT FORMAT FUNCTIONS
// ═══════════════════════════════════════════════════════

export function formatFeatCategory(code: string): string {
  return FEAT_CAT_MAP[code] ?? code;
}

// ═══════════════════════════════════════════════════════
// SPECIES FORMAT FUNCTIONS
// ═══════════════════════════════════════════════════════

export function formatSpeciesSize(sizes: string[]): string {
  return sizes.map((s: string) => SIZE_MAP[s] ?? s).join(" or ");
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

// ═══════════════════════════════════════════════════════
// OPTIONAL FEATURE FORMAT FUNCTIONS
// ═══════════════════════════════════════════════════════

export function formatOptionalFeatureType(types: string[]): string {
  return types.map((t: string) => OPT_FEAT_TYPE_MAP[t] ?? t).join(", ");
}

/** All 18 D&D 5e skills → governing ability */
type AbilityName =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

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
  return text.replace(TAG_REGEX, (_match: string, type: string, content: string) => {
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
  const types = code.split(",").map((c: string) => {
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
          lines.push(indent + table.colLabels.map((l: string) => stripTags(String(l))).join(" | "));
        }
        for (const row of table.rows) {
          lines.push(
            indent +
              row
                .map((cell: string | Entry) =>
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
          lines.push(
            dice.toRoll
              .map((r: { number: number; faces: number }) => `${r.number}d${r.faces}`)
              .join(" + "),
          );
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
        if (sc.will?.length)
          lines.push(indent + "At will: " + sc.will.map((s: string) => stripTags(s)).join(", "));
        if (sc.daily) {
          for (const [k, v] of Object.entries(sc.daily)) {
            const perDay = k.replace("e", "");
            lines.push(
              indent +
                `${perDay}/day each: ${(v as string[]).map((s: string) => stripTags(s)).join(", ")}`,
            );
          }
        }
        if (sc.spells) {
          for (const [level, data] of Object.entries(sc.spells)) {
            const prefix = level === "0" ? "Cantrips" : `${level}${ordSuffix(Number(level))} level`;
            lines.push(
              indent +
                `${prefix}: ${(data as { spells: string[] }).spells.map((s: string) => stripTags(s)).join(", ")}`,
            );
          }
        }
        break;
      }
      case "abilityDc": {
        const dc = entry as { name: string; attributes: string[] };
        lines.push(
          indent +
            `${dc.name} save DC = 8 + proficiency bonus + ${dc.attributes.map((a: string) => ABILITY_ABBR[a] ?? a).join("/")}`,
        );
        break;
      }
      case "abilityAttackMod": {
        const atk = entry as { name: string; attributes: string[] };
        lines.push(
          indent +
            `${atk.name} attack modifier = proficiency bonus + ${atk.attributes.map((a: string) => ABILITY_ABBR[a] ?? a).join("/")}`,
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
