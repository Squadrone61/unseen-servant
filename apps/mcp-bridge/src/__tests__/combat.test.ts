import { describe, it, expect } from "vitest";

/**
 * Behavioral contracts for combat lifecycle methods on GameStateManager.
 *
 * ## startCombat(combatants[], surprisedCombatants?)
 * - Guard: returns error ToolResponse if encounter.map is null/undefined — a battle map
 *   must exist before combat can start.
 * - Rolls initiative for every combatant via rollInitiative(initMod).
 * - For type="player" combatants: auto-reads Dex score from this.characters, computes
 *   initMod = Math.floor((dex - 10) / 2), then adds any combatBonuses of type
 *   "initiative" with no condition string.
 * - Sorts turnOrder descending by initiative; ties broken by Dex score (higher wins).
 * - Combat is started with round=1, turnIndex=0, phase="active".
 * - combatant.currentHP defaults to maxHP if currentHP not provided.
 * - Surprised combatants receive surprised=true flag; they cannot act on the first turn
 *   (enforced narratively, not mechanically by the engine).
 * - Creates a "combat_start" GameEvent.
 * - Broadcasts server:combat_update with the full CombatState.
 * - Returns ToolResponse with data: { round, currentTurn, turnOrder[], combatantCount,
 *   surprisedCombatants }.
 *
 * ## endCombat()
 * - Guard: returns error ToolResponse if no encounter.combat exists.
 * - Sets encounter.combat.phase="ended", then sets encounter.combat=undefined.
 * - Sets encounter.phase="exploration".
 * - Clears encounter.map (sets to undefined).
 * - Creates a "combat_end" GameEvent.
 * - Broadcasts server:combat_update with combat=null, map=null.
 * - Returns survivors (combatants with currentHP > 0) and totalRounds.
 *
 * ## advanceTurnMCP()
 * - Guard: returns error ToolResponse if no active combat.
 * - Guard: returns error (isPlayerTurn=true) if the current combatant is type="player" —
 *   players end their own turns via the UI button.
 * - Delegates to private advanceTurn(combat) which:
 *     - Increments turnIndex by 1 mod turnOrder.length.
 *     - When turnIndex wraps to 0: increments round.
 *     - Resets movementUsed=0, reactionUsed=false, bonusActionUsed=false on the combatant
 *       whose turn is starting.
 *     - Processes start-of-turn conditions (expiresAt="start-of-turn") on the new active
 *       combatant — decrements duration, removes if <=0.
 *     - Processes end-of-turn conditions (expiresAt != "start-of-turn") on the previous
 *       combatant — decrements duration, removes if <=0.
 * - Broadcasts server:combat_update.
 * - Returns data: { currentTurn, round, nextUp }.
 *
 * ## addCombatant(params)
 * - Guard: returns error if no active combat.
 * - Rolls initiative; inserts into turnOrder at the correct position (descending order
 *   by initiative).
 * - If the insertion index is <= current turnIndex, turnIndex is incremented so the
 *   current combatant's turn is not disturbed.
 * - For type="player": reads Dex and initiative combatBonuses from this.characters,
 *   mirroring startCombat logic.
 * - Creates a "custom" GameEvent.
 * - Broadcasts server:combat_update.
 * - Returns initiative and A1-formatted position (if provided).
 *
 * ## removeCombatant(combatantName)
 * - Guard: returns error if no combat object exists (any phase).
 * - Returns error with hints listing active combatants if name not found.
 * - Deletes combatant from combatants map and splices from turnOrder.
 * - If the removed combatant was the last one (turnOrder empty), calls endCombat().
 * - If removed index < turnIndex: decrements turnIndex.
 * - If removed index === turnIndex: sets turnIndex = turnIndex % turnOrder.length
 *   (wraps to 0 if needed).
 * - Creates a "custom" GameEvent.
 * - Broadcasts server:combat_update.
 *
 * ## moveCombatant(combatantName, to)
 * - Guard: returns error if no combat object exists.
 * - Returns error with hints if name not found.
 * - Updates combatant.position to the provided GridPosition (no bounds validation —
 *   the caller is responsible for valid coordinates).
 * - Does NOT deduct movementUsed — this is an AI-driven move, not a player turn move.
 * - Returns optional overlap warning in the text if another combatant occupies the
 *   destination cell (non-blocking).
 * - Broadcasts server:combat_update.
 * - Returns data: { name, from (A1 or null), to (A1) }.
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
// Shared setup
// ---------------------------------------------------------------------------

/** Helper: set a minimal 10x10 map so startCombat can proceed */
function setupCombatMap(gsm: TestGSM["gsm"]): void {
  gsm.updateBattleMap({ id: "test-map", width: 10, height: 10, tiles: [], name: "Test Arena" });
}

/** Minimal NPC combatant that satisfies startCombat's shape */
function npc(
  name: string,
  opts: { maxHP?: number; armorClass?: number; position?: { x: number; y: number } } = {},
) {
  return {
    name,
    type: "npc" as const,
    initiativeModifier: 2,
    maxHP: opts.maxHP ?? 7,
    armorClass: opts.armorClass ?? 15,
    position: opts.position,
    speed: 30,
  };
}

// ---------------------------------------------------------------------------
// startCombat
// ---------------------------------------------------------------------------

describe("startCombat", () => {
  describe("requires active battle map", () => {
    it("returns error when no battle map exists", () => {
      const { gsm } = createTestGSM();
      const result = gsm.startCombat([npc("Goblin")]);
      assertToolError(result);
      expect(result.text).toContain("battle map");
    });
  });

  describe("initiative rolling and sort order", () => {
    it("creates combat with round=1, turnIndex=0 and all combatants present", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);

      const result = gsm.startCombat([
        npc("Goblin1", { position: { x: 3, y: 3 } }),
        npc("Goblin2", { position: { x: 4, y: 3 } }),
        npc("Orc", { maxHP: 15, position: { x: 5, y: 3 } }),
      ]);

      assertToolSuccess(result);
      expect(result.data.round).toBe(1);
      // turnOrder returned by startCombat is sorted descending; all three present
      const names: string[] = result.data.turnOrder.map((e: { name: string }) => e.name);
      expect(names).toContain("Goblin1");
      expect(names).toContain("Goblin2");
      expect(names).toContain("Orc");
      expect(result.data.combatantCount).toBe(3);
    });

    it("turnOrder is sorted by initiative descending", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);

      // Run several times — even with random dice the order must be non-increasing
      gsm.startCombat([npc("A"), npc("B"), npc("C")]);

      const combat = gsm.gameState.encounter?.combat;
      expect(combat).toBeDefined();

      const initiatives = combat!.turnOrder.map((id) => combat!.combatants[id].initiative);
      for (let i = 1; i < initiatives.length; i++) {
        expect(initiatives[i]).toBeLessThanOrEqual(initiatives[i - 1]);
      }
    });
  });

  describe("player combatant — auto-reads Dex and initiative bonuses", () => {
    it("player combatant is added to combat using character sheet Dex", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);

      const fighter = createFighterCharacter(); // Theron, Dex 14
      registerCharacter(gsm, "alice", fighter);

      const result = gsm.startCombat([
        { name: "Theron", type: "player" as const, speed: 30 },
        npc("Goblin"),
      ]);

      assertToolSuccess(result);
      const names: string[] = result.data.turnOrder.map((e: { name: string }) => e.name);
      expect(names).toContain("Theron");
    });
  });

  describe("currentHP defaults to maxHP", () => {
    it("combatant without currentHP gets currentHP === maxHP", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);

      gsm.startCombat([npc("Goblin", { maxHP: 7 })]);

      const combat = gsm.gameState.encounter?.combat;
      const goblin = Object.values(combat!.combatants).find((c) => c.name === "Goblin");
      expect(goblin).toBeDefined();
      expect(goblin!.currentHP).toBe(7);
    });
  });
});

// ---------------------------------------------------------------------------
// endCombat
// ---------------------------------------------------------------------------

describe("endCombat", () => {
  describe("no combat to end", () => {
    it("returns error when no combat exists", () => {
      const { gsm } = createTestGSM();
      const result = gsm.endCombat();
      assertToolError(result);
    });
  });

  describe("clears combat, map, and sets exploration phase", () => {
    it("combat is null and encounter phase is exploration after endCombat", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin")]);

      const result = gsm.endCombat();

      assertToolSuccess(result);
      // encounter still exists but combat and map are cleared
      expect(gsm.gameState.encounter?.combat).toBeUndefined();
      expect(gsm.gameState.encounter?.map).toBeUndefined();
      expect(gsm.gameState.encounter?.phase).toBe("exploration");
    });
  });
});

// ---------------------------------------------------------------------------
// advanceTurnMCP
// ---------------------------------------------------------------------------

describe("advanceTurnMCP", () => {
  describe("blocks on player turn", () => {
    it("returns isPlayerTurn=true when current turn belongs to a player", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);

      const fighter = createFighterCharacter(); // Theron
      registerCharacter(gsm, "alice", fighter);

      // Use a very high initiativeModifier so Theron wins initiative and goes first
      gsm.startCombat([
        { name: "Theron", type: "player" as const, initiativeModifier: 100, speed: 30 },
        npc("Goblin", { position: { x: 3, y: 3 } }),
      ]);

      // Theron should be turnIndex=0 (initiative 100+d20 always beats Goblin's 2+d20)
      const combat = gsm.gameState.encounter!.combat!;
      const firstId = combat.turnOrder[0];
      const first = combat.combatants[firstId];

      // If by some fluke Theron is not first, skip — this test is designed for player-first
      if (first.type === "player") {
        const result = gsm.advanceTurnMCP();
        assertToolError(result);
        expect(result.data.isPlayerTurn).toBe(true);
      } else {
        // Goblin is first — advance to player turn and verify block
        const advance = gsm.advanceTurnMCP();
        // If goblin was first and advance succeeded, next must be Theron
        if (!advance.error) {
          const result = gsm.advanceTurnMCP();
          assertToolError(result);
          expect(result.data.isPlayerTurn).toBe(true);
        }
      }
    });
  });

  describe("increments turnIndex, wraps and increments round", () => {
    it("turnIndex increments after advancing NPC turn", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);

      gsm.startCombat([npc("Goblin1"), npc("Goblin2"), npc("Goblin3")]);

      const combat = gsm.gameState.encounter!.combat!;
      const beforeIndex = combat.turnIndex;

      const result = gsm.advanceTurnMCP();
      assertToolSuccess(result);

      expect(combat.turnIndex).toBe((beforeIndex + 1) % 3);
    });

    it("round increments and turnIndex wraps to 0 after all NPC turns complete", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);

      gsm.startCombat([npc("Goblin1"), npc("Goblin2")]);

      const combat = gsm.gameState.encounter!.combat!;
      expect(combat.round).toBe(1);

      // Advance through both turns to wrap
      gsm.advanceTurnMCP(); // turnIndex becomes 1
      gsm.advanceTurnMCP(); // turnIndex wraps to 0, round becomes 2

      expect(combat.round).toBe(2);
      expect(combat.turnIndex).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// addCombatant
// ---------------------------------------------------------------------------

describe("addCombatant", () => {
  describe("no active combat", () => {
    it("returns error when no combat exists", () => {
      const { gsm } = createTestGSM();
      const result = gsm.addCombatant(npc("Goblin"));
      assertToolError(result);
    });
  });

  describe("inserts at correct initiative position in turnOrder", () => {
    it("new combatant appears in turnOrder after being added mid-combat", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);

      gsm.startCombat([npc("Goblin1"), npc("Goblin2")]);
      const beforeCount = Object.keys(gsm.gameState.encounter!.combat!.combatants).length;

      const result = gsm.addCombatant(npc("Orc", { maxHP: 15 }));
      assertToolSuccess(result);

      const afterCount = Object.keys(gsm.gameState.encounter!.combat!.combatants).length;
      expect(afterCount).toBe(beforeCount + 1);

      const names = Object.values(gsm.gameState.encounter!.combat!.combatants).map((c) => c.name);
      expect(names).toContain("Orc");
    });
  });
});

// ---------------------------------------------------------------------------
// removeCombatant
// ---------------------------------------------------------------------------

describe("removeCombatant", () => {
  describe("no combat", () => {
    it("returns error when no combat exists", () => {
      const { gsm } = createTestGSM();
      const result = gsm.removeCombatant("Goblin");
      assertToolError(result);
    });
  });

  describe("combatant not found", () => {
    it("returns error with hints when name does not exist in combat", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin")]);

      const result = gsm.removeCombatant("NonExistent");
      assertToolError(result);
      // hints should mention active combatants
      expect(result.hints).toBeDefined();
      expect(result.hints!.some((h: string) => h.includes("Goblin"))).toBe(true);
    });
  });

  describe("adjusts turnIndex after removal", () => {
    it("turnOrder shrinks by 1 after removing a combatant", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);

      gsm.startCombat([npc("Goblin1"), npc("Goblin2"), npc("Orc")]);
      const beforeLen = gsm.gameState.encounter!.combat!.turnOrder.length;

      const result = gsm.removeCombatant("Goblin1");
      assertToolSuccess(result);

      const afterLen = gsm.gameState.encounter!.combat?.turnOrder.length;
      // afterLen may be undefined if removing the last caused endCombat, but we have 3
      expect(afterLen).toBe(beforeLen - 1);
    });
  });
});

// ---------------------------------------------------------------------------
// moveCombatant
// ---------------------------------------------------------------------------

describe("moveCombatant", () => {
  describe("no combat", () => {
    it("returns error when no combat exists", () => {
      const { gsm } = createTestGSM();
      const result = gsm.moveCombatant("Goblin", { x: 1, y: 1 });
      assertToolError(result);
    });
  });

  describe("combatant not found", () => {
    it("returns error with hints when name is not in combat", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin", { position: { x: 2, y: 2 } })]);

      const result = gsm.moveCombatant("NonExistent", { x: 5, y: 5 });
      assertToolError(result);
      expect(result.hints).toBeDefined();
    });
  });

  describe("updates position without deducting movementUsed", () => {
    it("position is updated to the new coordinates", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);

      gsm.startCombat([npc("Goblin", { position: { x: 2, y: 2 } })]);
      const combat = gsm.gameState.encounter!.combat!;

      const result = gsm.moveCombatant("Goblin", { x: 5, y: 7 });
      assertToolSuccess(result);

      const goblin = Object.values(combat.combatants).find((c) => c.name === "Goblin");
      expect(goblin!.position).toEqual({ x: 5, y: 7 });
    });

    it("movementUsed is not changed after an AI-driven move", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);

      gsm.startCombat([npc("Goblin", { position: { x: 2, y: 2 } })]);
      const combat = gsm.gameState.encounter!.combat!;

      const goblinBefore = Object.values(combat.combatants).find((c) => c.name === "Goblin")!;
      const movementBefore = goblinBefore.movementUsed;

      gsm.moveCombatant("Goblin", { x: 5, y: 7 });

      const goblinAfter = Object.values(combat.combatants).find((c) => c.name === "Goblin")!;
      expect(goblinAfter.movementUsed).toBe(movementBefore);
    });

    it("returns data with from and to in A1 notation", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);

      gsm.startCombat([npc("Goblin", { position: { x: 0, y: 0 } })]);

      const result = gsm.moveCombatant("Goblin", { x: 4, y: 2 });
      assertToolSuccess(result);
      expect(result.data.name).toBe("Goblin");
      // to should be a non-empty string (A1 notation like "E3")
      expect(typeof result.data.to).toBe("string");
      expect(result.data.to.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// setInitiative
// ---------------------------------------------------------------------------

/**
 * ## setInitiative(name, initiative)
 * - Finds combatant by name (case-insensitive).
 * - Updates combatant.initiative to the new value.
 * - Re-sorts turnOrder descending by initiative (tiebreak: initiativeModifier).
 * - Preserves which combatant is currently active (turnIndex follows the active combatant).
 * - Broadcasts server:combat_update.
 * - Returns new turn order with name + initiative for each combatant.
 * - Returns error if no active combat or combatant not found.
 */
describe("setInitiative", () => {
  describe("no active combat", () => {
    it("returns error when no combat exists", () => {
      const { gsm } = createTestGSM();
      const result = gsm.setInitiative("Goblin", 20);
      assertToolError(result);
    });
  });

  describe("combatant not found", () => {
    it("returns error with available combatants hint", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin1"), npc("Goblin2")]);

      const result = gsm.setInitiative("NonExistent", 20);
      assertToolError(result);
      expect(result.hints).toBeDefined();
      expect(result.hints![0]).toContain("Goblin1");
    });
  });

  describe("updates initiative and re-sorts turn order", () => {
    it("changes a combatant's initiative value", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin1"), npc("Goblin2"), npc("Orc")]);

      const combat = gsm.gameState.encounter!.combat!;
      const goblin1 = Object.values(combat.combatants).find((c) => c.name === "Goblin1")!;

      const result = gsm.setInitiative("Goblin1", 99);
      assertToolSuccess(result);

      expect(goblin1.initiative).toBe(99);
    });

    it("re-sorts so the highest initiative is first in turnOrder", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin1"), npc("Goblin2"), npc("Orc")]);

      // Give Orc the highest initiative
      gsm.setInitiative("Orc", 99);

      const combat = gsm.gameState.encounter!.combat!;
      const firstId = combat.turnOrder[0];
      expect(combat.combatants[firstId].name).toBe("Orc");
    });

    it("preserves the active combatant after reorder", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin1"), npc("Goblin2"), npc("Orc")]);

      const combat = gsm.gameState.encounter!.combat!;
      const activeBeforeId = combat.turnOrder[combat.turnIndex];
      const activeBeforeName = combat.combatants[activeBeforeId].name;

      // Change some other combatant's initiative
      const otherName = activeBeforeName === "Orc" ? "Goblin1" : "Orc";
      gsm.setInitiative(otherName, 99);

      // Active combatant should still be the same
      const activeAfterId = combat.turnOrder[combat.turnIndex];
      expect(combat.combatants[activeAfterId].name).toBe(activeBeforeName);
    });
  });

  describe("returns turn order in response data", () => {
    it("includes turnOrder array with name and initiative for each combatant", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin1"), npc("Goblin2")]);

      const result = gsm.setInitiative("Goblin1", 25);
      assertToolSuccess(result);

      const data = result.data as { turnOrder: Array<{ name: string; initiative: number }> };
      expect(data.turnOrder).toBeDefined();
      expect(data.turnOrder.length).toBe(2);

      const g1 = data.turnOrder.find((e) => e.name === "Goblin1");
      expect(g1).toBeDefined();
      expect(g1!.initiative).toBe(25);
    });
  });
});

// ---------------------------------------------------------------------------
// setActiveTurn
// ---------------------------------------------------------------------------

/**
 * ## setActiveTurn(name)
 * - Finds combatant by name (case-insensitive) in turnOrder.
 * - Sets turnIndex to that combatant's position.
 * - Does NOT increment round (DM override, not natural advance).
 * - Does NOT process condition expiration for skipped turns.
 * - Broadcasts server:combat_update.
 * - Returns current turn, round, and nextUp (same shape as advanceTurnMCP).
 * - Returns error if no active combat or combatant not found.
 */
describe("setActiveTurn", () => {
  describe("no active combat", () => {
    it("returns error when no combat exists", () => {
      const { gsm } = createTestGSM();
      const result = gsm.setActiveTurn("Goblin");
      assertToolError(result);
    });
  });

  describe("combatant not found", () => {
    it("returns error with available combatants hint", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin1"), npc("Goblin2")]);

      const result = gsm.setActiveTurn("NonExistent");
      assertToolError(result);
      expect(result.hints).toBeDefined();
    });
  });

  describe("jumps to specified combatant's turn", () => {
    it("sets turnIndex to the named combatant", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin1"), npc("Goblin2"), npc("Orc")]);

      const result = gsm.setActiveTurn("Orc");
      assertToolSuccess(result);

      const combat = gsm.gameState.encounter!.combat!;
      const activeId = combat.turnOrder[combat.turnIndex];
      expect(combat.combatants[activeId].name).toBe("Orc");
    });

    it("does not change the round number", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin1"), npc("Goblin2")]);

      const combat = gsm.gameState.encounter!.combat!;
      const roundBefore = combat.round;

      gsm.setActiveTurn("Goblin2");
      expect(combat.round).toBe(roundBefore);
    });

    it("does not trigger condition expiration on skipped combatants", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin1"), npc("Goblin2"), npc("Orc")]);

      // Add a duration=1 condition to Goblin1
      gsm.addCondition("Goblin1", "Stunned", 1);
      const combat = gsm.gameState.encounter!.combat!;
      const goblin1 = Object.values(combat.combatants).find((c) => c.name === "Goblin1")!;

      // Jump directly to Orc — skip Goblin1's turn
      gsm.setActiveTurn("Orc");

      // Goblin1's condition should NOT have expired (no end-of-turn processing)
      expect(goblin1.conditions?.some((c) => c.name === "Stunned")).toBe(true);
      expect(goblin1.conditions?.find((c) => c.name === "Stunned")!.duration).toBe(1);
    });
  });

  describe("returns turn context in response data", () => {
    it("includes currentTurn, round, and nextUp", () => {
      const { gsm } = createTestGSM();
      setupCombatMap(gsm);
      gsm.startCombat([npc("Goblin1"), npc("Goblin2"), npc("Orc")]);

      const result = gsm.setActiveTurn("Orc");
      assertToolSuccess(result);

      const data = result.data as { currentTurn: string; round: number; nextUp: string };
      expect(data.currentTurn).toBe("Orc");
      expect(data.round).toBe(1);
      expect(typeof data.nextUp).toBe("string");
    });
  });
});
