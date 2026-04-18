import { describe, it, expect } from "vitest";
import { clientMessageSchema, serverMessageSchema } from "../schemas/messages.js";

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const minimalBuilderState = {
  species: "Human",
  speciesChoices: {},
  background: null,
  backgroundChoices: {},
  abilityScoreMode: "two-one" as const,
  abilityScoreAssignments: {},
  classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
  abilityMethod: "manual" as const,
  baseAbilities: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  featSelections: [],
  featChoices: {},
  cantrips: {},
  preparedSpells: {},
  name: "Test",
  appearance: {},
  backstory: "",
  alignment: "",
};

const minimalCharacter = {
  builder: minimalBuilderState,
  static: {
    name: "Test",
    race: "Human",
    classes: [{ name: "Fighter", level: 1 }],
    abilities: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    features: [],
    languages: [],
    spells: [],
    traits: {},
    importedAt: Date.now(),
    effects: [],
  },
  dynamic: {
    currentHP: 10,
    tempHP: 0,
    spellSlotsUsed: [],
    conditions: [],
    deathSaves: { successes: 0, failures: 0 },
    inventory: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    heroicInspiration: false,
  },
};

// rollResultSchema requires: id, rolls, modifier, total, label
const minimalRoll = {
  id: "roll-1",
  rolls: [{ die: 20 as const, result: 15 }],
  modifier: 0,
  total: 15,
  label: "Attack",
};

// gameStateSchema requires: encounter, eventLog, pacingProfile, encounterLength
const minimalGameState = {
  encounter: null,
  eventLog: [],
  pacingProfile: "balanced" as const,
  encounterLength: "standard" as const,
};

// gameEventSchema requires: id, type, timestamp, description, stateBefore, conversationIndex, changes
const minimalGameEvent = {
  id: "evt1",
  type: "damage" as const,
  timestamp: 1,
  description: "Goblin takes 5 damage",
  stateBefore: {
    characters: {},
  },
  conversationIndex: 0,
  changes: [],
};

// checkRequestSchema requires: id, targetCharacter, reason, notation
const minimalCheckRequest = {
  id: "ck1",
  checkType: "perception",
  targetCharacter: "Theron",
  dc: 15,
  reason: "Listen",
  notation: "1d20+5",
};

// checkResultSchema uses: requestId (not checkRequestId), roll, characterName
const minimalCheckResult = {
  requestId: "ck1",
  roll: minimalRoll,
  success: true,
  characterName: "Theron",
};

// ─── Client message payloads ──────────────────────────────────────────────────

const clientPayloads = [
  { type: "client:chat", content: "hello", playerName: "Alice" },
  { type: "client:join", playerName: "Alice", roomCode: "ABC123" },
  { type: "client:dm_response", requestId: "r1", text: "The goblin attacks" },
  { type: "client:dm_config", provider: "claude", supportsTools: true },
  // clientSetCampaignSchema: campaignSlug is optional — send without to exercise minimal path
  { type: "client:set_campaign" },
  {
    type: "client:campaign_loaded",
    campaignSlug: "lm",
    campaignName: "Lost Mines",
    sessionCount: 1,
  },
  { type: "client:story_started" },
  {
    type: "client:configure_campaign",
    campaignName: "Test",
    pacingProfile: "balanced",
    encounterLength: "standard",
  },
  {
    type: "client:campaign_configured_ack",
    campaignSlug: "lm",
    campaignName: "Lost Mines",
    pacingProfile: "balanced",
    encounterLength: "standard",
  },
  { type: "client:set_password", password: "secret" },
  { type: "client:kick_player", playerName: "Bob" },
  { type: "client:set_character", character: minimalCharacter },
  { type: "client:start_story" },
  { type: "client:roll_dice", checkRequestId: "ck1" },
  { type: "client:combat_action", action: "I attack the goblin" },
  { type: "client:move_token", to: { x: 3, y: 5 } },
  { type: "client:rollback", eventId: "evt1" },
  { type: "client:set_system_prompt", prompt: "Be dramatic" },
  { type: "client:set_pacing", profile: "balanced", encounterLength: "standard" },
  { type: "client:dm_override", characterName: "Theron", changes: [] },
  { type: "client:end_turn" },
  { type: "client:destroy_room" },
  { type: "client:typing", isTyping: true },
  { type: "client:save_notes", content: "My notes" },
  {
    type: "client:broadcast",
    payload: { type: "server:system", content: "test", timestamp: 1 },
  },
  { type: "client:action_result", requestId: "r1" },
  { type: "client:dm_dice_roll", roll: minimalRoll },
  {
    type: "client:dm_check_request",
    targetCharacter: "Theron",
    reason: "Perception check",
    notation: "1d20+5",
  },
  {
    type: "client:dm_check_result",
    checkRequestId: "ck1",
    roll: minimalRoll,
    characterName: "Theron",
    playerName: "Alice",
  },
];

// ─── Server message payloads ──────────────────────────────────────────────────

const serverPayloads = [
  {
    type: "server:chat",
    content: "hello",
    playerName: "Alice",
    timestamp: 1,
    id: "m1",
  },
  { type: "server:ai", content: "The dragon roars", timestamp: 1, id: "m2" },
  { type: "server:system", content: "Player joined", timestamp: 1 },
  {
    type: "server:room_joined",
    roomCode: "ABC123",
    players: ["Alice"],
    hostName: "Alice",
    dmConnected: false,
  },
  {
    type: "server:player_joined",
    playerName: "Bob",
    players: ["Alice", "Bob"],
    hostName: "Alice",
  },
  {
    type: "server:player_left",
    playerName: "Bob",
    players: ["Alice"],
    hostName: "Alice",
  },
  { type: "server:error", message: "Not found", code: "ROOM_NOT_FOUND" },
  { type: "server:kicked", reason: "Host kicked you" },
  {
    type: "server:character_updated",
    playerName: "Alice",
    character: minimalCharacter,
  },
  { type: "server:combat_update", combat: null, timestamp: 1 },
  { type: "server:game_state_sync", gameState: minimalGameState },
  {
    type: "server:check_request",
    check: minimalCheckRequest,
    timestamp: 1,
    id: "cr1",
  },
  {
    type: "server:check_result",
    result: minimalCheckResult,
    timestamp: 1,
    id: "cr2",
  },
  {
    type: "server:dice_roll",
    roll: minimalRoll,
    playerName: "Alice",
    timestamp: 1,
    id: "dr1",
  },
  {
    type: "server:rollback",
    toEventId: "evt1",
    gameState: minimalGameState,
    characterUpdates: {},
    timestamp: 1,
  },
  { type: "server:event_log", event: minimalGameEvent },
  {
    type: "server:dm_request",
    requestId: "r1",
    systemPrompt: "You are a DM",
    messages: [{ role: "user", content: "I open the door" }],
  },
  { type: "server:dm_config_update", provider: "claude", supportsTools: true },
  {
    type: "server:campaign_loaded",
    campaignSlug: "lm",
    campaignName: "Lost Mines",
    sessionCount: 1,
  },
  {
    type: "server:campaign_configured",
    campaignName: "Lost Mines",
    campaignSlug: "lm",
    pacingProfile: "balanced",
    encounterLength: "standard",
  },
  {
    type: "server:character_for_campaign",
    playerName: "Alice",
    character: minimalCharacter,
  },
  {
    type: "server:dm_roll_request",
    checkRequestId: "ck1",
    playerName: "Alice",
  },
  {
    type: "server:player_action",
    playerName: "Alice",
    action: { type: "client:chat", content: "hi", playerName: "Alice" },
    requestId: "r1",
  },
  { type: "server:room_destroyed" },
  { type: "server:typing", playerName: "Alice", isTyping: true },
  { type: "server:player_notes_loaded", content: "My notes" },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("clientMessageSchema", () => {
  describe("accepts valid messages", () => {
    it.each(clientPayloads)("$type", (payload) => {
      expect(() => clientMessageSchema.parse(payload)).not.toThrow();
    });
  });

  describe("rejects malformed messages", () => {
    it("missing type field", () => {
      expect(() => clientMessageSchema.parse({ content: "hello", playerName: "Alice" })).toThrow();
    });

    it("unknown type literal", () => {
      expect(() =>
        clientMessageSchema.parse({ type: "client:unknown_action", content: "hi" }),
      ).toThrow();
    });

    it("client:chat with empty content", () => {
      expect(() =>
        clientMessageSchema.parse({ type: "client:chat", content: "", playerName: "Alice" }),
      ).toThrow();
    });

    it("client:chat missing playerName", () => {
      expect(() => clientMessageSchema.parse({ type: "client:chat", content: "hello" })).toThrow();
    });

    it("client:join with 5-char roomCode (must be length 6)", () => {
      expect(() =>
        clientMessageSchema.parse({
          type: "client:join",
          playerName: "Alice",
          roomCode: "ABC12",
        }),
      ).toThrow();
    });

    it("client:chat with playerName as number", () => {
      expect(() =>
        clientMessageSchema.parse({ type: "client:chat", content: "hi", playerName: 123 }),
      ).toThrow();
    });

    it("client:move_token with non-integer coordinates", () => {
      expect(() =>
        clientMessageSchema.parse({ type: "client:move_token", to: { x: 1.5, y: 2 } }),
      ).toThrow();
    });
  });
});

describe("serverMessageSchema", () => {
  describe("accepts valid messages", () => {
    it.each(serverPayloads)("$type", (payload) => {
      expect(() => serverMessageSchema.parse(payload)).not.toThrow();
    });
  });

  describe("rejects malformed messages", () => {
    it("missing type field", () => {
      expect(() =>
        serverMessageSchema.parse({ content: "hello", playerName: "Alice", timestamp: 1 }),
      ).toThrow();
    });

    it("unknown type literal", () => {
      expect(() => serverMessageSchema.parse({ type: "server:unknown", content: "hi" })).toThrow();
    });

    it("server:combat_update missing timestamp", () => {
      expect(() =>
        serverMessageSchema.parse({ type: "server:combat_update", combat: null }),
      ).toThrow();
    });

    it("server:chat with playerName as number", () => {
      expect(() =>
        serverMessageSchema.parse({
          type: "server:chat",
          content: "hello",
          playerName: 42,
          timestamp: 1,
          id: "m1",
        }),
      ).toThrow();
    });

    it("server:game_state_sync missing required gameState fields", () => {
      // gameState requires pacingProfile and encounterLength — omit them
      expect(() =>
        serverMessageSchema.parse({
          type: "server:game_state_sync",
          gameState: { encounter: null, eventLog: [] },
        }),
      ).toThrow();
    });
  });
});
