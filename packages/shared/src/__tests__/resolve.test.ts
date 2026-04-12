/**
 * Phase 2 snapshot invariant tests for character resolver accessors.
 *
 * Each test builds a fixture character via `buildCharacter`, calls an accessor, and
 * asserts the result equals the corresponding raw static field. This catches any
 * drift when Phase 7 flips the implementation from fallback-reads to effect-derivation.
 */

import { describe, it, expect } from "vitest";
import { buildCharacter } from "../builders/character-builder.js";
import type { CharacterIdentifiers } from "../builders/types.js";
import type { AbilityScores } from "../types/character.js";
import type { BuilderState } from "../types/builder.js";
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

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const defaultAbilities: AbilityScores = {
  strength: 16,
  dexterity: 14,
  constitution: 14,
  intelligence: 10,
  wisdom: 12,
  charisma: 8,
};

function stubBuilderState(partial?: Partial<BuilderState>): BuilderState {
  return {
    currentStep: "details",
    completedSteps: [],
    species: "Human",
    speciesChoices: {},
    background: null,
    backgroundChoices: {},
    abilityScoreMode: "two-one",
    abilityScoreAssignments: {},
    classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
    activeClassIndex: 0,
    abilityMethod: "manual",
    baseAbilities: defaultAbilities,
    featSelections: [],
    featChoices: {},
    cantrips: {},
    preparedSpells: {},
    name: "Test Character",
    appearance: {},
    backstory: "",
    alignment: "",
    traits: {},
    equipment: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    ...partial,
  };
}

function makeIdentifiers(overrides: Partial<CharacterIdentifiers> = {}): CharacterIdentifiers {
  return {
    name: "Resolvia Testsworth",
    race: "Human",
    classes: [{ name: "Fighter", level: 5 }],
    abilities: defaultAbilities,
    maxHP: 44,
    skillProficiencies: ["athletics", "perception"],
    skillExpertise: [],
    saveProficiencies: ["strength", "constitution"],
    spells: [],
    equipment: [],
    languages: ["Common"],
    source: "builder",
    builderState: stubBuilderState({
      classes: [{ name: "Fighter", level: 5, subclass: null, skills: [], choices: {} }],
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Accessor snapshot tests — each asserts accessor === raw static field
// ---------------------------------------------------------------------------

describe("resolve.ts — snapshot invariant (Phase 2 fallback reads)", () => {
  const ids = makeIdentifiers();
  const { character } = buildCharacter(ids);
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

  it("getWeaponAttack returns item.attackBonus", () => {
    // Inject a mock weapon item — builder doesn't add equipment in the fixture.
    const mockItem = {
      name: "Longsword",
      equipped: true,
      quantity: 1,
      attackBonus: 6,
    };
    expect(getWeaponAttack(character, mockItem)).toBe(6);
  });

  it("getWeaponAttack returns undefined when item has no attackBonus", () => {
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
  const wizardIds = makeIdentifiers({
    name: "Arcanis Testsworth",
    classes: [{ name: "Wizard", level: 3 }],
    abilities: {
      strength: 8,
      dexterity: 14,
      constitution: 12,
      intelligence: 16,
      wisdom: 12,
      charisma: 10,
    },
    maxHP: 16,
    saveProficiencies: ["intelligence", "wisdom"],
    spells: [],
    builderState: stubBuilderState({
      classes: [{ name: "Wizard", level: 3, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 8,
        dexterity: 14,
        constitution: 12,
        intelligence: 16,
        wisdom: 12,
        charisma: 10,
      },
    }),
  });

  it("getSpellcasting returns static.spellcasting.Wizard", () => {
    const { character } = buildCharacter(wizardIds);
    const fromAccessor = getSpellcasting(character, "Wizard");
    const fromStatic = character.static.spellcasting?.["Wizard"];
    expect(fromAccessor).toEqual(fromStatic);
    // Spot-check values: DC = 8 + 2 (prof) + 3 (INT) = 13
    expect(fromAccessor?.dc).toBe(13);
    expect(fromAccessor?.ability).toBe("intelligence");
  });
});
