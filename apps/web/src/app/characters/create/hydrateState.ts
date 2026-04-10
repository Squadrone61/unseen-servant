import type { CharacterData } from "@unseen-servant/shared/types";
import type { BuilderState } from "./builder-state";
import { BUILDER_STEPS } from "./builder-state";

/**
 * Infer the background name from features with source === "background".
 * Features from a background carry the background name in `sourceLabel`
 * (e.g. sourceLabel: "Acolyte"). We take the first unique background label
 * since a character only has one background.
 */
function inferBackground(character: CharacterData): string | null {
  const bgFeature = character.static.features.find((f) => f.source === "background");
  return bgFeature?.sourceLabel ?? null;
}

/**
 * Convert a saved CharacterData back into a BuilderState.
 *
 * This is a best-effort reconstruction. Some builder state (species sub-choices,
 * background sub-choices, ability score method, feat sub-choices) cannot be
 * perfectly reconstructed from the final compiled CharacterData. These fields
 * are left at their defaults. The resulting state is enough to navigate all
 * steps, view and edit values, and re-compile a valid character.
 */
export function hydrateBuilderState(character: CharacterData): BuilderState {
  const s = character.static;

  // Species: prefer the 2024-era `species` field, fall back to `race`
  const species = s.species ?? s.race ?? null;

  // Background: inferred from features (best effort)
  const background = inferBackground(character);

  // Class data from first class entry
  const primaryClass = s.classes[0] ?? null;
  const className = primaryClass?.name ?? null;
  const classLevel = primaryClass?.level ?? 1;
  const subclass = primaryClass?.subclass ?? null;

  // Class skills: skills that have proficient === true
  // (background also grants skills, but we can't cleanly split them without
  // the background DB; include all proficient skills and let the step UI
  // handle any duplicates from background)
  const classSkills = s.skills.filter((sk) => sk.proficient).map((sk) => sk.name);

  // Feat selections: reconstruct from features with source === "feat"
  // We don't know the ASI slot level precisely, so we use requiredLevel if present.
  // type is always "feat" since we can't tell an ASI from CharacterData alone.
  const featSelections = s.features
    .filter((f) => f.source === "feat")
    .map((f, i) => ({
      level: f.requiredLevel ?? 4 + i * 4, // fallback: ASI levels 4, 8, 12...
      type: "feat" as const,
      featName: f.name,
    }));

  // Spells: split cantrips (level 0) from prepared spells (level > 0, prepared)
  const cantrips = s.spells.filter((sp) => sp.level === 0).map((sp) => sp.name);
  const preparedSpells = s.spells
    .filter((sp) => sp.level > 0 && sp.prepared && !sp.alwaysPrepared)
    .map((sp) => sp.name);

  const state: BuilderState = {
    // Navigation: start at species so the user lands at the beginning
    currentStep: "species",
    // completedSteps will be recomputed by LOAD_STATE via recomputeCompletedSteps;
    // providing the full list here as a hint but the reducer recomputes it.
    completedSteps: [...BUILDER_STEPS],

    // Step 1: Species
    species,
    speciesChoices: {}, // sub-choices can't be reconstructed from final data

    // Step 2: Background
    background,
    backgroundChoices: {}, // sub-choices can't be reconstructed
    abilityScoreMode: "two-one",
    abilityScoreAssignments: {}, // bonus assignments can't be split from base scores

    // Step 3: Class
    classes: className
      ? [{ name: className, level: classLevel, subclass, skills: classSkills, choices: {} }]
      : [],
    activeClassIndex: 0,

    // Step 4: Abilities — treat final scores as manual base (already includes
    // background bonuses, ASIs, etc. baked in)
    abilityMethod: "manual",
    baseAbilities: { ...s.abilities },

    // Step 5: Feats & ASIs
    featSelections,
    featChoices: {}, // feat sub-choices can't be reconstructed

    // Step 6: Spells
    cantrips,
    preparedSpells,

    // Step 7: Equipment
    equipmentMode: "starting",
    startingGold: 75,

    // Step 8: Details
    name: s.name,
    appearance: s.appearance ?? {},
    backstory: s.backstory ?? "",
    alignment: "",
    traits: s.traits ?? {},
    equipment: character.dynamic.inventory,
    currency: character.dynamic.currency,
  };

  return state;
}
