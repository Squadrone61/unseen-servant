/**
 * Per-class ASI / Epic Boon slot enumeration.
 *
 * Source of truth: `ClassDb.features`. Each class's JSON in
 * `packages/shared/src/data/classes/*.json` lists the class levels at which
 * it grants "Ability Score Improvement" and the level-19 "Epic Boon" — no
 * hardcoded class lists here. Per D&D 2024 PHB, ASIs are granted per class,
 * at that class's own level (not the character's total level).
 */

import { getClass } from "../data";
import type { BuilderClassEntry } from "../types";

const ASI_FEATURE_NAME = "Ability Score Improvement";
const EPIC_BOON_FEATURE_NAME = "Epic Boon";

/** Class levels at which this class grants an ASI or Epic Boon feat slot. */
export function asiLevelsForClass(className: string): number[] {
  const cls = getClass(className);
  if (!cls) return [];
  return cls.features
    .filter((f) => f.name === ASI_FEATURE_NAME || f.name === EPIC_BOON_FEATURE_NAME)
    .map((f) => f.level)
    .sort((a, b) => a - b);
}

export interface AsiSlot {
  classIndex: number;
  className: string;
  /** The class level at which this ASI unlocks. */
  classLevel: number;
  /** True when this slot is the lvl-19 Epic Boon feat slot. */
  isEpicBoon: boolean;
}

/** Enumerate all currently-unlocked ASI / Epic Boon slots across all classes. */
export function enumerateAsiSlots(classes: BuilderClassEntry[]): AsiSlot[] {
  const slots: AsiSlot[] = [];
  classes.forEach((c, classIndex) => {
    const cls = getClass(c.name);
    if (!cls) return;
    for (const feature of cls.features) {
      const isAsi = feature.name === ASI_FEATURE_NAME;
      const isEpicBoon = feature.name === EPIC_BOON_FEATURE_NAME;
      if (!isAsi && !isEpicBoon) continue;
      if (feature.level > c.level) continue;
      slots.push({
        classIndex,
        className: c.name,
        classLevel: feature.level,
        isEpicBoon,
      });
    }
  });
  return slots;
}
