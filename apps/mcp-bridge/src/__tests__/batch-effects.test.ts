import { describe, it, expect, beforeEach } from "vitest";
import {
  createTestGSM,
  createFighterCharacter,
  registerCharacter,
  assertToolSuccess,
  assertToolError,
  type TestGSM,
} from "./setup.js";

/**
 * Behavioral contracts for the batch effects method on GameStateManager.
 *
 * ## applyBatchEffects(effects[])
 * - Hard limit: returns error ToolResponse immediately if effects.length > 10.
 * - Iterates effects sequentially (not in parallel). Each effect delegates to the
 *   corresponding GSM method:
 *     - "damage"           → applyDamage(name, amount, damage_type)
 *     - "heal"             → heal(name, amount)
 *     - "set_hp"           → setHP(name, value)
 *     - "condition_add"    → addCondition(name, condition, duration?)
 *     - "condition_remove" → removeCondition(name, condition)
 *     - "move"             → parseGridPosition(position) then moveCombatant(name, pos)
 *                            — if position is invalid A1 notation, records error for that
 *                            effect and continues.
 * - Partial failures do NOT abort remaining effects. Processing continues after a failed
 *   effect.
 * - Each result is recorded: { index, type, target, result (text), error? }.
 * - Returns aggregate data: { applied (success count), failed (error count), results[] }.
 * - The outer ToolResponse is never error=true (even when all effects fail) — the
 *   aggregate summary is always returned as a non-error response.
 */

let t: TestGSM;
let gsm: typeof t.gsm;

beforeEach(() => {
  t = createTestGSM();
  gsm = t.gsm;
  registerCharacter(gsm, "Player1", createFighterCharacter());
});

describe("applyBatchEffects", () => {
  describe("exceeds 10 effects — returns error immediately", () => {
    it("returns error ToolResponse when 11 effects are passed", () => {
      const effects = Array.from({ length: 11 }, () => ({
        type: "damage" as const,
        name: "Theron",
        amount: 1,
      }));
      const result = gsm.applyBatchEffects(effects);
      assertToolError(result);
      expect(result.data).toMatchObject({ count: 11 });
    });

    it("does not process any effect when over the limit", () => {
      const initialHP = gsm.characters["Player1"]!.dynamic.currentHP;
      const effects = Array.from({ length: 11 }, () => ({
        type: "damage" as const,
        name: "Theron",
        amount: 5,
      }));
      gsm.applyBatchEffects(effects);
      // HP should be unchanged — no effects were applied
      expect(gsm.characters["Player1"]!.dynamic.currentHP).toBe(initialHP);
    });
  });

  describe("delegates damage effect to applyDamage", () => {
    it("reduces character HP by the specified amount", () => {
      const initialHP = gsm.characters["Player1"]!.dynamic.currentHP; // 44
      const result = gsm.applyBatchEffects([{ type: "damage", name: "Theron", amount: 10 }]);

      assertToolSuccess(result);
      expect(gsm.characters["Player1"]!.dynamic.currentHP).toBe(initialHP - 10);
      expect(result.data).toMatchObject({ applied: 1, failed: 0 });
    });

    it("records the damage result entry with correct metadata", () => {
      const result = gsm.applyBatchEffects([{ type: "damage", name: "Theron", amount: 7 }]);

      const results = (result.data as { results: unknown[] }).results;
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        index: 0,
        type: "damage",
        target: "Theron",
      });
      expect((results[0] as { error?: boolean }).error).toBeFalsy();
    });

    it("accepts optional damage_type field", () => {
      const initialHP = gsm.characters["Player1"]!.dynamic.currentHP;
      const result = gsm.applyBatchEffects([
        { type: "damage", name: "Theron", amount: 8, damage_type: "fire" },
      ]);

      assertToolSuccess(result);
      expect(gsm.characters["Player1"]!.dynamic.currentHP).toBe(initialHP - 8);
    });
  });

  describe("delegates heal effect to heal", () => {
    it("restores HP after damage has been dealt", () => {
      // First take damage
      gsm.applyBatchEffects([{ type: "damage", name: "Theron", amount: 20 }]);
      const damagedHP = gsm.characters["Player1"]!.dynamic.currentHP; // 24

      // Then heal
      const result = gsm.applyBatchEffects([{ type: "heal", name: "Theron", amount: 10 }]);

      assertToolSuccess(result);
      expect(gsm.characters["Player1"]!.dynamic.currentHP).toBe(damagedHP + 10);
      expect(result.data).toMatchObject({ applied: 1, failed: 0 });
    });

    it("records the heal result entry with correct metadata", () => {
      // Damage first so there is room to heal
      gsm.applyBatchEffects([{ type: "damage", name: "Theron", amount: 10 }]);

      const result = gsm.applyBatchEffects([{ type: "heal", name: "Theron", amount: 5 }]);

      const results = (result.data as { results: unknown[] }).results;
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        index: 0,
        type: "heal",
        target: "Theron",
      });
      expect((results[0] as { error?: boolean }).error).toBeFalsy();
    });
  });

  describe("delegates set_hp effect to setHP", () => {
    it("sets character HP to an explicit value", () => {
      const result = gsm.applyBatchEffects([{ type: "set_hp", name: "Theron", value: 20 }]);

      assertToolSuccess(result);
      expect(gsm.characters["Player1"]!.dynamic.currentHP).toBe(20);
      expect(result.data).toMatchObject({ applied: 1, failed: 0 });
    });

    it("records the set_hp result entry with correct metadata", () => {
      const result = gsm.applyBatchEffects([{ type: "set_hp", name: "Theron", value: 30 }]);

      const results = (result.data as { results: unknown[] }).results;
      expect(results[0]).toMatchObject({ index: 0, type: "set_hp", target: "Theron" });
      expect((results[0] as { error?: boolean }).error).toBeFalsy();
    });
  });

  describe("delegates condition_add effect to addCondition", () => {
    it("adds the specified condition to the character", () => {
      const result = gsm.applyBatchEffects([
        { type: "condition_add", name: "Theron", condition: "Poisoned" },
      ]);

      assertToolSuccess(result);
      const conditions = gsm.characters["Player1"]!.dynamic.conditions;
      expect(conditions.some((c) => c.name.toLowerCase() === "poisoned")).toBe(true);
      expect(result.data).toMatchObject({ applied: 1, failed: 0 });
    });

    it("supports an optional duration field", () => {
      const result = gsm.applyBatchEffects([
        { type: "condition_add", name: "Theron", condition: "Stunned", duration: 3 },
      ]);

      assertToolSuccess(result);
      const conditions = gsm.characters["Player1"]!.dynamic.conditions;
      const stunned = conditions.find((c) => c.name.toLowerCase() === "stunned");
      expect(stunned).toBeDefined();
      expect(stunned!.duration).toBe(3);
    });

    it("records the condition_add result entry with correct metadata", () => {
      const result = gsm.applyBatchEffects([
        { type: "condition_add", name: "Theron", condition: "Blinded" },
      ]);

      const results = (result.data as { results: unknown[] }).results;
      expect(results[0]).toMatchObject({ index: 0, type: "condition_add", target: "Theron" });
      expect((results[0] as { error?: boolean }).error).toBeFalsy();
    });
  });

  describe("delegates condition_remove effect to removeCondition", () => {
    it("removes a previously added condition", () => {
      // Add condition first
      gsm.applyBatchEffects([{ type: "condition_add", name: "Theron", condition: "Poisoned" }]);
      expect(
        gsm.characters["Player1"]!.dynamic.conditions.some(
          (c) => c.name.toLowerCase() === "poisoned",
        ),
      ).toBe(true);

      // Remove it
      const result = gsm.applyBatchEffects([
        { type: "condition_remove", name: "Theron", condition: "Poisoned" },
      ]);

      assertToolSuccess(result);
      expect(
        gsm.characters["Player1"]!.dynamic.conditions.some(
          (c) => c.name.toLowerCase() === "poisoned",
        ),
      ).toBe(false);
      expect(result.data).toMatchObject({ applied: 1, failed: 0 });
    });

    it("records the condition_remove result entry with correct metadata", () => {
      gsm.applyBatchEffects([{ type: "condition_add", name: "Theron", condition: "Blinded" }]);
      const result = gsm.applyBatchEffects([
        { type: "condition_remove", name: "Theron", condition: "Blinded" },
      ]);

      const results = (result.data as { results: unknown[] }).results;
      expect(results[0]).toMatchObject({ index: 0, type: "condition_remove", target: "Theron" });
      expect((results[0] as { error?: boolean }).error).toBeFalsy();
    });
  });

  describe("delegates move effect — parses A1 and calls moveCombatant", () => {
    it("moves combatant to valid A1 position during active combat", () => {
      // Set up map and combat — moveCombatant requires active combat
      gsm.updateBattleMap({
        width: 10,
        height: 10,
        name: "Test Arena",
        tiles: [],
        aoeOverlays: [],
      });
      gsm.startCombat([{ name: "Theron", type: "player", position: { col: 0, row: 0 } }]);

      const result = gsm.applyBatchEffects([{ type: "move", name: "Theron", position: "C3" }]);

      assertToolSuccess(result);
      expect(result.data).toMatchObject({ applied: 1, failed: 0 });

      const results = (result.data as { results: unknown[] }).results;
      expect(results[0]).toMatchObject({ index: 0, type: "move", target: "Theron" });
      expect((results[0] as { error?: boolean }).error).toBeFalsy();
    });
  });

  describe("invalid A1 position in move effect — records error, continues", () => {
    it("records an error for an invalid A1 position", () => {
      const result = gsm.applyBatchEffects([
        { type: "move", name: "Theron", position: "not-a-grid" },
      ]);

      // Outer response is non-error even though the move failed
      expect(result.error).toBeFalsy();
      expect(result.data).toMatchObject({ failed: 1 });

      const results = (result.data as { results: Array<{ error?: boolean }> }).results;
      expect(results[0].error).toBe(true);
    });

    it("continues processing subsequent effects after an invalid position", () => {
      const initialHP = gsm.characters["Player1"]!.dynamic.currentHP;

      const result = gsm.applyBatchEffects([
        { type: "move", name: "Theron", position: "INVALID" },
        { type: "damage", name: "Theron", amount: 5 },
      ]);

      expect(result.error).toBeFalsy();
      // Move failed, damage succeeded
      expect(result.data).toMatchObject({ applied: 1, failed: 1 });
      // The damage was still applied despite the earlier failure
      expect(gsm.characters["Player1"]!.dynamic.currentHP).toBe(initialHP - 5);
    });
  });

  describe("partial failure — remaining effects still applied", () => {
    it("applies valid effects even when an effect targeting a missing character fails", () => {
      const initialHP = gsm.characters["Player1"]!.dynamic.currentHP;

      const result = gsm.applyBatchEffects([
        // Valid: targets Theron
        { type: "damage", name: "Theron", amount: 10 },
        // Invalid: targets a character that does not exist
        { type: "damage", name: "NonExistentChar", amount: 5 },
        // Valid: targets Theron again
        { type: "heal", name: "Theron", amount: 3 },
      ]);

      expect(result.error).toBeFalsy();
      expect(result.data).toMatchObject({ applied: 2, failed: 1 });

      // Net effect: -10 +3 = -7 HP
      expect(gsm.characters["Player1"]!.dynamic.currentHP).toBe(initialHP - 10 + 3);

      const results = (result.data as { results: Array<{ index: number; error?: boolean }> })
        .results;
      expect(results).toHaveLength(3);
      expect(results[0].error).toBeFalsy(); // damage on Theron — success
      expect(results[1].error).toBe(true); // damage on NonExistentChar — failure
      expect(results[2].error).toBeFalsy(); // heal on Theron — success
    });

    it("records correct index for each result regardless of failure position", () => {
      const result = gsm.applyBatchEffects([
        { type: "damage", name: "Theron", amount: 1 },
        { type: "damage", name: "GhostCharacter", amount: 1 },
        { type: "damage", name: "Theron", amount: 1 },
      ]);

      const results = (result.data as { results: Array<{ index: number }> }).results;
      expect(results[0].index).toBe(0);
      expect(results[1].index).toBe(1);
      expect(results[2].index).toBe(2);
    });
  });

  describe("all effects fail — outer response is still non-error with aggregate summary", () => {
    it("returns a non-error ToolResponse with failed=N when every effect targets a missing character", () => {
      const result = gsm.applyBatchEffects([
        { type: "damage", name: "Nobody", amount: 10 },
        { type: "heal", name: "Nobody", amount: 5 },
        { type: "condition_add", name: "Nobody", condition: "Stunned" },
      ]);

      // Outer response MUST NOT be an error
      expect(result.error).toBeFalsy();
      expect(result.text).toBeTruthy();
      expect(result.data).toMatchObject({ applied: 0, failed: 3 });
    });

    it("results array contains an error entry for each failed effect", () => {
      const result = gsm.applyBatchEffects([
        { type: "damage", name: "Ghost1", amount: 5 },
        { type: "heal", name: "Ghost2", amount: 3 },
      ]);

      const results = (result.data as { results: Array<{ error?: boolean }> }).results;
      expect(results).toHaveLength(2);
      expect(results[0].error).toBe(true);
      expect(results[1].error).toBe(true);
    });
  });

  describe("mixed success/failure — applied and failed counts are accurate", () => {
    it("counts each success and failure independently across multiple effect types", () => {
      const result = gsm.applyBatchEffects([
        { type: "damage", name: "Theron", amount: 5 }, // success
        { type: "heal", name: "Theron", amount: 2 }, // success
        { type: "condition_add", name: "Theron", condition: "Poisoned" }, // success
        { type: "damage", name: "NotHere", amount: 9 }, // failure
        { type: "set_hp", name: "Theron", value: 30 }, // success
      ]);

      expect(result.error).toBeFalsy();
      expect(result.data).toMatchObject({ applied: 4, failed: 1 });
    });

    it("summary text mentions applied and failed counts", () => {
      const result = gsm.applyBatchEffects([
        { type: "damage", name: "Theron", amount: 3 },
        { type: "damage", name: "Phantom", amount: 3 },
      ]);

      expect(result.text).toContain("1"); // applied
      expect(result.text).toContain("1"); // failed
    });

    it("results array length matches total number of effects regardless of outcome", () => {
      const result = gsm.applyBatchEffects([
        { type: "damage", name: "Theron", amount: 1 },
        { type: "damage", name: "NoOne", amount: 1 },
        { type: "heal", name: "Theron", amount: 1 },
        { type: "heal", name: "NoOne", amount: 1 },
      ]);

      const results = (result.data as { results: unknown[] }).results;
      expect(results).toHaveLength(4);
    });
  });
});
