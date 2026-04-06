import { describe, it, beforeEach, expect } from "vitest";
import {
  createTestGSM,
  createFighterCharacter,
  createClericCharacter,
  registerCharacter,
  assertToolSuccess,
  assertToolError,
} from "./setup.js";
import type { GameStateManager } from "../services/game-state-manager.js";
import {
  createWarlockCharacter,
  createBarbarianCharacter,
  createMulticlassCharacter,
} from "./fixtures.js";

/**
 * Behavioral contracts for rest and death saving throw methods on GameStateManager.
 *
 * ## shortRest(characterNames[])
 * - Iterates characterNames; for each name, searches this.characters case-insensitively.
 * - Restores class resources with resetType="short": sets resourcesUsed[name]=0 for each.
 * - Restores Warlock pact magic slots: sets slot.used=0 for each pactMagicSlot with
 *   used > 0.
 * - Does NOT restore regular spell slots (spellSlotsUsed).
 * - Does NOT restore HP — short rest HP recovery via Hit Dice is handled narratively.
 * - Creates a "rest_short" GameEvent per character.
 * - Broadcasts server:character_updated per character.
 * - Returns per-character summary in data.characters[].
 * - Returns error ToolResponse when no matching characters are found.
 *
 * ## longRest(characterNames[])
 * - Restores HP to char.static.maxHP.
 * - Resets all spellSlotsUsed entries (used=0).
 * - Resets all pactMagicSlots entries (used=0).
 * - Resets all class resources (resourcesUsed[name]=0) regardless of resetType.
 * - Resets deathSaves to { successes: 0, failures: 0 }.
 * - Clears concentration (concentratingOn=undefined).
 * - Exhaustion: decrements exhaustionLevel by 1. If it reaches 0, removes the
 *   "Exhaustion" condition entry; otherwise leaves the condition entry.
 * - Condition clearing: ONLY clears conditions flagged with endsOnLongRest=true.
 *   Permanent conditions (name.toLowerCase() in ["cursed","petrified","dead"]) are
 *   never cleared. All other conditions persist through long rest.
 * - Creates a "rest_long" GameEvent per character.
 * - Broadcasts server:character_updated per character.
 * - Returns error ToolResponse when no matching characters are found.
 *
 * ## recordDeathSave(characterName, success, options?)
 * - Returns error ToolResponse if char.dynamic.currentHP > 0.
 * - options.criticalSuccess=true (nat 20): sets currentHP=1, resets deathSaves to
 *   {0,0}, removes "Unconscious" and "Stabilized" conditions, creates "death_save"
 *   GameEvent. Returns status="revived".
 * - options.criticalFail=true (nat 1): adds 2 failures instead of 1
 *   (Math.min(3, failures + 2)).
 * - success=true (normal): increments deathSaves.successes by 1.
 * - success=false (normal): increments deathSaves.failures by 1.
 * - At 3 successes: pushes "Stabilized" condition (if not already present).
 *   Returns status="stable".
 * - At 3 failures: pushes "Dead" condition (if not already present).
 *   Returns status="dead".
 * - criticalFail alone does not guarantee death — only when failures reaches 3.
 * - Creates a "death_save" GameEvent.
 * - Broadcasts server:character_updated.
 * - Returns data: { character, success, criticalFail, successes, failures, status }.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTheron(gsm: GameStateManager) {
  return gsm.characters["Player1"]!;
}

function getBrynn(gsm: GameStateManager) {
  return gsm.characters["Player2"]!;
}

// ---------------------------------------------------------------------------
// shortRest
// ---------------------------------------------------------------------------

describe("shortRest", () => {
  let gsm: GameStateManager;

  beforeEach(() => {
    ({ gsm } = createTestGSM());
    registerCharacter(gsm, "Player1", createFighterCharacter());
    registerCharacter(gsm, "Player2", createClericCharacter());
  });

  describe("restores short-reset class resources", () => {
    it("restores Second Wind (resetType=short) after use on Theron", () => {
      const theron = getTheron(gsm);
      // Simulate using Second Wind
      theron.dynamic.resourcesUsed = { "Second Wind": 1, "Action Surge": 1 };

      const result = gsm.shortRest(["Theron"]);

      assertToolSuccess(result);
      const updated = getTheron(gsm);
      expect(updated.dynamic.resourcesUsed!["Second Wind"]).toBe(0);
      expect(updated.dynamic.resourcesUsed!["Action Surge"]).toBe(0);
    });

    it("restores Channel Divinity (resetType=short) on Brynn", () => {
      const brynn = getBrynn(gsm);
      brynn.dynamic.resourcesUsed = { "Channel Divinity": 2 };

      const result = gsm.shortRest(["Brynn"]);

      assertToolSuccess(result);
      const updated = getBrynn(gsm);
      expect(updated.dynamic.resourcesUsed!["Channel Divinity"]).toBe(0);
    });
  });

  describe("restores Warlock pact magic slots", () => {
    it("resets used pact magic slots to 0", () => {
      const theron = getTheron(gsm);
      theron.dynamic.pactMagicSlots = [{ level: 3, total: 2, used: 2 }];

      const result = gsm.shortRest(["Theron"]);

      assertToolSuccess(result);
      const updated = getTheron(gsm);
      expect(updated.dynamic.pactMagicSlots![0]!.used).toBe(0);
    });
  });

  describe("does not restore regular spell slots", () => {
    it("spell slots used on Brynn remain used after short rest", () => {
      const brynn = getBrynn(gsm);
      // Use a level-1 slot
      brynn.dynamic.spellSlotsUsed[0]!.used = 1;

      const result = gsm.shortRest(["Brynn"]);

      assertToolSuccess(result);
      const updated = getBrynn(gsm);
      expect(updated.dynamic.spellSlotsUsed[0]!.used).toBe(1);
    });
  });

  describe("does not restore HP", () => {
    it("HP remains unchanged after short rest", () => {
      const theron = getTheron(gsm);
      theron.dynamic.currentHP = 20;

      const result = gsm.shortRest(["Theron"]);

      assertToolSuccess(result);
      const updated = getTheron(gsm);
      expect(updated.dynamic.currentHP).toBe(20);
    });
  });

  describe("no matching characters — error", () => {
    it("returns error ToolResponse when character name does not match any player", () => {
      const result = gsm.shortRest(["Glarbnaz the Unknowable"]);
      assertToolError(result);
    });
  });

  describe("hit dice hints in response", () => {
    it("includes hitDice for Fighter (5d10)", () => {
      const result = gsm.shortRest(["Theron"]);
      assertToolSuccess(result);
      const chars = result.data.characters as Array<Record<string, unknown>>;
      const theron = chars.find((c) => c.character === "Theron");
      expect(theron).toBeDefined();
      expect(theron!.hitDice).toBe("5d10");
    });

    it("includes hitDice for Cleric (5d8)", () => {
      const result = gsm.shortRest(["Brynn"]);
      assertToolSuccess(result);
      const chars = result.data.characters as Array<Record<string, unknown>>;
      const brynn = chars.find((c) => c.character === "Brynn");
      expect(brynn).toBeDefined();
      expect(brynn!.hitDice).toBe("5d8");
    });

    it("includes correct healingPerDie with CON modifier", () => {
      // Theron has CON 14 → +2 mod → 1d10+2
      const result = gsm.shortRest(["Theron"]);
      const chars = result.data.characters as Array<Record<string, unknown>>;
      const theron = chars.find((c) => c.character === "Theron");
      expect(theron!.healingPerDie).toBe("1d10+2");

      // Brynn has CON 16 → +3 mod → 1d8+3
      const result2 = gsm.shortRest(["Brynn"]);
      const chars2 = result2.data.characters as Array<Record<string, unknown>>;
      const brynn = chars2.find((c) => c.character === "Brynn");
      expect(brynn!.healingPerDie).toBe("1d8+3");
    });

    it("includes currentHP and maxHP", () => {
      getTheron(gsm).dynamic.currentHP = 20;
      const result = gsm.shortRest(["Theron"]);
      const chars = result.data.characters as Array<Record<string, unknown>>;
      const theron = chars.find((c) => c.character === "Theron");
      expect(theron!.currentHP).toBe(20);
      expect(theron!.maxHP).toBe(44);
    });

    it("includes rest-relevant feat hints when character has the feat", () => {
      // Add Chef feat to Brynn
      getBrynn(gsm).static.features.push({
        name: "Chef",
        description: "Replenishing Meal",
        source: "feat",
        sourceLabel: "Chef",
      });
      const result = gsm.shortRest(["Brynn"]);
      const chars = result.data.characters as Array<Record<string, unknown>>;
      const brynn = chars.find((c) => c.character === "Brynn");
      const restFeatures = brynn!.restFeatures as string[];
      expect(restFeatures.length).toBeGreaterThan(0);
      expect(restFeatures[0]).toContain("Chef");
      expect(restFeatures[0]).toContain("1d8");
    });

    it("text output includes hit dice line", () => {
      getTheron(gsm).dynamic.currentHP = 20;
      const result = gsm.shortRest(["Theron"]);
      expect(result.text).toContain("Hit Dice:");
      expect(result.text).toContain("5d10");
      expect(result.text).toContain("20/44 HP");
    });
  });
});

// ---------------------------------------------------------------------------
// longRest
// ---------------------------------------------------------------------------

describe("longRest", () => {
  let gsm: GameStateManager;

  beforeEach(() => {
    ({ gsm } = createTestGSM());
    registerCharacter(gsm, "Player1", createFighterCharacter());
    registerCharacter(gsm, "Player2", createClericCharacter());
  });

  describe("restores HP to maxHP", () => {
    it("heals Theron from 20 HP back to 44 (maxHP)", () => {
      const theron = getTheron(gsm);
      theron.dynamic.currentHP = 20;

      const result = gsm.longRest(["Theron"]);

      assertToolSuccess(result);
      expect(getTheron(gsm).dynamic.currentHP).toBe(44);
    });
  });

  describe("resets all spell slots and pact magic slots", () => {
    it("resets all used spell slot levels on Brynn to 0", () => {
      const brynn = getBrynn(gsm);
      brynn.dynamic.spellSlotsUsed[0]!.used = 3;
      brynn.dynamic.spellSlotsUsed[1]!.used = 2;
      brynn.dynamic.spellSlotsUsed[2]!.used = 1;

      const result = gsm.longRest(["Brynn"]);

      assertToolSuccess(result);
      const updated = getBrynn(gsm);
      for (const slot of updated.dynamic.spellSlotsUsed) {
        expect(slot.used).toBe(0);
      }
    });

    it("resets used pact magic slots to 0", () => {
      const theron = getTheron(gsm);
      theron.dynamic.pactMagicSlots = [{ level: 3, total: 2, used: 2 }];

      const result = gsm.longRest(["Theron"]);

      assertToolSuccess(result);
      expect(getTheron(gsm).dynamic.pactMagicSlots![0]!.used).toBe(0);
    });
  });

  describe("resets all class resources regardless of resetType", () => {
    it("restores Second Wind (short reset) on Theron via long rest", () => {
      const theron = getTheron(gsm);
      theron.dynamic.resourcesUsed = { "Second Wind": 1 };

      const result = gsm.longRest(["Theron"]);

      assertToolSuccess(result);
      expect(getTheron(gsm).dynamic.resourcesUsed!["Second Wind"]).toBe(0);
    });
  });

  describe("resets death saves and clears concentration", () => {
    it("resets death saves from {2,1} to {0,0}", () => {
      const theron = getTheron(gsm);
      theron.dynamic.deathSaves = { successes: 2, failures: 1 };

      const result = gsm.longRest(["Theron"]);

      assertToolSuccess(result);
      const updated = getTheron(gsm);
      expect(updated.dynamic.deathSaves.successes).toBe(0);
      expect(updated.dynamic.deathSaves.failures).toBe(0);
    });

    it("clears concentratingOn on Brynn", () => {
      const brynn = getBrynn(gsm);
      brynn.dynamic.concentratingOn = { spellName: "Bless", since: Date.now() };

      const result = gsm.longRest(["Brynn"]);

      assertToolSuccess(result);
      expect(getBrynn(gsm).dynamic.concentratingOn).toBeUndefined();
    });
  });

  describe("decrements exhaustion level by 1", () => {
    it("reduces exhaustionLevel from 3 to 2", () => {
      const theron = getTheron(gsm);
      theron.dynamic.exhaustionLevel = 3;

      const result = gsm.longRest(["Theron"]);

      assertToolSuccess(result);
      expect(getTheron(gsm).dynamic.exhaustionLevel).toBe(2);
    });
  });

  describe("exhaustion reaching 0 removes Exhaustion condition", () => {
    it("removes the Exhaustion condition when exhaustionLevel reaches 0", () => {
      const theron = getTheron(gsm);
      theron.dynamic.exhaustionLevel = 1;
      theron.dynamic.conditions = [{ name: "Exhaustion" }];

      const result = gsm.longRest(["Theron"]);

      assertToolSuccess(result);
      const updated = getTheron(gsm);
      expect(updated.dynamic.exhaustionLevel).toBe(0);
      const hasExhaustion = updated.dynamic.conditions.some(
        (c) => c.name.toLowerCase() === "exhaustion",
      );
      expect(hasExhaustion).toBe(false);
    });
  });

  describe("only clears conditions with endsOnLongRest=true", () => {
    it("clears a condition flagged endsOnLongRest=true", () => {
      const theron = getTheron(gsm);
      theron.dynamic.conditions = [{ name: "Poisoned", endsOnLongRest: true }];

      const result = gsm.longRest(["Theron"]);

      assertToolSuccess(result);
      const hasPoison = getTheron(gsm).dynamic.conditions.some((c) => c.name === "Poisoned");
      expect(hasPoison).toBe(false);
    });

    it("does NOT clear a condition without endsOnLongRest flag", () => {
      const theron = getTheron(gsm);
      // Poisoned without the flag — should persist
      theron.dynamic.conditions = [{ name: "Poisoned" }];

      const result = gsm.longRest(["Theron"]);

      assertToolSuccess(result);
      const hasPoison = getTheron(gsm).dynamic.conditions.some((c) => c.name === "Poisoned");
      expect(hasPoison).toBe(true);
    });
  });

  describe("permanent conditions (cursed, petrified, dead) are never cleared", () => {
    it("does NOT clear the Dead condition even if endsOnLongRest is set", () => {
      const theron = getTheron(gsm);
      theron.dynamic.currentHP = 0;
      // Dead is a permanent condition — it should never be removed by long rest
      theron.dynamic.conditions = [{ name: "Dead", endsOnLongRest: true }];

      const result = gsm.longRest(["Theron"]);

      assertToolSuccess(result);
      const hasDead = getTheron(gsm).dynamic.conditions.some((c) => c.name === "Dead");
      expect(hasDead).toBe(true);
    });

    it("does NOT clear Cursed or Petrified conditions", () => {
      const theron = getTheron(gsm);
      theron.dynamic.conditions = [
        { name: "Cursed", endsOnLongRest: true },
        { name: "Petrified", endsOnLongRest: true },
      ];

      gsm.longRest(["Theron"]);

      const updated = getTheron(gsm);
      const names = updated.dynamic.conditions.map((c) => c.name);
      expect(names).toContain("Cursed");
      expect(names).toContain("Petrified");
    });
  });

  describe("no matching characters — error", () => {
    it("returns error ToolResponse when character name does not match any player", () => {
      const result = gsm.longRest(["Glarbnaz the Unknowable"]);
      assertToolError(result);
    });
  });
});

// ---------------------------------------------------------------------------
// recordDeathSave
// ---------------------------------------------------------------------------

describe("recordDeathSave", () => {
  let gsm: GameStateManager;

  beforeEach(() => {
    ({ gsm } = createTestGSM());
    registerCharacter(gsm, "Player1", createFighterCharacter());
    registerCharacter(gsm, "Player2", createClericCharacter());
  });

  describe("returns error when character is not at 0 HP", () => {
    it("returns error ToolResponse when Theron has 44 HP (full)", () => {
      // Theron starts at full HP
      const result = gsm.recordDeathSave("Theron", true);
      assertToolError(result);
    });
  });

  describe("normal success increments successes by 1", () => {
    it("increments deathSaves.successes from 0 to 1", () => {
      getTheron(gsm).dynamic.currentHP = 0;

      const result = gsm.recordDeathSave("Theron", true);

      assertToolSuccess(result);
      expect(getTheron(gsm).dynamic.deathSaves.successes).toBe(1);
      expect(result.data).toMatchObject({ successes: 1, status: "saving" });
    });
  });

  describe("normal failure increments failures by 1", () => {
    it("increments deathSaves.failures from 0 to 1", () => {
      getTheron(gsm).dynamic.currentHP = 0;

      const result = gsm.recordDeathSave("Theron", false);

      assertToolSuccess(result);
      expect(getTheron(gsm).dynamic.deathSaves.failures).toBe(1);
      expect(result.data).toMatchObject({ failures: 1, status: "saving" });
    });
  });

  describe("3 successes adds Stabilized condition", () => {
    it("adds Stabilized condition and returns status=stable at 3 successes", () => {
      const theron = getTheron(gsm);
      theron.dynamic.currentHP = 0;
      theron.dynamic.deathSaves = { successes: 2, failures: 0 };

      const result = gsm.recordDeathSave("Theron", true);

      assertToolSuccess(result);
      expect(result.data).toMatchObject({ successes: 3, status: "stable" });
      const hasStabilized = getTheron(gsm).dynamic.conditions.some((c) => c.name === "Stabilized");
      expect(hasStabilized).toBe(true);
    });
  });

  describe("3 failures adds Dead condition", () => {
    it("adds Dead condition and returns status=dead at 3 failures", () => {
      const theron = getTheron(gsm);
      theron.dynamic.currentHP = 0;
      theron.dynamic.deathSaves = { successes: 0, failures: 2 };

      const result = gsm.recordDeathSave("Theron", false);

      assertToolSuccess(result);
      expect(result.data).toMatchObject({ failures: 3, status: "dead" });
      const hasDead = getTheron(gsm).dynamic.conditions.some((c) => c.name === "Dead");
      expect(hasDead).toBe(true);
    });
  });

  describe("criticalSuccess (nat 20) revives with 1 HP", () => {
    it("sets HP to 1, resets death saves, removes Unconscious, returns status=revived", () => {
      const theron = getTheron(gsm);
      theron.dynamic.currentHP = 0;
      theron.dynamic.deathSaves = { successes: 1, failures: 1 };
      theron.dynamic.conditions = [{ name: "Unconscious" }, { name: "Stabilized" }];

      const result = gsm.recordDeathSave("Theron", true, { criticalSuccess: true });

      assertToolSuccess(result);
      const updated = getTheron(gsm);
      expect(updated.dynamic.currentHP).toBe(1);
      expect(updated.dynamic.deathSaves.successes).toBe(0);
      expect(updated.dynamic.deathSaves.failures).toBe(0);
      const hasUnconscious = updated.dynamic.conditions.some((c) => c.name === "Unconscious");
      const hasStabilized = updated.dynamic.conditions.some((c) => c.name === "Stabilized");
      expect(hasUnconscious).toBe(false);
      expect(hasStabilized).toBe(false);
      expect(result.data).toMatchObject({ status: "revived", currentHP: 1 });
    });
  });

  describe("criticalFail (nat 1) adds 2 failures", () => {
    it("adds 2 failures instead of 1 (capped at 3)", () => {
      const theron = getTheron(gsm);
      theron.dynamic.currentHP = 0;
      theron.dynamic.deathSaves = { successes: 0, failures: 0 };

      const result = gsm.recordDeathSave("Theron", false, { criticalFail: true });

      assertToolSuccess(result);
      expect(getTheron(gsm).dynamic.deathSaves.failures).toBe(2);
      expect(result.data).toMatchObject({ criticalFail: true, failures: 2 });
    });

    it("caps failures at 3 even when starting at 2", () => {
      const theron = getTheron(gsm);
      theron.dynamic.currentHP = 0;
      theron.dynamic.deathSaves = { successes: 0, failures: 2 };

      const result = gsm.recordDeathSave("Theron", false, { criticalFail: true });

      assertToolSuccess(result);
      expect(getTheron(gsm).dynamic.deathSaves.failures).toBe(3);
      expect(result.data).toMatchObject({ failures: 3, status: "dead" });
    });
  });
});

// ---------------------------------------------------------------------------
// shortRest — Warlock pact slot recovery (Zara, Player3)
// ---------------------------------------------------------------------------

/**
 * Short rest restores pact magic slots for Warlocks.
 * Zara has 2 L3 pact slots and no class resources (warlock: []).
 * CON 14 → +2 → healingPerDie "1d8+2".
 */
describe("shortRest — pact slot recovery (Zara, Warlock 5)", () => {
  let gsm: GameStateManager;

  beforeEach(() => {
    ({ gsm } = createTestGSM());
    registerCharacter(gsm, "Player3", createWarlockCharacter());
  });

  it("fully restores pact slots (used=0) after both are expended", () => {
    const char = gsm.characters["Player3"];
    // Manually exhaust both pact slots
    const pactSlot = char.dynamic.pactMagicSlots?.find((s) => s.level === 3);
    expect(pactSlot).toBeDefined();
    pactSlot!.used = 2;

    const result = gsm.shortRest(["Zara"]);
    assertToolSuccess(result);

    expect(pactSlot!.used).toBe(0);
  });

  it("short rest hint includes hitDice '5d8'", () => {
    const result = gsm.shortRest(["Zara"]);
    assertToolSuccess(result);

    const chars = result.data.characters as Array<Record<string, unknown>>;
    const zara = chars.find((c) => c.character === "Zara");
    expect(zara).toBeDefined();
    expect(zara!.hitDice).toBe("5d8");
  });

  it("short rest hint includes healingPerDie '1d8+2' (CON 14 → +2)", () => {
    const result = gsm.shortRest(["Zara"]);
    assertToolSuccess(result);

    const chars = result.data.characters as Array<Record<string, unknown>>;
    const zara = chars.find((c) => c.character === "Zara");
    expect(zara!.healingPerDie).toBe("1d8+2");
  });
});

// ---------------------------------------------------------------------------
// shortRest — Barbarian Rage does NOT restore (Gruk, Player4)
// ---------------------------------------------------------------------------

/**
 * Gruk's Rage has resetType="long" — it must NOT be restored on a short rest.
 * Barbarian uses d12, so hitDice is "5d12" and healingPerDie is "1d12+3" (CON 16 → +3).
 */
describe("shortRest — Barbarian Rage NOT restored (Gruk, Barbarian 5)", () => {
  let gsm: GameStateManager;

  beforeEach(() => {
    ({ gsm } = createTestGSM());
    registerCharacter(gsm, "Player4", createBarbarianCharacter());
  });

  it("Rage (resetType=long) is still used after a short rest", () => {
    const char = gsm.characters["Player4"];
    char.dynamic.resourcesUsed = { Rage: 1 };

    const result = gsm.shortRest(["Gruk"]);
    assertToolSuccess(result);

    expect(char.dynamic.resourcesUsed!["Rage"]).toBe(1);
  });

  it("short rest hint includes hitDice '5d12'", () => {
    const result = gsm.shortRest(["Gruk"]);
    assertToolSuccess(result);

    const chars = result.data.characters as Array<Record<string, unknown>>;
    const gruk = chars.find((c) => c.character === "Gruk");
    expect(gruk).toBeDefined();
    expect(gruk!.hitDice).toBe("5d12");
  });

  it("short rest hint includes healingPerDie '1d12+3' (CON 16 → +3)", () => {
    const result = gsm.shortRest(["Gruk"]);
    assertToolSuccess(result);

    const chars = result.data.characters as Array<Record<string, unknown>>;
    const gruk = chars.find((c) => c.character === "Gruk");
    expect(gruk!.healingPerDie).toBe("1d12+3");
  });
});

// ---------------------------------------------------------------------------
// longRest — Barbarian Rage fully restores (Gruk, Player4)
// ---------------------------------------------------------------------------

/**
 * Long rest restores all class resources regardless of resetType.
 * Gruk has maxHP=55 and 3 Rages (long rest). All must be back to 0 used.
 */
describe("longRest — Barbarian Rage restored (Gruk, Barbarian 5)", () => {
  let gsm: GameStateManager;

  beforeEach(() => {
    ({ gsm } = createTestGSM());
    registerCharacter(gsm, "Player4", createBarbarianCharacter());
  });

  it("restores Rage (long-rest resource) to 0 used after all 3 are spent", () => {
    const char = gsm.characters["Player4"];
    char.dynamic.resourcesUsed = { Rage: 3 };

    const result = gsm.longRest(["Gruk"]);
    assertToolSuccess(result);

    expect(char.dynamic.resourcesUsed!["Rage"]).toBe(0);
  });

  it("restores HP fully to 55 (maxHP)", () => {
    const char = gsm.characters["Player4"];
    char.dynamic.currentHP = 20;

    const result = gsm.longRest(["Gruk"]);
    assertToolSuccess(result);

    expect(char.dynamic.currentHP).toBe(55);
  });
});

// ---------------------------------------------------------------------------
// shortRest — multiclass hit dice hint (Selene, Cleric 3 / Warlock 2, Player5)
// ---------------------------------------------------------------------------

/**
 * Selene's classes are both d8 hit dice, so hitDice = "3d8 + 2d8".
 * CON 14 → +2, healingPerDie = "1d8+2" (first class is Cleric, d8).
 * Channel Divinity has resetType="short" and must be restored.
 */
describe("shortRest — multiclass hit dice hint (Selene, Cleric 3 / Warlock 2)", () => {
  let gsm: GameStateManager;

  beforeEach(() => {
    ({ gsm } = createTestGSM());
    registerCharacter(gsm, "Player5", createMulticlassCharacter());
  });

  it("short rest hint includes hitDice '3d8 + 2d8' for Cleric 3 / Warlock 2", () => {
    const result = gsm.shortRest(["Selene"]);
    assertToolSuccess(result);

    const chars = result.data.characters as Array<Record<string, unknown>>;
    const selene = chars.find((c) => c.character === "Selene");
    expect(selene).toBeDefined();
    expect(selene!.hitDice).toBe("3d8 + 2d8");
  });

  it("short rest hint includes healingPerDie '1d8+2' (Cleric first, CON 14 → +2)", () => {
    const result = gsm.shortRest(["Selene"]);
    assertToolSuccess(result);

    const chars = result.data.characters as Array<Record<string, unknown>>;
    const selene = chars.find((c) => c.character === "Selene");
    expect(selene!.healingPerDie).toBe("1d8+2");
  });

  it("Channel Divinity (resetType=short) is restored to 0 used after short rest", () => {
    const char = gsm.characters["Player5"];
    char.dynamic.resourcesUsed = { "Channel Divinity": 1 };

    const result = gsm.shortRest(["Selene"]);
    assertToolSuccess(result);

    expect(char.dynamic.resourcesUsed!["Channel Divinity"]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// longRest — multiclass full recovery (Selene, Cleric 3 / Warlock 2, Player5)
// ---------------------------------------------------------------------------

/**
 * Long rest restores all regular slots, pact slots, and class resources.
 * Selene has: 4 L1 regular + 2 L1 pact, 2 L2 regular, Channel Divinity ×1.
 */
describe("longRest — multiclass full recovery (Selene, Cleric 3 / Warlock 2)", () => {
  let gsm: GameStateManager;

  beforeEach(() => {
    ({ gsm } = createTestGSM());
    registerCharacter(gsm, "Player5", createMulticlassCharacter());
  });

  it("resets all regular spell slots to 0 used", () => {
    const char = gsm.characters["Player5"];
    // Exhaust L1 and L2 regular slots
    for (const slot of char.dynamic.spellSlotsUsed) {
      slot.used = slot.total;
    }

    const result = gsm.longRest(["Selene"]);
    assertToolSuccess(result);

    for (const slot of char.dynamic.spellSlotsUsed) {
      expect(slot.used).toBe(0);
    }
  });

  it("resets pact magic L1 slots to 0 used", () => {
    const char = gsm.characters["Player5"];
    const pactL1 = char.dynamic.pactMagicSlots?.find((s) => s.level === 1);
    expect(pactL1).toBeDefined();
    pactL1!.used = 2;

    const result = gsm.longRest(["Selene"]);
    assertToolSuccess(result);

    expect(pactL1!.used).toBe(0);
  });

  it("restores Channel Divinity (short rest resource) to 0 used via long rest", () => {
    const char = gsm.characters["Player5"];
    char.dynamic.resourcesUsed = { "Channel Divinity": 1 };

    const result = gsm.longRest(["Selene"]);
    assertToolSuccess(result);

    expect(char.dynamic.resourcesUsed!["Channel Divinity"]).toBe(0);
  });

  it("restores HP to maxHP 38", () => {
    const char = gsm.characters["Player5"];
    char.dynamic.currentHP = 15;

    const result = gsm.longRest(["Selene"]);
    assertToolSuccess(result);

    expect(char.dynamic.currentHP).toBe(38);
  });
});
