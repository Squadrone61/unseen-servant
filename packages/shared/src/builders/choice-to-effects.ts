/**
 * choice-to-effects.ts — Unified choice → EffectBundle resolver
 *
 * Converts a single FeatureChoice + its selected values into one or more
 * EffectBundles. This is the single authoritative translation layer between
 * BuilderState choice selections and the EffectBundle array that the resolver
 * consumes.
 *
 * Pool handling table:
 *   fighting_style          → getFeat(name).effects as bundle; recurse into feat.choices[]
 *   feat                    → same as fighting_style
 *   skill_proficiency       → proficiency property per pick
 *   skill_expertise         → expertise property per pick
 *   skill_proficiency_or_expertise → proficiency OR expertise depending on resolvedProficienciesSoFar
 *   tool                    → proficiency:tool property per pick
 *   language                → proficiency:language property per pick
 *   ability_score           → handled via options branch (each option carries modifiers)
 *   spell_cantrip           → spell_grant property per pick (at_will)
 *   options-based           → emit each selected option's inline effects as a bundle
 */

import type { FeatureChoice, EffectBundle, Property } from "../types/effects";
import type { BuilderState } from "../types/builder";
import { getFeat } from "../data/index";

// ---------------------------------------------------------------------------
// Source descriptor
// ---------------------------------------------------------------------------

export type ChoiceSource = {
  kind: "class-feature" | "subclass-feature" | "species" | "background" | "feat";
  sourceName: string;
  featureName?: string;
  level?: number;
};

// ---------------------------------------------------------------------------
// SKILL_DISPLAY_NAMES helper
// ---------------------------------------------------------------------------

const SKILL_DISPLAY_NAMES: Record<string, string> = {
  acrobatics: "Acrobatics",
  "animal handling": "Animal Handling",
  animal_handling: "Animal Handling",
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
  "sleight of hand": "Sleight of Hand",
  sleight_of_hand: "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

function normalizeSkillName(raw: string): string {
  return SKILL_DISPLAY_NAMES[raw.toLowerCase()] ?? raw;
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Convert a single FeatureChoice + its selected values into EffectBundles.
 *
 * @param choice  - The FeatureChoice from the DB entity
 * @param selectedValues - The player's picks (from BuilderState)
 * @param source  - Where this choice comes from (for bundle id + source tracking)
 * @param state   - Full BuilderState (used for feat sub-choice recursion)
 * @param resolvedProficienciesSoFar - Accumulated proficient skills (for skill_proficiency_or_expertise)
 */
function choiceToEffects(
  choice: FeatureChoice,
  selectedValues: string[],
  source: ChoiceSource,
  state: BuilderState,
  resolvedProficienciesSoFar: Set<string>,
): EffectBundle[] {
  if (!selectedValues || selectedValues.length === 0) return [];

  // Only process permanent choices (runtime choices are not build-time bundles)
  if (choice.timing !== "permanent") return [];

  const bundles: EffectBundle[] = [];

  const bundleId = (value: string) => `${source.kind}:${source.sourceName}:${choice.id}:${value}`;

  const effectSource = (() => {
    switch (source.kind) {
      case "class-feature":
      case "subclass-feature":
        return {
          type: (source.kind === "class-feature" ? "class" : "subclass") as "class" | "subclass",
          name: source.sourceName,
          featureName: source.featureName,
          level: source.level,
        };
      case "species":
        return { type: "species" as const, name: source.sourceName };
      case "background":
        return { type: "background" as const, name: source.sourceName };
      case "feat":
        return { type: "feat" as const, name: source.sourceName };
    }
  })();

  if ("options" in choice && choice.options) {
    // Options-based choice: emit each selected option's inline effects
    for (const label of selectedValues) {
      const option = choice.options.find((o) => o.label === label);
      if (!option?.effects) continue;

      bundles.push({
        id: bundleId(label),
        source: effectSource,
        lifetime: { type: "permanent" },
        effects: option.effects,
      });

      // Recurse into nested choices on the option
      if (option.choices) {
        const subPicks = state.featChoices[source.sourceName] ?? {};
        for (const subChoice of option.choices) {
          if (subChoice.timing !== "permanent") continue;
          const subSelected = subPicks[subChoice.id] ?? [];
          const subBundles = choiceToEffects(
            subChoice,
            subSelected,
            source,
            state,
            resolvedProficienciesSoFar,
          );
          bundles.push(...subBundles);
        }
      }
    }
    return bundles;
  }

  // Pool-based choices
  const pool = (choice as { pool: string }).pool;

  switch (pool) {
    case "fighting_style":
    case "feat": {
      for (const featName of selectedValues) {
        const dbFeat = getFeat(featName);
        if (!dbFeat) continue;

        if (dbFeat.effects) {
          bundles.push({
            id: bundleId(featName),
            source: effectSource,
            lifetime: { type: "permanent" },
            effects: dbFeat.effects,
          });
        }

        // Recurse into the feat's own choices
        if (dbFeat.choices) {
          const featPicks = state.featChoices[featName] ?? {};
          const subSource: ChoiceSource = {
            kind: "feat",
            sourceName: featName,
          };
          for (const subChoice of dbFeat.choices) {
            if (subChoice.timing !== "permanent") continue;
            const subSelected = featPicks[subChoice.id] ?? [];
            const subBundles = choiceToEffects(
              subChoice,
              subSelected,
              subSource,
              state,
              resolvedProficienciesSoFar,
            );
            bundles.push(...subBundles);
          }
        }
      }
      break;
    }

    case "skill_proficiency": {
      const props: Property[] = selectedValues.map((v) => ({
        type: "proficiency",
        category: "skill",
        value: normalizeSkillName(v),
      }));
      if (props.length > 0) {
        bundles.push({
          id: bundleId(selectedValues.join(",")),
          source: effectSource,
          lifetime: { type: "permanent" },
          effects: { properties: props },
        });
        // Accumulate for subsequent skill_proficiency_or_expertise resolution
        for (const v of selectedValues) {
          resolvedProficienciesSoFar.add(normalizeSkillName(v).toLowerCase());
        }
      }
      break;
    }

    case "skill_expertise": {
      const props: Property[] = [];
      for (const v of selectedValues) {
        const display = normalizeSkillName(v);
        props.push({ type: "expertise", skill: display as import("../types/effects").Skill });
      }
      if (props.length > 0) {
        bundles.push({
          id: bundleId(selectedValues.join(",")),
          source: effectSource,
          lifetime: { type: "permanent" },
          effects: { properties: props },
        });
      }
      break;
    }

    case "skill_proficiency_or_expertise": {
      // Deferred: caller must handle this pool in pass 2 with the accumulated set.
      // Returning empty here; the caller handles this separately.
      break;
    }

    case "tool": {
      const props: Property[] = selectedValues.map((v) => ({
        type: "proficiency" as const,
        category: "tool" as const,
        value: v,
      }));
      if (props.length > 0) {
        bundles.push({
          id: bundleId(selectedValues.join(",")),
          source: effectSource,
          lifetime: { type: "permanent" },
          effects: { properties: props },
        });
      }
      break;
    }

    case "language": {
      const props: Property[] = selectedValues.map((v) => ({
        type: "proficiency" as const,
        category: "language" as const,
        value: v,
      }));
      if (props.length > 0) {
        bundles.push({
          id: bundleId(selectedValues.join(",")),
          source: effectSource,
          lifetime: { type: "permanent" },
          effects: { properties: props },
        });
      }
      break;
    }

    case "spell_cantrip": {
      const props: Property[] = selectedValues.map((v) => ({
        type: "spell_grant" as const,
        spell: v,
        usage: "at_will" as const,
      }));
      if (props.length > 0) {
        bundles.push({
          id: bundleId(selectedValues.join(",")),
          source: effectSource,
          lifetime: { type: "permanent" },
          effects: { properties: props },
        });
      }
      break;
    }

    case "weapon_mastery": {
      const props: Property[] = selectedValues.map((v) => ({
        type: "weapon_mastery_grant" as const,
        weapon: v,
      }));
      if (props.length > 0) {
        bundles.push({
          id: bundleId(selectedValues.join(",")),
          source: effectSource,
          lifetime: { type: "permanent" },
          effects: { properties: props },
        });
      }
      break;
    }

    case "metamagic": {
      const props: Property[] = selectedValues.map((v) => ({
        type: "metamagic_grant" as const,
        metamagic: v,
      }));
      if (props.length > 0) {
        bundles.push({
          id: bundleId(selectedValues.join(",")),
          source: effectSource,
          lifetime: { type: "permanent" },
          effects: { properties: props },
        });
      }
      break;
    }

    case "ability_score": {
      // ability_score pool choices are handled via options-based branch.
      // Pool form is a fallback — emit nothing (caller handles ability assignments separately).
      break;
    }
  }

  return bundles;
}

/**
 * Resolve skill_proficiency_or_expertise choices in pass 2,
 * after all pass-1 proficiencies have been accumulated.
 */
export function resolveSkillProfOrExpertise(
  choice: FeatureChoice,
  selectedValues: string[],
  source: ChoiceSource,
  resolvedProficienciesSoFar: Set<string>,
): EffectBundle[] {
  if (!selectedValues || selectedValues.length === 0) return [];
  if (choice.timing !== "permanent") return [];
  if (!("pool" in choice) || (choice as { pool: string }).pool !== "skill_proficiency_or_expertise")
    return [];

  const effectSource = (() => {
    switch (source.kind) {
      case "class-feature":
      case "subclass-feature":
        return {
          type: (source.kind === "class-feature" ? "class" : "subclass") as "class" | "subclass",
          name: source.sourceName,
          featureName: source.featureName,
          level: source.level,
        };
      case "species":
        return { type: "species" as const, name: source.sourceName };
      case "background":
        return { type: "background" as const, name: source.sourceName };
      case "feat":
        return { type: "feat" as const, name: source.sourceName };
    }
  })();

  const props: Property[] = [];
  for (const v of selectedValues) {
    const display = normalizeSkillName(v);
    const key = display.toLowerCase();
    if (resolvedProficienciesSoFar.has(key)) {
      props.push({ type: "expertise", skill: display as import("../types/effects").Skill });
    } else {
      props.push({ type: "proficiency", category: "skill", value: display });
      resolvedProficienciesSoFar.add(key);
    }
  }

  if (props.length === 0) return [];

  const bundleId = `${source.kind}:${source.sourceName}:${choice.id}:${selectedValues.join(",")}`;
  return [
    {
      id: bundleId,
      source: effectSource,
      lifetime: { type: "permanent" },
      effects: { properties: props },
    },
  ];
}

/**
 * Walk all choices on a DB entity and collect EffectBundles for all pool-based
 * choices EXCEPT skill_proficiency_or_expertise (handled separately in pass 2).
 */
export function collectChoiceEffectsPass1(
  choices: FeatureChoice[],
  selectedByChoiceId: Record<string, string[]>,
  source: ChoiceSource,
  state: BuilderState,
  resolvedProficienciesSoFar: Set<string>,
): {
  bundles: EffectBundle[];
  deferredChoices: Array<{ choice: FeatureChoice; selected: string[] }>;
} {
  const bundles: EffectBundle[] = [];
  const deferredChoices: Array<{ choice: FeatureChoice; selected: string[] }> = [];

  for (const choice of choices) {
    if (choice.timing !== "permanent") continue;

    const selected = selectedByChoiceId[choice.id] ?? [];

    if (
      "pool" in choice &&
      (choice as { pool: string }).pool === "skill_proficiency_or_expertise"
    ) {
      deferredChoices.push({ choice, selected });
      continue;
    }

    const newBundles = choiceToEffects(choice, selected, source, state, resolvedProficienciesSoFar);
    bundles.push(...newBundles);
  }

  return { bundles, deferredChoices };
}
