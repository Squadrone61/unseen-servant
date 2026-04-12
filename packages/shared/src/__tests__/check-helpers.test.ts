import { describe, it, expect } from "vitest";
import { parseCheckType, buildCheckLabel, computeCheckModifier } from "../utils/check-helpers.js";
import type { CharacterData } from "../types/character.js";
import type { CheckRequest } from "../types/game-state.js";

// ---------------------------------------------------------------------------
// parseCheckType
// ---------------------------------------------------------------------------

describe("parseCheckType — skill checks", () => {
  it("parses perception as skill/wisdom", () => {
    expect(parseCheckType("perception")).toEqual({
      category: "skill",
      skill: "perception",
      ability: "wisdom",
    });
  });

  it("parses stealth as skill/dexterity", () => {
    expect(parseCheckType("stealth")).toEqual({
      category: "skill",
      skill: "stealth",
      ability: "dexterity",
    });
  });

  it("parses athletics as skill/strength", () => {
    expect(parseCheckType("athletics")).toEqual({
      category: "skill",
      skill: "athletics",
      ability: "strength",
    });
  });

  it("parses arcana as skill/intelligence", () => {
    expect(parseCheckType("arcana")).toEqual({
      category: "skill",
      skill: "arcana",
      ability: "intelligence",
    });
  });

  it("parses deception as skill/charisma", () => {
    expect(parseCheckType("deception")).toEqual({
      category: "skill",
      skill: "deception",
      ability: "charisma",
    });
  });

  it("parses animal_handling as skill/wisdom", () => {
    expect(parseCheckType("animal_handling")).toEqual({
      category: "skill",
      skill: "animal_handling",
      ability: "wisdom",
    });
  });

  it("parses acrobatics as skill/dexterity", () => {
    expect(parseCheckType("acrobatics")).toEqual({
      category: "skill",
      skill: "acrobatics",
      ability: "dexterity",
    });
  });

  it("parses investigation as skill/intelligence", () => {
    expect(parseCheckType("investigation")).toEqual({
      category: "skill",
      skill: "investigation",
      ability: "intelligence",
    });
  });

  it("parses persuasion as skill/charisma", () => {
    expect(parseCheckType("persuasion")).toEqual({
      category: "skill",
      skill: "persuasion",
      ability: "charisma",
    });
  });

  it("parses sleight_of_hand as skill/dexterity", () => {
    expect(parseCheckType("sleight_of_hand")).toEqual({
      category: "skill",
      skill: "sleight_of_hand",
      ability: "dexterity",
    });
  });
});

describe("parseCheckType — ability checks", () => {
  it("parses strength as ability check", () => {
    expect(parseCheckType("strength")).toEqual({ category: "ability", ability: "strength" });
  });

  it("parses dexterity as ability check", () => {
    expect(parseCheckType("dexterity")).toEqual({ category: "ability", ability: "dexterity" });
  });

  it("parses constitution as ability check", () => {
    expect(parseCheckType("constitution")).toEqual({
      category: "ability",
      ability: "constitution",
    });
  });

  it("parses intelligence as ability check", () => {
    expect(parseCheckType("intelligence")).toEqual({
      category: "ability",
      ability: "intelligence",
    });
  });

  it("parses wisdom as ability check", () => {
    expect(parseCheckType("wisdom")).toEqual({ category: "ability", ability: "wisdom" });
  });

  it("parses charisma as ability check", () => {
    expect(parseCheckType("charisma")).toEqual({ category: "ability", ability: "charisma" });
  });
});

describe("parseCheckType — saving throws", () => {
  it("parses strength_save", () => {
    expect(parseCheckType("strength_save")).toEqual({
      category: "saving_throw",
      ability: "strength",
    });
  });

  it("parses dexterity_save", () => {
    expect(parseCheckType("dexterity_save")).toEqual({
      category: "saving_throw",
      ability: "dexterity",
    });
  });

  it("parses constitution_save", () => {
    expect(parseCheckType("constitution_save")).toEqual({
      category: "saving_throw",
      ability: "constitution",
    });
  });

  it("parses intelligence_save", () => {
    expect(parseCheckType("intelligence_save")).toEqual({
      category: "saving_throw",
      ability: "intelligence",
    });
  });

  it("parses wisdom_save", () => {
    expect(parseCheckType("wisdom_save")).toEqual({
      category: "saving_throw",
      ability: "wisdom",
    });
  });

  it("parses charisma_save", () => {
    expect(parseCheckType("charisma_save")).toEqual({
      category: "saving_throw",
      ability: "charisma",
    });
  });
});

describe("parseCheckType — attack types", () => {
  it("parses melee_attack", () => {
    expect(parseCheckType("melee_attack")).toEqual({
      category: "attack",
      attackType: "melee",
    });
  });

  it("parses ranged_attack", () => {
    expect(parseCheckType("ranged_attack")).toEqual({
      category: "attack",
      attackType: "ranged",
    });
  });

  it("parses spell_attack", () => {
    expect(parseCheckType("spell_attack")).toEqual({
      category: "attack",
      attackType: "spell",
    });
  });

  it("parses finesse_attack", () => {
    expect(parseCheckType("finesse_attack")).toEqual({
      category: "attack",
      attackType: "finesse",
    });
  });
});

describe("parseCheckType — case normalization", () => {
  it("normalises 'Perception' (title case) to skill/wisdom", () => {
    expect(parseCheckType("Perception")).toEqual({
      category: "skill",
      skill: "perception",
      ability: "wisdom",
    });
  });

  it("normalises 'ATHLETICS' (all caps) to skill/strength", () => {
    expect(parseCheckType("ATHLETICS")).toEqual({
      category: "skill",
      skill: "athletics",
      ability: "strength",
    });
  });

  it("normalises 'Strength Save' (spaces) to saving_throw/strength", () => {
    expect(parseCheckType("Strength Save")).toEqual({
      category: "saving_throw",
      ability: "strength",
    });
  });

  it("normalises 'animal handling' (space instead of underscore) to skill/wisdom", () => {
    expect(parseCheckType("animal handling")).toEqual({
      category: "skill",
      skill: "animal_handling",
      ability: "wisdom",
    });
  });
});

describe("parseCheckType — invalid inputs", () => {
  it("returns null for unrecognised string", () => {
    expect(parseCheckType("invalid_thing")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseCheckType("")).toBeNull();
  });

  it("returns null for a random word", () => {
    expect(parseCheckType("fireball")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildCheckLabel
// ---------------------------------------------------------------------------

// Helper that provides the required CheckRequest fields with sensible defaults.
function makeCheck(overrides: Partial<CheckRequest>): CheckRequest {
  return {
    id: "test-id",
    targetCharacter: "Tester",
    notation: "1d20",
    reason: "Default reason",
    ...overrides,
  };
}

describe("buildCheckLabel — skill checks", () => {
  it("formats perception with reason", () => {
    expect(
      buildCheckLabel(makeCheck({ checkType: "perception", reason: "Listen at the door" })),
    ).toBe("Perception — Listen at the door");
  });

  it("formats animal_handling with reason (underscore → space, title-cased)", () => {
    expect(
      buildCheckLabel(makeCheck({ checkType: "animal_handling", reason: "Calm the horse" })),
    ).toBe("Animal Handling — Calm the horse");
  });

  it("formats sleight_of_hand with reason", () => {
    expect(
      buildCheckLabel(makeCheck({ checkType: "sleight_of_hand", reason: "Pick the lock" })),
    ).toBe("Sleight Of Hand — Pick the lock");
  });
});

describe("buildCheckLabel — ability checks", () => {
  it("formats strength check with reason using 3-letter abbreviation", () => {
    expect(buildCheckLabel(makeCheck({ checkType: "strength", reason: "Lift the boulder" }))).toBe(
      "STR Check — Lift the boulder",
    );
  });

  it("formats dexterity check with reason", () => {
    expect(buildCheckLabel(makeCheck({ checkType: "dexterity", reason: "Dodge debris" }))).toBe(
      "DEX Check — Dodge debris",
    );
  });

  it("formats intelligence check with reason", () => {
    expect(buildCheckLabel(makeCheck({ checkType: "intelligence", reason: "Recall lore" }))).toBe(
      "INT Check — Recall lore",
    );
  });

  it("formats ability check with no reason", () => {
    expect(buildCheckLabel(makeCheck({ checkType: "wisdom", reason: "" }))).toBe("WIS Check");
  });
});

describe("buildCheckLabel — saving throws", () => {
  it("formats dexterity_save with reason", () => {
    expect(
      buildCheckLabel(makeCheck({ checkType: "dexterity_save", reason: "Dodge fireball" })),
    ).toBe("DEX Save — Dodge fireball");
  });

  it("formats constitution_save with reason", () => {
    expect(
      buildCheckLabel(makeCheck({ checkType: "constitution_save", reason: "Resist poison" })),
    ).toBe("CON Save — Resist poison");
  });

  it("formats wisdom_save with no reason", () => {
    expect(buildCheckLabel(makeCheck({ checkType: "wisdom_save", reason: "" }))).toBe("WIS Save");
  });
});

describe("buildCheckLabel — attack types", () => {
  it("formats melee_attack with reason", () => {
    expect(buildCheckLabel(makeCheck({ checkType: "melee_attack", reason: "Swing sword" }))).toBe(
      "Melee Attack — Swing sword",
    );
  });

  it("formats ranged_attack with reason", () => {
    expect(buildCheckLabel(makeCheck({ checkType: "ranged_attack", reason: "Loose arrow" }))).toBe(
      "Ranged Attack — Loose arrow",
    );
  });

  it("formats spell_attack with reason", () => {
    expect(buildCheckLabel(makeCheck({ checkType: "spell_attack", reason: "Fire bolt" }))).toBe(
      "Spell Attack — Fire bolt",
    );
  });

  it("formats finesse_attack with reason", () => {
    expect(
      buildCheckLabel(makeCheck({ checkType: "finesse_attack", reason: "Rapier strike" })),
    ).toBe("Finesse Attack — Rapier strike");
  });
});

describe("buildCheckLabel — missing or invalid checkType", () => {
  it("returns reason alone when checkType is undefined", () => {
    expect(buildCheckLabel(makeCheck({ checkType: undefined, reason: "Generic roll" }))).toBe(
      "Generic roll",
    );
  });

  it("returns reason alone when checkType is unrecognised", () => {
    expect(buildCheckLabel(makeCheck({ checkType: "invalid", reason: "Something" }))).toBe(
      "Something",
    );
  });
});

// ---------------------------------------------------------------------------
// computeCheckModifier
// ---------------------------------------------------------------------------

// Level-5 Fighter with STR 16 (+3), DEX 14 (+2), CON 12 (+1), INT 10 (0),
// WIS 8 (-1), CHA 13 (+1). Proficiency bonus +3.
// Skills: athletics (STR, proficient), perception (WIS, not proficient),
//         stealth (DEX, expertise).
// Saves: strength (proficient), constitution (proficient), dexterity (not proficient).
const mockChar: CharacterData = {
  builder: {} as CharacterData["builder"],
  static: {
    name: "Tester",
    race: "Human",
    classes: [{ name: "Fighter", level: 5 }],
    maxHP: 44,
    armorClass: 18,
    speed: { walk: 30 },
    abilities: {
      strength: 16,
      dexterity: 14,
      constitution: 12,
      intelligence: 10,
      wisdom: 8,
      charisma: 13,
    },
    proficiencyBonus: 3,
    skills: [
      { name: "athletics", ability: "strength", proficient: true, expertise: false },
      { name: "perception", ability: "wisdom", proficient: false, expertise: false },
      { name: "stealth", ability: "dexterity", proficient: true, expertise: true },
    ],
    savingThrows: [
      { ability: "strength", proficient: true },
      { ability: "constitution", proficient: true },
      { ability: "dexterity", proficient: false },
    ],
    features: [],
    proficiencies: { armor: [], weapons: [], tools: [], other: [] },
    senses: [],
    languages: [],
    spells: [],
    advantages: [],
    combatBonuses: [],
    traits: {},
    importedAt: 0,
    spellcasting: undefined,
  },
  dynamic: {
    currentHP: 44,
    tempHP: 0,
    conditions: [],
    spellSlotsUsed: [],
    deathSaves: { successes: 0, failures: 0 },
    heroicInspiration: false,
    inventory: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  },
};

describe("computeCheckModifier — skill checks", () => {
  it("proficient skill (athletics): STR mod +3 + prof +3 = 6", () => {
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "athletics", reason: "climb" })),
    ).toBe(6);
  });

  it("expertise skill (stealth): DEX mod +2 + 2×prof +6 = 8", () => {
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "stealth", reason: "sneak" })),
    ).toBe(8);
  });

  it("non-proficient skill in list (perception): WIS mod -1, no proficiency = -1", () => {
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "perception", reason: "listen" })),
    ).toBe(-1);
  });

  it("skill not in character's skill list (arcana): returns 0 (no skill entry)", () => {
    // arcana not in mockChar.static.skills — function finds no matching skill entry → falls through to 0
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "arcana", reason: "recall" })),
    ).toBe(0);
  });
});

describe("computeCheckModifier — saving throws", () => {
  it("proficient save (strength_save): STR mod +3 + prof +3 = 6", () => {
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "strength_save", reason: "resist" })),
    ).toBe(6);
  });

  it("non-proficient save (dexterity_save): DEX mod +2, no proficiency = 2", () => {
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "dexterity_save", reason: "dodge" })),
    ).toBe(2);
  });

  it("proficient save with CON (constitution_save): CON mod +1 + prof +3 = 4", () => {
    expect(
      computeCheckModifier(
        mockChar,
        makeCheck({ checkType: "constitution_save", reason: "endure" }),
      ),
    ).toBe(4);
  });

  it("save not in savingThrows list (wisdom_save): falls back to raw WIS mod = -1", () => {
    // WIS save not listed in mockChar savingThrows — uses raw ability fallback
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "wisdom_save", reason: "will" })),
    ).toBe(-1);
  });
});

describe("computeCheckModifier — ability checks", () => {
  it("intelligence ability check: INT mod = 0", () => {
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "intelligence", reason: "recall" })),
    ).toBe(0);
  });

  it("charisma ability check: CHA mod = +1", () => {
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "charisma", reason: "persuade" })),
    ).toBe(1);
  });

  it("wisdom ability check: WIS mod = -1", () => {
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "wisdom", reason: "sense motive" })),
    ).toBe(-1);
  });
});

describe("computeCheckModifier — attack rolls", () => {
  it("melee_attack: STR mod +3 + prof +3 = 6", () => {
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "melee_attack", reason: "swing" })),
    ).toBe(6);
  });

  it("ranged_attack: DEX mod +2 + prof +3 = 5", () => {
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "ranged_attack", reason: "shoot" })),
    ).toBe(5);
  });

  it("finesse_attack: max(STR+3, DEX+2) + prof +3 = 6", () => {
    // STR mod (+3) > DEX mod (+2), so finesse uses STR
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: "finesse_attack", reason: "rapier" })),
    ).toBe(6);
  });

  it("spell_attack with spellcasting map: returns attackBonus from first entry", () => {
    const caster: CharacterData = {
      ...mockChar,
      static: {
        ...mockChar.static,
        spellcasting: { Wizard: { ability: "intelligence", dc: 15, attackBonus: 7 } },
      },
    };
    expect(
      computeCheckModifier(caster, makeCheck({ checkType: "spell_attack", reason: "fire bolt" })),
    ).toBe(7);
  });

  it("spell_attack without spellcasting map: STR mod +3 + prof +3 = 6", () => {
    // spellcasting is undefined → falls through to melee/ranged path using STR
    expect(
      computeCheckModifier(
        mockChar,
        makeCheck({ checkType: "spell_attack", reason: "eldritch blast" }),
      ),
    ).toBe(6);
  });
});

describe("computeCheckModifier — edge cases", () => {
  it("returns 0 when checkType is undefined", () => {
    expect(
      computeCheckModifier(mockChar, makeCheck({ checkType: undefined, reason: "whatever" })),
    ).toBe(0);
  });

  it("returns 0 when checkType is unrecognised", () => {
    expect(computeCheckModifier(mockChar, makeCheck({ checkType: "bogus", reason: "test" }))).toBe(
      0,
    );
  });
});
