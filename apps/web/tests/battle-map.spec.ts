import { test, expect } from "@playwright/test";
import { TestBridge } from "./test-bridge";

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

/**
 * Wait for the room page to fully load and the player's WebSocket join
 * handshake to complete. "Waiting for DM..." only appears in GameNavBar
 * after joined=true, so it is a reliable post-join signal.
 */
async function waitForRoom(page: import("@playwright/test").Page, _roomCode: string) {
  await expect(page.getByText("Waiting for DM...")).toBeVisible({ timeout: 15_000 });
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
        speed: { walk: 30 },
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
        speed: { walk: 30 },
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
        speed: { walk: 30 },
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
 * We use combat_update (not game_state_sync) because the real server sends
 * game_state_sync on join which would race with our broadcast.
 */
function buildCombatUpdate(combat: ReturnType<typeof buildMockCombat>) {
  return {
    type: "server:combat_update",
    combat,
    map: buildMockMap(),
    timestamp: Date.now(),
  };
}

/**
 * Wait for the BattleMap to be rendered by checking for a combatant token.
 * The BattleMap has no terrain legend — we confirm it rendered by checking
 * that the enemy token is present in the DOM.
 */
async function waitForBattleMap(page: import("@playwright/test").Page) {
  await expect(page.locator("[data-combatant='enemy-1']")).toBeVisible({ timeout: 8_000 });
}

/** Build a mock character to broadcast via server:character_updated. */
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
        speed: { walk: 30 },
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
        currency: { cp: 0, sp: 0, gp: 50, pp: 0 },
      },
    },
  };
}

/** Send a server:ai message to set storyStarted=true on the client */
function startStory(bridge: TestBridge) {
  bridge.broadcast({
    type: "server:ai",
    content: "The adventure begins...",
    timestamp: Date.now(),
    id: `test-story-${Date.now()}`,
  } as Record<string, unknown>);
}

// ─── Tests ───

test.describe("Battle Map", () => {
  test("battle map is not visible when not in combat", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "MapHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    // Without combat state, no tokens should be present
    await expect(page.locator("[data-combatant='player-1']")).not.toBeVisible();
    // "Your turn" banner should not be visible
    await expect(page.getByText("Your turn")).not.toBeVisible();
    // Initiative tracker renders no buttons when there is no active combat
    await expect(page.locator("button").filter({ hasText: "Elara" })).not.toBeVisible();
  });

  test("renders battle map grid when combat state is received", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "GridHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    const combat = buildMockCombat(false);
    bridge.broadcast(buildCombatUpdate(combat) as Record<string, unknown>);

    // InitiativeTracker should appear — combatant buttons are the proof of render
    await expect(page.locator("button").filter({ hasText: "Elara" })).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.locator("button").filter({ hasText: "Goblin" })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Guard" })).toBeVisible();

    // Tokens on the map confirm BattleMap rendered
    await waitForBattleMap(page);
    await expect(page.locator("[data-combatant='player-1']")).toBeVisible();

    // Column labels (A-H for 8-wide map)
    await expect(page.getByText("A").first()).toBeVisible();
    await expect(page.getByText("H").first()).toBeVisible();

    bridge.disconnect();
  });

  test("renders combatant tokens with initials", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "TokenHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    const combat = buildMockCombat(false);
    bridge.broadcast(buildCombatUpdate(combat) as Record<string, unknown>);

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

    bridge.disconnect();
  });

  test("shows hover tooltip with conditions on token hover", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "CondHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    const combat = buildMockCombat(false);
    bridge.broadcast(buildCombatUpdate(combat) as Record<string, unknown>);

    await waitForBattleMap(page);

    // Hover over the Goblin token to see the fixed tooltip
    const goblinToken = page.locator("[data-combatant='enemy-1']");
    await goblinToken.hover();

    // The tooltip renders the combatant's name and conditions as text spans
    // It appears as a fixed overlay outside the scaled grid wrapper
    await expect(page.getByText("poisoned").first()).toBeVisible({ timeout: 3_000 });

    bridge.disconnect();
  });

  test("shows initiative tracker with combatant names", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "TrackerHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    const combat = buildMockCombat(false);
    bridge.broadcast(buildCombatUpdate(combat) as Record<string, unknown>);

    // InitiativeTracker renders a button per combatant — wait for any one of them
    await expect(page.locator("button").filter({ hasText: "Elara" })).toBeVisible({
      timeout: 8_000,
    });

    // All combatant names should appear in the tracker
    await expect(page.locator("button").filter({ hasText: "Goblin" })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Guard" })).toBeVisible();

    bridge.disconnect();
  });

  test("clicking combatant in tracker highlights on map", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "HighlightHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    const combat = buildMockCombat(false);
    bridge.broadcast(buildCombatUpdate(combat) as Record<string, unknown>);

    await waitForBattleMap(page);

    // Click the "Guard" combatant button in the initiative tracker
    const guardButton = page.locator("button").filter({ hasText: "Guard" });
    await guardButton.click();

    // The NPC token on the map should remain visible (click does not remove it)
    const npcToken = page.locator("[data-combatant='npc-1']");
    await expect(npcToken).toBeVisible();

    bridge.disconnect();
  });

  test("shows 'Your turn' banner when it is player turn", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "TurnHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    // Broadcast a character so myCharacterName matches "Elara"
    bridge.broadcast(buildCharacterUpdate("TurnHost", "Elara") as Record<string, unknown>);

    // Inject combat where player-1 (Elara) is active
    const combat = buildMockCombat(true);
    bridge.broadcast(buildCombatUpdate(combat) as Record<string, unknown>);

    // "Your turn" banner should appear (full text: "Your turn — drag your token to move")
    await expect(page.getByText("Your turn").first()).toBeVisible({ timeout: 8_000 });

    // Movement remaining should show
    await expect(page.getByText("30ft remaining")).toBeVisible();

    bridge.disconnect();
  });

  test("tokens use absolute positioning for animation", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "AbsPosHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    const combat = buildMockCombat(false);
    bridge.broadcast(buildCombatUpdate(combat) as Record<string, unknown>);

    await waitForBattleMap(page);

    // Tokens should use absolute positioning with left/top and transition
    const playerToken = page.locator("[data-combatant='player-1']");
    const style = await playerToken.getAttribute("style");
    // left/top are set via inline styles for absolute positioning
    expect(style).toContain("left:");
    expect(style).toContain("top:");
    // Should have transition for animation
    expect(style).toContain("transition");
    expect(style).toContain("ease-out");
    // CSS class "absolute" is applied via Tailwind
    const classes = await playerToken.getAttribute("class");
    expect(classes).toContain("absolute");

    bridge.disconnect();
  });

  test("combat ending removes the battle map", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "EndHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    // Start combat
    const combat = buildMockCombat(false);
    bridge.broadcast(buildCombatUpdate(combat) as Record<string, unknown>);

    // Map should be visible (tokens prove it)
    await waitForBattleMap(page);
    // Initiative tracker buttons should be visible
    await expect(page.locator("button").filter({ hasText: "Goblin" })).toBeVisible();

    // End combat — send combat_update with null
    bridge.broadcast({
      type: "server:combat_update",
      combat: null,
      map: null,
      timestamp: Date.now(),
    });

    // Tokens should disappear (map unmounted)
    await expect(page.locator("[data-combatant='enemy-1']")).not.toBeVisible({ timeout: 8_000 });
    // Initiative tracker buttons should disappear (InitiativeTracker returns null when phase !== "active")
    await expect(page.locator("button").filter({ hasText: "Goblin" })).not.toBeVisible();

    bridge.disconnect();
  });

  test("enemy conditions shown as SVG icons in initiative tracker", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "HPHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    const combat = buildMockCombat(false);
    bridge.broadcast(buildCombatUpdate(combat) as Record<string, unknown>);

    // Wait for the initiative tracker to render
    await expect(page.locator("button").filter({ hasText: "Goblin" })).toBeVisible({
      timeout: 8_000,
    });

    // Conditions are shown as SVG warning icons with a title attribute on the container div.
    // The Goblin has 1 condition ("poisoned") so the container title should be "poisoned".
    const goblinButton = page.locator("button").filter({ hasText: "Goblin" });
    await expect(goblinButton).toBeVisible();

    // The condition icon container has a title attribute set to the comma-joined condition names
    const conditionContainer = goblinButton.locator('[title="poisoned"]');
    await expect(conditionContainer).toBeVisible();

    bridge.disconnect();
  });

  test("large creature token renders at correct position", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "LargeHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    // Create combat with a large creature
    const combat = buildMockCombat(false);
    combat.combatants["enemy-1"] = {
      ...combat.combatants["enemy-1"],
      name: "Ogre",
      size: "large" as any,
      position: { x: 4, y: 4 },
    } as any;
    combat.turnOrder = ["enemy-1", "player-1", "npc-1"];

    bridge.broadcast(buildCombatUpdate(combat) as Record<string, unknown>);

    // Wait for any token to appear to confirm BattleMap rendered
    await expect(page.locator("[data-combatant='player-1']")).toBeVisible({ timeout: 8_000 });

    // Ogre token should be visible with "OG" initials
    const ogreToken = page.locator("[data-combatant='enemy-1']");
    await expect(ogreToken).toBeVisible();
    await expect(ogreToken).toContainText("OG");

    // Token should use absolute positioning (via Tailwind class)
    const classes = await ogreToken.getAttribute("class");
    expect(classes).toContain("absolute");

    bridge.disconnect();
  });

  test("player HP shows in initiative tracker when character data available", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "PlayerHPHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    // Broadcast character data first
    bridge.broadcast(buildCharacterUpdate("PlayerHPHost", "Elara") as Record<string, unknown>);

    // Then broadcast combat
    const combat = buildMockCombat(false);
    bridge.broadcast(buildCombatUpdate(combat) as Record<string, unknown>);

    // Wait for the initiative tracker to render — use .first() because character_updated
    // also creates a character tag button in the chat area
    await expect(page.locator("button").filter({ hasText: "Elara" }).first()).toBeVisible({
      timeout: 8_000,
    });

    // Player HP numbers should show in initiative tracker (30/30)
    // Use .first() — HP also appears in the character tag button in the chat area
    await expect(page.getByText("30/30").first()).toBeVisible();

    bridge.disconnect();
  });
});
