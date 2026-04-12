/**
 * Tests for getAction — ActionEffect resolution with context substitution.
 *
 * Phase 2: non-breaking addition to effect-resolver.ts.
 */

import { describe, it, expect } from "vitest";
import { getAction } from "../utils/effect-resolver.js";
import type { EntityEffects, ActionEffect, ActionOutcome } from "../types/effects.js";

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
