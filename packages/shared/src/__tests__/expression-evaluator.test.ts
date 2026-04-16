import { describe, it, expect } from "vitest";
import { evaluateExpression } from "../utils/expression-evaluator.js";
import type { ResolveContext } from "../types/effects.js";

function ctx(profBonus: number): ResolveContext {
  return {
    abilities: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    totalLevel: 1,
    proficiencyBonus: profBonus,
  };
}

describe("expression evaluator — half_prof atom", () => {
  it("returns floor(prof / 2) across all proficiency tiers", () => {
    const cases: Array<[number, number]> = [
      [2, 1], // L1-4
      [3, 1], // L5-8
      [4, 2], // L9-12
      [5, 2], // L13-16
      [6, 3], // L17-20
    ];
    for (const [prof, expected] of cases) {
      expect(evaluateExpression("half_prof", ctx(prof))).toBe(expected);
    }
  });

  it("composes with arithmetic and other atoms", () => {
    expect(evaluateExpression("half_prof + 1", ctx(4))).toBe(3);
    expect(evaluateExpression("prof + half_prof", ctx(6))).toBe(9);
  });
});
