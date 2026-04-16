import type { BaseItemDb } from "../types/data";
import { baseItemsArray } from "../data/index";

/**
 * Class-specific weapon-mastery pools.
 *
 * Returns the names of every weapon a member of the given class can pick when
 * choosing weapons whose Mastery property they may use:
 *   - Barbarian: Simple + Martial **Melee** weapons with a Mastery (no ranged).
 *   - Rogue:    Simple + Martial weapons whose properties include Finesse or Light.
 *   - Fighter / Paladin / Ranger: every weapon with a Mastery (Simple + Martial).
 *
 * Used by the character builder to populate the `from` field on the
 * weapon_mastery FeatureChoice so ChoicePicker can render the per-class roster.
 */
export function getEligibleMasteryWeapons(className: string): string[] {
  const withMastery = baseItemsArray.filter((w): w is BaseItemDb =>
    Boolean(w.weapon && w.mastery && w.mastery.length > 0),
  );

  let scoped: BaseItemDb[];
  if (className === "Barbarian") {
    // Melee only — ranged weapons always carry a `range` field.
    scoped = withMastery.filter((w) => !w.range);
  } else if (className === "Rogue") {
    scoped = withMastery.filter((w) => {
      if (w.weaponCategory === "simple") return true;
      if (
        w.weaponCategory === "martial" &&
        w.properties &&
        (w.properties.includes("F") || w.properties.includes("L"))
      ) {
        return true;
      }
      return false;
    });
  } else {
    scoped = withMastery;
  }

  return scoped
    .sort((a, b) => {
      // Simple before Martial; alphabetical inside each category.
      if (a.weaponCategory !== b.weaponCategory) {
        return a.weaponCategory === "simple" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    })
    .map((w) => w.name);
}
