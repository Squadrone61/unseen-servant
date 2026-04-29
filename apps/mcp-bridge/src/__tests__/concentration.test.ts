import { describe, it, expect, beforeEach } from "vitest";
import {
  createTestGSM,
  createClericCharacter,
  createFighterCharacter,
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

// ---------------------------------------------------------------------------
// applied_targets — propagation of concentration spell effects to named targets
// ---------------------------------------------------------------------------
//
// Bug regression coverage for set_concentration applied_targets — Bless/Bane
// and similar single-target buffs/debuffs must land on each named target with
// a sourceTracked tag (kind: "spell"), surface in the resolver, and be swept off cleanly
// when the caster's concentration ends or is replaced.

describe("setConcentration with applied_targets — Bless propagation", () => {
  beforeEach(() => {
    const t = createTestGSM();
    gsm = t.gsm;
    registerCharacter(gsm, "P1", createClericCharacter()); // Brynn (Cleric)
    registerCharacter(gsm, "P2", createFighterCharacter()); // Theron (Fighter)
    gsm.updateBattleMap({ id: "map1", width: 10, height: 10, tiles: [], name: "Arena" });
    gsm.startCombat([
      {
        name: "Goblin",
        type: "npc" as const,
        initiativeModifier: 2,
        maxHP: 7,
        armorClass: 15,
      },
    ]);
  });

  it("places a sourceTracked spell bundle on each named PC target", () => {
    const r = gsm.setConcentration("Brynn", "Bless", ["Brynn", "Theron"]);
    assertToolSuccess(r);
    const cleric = gsm.characters["P1"];
    const fighter = gsm.characters["P2"];
    const clericBundle = (cleric.dynamic.activeEffects ?? []).find(
      (b) =>
        b.sourceTracked?.identifier.kind === "spell" &&
        b.sourceTracked.identifier.name.toLowerCase() === "bless",
    );
    const fighterBundle = (fighter.dynamic.activeEffects ?? []).find(
      (b) =>
        b.sourceTracked?.identifier.kind === "spell" &&
        b.sourceTracked.identifier.name.toLowerCase() === "bless",
    );
    expect(clericBundle).toBeDefined();
    expect(fighterBundle).toBeDefined();
    expect(clericBundle?.sourceTracked?.caster.toLowerCase()).toBe("brynn");
  });

  it("places a sourceTracked spell bundle on a named NPC combatant target", () => {
    const r = gsm.setConcentration("Brynn", "Bless", ["Goblin"]);
    assertToolSuccess(r);
    const combat = gsm.gameState.encounter?.combat;
    const goblin = Object.values(combat!.combatants).find((c) => c.name === "Goblin");
    const bundle = (goblin?.activeEffects ?? []).find(
      (b) =>
        b.sourceTracked?.identifier.kind === "spell" &&
        b.sourceTracked.identifier.name.toLowerCase() === "bless",
    );
    expect(bundle).toBeDefined();
  });

  it("Bless target bundle carries the +1d4 attack and save modifiers", () => {
    gsm.setConcentration("Brynn", "Bless", ["Theron"]);
    const fighter = gsm.characters["P2"];
    // The new architecture pushes BOTH a tracked_by marker bundle and the
    // outcome bundle (carrying the +1d4 modifiers). Pull the outcome bundle.
    const bundle = (fighter.dynamic.activeEffects ?? []).find((b) =>
      b.id.startsWith("spell-target:bless:"),
    );
    expect(bundle).toBeDefined();
    const targets = (bundle?.effects.modifiers ?? []).map((m) => m.target);
    expect(targets).toContain("attack");
    expect(targets).toContain("save");
  });

  it("response text reports applied targets for Bless", () => {
    const r = gsm.setConcentration("Brynn", "Bless", ["Brynn", "Theron"]);
    expect(r.text).toContain("Applied to");
    expect(r.text).toContain("Brynn");
    expect(r.text).toContain("Theron");
  });

  it("response data lists appliedTargets and empty missingTargets on success", () => {
    const r = gsm.setConcentration("Brynn", "Bless", ["Brynn", "Theron"]);
    const data = r.data as {
      appliedTargets: string[];
      missingTargets: Array<{ name: string; reason: string }>;
    };
    expect(data.appliedTargets).toEqual(expect.arrayContaining(["Brynn", "Theron"]));
    expect(data.missingTargets).toEqual([]);
  });

  it("breakConcentration sweeps Bless target bundles off every named target", () => {
    gsm.setConcentration("Brynn", "Bless", ["Brynn", "Theron", "Goblin"]);
    gsm.breakConcentration("Brynn");

    const cleric = gsm.characters["P1"];
    const fighter = gsm.characters["P2"];
    const combat = gsm.gameState.encounter?.combat;
    const goblin = Object.values(combat!.combatants).find((c) => c.name === "Goblin");

    const hasBundle = (
      effects?: Array<{
        sourceTracked?: { identifier: { kind: "spell" | "feature"; name: string } };
      }>,
    ) =>
      (effects ?? []).some(
        (b) =>
          b.sourceTracked?.identifier.kind === "spell" &&
          b.sourceTracked.identifier.name.toLowerCase() === "bless",
      );
    expect(hasBundle(cleric.dynamic.activeEffects)).toBe(false);
    expect(hasBundle(fighter.dynamic.activeEffects)).toBe(false);
    expect(hasBundle(goblin?.activeEffects)).toBe(false);
  });

  it("trims whitespace on target name lookup (defensive)", () => {
    const r = gsm.setConcentration("Brynn", "Bless", ["  Theron  "]);
    assertToolSuccess(r);
    const fighter = gsm.characters["P2"];
    const bundle = (fighter.dynamic.activeEffects ?? []).find(
      (b) =>
        b.sourceTracked?.identifier.kind === "spell" &&
        b.sourceTracked.identifier.name.toLowerCase() === "bless",
    );
    expect(bundle).toBeDefined();
  });
});

describe("setConcentration with applied_targets — Bane debuff", () => {
  beforeEach(() => {
    const t = createTestGSM();
    gsm = t.gsm;
    registerCharacter(gsm, "P1", createClericCharacter()); // Brynn (Cleric)
    gsm.updateBattleMap({ id: "map1", width: 10, height: 10, tiles: [], name: "Arena" });
    gsm.startCombat([
      {
        name: "Goblin",
        type: "npc" as const,
        initiativeModifier: 2,
        maxHP: 7,
        armorClass: 15,
      },
    ]);
  });

  it("does NOT place Bane modifiers on the caster's own bundle", () => {
    gsm.setConcentration("Brynn", "Bane", ["Goblin"]);
    const cleric = gsm.characters["P1"];
    const casterBundle = (cleric.dynamic.activeEffects ?? []).find((b) => b.id === "spell:bane");
    // The caster bundle (marker for concentration tracking) must not carry
    // attack/save modifiers — those belong on the target's bundle. Otherwise
    // the Cleric self-debuffs while concentrating on Bane.
    const targets = (casterBundle?.effects.modifiers ?? []).map((m) => m.target);
    expect(targets).not.toContain("attack");
    expect(targets).not.toContain("save");
  });

  it("places a sourceTracked spell bundle on the named target with negative attack modifier", () => {
    gsm.setConcentration("Brynn", "Bane", ["Goblin"]);
    const combat = gsm.gameState.encounter?.combat;
    const goblin = Object.values(combat!.combatants).find((c) => c.name === "Goblin");
    // Find the outcome bundle (carries the modifiers), not the marker.
    const bundle = (goblin?.activeEffects ?? []).find((b) => b.id.startsWith("spell-target:bane:"));
    expect(bundle).toBeDefined();
    const attackMods = bundle?.effects.modifiers?.filter(
      (m) => m.target === "attack" || m.target === "save",
    );
    expect(attackMods?.length).toBeGreaterThan(0);
  });
});

describe("setConcentration with applied_targets — strict no_target_effect error", () => {
  beforeEach(() => {
    const t = createTestGSM();
    gsm = t.gsm;
    registerCharacter(gsm, "P1", createClericCharacter()); // Brynn
    registerCharacter(gsm, "P2", createFighterCharacter()); // Theron
  });

  it("returns an error ToolResponse when applied_targets is given for a spell with no per-target effects", () => {
    // Silent Image is a concentration spell with no per-target buff/debuff.
    const r = gsm.setConcentration("Brynn", "Silent Image", ["Theron"]);
    assertToolError(r);
  });

  it("error text mentions that the spell has no per-target effects", () => {
    const r = gsm.setConcentration("Brynn", "Silent Image", ["Theron"]);
    expect(r.text.toLowerCase()).toMatch(/no.*target.*effect|cannot.*apply/);
  });

  it("does not create any target bundles when erroring", () => {
    gsm.setConcentration("Brynn", "Silent Image", ["Theron"]);
    const fighter = gsm.characters["P2"];
    const bundle = (fighter.dynamic.activeEffects ?? []).find(
      (b) =>
        b.sourceTracked?.identifier.kind === "spell" &&
        b.sourceTracked.identifier.name.toLowerCase() === "silent image",
    );
    expect(bundle).toBeUndefined();
  });
});

describe("setConcentration with applied_targets — missing target reason", () => {
  beforeEach(() => {
    const t = createTestGSM();
    gsm = t.gsm;
    registerCharacter(gsm, "P1", createClericCharacter());
    registerCharacter(gsm, "P2", createFighterCharacter());
  });

  it("reports missingTargets[].reason='name_not_found' for unknown target names", () => {
    const r = gsm.setConcentration("Brynn", "Bless", ["Theron", "NobodyByThatName"]);
    const data = r.data as {
      appliedTargets: string[];
      missingTargets: Array<{ name: string; reason: string }>;
    };
    expect(data.appliedTargets).toContain("Theron");
    const missing = data.missingTargets.find((m) => m.name === "NobodyByThatName");
    expect(missing?.reason).toBe("name_not_found");
  });
});
