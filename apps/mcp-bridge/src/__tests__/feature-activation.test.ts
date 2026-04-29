import { describe, it, expect, beforeEach } from "vitest";
import {
  createTestGSM,
  createFighterCharacter,
  registerCharacter,
  assertToolSuccess,
  assertToolError,
} from "./setup.js";
import type { GameStateManager } from "../services/game-state-manager.js";
import { buildCharacter } from "@unseen-servant/shared/builders";
import type { CharacterData, CharacterTraits, Currency } from "@unseen-servant/shared/types";
import { makeBuilderState } from "@unseen-servant/shared/test-helpers";

/**
 * Behavioral contracts for activate_feature applied_targets.
 *
 * Mirrors set_concentration's applied_targets contract for class/subclass
 * features that mark a creature (Vow of Enmity is the canonical example).
 *
 * The feature's `activation.action.{onHit|onFailedSave}.applyEffects` block
 * defines the per-target bundle. Bundles are tagged with sourceActivation
 * and swept on deactivate_feature, the same way concentration sweeps work.
 */

function createOathOfVengeancePaladin(): CharacterData {
  const state = makeBuilderState({
    name: "Aelar",
    species: "Human",
    classes: [
      {
        name: "Paladin",
        level: 5,
        subclass: "Oath of Vengeance",
        skills: ["athletics", "intimidation"],
        choices: {},
      },
    ],
    baseAbilities: {
      strength: 16,
      dexterity: 10,
      constitution: 14,
      intelligence: 8,
      wisdom: 12,
      charisma: 16,
    },
  });
  const traits: CharacterTraits = { personalityTraits: "Sworn to vengeance" };
  const currency: Currency = { cp: 0, sp: 0, gp: 50, pp: 0 };
  const { character } = buildCharacter(state, { inventory: [], currency, traits });
  return character;
}

let gsm: GameStateManager;

describe("activateFeature with applied_targets — Vow of Enmity mark", () => {
  beforeEach(() => {
    const t = createTestGSM();
    gsm = t.gsm;
    registerCharacter(gsm, "P1", createOathOfVengeancePaladin());
    registerCharacter(gsm, "P2", createFighterCharacter());
    gsm.updateBattleMap({ id: "map1", width: 10, height: 10, tiles: [], name: "Arena" });
    gsm.startCombat([
      {
        name: "Bandit",
        type: "enemy" as const,
        initiativeModifier: 1,
        maxHP: 11,
        armorClass: 12,
      },
    ]);
  });

  it("places a sourceActivation bundle on the marked NPC combatant", () => {
    const r = gsm.activateFeature("Aelar", "Vow of Enmity", ["Bandit"]);
    assertToolSuccess(r);
    const combat = gsm.gameState.encounter?.combat;
    const bandit = Object.values(combat!.combatants).find((c) => c.name === "Bandit");
    const mark = (bandit?.activeEffects ?? []).find(
      (b) => b.sourceActivation?.feature.toLowerCase() === "vow of enmity",
    );
    expect(mark).toBeDefined();
    expect(mark?.sourceActivation?.caster.toLowerCase()).toBe("aelar");
  });

  it("activation bundle on the caster does NOT carry unconditional advantage on attack", () => {
    gsm.activateFeature("Aelar", "Vow of Enmity", ["Bandit"]);
    const aelar = gsm.characters["P1"];
    const activation = (aelar.dynamic.activeEffects ?? []).find((b) =>
      b.id.endsWith(":vow of enmity"),
    );
    expect(activation).toBeDefined();
    // The caster bundle must not carry unconditional advantage — that was the
    // original bug. Advantage applies only to attacks against the marked target.
    const advProps = (activation?.effects.properties ?? []).filter((p) => p.type === "advantage");
    expect(advProps).toEqual([]);
  });

  it("response text reports the applied target and the activation note", () => {
    const r = gsm.activateFeature("Aelar", "Vow of Enmity", ["Bandit"]);
    expect(r.text).toContain("Applied to");
    expect(r.text).toContain("Bandit");
  });

  it("deactivateFeature sweeps the mark off the named target", () => {
    gsm.activateFeature("Aelar", "Vow of Enmity", ["Bandit"]);
    gsm.deactivateFeature("Aelar", "Vow of Enmity");
    const combat = gsm.gameState.encounter?.combat;
    const bandit = Object.values(combat!.combatants).find((c) => c.name === "Bandit");
    const mark = (bandit?.activeEffects ?? []).find(
      (b) => b.sourceActivation?.feature.toLowerCase() === "vow of enmity",
    );
    expect(mark).toBeUndefined();
  });

  it("deactivateFeature reports targetsCleared in response data", () => {
    gsm.activateFeature("Aelar", "Vow of Enmity", ["Bandit"]);
    const r = gsm.deactivateFeature("Aelar", "Vow of Enmity");
    const data = r.data as { targetsCleared: string[] };
    expect(data.targetsCleared).toContain("Bandit");
  });

  it("trims whitespace on target name lookup", () => {
    const r = gsm.activateFeature("Aelar", "Vow of Enmity", ["  Bandit  "]);
    assertToolSuccess(r);
    const combat = gsm.gameState.encounter?.combat;
    const bandit = Object.values(combat!.combatants).find((c) => c.name === "Bandit");
    const mark = (bandit?.activeEffects ?? []).find(
      (b) => b.sourceActivation?.feature.toLowerCase() === "vow of enmity",
    );
    expect(mark).toBeDefined();
  });
});

describe("activateFeature with applied_targets — strict no_target_effect error", () => {
  beforeEach(() => {
    const t = createTestGSM();
    gsm = t.gsm;
    // Barbarian (Rage) has caster-side activation but no per-target effect.
    const state = makeBuilderState({
      name: "Gruk",
      species: "Human",
      classes: [
        {
          name: "Barbarian",
          level: 5,
          subclass: "Berserker",
          skills: ["athletics", "intimidation"],
          choices: {},
        },
      ],
      baseAbilities: {
        strength: 18,
        dexterity: 14,
        constitution: 16,
        intelligence: 8,
        wisdom: 10,
        charisma: 10,
      },
    });
    const { character } = buildCharacter(state, {
      inventory: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      traits: {},
    });
    registerCharacter(gsm, "P1", character);
    registerCharacter(gsm, "P2", createFighterCharacter());
  });

  it("returns an error when applied_targets is given for a feature with no per-target effect", () => {
    const r = gsm.activateFeature("Gruk", "Rage", ["Theron"]);
    assertToolError(r);
  });

  it("error text mentions there are no per-target effects", () => {
    const r = gsm.activateFeature("Gruk", "Rage", ["Theron"]);
    expect(r.text.toLowerCase()).toMatch(/no.*target.*effect|cannot.*apply/);
  });

  it("does not activate the feature when erroring", () => {
    gsm.activateFeature("Gruk", "Rage", ["Theron"]);
    const gruk = gsm.characters["P1"];
    const rage = (gruk.dynamic.activeEffects ?? []).find((b) => b.id.endsWith(":rage"));
    expect(rage).toBeUndefined();
  });

  it("works without applied_targets (existing Rage behavior preserved)", () => {
    const r = gsm.activateFeature("Gruk", "Rage");
    assertToolSuccess(r);
    const gruk = gsm.characters["P1"];
    const rage = (gruk.dynamic.activeEffects ?? []).find((b) => b.id.endsWith(":rage"));
    expect(rage).toBeDefined();
  });
});
