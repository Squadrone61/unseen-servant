import { describe, it, expect, beforeEach } from "vitest";
import { createTestGSM, registerCharacter, assertToolSuccess } from "./setup.js";
import type { TestGSM } from "./setup.js";
import {
  createFighterCharacter,
  createClericCharacter,
  createBarbarianCharacter,
  createWarlockCharacter,
} from "./fixtures.js";

/**
 * Gameplay flow integration tests.
 *
 * These tests exercise multi-step method chains that happen during real D&D
 * sessions. Individual GSM methods are unit-tested elsewhere — this file tests
 * the *seams between methods* where gameplay bugs hide.
 *
 * Each describe block represents a scenario that a player would experience
 * during a game session. A failure here means a bug that would show up at the
 * table.
 */

// ===========================================================================
// Flow 1: Lethal Damage → Death Saves → Stabilize → Heal → Resume
// ===========================================================================

describe("lethal damage → death saves → stabilize → heal → resume", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createFighterCharacter());
  });

  it("walks through the full near-death experience", () => {
    const { gsm } = env;
    const char = gsm.characters["Player1"];

    // Theron starts at 44 HP — reduce to 5 first
    gsm.setHP("Theron", 5);
    expect(char.dynamic.currentHP).toBe(5);

    // 1. Lethal damage drops Theron to 0 HP
    const dmgResult = gsm.applyDamage("Theron", 10);
    assertToolSuccess(dmgResult);
    expect(char.dynamic.currentHP).toBe(0);

    // 2. Death saves start at 0/0
    expect(char.dynamic.deathSaves.successes).toBe(0);
    expect(char.dynamic.deathSaves.failures).toBe(0);

    // 3-5. Three successful death saves → stabilized
    gsm.recordDeathSave("Theron", true);
    expect(char.dynamic.deathSaves.successes).toBe(1);

    gsm.recordDeathSave("Theron", true);
    expect(char.dynamic.deathSaves.successes).toBe(2);

    const stabilizeResult = gsm.recordDeathSave("Theron", true);
    assertToolSuccess(stabilizeResult);
    expect(char.dynamic.deathSaves.successes).toBe(3);

    // 6. Character is stabilized at 0 HP — has "Stabilized" condition
    expect(char.dynamic.currentHP).toBe(0);
    expect(char.dynamic.conditions.some((c) => c.name === "Stabilized")).toBe(true);

    // 7. Healing brings HP above 0 and resets death saves
    const healResult = gsm.heal("Theron", 10);
    assertToolSuccess(healResult);
    expect(char.dynamic.currentHP).toBe(10);
    expect(char.dynamic.deathSaves.successes).toBe(0);
    expect(char.dynamic.deathSaves.failures).toBe(0);

    // 8. Character is fully playable again — no death-related conditions
    expect(char.dynamic.conditions.some((c) => c.name === "Dead")).toBe(false);
  });
});

// ===========================================================================
// Flow 2: Damage to Unconscious PC → Auto Failures → Death
// ===========================================================================

describe("damage to unconscious PC → auto failures → death", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createFighterCharacter());
  });

  it("accumulates death save failures from damage at 0 HP", () => {
    const { gsm } = env;
    const char = gsm.characters["Player1"];

    // Drop to 0 HP
    gsm.setHP("Theron", 1);
    gsm.applyDamage("Theron", 5);
    expect(char.dynamic.currentHP).toBe(0);

    // Normal hit at 0 HP → 1 death save failure
    gsm.applyDamage("Theron", 3);
    expect(char.dynamic.deathSaves.failures).toBe(1);

    // Critical hit at 0 HP → 2 death save failures
    gsm.applyDamage("Theron", 3, "slashing", true);
    expect(char.dynamic.deathSaves.failures).toBe(3);

    // 3 failures → Dead
    expect(char.dynamic.conditions.some((c) => c.name === "Dead")).toBe(true);
  });

  it("caps failures at 3 even with excess damage", () => {
    const { gsm } = env;
    const char = gsm.characters["Player1"];

    gsm.setHP("Theron", 0);

    // Two critical hits = 4 failures, but capped at 3
    gsm.applyDamage("Theron", 5, "slashing", true); // +2 failures
    gsm.applyDamage("Theron", 5, "slashing", true); // +2 more, capped at 3
    expect(char.dynamic.deathSaves.failures).toBe(3);
  });
});

// ===========================================================================
// Flow 3: Concentration Spell → Take Damage → DC in Response
// ===========================================================================

describe("concentration spell → take damage → concentration DC returned", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createClericCharacter());
  });

  it("returns correct concentration DC after damage to concentrating caster", () => {
    const { gsm } = env;
    const char = gsm.characters["Player1"];

    // Brynn concentrates on Bless
    gsm.setConcentration("Brynn", "Bless");
    expect(char.dynamic.concentratingOn?.spellName).toBe("Bless");

    // Brynn takes 22 damage → DC = max(10, floor(22/2)) = 11
    const dmgResult = gsm.applyDamage("Brynn", 22);
    assertToolSuccess(dmgResult);

    const data = dmgResult.data as { concentrationDC?: number };
    expect(data.concentrationDC).toBe(11);

    // Concentration is NOT auto-broken — DM must decide
    expect(char.dynamic.concentratingOn?.spellName).toBe("Bless");
  });

  it("returns DC 10 for small damage amounts", () => {
    const { gsm } = env;

    gsm.setConcentration("Brynn", "Bless");

    // 8 damage → floor(8/2)=4, but minimum DC is 10
    const dmgResult = gsm.applyDamage("Brynn", 8);
    const data = dmgResult.data as { concentrationDC?: number };
    expect(data.concentrationDC).toBe(10);
  });

  it("does not include concentrationDC when caster is not concentrating", () => {
    const { gsm } = env;

    // Brynn is NOT concentrating — damage should not mention concentration
    const dmgResult = gsm.applyDamage("Brynn", 10);
    const data = dmgResult.data as { concentrationDC?: number };
    expect(data.concentrationDC).toBeUndefined();
  });
});

// ===========================================================================
// Flow 4: Cast New Concentration Spell → Previous Breaks → Slots Used
// ===========================================================================

describe("cast new concentration spell → previous breaks automatically", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createClericCharacter());
  });

  it("auto-breaks Bless when Spirit Guardians concentration is set", () => {
    const { gsm } = env;
    const char = gsm.characters["Player1"];

    // Cast Bless: use L1 slot + set concentration
    gsm.useSpellSlot("Brynn", 1);
    gsm.setConcentration("Brynn", "Bless");
    expect(char.dynamic.concentratingOn?.spellName).toBe("Bless");

    // Cast Spirit Guardians: use L3 slot + set concentration (auto-breaks Bless)
    gsm.useSpellSlot("Brynn", 3);
    const concResult = gsm.setConcentration("Brynn", "Spirit Guardians");
    assertToolSuccess(concResult);

    // Now concentrating on Spirit Guardians, not Bless
    expect(char.dynamic.concentratingOn?.spellName).toBe("Spirit Guardians");

    // Both spell slots consumed
    const l1 = char.dynamic.spellSlotsUsed.find((s) => s.level === 1);
    const l3 = char.dynamic.spellSlotsUsed.find((s) => s.level === 3);
    expect(l1!.used).toBe(1);
    expect(l3!.used).toBe(1);
  });
});

// ===========================================================================
// Flow 5: Condition Duration Expiration via Turn Advancement
// ===========================================================================

describe("condition with duration expires after advancing turns", () => {
  let env: TestGSM;

  /** Helper: create NPC-only combat with deterministic turn order */
  function setupNPCCombat(gsm: TestGSM["gsm"]) {
    gsm.updateBattleMap({ id: "map1", width: 10, height: 10, name: "Test Arena", tiles: [] });
    gsm.startCombat([
      { name: "Goblin A", type: "enemy" as const, maxHP: 15, armorClass: 13, speed: 30 },
      { name: "Goblin B", type: "enemy" as const, maxHP: 15, armorClass: 13, speed: 30 },
    ]);
    // Force deterministic order: Goblin A first, Goblin B second
    gsm.setInitiative("Goblin A", 20);
    gsm.setInitiative("Goblin B", 10);
    gsm.setActiveTurn("Goblin A");
  }

  beforeEach(() => {
    env = createTestGSM();
  });

  it("NPC end-of-turn condition (duration=1) expires after its turn ends", () => {
    const { gsm } = env;
    setupNPCCombat(gsm);

    gsm.addCondition("Goblin A", "Stunned", 1);

    const combat = gsm.gameState.encounter!.combat!;
    const goblinA = Object.values(combat.combatants).find((c) => c.name === "Goblin A")!;
    expect(goblinA.conditions?.some((c) => c.name === "Stunned")).toBe(true);

    // Advance: Goblin A's turn ends → Goblin B starts → Stunned should expire
    gsm.advanceTurnMCP();

    expect(goblinA.conditions?.some((c) => c.name === "Stunned")).toBe(false);
  });

  it("NPC condition with duration=2 persists after 1 turn, expires after 2", () => {
    const { gsm } = env;
    setupNPCCombat(gsm);

    gsm.addCondition("Goblin A", "Poisoned", 2);
    const combat = gsm.gameState.encounter!.combat!;
    const goblinA = Object.values(combat.combatants).find((c) => c.name === "Goblin A")!;

    // Advance past Goblin A's turn — duration decrements to 1
    gsm.advanceTurnMCP(); // → Goblin B's turn
    const poisoned = goblinA.conditions?.find((c) => c.name === "Poisoned");
    expect(poisoned).toBeDefined();
    expect(poisoned!.duration).toBe(1);

    // Complete round: advance past Goblin B, then past Goblin A again
    gsm.advanceTurnMCP(); // → Goblin A's turn (round 2)
    gsm.advanceTurnMCP(); // → Goblin B's turn, Goblin A's turn ended → Poisoned expires

    expect(goblinA.conditions?.some((c) => c.name === "Poisoned")).toBe(false);
  });

  it("player condition with duration=1 expires after their turn ends", () => {
    const { gsm } = env;
    registerCharacter(env.gsm, "Player1", createFighterCharacter());

    gsm.updateBattleMap({ id: "map2", width: 10, height: 10, name: "Arena", tiles: [] });
    gsm.startCombat([
      { name: "Goblin A", type: "enemy" as const, maxHP: 15, armorClass: 13, speed: 30 },
      { name: "Theron", type: "player" as const, speed: 30 },
    ]);

    // Force order: Goblin A first, then Theron
    gsm.setInitiative("Goblin A", 20);
    gsm.setInitiative("Theron", 5);
    gsm.setActiveTurn("Goblin A");

    const char = gsm.characters["Player1"];

    // Add Frightened with duration=1 to Theron
    gsm.addCondition("Theron", "Frightened", 1);
    expect(char.dynamic.conditions.some((c) => c.name === "Frightened")).toBe(true);

    // Advance past Goblin A → Theron's turn starts
    gsm.advanceTurnMCP();

    // Player ends their turn → Frightened should expire
    gsm.handleEndTurn("Player1");

    expect(char.dynamic.conditions.some((c) => c.name === "Frightened")).toBe(false);
  });
});

// ===========================================================================
// Flow 6: Short Rest with Mixed Party
// ===========================================================================

describe("short rest with mixed party — each archetype handled correctly", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createFighterCharacter());
    registerCharacter(env.gsm, "Player2", createClericCharacter());
    registerCharacter(env.gsm, "Player3", createWarlockCharacter());
    registerCharacter(env.gsm, "Player4", createBarbarianCharacter());
  });

  it("restores short-rest resources only, preserves long-rest resources, does not heal", () => {
    const { gsm } = env;
    const fighter = gsm.characters["Player1"];
    const cleric = gsm.characters["Player2"];
    const warlock = gsm.characters["Player3"];
    const barbarian = gsm.characters["Player4"];

    // Use resources
    gsm.useClassResource("Theron", "Second Wind");
    gsm.useClassResource("Brynn", "Channel Divinity");
    gsm.useClassResource("Gruk", "Rage");
    gsm.useSpellSlot("Zara", 3); // pact slot
    gsm.useSpellSlot("Zara", 3); // pact slot

    // Damage everyone to different HP levels
    gsm.setHP("Theron", 20);
    gsm.setHP("Brynn", 30);
    gsm.setHP("Zara", 25);
    gsm.setHP("Gruk", 40);

    // Short rest
    const result = gsm.shortRest(["Theron", "Brynn", "Zara", "Gruk"]);
    assertToolSuccess(result);

    // Fighter: Second Wind restored (short rest), HP unchanged
    expect(fighter.dynamic.resourcesUsed?.["Second Wind"]).toBe(0);
    expect(fighter.dynamic.currentHP).toBe(20);

    // Cleric: Channel Divinity restored (short rest), HP unchanged
    expect(cleric.dynamic.resourcesUsed?.["Channel Divinity"]).toBe(0);
    expect(cleric.dynamic.currentHP).toBe(30);

    // Warlock: Pact slots restored (short rest), HP unchanged
    const pact = warlock.dynamic.pactMagicSlots?.find((s) => s.level === 3);
    expect(pact!.used).toBe(0);
    expect(warlock.dynamic.currentHP).toBe(25);

    // Barbarian: Rage recovers 1 use on short rest (2024 PHB), all uses on long rest.
    // Used 1 → recover 1 → 0 used.
    expect(barbarian.dynamic.resourcesUsed?.["Rage"]).toBe(0);
    expect(barbarian.dynamic.currentHP).toBe(40);
  });

  it("returns personalized hit dice hints for each archetype", () => {
    const { gsm } = env;

    const result = gsm.shortRest(["Theron", "Brynn", "Zara", "Gruk"]);
    assertToolSuccess(result);

    const data = result.data as {
      characters: Array<{
        character: string;
        hitDice: string;
        healingPerDie: string;
      }>;
    };

    const byName = Object.fromEntries(data.characters.map((c) => [c.character, c]));

    // Fighter: d10
    expect(byName["Theron"].hitDice).toContain("d10");
    expect(byName["Theron"].healingPerDie).toContain("d10");

    // Cleric: d8
    expect(byName["Brynn"].hitDice).toContain("d8");
    expect(byName["Brynn"].healingPerDie).toContain("d8");

    // Warlock: d8
    expect(byName["Zara"].hitDice).toContain("d8");
    expect(byName["Zara"].healingPerDie).toContain("d8");

    // Barbarian: d12
    expect(byName["Gruk"].hitDice).toContain("d12");
    expect(byName["Gruk"].healingPerDie).toContain("d12");
  });
});

// ===========================================================================
// Flow 7: Long Rest Full Recovery After Combat
// ===========================================================================

describe("long rest after combat — full recovery for all archetypes", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createFighterCharacter());
    registerCharacter(env.gsm, "Player2", createClericCharacter());
    registerCharacter(env.gsm, "Player3", createWarlockCharacter());
    registerCharacter(env.gsm, "Player4", createBarbarianCharacter());
  });

  it("restores everything: HP, all slots, all resources, clears conditions", () => {
    const { gsm } = env;
    const fighter = gsm.characters["Player1"];
    const cleric = gsm.characters["Player2"];
    const warlock = gsm.characters["Player3"];
    const barbarian = gsm.characters["Player4"];

    // Use all types of resources
    gsm.useClassResource("Theron", "Second Wind");
    gsm.useClassResource("Theron", "Action Surge");
    gsm.useClassResource("Brynn", "Channel Divinity");
    gsm.useSpellSlot("Brynn", 1);
    gsm.useSpellSlot("Brynn", 3);
    gsm.useClassResource("Gruk", "Rage");
    gsm.useClassResource("Gruk", "Rage");
    gsm.useClassResource("Gruk", "Rage");
    gsm.useSpellSlot("Zara", 3);
    gsm.useSpellSlot("Zara", 3);

    // Damage everyone
    gsm.setHP("Theron", 10);
    gsm.setHP("Brynn", 15);
    gsm.setHP("Zara", 5);
    gsm.setHP("Gruk", 20);

    // Add conditions — Poisoned with endsOnLongRest, Frightened without
    gsm.addCondition("Theron", "Poisoned");
    // Manually flag Poisoned as ending on long rest (e.g., from a spell effect)
    const poisonedCond = fighter.dynamic.conditions.find((c) => c.name === "Poisoned");
    poisonedCond!.endsOnLongRest = true;

    gsm.addCondition("Theron", "Frightened");
    // Frightened has NO endsOnLongRest flag — should persist through rest

    gsm.setConcentration("Brynn", "Bless");
    gsm.setExhaustion("Gruk", 2);

    // Long rest
    const result = gsm.longRest(["Theron", "Brynn", "Zara", "Gruk"]);
    assertToolSuccess(result);

    // HP fully restored
    expect(fighter.dynamic.currentHP).toBe(44);
    expect(cleric.dynamic.currentHP).toBe(53);
    expect(warlock.dynamic.currentHP).toBe(38);
    expect(barbarian.dynamic.currentHP).toBe(55);

    // All spell slots restored
    for (const slot of cleric.dynamic.spellSlotsUsed) {
      expect(slot.used).toBe(0);
    }
    const pact = warlock.dynamic.pactMagicSlots?.find((s) => s.level === 3);
    expect(pact!.used).toBe(0);

    // All class resources restored (including long-rest ones like Rage)
    expect(fighter.dynamic.resourcesUsed?.["Second Wind"]).toBe(0);
    expect(fighter.dynamic.resourcesUsed?.["Action Surge"]).toBe(0);
    expect(cleric.dynamic.resourcesUsed?.["Channel Divinity"]).toBe(0);
    expect(barbarian.dynamic.resourcesUsed?.["Rage"]).toBe(0);

    // Condition with endsOnLongRest=true is cleared
    expect(fighter.dynamic.conditions.some((c) => c.name === "Poisoned")).toBe(false);

    // Condition without endsOnLongRest flag persists (source must end it)
    expect(fighter.dynamic.conditions.some((c) => c.name === "Frightened")).toBe(true);

    // Concentration cleared
    expect(cleric.dynamic.concentratingOn).toBeFalsy();

    // Exhaustion decremented (2 → 1)
    expect(barbarian.dynamic.exhaustionLevel).toBe(1);
  });

  it("resets death saves if character was dying", () => {
    const { gsm } = env;
    const fighter = gsm.characters["Player1"];

    // Put Theron at 0 HP with some death save failures
    gsm.setHP("Theron", 0);
    gsm.recordDeathSave("Theron", false);
    gsm.recordDeathSave("Theron", true);
    expect(fighter.dynamic.deathSaves.failures).toBe(1);
    expect(fighter.dynamic.deathSaves.successes).toBe(1);

    // Long rest
    gsm.longRest(["Theron"]);

    // Death saves reset, HP restored
    expect(fighter.dynamic.deathSaves.successes).toBe(0);
    expect(fighter.dynamic.deathSaves.failures).toBe(0);
    expect(fighter.dynamic.currentHP).toBe(44);
  });
});
