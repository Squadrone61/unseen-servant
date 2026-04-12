// === Unified Item Type ===
//
// Single shape replacing InventoryItem. Weapon/armor intrinsics are copied in
// from DB at add time; mechanical behavior (magic bonuses, resistance-on-wear)
// lives in the item's EntityEffects. Attack bonus is computed on demand via
// getWeaponAttack(char, item) in character/resolve.ts. Damage dice are stored
// as a DB snapshot on weapon.damage at add time.
//
// Phase 10 note: when weapon EntityEffects.action is populated for all weapons,
// damage and range may be derivable from the DB entry directly and this snapshot
// could be dropped. Until then, the snapshot is the stable display source.

import type { DamageType } from "./effects";

/**
 * A character inventory item — one shape for all item kinds.
 *
 * Weapon intrinsics (damage, damageType, range, versatile, properties, mastery)
 * are copied from BaseItemDb at add time so renderers don't need a DB lookup.
 * Attack bonus is NOT stored — call getWeaponAttack(char, item) from
 * packages/shared/src/character/resolve.ts.
 *
 * Armor intrinsics (baseAc, dexCap, strReq, stealthDisadvantage) are stored
 * since they feed the AC formula and are static per item type.
 */
export interface Item {
  name: string;
  quantity: number;
  equipped: boolean;

  // --- Optional metadata ---
  attuned?: boolean;
  weight?: number; // in lbs
  rarity?: string; // "Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"
  /** Whether this item requires attunement to use (property of the item, not current state). */
  attunement?: boolean;
  description?: string; // Full text description (HTML tags stripped)
  /** Starting equipment pack this item came from, e.g. "Explorer's Pack". */
  fromPack?: string;

  // --- Weapon intrinsics (undefined for non-weapons) ---
  /**
   * Intrinsic weapon properties copied from BaseItemDb at add time.
   *
   * damage / damageType / range / versatile are snapshot values from the DB.
   * Attack bonus is NOT stored here — use getWeaponAttack(char, item).
   *
   * Phase 10: once EntityEffects.action is populated on all weapons in the DB,
   * these snapshot fields may be superseded by action-driven derivation.
   */
  weapon?: {
    /** Primary damage dice: e.g. "1d8". */
    damage: string;
    /** Primary damage type: e.g. "slashing". */
    damageType: DamageType;
    /** Weapon properties: ["Versatile", "Light", "Finesse", "Thrown", ...] */
    properties?: string[];
    /** Weapon mastery property name: "Vex", "Graze", "Push", etc. */
    mastery?: string;
    /** Range string for ranged/thrown weapons: e.g. "150/600" or "20/60". */
    range?: string;
    /** Damage dice when wielded two-handed (Versatile): e.g. "1d10". */
    versatile?: string;
  };

  // --- Armor intrinsics (undefined for non-armor/shield) ---
  /**
   * Intrinsic armor values copied from DB at add time.
   * These are needed for the AC formula and cannot be effect-derived.
   */
  armor?: {
    type: "light" | "medium" | "heavy" | "shield";
    baseAc: number;
    /** Maximum Dex modifier added to AC (undefined = no cap, e.g. light armor). */
    dexCap?: number;
    /** Minimum Strength score required to wear without speed penalty. */
    strReq?: number;
    stealthDisadvantage?: boolean;
  };
}
