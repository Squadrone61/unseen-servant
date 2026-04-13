/**
 * Ability score resolution through the effect system.
 *
 * Validates that static.abilities stays as the PURE base (point-buy/rolled scores)
 * and that background, ASI, feats, items, etc. all flow through EffectBundles via
 * getAbilityScore / getAbilities.
 */

import { describe, it, expect } from "vitest";
import { buildCharacter } from "../builders/character-builder.js";
import { getAbilities, getAbilityScore, getHP } from "../character/resolve.js";
import { makeBuilderState } from "./helpers/makeBuilderState.js";

describe("Ability scores flow through the effect system", () => {
  describe("static.abilities = pure base", () => {
    it("static.abilities is unchanged by background ability assignments", () => {
      const state = makeBuilderState({
        background: "Soldier",
        abilityScoreAssignments: { strength: 2, constitution: 1 },
        baseAbilities: {
          strength: 15,
          dexterity: 14,
          constitution: 13,
          intelligence: 10,
          wisdom: 12,
          charisma: 8,
        },
      });
      const { character } = buildCharacter(state);
      expect(character.static.abilities.strength).toBe(15);
      expect(character.static.abilities.constitution).toBe(13);
    });

    it("static.abilities is unchanged by ASI selections", () => {
      const state = makeBuilderState({
        classes: [{ name: "Fighter", level: 4, subclass: null, skills: [], choices: {} }],
        featSelections: [{ type: "asi", level: 4, asiAbilities: { strength: 1, dexterity: 1 } }],
        baseAbilities: {
          strength: 16,
          dexterity: 14,
          constitution: 14,
          intelligence: 10,
          wisdom: 12,
          charisma: 8,
        },
      });
      const { character } = buildCharacter(state);
      expect(character.static.abilities.strength).toBe(16);
      expect(character.static.abilities.dexterity).toBe(14);
    });

    it("static.abilities is unchanged by feat ability modifiers", () => {
      const state = makeBuilderState({
        classes: [{ name: "Fighter", level: 4, subclass: null, skills: [], choices: {} }],
        featSelections: [{ type: "feat", level: 4, featName: "Actor" }],
        baseAbilities: {
          strength: 16,
          dexterity: 14,
          constitution: 14,
          intelligence: 10,
          wisdom: 12,
          charisma: 10,
        },
      });
      const { character } = buildCharacter(state);
      expect(character.static.abilities.charisma).toBe(10);
    });
  });

  describe("getAbilityScore / getAbilities", () => {
    it("applies background ability assignments", () => {
      const state = makeBuilderState({
        background: "Soldier",
        abilityScoreAssignments: { strength: 2, constitution: 1 },
        baseAbilities: {
          strength: 15,
          dexterity: 14,
          constitution: 13,
          intelligence: 10,
          wisdom: 12,
          charisma: 8,
        },
      });
      const { character } = buildCharacter(state);
      expect(getAbilityScore(character, "strength")).toBe(17);
      expect(getAbilityScore(character, "constitution")).toBe(14);
    });

    it("applies ASI selections", () => {
      const state = makeBuilderState({
        classes: [{ name: "Fighter", level: 4, subclass: null, skills: [], choices: {} }],
        featSelections: [{ type: "asi", level: 4, asiAbilities: { strength: 1, dexterity: 1 } }],
        baseAbilities: {
          strength: 16,
          dexterity: 14,
          constitution: 14,
          intelligence: 10,
          wisdom: 12,
          charisma: 8,
        },
      });
      const { character } = buildCharacter(state);
      const abs = getAbilities(character);
      expect(abs.strength).toBe(17);
      expect(abs.dexterity).toBe(15);
    });

    it("applies feat top-level ability modifiers (Actor → +1 Cha)", () => {
      const state = makeBuilderState({
        classes: [{ name: "Fighter", level: 4, subclass: null, skills: [], choices: {} }],
        featSelections: [{ type: "feat", level: 4, featName: "Actor" }],
        baseAbilities: {
          strength: 16,
          dexterity: 14,
          constitution: 14,
          intelligence: 10,
          wisdom: 12,
          charisma: 10,
        },
      });
      const { character } = buildCharacter(state);
      expect(getAbilityScore(character, "charisma")).toBe(11);
    });

    it("applies feat sub-choice option modifiers (Athlete with Strength pick)", () => {
      const state = makeBuilderState({
        classes: [{ name: "Fighter", level: 4, subclass: null, skills: [], choices: {} }],
        featSelections: [{ type: "feat", level: 4, featName: "Athlete" }],
        featChoices: { Athlete: { asi: ["Strength +1"] } },
        baseAbilities: {
          strength: 15,
          dexterity: 14,
          constitution: 14,
          intelligence: 10,
          wisdom: 12,
          charisma: 8,
        },
      });
      const { character } = buildCharacter(state);
      expect(getAbilityScore(character, "strength")).toBe(16);
    });

    it("stacks multiple add modifiers (background +2 STR + ASI +1 STR)", () => {
      const state = makeBuilderState({
        classes: [{ name: "Fighter", level: 4, subclass: null, skills: [], choices: {} }],
        background: "Soldier",
        abilityScoreAssignments: { strength: 2, constitution: 1 },
        featSelections: [{ type: "asi", level: 4, asiAbilities: { strength: 1 } }],
        baseAbilities: {
          strength: 14,
          dexterity: 14,
          constitution: 13,
          intelligence: 10,
          wisdom: 12,
          charisma: 8,
        },
      });
      const { character } = buildCharacter(state);
      expect(getAbilityScore(character, "strength")).toBe(17);
    });
  });

  describe("HP recomputes from resolved CON", () => {
    it("getHP includes CON bump from background", () => {
      const state = makeBuilderState({
        classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
        background: "Soldier",
        abilityScoreAssignments: { strength: 2, constitution: 1 },
        baseAbilities: {
          strength: 14,
          dexterity: 14,
          constitution: 13,
          intelligence: 10,
          wisdom: 12,
          charisma: 8,
        },
      });
      const { character } = buildCharacter(state);
      // Resolved CON = 14 → con_mod = +2 → Fighter d10 + 2 = 12
      expect(getHP(character)).toBe(12);
    });
  });
});
