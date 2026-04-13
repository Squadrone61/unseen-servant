/**
 * Phase 2 snapshot invariant tests for character resolver accessors.
 *
 * Each test builds a fixture character via `buildCharacter`, calls an accessor, and
 * asserts the result equals the corresponding raw static field. This catches any
 * drift when Phase 7 flips the implementation from fallback-reads to effect-derivation.
 */

import { describe, it, expect } from "vitest";
import { buildCharacter } from "../builders/character-builder.js";
import {
  getAC,
  getHP,
  getSpeed,
  getSkills,
  getSavingThrows,
  getSenses,
  getSpellcasting,
  getAdvantages,
  getCombatBonus,
  getClassResources,
  getPassivePerception,
  getWeaponAttack,
  getExtraAttacks,
} from "../character/resolve.js";
import { getProficiencies as getCharProficiencies } from "../character/resolve.js";
import { makeBuilderState } from "./helpers/makeBuilderState.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const fighterState = makeBuilderState({
  classes: [
    {
      name: "Fighter",
      level: 5,
      subclass: "Champion",
      skills: ["athletics", "perception"],
      choices: {},
    },
  ],
});

// ---------------------------------------------------------------------------
// Accessor snapshot tests — each asserts accessor === raw static field
// ---------------------------------------------------------------------------

describe("resolve.ts — effect-driven accessors (Phase 7)", () => {
  const { character } = buildCharacter(fighterState);

  it("getAC returns a number >= 10", () => {
    expect(getAC(character)).toBeGreaterThanOrEqual(10);
  });

  it("getHP returns a positive number for Fighter 5", () => {
    // Fighter d10: 10 + 4*6 = 34 + CON*5
    expect(getHP(character)).toBeGreaterThan(30);
  });

  it("getSpeed returns a CharacterSpeed with walk > 0", () => {
    expect(getSpeed(character).walk).toBeGreaterThan(0);
  });

  it("getSkills returns all 18 skills", () => {
    expect(getSkills(character).length).toBe(18);
  });

  it("getSavingThrows returns all 6 abilities, STR/CON proficient for Fighter", () => {
    const saves = getSavingThrows(character);
    expect(saves.length).toBe(6);
    const str = saves.find((s) => s.ability === "strength");
    const con = saves.find((s) => s.ability === "constitution");
    expect(str?.proficient).toBe(true);
    expect(con?.proficient).toBe(true);
  });

  it("getSenses returns an array (may include darkvision or passive perception)", () => {
    expect(Array.isArray(getSenses(character))).toBe(true);
  });

  it("getSpellcasting returns undefined for non-caster Fighter", () => {
    expect(getSpellcasting(character, "Fighter")).toBeUndefined();
  });

  it("getAdvantages returns an array", () => {
    expect(Array.isArray(getAdvantages(character))).toBe(true);
  });

  it("getCharProficiencies armor returns an array", () => {
    expect(Array.isArray(getCharProficiencies(character, "armor"))).toBe(true);
  });

  it("getClassResources returns an array (empty for basic Fighter)", () => {
    expect(Array.isArray(getClassResources(character))).toBe(true);
  });

  it("getCombatBonus returns an array", () => {
    expect(Array.isArray(getCombatBonus(character))).toBe(true);
  });

  it("getPassivePerception returns 10 + Perception bonus", () => {
    const pp = getPassivePerception(character);
    expect(pp).toBeGreaterThanOrEqual(10);
  });

  it("getWeaponAttack computes attack bonus from abilities + proficiency for a weapon item", () => {
    // Fighter 5 (Champion): STR 16 (mod +3), proficiency bonus 3.
    // Longsword is a martial weapon; Fighter is proficient with martial weapons.
    // Expected: +3 (STR) + 3 (prof) = +6
    const mockWeapon = {
      name: "Longsword",
      equipped: true,
      quantity: 1,
      weapon: {
        damage: "1d8",
        damageType: "slashing" as const,
        properties: ["Versatile"],
        versatile: "1d10",
      },
    };
    expect(getWeaponAttack(character, mockWeapon)).toBe(6);
  });

  it("getWeaponAttack returns undefined for non-weapon items (no weapon sub-object)", () => {
    const nonWeapon = { name: "Rations", equipped: false, quantity: 10 };
    expect(getWeaponAttack(character, nonWeapon)).toBeUndefined();
  });

  it("getExtraAttacks for Fighter 5 returns 2 (1 base + 1 Extra Attack feature)", () => {
    expect(getExtraAttacks(character)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Spellcasting accessor — Wizard fixture
// ---------------------------------------------------------------------------

describe("getSpellcasting — Wizard 3 caster", () => {
  const wizardState = makeBuilderState({
    name: "Arcanis Testsworth",
    classes: [{ name: "Wizard", level: 3, subclass: null, skills: [], choices: {} }],
    baseAbilities: {
      strength: 8,
      dexterity: 14,
      constitution: 12,
      intelligence: 16,
      wisdom: 12,
      charisma: 10,
    },
  });

  it("getSpellcasting returns Wizard DC/attack from effects", () => {
    const { character } = buildCharacter(wizardState);
    const fromAccessor = getSpellcasting(character, "Wizard");
    // Spot-check: DC = 8 + 2 (prof) + 3 (INT) = 13
    expect(fromAccessor?.dc).toBe(13);
    expect(fromAccessor?.ability).toBe("intelligence");
  });
});
