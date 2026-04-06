import { test, expect } from "@playwright/test";
import { TestBridge } from "./test-bridge";

/**
 * Cross-system integration tests that exercise the full wire path:
 *
 *   browser → Cloudflare Worker (real WebSocket) → TestBridge broadcast → browser
 *
 * These tests use two real browser contexts to verify that combat state
 * synchronises correctly across players. The TestBridge acts as the DM,
 * driving combat progression by sending server messages through the worker relay.
 */

// ─── Shared mock helpers ───

function buildSimpleMap() {
  const tiles: { type: string }[][] = [];
  for (let y = 0; y < 6; y++) {
    const row: { type: string }[] = [];
    for (let x = 0; x < 6; x++) {
      const isWall = y === 0 || y === 5 || x === 0 || x === 5;
      row.push({ type: isWall ? "wall" : "floor" });
    }
    tiles.push(row);
  }
  return { id: "flow-map-001", width: 6, height: 6, tiles, name: "Flow Test Room" };
}

function buildMinimalCharacter(charName: string) {
  return {
    static: {
      name: charName,
      race: "Human",
      classes: [{ name: "Fighter", level: 3 }],
      abilities: {
        strength: 16,
        dexterity: 14,
        constitution: 14,
        intelligence: 10,
        wisdom: 12,
        charisma: 10,
      },
      maxHP: 28,
      armorClass: 16,
      proficiencyBonus: 2,
      speed: 30,
      features: [],
      classResources: [],
      proficiencies: { armor: [], weapons: [], tools: [], other: [] },
      skills: [],
      savingThrows: [],
      senses: [],
      languages: ["Common"],
      spells: [],
      advantages: [],
      traits: {},
      importedAt: Date.now(),
    },
    dynamic: {
      currentHP: 28,
      tempHP: 0,
      spellSlotsUsed: [],
      pactMagicSlots: [],
      resourcesUsed: {},
      conditions: [],
      deathSaves: { successes: 0, failures: 0 },
      inventory: [],
      currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
    },
  };
}

/**
 * Build combat state with two player combatants.
 * turnIndex=0 → Alice's turn, turnIndex=1 → Bob's turn.
 */
function buildTwoPlayerCombat(turnIndex: 0 | 1) {
  return {
    phase: "active" as const,
    round: 1,
    turnIndex,
    turnOrder: ["alice-1", "bob-1"],
    combatants: {
      "alice-1": {
        id: "alice-1",
        name: "Elara",
        type: "player",
        playerId: "alice-user-id",
        initiative: 18,
        initiativeModifier: 2,
        speed: 30,
        movementUsed: 0,
        position: { x: 2, y: 2 },
        size: "medium",
      },
      "bob-1": {
        id: "bob-1",
        name: "Thorin",
        type: "player",
        playerId: "bob-user-id",
        initiative: 12,
        initiativeModifier: 1,
        speed: 30,
        movementUsed: 0,
        position: { x: 3, y: 3 },
        size: "medium",
      },
    },
  };
}

// ─── Tests ───

test.describe("Gameplay Flow (real WebSocket)", () => {
  test("two players see combat start simultaneously", async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();
    const bridge = new TestBridge();

    // Create room
    const res = await player1.request.post("http://localhost:8787/api/rooms/create");
    const { roomCode } = await res.json();

    // Set player names before navigation
    await player1.addInitScript(() => localStorage.setItem("playerName", "Alice"));
    await player2.addInitScript(() => localStorage.setItem("playerName", "Bob"));

    // Both players join
    await player1.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player1.getByText(roomCode).first()).toBeVisible({ timeout: 15_000 });

    await player2.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player2.getByText(roomCode).first()).toBeVisible({ timeout: 15_000 });

    // Connect the test bridge as DM
    await bridge.connect(roomCode);

    // Bridge broadcasts character data for each player
    bridge.broadcast({
      type: "server:character_updated",
      playerName: "Alice",
      character: buildMinimalCharacter("Elara"),
    });
    bridge.broadcast({
      type: "server:character_updated",
      playerName: "Bob",
      character: buildMinimalCharacter("Thorin"),
    });

    // Bridge starts combat — Alice's turn first
    bridge.broadcast({
      type: "server:combat_update",
      combat: buildTwoPlayerCombat(0),
      map: buildSimpleMap(),
      timestamp: Date.now(),
    });

    // Both players should see the initiative tracker — combatant buttons are
    // the proof of render (InitiativeTracker renders no "Combat" header text)
    await expect(player1.locator("button").filter({ hasText: "Elara" })).toBeVisible({
      timeout: 8_000,
    });
    await expect(player2.locator("button").filter({ hasText: "Elara" })).toBeVisible({
      timeout: 8_000,
    });

    // Both players should see both combatant names in the tracker
    await expect(player1.locator("button").filter({ hasText: "Thorin" })).toBeVisible();
    await expect(player2.locator("button").filter({ hasText: "Thorin" })).toBeVisible();

    bridge.disconnect();
    await context1.close();
    await context2.close();
  });

  test("two players take turns in combat via real WebSocket", async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();
    const bridge = new TestBridge();

    // Create room
    const res = await player1.request.post("http://localhost:8787/api/rooms/create");
    const { roomCode } = await res.json();

    // Alice's character name matches alice-1 combatant ("Elara")
    // Bob's character name matches bob-1 combatant ("Thorin")
    await player1.addInitScript(() => localStorage.setItem("playerName", "Alice"));
    await player2.addInitScript(() => localStorage.setItem("playerName", "Bob"));

    await player1.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player1.getByText(roomCode).first()).toBeVisible({ timeout: 15_000 });

    await player2.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player2.getByText(roomCode).first()).toBeVisible({ timeout: 15_000 });

    await bridge.connect(roomCode);

    // Broadcast character data so each player's character name is known to
    // the UI and the "Your turn" banner can match character → player
    bridge.broadcast({
      type: "server:character_updated",
      playerName: "Alice",
      character: buildMinimalCharacter("Elara"),
    });
    bridge.broadcast({
      type: "server:character_updated",
      playerName: "Bob",
      character: buildMinimalCharacter("Thorin"),
    });

    // Start combat — Alice (Elara, alice-1) goes first
    bridge.broadcast({
      type: "server:combat_update",
      combat: buildTwoPlayerCombat(0),
      map: buildSimpleMap(),
      timestamp: Date.now(),
    });

    // Alice sees "Your turn", Bob does not
    await expect(player1.getByText("Your turn").first()).toBeVisible({ timeout: 8_000 });
    await expect(player2.getByText("Your turn")).not.toBeVisible({ timeout: 3_000 });

    // Alice has an End Turn button, Bob does not
    await expect(player1.getByRole("button", { name: "End Turn" })).toBeVisible();
    await expect(player2.getByRole("button", { name: "End Turn" })).not.toBeVisible();

    // Bridge advances combat to Bob's turn (simulates DM advancing after end_turn)
    bridge.broadcast({
      type: "server:combat_update",
      combat: buildTwoPlayerCombat(1),
      map: buildSimpleMap(),
      timestamp: Date.now(),
    });

    // Now Bob sees "Your turn", Alice does not
    await expect(player2.getByText("Your turn").first()).toBeVisible({ timeout: 8_000 });
    await expect(player1.getByText("Your turn")).not.toBeVisible({ timeout: 3_000 });

    // Bob has End Turn, Alice does not
    await expect(player2.getByRole("button", { name: "End Turn" })).toBeVisible();
    await expect(player1.getByRole("button", { name: "End Turn" })).not.toBeVisible();

    bridge.disconnect();
    await context1.close();
    await context2.close();
  });

  test("combat end is broadcast to all players simultaneously", async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();
    const bridge = new TestBridge();

    const res = await player1.request.post("http://localhost:8787/api/rooms/create");
    const { roomCode } = await res.json();

    await player1.addInitScript(() => localStorage.setItem("playerName", "Alice"));
    await player2.addInitScript(() => localStorage.setItem("playerName", "Bob"));

    await player1.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player1.getByText(roomCode).first()).toBeVisible({ timeout: 15_000 });

    await player2.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player2.getByText(roomCode).first()).toBeVisible({ timeout: 15_000 });

    await bridge.connect(roomCode);

    // Start combat
    bridge.broadcast({
      type: "server:combat_update",
      combat: buildTwoPlayerCombat(0),
      map: buildSimpleMap(),
      timestamp: Date.now(),
    });

    // Confirm both see the tracker — combatant buttons are the proof of render
    await expect(player1.locator("button").filter({ hasText: "Elara" })).toBeVisible({
      timeout: 8_000,
    });
    await expect(player2.locator("button").filter({ hasText: "Elara" })).toBeVisible({
      timeout: 8_000,
    });

    // End combat — null combat and map
    bridge.broadcast({
      type: "server:combat_update",
      combat: null,
      map: null,
      timestamp: Date.now(),
    });

    // Both players should see the initiative tracker disappear
    // (InitiativeTracker returns null when combat.phase !== "active")
    await expect(player1.locator("button").filter({ hasText: "Elara" })).not.toBeVisible({
      timeout: 8_000,
    });
    await expect(player2.locator("button").filter({ hasText: "Elara" })).not.toBeVisible({
      timeout: 8_000,
    });

    // Map tokens gone from both (BattleMap is unmounted when combat is null)
    await expect(player1.locator("[data-combatant='alice-1']")).not.toBeVisible();
    await expect(player2.locator("[data-combatant='alice-1']")).not.toBeVisible();

    bridge.disconnect();
    await context1.close();
    await context2.close();
  });
});
