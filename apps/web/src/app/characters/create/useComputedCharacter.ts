"use client";

import { useMemo } from "react";
import type { BuilderState } from "./builder-state";
import type { CharacterData } from "@unseen-servant/shared/types";
import { buildCharacter, computeFinalAbilities, getClass } from "@unseen-servant/shared";

export { computeFinalAbilities };

export function useComputedCharacter(state: BuilderState): {
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
      return buildCharacter(state);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown build error";
      return { character: null, warnings: [`Build error: ${message}`] };
    }
  }, [state]);
}
