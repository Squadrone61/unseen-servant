import { describe, it, expect, beforeEach } from "vitest";
import {
  createTestGSM,
  createFighterCharacter,
  createClericCharacter,
  registerCharacter,
  assertToolSuccess,
  assertToolError,
} from "./setup.js";
import type { TestGSM } from "./setup.js";
import {
  createWarlockCharacter,
  createBarbarianCharacter,
  createMulticlassCharacter,
} from "./fixtures.js";

/**
 * Behavioral contracts for spell slot and class resource methods on GameStateManager.
 *
 * ## useSpellSlot(characterName, level)
 * - Searches char.dynamic.spellSlotsUsed for an entry with matching level.
 * - If regular slot found and slot.used < slot.total: increments slot.used, broadcasts
 *   character_updated, returns remaining count.
 * - If regular slot found but slot.used >= slot.total: falls back to pactMagicSlots at
 *   the same level before reporting exhaustion. If a pact slot exists and has uses:
 *   increments pactSlot.used, returns slotType="pactMagic" in data.
 * - If no regular slot at that level exists: tries pactMagicSlots directly.
 * - Returns error ToolResponse with hints when all slots are exhausted.
 * - Returns error when character has no slot of any kind at the requested level.
 * - Returns error when character is not found.
 *
 * ## restoreSpellSlot(characterName, level)
 * - Checks regular slots first; if found and slot.used > 0: decrements slot.used.
 * - If regular slot is already full (used=0): returns non-error ToolResponse indicating
 *   already at maximum (not an error — error=undefined, not true).
 * - Falls back to pactMagicSlots if no regular slot at that level.
 * - If pact slot found and used > 0: decrements pactSlot.used.
 * - If pact slot is already full: returns non-error ToolResponse.
 * - If no slot of either type at that level: returns error ToolResponse.
 * - Broadcasts server:character_updated on success.
 *
 * ## useClassResource(characterName, resourceName)
 * - Looks up resource by name (case-insensitive) in char.static.classResources.
 * - Returns error if resource not found on the character.
 * - Uses canonical name (resource.name) as the key into char.dynamic.resourcesUsed.
 * - Initializes resourcesUsed to {} if undefined.
 * - current used = resourcesUsed[canonicalName] ?? 0.
 * - If used >= resource.maxUses: returns error ToolResponse with remaining=0.
 * - Otherwise: increments resourcesUsed[canonicalName] by 1.
 * - Creates a "resource_used" GameEvent.
 * - Broadcasts server:character_updated.
 * - Returns remaining = maxUses - (used + 1).
 *
 * ## restoreClassResource(characterName, resourceName, amount?)
 * - Default amount=1.
 * - amount >= 999: sets resourcesUsed[canonicalName] = 0 (full restore).
 * - Otherwise: sets resourcesUsed[canonicalName] = Math.max(0, used - amount).
 * - Creates a "resource_restored" GameEvent.
 * - Broadcasts server:character_updated.
 * - Returns remaining = maxUses - newUsed.
 * - Does NOT error if resource is already fully restored — simply records the event
 *   and returns the current state.
 */

// ---------------------------------------------------------------------------
// Spell Slots — Brynn the Level 5 Cleric (Player2)
// Fixture slots: level 1 (4 total), level 2 (3 total), level 3 (2 total)
// ---------------------------------------------------------------------------

describe("useSpellSlot", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createFighterCharacter());
    registerCharacter(env.gsm, "Player2", createClericCharacter());
  });

  describe("regular slot available at requested level", () => {
    it("increments used from 0 to 1 when expending a level-1 slot", () => {
      const { gsm } = env;
      const result = gsm.useSpellSlot("Brynn", 1);

      assertToolSuccess(result);

      const char = gsm.characters["Player2"];
      const slot = char.dynamic.spellSlotsUsed.find((s) => s.level === 1);
      expect(slot).toBeDefined();
      expect(slot!.used).toBe(1);
    });
  });

  describe("all slots exhausted at level", () => {
    it("returns an error after all 4 level-1 slots are spent", () => {
      const { gsm } = env;
      // Expend all 4 level-1 slots (Brynn has total=4)
      gsm.useSpellSlot("Brynn", 1);
      gsm.useSpellSlot("Brynn", 1);
      gsm.useSpellSlot("Brynn", 1);
      gsm.useSpellSlot("Brynn", 1);

      const result = gsm.useSpellSlot("Brynn", 1);
      assertToolError(result);
    });
  });

  describe("character has no slot of any kind at requested level", () => {
    it("returns an error for a level that the character does not have slots for", () => {
      const { gsm } = env;
      // Brynn is a level-5 Cleric — no level-9 slots exist
      const result = gsm.useSpellSlot("Brynn", 9);
      assertToolError(result);
    });
  });
});

describe("restoreSpellSlot", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createFighterCharacter());
    registerCharacter(env.gsm, "Player2", createClericCharacter());
  });

  describe("restores one use from regular slot", () => {
    it("decrements used back to 0 after using and restoring a level-1 slot", () => {
      const { gsm } = env;
      gsm.useSpellSlot("Brynn", 1);

      const char = gsm.characters["Player2"];
      const slotAfterUse = char.dynamic.spellSlotsUsed.find((s) => s.level === 1);
      expect(slotAfterUse!.used).toBe(1);

      const result = gsm.restoreSpellSlot("Brynn", 1);
      assertToolSuccess(result);

      const slotAfterRestore = char.dynamic.spellSlotsUsed.find((s) => s.level === 1);
      expect(slotAfterRestore!.used).toBe(0);
    });
  });

  describe("regular slot already full — non-error response", () => {
    it("returns a non-error (no error flag) when the slot is already fully restored", () => {
      const { gsm } = env;
      // Brynn starts with used=0 at every level — do not expend any slot
      const result = gsm.restoreSpellSlot("Brynn", 1);

      // The implementation returns a success response noting the slot is at maximum,
      // NOT an error ToolResponse.
      expect(result.error).toBeFalsy();
      expect(result.text).toBeTruthy();
    });
  });

  describe("no slot of either type at level — returns error", () => {
    it("returns an error when there is no spell slot or pact slot at the given level", () => {
      const { gsm } = env;
      const result = gsm.restoreSpellSlot("Brynn", 9);
      assertToolError(result);
    });
  });
});

// ---------------------------------------------------------------------------
// Class Resources — Theron the Level 5 Fighter (Player1)
// Fixture resources: Second Wind (maxUses=2 at level 5, short rest), Action Surge (maxUses=1, short rest)
// ---------------------------------------------------------------------------

describe("useClassResource", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createFighterCharacter());
    registerCharacter(env.gsm, "Player2", createClericCharacter());
  });

  describe("resource found and uses remaining", () => {
    it("expends Second Wind and sets resourcesUsed['Second Wind'] to 1", () => {
      const { gsm } = env;
      const result = gsm.useClassResource("Theron", "Second Wind");

      assertToolSuccess(result);

      const char = gsm.characters["Player1"];
      expect(char.dynamic.resourcesUsed?.["Second Wind"]).toBe(1);
    });
  });

  describe("resource exhausted — error with remaining=0", () => {
    it("returns an error when Second Wind (maxUses=3) has already been spent", () => {
      const { gsm } = env;
      gsm.useClassResource("Theron", "Second Wind");
      gsm.useClassResource("Theron", "Second Wind");
      gsm.useClassResource("Theron", "Second Wind");

      const result = gsm.useClassResource("Theron", "Second Wind");
      assertToolError(result);

      expect(result.data).toBeDefined();
      const data = result.data as { remaining: number };
      expect(data.remaining).toBe(0);
    });
  });

  describe("resource not found on character", () => {
    it("returns an error when the resource name is not on the character", () => {
      const { gsm } = env;
      const result = gsm.useClassResource("Theron", "Bardic Inspiration");
      assertToolError(result);
    });
  });
});

describe("restoreClassResource", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createFighterCharacter());
    registerCharacter(env.gsm, "Player2", createClericCharacter());
  });

  describe("restores one use by default", () => {
    it("restores Second Wind back to 0 used after spending it once", () => {
      const { gsm } = env;
      gsm.useClassResource("Theron", "Second Wind");

      const char = gsm.characters["Player1"];
      expect(char.dynamic.resourcesUsed?.["Second Wind"]).toBe(1);

      const result = gsm.restoreClassResource("Theron", "Second Wind");
      assertToolSuccess(result);

      expect(char.dynamic.resourcesUsed?.["Second Wind"]).toBe(0);
    });
  });

  describe("amount=999 fully restores (sets used=0)", () => {
    it("sets resourcesUsed to 0 when amount=999 regardless of prior usage", () => {
      const { gsm } = env;
      gsm.useClassResource("Theron", "Second Wind");

      const char = gsm.characters["Player1"];
      expect(char.dynamic.resourcesUsed?.["Second Wind"]).toBe(1);

      const result = gsm.restoreClassResource("Theron", "Second Wind", 999);
      assertToolSuccess(result);

      expect(char.dynamic.resourcesUsed?.["Second Wind"]).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Pact Magic — Zara the Level 5 Warlock (Player3)
// Pact slots: level 3 (2 total). No regular spell slots.
// ---------------------------------------------------------------------------

/**
 * Pact magic behavioral contracts:
 * - useSpellSlot at the pact slot level succeeds and uses the pact slot directly
 *   (there is no regular slot at that level to fall back through).
 * - After all pact slots at a level are spent, useSpellSlot returns error.
 * - useSpellSlot at a level with neither regular nor pact slot returns error.
 * - restoreSpellSlot decrements pact slot used count.
 * - restoreSpellSlot when already full returns non-error (same as regular slot).
 */
describe("pact magic — Zara (Warlock 5, pact level 3)", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player3", createWarlockCharacter());
  });

  describe("useSpellSlot — pact slot at level 3", () => {
    it("expends first pact slot (used 0→1) and returns slotType=pactMagic", () => {
      const { gsm } = env;
      const result = gsm.useSpellSlot("Zara", 3);

      assertToolSuccess(result);

      const char = gsm.characters["Player3"];
      const pact = char.dynamic.pactMagicSlots?.find((s) => s.level === 3);
      expect(pact).toBeDefined();
      expect(pact!.used).toBe(1);
      expect((result.data as { slotType?: string }).slotType).toBe("pactMagic");
    });

    it("expends second pact slot (used 1→2) successfully", () => {
      const { gsm } = env;
      gsm.useSpellSlot("Zara", 3);

      const result = gsm.useSpellSlot("Zara", 3);
      assertToolSuccess(result);

      const char = gsm.characters["Player3"];
      const pact = char.dynamic.pactMagicSlots?.find((s) => s.level === 3);
      expect(pact!.used).toBe(2);
    });

    it("returns error after both pact slots are exhausted", () => {
      const { gsm } = env;
      gsm.useSpellSlot("Zara", 3);
      gsm.useSpellSlot("Zara", 3);

      const result = gsm.useSpellSlot("Zara", 3);
      assertToolError(result);
    });

    it("returns error for level 1 — no regular slot and no pact slot at that level", () => {
      const { gsm } = env;
      const result = gsm.useSpellSlot("Zara", 1);
      assertToolError(result);
    });
  });

  describe("restoreSpellSlot — pact slot at level 3", () => {
    it("decrements pact slot used from 1 back to 0 after use", () => {
      const { gsm } = env;
      gsm.useSpellSlot("Zara", 3);

      const char = gsm.characters["Player3"];
      const pactBefore = char.dynamic.pactMagicSlots?.find((s) => s.level === 3);
      expect(pactBefore!.used).toBe(1);

      const result = gsm.restoreSpellSlot("Zara", 3);
      assertToolSuccess(result);

      const pactAfter = char.dynamic.pactMagicSlots?.find((s) => s.level === 3);
      expect(pactAfter!.used).toBe(0);
    });

    it("returns non-error when pact slot is already fully restored (used=0)", () => {
      const { gsm } = env;
      // Do not use any slot — pact slot starts at used=0
      const result = gsm.restoreSpellSlot("Zara", 3);

      expect(result.error).toBeFalsy();
      expect(result.text).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Pact + Regular Mix — Selene (Cleric 3 / Warlock 2, Player5)
// Regular slots: 4 L1, 2 L2. Pact slots: 2 L1.
// ---------------------------------------------------------------------------

/**
 * Multiclass pact+regular slot contracts:
 * - useSpellSlot at L1 uses regular Cleric slot first (4 available).
 * - After exhausting all 4 regular L1 slots, falls back to pact L1 slots (2 available).
 * - After exhausting regular + pact L1 (6 total), returns error.
 * - useSpellSlot at L2 uses regular Cleric L2 slot (no pact slot at L2).
 */
describe("pact + regular mix — Selene (Cleric 3 / Warlock 2)", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player5", createMulticlassCharacter());
  });

  describe("L1 slots: regular consumed before pact fallback", () => {
    it("first 4 uses of L1 consume the regular Cleric slots", () => {
      const { gsm } = env;
      for (let i = 0; i < 4; i++) {
        const result = gsm.useSpellSlot("Selene", 1);
        assertToolSuccess(result);
      }

      const char = gsm.characters["Player5"];
      const regularL1 = char.dynamic.spellSlotsUsed.find((s) => s.level === 1);
      expect(regularL1).toBeDefined();
      expect(regularL1!.used).toBe(4);
      expect(regularL1!.total).toBe(4);

      // Pact L1 still untouched
      const pactL1 = char.dynamic.pactMagicSlots?.find((s) => s.level === 1);
      expect(pactL1!.used).toBe(0);
    });

    it("5th use falls back to pact L1 slot after regular is exhausted", () => {
      const { gsm } = env;
      // Exhaust all regular L1 slots
      for (let i = 0; i < 4; i++) {
        gsm.useSpellSlot("Selene", 1);
      }

      const result = gsm.useSpellSlot("Selene", 1);
      assertToolSuccess(result);
      expect((result.data as { slotType?: string }).slotType).toBe("pactMagic");

      const char = gsm.characters["Player5"];
      const pactL1 = char.dynamic.pactMagicSlots?.find((s) => s.level === 1);
      expect(pactL1!.used).toBe(1);
    });

    it("returns error after all 6 L1 slots (4 regular + 2 pact) are exhausted", () => {
      const { gsm } = env;
      // Use all 4 regular + 2 pact = 6 total
      for (let i = 0; i < 6; i++) {
        gsm.useSpellSlot("Selene", 1);
      }

      const result = gsm.useSpellSlot("Selene", 1);
      assertToolError(result);
    });
  });

  describe("L2 slots: regular only (no pact at L2)", () => {
    it("uses regular L2 slot successfully", () => {
      const { gsm } = env;
      const result = gsm.useSpellSlot("Selene", 2);
      assertToolSuccess(result);

      const char = gsm.characters["Player5"];
      const regularL2 = char.dynamic.spellSlotsUsed.find((s) => s.level === 2);
      expect(regularL2).toBeDefined();
      expect(regularL2!.used).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Long-rest resource — Gruk the Level 5 Barbarian (Player4)
// Class resources: Rage ×3 (resetType="long")
// ---------------------------------------------------------------------------

/**
 * Long-rest resource contracts:
 * - useClassResource("Gruk", "Rage") succeeds up to 3 times.
 * - A 4th use returns error with remaining=0.
 * - restoreClassResource restores one use at a time.
 * - restoreClassResource with amount=999 fully restores to 0 used.
 */
describe("long-rest resource — Gruk (Barbarian 5, Rage ×3)", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player4", createBarbarianCharacter());
  });

  describe("useClassResource — Rage", () => {
    it("first use of Rage increments resourcesUsed['Rage'] to 1", () => {
      const { gsm } = env;
      const result = gsm.useClassResource("Gruk", "Rage");

      assertToolSuccess(result);

      const char = gsm.characters["Player4"];
      expect(char.dynamic.resourcesUsed?.["Rage"]).toBe(1);
    });

    it("returns error on the 4th use (all 3 Rage uses exhausted)", () => {
      const { gsm } = env;
      gsm.useClassResource("Gruk", "Rage");
      gsm.useClassResource("Gruk", "Rage");
      gsm.useClassResource("Gruk", "Rage");

      const result = gsm.useClassResource("Gruk", "Rage");
      assertToolError(result);

      expect((result.data as { remaining: number }).remaining).toBe(0);
    });
  });

  describe("restoreClassResource — Rage", () => {
    it("restores one Rage use after spending one", () => {
      const { gsm } = env;
      gsm.useClassResource("Gruk", "Rage");

      const char = gsm.characters["Player4"];
      expect(char.dynamic.resourcesUsed?.["Rage"]).toBe(1);

      const result = gsm.restoreClassResource("Gruk", "Rage");
      assertToolSuccess(result);

      expect(char.dynamic.resourcesUsed?.["Rage"]).toBe(0);
    });

    it("amount=999 fully restores Rage after all 3 uses are spent", () => {
      const { gsm } = env;
      gsm.useClassResource("Gruk", "Rage");
      gsm.useClassResource("Gruk", "Rage");
      gsm.useClassResource("Gruk", "Rage");

      const char = gsm.characters["Player4"];
      expect(char.dynamic.resourcesUsed?.["Rage"]).toBe(3);

      const result = gsm.restoreClassResource("Gruk", "Rage", 999);
      assertToolSuccess(result);

      expect(char.dynamic.resourcesUsed?.["Rage"]).toBe(0);
    });
  });
});
