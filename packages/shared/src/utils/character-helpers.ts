import type {
  AbilityScores,
  CharacterClass,
  CharacterData,
  CharacterDynamicData,
  CharacterSpeed,
  CharacterStaticData,
  SkillProficiency,
  SavingThrowProficiency,
  SpellSlotLevel,
} from "../types/character";
import type { Spell } from "../types/spell";
import {
  getAC,
  getHP,
  getSpeed,
  getSkills,
  getSavingThrows,
  getSenses,
  getSpellcasting,
  getClassResources,
} from "../character/resolve";

/**
 * Extract the walk speed from a speed value that may be a plain number (legacy)
 * or a CharacterSpeed object.
 */
export function getWalkSpeed(speed: number | CharacterSpeed): number {
  return typeof speed === "number" ? speed : speed.walk;
}

/**
 * Format a CharacterSpeed object as a human-readable string.
 * e.g. { walk: 30, fly: 60 } → "Walk 30 ft, Fly 60 ft"
 */
export function formatSpeed(speed: CharacterSpeed): string {
  const parts = [`Walk ${speed.walk} ft`];
  if (speed.fly) parts.push(`Fly ${speed.fly} ft`);
  if (speed.swim) parts.push(`Swim ${speed.swim} ft`);
  if (speed.climb) parts.push(`Climb ${speed.climb} ft`);
  if (speed.burrow) parts.push(`Burrow ${speed.burrow} ft`);
  return parts.join(", ");
}

/**
 * Get total character level across all classes.
 */
export function getTotalLevel(classes: CharacterClass[]): number {
  return classes.reduce((sum, c) => sum + c.level, 0);
}

/**
 * Calculate ability modifier from ability score.
 * e.g. 10 → 0, 14 → +2, 8 → -1
 */
export function getModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Format modifier as string with sign.
 * e.g. 14 → "+2", 8 → "-1", 10 → "+0"
 */
export function formatModifier(score: number): string {
  const mod = getModifier(score);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/**
 * Get proficiency bonus from total level.
 */
export function getProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

/**
 * Format classes as a readable string.
 * e.g. [{ name: "Fighter", level: 5 }, { name: "Wizard", level: 3 }] → "Fighter 5 / Wizard 3"
 */
export function formatClassString(classes: CharacterClass[]): string {
  return classes
    .map((c) => {
      const sub = c.subclass ? ` (${c.subclass})` : "";
      return `${c.name}${sub} ${c.level}`;
    })
    .join(" / ");
}

/**
 * Build a text block describing a character for the AI system prompt.
 */
export function buildCharacterContextBlock(playerName: string, char: CharacterData): string {
  const s = char.static;
  const d = char.dynamic;
  const totalLevel = getTotalLevel(s.classes);
  const profBonus = getProficiencyBonus(totalLevel);
  const classStr = formatClassString(s.classes);
  const maxHP = getHP(char);
  const ac = getAC(char);
  const speed = getSpeed(char);

  const lines: string[] = [
    `### ${playerName} plays ${s.name}`,
    `**Race:** ${s.race} | **Class:** ${classStr} | **Level:** ${totalLevel}`,
    `**HP:** ${d.currentHP}/${maxHP}${d.tempHP > 0 ? ` (+${d.tempHP} temp)` : ""} | **AC:** ${ac} | **Speed:** ${formatSpeed(speed)}`,
    `**Abilities:** STR ${formatModifier(s.abilities.strength)}, DEX ${formatModifier(s.abilities.dexterity)}, CON ${formatModifier(s.abilities.constitution)}, INT ${formatModifier(s.abilities.intelligence)}, WIS ${formatModifier(s.abilities.wisdom)}, CHA ${formatModifier(s.abilities.charisma)}`,
  ];

  if (d.conditions.length > 0) {
    lines.push(`**Conditions:** ${d.conditions.join(", ")}`);
  }

  if (d.heroicInspiration) {
    lines.push(`**Heroic Inspiration:** Yes (can spend for advantage on any d20 roll)`);
  }

  const activeSpells = s.spells.filter((sp) => getSpellAvailability(sp) === "active");
  const ritualOnlySpells = s.spells.filter((sp) => getSpellAvailability(sp) === "ritual-only");
  if (activeSpells.length > 0) {
    const cantrips = activeSpells.filter((sp) => sp.level === 0).map((sp) => sp.name);
    const spells = activeSpells
      .filter((sp) => sp.level > 0)
      .map((sp) => `${sp.name} (Lvl ${sp.level})`);
    if (cantrips.length > 0) {
      lines.push(`**Cantrips:** ${cantrips.join(", ")}`);
    }
    if (spells.length > 0) {
      lines.push(`**Available Spells:** ${spells.join(", ")}`);
    }
  }
  if (ritualOnlySpells.length > 0) {
    lines.push(
      `**Ritual Only:** ${ritualOnlySpells.map((sp) => `${sp.name} (Lvl ${sp.level})`).join(", ")}`,
    );
  }

  // Proficient skills
  const proficientSkills = getSkills(char)
    .filter((sk) => sk.proficient || sk.expertise)
    .map((sk) => {
      const mod = getSkillModifier(sk, s.abilities, profBonus);
      const tag = sk.expertise ? " (E)" : "";
      return `${SKILL_DISPLAY_NAMES[sk.name] || sk.name} ${formatBonus(mod)}${tag}`;
    });
  if (proficientSkills.length > 0) {
    lines.push(`**Proficient Skills:** ${proficientSkills.join(", ")}`);
  }

  // Proficient saving throws
  const proficientSaves = getSavingThrows(char)
    .filter((sv) => sv.proficient)
    .map((sv) => {
      const mod = getSavingThrowModifier(sv, s.abilities, profBonus);
      return `${ABILITY_NAMES[sv.ability]} ${formatBonus(mod)}`;
    });
  if (proficientSaves.length > 0) {
    lines.push(`**Saving Throw Proficiencies:** ${proficientSaves.join(", ")}`);
  }

  // Spellcasting stats — one line per spellcasting class
  for (const cls of s.classes) {
    const sc = getSpellcasting(char, cls.name);
    if (!sc) continue;
    if (s.classes.length === 1) {
      lines.push(`**Spell Save DC:** ${sc.dc} | **Spell Attack:** ${formatBonus(sc.attackBonus)}`);
    } else {
      lines.push(
        `**${cls.name} Spell Save DC:** ${sc.dc} | **Spell Attack:** ${formatBonus(sc.attackBonus)}`,
      );
    }
  }

  // Spell slot availability
  const slotLines = d.spellSlotsUsed
    .filter((sl) => sl.total > 0)
    .map((sl) => `Lvl ${sl.level}: ${sl.total - sl.used}/${sl.total}`);
  if (slotLines.length > 0) {
    lines.push(`**Spell Slots:** ${slotLines.join(", ")}`);
  }

  // Pact magic slots (Warlock)
  const pactLines = (d.pactMagicSlots || [])
    .filter((sl) => sl.total > 0)
    .map((sl) => `Lvl ${sl.level}: ${sl.total - sl.used}/${sl.total}`);
  if (pactLines.length > 0) {
    lines.push(`**Pact Slots (short rest):** ${pactLines.join(", ")}`);
  }

  // Class resources (Channel Divinity, Ki, Rage, etc.)
  const resources = getClassResources(char);
  if (resources.length > 0) {
    const resLines = resources.map((r) => {
      const used = (d.resourcesUsed || {})[r.name] ?? 0;
      const parts: string[] = [];
      if (r.shortRest) parts.push(`${r.shortRest === "all" ? "all" : r.shortRest} SR`);
      if (r.longRest) parts.push(`${r.longRest === "all" ? "all" : r.longRest} LR`);
      const resetLabel = parts.length > 0 ? parts.join(", ") : "manual";
      return `${r.name}: ${r.maxUses - used}/${r.maxUses} (${resetLabel})`;
    });
    lines.push(`**Resources:** ${resLines.join(", ")}`);
  }

  if (s.features.length > 0) {
    lines.push(`**Features:** ${s.features.map((f) => f.featureName ?? f.dbName).join(", ")}`);
  }

  // Languages & senses
  if (s.languages.length > 0) {
    lines.push(`**Languages:** ${s.languages.join(", ")}`);
  }
  const senses = getSenses(char);
  if (senses.length > 0) {
    lines.push(`**Senses:** ${senses.join(", ")}`);
  }

  const equippedItems = d.inventory.filter((item) => item.equipped);
  if (equippedItems.length > 0) {
    lines.push(`**Equipped:** ${equippedItems.map((i) => i.name).join(", ")}`);
  }

  // Depletion warnings — help AI avoid impossible actions
  const warnings: string[] = [];
  if (d.currentHP === 0) {
    warnings.push("UNCONSCIOUS at 0 HP — needs death saves");
  } else if (maxHP > 0 && d.currentHP / maxHP <= 0.25) {
    warnings.push(`LOW HP (${d.currentHP}/${maxHP})`);
  }
  for (const sl of d.spellSlotsUsed) {
    if (sl.total > 0 && sl.used >= sl.total) {
      warnings.push(`NO level ${sl.level} spell slots`);
    }
  }
  for (const sl of d.pactMagicSlots || []) {
    if (sl.total > 0 && sl.used >= sl.total) {
      warnings.push(`NO pact slots (level ${sl.level})`);
    }
  }
  if (warnings.length > 0) {
    lines.push(`**\u26A0\uFE0F WARNING:** ${warnings.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Create initial dynamic data. Phase 7: maxHP is derived at resolver time, so
 * callers must seed currentHP externally (e.g., via buildCharacter which
 * already computes maxHP via effects).
 */
export function createInitialDynamicData(initialHP: number): CharacterDynamicData {
  const spellSlotsUsed: SpellSlotLevel[] = [];
  return {
    currentHP: initialHP,
    tempHP: 0,
    spellSlotsUsed,
    pactMagicSlots: [],
    resourcesUsed: {},
    conditions: [],
    deathSaves: { successes: 0, failures: 0 },
    inventory: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    heroicInspiration: false,
  };
}

/**
 * Merge a re-import: replace static data, preserve dynamic state.
 * Updates maxHP-relative currentHP if maxHP changed.
 */
export function mergeReimport(
  existing: CharacterData,
  newStaticData: CharacterStaticData,
  newDynamic: CharacterDynamicData,
): CharacterData {
  // Phase 7: maxHP is no longer stored on static; getHP(existing) derives it from
  // effects at accessor time. newDynamic.currentHP is seeded to newMax by buildCharacter.
  const oldMax = getHP(existing);
  const newMax = newDynamic.currentHP; // buildCharacter seeds currentHP to maxHP
  const dynamic = { ...existing.dynamic };

  // If maxHP changed, scale current HP proportionally
  if (oldMax !== newMax && oldMax > 0) {
    const ratio = dynamic.currentHP / oldMax;
    dynamic.currentHP = Math.max(1, Math.round(ratio * newMax));
  }

  // Update spell slots structure (totals may change), but preserve used counts where possible
  const oldSlotMap = new Map(dynamic.spellSlotsUsed.map((s) => [s.level, s.used]));
  dynamic.spellSlotsUsed = newDynamic.spellSlotsUsed.map((slot) => ({
    ...slot,
    used: Math.min(oldSlotMap.get(slot.level) ?? 0, slot.total),
  }));

  // Merge pact magic slots similarly
  const oldPactMap = new Map((dynamic.pactMagicSlots || []).map((s) => [s.level, s.used]));
  dynamic.pactMagicSlots = (newDynamic.pactMagicSlots || []).map((slot) => ({
    ...slot,
    used: Math.min(oldPactMap.get(slot.level) ?? 0, slot.total),
  }));

  // Preserve resource usage, clamp to new maxUses
  const oldResources = dynamic.resourcesUsed || {};
  dynamic.resourcesUsed = {};
  const newChar: CharacterData = { builder: existing.builder, static: newStaticData, dynamic };
  for (const r of getClassResources(newChar)) {
    const maxUses = typeof r.maxUses === "number" ? r.maxUses : 0;
    dynamic.resourcesUsed[r.name] = Math.min(oldResources[r.name] ?? 0, maxUses);
  }

  return {
    builder: existing.builder,
    static: newStaticData,
    dynamic,
  };
}

/**
 * Mapping of ability score keys to short display names.
 */
export const ABILITY_NAMES: Record<keyof AbilityScores, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

/**
 * Mapping of ability score keys to full display names.
 */
export const ABILITY_FULL_NAMES: Record<keyof AbilityScores, string> = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
  charisma: "Charisma",
};

/**
 * Mapping of skill slugs to human-readable display names.
 */
export const SKILL_DISPLAY_NAMES: Record<string, string> = {
  acrobatics: "Acrobatics",
  "animal-handling": "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  "sleight-of-hand": "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

/**
 * Calculate the total modifier for a skill.
 */
export function getSkillModifier(
  skill: SkillProficiency,
  abilities: AbilityScores,
  proficiencyBonus: number,
): number {
  const abilityMod = getModifier(abilities[skill.ability]);
  let total = abilityMod;
  if (skill.expertise) {
    total += proficiencyBonus * 2;
  } else if (skill.proficient) {
    total += proficiencyBonus;
  }
  if (skill.bonus) {
    total += skill.bonus;
  }
  return total;
}

/**
 * Calculate the total modifier for a saving throw.
 */
export function getSavingThrowModifier(
  save: SavingThrowProficiency,
  abilities: AbilityScores,
  proficiencyBonus: number,
): number {
  const abilityMod = getModifier(abilities[save.ability]);
  let total = abilityMod;
  if (save.proficient) {
    total += proficiencyBonus;
  }
  if (save.bonus) {
    total += save.bonus;
  }
  return total;
}

/**
 * Format a number as a signed modifier string.
 * e.g. 3 → "+3", -1 → "-1", 0 → "+0"
 */
export function formatBonus(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/**
 * Spell availability tier for display purposes.
 * - "active": cantrips, prepared, always-prepared, racial/feat spells — fully usable
 * - "ritual-only": known ritual spells not prepared (wizard spellbook) — castable as ritual
 * - "known": in spellbook/known list but not prepared — cannot cast currently
 */
export type SpellAvailability = "active" | "ritual-only" | "known";

/**
 * Determine the availability tier of a spell for display.
 */
export function getSpellAvailability(spell: Spell): SpellAvailability {
  // Cantrips are always active
  if (spell.level === 0) return "active";
  // Always-prepared from class/subclass features
  if (spell.alwaysPrepared) return "active";
  // Race/feat/item spells are always available
  if (spell.spellSource === "race" || spell.spellSource === "feat" || spell.spellSource === "item")
    return "active";
  // User-prepared spells
  if (spell.prepared) return "active";
  // Known ritual spells (e.g. wizard spellbook) — castable as ritual only
  if (spell.knownByClass && spell.ritual) return "ritual-only";
  // Known but not prepared
  return "known";
}
