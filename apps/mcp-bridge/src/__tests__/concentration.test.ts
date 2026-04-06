import { describe, it, expect, beforeEach } from "vitest";
import {
  createTestGSM,
  createClericCharacter,
  registerCharacter,
  assertToolSuccess,
  assertToolError,
} from "./setup.js";
import type { GameStateManager } from "../services/game-state-manager.js";

/**
 * Behavioral contracts for concentration methods on GameStateManager.
 *
 * ## setConcentration(targetName, spellName)
 * - Checks NPC combatants first (type !== "player"), then player characters.
 * - For NPCs: sets combatant.concentratingOn = { spellName, since: combat.round }.
 *   If previously concentrating on something else, the old entry is overwritten
 *   (auto-breaks previous concentration silently).
 * - For player characters: sets char.dynamic.concentratingOn = { spellName,
 *   since: combat?.round } — since is undefined if no active combat.
 * - Does NOT create a GameEvent (no createEvent call in implementation).
 * - Broadcasts server:combat_update (NPC) or server:character_updated (player).
 * - Response text distinguishes between "now concentrating" and "breaks X, now
 *   concentrating on Y".
 * - Returns data: { target, spell, previousSpell (null if none) }.
 * - Returns error ToolResponse when targetName is not found.
 *
 * ## breakConcentration(targetName)
 * - Checks NPC combatants first, then player characters.
 * - For NPCs: if not concentrating, returns non-error ToolResponse with spell=null.
 *   Does NOT return error=true in this case.
 * - For player characters: same — returns non-error with spell=null if not
 *   concentrating.
 * - On break: sets concentratingOn=undefined.
 * - Does NOT create a GameEvent.
 * - Broadcasts server:combat_update (NPC) or server:character_updated (player).
 * - Returns data: { target, spell (the spell that was broken, or null) }.
 * - Returns error ToolResponse when targetName is not found.
 */

let gsm: GameStateManager;

beforeEach(() => {
  const t = createTestGSM();
  gsm = t.gsm;
  registerCharacter(gsm, "Player1", createClericCharacter());
});

describe("setConcentration", () => {
  describe("sets concentration on a new spell for a player character", () => {
    it("sets concentratingOn.spellName on the character's dynamic data", () => {
      gsm.setConcentration("Brynn", "Bless");
      expect(gsm.characters["Player1"].dynamic.concentratingOn?.spellName).toBe("Bless");
    });

    it("returns a success ToolResponse with spell matching the spell name", () => {
      const result = gsm.setConcentration("Brynn", "Bless");
      assertToolSuccess(result);
      expect((result.data as { spell: string }).spell).toBe("Bless");
      expect((result.data as { target: string }).target).toBe("Brynn");
    });

    it("returns previousSpell=null when no prior concentration", () => {
      const result = gsm.setConcentration("Brynn", "Bless");
      expect((result.data as { previousSpell: string | null }).previousSpell).toBeNull();
    });

    it("response text says 'now concentrating on' when no prior concentration", () => {
      const result = gsm.setConcentration("Brynn", "Bless");
      expect(result.text).toContain("now concentrating on");
      expect(result.text).not.toContain("breaks concentration");
    });

    it("broadcasts server:character_updated", () => {
      const t = createTestGSM();
      registerCharacter(t.gsm, "Player1", createClericCharacter());
      t.gsm.setConcentration("Brynn", "Bless");
      const update = t.broadcasts.find((b) => b.type === "server:character_updated");
      expect(update).toBeDefined();
    });
  });

  describe("overwrites previous concentration for a player (auto-break)", () => {
    it("replaces the old spell with the new one", () => {
      gsm.setConcentration("Brynn", "Bless");
      gsm.setConcentration("Brynn", "Spirit Guardians");
      expect(gsm.characters["Player1"].dynamic.concentratingOn?.spellName).toBe("Spirit Guardians");
    });

    it("returns previousSpell equal to the old spell name", () => {
      gsm.setConcentration("Brynn", "Bless");
      const result = gsm.setConcentration("Brynn", "Spirit Guardians");
      expect((result.data as { previousSpell: string | null }).previousSpell).toBe("Bless");
    });

    it("response text mentions 'breaks concentration on' the previous spell", () => {
      gsm.setConcentration("Brynn", "Bless");
      const result = gsm.setConcentration("Brynn", "Spirit Guardians");
      expect(result.text).toContain("breaks concentration on");
      expect(result.text).toContain("Bless");
      expect(result.text).toContain("Spirit Guardians");
    });
  });

  describe("since is undefined when no active combat for player", () => {
    it("stores since=undefined on concentratingOn when no combat is active", () => {
      gsm.setConcentration("Brynn", "Bless");
      expect(gsm.characters["Player1"].dynamic.concentratingOn?.since).toBeUndefined();
    });
  });

  describe("target not found — error", () => {
    it("returns an error ToolResponse for an unknown target name", () => {
      const result = gsm.setConcentration("Zxqlorp", "Fireball");
      assertToolError(result);
    });

    it("error response text includes the unknown target name", () => {
      const result = gsm.setConcentration("Zxqlorp", "Fireball");
      expect(result.text).toContain("Zxqlorp");
    });
  });
});

describe("breakConcentration", () => {
  describe("clears concentratingOn for a player character", () => {
    it("sets concentratingOn to undefined after breaking", () => {
      gsm.setConcentration("Brynn", "Bless");
      gsm.breakConcentration("Brynn");
      expect(gsm.characters["Player1"].dynamic.concentratingOn).toBeUndefined();
    });

    it("returns a success ToolResponse with the name of the broken spell", () => {
      gsm.setConcentration("Brynn", "Bless");
      const result = gsm.breakConcentration("Brynn");
      assertToolSuccess(result);
      expect((result.data as { spell: string }).spell).toBe("Bless");
      expect((result.data as { target: string }).target).toBe("Brynn");
    });

    it("response text mentions 'lost concentration on' the spell", () => {
      gsm.setConcentration("Brynn", "Bless");
      const result = gsm.breakConcentration("Brynn");
      expect(result.text).toContain("lost concentration on");
      expect(result.text).toContain("Bless");
    });

    it("broadcasts server:character_updated", () => {
      const t = createTestGSM();
      registerCharacter(t.gsm, "Player1", createClericCharacter());
      t.gsm.setConcentration("Brynn", "Bless");
      const countBefore = t.broadcasts.length;
      t.gsm.breakConcentration("Brynn");
      const update = t.broadcasts
        .slice(countBefore)
        .find((b) => b.type === "server:character_updated");
      expect(update).toBeDefined();
    });
  });

  describe("not concentrating — non-error response with spell=null", () => {
    it("returns a non-error ToolResponse when player is not concentrating", () => {
      const result = gsm.breakConcentration("Brynn");
      assertToolSuccess(result);
    });

    it("data.spell is null when player is not concentrating", () => {
      const result = gsm.breakConcentration("Brynn");
      expect((result.data as { spell: string | null }).spell).toBeNull();
    });

    it("response text says 'not concentrating on anything'", () => {
      const result = gsm.breakConcentration("Brynn");
      expect(result.text).toContain("not concentrating on anything");
    });
  });

  describe("target not found — error", () => {
    it("returns an error ToolResponse for an unknown target name", () => {
      const result = gsm.breakConcentration("Zxqlorp");
      assertToolError(result);
    });

    it("error response text includes the unknown target name", () => {
      const result = gsm.breakConcentration("Zxqlorp");
      expect(result.text).toContain("Zxqlorp");
    });
  });
});
