/**
 * Shared test infrastructure for MCP bridge unit tests.
 *
 * Infrastructure: GSM factory, character registration, assertion helpers.
 * Character fixtures live in ./fixtures.ts — re-exported here for convenience.
 *
 * Exports:
 *   createTestGSM()            — GSM + broadcast spy + real queue + real CampaignManager
 *   registerCharacter()        — convenience: set gsm.characters[name] + playerNames
 *   assertToolSuccess()        — assert result is a non-error ToolResponse
 *   assertToolError()          — assert result is an error ToolResponse
 *
 * Re-exported from fixtures.ts:
 *   createFighterCharacter()   — Level 5 Fighter "Theron"
 *   createClericCharacter()    — Level 5 Cleric "Brynn"
 *   createWarlockCharacter()   — Level 5 Warlock "Zara"
 *   createBarbarianCharacter() — Level 5 Barbarian "Gruk"
 *   createMulticlassCharacter()— Level 5 Cleric 3 / Warlock 2 "Selene"
 */

import { expect } from "vitest";
import type { CharacterData } from "@unseen-servant/shared/types";
import type { ServerMessage } from "@unseen-servant/shared/types";
import { serverMessageSchema } from "@unseen-servant/shared/schemas";
import { GameStateManager } from "../services/game-state-manager.js";
import type { ToolResponse } from "../services/game-state-manager.js";
import { MessageQueue } from "../message-queue.js";
import { CampaignManager } from "../services/campaign-manager.js";

// Re-export all character fixtures for backward compatibility
export {
  createFighterCharacter,
  createClericCharacter,
  createWarlockCharacter,
  createBarbarianCharacter,
  createMulticlassCharacter,
} from "./fixtures.js";

// ---------------------------------------------------------------------------
// createTestGSM
// ---------------------------------------------------------------------------

export interface TestGSM {
  gsm: GameStateManager;
  broadcasts: ServerMessage[];
  messageQueue: MessageQueue;
  campaignManager: CampaignManager;
}

/**
 * Create a GameStateManager wired to a broadcast spy, a real MessageQueue, and
 * a real CampaignManager.  No mocking required — keep this as real as possible
 * so integration bugs surface in tests rather than in production.
 */
export function createTestGSM(): TestGSM {
  const broadcasts: ServerMessage[] = [];
  const messageQueue = new MessageQueue();
  const campaignManager = new CampaignManager();

  const gsm = new GameStateManager({
    broadcast: (msg: ServerMessage) => {
      serverMessageSchema.parse(msg);
      broadcasts.push(msg);
    },
    messageQueue,
    campaignManager,
  });

  return { gsm, broadcasts, messageQueue, campaignManager };
}

// ---------------------------------------------------------------------------
// registerCharacter
// ---------------------------------------------------------------------------

/**
 * Register a character in the GSM, adding the player name to playerNames if
 * not already present.  Directly mutates GSM public fields as the production
 * code does when a player joins with a character.
 */
export function registerCharacter(
  gsm: GameStateManager,
  playerName: string,
  char: CharacterData,
): void {
  gsm.characters[playerName] = char;
  if (!gsm.playerNames.includes(playerName)) {
    gsm.playerNames.push(playerName);
  }
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/**
 * Assert that a ToolResponse represents a successful operation:
 * - error is falsy
 * - text is a non-empty string
 * - data exists
 */
export function assertToolSuccess(result: ToolResponse): void {
  expect(result.error, `Expected success but got error: ${result.text}`).toBeFalsy();
  expect(result.text, "Expected non-empty text in success response").toBeTruthy();
  expect(typeof result.text).toBe("string");
  expect(result.text.length).toBeGreaterThan(0);
  expect(result.data, "Expected data object in success response").toBeDefined();
}

/**
 * Assert that a ToolResponse represents a failed operation:
 * - error is true
 * - text is a non-empty string describing the problem
 */
export function assertToolError(result: ToolResponse): void {
  expect(result.error, `Expected error=true but error was falsy. text: ${result.text}`).toBe(true);
  expect(result.text, "Expected non-empty text in error response").toBeTruthy();
  expect(typeof result.text).toBe("string");
  expect(result.text.length).toBeGreaterThan(0);
}
