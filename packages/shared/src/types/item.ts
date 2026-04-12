// === Unified Item Type ===
//
// Single shape replacing InventoryItem. Weapon/armor intrinsics are copied in
// from DB at add time; mechanical behavior (magic bonuses, resistance-on-wear)
// lives in the item's EntityEffects. Attack bonus and damage bonus are computed
// on demand via effect resolver + weapon ActionEffect — not stored on Item.

/**
 * A character inventory item — one shape for all item kinds.
 *
 * Weapon damage dice and attack bonus come from the weapon's DB EntityEffects.action
 * (via getWeaponAttack) rather than being stored here. The weapon? sub-object
 * stores only the intrinsic properties copied in from the DB at add time.
 *
 * Armor AC values are stored in armor? since they are static intrinsics (not
 * effect-derived) — they are needed to compute the base AC formula.
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

  // --- Weapon intrinsics (null for non-weapons) ---
  /**
   * Intrinsic weapon properties copied from DB at add time.
   * Damage dice and attack bonus are NOT stored here — they come from
   * the weapon's EntityEffects.action resolved via getWeaponAttack().
   */
  weapon?: {
    /** Weapon properties: ["Versatile", "Light", "Finesse", "Thrown", ...] */
    properties?: string[];
    /** Weapon mastery property name: "Vex", "Graze", "Push", etc. */
    mastery?: string;
  };

  // --- Armor intrinsics (null for non-armor) ---
  /**
   * Intrinsic armor values copied from DB at add time.
   * These are needed for the AC formula and cannot be effect-derived.
   */
  armor?: {
    type: "light" | "medium" | "heavy" | "shield";
    baseAc: number;
    /** Maximum Dex modifier added to AC (null = no cap, e.g. light armor). */
    dexCap?: number;
    /** Minimum Strength score required to wear without speed penalty. */
    strReq?: number;
    stealthDisadvantage?: boolean;
  };
}
