import { describe, it, expect } from "vitest";
import {
  getModifier,
  formatModifier,
  getProficiencyBonus,
  getTotalLevel,
  getSkillModifier,
  getSavingThrowModifier,
} from "../utils/character-helpers.js";
import type { AbilityScores } from "../types/character.js";

// ---------------------------------------------------------------------------
// getModifier
// ---------------------------------------------------------------------------
describe("getModifier", () => {
  const cases: [number, number][] = [
    [1, -5],
    [3, -4],
    [6, -2],
    [8, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [14, 2],
    [16, 3],
    [18, 4],
    [20, 5],
    [30, 10],
  ];

  for (const [score, expected] of cases) {
    it(`score ${score} → modifier ${expected}`, () => {
      expect(getModifier(score)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// formatModifier
// ---------------------------------------------------------------------------
describe("formatModifier", () => {
  it("score 14 → '+2'", () => {
    expect(formatModifier(14)).toBe("+2");
  });

  it("score 8 → '-1'", () => {
    expect(formatModifier(8)).toBe("-1");
  });

  it("score 10 → '+0'", () => {
    expect(formatModifier(10)).toBe("+0");
  });
});

// ---------------------------------------------------------------------------
// getProficiencyBonus
// ---------------------------------------------------------------------------
describe("getProficiencyBonus", () => {
  it("level 1 → +2", () => expect(getProficiencyBonus(1)).toBe(2));
  it("level 2 → +2", () => expect(getProficiencyBonus(2)).toBe(2));
  it("level 3 → +2", () => expect(getProficiencyBonus(3)).toBe(2));
  it("level 4 → +2", () => expect(getProficiencyBonus(4)).toBe(2));

  it("level 5 → +3", () => expect(getProficiencyBonus(5)).toBe(3));
  it("level 6 → +3", () => expect(getProficiencyBonus(6)).toBe(3));
  it("level 7 → +3", () => expect(getProficiencyBonus(7)).toBe(3));
  it("level 8 → +3", () => expect(getProficiencyBonus(8)).toBe(3));

  it("level 9 → +4", () => expect(getProficiencyBonus(9)).toBe(4));
  it("level 12 → +4", () => expect(getProficiencyBonus(12)).toBe(4));

  it("level 13 → +5", () => expect(getProficiencyBonus(13)).toBe(5));
  it("level 16 → +5", () => expect(getProficiencyBonus(16)).toBe(5));

  it("level 17 → +6", () => expect(getProficiencyBonus(17)).toBe(6));
  it("level 20 → +6", () => expect(getProficiencyBonus(20)).toBe(6));
});

// ---------------------------------------------------------------------------
// getTotalLevel
// ---------------------------------------------------------------------------
describe("getTotalLevel", () => {
  it("single class Fighter 5 → 5", () => {
    expect(getTotalLevel([{ name: "Fighter", level: 5 }])).toBe(5);
  });

  it("multiclass Cleric 3 / Warlock 2 → 5", () => {
    expect(
      getTotalLevel([
        { name: "Cleric", level: 3 },
        { name: "Warlock", level: 2 },
      ]),
    ).toBe(5);
  });

  it("empty array → 0", () => {
    expect(getTotalLevel([])).toBe(0);
  });

  it("single level entry → that level", () => {
    expect(getTotalLevel([{ name: "Rogue", level: 1 }])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getSkillModifier
// ---------------------------------------------------------------------------
describe("getSkillModifier", () => {
  const abilities: AbilityScores = {
    strength: 16, // mod +3
    dexterity: 14, // mod +2
    constitution: 12, // mod +1
    intelligence: 10, // mod +0
    wisdom: 8, // mod -1
    charisma: 13, // mod +1
  };
  const profBonus = 3;

  it("proficient Athletics (STR) → abilityMod(+3) + profBonus(3) = 6", () => {
    const skill = {
      name: "athletics",
      ability: "strength" as const,
      proficient: true,
      expertise: false,
    };
    expect(getSkillModifier(skill, abilities, profBonus)).toBe(6);
  });

  it("expertise Athletics (STR) → abilityMod(+3) + 2*profBonus(6) = 9", () => {
    const skill = {
      name: "athletics",
      ability: "strength" as const,
      proficient: false,
      expertise: true,
    };
    expect(getSkillModifier(skill, abilities, profBonus)).toBe(9);
  });

  it("non-proficient Athletics (STR) → just abilityMod(+3) = 3", () => {
    const skill = {
      name: "athletics",
      ability: "strength" as const,
      proficient: false,
      expertise: false,
    };
    expect(getSkillModifier(skill, abilities, profBonus)).toBe(3);
  });

  it("proficient skill with bonus field adds the bonus", () => {
    const skill = {
      name: "athletics",
      ability: "strength" as const,
      proficient: true,
      expertise: false,
      bonus: 2,
    };
    // +3 (STR) + 3 (prof) + 2 (bonus) = 8
    expect(getSkillModifier(skill, abilities, profBonus)).toBe(8);
  });

  it("non-proficient skill with bonus adds only abilityMod + bonus", () => {
    const skill = {
      name: "stealth",
      ability: "dexterity" as const,
      proficient: false,
      expertise: false,
      bonus: 1,
    };
    // +2 (DEX) + 1 (bonus) = 3
    expect(getSkillModifier(skill, abilities, profBonus)).toBe(3);
  });

  it("expertise takes priority over proficient", () => {
    // When expertise is true, proficient flag is irrelevant — uses 2x profBonus
    const skill = {
      name: "perception",
      ability: "wisdom" as const,
      proficient: true,
      expertise: true,
    };
    // -1 (WIS) + 2*3 (expertise) = 5
    expect(getSkillModifier(skill, abilities, profBonus)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// getSavingThrowModifier
// ---------------------------------------------------------------------------
describe("getSavingThrowModifier", () => {
  const abilities: AbilityScores = {
    strength: 16, // mod +3
    dexterity: 14, // mod +2
    constitution: 12, // mod +1
    intelligence: 10, // mod +0
    wisdom: 8, // mod -1
    charisma: 13, // mod +1
  };
  const profBonus = 3;

  it("proficient STR save → abilityMod(+3) + profBonus(3) = 6", () => {
    const save = { ability: "strength" as const, proficient: true };
    expect(getSavingThrowModifier(save, abilities, profBonus)).toBe(6);
  });

  it("non-proficient WIS save → just abilityMod(-1) = -1", () => {
    const save = { ability: "wisdom" as const, proficient: false };
    expect(getSavingThrowModifier(save, abilities, profBonus)).toBe(-1);
  });

  it("proficient save with bonus adds the bonus", () => {
    const save = { ability: "dexterity" as const, proficient: true, bonus: 2 };
    // +2 (DEX) + 3 (prof) + 2 (bonus) = 7
    expect(getSavingThrowModifier(save, abilities, profBonus)).toBe(7);
  });

  it("non-proficient save with bonus adds only abilityMod + bonus", () => {
    const save = { ability: "intelligence" as const, proficient: false, bonus: 1 };
    // +0 (INT) + 1 (bonus) = 1
    expect(getSavingThrowModifier(save, abilities, profBonus)).toBe(1);
  });
});
