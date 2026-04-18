"use client";

import { useMemo } from "react";
import type { BuilderState } from "./builder-state";
import type { EquipmentState, IdentityState } from "./BuilderContext";
import type { AbilityScores, CharacterData } from "@unseen-servant/shared/types";
import { buildCharacter, getClass } from "@unseen-servant/shared";
import { getAbilities } from "@unseen-servant/shared/character";

/**
 * Compute the resolved ability scores for a builder state (pure base + background
 * + ASI + feat effects, flowing through the effect resolver).
 *
 * If the state can't be built yet (no class/species), returns the pure base
 * abilities as a fallback preview.
 */
export function computeResolvedAbilities(state: BuilderState): AbilityScores {
  const primaryClassName = state.classes[0]?.name;
  if (!primaryClassName || !state.species || !getClass(primaryClassName)) {
    return { ...state.baseAbilities };
  }
  try {
    const { character } = buildCharacter(state);
    return getAbilities(character);
  } catch {
    return { ...state.baseAbilities };
  }
}

export function useComputedCharacter(
  state: BuilderState,
  equipment: EquipmentState,
  identity: IdentityState,
): {
  character: CharacterData | null;
  warnings: string[];
} {
  return useMemo(() => {
    // Need at minimum a class and species to produce anything useful
    const primaryClassName = state.classes[0]?.name;
    if (!primaryClassName || !state.species) {
      return { character: null, warnings: [] };
    }
    // Verify class exists in the DB before calling build
    const cls = getClass(primaryClassName);
    if (!cls) {
      return { character: null, warnings: [`Unknown class: ${primaryClassName}`] };
    }

    try {
      return buildCharacter(state, {
        inventory: equipment.inventory,
        currency: equipment.currency,
        traits: identity.traits,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown build error";
      return { character: null, warnings: [`Build error: ${message}`] };
    }
  }, [state, equipment, identity]);
}
