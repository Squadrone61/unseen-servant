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

describe("resolve.ts — snapshot invariant (Phase 2 fallback reads)", () => {
  const { character } = buildCharacter(fighterState);
  const s = character.static;

  it("getAC returns char.static.armorClass", () => {
    expect(getAC(character)).toEqual(s.armorClass);
  });

  it("getHP returns char.static.maxHP", () => {
    expect(getHP(character)).toEqual(s.maxHP);
  });

  it("getSpeed returns char.static.speed", () => {
    expect(getSpeed(character)).toEqual(s.speed);
  });

  it("getSkills returns char.static.skills", () => {
    expect(getSkills(character)).toEqual(s.skills);
  });

  it("getSavingThrows returns char.static.savingThrows", () => {
    expect(getSavingThrows(character)).toEqual(s.savingThrows);
  });

  it("getSenses returns char.static.senses", () => {
    expect(getSenses(character)).toEqual(s.senses);
  });

  it("getSpellcasting returns undefined for non-caster Fighter", () => {
    expect(getSpellcasting(character, "Fighter")).toBeUndefined();
    expect(s.spellcasting?.["Fighter"]).toBeUndefined();
  });

  it("getAdvantages returns char.static.advantages", () => {
    expect(getAdvantages(character)).toEqual(s.advantages);
  });

  it("getCharProficiencies armor returns char.static.proficiencies.armor", () => {
    expect(getCharProficiencies(character, "armor")).toEqual(s.proficiencies.armor);
  });

  it("getClassResources returns char.static.classResources ?? []", () => {
    const resources = getClassResources(character);
    expect(resources).toEqual(s.classResources ?? []);
  });

  it("getCombatBonus returns char.static.combatBonuses ?? []", () => {
    expect(getCombatBonus(character)).toEqual(s.combatBonuses ?? []);
  });

  it("getPassivePerception returns the value encoded in senses or derived from Perception skill", () => {
    const pp = getPassivePerception(character);
    // The builder encodes "Passive Perception N" in senses; parse it for comparison.
    const senseLine = s.senses.find((s) => s.startsWith("Passive Perception"));
    if (senseLine) {
      const expected = parseInt(senseLine.split(" ").at(-1) ?? "", 10);
      expect(pp).toBe(expected);
    } else {
      // Fallback: perception skill bonus + 10.
      const perception = s.skills.find(
        (sk) => sk.name === "perception" || sk.name === "Perception",
      );
      const wisMod = Math.floor((s.abilities.wisdom - 10) / 2);
      const profBonus = s.proficiencyBonus;
      let bonus = wisMod;
      if (perception?.expertise) bonus += profBonus * 2;
      else if (perception?.proficient) bonus += profBonus;
      if (perception?.bonus) bonus += perception.bonus;
      expect(pp).toBe(10 + bonus);
    }
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
    const count = getExtraAttacks(character);
    // Fighter 5 has the Extra Attack feature → 1 extra → 2 total attacks.
    const extraFeatureCount = s.features.filter((f) => f.name === "Extra Attack").length;
    expect(count).toBe(1 + extraFeatureCount);
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

  it("getSpellcasting returns static.spellcasting.Wizard", () => {
    const { character } = buildCharacter(wizardState);
    const fromAccessor = getSpellcasting(character, "Wizard");
    const fromStatic = character.static.spellcasting?.["Wizard"];
    expect(fromAccessor).toEqual(fromStatic);
    // Spot-check values: DC = 8 + 2 (prof) + 3 (INT) = 13
    expect(fromAccessor?.dc).toBe(13);
    expect(fromAccessor?.ability).toBe("intelligence");
  });
});
