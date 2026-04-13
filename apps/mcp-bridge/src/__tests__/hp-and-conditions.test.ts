import { describe, it, expect, beforeEach } from "vitest";
import {
  createTestGSM,
  createFighterCharacter,
  registerCharacter,
  assertToolSuccess,
  assertToolError,
  type TestGSM,
} from "./setup.js";
import { createBarbarianCharacter } from "./fixtures.js";
import { getAC, getHP, getClassResources } from "@unseen-servant/shared/character";

/**
 * Behavioral contracts for HP and condition methods on GameStateManager.
 *
 * ## applyDamage(targetName, amount, damageType?, isCriticalHit?)
 * - Clamps incoming damage to Math.max(0, amount) before applying.
 * - For NPC combatants (type !== "player"): reduces combatant.currentHP floored at 0.
 *   Absorbs combatant.tempHP first: min(tempHP, remaining) subtracted from tempHP,
 *   remainder subtracted from currentHP.
 * - For player characters: follows the same tempHP absorption order.
 * - Special path — character already at 0 HP: instead of reducing HP, adds death save
 *   failures. isCriticalHit=true adds 2 failures; otherwise adds 1. At 3 failures the
 *   "Dead" condition is pushed and data.status="dead" is returned. Does NOT reduce HP
 *   further. Returns early without normal damage path.
 * - Massive damage (overshoot after reducing to 0 >= char.static.maxHP): sets HP=0,
 *   pushes "Dead" condition, returns with massiveDamage=true in data. Does NOT add
 *   Unconscious condition automatically.
 * - If the target is concentrating on a spell, includes concentrationDC =
 *   Math.max(10, Math.floor(amount / 2)) in the response data.
 * - Broadcasts server:character_updated (players) or server:combat_update (NPCs).
 * - Creates a "damage" GameEvent in the event log.
 * - Returns ToolResponse { text, data } — NOT error for normal damage.
 * - Returns error ToolResponse when targetName is not found.
 *
 * ## heal(targetName, amount)
 * - Clamps healing to Math.max(0, amount).
 * - For NPC combatants: caps at combatant.maxHP.
 * - For player characters: caps at char.static.maxHP.
 * - When a player character's HP was at 0 (or had non-zero death saves) and is now above 0:
 *   resets deathSaves to { successes: 0, failures: 0 }. Does NOT remove Unconscious
 *   automatically.
 * - Does NOT block healing Dead characters — no guard exists in the implementation.
 * - Broadcasts server:character_updated (players) or server:combat_update (NPCs).
 * - Creates a "healing" GameEvent.
 * - Returns error ToolResponse when targetName is not found.
 *
 * ## setHP(targetName, value)
 * - Clamps value to Math.max(0, Math.min(char.static.maxHP, value)).
 * - Resets death saves when char.dynamic.currentHP becomes > 0 (same as heal).
 * - Does NOT add or remove Unconscious condition automatically.
 * - Creates an "hp_set" GameEvent.
 * - Broadcasts server:character_updated (players) or server:combat_update (NPCs).
 *
 * ## setTempHP(targetName, amount)
 * - Non-stacking: result is Math.max(current, Math.max(0, amount)).
 * - Never goes negative (amount clamped to 0 minimum).
 * - If new amount is lower than current, current value is unchanged.
 * - Creates a "temp_hp_set" GameEvent.
 * - Broadcasts server:character_updated (players) or server:combat_update (NPCs).
 *
 * ## addCondition(targetName, condition, duration?)
 * - Deduplication by name: if the condition name is already present, the push is skipped.
 * - startRound is set to combat.round if combat is active; undefined otherwise.
 * - duration is stored as-is on the ConditionEntry (no runtime enforcement — duration
 *   ticking happens in advanceTurn, not here).
 * - Creates a "condition_added" GameEvent.
 * - Broadcasts server:character_updated (players) or server:combat_update (NPCs).
 * - Returns error ToolResponse when targetName is not found.
 *
 * ## removeCondition(targetName, condition)
 * - Filters by name — all entries matching the condition name are removed (filter, not splice).
 * - Does NOT return an error if the condition is not present; it simply filters and
 *   broadcasts the unchanged list.
 * - Creates a "condition_removed" GameEvent even if condition was absent.
 * - Returns error ToolResponse when targetName is not found.
 *
 * ## setExhaustion(characterName, level)
 * - Clamps level to Math.max(0, Math.min(10, Math.round(level))).
 * - level=0: sets exhaustionLevel=undefined; removes "Exhaustion" condition entry.
 * - level 1–9: sets exhaustionLevel=level; adds "Exhaustion" condition if absent.
 * - level >= 10: additionally pushes "Dead" condition if absent.
 * - Creates a "condition_added" GameEvent.
 * - Broadcasts server:character_updated.
 * - Returns ToolResponse with penalty string "-{level*2} to all d20 rolls...".
 */

let t: TestGSM;
let gsm: TestGSM["gsm"];

beforeEach(() => {
  t = createTestGSM();
  gsm = t.gsm;
  registerCharacter(gsm, "Player1", createFighterCharacter());
});

// ---------------------------------------------------------------------------
// Helper: get Theron's dynamic data directly
// ---------------------------------------------------------------------------

function theron() {
  return gsm.characters["Player1"].dynamic;
}

// ---------------------------------------------------------------------------
// Helper: inject a minimal active combat with one NPC for NPC-path tests
// ---------------------------------------------------------------------------

function setupNpcCombat(name: string, maxHP: number, currentHP?: number) {
  const id = "npc-test-id";
  gsm.gameState.encounter = {
    id: "enc-1",
    phase: "combat",
    combat: {
      phase: "active",
      round: 1,
      turnIndex: 0,
      turnOrder: [id],
      combatants: {
        [id]: {
          id,
          name,
          type: "enemy",
          initiative: 10,
          initiativeModifier: 0,
          dexScore: 10,
          speed: { walk: 30 },
          movementUsed: 0,
          size: "medium",
          maxHP,
          currentHP: currentHP ?? maxHP,
          tempHP: 0,
          conditions: [],
        },
      },
    },
  };
  return id;
}

// ---------------------------------------------------------------------------
// applyDamage
// ---------------------------------------------------------------------------

describe("applyDamage", () => {
  describe("tempHP absorption", () => {
    it("basic damage with no tempHP reduces currentHP directly", () => {
      const result = gsm.applyDamage("Theron", 10);
      assertToolSuccess(result);
      expect(theron().currentHP).toBe(34); // 44 - 10
    });

    it("tempHP absorbs damage before HP is reduced", () => {
      gsm.setTempHP("Theron", 5);
      const result = gsm.applyDamage("Theron", 8);
      assertToolSuccess(result);
      // 5 tempHP absorbs 5, remaining 3 hits HP: 44 - 3 = 41
      expect(theron().tempHP).toBe(0);
      expect(theron().currentHP).toBe(41);
      expect(result.data?.tempHpAbsorbed).toBe(5);
    });

    it("tempHP absorbs all damage when damage <= tempHP", () => {
      gsm.setTempHP("Theron", 10);
      gsm.applyDamage("Theron", 6);
      expect(theron().tempHP).toBe(4);
      expect(theron().currentHP).toBe(44); // HP untouched
    });

    it("HP floors at 0 — never goes negative", () => {
      const result = gsm.applyDamage("Theron", 100);
      assertToolSuccess(result);
      expect(theron().currentHP).toBe(0);
    });
  });

  describe("player at 0 HP — death save failures path", () => {
    it("damage at 0 HP adds 1 death save failure", () => {
      gsm.setHP("Theron", 0);
      expect(theron().currentHP).toBe(0);

      const result = gsm.applyDamage("Theron", 5);
      assertToolSuccess(result);
      expect(theron().deathSaves.failures).toBe(1);
      expect(theron().currentHP).toBe(0); // HP stays at 0
      expect(result.data?.failuresAdded).toBe(1);
      expect(result.data?.status).toBe("saving");
    });

    it("critical hit at 0 HP adds 2 death save failures", () => {
      gsm.setHP("Theron", 0);

      const result = gsm.applyDamage("Theron", 5, undefined, true);
      assertToolSuccess(result);
      expect(theron().deathSaves.failures).toBe(2);
      expect(result.data?.failuresAdded).toBe(2);
    });

    it("reaching 3 failures at 0 HP adds Dead condition and returns status=dead", () => {
      gsm.setHP("Theron", 0);
      // Manually set failures to 2 so next hit kills
      theron().deathSaves.failures = 2;

      const result = gsm.applyDamage("Theron", 5);
      assertToolSuccess(result);
      expect(theron().deathSaves.failures).toBe(3);
      expect(theron().conditions.some((c) => c.name === "Dead")).toBe(true);
      expect(result.data?.status).toBe("dead");
    });

    it("failures are clamped at 3 — cannot exceed 3", () => {
      gsm.setHP("Theron", 0);
      theron().deathSaves.failures = 3;
      theron().conditions.push({ name: "Dead" });

      gsm.applyDamage("Theron", 5);
      expect(theron().deathSaves.failures).toBe(3);
    });
  });

  describe("massive damage — instant death", () => {
    it("overshoot >= maxHP causes instant death with massiveDamage=true in data", () => {
      // Theron has 44 HP. Deal 100 damage: overshoot = 100 - 44 = 56 >= maxHP 44 → massive damage
      const result = gsm.applyDamage("Theron", 100);
      assertToolSuccess(result);
      expect(theron().currentHP).toBe(0);
      expect(theron().conditions.some((c) => c.name === "Dead")).toBe(true);
      expect(result.data?.massiveDamage).toBe(true);
      expect(result.data?.status).toBe("dead");
    });

    it("overshoot exactly equals maxHP triggers massive damage", () => {
      // Deal maxHP + currentHP = 44 + 44 = 88 damage
      // overshoot = 88 - 44 = 44 == maxHP → massive damage
      const result = gsm.applyDamage("Theron", 88);
      assertToolSuccess(result);
      expect(result.data?.massiveDamage).toBe(true);
    });

    it("overshoot just below maxHP does NOT trigger massive damage", () => {
      // currentHP=44, maxHP=44. Deal 87 damage: remaining after tempHP=87,
      // overshoot = 87 - 44 = 43 < 44 (maxHP) → normal damage path, HP goes to 0
      const result = gsm.applyDamage("Theron", 87);
      assertToolSuccess(result);
      expect(result.data?.massiveDamage).toBeUndefined();
      expect(theron().currentHP).toBe(0);
      // Dead condition NOT added in normal path
      expect(theron().conditions.some((c) => c.name === "Dead")).toBe(false);
    });
  });

  describe("concentration DC included in response", () => {
    it("includes concentrationDC when target is concentrating", () => {
      gsm.setConcentration("Theron", "Shield");
      const result = gsm.applyDamage("Theron", 20);
      assertToolSuccess(result);
      // DC = max(10, floor(20/2)) = max(10, 10) = 10
      expect(result.data?.concentrationDC).toBe(10);
      expect(result.data?.concentrating).toBe("Shield");
    });

    it("concentrationDC is at least 10 even for small damage amounts", () => {
      gsm.setConcentration("Theron", "Bless");
      const result = gsm.applyDamage("Theron", 4);
      assertToolSuccess(result);
      // floor(4/2) = 2, max(10, 2) = 10
      expect(result.data?.concentrationDC).toBe(10);
    });

    it("concentrationDC scales above 10 for large damage amounts", () => {
      gsm.setConcentration("Theron", "Bless");
      const result = gsm.applyDamage("Theron", 30);
      assertToolSuccess(result);
      // floor(30/2) = 15, max(10, 15) = 15
      expect(result.data?.concentrationDC).toBe(15);
    });

    it("no concentrationDC field when target is not concentrating", () => {
      const result = gsm.applyDamage("Theron", 10);
      assertToolSuccess(result);
      expect(result.data?.concentrationDC).toBeUndefined();
    });
  });

  describe("NPC combatant target", () => {
    it("deals damage to an NPC combatant and reduces its HP", () => {
      setupNpcCombat("Goblin", 15, 15);
      const result = gsm.applyDamage("Goblin", 6);
      assertToolSuccess(result);
      const goblin = Object.values(gsm.gameState.encounter!.combat!.combatants)[0];
      expect(goblin.currentHP).toBe(9);
    });

    it("NPC tempHP absorbs damage before HP", () => {
      setupNpcCombat("Goblin", 15, 15);
      const goblin = Object.values(gsm.gameState.encounter!.combat!.combatants)[0];
      goblin.tempHP = 5;
      gsm.applyDamage("Goblin", 8);
      expect(goblin.tempHP).toBe(0);
      expect(goblin.currentHP).toBe(12); // 15 - 3
    });

    it("NPC HP floors at 0", () => {
      setupNpcCombat("Goblin", 15, 15);
      gsm.applyDamage("Goblin", 99);
      const goblin = Object.values(gsm.gameState.encounter!.combat!.combatants)[0];
      expect(goblin.currentHP).toBe(0);
    });

    it("broadcasts combat_update for NPC damage", () => {
      setupNpcCombat("Goblin", 15, 15);
      const prevBroadcastCount = t.broadcasts.length;
      gsm.applyDamage("Goblin", 5);
      const newBroadcasts = t.broadcasts.slice(prevBroadcastCount);
      expect(newBroadcasts.some((b) => b.type === "server:combat_update")).toBe(true);
    });
  });

  describe("target not found", () => {
    it("returns error when target name does not match any character or combatant", () => {
      const result = gsm.applyDamage("Nobody", 10);
      assertToolError(result);
    });
  });
});

// ---------------------------------------------------------------------------
// heal
// ---------------------------------------------------------------------------

describe("heal", () => {
  describe("HP cap at maxHP", () => {
    it("basic heal increases HP", () => {
      gsm.applyDamage("Theron", 14);
      expect(theron().currentHP).toBe(30);
      const result = gsm.heal("Theron", 10);
      assertToolSuccess(result);
      expect(theron().currentHP).toBe(40);
    });

    it("heal does not exceed maxHP", () => {
      // Theron starts at 44 HP (full), heal 100 → stays at 44
      const result = gsm.heal("Theron", 100);
      assertToolSuccess(result);
      expect(theron().currentHP).toBe(44);
      expect(result.data?.currentHP).toBe(44);
    });

    it("overheal amount is reported in data", () => {
      gsm.applyDamage("Theron", 10); // HP = 34
      const result = gsm.heal("Theron", 20); // would be 54, capped at 44, overheal = 10
      assertToolSuccess(result);
      expect(result.data?.overheal).toBe(10);
    });
  });

  describe("death save reset when healing from 0", () => {
    it("healing from 0 HP resets death saves to 0/0", () => {
      gsm.setHP("Theron", 0);
      theron().deathSaves = { successes: 1, failures: 2 };

      const result = gsm.heal("Theron", 5);
      assertToolSuccess(result);
      expect(theron().currentHP).toBe(5);
      expect(theron().deathSaves).toEqual({ successes: 0, failures: 0 });
    });

    it("death saves are not reset when HP was already above 0", () => {
      // Theron starts at 44 HP — deal some damage so death saves check is distinct
      gsm.applyDamage("Theron", 10); // HP = 34, deathSaves = 0/0
      theron().deathSaves = { successes: 0, failures: 0 };
      gsm.heal("Theron", 4);
      expect(theron().deathSaves).toEqual({ successes: 0, failures: 0 });
    });

    it("healing resets saves when deathSaves has non-zero values even with HP > 0 after heal", () => {
      // The implementation resets when currentHP > 0 AND deathSaves are non-zero
      gsm.setHP("Theron", 0);
      theron().deathSaves = { successes: 2, failures: 1 };
      gsm.heal("Theron", 1);
      expect(theron().deathSaves).toEqual({ successes: 0, failures: 0 });
    });
  });

  describe("NPC combatant target", () => {
    it("heals an NPC combatant capped at maxHP", () => {
      setupNpcCombat("Troll", 40, 10);
      const result = gsm.heal("Troll", 15);
      assertToolSuccess(result);
      const troll = Object.values(gsm.gameState.encounter!.combat!.combatants)[0];
      expect(troll.currentHP).toBe(25);
    });

    it("NPC heal does not exceed maxHP", () => {
      setupNpcCombat("Troll", 40, 35);
      gsm.heal("Troll", 100);
      const troll = Object.values(gsm.gameState.encounter!.combat!.combatants)[0];
      expect(troll.currentHP).toBe(40);
    });
  });

  describe("target not found", () => {
    it("returns error for unknown target", () => {
      const result = gsm.heal("Nobody", 10);
      assertToolError(result);
    });
  });
});

// ---------------------------------------------------------------------------
// setHP
// ---------------------------------------------------------------------------

describe("setHP", () => {
  describe("value clamped 0..maxHP", () => {
    it("sets HP to an exact value within range", () => {
      const result = gsm.setHP("Theron", 20);
      assertToolSuccess(result);
      expect(theron().currentHP).toBe(20);
      expect(result.data?.newHP).toBe(20);
    });

    it("clamps to maxHP when value exceeds maxHP", () => {
      const result = gsm.setHP("Theron", 100);
      assertToolSuccess(result);
      expect(theron().currentHP).toBe(44);
    });

    it("clamps to 0 when value is negative", () => {
      const result = gsm.setHP("Theron", -5);
      assertToolSuccess(result);
      expect(theron().currentHP).toBe(0);
    });

    it("reports previousHP in data", () => {
      const result = gsm.setHP("Theron", 20);
      assertToolSuccess(result);
      expect(result.data?.previousHP).toBe(44);
    });
  });

  describe("death save reset when value > 0", () => {
    it("resets death saves when setting HP from 0 to positive", () => {
      gsm.setHP("Theron", 0);
      theron().deathSaves = { successes: 1, failures: 2 };

      gsm.setHP("Theron", 10);
      expect(theron().deathSaves).toEqual({ successes: 0, failures: 0 });
    });

    it("does not reset death saves when setting HP to 0", () => {
      theron().deathSaves = { successes: 1, failures: 0 };
      gsm.setHP("Theron", 0);
      // HP is 0, so death saves are NOT reset
      expect(theron().deathSaves).toEqual({ successes: 1, failures: 0 });
    });
  });

  describe("NPC combatant target", () => {
    it("sets NPC HP exactly", () => {
      setupNpcCombat("Orc", 30, 30);
      const result = gsm.setHP("Orc", 15);
      assertToolSuccess(result);
      const orc = Object.values(gsm.gameState.encounter!.combat!.combatants)[0];
      expect(orc.currentHP).toBe(15);
    });

    it("clamps NPC HP at maxHP", () => {
      setupNpcCombat("Orc", 30, 10);
      gsm.setHP("Orc", 99);
      const orc = Object.values(gsm.gameState.encounter!.combat!.combatants)[0];
      expect(orc.currentHP).toBe(30);
    });

    it("clamps NPC HP at 0", () => {
      setupNpcCombat("Orc", 30, 20);
      gsm.setHP("Orc", -1);
      const orc = Object.values(gsm.gameState.encounter!.combat!.combatants)[0];
      expect(orc.currentHP).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// setTempHP
// ---------------------------------------------------------------------------

describe("setTempHP", () => {
  describe("non-stacking — takes the higher value", () => {
    it("sets tempHP when no tempHP exists", () => {
      const result = gsm.setTempHP("Theron", 10);
      assertToolSuccess(result);
      expect(theron().tempHP).toBe(10);
      expect(result.data?.tempHP).toBe(10);
    });

    it("lower new value does not replace higher existing tempHP", () => {
      gsm.setTempHP("Theron", 10);
      gsm.setTempHP("Theron", 5);
      expect(theron().tempHP).toBe(10); // stays at higher value
    });

    it("higher new value replaces lower existing tempHP", () => {
      gsm.setTempHP("Theron", 5);
      gsm.setTempHP("Theron", 10);
      expect(theron().tempHP).toBe(10);
    });

    it("equal value leaves tempHP unchanged", () => {
      gsm.setTempHP("Theron", 8);
      gsm.setTempHP("Theron", 8);
      expect(theron().tempHP).toBe(8);
    });
  });

  describe("never goes negative", () => {
    it("negative amount is clamped to 0 — tempHP cannot be set negative", () => {
      gsm.setTempHP("Theron", 5);
      // Try to set negative — clamped to 0, then max(5, 0) = 5
      gsm.setTempHP("Theron", -10);
      expect(theron().tempHP).toBe(5);
    });

    it("setting tempHP=0 from 0 keeps it at 0", () => {
      gsm.setTempHP("Theron", 0);
      expect(theron().tempHP).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// addCondition
// ---------------------------------------------------------------------------

describe("addCondition", () => {
  describe("deduplication by name", () => {
    it("adds a condition to a character with no existing conditions", () => {
      const result = gsm.addCondition("Theron", "Poisoned");
      assertToolSuccess(result);
      expect(theron().conditions).toHaveLength(1);
      expect(theron().conditions[0].name).toBe("Poisoned");
    });

    it("adding the same condition twice results in only one entry", () => {
      gsm.addCondition("Theron", "Poisoned");
      gsm.addCondition("Theron", "Poisoned");
      expect(theron().conditions.filter((c) => c.name === "Poisoned")).toHaveLength(1);
    });

    it("multiple distinct conditions are all stored", () => {
      gsm.addCondition("Theron", "Poisoned");
      gsm.addCondition("Theron", "Blinded");
      expect(theron().conditions).toHaveLength(2);
    });
  });

  describe("startRound recorded when combat is active", () => {
    it("startRound is undefined when combat is not active", () => {
      gsm.addCondition("Theron", "Stunned");
      const condition = theron().conditions.find((c) => c.name === "Stunned");
      expect(condition?.startRound).toBeUndefined();
    });

    it("startRound is set to combat.round when combat is active", () => {
      // Inject a combat state with round=2
      setupNpcCombat("Dummy", 10); // sets encounter with round=1
      gsm.gameState.encounter!.combat!.round = 2;

      gsm.addCondition("Theron", "Stunned");
      const condition = theron().conditions.find((c) => c.name === "Stunned");
      expect(condition?.startRound).toBe(2);
    });
  });

  describe("duration stored without enforcement at add time", () => {
    it("duration is stored on the condition entry when provided", () => {
      const result = gsm.addCondition("Theron", "Stunned", 3);
      assertToolSuccess(result);
      const condition = theron().conditions.find((c) => c.name === "Stunned");
      expect(condition?.duration).toBe(3);
    });

    it("duration is undefined when not provided", () => {
      gsm.addCondition("Theron", "Poisoned");
      const condition = theron().conditions.find((c) => c.name === "Poisoned");
      expect(condition?.duration).toBeUndefined();
    });
  });

  describe("target not found", () => {
    it("returns error for unknown target", () => {
      const result = gsm.addCondition("Nobody", "Poisoned");
      assertToolError(result);
    });
  });
});

// ---------------------------------------------------------------------------
// removeCondition
// ---------------------------------------------------------------------------

describe("removeCondition", () => {
  describe("removes matching condition by name", () => {
    it("removes a condition that exists on the character", () => {
      gsm.addCondition("Theron", "Poisoned");
      expect(theron().conditions).toHaveLength(1);

      const result = gsm.removeCondition("Theron", "Poisoned");
      assertToolSuccess(result);
      expect(theron().conditions).toHaveLength(0);
      expect(result.data?.removed).toBe("Poisoned");
    });

    it("only the specified condition is removed — others remain", () => {
      gsm.addCondition("Theron", "Poisoned");
      gsm.addCondition("Theron", "Blinded");

      gsm.removeCondition("Theron", "Poisoned");
      expect(theron().conditions).toHaveLength(1);
      expect(theron().conditions[0].name).toBe("Blinded");
    });
  });

  describe("no error when condition is not present", () => {
    it("returns success even when the condition was not present", () => {
      // Theron has no conditions at start
      const result = gsm.removeCondition("Theron", "Stunned");
      // The JSDoc says it does NOT error — it simply filters and broadcasts
      assertToolSuccess(result);
      expect(theron().conditions).toHaveLength(0);
    });
  });

  describe("target not found", () => {
    it("returns error for unknown target", () => {
      const result = gsm.removeCondition("Nobody", "Poisoned");
      assertToolError(result);
    });
  });
});

// ---------------------------------------------------------------------------
// setExhaustion
// ---------------------------------------------------------------------------

describe("setExhaustion", () => {
  describe("level clamped to 0–10", () => {
    it("level is clamped at 10 for values above 10", () => {
      const result = gsm.setExhaustion("Theron", 15);
      assertToolSuccess(result);
      expect(gsm.characters["Player1"].dynamic.exhaustionLevel).toBe(10);
      expect(result.data?.exhaustionLevel).toBe(10);
    });

    it("level is clamped at 0 for negative values", () => {
      const result = gsm.setExhaustion("Theron", -3);
      assertToolSuccess(result);
      expect(gsm.characters["Player1"].dynamic.exhaustionLevel).toBeUndefined();
    });

    it("fractional level is rounded before clamping", () => {
      // Math.round(2.6) = 3
      const result = gsm.setExhaustion("Theron", 2.6);
      assertToolSuccess(result);
      expect(result.data?.exhaustionLevel).toBe(3);
    });
  });

  describe("level 0 clears exhaustion condition and sets level to undefined", () => {
    it("setting level to 0 clears exhaustionLevel and removes Exhaustion condition", () => {
      gsm.setExhaustion("Theron", 3);
      expect(theron().exhaustionLevel).toBe(3);
      expect(theron().conditions.some((c) => c.name === "Exhaustion")).toBe(true);

      const result = gsm.setExhaustion("Theron", 0);
      assertToolSuccess(result);
      expect(theron().exhaustionLevel).toBeUndefined();
      expect(theron().conditions.some((c) => c.name === "Exhaustion")).toBe(false);
    });
  });

  describe("level 1–9 adds Exhaustion condition", () => {
    it("level 1 sets exhaustionLevel and adds Exhaustion condition", () => {
      const result = gsm.setExhaustion("Theron", 1);
      assertToolSuccess(result);
      expect(theron().exhaustionLevel).toBe(1);
      expect(theron().conditions.some((c) => c.name === "Exhaustion")).toBe(true);
    });

    it("level 5 sets exhaustionLevel=5 and adds Exhaustion condition", () => {
      const result = gsm.setExhaustion("Theron", 5);
      assertToolSuccess(result);
      expect(theron().exhaustionLevel).toBe(5);
      expect(theron().conditions.some((c) => c.name === "Exhaustion")).toBe(true);
    });

    it("Exhaustion condition is not duplicated when set twice", () => {
      gsm.setExhaustion("Theron", 2);
      gsm.setExhaustion("Theron", 4);
      expect(theron().conditions.filter((c) => c.name === "Exhaustion")).toHaveLength(1);
    });

    it("penalty string contains level-based modifier", () => {
      const result = gsm.setExhaustion("Theron", 3);
      assertToolSuccess(result);
      // penalty = "-6 to all d20 rolls and spell save DC; speed -15ft"
      expect(result.data?.penalty).toContain("-6");
    });
  });

  describe("level 10 adds Dead condition", () => {
    it("level 10 adds both Exhaustion and Dead conditions", () => {
      const result = gsm.setExhaustion("Theron", 10);
      assertToolSuccess(result);
      expect(theron().exhaustionLevel).toBe(10);
      expect(theron().conditions.some((c) => c.name === "Exhaustion")).toBe(true);
      expect(theron().conditions.some((c) => c.name === "Dead")).toBe(true);
    });

    it("level 10 does not duplicate Dead condition if already present", () => {
      theron().conditions.push({ name: "Dead" });
      gsm.setExhaustion("Theron", 10);
      expect(theron().conditions.filter((c) => c.name === "Dead")).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Barbarian character data integrity — Gruk (Player4)
// ---------------------------------------------------------------------------

/**
 * Verify the character builder produces correct static and dynamic data for
 * Gruk (Half-Orc Barbarian 5 / Berserker) with Unarmored Defense:
 * - AC = 10 + DEX mod (2) + CON mod (3) = 15 (no body armor equipped)
 * - maxHP = 55 (12 + 4×7 + 5×3 CON)
 * - Rage ×3 in classResources (resetType="long")
 * - No spell slots and no pact magic slots
 */
describe("Barbarian character data integrity — Gruk (Barbarian 5)", () => {
  let gsm: TestGSM["gsm"];

  beforeEach(() => {
    ({ gsm } = createTestGSM());
    registerCharacter(gsm, "Player4", createBarbarianCharacter());
  });

  it("static.armorClass equals 15 (Unarmored Defense: 10 + DEX 2 + CON 3)", () => {
    const char = gsm.characters["Player4"];
    expect(getAC(char)).toBe(15);
  });

  it("static.maxHP equals 55", () => {
    const char = gsm.characters["Player4"];
    expect(getHP(char)).toBe(55);
  });

  it("static.classResources contains Rage with maxUses=3, longRest=all, shortRest=1", () => {
    const char = gsm.characters["Player4"];
    const rage = getClassResources(char).find((r) => r.name === "Rage");
    expect(rage).toBeDefined();
    expect(rage!.maxUses).toBe(3);
    expect(rage!.longRest).toBe("all");
    expect(rage!.shortRest).toBe(1);
  });

  it("dynamic.spellSlotsUsed is empty (Barbarian has no spell slots)", () => {
    const char = gsm.characters["Player4"];
    expect(char.dynamic.spellSlotsUsed).toHaveLength(0);
  });

  it("dynamic.pactMagicSlots is empty (Barbarian has no pact magic)", () => {
    const char = gsm.characters["Player4"];
    expect(char.dynamic.pactMagicSlots ?? []).toHaveLength(0);
  });
});
