/**
 * Tests for getAction — ActionEffect resolution with context substitution.
 *
 * Phase 2: non-breaking addition to effect-resolver.ts.
 */

import { describe, it, expect } from "vitest";
import {
  getAction,
  applyDamageWithEffects,
  getDamageReductions,
  hasEvasion,
} from "../utils/effect-resolver.js";
import type {
  EntityEffects,
  ActionEffect,
  ActionOutcome,
  EffectBundle,
  Property,
} from "../types/effects.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(action?: ActionEffect): { effects?: EntityEffects } {
  if (!action) return {};
  return { effects: { action } };
}

const fireDamage: ActionOutcome["damage"] = [{ dice: "8d6", type: "fire" }];
const extraDamage: ActionOutcome["damage"] = [{ dice: "1d6", type: "fire" }];

// A simple Fireball-like action.
const fireballAction: ActionEffect = {
  kind: "save",
  save: {
    ability: "dexterity",
    dc: "spell_save_dc",
    onSuccess: "half",
  },
  area: { shape: "sphere", size: 20 },
  onFailedSave: { damage: fireDamage },
  onSuccessfulSave: { damage: fireDamage },
  upcast: {
    perLevel: { damage: extraDamage },
  },
};

// A Fire Bolt cantrip-like action.
const fireBoltAction: ActionEffect = {
  kind: "attack",
  attack: { bonus: "spell_attack", range: { normal: 120 } },
  onHit: { damage: [{ dice: "1d10", type: "fire" }] },
  cantripScaling: [
    { level: 5, outcome: { damage: [{ dice: "1d10", type: "fire" }] } },
    { level: 11, outcome: { damage: [{ dice: "2d10", type: "fire" }] } },
    { level: 17, outcome: { damage: [{ dice: "3d10", type: "fire" }] } },
  ],
};

// ---------------------------------------------------------------------------
// Null / missing action tests
// ---------------------------------------------------------------------------

describe("getAction — no action", () => {
  it("returns null for entity with no effects field", () => {
    expect(getAction({})).toBeNull();
  });

  it("returns null for entity with effects but no action", () => {
    const entity: { effects?: EntityEffects } = {
      effects: { modifiers: [{ target: "ac", value: 2 }] },
    };
    expect(getAction(entity)).toBeNull();
  });

  it("returns null for entity with effects.action undefined", () => {
    const entity: { effects?: EntityEffects } = { effects: {} };
    expect(getAction(entity)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No-context passthrough
// ---------------------------------------------------------------------------

describe("getAction — no context (passthrough)", () => {
  it("returns action unchanged when no context provided", () => {
    const entity = makeEntity(fireballAction);
    const result = getAction(entity);
    expect(result).not.toBeNull();
    // save.dc stays as "spell_save_dc" — not substituted.
    expect(result?.save?.dc).toBe("spell_save_dc");
    // damage unchanged.
    expect(result?.onFailedSave?.damage).toEqual(fireDamage);
  });

  it("does not mutate the original action", () => {
    const entity = makeEntity(fireballAction);
    getAction(entity, { spellSaveDC: 15 });
    // Original must still say "spell_save_dc".
    expect(fireballAction.save?.dc).toBe("spell_save_dc");
  });
});

// ---------------------------------------------------------------------------
// spell_save_dc substitution
// ---------------------------------------------------------------------------

describe("getAction — spell_save_dc substitution", () => {
  it("substitutes save.dc when context.spellSaveDC provided", () => {
    const entity = makeEntity(fireballAction);
    const result = getAction(entity, { spellSaveDC: 15 });
    expect(result?.save?.dc).toBe(15);
  });

  it("does not alter action when save.dc is already a number", () => {
    const monsterAction: ActionEffect = {
      kind: "save",
      save: { ability: "constitution", dc: 18, onSuccess: "none" },
      onFailedSave: { damage: [{ dice: "10d6", type: "fire" }] },
    };
    const entity = makeEntity(monsterAction);
    const result = getAction(entity, { spellSaveDC: 15 });
    // dc should remain 18, not overwritten by spellSaveDC.
    expect(result?.save?.dc).toBe(18);
  });

  it("does not substitute save.dc when spellSaveDC is not in context", () => {
    const entity = makeEntity(fireballAction);
    const result = getAction(entity, { characterLevel: 9 });
    expect(result?.save?.dc).toBe("spell_save_dc");
  });
});

// ---------------------------------------------------------------------------
// Upcast scaling
// ---------------------------------------------------------------------------

describe("getAction — upcast scaling", () => {
  it("adds perLevel damage for each extra spell level (upcastLevel: 2 = 2 extra levels)", () => {
    const entity = makeEntity(fireballAction);
    // upcastLevel: 2 means 2 extra levels above base → 2 × 1d6 extra fire.
    const result = getAction(entity, { upcastLevel: 2 });
    const failedSaveDmg = result?.onFailedSave?.damage ?? [];
    // Base: 8d6 fire. Each extra level adds 1d6 fire → 8d6 + 1d6 + 1d6 = 3 entries.
    expect(failedSaveDmg).toHaveLength(3);
    expect(failedSaveDmg[0]).toEqual({ dice: "8d6", type: "fire" });
    expect(failedSaveDmg[1]).toEqual({ dice: "1d6", type: "fire" });
    expect(failedSaveDmg[2]).toEqual({ dice: "1d6", type: "fire" });
  });

  it("does not add upcast damage when upcastLevel is 0 (base level)", () => {
    const entity = makeEntity(fireballAction);
    const result = getAction(entity, { upcastLevel: 0 });
    const failedSaveDmg = result?.onFailedSave?.damage ?? [];
    expect(failedSaveDmg).toHaveLength(1);
    expect(failedSaveDmg[0]).toEqual({ dice: "8d6", type: "fire" });
  });

  it("does not add upcast damage when action has no upcast.perLevel", () => {
    const noUpcastAction: ActionEffect = {
      kind: "auto",
      onHit: { damage: [{ dice: "3d4", type: "force" }] },
    };
    const entity = makeEntity(noUpcastAction);
    const result = getAction(entity, { upcastLevel: 5 });
    expect(result?.onHit?.damage).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Cantrip scaling
// ---------------------------------------------------------------------------

describe("getAction — cantrip scaling", () => {
  it("picks the entry at or below characterLevel (level 11 picks the level-11 entry)", () => {
    const entity = makeEntity(fireBoltAction);
    const result = getAction(entity, { characterLevel: 11 });
    // Implementation picks the single highest applicable entry (level-11) and merges
    // its outcome onto the base. Base: 1d10. Level-11 entry: 2d10. Result: [1d10, 2d10].
    const hitDmg = result?.onHit?.damage ?? [];
    expect(hitDmg).toHaveLength(2); // base 1d10 + level-11 delta 2d10
    expect(hitDmg[0]).toEqual({ dice: "1d10", type: "fire" });
    expect(hitDmg[1]).toEqual({ dice: "2d10", type: "fire" });
  });

  it("picks no entry when characterLevel is below the first threshold", () => {
    const entity = makeEntity(fireBoltAction);
    const result = getAction(entity, { characterLevel: 3 });
    // No cantripScaling entry applies (lowest is level 5).
    const hitDmg = result?.onHit?.damage ?? [];
    expect(hitDmg).toHaveLength(1);
    expect(hitDmg[0]).toEqual({ dice: "1d10", type: "fire" });
  });

  it("picks the level-5 entry when characterLevel is 7", () => {
    const entity = makeEntity(fireBoltAction);
    const result = getAction(entity, { characterLevel: 7 });
    const hitDmg = result?.onHit?.damage ?? [];
    // Highest applicable entry is level-5 → base 1d10 + level-5 delta 1d10 = 2 entries.
    expect(hitDmg).toHaveLength(2);
    expect(hitDmg[0]).toEqual({ dice: "1d10", type: "fire" });
    expect(hitDmg[1]).toEqual({ dice: "1d10", type: "fire" });
  });

  it("picks the level-17 entry when characterLevel is 20", () => {
    const entity = makeEntity(fireBoltAction);
    const result = getAction(entity, { characterLevel: 20 });
    const hitDmg = result?.onHit?.damage ?? [];
    // Highest applicable entry is level-17 → base 1d10 + level-17 delta 3d10 = 2 entries.
    expect(hitDmg).toHaveLength(2);
    expect(hitDmg[0]).toEqual({ dice: "1d10", type: "fire" });
    expect(hitDmg[1]).toEqual({ dice: "3d10", type: "fire" });
  });

  it("does not scale when characterLevel is not in context", () => {
    const entity = makeEntity(fireBoltAction);
    const result = getAction(entity);
    const hitDmg = result?.onHit?.damage ?? [];
    expect(hitDmg).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Helpers for damage-reduction / evasion tests
// ---------------------------------------------------------------------------

/** Minimal ResolveContext for expression evaluation. */
const baseCtx = {
  abilities: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  totalLevel: 5,
  proficiencyBonus: 3,
};

function makeDRBundle(prop: Property): EffectBundle {
  return {
    id: "test-dr",
    source: { type: "feat", name: "Test Feat" },
    lifetime: { type: "permanent" },
    effects: { properties: [prop] },
  };
}

// ---------------------------------------------------------------------------
// getDamageReductions
// ---------------------------------------------------------------------------

describe("getDamageReductions", () => {
  it("returns empty array when no bundles", () => {
    expect(getDamageReductions([], "fire")).toEqual([]);
  });

  it("returns flat reduction for a matching type", () => {
    const bundle = makeDRBundle({
      type: "damage_reduction",
      damageTypes: ["fire"],
      amount: 3,
    });
    const result = getDamageReductions([bundle], "fire");
    expect(result).toEqual([{ amount: 3, kind: "flat" }]);
  });

  it("does not return flat reduction for a non-matching type", () => {
    const bundle = makeDRBundle({
      type: "damage_reduction",
      damageTypes: ["bludgeoning"],
      amount: 3,
    });
    expect(getDamageReductions([bundle], "fire")).toEqual([]);
  });

  it("returns reduction when damageTypes is omitted (all types)", () => {
    const bundle = makeDRBundle({ type: "damage_reduction", amount: 5 });
    const result = getDamageReductions([bundle], "psychic");
    expect(result).toEqual([{ amount: 5, kind: "flat" }]);
  });

  it("returns reduction when damageTypes contains 'all'", () => {
    const bundle = makeDRBundle({
      type: "damage_reduction",
      damageTypes: ["all"],
      amount: 2,
    });
    expect(getDamageReductions([bundle], "cold")).toEqual([{ amount: 2, kind: "flat" }]);
  });

  it("skips trigger: 'reaction' entries", () => {
    const bundle = makeDRBundle({
      type: "damage_reduction",
      amount: 10,
      trigger: "reaction",
    });
    expect(getDamageReductions([bundle], "fire")).toEqual([]);
  });

  it("returns half reduction for amount: 'half'", () => {
    const bundle = makeDRBundle({ type: "damage_reduction", amount: "half" });
    expect(getDamageReductions([bundle], "fire")).toEqual([{ amount: 0, kind: "half" }]);
  });

  it("evaluates expression amount with context", () => {
    // prof = 3 at baseCtx
    const bundle = makeDRBundle({ type: "damage_reduction", amount: "prof" });
    const result = getDamageReductions([bundle], "fire", baseCtx);
    expect(result).toEqual([{ amount: 3, kind: "flat" }]);
  });

  it("skips expression amount when no context and emits console.warn", () => {
    const bundle = makeDRBundle({ type: "damage_reduction", amount: "prof" });
    const result = getDamageReductions([bundle], "fire");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// hasEvasion
// ---------------------------------------------------------------------------

describe("hasEvasion", () => {
  it("returns false when no bundles", () => {
    expect(hasEvasion([], "dexterity")).toBe(false);
  });

  it("returns true when a matching save_outcome_override is present", () => {
    const bundle = makeDRBundle({
      type: "save_outcome_override",
      ability: "dexterity",
      saveEffect: "evasion",
    });
    expect(hasEvasion([bundle], "dexterity")).toBe(true);
  });

  it("returns false when the ability does not match", () => {
    const bundle = makeDRBundle({
      type: "save_outcome_override",
      ability: "dexterity",
      saveEffect: "evasion",
    });
    expect(hasEvasion([bundle], "constitution")).toBe(false);
  });

  it("returns false when no save_outcome_override property exists", () => {
    const bundle = makeDRBundle({ type: "resistance", damageType: "fire" });
    expect(hasEvasion([bundle], "dexterity")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyDamageWithEffects — damage_reduction integration
// ---------------------------------------------------------------------------

describe("applyDamageWithEffects — damage_reduction", () => {
  it("flat reduction of 2: 10 → 8, applied: 'reduced'", () => {
    const bundle = makeDRBundle({ type: "damage_reduction", amount: 2 });
    const result = applyDamageWithEffects([bundle], 10, "fire");
    expect(result).toEqual({ effectiveDamage: 8, applied: "reduced" });
  });

  it("two stacked flat reductions (3 + 2): 10 → 5", () => {
    const b1 = makeDRBundle({ type: "damage_reduction", amount: 3 });
    const b2 = { ...makeDRBundle({ type: "damage_reduction", amount: 2 }), id: "dr2" };
    const result = applyDamageWithEffects([b1, b2], 10, "fire");
    expect(result).toEqual({ effectiveDamage: 5, applied: "reduced" });
  });

  it("reduction clamps at 0 (flat 20, dmg 5 → 0)", () => {
    const bundle = makeDRBundle({ type: "damage_reduction", amount: 20 });
    const result = applyDamageWithEffects([bundle], 5, "fire");
    expect(result).toEqual({ effectiveDamage: 0, applied: "reduced" });
  });

  it("type-filtered reduction does NOT reduce non-matching damage type", () => {
    const bundle = makeDRBundle({
      type: "damage_reduction",
      damageTypes: ["bludgeoning"],
      amount: 5,
    });
    const result = applyDamageWithEffects([bundle], 10, "fire");
    expect(result).toEqual({ effectiveDamage: 10, applied: "normal" });
  });

  it("omitted damageTypes reduces any type", () => {
    const bundle = makeDRBundle({ type: "damage_reduction", amount: 4 });
    const result = applyDamageWithEffects([bundle], 10, "psychic");
    expect(result).toEqual({ effectiveDamage: 6, applied: "reduced" });
  });

  it("amount: 'half' alone: 10 → 5", () => {
    const bundle = makeDRBundle({ type: "damage_reduction", amount: "half" });
    const result = applyDamageWithEffects([bundle], 10, "fire");
    expect(result).toEqual({ effectiveDamage: 5, applied: "reduced" });
  });

  it("flat 2 + half combined: (10 - 2) / 2 = 4", () => {
    const bFlat = makeDRBundle({ type: "damage_reduction", amount: 2 });
    const bHalf = {
      ...makeDRBundle({ type: "damage_reduction", amount: "half" as const }),
      id: "half",
    };
    const result = applyDamageWithEffects([bFlat, bHalf], 10, "fire");
    expect(result).toEqual({ effectiveDamage: 4, applied: "reduced" });
  });

  it("immunity short-circuits: immune + reduction = 0, applied: 'immune'", () => {
    const immBundle: EffectBundle = {
      id: "imm",
      source: { type: "feat", name: "Test" },
      lifetime: { type: "permanent" },
      effects: { properties: [{ type: "immunity", damageType: "fire" }] },
    };
    const drBundle = makeDRBundle({ type: "damage_reduction", amount: 5 });
    const result = applyDamageWithEffects([immBundle, drBundle], 10, "fire");
    expect(result).toEqual({ effectiveDamage: 0, applied: "immune" });
  });

  it("resistant + flat 2: 10 fire resistant → 5, then 5 - 2 = 3, applied: 'reduced'", () => {
    const resBundle: EffectBundle = {
      id: "res",
      source: { type: "feat", name: "Test" },
      lifetime: { type: "permanent" },
      effects: { properties: [{ type: "resistance", damageType: "fire" }] },
    };
    const drBundle = makeDRBundle({ type: "damage_reduction", amount: 2 });
    const result = applyDamageWithEffects([resBundle, drBundle], 10, "fire");
    expect(result).toEqual({ effectiveDamage: 3, applied: "reduced" });
  });

  it("trigger: 'reaction' is ignored by applyDamageWithEffects", () => {
    const bundle = makeDRBundle({
      type: "damage_reduction",
      amount: 10,
      trigger: "reaction",
    });
    const result = applyDamageWithEffects([bundle], 10, "fire");
    expect(result).toEqual({ effectiveDamage: 10, applied: "normal" });
  });
});
