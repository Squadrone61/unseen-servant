import { describe, it, expect, beforeEach } from "vitest";
import {
  createTestGSM,
  createFighterCharacter,
  registerCharacter,
  assertToolSuccess,
  assertToolError,
} from "./setup.js";
import type { GameStateManager } from "../services/game-state-manager.js";

/**
 * Behavioral contracts for Heroic Inspiration methods on GameStateManager.
 *
 * ## grantInspiration(characterName)
 * - Searches this.characters case-insensitively.
 * - If char.dynamic.heroicInspiration is already true: returns a non-error ToolResponse
 *   indicating the character already has inspiration (hasInspiration=true in data).
 *   No GameEvent is created, no broadcast is sent.
 * - Otherwise: sets char.dynamic.heroicInspiration=true.
 *   Creates an "inspiration_granted" GameEvent.
 *   Broadcasts server:character_updated.
 *   Returns data: { character, hasInspiration: true }.
 * - Returns error ToolResponse when characterName is not found.
 *
 * ## useInspiration(characterName)
 * - Searches this.characters case-insensitively.
 * - If char.dynamic.heroicInspiration is false or undefined: returns error ToolResponse
 *   (error=true) with hint to grant inspiration first.
 * - Otherwise: sets char.dynamic.heroicInspiration=false.
 *   Creates an "inspiration_used" GameEvent.
 *   Broadcasts server:character_updated.
 *   Returns data: { character, hasInspiration: false }.
 * - Returns error ToolResponse when characterName is not found.
 */

let gsm: GameStateManager;

beforeEach(() => {
  const t = createTestGSM();
  gsm = t.gsm;
  registerCharacter(gsm, "Player1", createFighterCharacter());
});

describe("grantInspiration", () => {
  describe("grants inspiration when character does not have it", () => {
    it("sets heroicInspiration to true on the character", () => {
      gsm.grantInspiration("Theron");
      expect(gsm.characters["Player1"].dynamic.heroicInspiration).toBe(true);
    });

    it("returns a success ToolResponse with hasInspiration=true", () => {
      const result = gsm.grantInspiration("Theron");
      assertToolSuccess(result);
      expect((result.data as { hasInspiration: boolean }).hasInspiration).toBe(true);
      expect((result.data as { character: string }).character).toBe("Theron");
    });

    it("broadcasts server:character_updated", () => {
      const { broadcasts } = (() => {
        const t = createTestGSM();
        registerCharacter(t.gsm, "Player1", createFighterCharacter());
        t.gsm.grantInspiration("Theron");
        return t;
      })();
      const update = broadcasts.find((b) => b.type === "server:character_updated");
      expect(update).toBeDefined();
    });
  });

  describe("idempotent — non-error response when character already inspired", () => {
    it("returns a non-error ToolResponse when already inspired", () => {
      gsm.characters["Player1"].dynamic.heroicInspiration = true;
      const result = gsm.grantInspiration("Theron");
      assertToolSuccess(result);
      expect((result.data as { hasInspiration: boolean }).hasInspiration).toBe(true);
    });

    it("does not change heroicInspiration from true when already set", () => {
      gsm.characters["Player1"].dynamic.heroicInspiration = true;
      gsm.grantInspiration("Theron");
      expect(gsm.characters["Player1"].dynamic.heroicInspiration).toBe(true);
    });
  });

  describe("character not found — error", () => {
    it("returns an error ToolResponse for an unknown character name", () => {
      const result = gsm.grantInspiration("Zxqlorp");
      assertToolError(result);
    });

    it("error response text includes the unknown character name", () => {
      const result = gsm.grantInspiration("Zxqlorp");
      expect(result.text).toContain("Zxqlorp");
    });
  });
});

describe("useInspiration", () => {
  describe("spends inspiration when character has it", () => {
    it("sets heroicInspiration to false on the character", () => {
      gsm.characters["Player1"].dynamic.heroicInspiration = true;
      gsm.useInspiration("Theron");
      expect(gsm.characters["Player1"].dynamic.heroicInspiration).toBe(false);
    });

    it("returns a success ToolResponse with hasInspiration=false", () => {
      gsm.characters["Player1"].dynamic.heroicInspiration = true;
      const result = gsm.useInspiration("Theron");
      assertToolSuccess(result);
      expect((result.data as { hasInspiration: boolean }).hasInspiration).toBe(false);
      expect((result.data as { character: string }).character).toBe("Theron");
    });

    it("broadcasts server:character_updated", () => {
      const t = createTestGSM();
      registerCharacter(t.gsm, "Player1", createFighterCharacter());
      t.gsm.characters["Player1"].dynamic.heroicInspiration = true;
      t.gsm.useInspiration("Theron");
      const update = t.broadcasts.find((b) => b.type === "server:character_updated");
      expect(update).toBeDefined();
    });
  });

  describe("error when character does not have inspiration", () => {
    it("returns an error ToolResponse when heroicInspiration is false", () => {
      gsm.characters["Player1"].dynamic.heroicInspiration = false;
      const result = gsm.useInspiration("Theron");
      assertToolError(result);
    });

    it("returns an error ToolResponse when heroicInspiration is undefined", () => {
      gsm.characters["Player1"].dynamic.heroicInspiration = undefined;
      const result = gsm.useInspiration("Theron");
      assertToolError(result);
    });

    it("error data has hasInspiration=false", () => {
      gsm.characters["Player1"].dynamic.heroicInspiration = false;
      const result = gsm.useInspiration("Theron");
      expect((result.data as { hasInspiration: boolean }).hasInspiration).toBe(false);
    });

    it("does not modify heroicInspiration when there is none to spend", () => {
      gsm.characters["Player1"].dynamic.heroicInspiration = false;
      gsm.useInspiration("Theron");
      expect(gsm.characters["Player1"].dynamic.heroicInspiration).toBe(false);
    });
  });

  describe("character not found — error", () => {
    it("returns an error ToolResponse for an unknown character name", () => {
      const result = gsm.useInspiration("Zxqlorp");
      assertToolError(result);
    });

    it("error response text includes the unknown character name", () => {
      const result = gsm.useInspiration("Zxqlorp");
      expect(result.text).toContain("Zxqlorp");
    });
  });
});
