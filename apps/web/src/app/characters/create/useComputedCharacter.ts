"use client";

import { useMemo } from "react";
import type { BuilderState } from "./builder-state";
import type { CharacterData, AbilityScores, CharacterSpell } from "@unseen-servant/shared/types";
import type { CharacterIdentifiers } from "@unseen-servant/shared/builders";
import { buildCharacter, getClass, getBackground, getSpell } from "@unseen-servant/shared";

// ---------------------------------------------------------------------------
// Ability score helpers
// ---------------------------------------------------------------------------

function getAbilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Compute final ability scores by applying background bonuses from
 * state.abilityScoreAssignments on top of state.baseAbilities.
 */
function computeFinalAbilities(state: BuilderState): AbilityScores {
  const base = { ...state.baseAbilities };
  for (const [ability, bonus] of Object.entries(state.abilityScoreAssignments)) {
    const key = ability as keyof AbilityScores;
    base[key] = (base[key] ?? 8) + (bonus as number);
  }
  // Apply ASI increases from feat selections
  for (const selection of state.featSelections) {
    if (selection.type === "asi" && selection.asiAbilities) {
      for (const [ability, increase] of Object.entries(selection.asiAbilities)) {
        const key = ability as keyof AbilityScores;
        base[key] = (base[key] ?? 8) + (increase as number);
      }
    }
  }
  return base;
}

/**
 * Compute average HP across all class entries.
 * The primary class (index 0) contributes its full hit die at level 1; all
 * other levels (including multiclass levels) use the average roll (half+1).
 * CON modifier applies once per total level.
 */
function computeMaxHP(classes: Array<{ name: string; level: number }>, conScore: number): number {
  if (classes.length === 0) return 1;
  const conMod = getAbilityMod(conScore);
  let hp = 0;
  let isFirst = true;
  for (const entry of classes) {
    const cls = getClass(entry.name);
    if (!cls) continue;
    const hitDie = cls.hitDiceFaces;
    const averagePerLevel = Math.floor(hitDie / 2) + 1;
    if (isFirst) {
      // Level 1 of primary class: max hit die
      hp += hitDie + conMod;
      if (entry.level > 1) {
        hp += (entry.level - 1) * (averagePerLevel + conMod);
      }
      isFirst = false;
    } else {
      hp += entry.level * (averagePerLevel + conMod);
    }
  }
  return Math.max(1, hp);
}

/**
 * Collect languages granted by species and background from the DB.
 * The DB doesn't expose these as a clean list, so we construct sensible
 * defaults: Common is always granted; background/species choices may expand
 * this, but without resolving full choice trees we fall back to the
 * background's listed skills as a proxy and keep it minimal.
 */
function collectLanguages(state: BuilderState): string[] {
  const langs = new Set<string>(["Common"]);
  // Species choices may include language picks stored under a "language" choiceId
  for (const [choiceId, values] of Object.entries(state.speciesChoices)) {
    if (choiceId.toLowerCase().includes("language")) {
      values.forEach((v) => langs.add(v));
    }
  }
  // Background choices may include language picks
  for (const [choiceId, values] of Object.entries(state.backgroundChoices)) {
    if (choiceId.toLowerCase().includes("language")) {
      values.forEach((v) => langs.add(v));
    }
  }
  return [...langs];
}

/**
 * Collect tool proficiencies from class DB and background DB.
 */
function collectToolProficiencies(state: BuilderState): string[] {
  const tools = new Set<string>();
  const primaryClassName = state.classes[0]?.name;
  if (primaryClassName) {
    const cls = getClass(primaryClassName);
    if (cls) cls.toolProficiencies.forEach((t) => tools.add(t));
  }
  if (state.background) {
    const bg = getBackground(state.background);
    if (bg) bg.tools.forEach((t) => tools.add(t));
  }
  return [...tools];
}

/**
 * Map builder cantrips + preparedSpells to CharacterSpell objects using the
 * D&D database to fill in spell details.
 * Spells are attributed to the primary class (index 0).
 */
function assembleSpells(state: BuilderState): CharacterSpell[] {
  const primaryClassName = state.classes[0]?.name ?? undefined;
  const primarySubclass = state.classes[0]?.subclass ?? null;
  const spells: CharacterSpell[] = [];

  for (const name of state.cantrips) {
    const db = getSpell(name);
    spells.push({
      name,
      level: 0,
      prepared: true,
      alwaysPrepared: false,
      spellSource: "class",
      knownByClass: true,
      sourceClass: primaryClassName,
      school: db?.school,
      castingTime: db?.castingTime,
      range: db?.range,
      components: db?.components,
      duration: db?.duration,
      description: db?.description,
      ritual: db?.ritual,
      concentration: db?.concentration,
    });
  }

  for (const name of state.preparedSpells) {
    const db = getSpell(name);
    spells.push({
      name,
      level: db?.level ?? 1,
      prepared: true,
      alwaysPrepared: false,
      spellSource: "class",
      knownByClass: true,
      sourceClass: primaryClassName,
      school: db?.school,
      castingTime: db?.castingTime,
      range: db?.range,
      components: db?.components,
      duration: db?.duration,
      description: db?.description,
      ritual: db?.ritual,
      concentration: db?.concentration,
    });
  }

  // Always-prepared subclass spells from the primary class's subclass
  if (primarySubclass && primaryClassName) {
    const cls = getClass(primaryClassName);
    const sub = cls?.subclasses.find((s) => s.name.toLowerCase() === primarySubclass.toLowerCase());
    if (sub?.additionalSpells) {
      for (const name of sub.additionalSpells) {
        // Skip if already in prepared list to avoid duplicates
        if (state.preparedSpells.includes(name) || state.cantrips.includes(name)) continue;
        const db = getSpell(name);
        spells.push({
          name,
          level: db?.level ?? 1,
          prepared: true,
          alwaysPrepared: true,
          spellSource: "class",
          knownByClass: false,
          sourceClass: primaryClassName,
          school: db?.school,
          castingTime: db?.castingTime,
          range: db?.range,
          components: db?.components,
          duration: db?.duration,
          description: db?.description,
          ritual: db?.ritual,
          concentration: db?.concentration,
        });
      }
    }
  }

  return spells;
}

/**
 * Collect skill proficiencies from class selections + background DB skills.
 */
function assembleSkillProficiencies(state: BuilderState): string[] {
  const skills = new Set<string>(state.classes[0]?.skills ?? []);
  if (state.background) {
    const bg = getBackground(state.background);
    if (bg) bg.skills.forEach((s) => skills.add(s.toLowerCase()));
  }
  // Species choices may grant skill proficiencies
  for (const [choiceId, values] of Object.entries(state.speciesChoices)) {
    if (choiceId.toLowerCase().includes("skill")) {
      values.forEach((v) => skills.add(v.toLowerCase()));
    }
  }
  // Feat-granted skill proficiencies (e.g. the Skilled feat)
  for (const [_featName, choices] of Object.entries(state.featChoices)) {
    for (const [choiceId, values] of Object.entries(choices)) {
      if (
        choiceId.toLowerCase().includes("skill") ||
        choiceId.toLowerCase().includes("proficiency")
      ) {
        values.forEach((v) => skills.add(v.toLowerCase()));
      }
    }
  }
  return [...skills];
}

/**
 * Collect skill expertise from class choices (Bard/Rogue Expertise) and feat choices.
 * Choice IDs containing "expertise" carry the selected skill names as values.
 */
function assembleSkillExpertise(state: BuilderState): string[] {
  const expertise = new Set<string>();
  const classChoices = state.classes[0]?.choices ?? {};
  for (const [choiceId, values] of Object.entries(classChoices)) {
    if (choiceId.toLowerCase().includes("expertise")) {
      (values as string[]).forEach((v) => expertise.add(v));
    }
  }
  // Also check feat choices for expertise (e.g. Skill Expert feat)
  for (const [_featName, choices] of Object.entries(state.featChoices)) {
    for (const [choiceId, values] of Object.entries(choices)) {
      if (choiceId.toLowerCase().includes("expertise")) {
        values.forEach((v) => expertise.add(v));
      }
    }
  }
  return [...expertise];
}

/**
 * Collect saving throw proficiencies from the class DB.
 */
function assembleSaveProficiencies(state: BuilderState): (keyof AbilityScores)[] {
  const primaryClassName = state.classes[0]?.name;
  if (!primaryClassName) return [];
  const cls = getClass(primaryClassName);
  if (!cls) return [];
  return cls.savingThrows as (keyof AbilityScores)[];
}

// ---------------------------------------------------------------------------
// Main identifier assembly
// ---------------------------------------------------------------------------

function assembleIdentifiers(state: BuilderState): CharacterIdentifiers {
  const finalAbilities = computeFinalAbilities(state);
  const maxHP = computeMaxHP(state.classes, finalAbilities.constitution);

  return {
    name: state.name.trim() || "Unnamed",
    race: state.species ?? "",
    classes: state.classes.map((c) => ({
      name: c.name,
      level: c.level,
      subclass: c.subclass ?? undefined,
    })),
    background: state.background ?? undefined,
    abilities: finalAbilities,
    maxHP,
    skillProficiencies: assembleSkillProficiencies(state),
    skillExpertise: assembleSkillExpertise(state),
    saveProficiencies: assembleSaveProficiencies(state),
    spells: assembleSpells(state),
    equipment: state.equipment,
    languages: collectLanguages(state),
    toolProficiencies: collectToolProficiencies(state),
    traits: {
      personalityTraits: state.traits.personalityTraits || undefined,
      ideals: state.traits.ideals || undefined,
      bonds: state.traits.bonds || undefined,
      flaws: state.traits.flaws || undefined,
    },
    appearance:
      Object.keys(state.appearance).length > 0
        ? (state.appearance as NonNullable<CharacterIdentifiers["appearance"]>)
        : undefined,
    backstory: state.backstory || undefined,
    currency: state.currency,
    source: "builder",
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useComputedCharacter(state: BuilderState): {
  character: CharacterData | null;
  warnings: string[];
} {
  return useMemo(() => {
    // Need at minimum a class and non-zero base abilities to produce anything useful
    const primaryClassName = state.classes[0]?.name;
    if (!primaryClassName || !state.species) {
      return { character: null, warnings: [] };
    }
    // Verify at least one ability score is set (all default to 8, which is > 0,
    // so check class exists in the DB before calling build)
    const cls = getClass(primaryClassName);
    if (!cls) {
      return { character: null, warnings: [`Unknown class: ${primaryClassName}`] };
    }

    try {
      const ids = assembleIdentifiers(state);
      return buildCharacter(ids);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown build error";
      return { character: null, warnings: [`Build error: ${message}`] };
    }
  }, [state]);
}
