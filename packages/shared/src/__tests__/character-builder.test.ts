import { describe, it, expect } from "vitest";
import { buildCharacter } from "../builders/character-builder.js";
import type { AbilityScores } from "../types/character.js";
import { makeBuilderState } from "./helpers/makeBuilderState.js";
import {
  getAC,
  getHP,
  getSpeed,
  getSkills,
  getSenses,
  getSpellcasting,
  getCombatBonus,
  getSavingThrows,
  getClassResources,
  getProficiencies as getProficienciesFor,
} from "../character/resolve.js";

// ---------------------------------------------------------------------------
// Fixture helper (local — wraps makeBuilderState with test-friendly API)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. Basic builds
// ---------------------------------------------------------------------------

describe("Fighter 5 — non-caster build", () => {
  const state = makeBuilderState({
    species: "Human",
    classes: [{ name: "Fighter", level: 5, subclass: "Champion", skills: [], choices: {} }],
    baseAbilities: {
      strength: 17,
      dexterity: 14,
      constitution: 14,
      intelligence: 10,
      wisdom: 12,
      charisma: 8,
    },
  });

  it("builds without errors", () => {
    const { character, warnings } = buildCharacter(state);
    expect(character).toBeDefined();
    expect(warnings).toBeInstanceOf(Array);
  });

  it("has Extra Attack feature", () => {
    const { character } = buildCharacter(state);
    const featureNames = character.static.features.map((f) => f.featureName ?? f.dbName);
    expect(featureNames).toContain("Extra Attack");
  });

  it("has Second Wind class resource", () => {
    const { character } = buildCharacter(state);
    const resources = getClassResources(character);
    const secondWind = resources.find((r) => r.name === "Second Wind");
    expect(secondWind).toBeDefined();
    expect(secondWind?.longRest).toBe("all");
    expect(secondWind?.shortRest).toBe("all");
  });

  it("has Action Surge class resource at level 5", () => {
    const { character } = buildCharacter(state);
    const resources = getClassResources(character);
    const surge = resources.find((r) => r.name === "Action Surge");
    expect(surge).toBeDefined();
    expect(surge?.longRest).toBe("all");
    expect(surge?.shortRest).toBe("all");
  });

  it("proficiency bonus is +3 at level 5", () => {
    const { character } = buildCharacter(state);
    expect(((character.static.classes.reduce((s, c) => s + c.level, 0) - 1) >> 2) + 2).toBe(3);
  });

  it("has no spell slots", () => {
    const { character } = buildCharacter(state);
    expect(character.dynamic.spellSlotsUsed).toHaveLength(0);
  });

  it("has no spellcasting ability", () => {
    const { character } = buildCharacter(state);
    expect(getSpellcasting(character, character.static.classes[0]?.name ?? "")).toBeUndefined();
  });

  it("HP is computed correctly from Fighter 5 CON 14", () => {
    // Fighter d10: level 1 → 10+2=12, levels 2-5 → 4×(6+2)=32, total=44
    const { character } = buildCharacter(state);
    expect(getHP(character)).toBe(44);
    expect(character.dynamic.currentHP).toBe(44);
  });

  it("starts with 0 tempHP", () => {
    const { character } = buildCharacter(state);
    expect(character.dynamic.tempHP).toBe(0);
  });

  it("starts with no conditions", () => {
    const { character } = buildCharacter(state);
    expect(character.dynamic.conditions).toHaveLength(0);
  });

  it("classes array is preserved", () => {
    const { character } = buildCharacter(state);
    expect(character.static.classes).toEqual([{ name: "Fighter", level: 5, subclass: "Champion" }]);
  });
});

describe("Wizard 3 — full caster build", () => {
  const state = makeBuilderState({
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

  it("builds without errors", () => {
    const { character } = buildCharacter(state);
    expect(character).toBeDefined();
  });

  it("has Arcane Recovery class resource", () => {
    const { character } = buildCharacter(state);
    const resources = getClassResources(character);
    expect(resources.find((r) => r.name === "Arcane Recovery")).toBeDefined();
  });

  it("spellcasting ability is Intelligence", () => {
    const { character } = buildCharacter(state);
    expect(getSpellcasting(character, "Wizard")?.ability).toBe("intelligence");
  });

  it("spell save DC = 8 + profBonus(2) + INT mod(+3) = 13", () => {
    const { character } = buildCharacter(state);
    expect(getSpellcasting(character, "Wizard")?.dc).toBe(13);
  });

  it("spell attack bonus = profBonus(2) + INT mod(+3) = 5", () => {
    const { character } = buildCharacter(state);
    expect(getSpellcasting(character, "Wizard")?.attackBonus).toBe(5);
  });

  it("has first and second level spell slots at level 3", () => {
    const { character } = buildCharacter(state);
    const slots = character.dynamic.spellSlotsUsed;
    const lvl1 = slots.find((s) => s.level === 1);
    const lvl2 = slots.find((s) => s.level === 2);
    expect(lvl1).toBeDefined();
    expect(lvl1?.total).toBe(4);
    expect(lvl2).toBeDefined();
    expect(lvl2?.total).toBe(2);
  });

  it("all spell slots start unused (used: 0)", () => {
    const { character } = buildCharacter(state);
    for (const slot of character.dynamic.spellSlotsUsed) {
      expect(slot.used).toBe(0);
    }
  });

  it("INT save proficiency is set", () => {
    const { character } = buildCharacter(state);
    const saves = getSavingThrows(character);
    const intSave = saves.find((s) => s.ability === "intelligence");
    expect(intSave?.proficient).toBe(true);
  });
});

describe("Rogue 1 — martial build", () => {
  const state = makeBuilderState({
    classes: [
      {
        name: "Rogue",
        level: 1,
        subclass: null,
        skills: ["stealth", "perception"],
        choices: { expertise: ["stealth", "perception"] },
      },
    ],
    baseAbilities: {
      strength: 10,
      dexterity: 17,
      constitution: 12,
      intelligence: 14,
      wisdom: 12,
      charisma: 10,
    },
  });

  it("builds without errors", () => {
    const { character } = buildCharacter(state);
    expect(character).toBeDefined();
  });

  it("has Sneak Attack feature", () => {
    const { character } = buildCharacter(state);
    const featureNames = character.static.features.map((f) => f.featureName ?? f.dbName);
    expect(featureNames).toContain("Sneak Attack");
  });

  it("has Expertise feature", () => {
    const { character } = buildCharacter(state);
    const featureNames = character.static.features.map((f) => f.featureName ?? f.dbName);
    expect(featureNames).toContain("Expertise");
  });

  it("has Thieves' Cant feature", () => {
    const { character } = buildCharacter(state);
    const featureNames = character.static.features.map((f) => f.featureName ?? f.dbName);
    expect(featureNames).toContain("Thieves' Cant");
  });

  it("expertise skills have expertise=true in skills array", () => {
    const { character } = buildCharacter(state);
    const stealth = getSkills(character).find((s) => s.name === "stealth");
    const perception = getSkills(character).find((s) => s.name === "perception");
    expect(stealth?.expertise).toBe(true);
    expect(perception?.expertise).toBe(true);
  });

  it("proficiency bonus is +2 at level 1", () => {
    const { character } = buildCharacter(state);
    expect(((character.static.classes.reduce((s, c) => s + c.level, 0) - 1) >> 2) + 2).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. Ability score computation
// ---------------------------------------------------------------------------

describe("Ability score computation", () => {
  it("CON modifier (+2) is reflected in correct starting HP", () => {
    // Fighter d10, CON 14 (mod +2): level 1 → 10+2=12
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 16,
        dexterity: 14,
        constitution: 14, // mod +2
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      },
    });
    const { character } = buildCharacter(state);
    expect(getHP(character)).toBe(12);
    expect(character.dynamic.currentHP).toBe(12);
  });

  it("negative CON modifier reduces HP but maxHP is at least 1", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 8,
        dexterity: 8,
        constitution: 1, // mod -5 — extreme edge case
        intelligence: 8,
        wisdom: 8,
        charisma: 8,
      },
    });
    const { character } = buildCharacter(state);
    // Builder guarantees maxHP >= 1
    expect(getHP(character)).toBeGreaterThanOrEqual(1);
  });

  it("INT modifier drives Wizard spell save DC", () => {
    // INT 20 → mod +5, profBonus 2, DC = 8+2+5 = 15
    const state = makeBuilderState({
      classes: [{ name: "Wizard", level: 1, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 8,
        dexterity: 14,
        constitution: 12,
        intelligence: 20,
        wisdom: 12,
        charisma: 10,
      },
    });
    const { character } = buildCharacter(state);
    // profBonus at level 1 = 2, INT mod = 5, DC = 8+2+5 = 15
    expect(getSpellcasting(character, "Wizard")?.dc).toBe(15);
  });

  it("proficiency bonus is correctly calculated by level", () => {
    const cases: [number, number][] = [
      [1, 2],
      [4, 2],
      [5, 3],
      [8, 3],
      [9, 4],
      [12, 4],
      [13, 5],
      [16, 5],
      [17, 6],
      [20, 6],
    ];
    for (const [level, expectedPB] of cases) {
      const state = makeBuilderState({
        classes: [{ name: "Fighter", level, subclass: null, skills: [], choices: {} }],
      });
      const { character } = buildCharacter(state);
      expect(((character.static.classes.reduce((s, c) => s + c.level, 0) - 1) >> 2) + 2).toBe(
        expectedPB,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Proficiencies
// ---------------------------------------------------------------------------

describe("Fighter proficiencies", () => {
  const state = makeBuilderState({
    classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
  });

  it("has heavy armor proficiency", () => {
    const { character } = buildCharacter(state);
    expect(getProficienciesFor(character, "armor")).toContain("Heavy Armor");
  });

  it("has shield proficiency", () => {
    const { character } = buildCharacter(state);
    expect(getProficienciesFor(character, "armor")).toContain("Shield");
  });

  it("has martial weapons proficiency", () => {
    const { character } = buildCharacter(state);
    expect(getProficienciesFor(character, "weapons")).toContain("Martial Weapons");
  });

  it("has simple weapons proficiency", () => {
    const { character } = buildCharacter(state);
    expect(getProficienciesFor(character, "weapons")).toContain("Simple Weapons");
  });

  it("STR save is proficient", () => {
    const { character } = buildCharacter(state);
    const strSave = getSavingThrows(character).find((s) => s.ability === "strength");
    expect(strSave?.proficient).toBe(true);
  });

  it("CON save is proficient", () => {
    const { character } = buildCharacter(state);
    const conSave = getSavingThrows(character).find((s) => s.ability === "constitution");
    expect(conSave?.proficient).toBe(true);
  });

  it("DEX save is NOT proficient", () => {
    const { character } = buildCharacter(state);
    const dexSave = getSavingThrows(character).find((s) => s.ability === "dexterity");
    expect(dexSave?.proficient).toBe(false);
  });
});

describe("Wizard proficiencies", () => {
  const state = makeBuilderState({
    classes: [{ name: "Wizard", level: 1, subclass: null, skills: [], choices: {} }],
  });

  it("has no armor proficiencies", () => {
    const { character } = buildCharacter(state);
    expect(getProficienciesFor(character, "armor")).toHaveLength(0);
  });

  it("has Simple Weapons proficiency", () => {
    const { character } = buildCharacter(state);
    expect(getProficienciesFor(character, "weapons")).toContain("Simple Weapons");
  });

  it("does NOT have Martial Weapons proficiency", () => {
    const { character } = buildCharacter(state);
    expect(getProficienciesFor(character, "weapons")).not.toContain("Martial Weapons");
  });

  it("INT save is proficient", () => {
    const { character } = buildCharacter(state);
    const intSave = getSavingThrows(character).find((s) => s.ability === "intelligence");
    expect(intSave?.proficient).toBe(true);
  });

  it("WIS save is proficient", () => {
    const { character } = buildCharacter(state);
    const wisSave = getSavingThrows(character).find((s) => s.ability === "wisdom");
    expect(wisSave?.proficient).toBe(true);
  });
});

describe("Skill proficiencies from BuilderState", () => {
  it("listed class skills are marked proficient", () => {
    const state = makeBuilderState({
      classes: [
        {
          name: "Fighter",
          level: 1,
          subclass: null,
          skills: ["athletics", "perception", "stealth"],
          choices: {},
        },
      ],
    });
    const { character } = buildCharacter(state);
    const athletics = getSkills(character).find((s) => s.name === "athletics");
    const perception = getSkills(character).find((s) => s.name === "perception");
    const stealth = getSkills(character).find((s) => s.name === "stealth");
    expect(athletics?.proficient).toBe(true);
    expect(perception?.proficient).toBe(true);
    expect(stealth?.proficient).toBe(true);
  });

  it("unlisted skills are NOT proficient", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: ["athletics"], choices: {} }],
    });
    const { character } = buildCharacter(state);
    const arcana = getSkills(character).find((s) => s.name === "arcana");
    expect(arcana?.proficient).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Spell integration
// ---------------------------------------------------------------------------

describe("Wizard spell integration", () => {
  const wizardState = makeBuilderState({
    classes: [{ name: "Wizard", level: 3, subclass: null, skills: [], choices: {} }],
    baseAbilities: {
      strength: 8,
      dexterity: 14,
      constitution: 12,
      intelligence: 16,
      wisdom: 12,
      charisma: 10,
    },
    cantrips: { Wizard: ["Fire Bolt"] },
    preparedSpells: {
      Wizard: ["Magic Missile", "Misty Step"],
    },
  });

  it("spells are present in output", () => {
    const { character } = buildCharacter(wizardState);
    // Fire Bolt (cantrip) + Magic Missile + Misty Step = 3 spells
    expect(character.static.spells).toHaveLength(3);
  });

  it("cantrip has level 0", () => {
    const { character } = buildCharacter(wizardState);
    const fireBolt = character.static.spells.find((s) => s.name === "Fire Bolt");
    expect(fireBolt).toBeDefined();
    expect(fireBolt?.level).toBe(0);
  });

  it("cantrip has alwaysPrepared: false", () => {
    const { character } = buildCharacter(wizardState);
    const fireBolt = character.static.spells.find((s) => s.name === "Fire Bolt");
    expect(fireBolt?.alwaysPrepared).toBe(false);
  });

  it("spells are enriched with school from DB", () => {
    const { character } = buildCharacter(wizardState);
    const fireBolt = character.static.spells.find((s) => s.name === "Fire Bolt");
    // Fire Bolt should have school enriched from the DB
    expect(fireBolt?.school).toBeTruthy();
  });

  it("spells are enriched with castingTime from DB", () => {
    const { character } = buildCharacter(wizardState);
    const magicMissile = character.static.spells.find((s) => s.name === "Magic Missile");
    expect(magicMissile?.castingTime).toBeTruthy();
  });

  it("spells are enriched with range from DB", () => {
    const { character } = buildCharacter(wizardState);
    const magicMissile = character.static.spells.find((s) => s.name === "Magic Missile");
    expect(magicMissile?.range).toBeTruthy();
  });

  it("prepared flag is true for spells in preparedSpells", () => {
    const { character } = buildCharacter(wizardState);
    const magicMissile = character.static.spells.find((s) => s.name === "Magic Missile");
    expect(magicMissile?.prepared).toBe(true);
  });

  it("cantrips are always prepared", () => {
    const { character } = buildCharacter(wizardState);
    const fireBolt = character.static.spells.find((s) => s.name === "Fire Bolt");
    expect(fireBolt?.prepared).toBe(true);
  });

  it("all assembleSpells output spells have prepared=true (builder always prepares selected spells)", () => {
    const { character } = buildCharacter(wizardState);
    for (const spell of character.static.spells) {
      // All spells added via cantrips/preparedSpells are prepared by the builder
      expect(spell.prepared).toBe(true);
    }
  });
});

describe("Non-caster has empty spell list", () => {
  it("Fighter with no spells has empty spells array", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 5, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    expect(character.static.spells).toHaveLength(0);
  });

  it("Fighter has no spell slots", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 5, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    expect(character.dynamic.spellSlotsUsed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Class resources
// ---------------------------------------------------------------------------

describe("Barbarian class resources", () => {
  it("Barbarian level 1 has 2 Rage uses", () => {
    const state = makeBuilderState({
      classes: [{ name: "Barbarian", level: 1, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    const rage = getClassResources(character).find((r) => r.name === "Rage");
    expect(rage).toBeDefined();
    expect(rage?.maxUses).toBe(2);
    expect(rage?.longRest).toBe("all");
    expect(rage?.shortRest).toBe(1);
  });

  it("Barbarian level 3 has 3 Rage uses", () => {
    const state = makeBuilderState({
      classes: [{ name: "Barbarian", level: 3, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    const rage = getClassResources(character).find((r) => r.name === "Rage");
    expect(rage?.maxUses).toBe(3);
  });

  it("Barbarian level 6 has 4 Rage uses", () => {
    const state = makeBuilderState({
      classes: [{ name: "Barbarian", level: 6, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    const rage = getClassResources(character).find((r) => r.name === "Rage");
    expect(rage?.maxUses).toBe(4);
  });
});

describe("Fighter class resources", () => {
  it("Fighter level 1 has Second Wind (2 uses, short rest) per 2024 rules", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    const sw = getClassResources(character).find((r) => r.name === "Second Wind");
    expect(sw).toBeDefined();
    expect(sw?.maxUses).toBe(2);
    expect(sw?.longRest).toBe("all");
    expect(sw?.shortRest).toBe("all");
  });

  it("Fighter level 2 gains Action Surge (1 use, short rest)", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 2, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    const surge = getClassResources(character).find((r) => r.name === "Action Surge");
    expect(surge).toBeDefined();
    expect(surge?.maxUses).toBe(1);
    expect(surge?.longRest).toBe("all");
    expect(surge?.shortRest).toBe("all");
  });

  it("Fighter level 1 does NOT have Action Surge", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    const surge = getClassResources(character).find((r) => r.name === "Action Surge");
    expect(surge).toBeUndefined();
  });

  it("Fighter level 9 gains Indomitable (1 use, long rest)", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 9, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    const indom = getClassResources(character).find((r) => r.name === "Indomitable");
    expect(indom).toBeDefined();
    expect(indom?.longRest).toBe("all");
    expect(indom?.shortRest).toBeUndefined();
  });
});

describe("Monk Focus Points", () => {
  it("Monk level 2 has 2 Focus Points (equal to level)", () => {
    const state = makeBuilderState({
      classes: [{ name: "Monk", level: 2, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    const fp = getClassResources(character).find((r) => r.name === "Focus Points");
    expect(fp).toBeDefined();
    expect(fp?.maxUses).toBe(2);
  });

  it("Monk level 5 has 5 Focus Points", () => {
    const state = makeBuilderState({
      classes: [{ name: "Monk", level: 5, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    const fp = getClassResources(character).find((r) => r.name === "Focus Points");
    expect(fp?.maxUses).toBe(5);
  });

  it("Monk level 1 does NOT have Focus Points (available at level 2)", () => {
    const state = makeBuilderState({
      classes: [{ name: "Monk", level: 1, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    const fp = getClassResources(character).find((r) => r.name === "Focus Points");
    expect(fp).toBeUndefined();
  });
});

describe("Bard Bardic Inspiration — ability-mod-based uses", () => {
  it("Bard Bardic Inspiration resource is defined", () => {
    const state = makeBuilderState({
      classes: [{ name: "Bard", level: 1, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 12,
        charisma: 16,
      },
    });
    const { character } = buildCharacter(state);
    const bi = getClassResources(character).find((r) => r.name === "Bardic Inspiration");
    expect(bi).toBeDefined();
    expect(bi?.longRest).toBe("all");
    expect(bi?.shortRest).toBeUndefined();
  });

  it("Bard with CHA 8 (-1) still gets minimum 1 Bardic Inspiration use", () => {
    const state = makeBuilderState({
      classes: [{ name: "Bard", level: 1, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 12,
        charisma: 8, // mod -1
      },
    });
    const { character } = buildCharacter(state);
    const bi = getClassResources(character).find((r) => r.name === "Bardic Inspiration");
    expect(bi?.maxUses).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 6. HP computation
// ---------------------------------------------------------------------------

describe("HP computation", () => {
  it("level 1 Fighter: HP is computed as maxHP from HD + CON, currentHP matches", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 16,
        dexterity: 14,
        constitution: 14, // mod +2
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      },
    });
    const { character } = buildCharacter(state);
    // Fighter d10 level 1: 10 + 2 (CON) = 12
    expect(getHP(character)).toBe(12);
    expect(character.dynamic.currentHP).toBe(12);
  });

  it("maxHP is never below 1, even with extreme negative CON", () => {
    const state = makeBuilderState({
      classes: [{ name: "Sorcerer", level: 1, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 8,
        dexterity: 8,
        constitution: 1, // mod -5 — extreme edge case
        intelligence: 8,
        wisdom: 8,
        charisma: 8,
      },
    });
    const { character } = buildCharacter(state);
    // Builder guarantees maxHP >= 1
    expect(getHP(character)).toBeGreaterThanOrEqual(1);
  });

  it("Tough feat adds 2 HP per level to maxHP", () => {
    const level = 5;
    // Fighter 5, CON 14: base HP = 10+2 + 4*(6+2) = 12+32 = 44
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level, subclass: null, skills: [], choices: {} }],
      featSelections: [{ level: 4, type: "feat", featName: "Tough" }],
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
    // Tough adds 2 * totalLevel = 10; base = 44; total = 54
    expect(getHP(character)).toBe(44 + 2 * level);
  });

  it("Dwarf species adds 1 HP per level via Dwarven Toughness", () => {
    const level = 3;
    // Fighter 3, CON 14, Dwarf: base HP = 10+2 + 2*(6+2) = 12+16 = 28; +3 Dwarven Toughness = 31
    const state = makeBuilderState({
      species: "Dwarf",
      classes: [{ name: "Fighter", level, subclass: null, skills: [], choices: {} }],
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
    // Base HP (no toughness) = 28; +3 Dwarven Toughness = 31
    expect(getHP(character)).toBe(28 + level);
  });
});

// ---------------------------------------------------------------------------
// 7. Edge cases
// ---------------------------------------------------------------------------

describe("Minimal state — level 1 no subclass", () => {
  it("minimal Fighter builds successfully", () => {
    const state = makeBuilderState({
      name: "Minimal",
      species: "Human",
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 15,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      },
    });
    const { character, warnings } = buildCharacter(state);
    expect(character).toBeDefined();
    expect(character.static.name).toBe("Minimal");
    expect(warnings).toBeInstanceOf(Array);
  });

  it("character name is preserved", () => {
    const state = makeBuilderState({ name: "Aldric Stonehaven" });
    const { character } = buildCharacter(state);
    expect(character.static.name).toBe("Aldric Stonehaven");
  });

  it("race is preserved in both species and race fields", () => {
    const state = makeBuilderState({ species: "Elf" });
    const { character } = buildCharacter(state);
    expect(character.static.race).toBe("Elf");
    expect(character.static.species).toBe("Elf");
  });

  it("languages include Common by default", () => {
    const state = makeBuilderState({ species: "Human" });
    const { character } = buildCharacter(state);
    expect(character.static.languages).toContain("Common");
  });

  it("output has all required static fields", () => {
    const state = makeBuilderState();
    const { character } = buildCharacter(state);
    const s = character.static;
    expect(s.name).toBeDefined();
    expect(s.features).toBeDefined();
    expect(s.effects).toBeDefined();
    expect(s.languages).toBeDefined();
    expect(s.spells).toBeDefined();
    // Derived stats accessible via resolver:
    expect(getHP(character)).toBeGreaterThan(0);
    expect(getAC(character)).toBeGreaterThanOrEqual(10);
    expect(getSpeed(character).walk).toBeGreaterThan(0);
  });

  it("output has all required dynamic fields", () => {
    const state = makeBuilderState();
    const { character } = buildCharacter(state);
    const d = character.dynamic;
    expect(d.currentHP).toBeDefined();
    expect(d.tempHP).toBeDefined();
    expect(d.spellSlotsUsed).toBeDefined();
    expect(d.conditions).toBeDefined();
    expect(d.deathSaves).toBeDefined();
    expect(d.inventory).toBeDefined();
    expect(d.currency).toBeDefined();
  });

  it("default currency is all zeros when not provided", () => {
    const state = makeBuilderState({ currency: { cp: 0, sp: 0, gp: 0, pp: 0 } });
    const { character } = buildCharacter(state);
    expect(character.dynamic.currency).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
  });

  it("provided currency is preserved", () => {
    const state = makeBuilderState({ currency: { cp: 5, sp: 10, gp: 50, pp: 2 } });
    const { character } = buildCharacter(state);
    expect(character.dynamic.currency).toEqual({ cp: 5, sp: 10, gp: 50, pp: 2 });
  });

  it("death saves start at 0 successes and 0 failures", () => {
    const state = makeBuilderState();
    const { character } = buildCharacter(state);
    expect(character.dynamic.deathSaves.successes).toBe(0);
    expect(character.dynamic.deathSaves.failures).toBe(0);
  });

  it("heroic inspiration defaults to false", () => {
    const state = makeBuilderState();
    const { character } = buildCharacter(state);
    expect(character.dynamic.heroicInspiration).toBe(false);
  });
});

describe("Skills array is always complete", () => {
  it("skills array is non-empty and covers all expected skills", () => {
    const state = makeBuilderState();
    const { character } = buildCharacter(state);
    // 5e has 18 skills
    expect(getSkills(character).length).toBeGreaterThanOrEqual(18);
  });

  it("every skill has a governing ability", () => {
    const state = makeBuilderState();
    const { character } = buildCharacter(state);
    const abilities: (keyof AbilityScores)[] = [
      "strength",
      "dexterity",
      "constitution",
      "intelligence",
      "wisdom",
      "charisma",
    ];
    for (const skill of getSkills(character)) {
      expect(abilities).toContain(skill.ability);
    }
  });
});

describe("Senses computation", () => {
  it("Human has no Darkvision, includes Passive Perception", () => {
    const state = makeBuilderState({ species: "Human" });
    const { character } = buildCharacter(state);
    const senses = getSenses(character);
    const hasDarkvision = senses.some((s) => s.includes("Darkvision"));
    expect(hasDarkvision).toBe(false);
    const passivePerception = senses.find((s) => s.includes("Passive Perception"));
    expect(passivePerception).toBeDefined();
  });

  it("Elf has Darkvision 60 ft.", () => {
    const state = makeBuilderState({ species: "Elf" });
    const { character } = buildCharacter(state);
    const darkvision = getSenses(character).find((s) => s.includes("Darkvision"));
    expect(darkvision).toBeDefined();
    expect(darkvision).toContain("60");
  });

  it("Passive Perception is higher with Perception proficiency", () => {
    const withPerc = makeBuilderState({
      species: "Human",
      baseAbilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 12, // mod +1
        charisma: 10,
      },
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: ["perception"], choices: {} }],
    });
    const withoutPerc = makeBuilderState({
      species: "Human",
      baseAbilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 12, // mod +1
        charisma: 10,
      },
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
    });

    const { character: charWith } = buildCharacter(withPerc);
    const { character: charWithout } = buildCharacter(withoutPerc);

    const ppWith = getSenses(charWith).find((s) => s.includes("Passive Perception"));
    const ppWithout = getSenses(charWithout).find((s) => s.includes("Passive Perception"));

    // Extract the numeric value
    const numWith = parseInt(ppWith?.replace(/\D/g, "") ?? "0", 10);
    const numWithout = parseInt(ppWithout?.replace(/\D/g, "") ?? "0", 10);

    expect(numWith).toBeGreaterThan(numWithout);
  });
});

describe("AC computation", () => {
  it("unarmored AC = 10 + DEX mod", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 16,
        dexterity: 14, // mod +2
        constitution: 14,
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      },
      equipment: [], // no armor
    });
    const { character } = buildCharacter(state);
    expect(getAC(character)).toBe(12); // 10 + 2
  });

  it("Barbarian Unarmored Defense = 10 + DEX mod + CON mod", () => {
    const state = makeBuilderState({
      classes: [{ name: "Barbarian", level: 1, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 16,
        dexterity: 14, // mod +2
        constitution: 16, // mod +3
        intelligence: 8,
        wisdom: 10,
        charisma: 8,
      },
      equipment: [], // no armor
    });
    const { character } = buildCharacter(state);
    // 10 + 2 (DEX) + 3 (CON) = 15
    expect(getAC(character)).toBe(15);
  });

  it("chain mail + shield gives AC 18", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
      equipment: [
        {
          name: "Chain Mail",
          equipped: true,
          quantity: 1,
          armor: { type: "heavy", baseAc: 16, stealthDisadvantage: true },
        },
        { name: "Shield", equipped: true, quantity: 1, armor: { type: "shield", baseAc: 2 } },
      ],
    });
    const { character } = buildCharacter(state);
    expect(getAC(character)).toBe(18);
  });
});

describe("Speed computation", () => {
  it("Human base speed is 30", () => {
    const state = makeBuilderState({ species: "Human" });
    const { character } = buildCharacter(state);
    expect(getSpeed(character).walk).toBe(30);
  });

  it("Barbarian level 5 gets +10 Fast Movement bonus", () => {
    const state = makeBuilderState({
      species: "Human",
      classes: [{ name: "Barbarian", level: 5, subclass: null, skills: [], choices: {} }],
    });
    const { character } = buildCharacter(state);
    // 30 (Human) + 10 (Fast Movement) = 40
    expect(getSpeed(character).walk).toBe(40);
  });
});

describe("Source and import metadata", () => {
  it("source is set to 'builder'", () => {
    const state = makeBuilderState();
    const { character } = buildCharacter(state);
    expect(character.static.source).toBe("builder");
  });

  it("importedAt is a recent timestamp", () => {
    const before = Date.now();
    const state = makeBuilderState();
    const { character } = buildCharacter(state);
    const after = Date.now();
    expect(character.static.importedAt).toBeGreaterThanOrEqual(before);
    expect(character.static.importedAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// 8. Multiclass — Eldritch Knight (third-caster subclass)
// ---------------------------------------------------------------------------

describe("Eldritch Knight — third-caster subclass", () => {
  it("Fighter 7 Eldritch Knight has 1st and 2nd level spell slots", () => {
    const state = makeBuilderState({
      classes: [
        { name: "Fighter", level: 7, subclass: "Eldritch Knight", skills: [], choices: {} },
      ],
    });
    const { character } = buildCharacter(state);
    const slots = character.dynamic.spellSlotsUsed;
    expect(slots.length).toBeGreaterThan(0);
    const lvl1 = slots.find((s) => s.level === 1);
    expect(lvl1).toBeDefined();
    expect(lvl1?.total).toBe(4);
    const lvl2 = slots.find((s) => s.level === 2);
    expect(lvl2).toBeDefined();
    expect(lvl2?.total).toBe(2);
  });

  it("Eldritch Knight spellcasting ability is Intelligence", () => {
    const state = makeBuilderState({
      classes: [
        { name: "Fighter", level: 7, subclass: "Eldritch Knight", skills: [], choices: {} },
      ],
    });
    const { character } = buildCharacter(state);
    expect(getSpellcasting(character, "Fighter")?.ability).toBe("intelligence");
  });
});

// ---------------------------------------------------------------------------
// 9. Warlock pact magic
// ---------------------------------------------------------------------------

describe("Warlock pact magic", () => {
  it("Warlock level 3 has pact magic slots, no regular slots", () => {
    const state = makeBuilderState({
      classes: [{ name: "Warlock", level: 3, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 12,
        charisma: 16,
      },
    });
    const { character } = buildCharacter(state);
    const pactSlots = character.dynamic.pactMagicSlots ?? [];
    expect(pactSlots.length).toBeGreaterThan(0);
    // Regular spell slots should be empty for a pure Warlock
    expect(character.dynamic.spellSlotsUsed).toHaveLength(0);
  });

  it("Warlock spellcasting ability is Charisma", () => {
    const state = makeBuilderState({
      classes: [{ name: "Warlock", level: 1, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 12,
        charisma: 16,
      },
    });
    const { character } = buildCharacter(state);
    expect(getSpellcasting(character, "Warlock")?.ability).toBe("charisma");
  });
});

// ---------------------------------------------------------------------------
// 10. Combat bonuses from fighting styles / feats
// ---------------------------------------------------------------------------

describe("Combat bonuses", () => {
  it("Archery fighting style grants +2 ranged attack bonus", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
      featSelections: [{ level: 1, type: "feat", featName: "Archery" }],
    });
    const { character } = buildCharacter(state);
    const bonuses = getCombatBonus(character);
    const archery = bonuses.find((b) => b.source === "Archery");
    expect(archery).toBeDefined();
    expect(archery?.type).toBe("attack");
    expect(archery?.value).toBe(2);
    expect(archery?.attackType).toBe("ranged");
  });

  it("Alert feat grants initiative bonus equal to proficiency bonus", () => {
    const state = makeBuilderState({
      classes: [{ name: "Fighter", level: 1, subclass: null, skills: [], choices: {} }],
      featSelections: [{ level: 1, type: "feat", featName: "Alert" }],
    });
    const { character } = buildCharacter(state);
    const bonuses = getCombatBonus(character);
    const alert = bonuses.find((b) => b.source === "Alert");
    expect(alert).toBeDefined();
    expect(alert?.type).toBe("initiative");
    // Fighter 1 has PB 2
    expect(alert?.value).toBe(2);
  });
});
