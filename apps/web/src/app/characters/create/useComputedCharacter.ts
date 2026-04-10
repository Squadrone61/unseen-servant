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
 * Compute average HP at the given level for a class, using average hit die
 * result (half + 1 for levels 2+) plus CON modifier per level.
 */
function computeMaxHP(className: string, classLevel: number, conScore: number): number {
  const cls = getClass(className);
  if (!cls) return 1;
  const hitDie = cls.hitDiceFaces;
  const conMod = getAbilityMod(conScore);
  // Level 1: full hit die + CON mod; subsequent levels: average (half+1) + CON mod
  const averagePerLevel = Math.floor(hitDie / 2) + 1;
  return hitDie + conMod + Math.max(0, classLevel - 1) * (averagePerLevel + conMod);
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
  if (state.className) {
    const cls = getClass(state.className);
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
 */
function assembleSpells(state: BuilderState): CharacterSpell[] {
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
      sourceClass: state.className ?? undefined,
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
      sourceClass: state.className ?? undefined,
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

  // Always-prepared subclass spells
  if (state.subclass && state.className) {
    const cls = getClass(state.className);
    const sub = cls?.subclasses.find((s) => s.name.toLowerCase() === state.subclass?.toLowerCase());
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
          sourceClass: state.className ?? undefined,
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
  const skills = new Set<string>(state.classSkills);
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
  for (const [choiceId, values] of Object.entries(state.classChoices)) {
    if (choiceId.toLowerCase().includes("expertise")) {
      values.forEach((v) => expertise.add(v));
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
  if (!state.className) return [];
  const cls = getClass(state.className);
  if (!cls) return [];
  return cls.savingThrows as (keyof AbilityScores)[];
}

// ---------------------------------------------------------------------------
// Main identifier assembly
// ---------------------------------------------------------------------------

function assembleIdentifiers(state: BuilderState): CharacterIdentifiers {
  const finalAbilities = computeFinalAbilities(state);
  const maxHP = computeMaxHP(state.className ?? "", state.classLevel, finalAbilities.constitution);

  return {
    name: state.name.trim() || "Unnamed",
    race: state.species ?? "",
    classes: [
      {
        name: state.className ?? "",
        level: state.classLevel,
        subclass: state.subclass ?? undefined,
      },
    ],
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
    if (!state.className || !state.species) {
      return { character: null, warnings: [] };
    }
    // Verify at least one ability score is set (all default to 8, which is > 0,
    // so check class exists in the DB before calling build)
    const cls = getClass(state.className);
    if (!cls) {
      return { character: null, warnings: [`Unknown class: ${state.className}`] };
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
