/**
 * resolveActionRef — look up a DB entity by source + name and return its ActionEffect.
 *
 * Used by MCP tools (apply_damage, apply_area_effect, show_aoe, roll_dice) to
 * auto-resolve damage dice, save DC, save ability, and area shape from the DB
 * rather than requiring the caller to pass explicit values.
 *
 * Phase 12 of the data-lifecycle refactor.
 */

import type { ActionEffect } from "../types/effects";
import { getSpell, getBaseItem, getMagicItem, getMonster } from "./index";

/** Which DB category the named entity comes from. */
export type ActionRefSource = "spell" | "weapon" | "item" | "monster";

export interface ActionRef {
  /** Which DB category to search. */
  source: ActionRefSource;
  /** Entity name (case-insensitive). For weapons this is the base item name. */
  name: string;
  /**
   * For monsters: which named entry within the action/bonus/reaction/legendary/trait
   * arrays to use.  Required when source="monster".
   */
  monsterActionName?: string;
}

export interface ResolvedActionRef {
  /** The raw ActionEffect from the DB entity, or null if not found / not structured. */
  action: ActionEffect | null;
  /** Human-readable display name for logging ("Fireball", "Longsword", "Adult Red Dragon: Fire Breath"). */
  displayName: string;
}

/**
 * Resolve an ActionRef to a raw ActionEffect (no context substitution).
 *
 * Context substitution (spell_save_dc → caster's DC, upcast scaling) is
 * handled separately by `getAction(entity, context)` from effect-resolver.
 * Call this first to get the entity, then pass the entity to `getAction` with
 * the appropriate context if you need those substitutions.
 */
export function resolveActionRef(ref: ActionRef): ResolvedActionRef {
  switch (ref.source) {
    case "spell": {
      const spell = getSpell(ref.name);
      if (!spell) return { action: null, displayName: ref.name };
      return {
        action: spell.effects?.action ?? null,
        displayName: spell.name,
      };
    }

    case "weapon": {
      const base = getBaseItem(ref.name);
      if (!base) return { action: null, displayName: ref.name };
      return {
        action: base.effects?.action ?? null,
        displayName: base.name,
      };
    }

    case "item": {
      const magic = getMagicItem(ref.name);
      if (!magic) return { action: null, displayName: ref.name };
      return {
        action: magic.effects?.action ?? null,
        displayName: magic.name,
      };
    }

    case "monster": {
      const mon = getMonster(ref.name);
      if (!mon) return { action: null, displayName: ref.name };

      const actionName = ref.monsterActionName;
      if (!actionName) {
        // No specific action requested — return null (monster-level effects are on action entries)
        return { action: null, displayName: mon.name };
      }

      // Search across all action arrays
      const allArrays = [mon.action, mon.legendary, mon.reaction, mon.bonus, mon.trait]
        .filter((arr): arr is NonNullable<typeof arr> => Array.isArray(arr))
        .flat();

      const entry = allArrays.find(
        (a) =>
          a.name.toLowerCase() === actionName.toLowerCase() ||
          // Handle recharge suffixes like "Fire Breath {@recharge 5}" — match by prefix
          a.name.toLowerCase().startsWith(actionName.toLowerCase()),
      );

      if (!entry) {
        return { action: null, displayName: `${mon.name}: ${actionName}` };
      }

      return {
        action: entry.action ?? null,
        displayName: `${mon.name}: ${entry.name}`,
      };
    }
  }
}
