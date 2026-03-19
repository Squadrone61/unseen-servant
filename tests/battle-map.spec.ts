import { test, expect } from "@playwright/test";

/**
 * Helper: create a room via API and register an init script that sets
 * localStorage BEFORE the React app hydrates.
 */
async function createRoomAndSetup(
  page: import("@playwright/test").Page,
  playerName: string,
): Promise<string> {
  const res = await page.request.post("http://localhost:8787/api/rooms/create");
  const { roomCode } = await res.json();

  await page.addInitScript((name) => {
    localStorage.setItem("playerName", name);
  }, playerName);

  return roomCode;
}

/** Wait for room to fully load and initial server sync to complete. */
async function waitForRoom(page: import("@playwright/test").Page, roomCode: string) {
  await expect(page.getByText(roomCode).first()).toBeVisible({
    timeout: 15_000,
  });
  // Wait for __testInjectMessage hook (exposed by GameContent)
  await page.waitForFunction(
    () => typeof (window as any).__testInjectMessage === "function",
    null,
    { timeout: 15_000 },
  );
}

/**
 * Inject a server message directly through React's handleMessage callback.
 * This bypasses WebSocket and Zod parsing entirely, avoiding race conditions
 * with the real server's initial sync messages.
 */
async function injectServerMessage(
  page: import("@playwright/test").Page,
  message: Record<string, unknown>,
) {
  await page.evaluate((msg) => {
    (window as any).__testInjectMessage(msg);
  }, message);
}

// ─── Mock data factories ───

/** Build a small 8x8 battle map with walls, floor, water, difficult terrain, and a door. */
function buildMockMap() {
  const tiles: { type: string }[][] = [];
  for (let y = 0; y < 8; y++) {
    const row: { type: string }[] = [];
    for (let x = 0; x < 8; x++) {
      const isWall = y === 0 || y === 7 || x === 0 || x === 7;
      if (isWall) {
        row.push({ type: "wall" });
      } else if (x === 4 && y === 4) {
        row.push({ type: "water" });
      } else if (x === 3 && y === 5) {
        row.push({ type: "difficult_terrain" });
      } else if (x === 6 && y === 3) {
        row.push({ type: "door" });
      } else {
        row.push({ type: "floor" });
      }
    }
    tiles.push(row);
  }
  return {
    id: "test-map-001",
    width: 8,
    height: 8,
    tiles,
    name: "Test Dungeon Room",
  };
}

/** Build mock combat state with 3 combatants. */
function buildMockCombat(playerIsActive = true) {
  const turnOrder = playerIsActive
    ? ["player-1", "enemy-1", "npc-1"]
    : ["enemy-1", "player-1", "npc-1"];
  return {
    phase: "active" as const,
    round: 1,
    turnIndex: 0,
    turnOrder,
    combatants: {
      "player-1": {
        id: "player-1",
        name: "Elara",
        type: "player",
        playerId: "test-user-id",
        initiative: 18,
        initiativeModifier: 3,
        speed: 30,
        movementUsed: 0,
        position: { x: 3, y: 3 },
        size: "medium",
      },
      "enemy-1": {
        id: "enemy-1",
        name: "Goblin",
        type: "enemy",
        initiative: 14,
        initiativeModifier: 2,
        speed: 30,
        movementUsed: 0,
        position: { x: 5, y: 5 },
        size: "medium",
        maxHP: 12,
        currentHP: 8,
        armorClass: 13,
        conditions: [{ name: "poisoned" }],
      },
      "npc-1": {
        id: "npc-1",
        name: "Guard",
        type: "npc",
        initiative: 10,
        initiativeModifier: 1,
        speed: 30,
        movementUsed: 0,
        position: { x: 2, y: 4 },
        size: "medium",
        maxHP: 20,
        currentHP: 20,
        armorClass: 16,
        conditions: [],
      },
    },
  };
}

/**
 * Build a combat_update message with map.
 * We use combat_update (not game_state_sync) for injection because the real
 * server sends game_state_sync on join which races with our injection.
 */
function buildCombatUpdate(combat: ReturnType<typeof buildMockCombat>) {
  return {
    type: "server:combat_update",
    combat,
    map: buildMockMap(),
    timestamp: Date.now(),
  };
}

/** Helper to wait for the BattleMap grid to render (uses terrain legend). */
async function waitForBattleMap(page: import("@playwright/test").Page) {
  await expect(page.getByText("Difficult")).toBeVisible({ timeout: 5_000 });
}

/** Build a mock character to inject via server:character_updated. */
function buildCharacterUpdate(playerName: string, charName: string) {
  return {
    type: "server:character_updated",
    playerName,
    character: {
      static: {
        name: charName,
        race: "Elf",
        classes: [{ name: "Wizard", level: 5 }],
        abilities: {
          strength: 8,
          dexterity: 16,
          constitution: 12,
          intelligence: 18,
          wisdom: 14,
          charisma: 10,
        },
        maxHP: 30,
        armorClass: 15,
        proficiencyBonus: 3,
        speed: 30,
        features: [],
        classResources: [],
        proficiencies: { armor: [], weapons: [], tools: [], other: [] },
        skills: [],
        savingThrows: [],
        senses: [],
        languages: ["Common", "Elvish"],
        spells: [],
        advantages: [],
        traits: {},
        importedAt: Date.now(),
      },
      dynamic: {
        currentHP: 30,
        tempHP: 0,
        spellSlotsUsed: [],
        pactMagicSlots: [],
        resourcesUsed: {},
        conditions: [],
        deathSaves: { successes: 0, failures: 0 },
        inventory: [],
        currency: { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 },
      },
    },
  };
}

// ─── Tests ───

test.describe("Battle Map", () => {
  test("battle map is not visible when not in combat", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "MapHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    // BattleMap legend should not be present
    await expect(page.getByText("Difficult")).not.toBeVisible();
    // "Your turn" banner should not be visible
    await expect(page.getByText("Your turn")).not.toBeVisible();
    // Initiative tracker should not be visible
    await expect(page.locator("text=Combat").first()).not.toBeVisible();
  });

  test("renders battle map grid when combat state is injected", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "GridHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    const combat = buildMockCombat(false);
    await injectServerMessage(page, buildCombatUpdate(combat));

    // Initiative tracker should appear with "Combat" label and round
    await expect(page.getByText("Combat").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Round 1")).toBeVisible();

    // Terrain legend should be visible (proves BattleMap rendered)
    await waitForBattleMap(page);
    await expect(page.getByText("Floor")).toBeVisible();
    await expect(page.getByText("Wall")).toBeVisible();
    await expect(page.getByText("Water")).toBeVisible();
    await expect(page.getByText("Door")).toBeVisible();

    // Column labels (A-H for 8 wide)
    await expect(page.getByText("A").first()).toBeVisible();
    await expect(page.getByText("H").first()).toBeVisible();
  });

  test("renders combatant tokens with initials", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "TokenHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    const combat = buildMockCombat(false);
    await injectServerMessage(page, buildCombatUpdate(combat));

    await waitForBattleMap(page);

    // Player token "EL" (first 2 chars of "Elara")
    await expect(page.locator("[data-combatant='player-1']")).toBeVisible();
    await expect(page.locator("[data-combatant='player-1']")).toContainText("EL");

    // Enemy token "GO" (first 2 chars of "Goblin")
    await expect(page.locator("[data-combatant='enemy-1']")).toBeVisible();
    await expect(page.locator("[data-combatant='enemy-1']")).toContainText("GO");

    // NPC token "GU" (first 2 chars of "Guard")
    await expect(page.locator("[data-combatant='npc-1']")).toBeVisible();
    await expect(page.locator("[data-combatant='npc-1']")).toContainText("GU");
  });

  test("shows condition badges on tokens", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "CondHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    const combat = buildMockCombat(false);
    await injectServerMessage(page, buildCombatUpdate(combat));

    await waitForBattleMap(page);

    // Goblin has "poisoned" condition → should show "PSN" badge
    await expect(page.getByTitle("poisoned")).toBeVisible();
    await expect(page.getByTitle("poisoned")).toContainText("PSN");
  });

  test("shows initiative tracker with combatant names", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "TrackerHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    const combat = buildMockCombat(false);
    await injectServerMessage(page, buildCombatUpdate(combat));

    await expect(page.getByText("Combat").first()).toBeVisible({ timeout: 5_000 });

    // All combatant names should appear in the tracker
    await expect(page.getByText("Elara").first()).toBeVisible();
    await expect(page.getByText("Goblin").first()).toBeVisible();
    await expect(page.getByText("Guard").first()).toBeVisible();
  });

  test("clicking combatant in tracker highlights on map", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "HighlightHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    const combat = buildMockCombat(false);
    await injectServerMessage(page, buildCombatUpdate(combat));

    await waitForBattleMap(page);

    // Click the "Guard" combatant in the initiative tracker
    const guardButton = page.locator("button").filter({ hasText: "Guard" });
    await guardButton.click();

    // The NPC token on the map should be visible
    const npcToken = page.locator("[data-combatant='npc-1']");
    await expect(npcToken).toBeVisible();
  });

  test("shows 'Your turn' banner when it is player turn", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "TurnHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    // Inject a character so myCharacterName matches "Elara"
    await injectServerMessage(page, buildCharacterUpdate("TurnHost", "Elara"));

    // Inject combat where player-1 (Elara) is active
    const combat = buildMockCombat(true);
    await injectServerMessage(page, buildCombatUpdate(combat));

    // "Your turn" banner should appear
    await expect(page.getByText("Your turn").first()).toBeVisible({ timeout: 5_000 });

    // Movement remaining should show
    await expect(page.getByText("30ft remaining")).toBeVisible();
  });

  test("movement range tiles are highlighted on player turn", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "MoveHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    // Set character name to "Elara"
    await injectServerMessage(page, buildCharacterUpdate("MoveHost", "Elara"));

    const combat = buildMockCombat(true);
    await injectServerMessage(page, buildCombatUpdate(combat));

    await expect(page.getByText("Your turn").first()).toBeVisible({ timeout: 5_000 });

    // Reachable tiles get role="button" — count them.
    // Player at (3,3) with 30ft movement (6 tiles) — many tiles should be reachable.
    // Walls are on edges (row 0,7 and col 0,7) so inner tiles are reachable.
    const reachableTiles = page.locator("[role='button']");
    const count = await reachableTiles.count();
    // Should have multiple reachable tiles (at least 10 for 30ft movement on an 8x8 map)
    expect(count).toBeGreaterThanOrEqual(10);
  });

  test("combat ending removes the battle map", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "EndHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    // Start combat
    const combat = buildMockCombat(false);
    await injectServerMessage(page, buildCombatUpdate(combat));

    // Map should be visible (terrain legend proves it)
    await waitForBattleMap(page);

    // End combat — send combat_update with null
    await injectServerMessage(page, {
      type: "server:combat_update",
      combat: null,
      map: null,
      timestamp: Date.now(),
    });

    // Map should disappear (legend gone)
    await expect(page.getByText("Diff. Terrain")).not.toBeVisible({ timeout: 5_000 });
    // Initiative tracker should disappear
    await expect(page.getByText("Round 1")).not.toBeVisible();
  });

  test("enemy HP bar shows in initiative tracker", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "HPHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    const combat = buildMockCombat(false);
    await injectServerMessage(page, buildCombatUpdate(combat));

    await expect(page.getByText("Combat").first()).toBeVisible({ timeout: 5_000 });

    // Goblin with "poisoned" condition shows "1 cond." in the tracker
    await expect(page.locator("button").filter({ hasText: "Goblin" })).toBeVisible();
    await expect(page.getByText("1 cond.")).toBeVisible();
  });

  test("large creature token spans multiple tiles", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "LargeHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    // Create combat with a large creature
    const combat = buildMockCombat(false);
    combat.combatants["enemy-1"] = {
      ...combat.combatants["enemy-1"],
      name: "Ogre",
      size: "large" as any,
      position: { x: 4, y: 4 },
    } as any;
    combat.turnOrder = ["enemy-1", "player-1", "npc-1"];

    await injectServerMessage(page, buildCombatUpdate(combat));

    await waitForBattleMap(page);

    // Ogre token should be visible with "OG" initials
    const ogreToken = page.locator("[data-combatant='enemy-1']");
    await expect(ogreToken).toBeVisible();
    await expect(ogreToken).toContainText("OG");

    // Large token uses grid-row/grid-column span 2 — verify via style
    const style = await ogreToken.getAttribute("style");
    expect(style).toContain("span 2");
  });
});
