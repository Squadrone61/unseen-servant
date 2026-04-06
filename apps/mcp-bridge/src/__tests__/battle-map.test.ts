import { describe, it, expect } from "vitest";

/**
 * Behavioral contracts for battle map and AoE methods on GameStateManager.
 *
 * ## updateBattleMap(map: BattleMapState)
 * - If encounter does not exist, creates one: { id: uuid, phase: "exploration" }.
 * - Sets encounter.map = map (overwrites any existing map).
 * - Does NOT clear existing combat state.
 * - Broadcasts server:combat_update with the new map and existing combat (or null).
 * - Does NOT create a GameEvent.
 * - Returns data: { width, height, name } — name defaults to "unnamed" if falsy.
 *
 * ## showAoE(params)
 * - Guard: returns error if no active combat (phase !== "active").
 * - Guard: returns error if sphere/cone center is not valid A1, or rectangle from/to invalid.
 * - Shapes: sphere (center+size), cone (center+size+direction), rectangle (from+to).
 * - Computes affected tiles via computeAoETiles. Map dimensions default to 20x20.
 * - Creates an AoEOverlay object with shape-specific fields.
 * - Appends overlay to combat.activeAoE (initializes array if undefined).
 * - Computes affected combatants: combatants whose position falls on an affected tile,
 *   excluding dead NPCs (currentHP <= 0).
 * - Does NOT create a GameEvent.
 * - Broadcasts server:combat_update.
 * - Returns data: { aoeId, label, affected: string[] }.
 *
 * ## applyAreaEffect(params)
 * - Guard: returns error if no active combat.
 * - Guard: returns error if positions invalid for shape type.
 * - Computes affected tiles and finds combatants (same logic as showAoE — excludes
 *   dead NPCs).
 * - Returns non-error ToolResponse with empty results when no combatants are in area.
 * - For each affected combatant:
 *     - Computes save modifier: ability score mod + proficiency if proficient in that save.
 *       For NPCs, saveMod=0 (no stat block access).
 *     - Rolls 1d20+saveMod for the saving throw.
 *     - Rolls damage notation as-is.
 *     - halfOnSave=true: on pass, damage = Math.floor(damage / 2).
 *     - halfOnSave=false (default): on pass, damage = 0.
 *     - Calls applyDamage(target.name, finalDamage, damageType) when finalDamage > 0.
 * - Does NOT create a GameEvent directly (applyDamage creates its own events).
 * - Returns data: { results[] } with per-combatant save and damage data.
 *
 * ## dismissAoE(aoeId)
 * - Guard: returns error if no active combat.
 * - Guard: returns error if activeAoE is empty or undefined.
 * - Returns error with hints (listing active AoE IDs) if aoeId not found.
 * - Splices the overlay out of combat.activeAoE by index.
 * - Broadcasts server:combat_update.
 * - Does NOT create a GameEvent.
 * - Returns data: { aoeId, label }.
 */

import {
  createTestGSM,
  createFighterCharacter,
  registerCharacter,
  assertToolSuccess,
  assertToolError,
} from "./setup.js";
import type { TestGSM } from "./setup.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function setupMap(gsm: TestGSM["gsm"]) {
  gsm.updateBattleMap({ id: "map1", width: 10, height: 10, tiles: [], name: "Arena" });
}

function startCombatWithGoblins(gsm: TestGSM["gsm"]) {
  gsm.startCombat([
    {
      name: "Goblin1",
      type: "npc" as const,
      initiativeModifier: 2,
      maxHP: 7,
      armorClass: 15,
      position: { x: 5, y: 5 },
      speed: 30,
    },
    {
      name: "Goblin2",
      type: "npc" as const,
      initiativeModifier: 2,
      maxHP: 7,
      armorClass: 15,
      position: { x: 6, y: 5 },
      speed: 30,
    },
  ]);
}

// ---------------------------------------------------------------------------
// updateBattleMap
// ---------------------------------------------------------------------------

describe("updateBattleMap", () => {
  describe("creates encounter when none exists", () => {
    it("creates an encounter with phase=exploration when no encounter existed", () => {
      const { gsm } = createTestGSM();
      expect(gsm.gameState.encounter).toBeNull();

      const result = gsm.updateBattleMap({
        id: "map1",
        width: 10,
        height: 10,
        tiles: [],
        name: "Arena",
      });

      assertToolSuccess(result);
      expect(gsm.gameState.encounter).toBeDefined();
      expect(gsm.gameState.encounter!.phase).toBe("exploration");
    });

    it("stores the map with correct dimensions", () => {
      const { gsm } = createTestGSM();
      gsm.updateBattleMap({ id: "map1", width: 10, height: 10, tiles: [], name: "Arena" });

      const map = gsm.gameState.encounter!.map;
      expect(map).toBeDefined();
      expect(map!.width).toBe(10);
      expect(map!.height).toBe(10);
    });
  });

  describe("overwrites existing map without clearing combat", () => {
    it("updates map dimensions when called a second time", () => {
      const { gsm } = createTestGSM();
      gsm.updateBattleMap({ id: "map1", width: 10, height: 10, tiles: [], name: "Arena" });
      gsm.updateBattleMap({ id: "map2", width: 20, height: 15, tiles: [], name: "Dungeon" });

      const map = gsm.gameState.encounter!.map;
      expect(map!.width).toBe(20);
      expect(map!.height).toBe(15);
      expect(map!.name).toBe("Dungeon");
    });
  });

  describe("broadcasts combat_update with new map", () => {
    it("emits server:combat_update after setting the map", () => {
      const { gsm, broadcasts } = createTestGSM();
      const before = broadcasts.length;

      gsm.updateBattleMap({ id: "map1", width: 8, height: 8, tiles: [], name: "Cave" });

      const after = broadcasts.filter((m) => m.type === "server:combat_update");
      expect(after.length).toBeGreaterThan(before);
    });
  });

  describe("stores tiles correctly", () => {
    it("tiles array is preserved on the stored map", () => {
      const { gsm } = createTestGSM();
      const tiles: import("@unseen-servant/shared/types").MapTile[][] = [
        [{ type: "wall" }, { type: "difficult_terrain" }],
      ];
      gsm.updateBattleMap({ id: "map1", width: 10, height: 10, tiles, name: "Tiles Test" });

      const stored = gsm.gameState.encounter!.map;
      expect(stored!.tiles).toEqual(tiles);
    });
  });

  describe("data shape", () => {
    it("returns width, height, and name in data", () => {
      const { gsm } = createTestGSM();
      const result = gsm.updateBattleMap({
        id: "map1",
        width: 12,
        height: 8,
        tiles: [],
        name: "Test",
      });

      assertToolSuccess(result);
      expect(result.data.width).toBe(12);
      expect(result.data.height).toBe(8);
      expect(result.data.name).toBe("Test");
    });
  });
});

// ---------------------------------------------------------------------------
// showAoE
// ---------------------------------------------------------------------------

describe("showAoE", () => {
  describe("no active combat — error", () => {
    it("returns error when no combat is active", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);

      const result = gsm.showAoE({
        shape: "sphere",
        center: "E5",
        size: 10,
        color: "red",
        label: "Fireball",
      });

      assertToolError(result);
    });
  });

  describe("invalid A1 center — error", () => {
    it("returns error for a malformed center string", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      const result = gsm.showAoE({
        shape: "sphere",
        center: "not-valid",
        size: 10,
        color: "red",
        label: "Fireball",
      });

      assertToolError(result);
      expect(result.text).toMatch(/invalid|position/i);
    });
  });

  describe("adds overlay to combat.activeAoE", () => {
    it("overlay is appended to activeAoE after showAoE call", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      const result = gsm.showAoE({
        shape: "sphere",
        center: "F6",
        size: 10,
        color: "orange",
        label: "Fireball",
      });

      assertToolSuccess(result);
      const aoe = gsm.gameState.encounter!.combat!.activeAoE;
      expect(aoe).toBeDefined();
      expect(aoe!.length).toBe(1);
      expect(aoe![0].label).toBe("Fireball");
    });

    it("defaults persistent=false when not specified", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      gsm.showAoE({
        shape: "sphere",
        center: "F6",
        size: 10,
        color: "orange",
        label: "Fireball",
      });

      const overlay = gsm.gameState.encounter!.combat!.activeAoE![0];
      expect(overlay.persistent).toBe(false);
    });
  });

  describe("returns list of combatants whose position is on an affected tile", () => {
    it("returns affected combatant names when they are in the AoE", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);
      // Goblin1 is at x=5,y=5 → F6 in A1. Goblin2 is at x=6,y=5 → G6.
      // Center at F6 (x=5,y=5) with radius=20 (covers entire map) must capture both.

      const result = gsm.showAoE({
        shape: "sphere",
        center: "F6",
        size: 20,
        color: "red",
        label: "Huge Blast",
      });

      assertToolSuccess(result);
      expect(result.data.affected).toBeDefined();
      expect(Array.isArray(result.data.affected)).toBe(true);
      // Both goblins should be in range with radius=20
      expect(result.data.affected).toContain("Goblin1");
      expect(result.data.affected).toContain("Goblin2");
    });
  });

  describe("excludes dead NPC combatants from affected list", () => {
    it("dead NPC (currentHP=0) is not included in affected", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      // Kill Goblin2 by applying max damage
      gsm.applyDamage("Goblin2", 999);

      const result = gsm.showAoE({
        shape: "sphere",
        center: "F6",
        size: 20,
        color: "red",
        label: "Huge Blast",
      });

      assertToolSuccess(result);
      expect(result.data.affected).not.toContain("Goblin2");
    });
  });

  describe("returns aoeId in data", () => {
    it("data contains a non-empty aoeId string", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      const result = gsm.showAoE({
        shape: "sphere",
        center: "A1",
        size: 5,
        color: "blue",
        label: "Fog Cloud",
        persistent: true,
      });

      assertToolSuccess(result);
      expect(typeof result.data.aoeId).toBe("string");
      expect(result.data.aoeId.length).toBeGreaterThan(0);
      expect(result.data.label).toBe("Fog Cloud");
    });
  });
});

// ---------------------------------------------------------------------------
// dismissAoE
// ---------------------------------------------------------------------------

describe("dismissAoE", () => {
  describe("no active combat — error", () => {
    it("returns error when there is no combat", () => {
      const { gsm } = createTestGSM();
      const result = gsm.dismissAoE("some-id");
      assertToolError(result);
    });
  });

  describe("no active AoE overlays — error", () => {
    it("returns error when activeAoE is empty", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);
      // No showAoE called — activeAoE is empty

      const result = gsm.dismissAoE("nonexistent");
      assertToolError(result);
      expect(result.text).toMatch(/no active aoe|no active/i);
    });
  });

  describe("aoeId not found — error with hints", () => {
    it("returns error with hints listing active AoE ids when id is wrong", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      gsm.showAoE({
        shape: "sphere",
        center: "A1",
        size: 5,
        color: "blue",
        label: "Fog Cloud",
        persistent: true,
      });

      const result = gsm.dismissAoE("wrong-id");
      assertToolError(result);
      expect(result.hints).toBeDefined();
      expect(result.hints!.some((h: string) => h.includes("Fog Cloud"))).toBe(true);
    });
  });

  describe("removes overlay by id and broadcasts update", () => {
    it("overlay is removed from activeAoE after dismiss", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      const showResult = gsm.showAoE({
        shape: "sphere",
        center: "A1",
        size: 5,
        color: "purple",
        label: "Wall of Fire",
        persistent: true,
      });
      assertToolSuccess(showResult);

      const aoeId: string = showResult.data.aoeId;
      expect(gsm.gameState.encounter!.combat!.activeAoE!.length).toBe(1);

      const dismissResult = gsm.dismissAoE(aoeId);
      assertToolSuccess(dismissResult);
      expect(dismissResult.data.aoeId).toBe(aoeId);
      expect(dismissResult.data.label).toBe("Wall of Fire");
      expect(gsm.gameState.encounter!.combat!.activeAoE!.length).toBe(0);
    });

    it("emits server:combat_update after dismissing overlay", () => {
      const { gsm, broadcasts } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      const showResult = gsm.showAoE({
        shape: "sphere",
        center: "A1",
        size: 5,
        color: "purple",
        label: "Darkness",
      });
      const aoeId: string = showResult.data.aoeId;

      const beforeCount = broadcasts.filter((m) => m.type === "server:combat_update").length;
      gsm.dismissAoE(aoeId);
      const afterCount = broadcasts.filter((m) => m.type === "server:combat_update").length;

      expect(afterCount).toBeGreaterThan(beforeCount);
    });
  });
});

// ---------------------------------------------------------------------------
// applyAreaEffect
// ---------------------------------------------------------------------------

describe("applyAreaEffect", () => {
  // -------------------------------------------------------------------------
  // Validation guards
  // -------------------------------------------------------------------------

  describe("no active combat — error", () => {
    it("returns error when no combat is active", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);

      const result = gsm.applyAreaEffect({
        shape: "sphere",
        center: "E5",
        size: 10,
        damage: "2d6",
        damageType: "fire",
        saveAbility: "dexterity",
        saveDC: 15,
        halfOnSave: true,
      });

      assertToolError(result);
    });
  });

  describe("invalid A1 center — error", () => {
    it("returns error for a malformed center string", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      const result = gsm.applyAreaEffect({
        shape: "sphere",
        center: "ZZ99",
        size: 10,
        damage: "2d6",
        damageType: "fire",
        saveAbility: "dexterity",
        saveDC: 15,
        halfOnSave: true,
      });

      assertToolError(result);
      expect(result.text).toMatch(/invalid|position/i);
    });
  });

  // -------------------------------------------------------------------------
  // Basic AoE (enemies only)
  // -------------------------------------------------------------------------

  describe("sphere AoE hitting both goblins", () => {
    it("returns results array with one entry per affected combatant", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);
      // Goblin1 at x=5,y=5 (F6); Goblin2 at x=6,y=5 (G6).
      // Center at F6 with radius=20 covers the full 10x10 map.

      const result = gsm.applyAreaEffect({
        shape: "sphere",
        center: "F6",
        size: 20,
        damage: "2d6",
        damageType: "fire",
        saveAbility: "dexterity",
        saveDC: 15,
        halfOnSave: true,
      });

      assertToolSuccess(result);
      expect(Array.isArray(result.data.results)).toBe(true);
      expect(result.data.results).toHaveLength(2);
    });

    it("each result entry has required fields with correct types", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      const result = gsm.applyAreaEffect({
        shape: "sphere",
        center: "F6",
        size: 20,
        damage: "2d6",
        damageType: "fire",
        saveAbility: "dexterity",
        saveDC: 15,
        halfOnSave: true,
      });

      assertToolSuccess(result);
      for (const entry of result.data.results) {
        expect(typeof entry.target).toBe("string");
        expect(typeof entry.saveRoll).toBe("number");
        expect(typeof entry.saveMod).toBe("number");
        expect(typeof entry.passed).toBe("boolean");
        expect(typeof entry.damage).toBe("number");
        expect(entry.damage).toBeGreaterThanOrEqual(0);
        expect(typeof entry.damageType).toBe("string");
        expect(entry.damageType).toBe("fire");
      }
    });

    it("results contain both goblin names", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      const result = gsm.applyAreaEffect({
        shape: "sphere",
        center: "F6",
        size: 20,
        damage: "2d6",
        damageType: "fire",
        saveAbility: "dexterity",
        saveDC: 15,
        halfOnSave: true,
      });

      assertToolSuccess(result);
      const names: string[] = result.data.results.map((r: { target: string }) => r.target);
      expect(names).toContain("Goblin1");
      expect(names).toContain("Goblin2");
    });
  });

  // -------------------------------------------------------------------------
  // No targets in area
  // -------------------------------------------------------------------------

  describe("AoE with no targets in area", () => {
    it("returns success with empty results when AoE misses all combatants", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);
      // Goblins are at F6/G6. A1 is x=0,y=0 — far corner.
      // Radius 1 covers only adjacent tiles, not F6/G6.

      const result = gsm.applyAreaEffect({
        shape: "sphere",
        center: "A1",
        size: 1,
        damage: "2d6",
        damageType: "fire",
        saveAbility: "dexterity",
        saveDC: 15,
        halfOnSave: true,
      });

      // Returns non-error even when no targets are hit.
      expect(result.error).toBeFalsy();
      // Results array is empty (or the text message signals no combatants).
      const results = result.data?.results ?? [];
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // halfOnSave behaviour
  // -------------------------------------------------------------------------

  describe("halfOnSave=true — passing saves deal half damage (>= 0)", () => {
    it("damage field is >= 0 for all results (includes halved damage on pass)", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      const result = gsm.applyAreaEffect({
        shape: "sphere",
        center: "F6",
        size: 20,
        damage: "4d6",
        damageType: "fire",
        saveAbility: "dexterity",
        saveDC: 15,
        halfOnSave: true,
      });

      assertToolSuccess(result);
      for (const entry of result.data.results) {
        // On a pass with halfOnSave, damage = floor(roll / 2) >= 0.
        // On a fail, damage = full roll > 0.
        expect(entry.damage).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("halfOnSave=false — passing saves deal exactly 0 damage", () => {
    it("entries that passed the save have damage=0 when halfOnSave is false", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      // Use DC 1 to make saves almost always pass (nat 20 always passes regardless).
      // Even if some roll a nat 1 and fail, the test only asserts passed entries.
      const result = gsm.applyAreaEffect({
        shape: "sphere",
        center: "F6",
        size: 20,
        damage: "4d6",
        damageType: "thunder",
        saveAbility: "dexterity",
        saveDC: 1,
        halfOnSave: false,
      });

      assertToolSuccess(result);
      for (const entry of result.data.results) {
        if (entry.passed) {
          expect(entry.damage).toBe(0);
        }
      }
    });

    it("entries that failed the save have damage > 0 when halfOnSave is false", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      // DC 30 makes saves almost always fail.
      // A nat 20 with saveMod=0 gives total=20, still < 30, so always fails for NPCs.
      const result = gsm.applyAreaEffect({
        shape: "sphere",
        center: "F6",
        size: 20,
        damage: "4d6",
        damageType: "cold",
        saveAbility: "dexterity",
        saveDC: 30,
        halfOnSave: false,
      });

      assertToolSuccess(result);
      for (const entry of result.data.results) {
        if (!entry.passed) {
          expect(entry.damage).toBeGreaterThan(0);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Dead enemy exclusion
  // -------------------------------------------------------------------------

  describe("dead NPCs are excluded from AoE targets", () => {
    it("dead goblin (currentHP=0) is not in results", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      // Kill Goblin2 outright.
      gsm.applyDamage("Goblin2", 999);

      const result = gsm.applyAreaEffect({
        shape: "sphere",
        center: "F6",
        size: 20,
        damage: "2d6",
        damageType: "fire",
        saveAbility: "dexterity",
        saveDC: 15,
        halfOnSave: true,
      });

      assertToolSuccess(result);
      const names: string[] = result.data.results.map((r: { target: string }) => r.target);
      expect(names).not.toContain("Goblin2");
      expect(names).toContain("Goblin1");
    });
  });

  // -------------------------------------------------------------------------
  // Player character in AoE — uses actual ability score / save proficiency
  // -------------------------------------------------------------------------

  describe("player character in AoE uses character-sheet save modifier", () => {
    it("Theron (Fighter, DEX 14, no DEX save prof) gets saveMod=+2", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);

      // Register Theron's full character data.
      const fighter = createFighterCharacter(); // DEX 14 → mod +2; STR+CON saves only
      registerCharacter(gsm, "alice", fighter);

      // Start combat with Theron at A1 (away from goblins) and both goblins.
      gsm.startCombat([
        { name: "Theron", type: "player" as const, speed: 30, position: { x: 0, y: 0 } },
        {
          name: "Goblin1",
          type: "npc" as const,
          initiativeModifier: 2,
          maxHP: 7,
          armorClass: 15,
          position: { x: 5, y: 5 },
          speed: 30,
        },
      ]);

      // AoE centered on A1 — only Theron is in this tiny blast zone.
      const result = gsm.applyAreaEffect({
        shape: "sphere",
        center: "A1",
        size: 1,
        damage: "2d6",
        damageType: "fire",
        saveAbility: "dexterity",
        saveDC: 15,
        halfOnSave: true,
      });

      assertToolSuccess(result);
      expect(result.data.results).toHaveLength(1);

      const theronResult = result.data.results[0];
      expect(theronResult.target).toBe("Theron");
      // Fighter has DEX 14 → mod +2. No DEX save proficiency (only STR+CON).
      // saveMod must equal +2.
      expect(theronResult.saveMod).toBe(2);
      expect(typeof theronResult.saveRoll).toBe("number");
      expect(theronResult.saveRoll).toBeGreaterThanOrEqual(1 + 2); // d20 min 1 + mod 2
      expect(theronResult.saveRoll).toBeLessThanOrEqual(20 + 2);
    });
  });

  // -------------------------------------------------------------------------
  // Damage application integration — HP actually decreases
  // -------------------------------------------------------------------------

  describe("damage is applied to combatant HP", () => {
    it("goblin HP decreases after AoE with guaranteed-fail DC (DC 30)", () => {
      const { gsm } = createTestGSM();
      setupMap(gsm);
      startCombatWithGoblins(gsm);

      // Read initial HP (maxHP = 7).
      const combatBefore = gsm.gameState.encounter!.combat!;
      const goblin1Before = Object.values(combatBefore.combatants).find(
        (c) => c.name === "Goblin1",
      );
      expect(goblin1Before).toBeDefined();
      const hpBefore = goblin1Before!.currentHP ?? goblin1Before!.maxHP;

      // DC 30 guarantees NPC failures (max roll = 20 + 0 = 20 < 30).
      gsm.applyAreaEffect({
        shape: "sphere",
        center: "F6",
        size: 20,
        damage: "2d6",
        damageType: "fire",
        saveAbility: "dexterity",
        saveDC: 30,
        halfOnSave: false,
      });

      const combatAfter = gsm.gameState.encounter!.combat!;
      const goblin1After = Object.values(combatAfter.combatants).find((c) => c.name === "Goblin1");
      expect(goblin1After).toBeDefined();
      const hpAfter = goblin1After!.currentHP ?? goblin1After!.maxHP;

      expect(hpAfter).toBeLessThan(hpBefore);
    });
  });
});
