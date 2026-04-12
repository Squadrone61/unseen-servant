import { test, expect } from "@playwright/test";
import { TestBridge } from "./test-bridge";

/**
 * End Turn button + turn advancement tests.
 *
 * These tests verify:
 * 1. End Turn button appears only on player's turn
 * 2. Clicking End Turn sends client:end_turn via the real WebSocket
 * 3. Turn advances when the server broadcasts a new combat_update
 * 4. End Turn is hidden when not the player's turn
 *
 * All server messages now travel through the real WebSocket relay path via
 * TestBridge, exercising Zod validation and the Cloudflare Worker relay.
 */

// ─── Helpers ───

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

async function waitForRoom(page: import("@playwright/test").Page, _roomCode: string) {
  // "Waiting for DM..." only appears in GameNavBar after the WebSocket join
  // handshake completes (joined=true), making it a reliable post-join signal.
  await expect(page.getByText("Waiting for DM...")).toBeVisible({ timeout: 15_000 });
}

// ─── Mock data ───

function buildMockMap() {
  const tiles: { type: string }[][] = [];
  for (let y = 0; y < 8; y++) {
    const row: { type: string }[] = [];
    for (let x = 0; x < 8; x++) {
      const isWall = y === 0 || y === 7 || x === 0 || x === 7;
      row.push({ type: isWall ? "wall" : "floor" });
    }
    tiles.push(row);
  }
  return { id: "test-map-end-turn", width: 8, height: 8, tiles };
}

/** 3 combatants: Player → Enemy → NPC ally */
function buildCombat(turnIndex = 0) {
  return {
    phase: "active" as const,
    round: 1,
    turnIndex,
    turnOrder: ["player-1", "enemy-1", "npc-1"],
    combatants: {
      "player-1": {
        id: "player-1",
        name: "Thorin",
        type: "player",
        playerId: "test-user-id",
        initiative: 18,
        initiativeModifier: 2,
        speed: { walk: 30 },
        movementUsed: 0,
        position: { x: 2, y: 3 },
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
        position: { x: 5, y: 3 },
        size: "medium",
        maxHP: 12,
        currentHP: 12,
        armorClass: 13,
        conditions: [],
      },
      "npc-1": {
        id: "npc-1",
        name: "Guard",
        type: "npc",
        initiative: 10,
        initiativeModifier: 1,
        speed: { walk: 30 },
        movementUsed: 0,
        position: { x: 2, y: 5 },
        size: "medium",
        maxHP: 20,
        currentHP: 20,
        armorClass: 16,
        conditions: [],
      },
    },
  };
}

function buildCharacterUpdate(playerName: string, charName: string) {
  return {
    type: "server:character_updated",
    playerName,
    character: {
      static: {
        name: charName,
        race: "Dwarf",
        classes: [{ name: "Fighter", level: 5 }],
        abilities: {
          strength: 18,
          dexterity: 14,
          constitution: 16,
          intelligence: 10,
          wisdom: 12,
          charisma: 8,
        },
        maxHP: 44,
        armorClass: 18,
        proficiencyBonus: 3,
        speed: { walk: 25 },
        features: [],
        classResources: [],
        proficiencies: { armor: [], weapons: [], tools: [], other: [] },
        skills: [],
        savingThrows: [],
        senses: [],
        languages: ["Common", "Dwarvish"],
        spells: [],
        advantages: [],
        traits: {},
        importedAt: Date.now(),
      },
      dynamic: {
        currentHP: 44,
        tempHP: 0,
        spellSlotsUsed: [],
        pactMagicSlots: [],
        resourcesUsed: {},
        conditions: [],
        deathSaves: { successes: 0, failures: 0 },
        inventory: [],
        currency: { cp: 0, sp: 0, gp: 100, pp: 0 },
      },
    },
  };
}

function buildCombatUpdate(combat: ReturnType<typeof buildCombat>) {
  return {
    type: "server:combat_update",
    combat,
    map: buildMockMap(),
    timestamp: Date.now(),
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

test.describe("End Turn", () => {
  test("End Turn button visible on player turn, hidden otherwise", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "TurnHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    // Broadcast character so BattleMap knows our character name
    bridge.broadcast(buildCharacterUpdate("TurnHost", "Thorin") as Record<string, unknown>);

    // Broadcast combat with player first (turnIndex=0 → player's turn)
    bridge.broadcast(buildCombatUpdate(buildCombat(0)) as Record<string, unknown>);

    // End Turn button should be visible
    const endTurnBtn = page.getByRole("button", { name: "End Turn" });
    await expect(endTurnBtn).toBeVisible({ timeout: 8_000 });

    // "Your turn" banner should be visible
    await expect(page.getByText("Your turn")).toBeVisible();

    // Broadcast combat with enemy first (turnIndex=1 → enemy's turn)
    bridge.broadcast(buildCombatUpdate(buildCombat(1)) as Record<string, unknown>);

    // End Turn button should be gone (not player's turn)
    await expect(endTurnBtn).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Your turn")).not.toBeVisible();

    bridge.disconnect();
  });

  test("clicking End Turn sends client:end_turn message", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "TurnSend");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    bridge.broadcast(buildCharacterUpdate("TurnSend", "Thorin") as Record<string, unknown>);
    bridge.broadcast(buildCombatUpdate(buildCombat(0)) as Record<string, unknown>);

    // Set up a spy to capture outgoing WebSocket messages from the browser
    await page.evaluate(() => {
      const messages: string[] = [];
      (window as any).__sentMessages = messages;

      const origSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function (
        data: string | ArrayBufferLike | Blob | ArrayBufferView,
      ) {
        if (typeof data === "string") {
          messages.push(data);
        }
        return origSend.call(this, data);
      };
    });

    const endTurnBtn = page.getByRole("button", { name: "End Turn" });
    await expect(endTurnBtn).toBeVisible({ timeout: 8_000 });
    await endTurnBtn.click();

    // Check that client:end_turn was sent via the real WebSocket
    const sent = await page.evaluate(() => {
      return (window as any).__sentMessages as string[];
    });

    const endTurnMsg = sent.find((m) => {
      try {
        const parsed = JSON.parse(m);
        return parsed.type === "client:end_turn";
      } catch {
        return false;
      }
    });

    expect(endTurnMsg).toBeDefined();

    bridge.disconnect();
  });

  test("turn advances when combat_update with new turnIndex is received", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "TurnAdv");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    bridge.broadcast(buildCharacterUpdate("TurnAdv", "Thorin") as Record<string, unknown>);

    // Start with player's turn
    bridge.broadcast(buildCombatUpdate(buildCombat(0)) as Record<string, unknown>);

    await expect(page.getByText("Your turn")).toBeVisible({ timeout: 8_000 });

    // Simulate server advancing to enemy's turn (turnIndex=1)
    bridge.broadcast(buildCombatUpdate(buildCombat(1)) as Record<string, unknown>);

    // "Your turn" banner and End Turn button should disappear
    await expect(page.getByText("Your turn")).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: "End Turn" })).not.toBeVisible();

    // Simulate server advancing past NPC back to player (turnIndex=0, round 2)
    const round2Combat = buildCombat(0);
    round2Combat.round = 2;
    bridge.broadcast(buildCombatUpdate(round2Combat) as Record<string, unknown>);

    // Player's turn again
    await expect(page.getByText("Your turn")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: "End Turn" })).toBeVisible();

    bridge.disconnect();
  });

  test("End Turn button shows alongside movement info", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "TurnInfo");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);
    await bridge.connect(roomCode);
    startStory(bridge);

    bridge.broadcast(buildCharacterUpdate("TurnInfo", "Thorin") as Record<string, unknown>);

    // Player has 10ft of movement used (20ft remaining out of 30)
    const combat = buildCombat(0);
    (combat.combatants["player-1"] as any).movementUsed = 10;
    (combat.combatants["player-1"] as any).speed = { walk: 30 };

    bridge.broadcast(buildCombatUpdate(combat) as Record<string, unknown>);

    // Both the movement remaining text and End Turn button should be visible
    await expect(page.getByText("20ft remaining")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: "End Turn" })).toBeVisible();

    bridge.disconnect();
  });
});
