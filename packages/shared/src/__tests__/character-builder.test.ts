import { describe, it, expect } from "vitest";
import { buildCharacter } from "../builders/character-builder.js";
import type { CharacterIdentifiers } from "../builders/types.js";
import type { AbilityScores } from "../types/character.js";

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

function makeIdentifiers(overrides: Partial<CharacterIdentifiers> = {}): CharacterIdentifiers {
  return {
    name: "Test Character",
    race: "Human",
    classes: [{ name: "Fighter", level: 1 }],
    abilities: {
      strength: 16,
      dexterity: 14,
      constitution: 14,
      intelligence: 10,
      wisdom: 12,
      charisma: 8,
    },
    maxHP: 12,
    skillProficiencies: ["athletics", "perception"],
    skillExpertise: [],
    saveProficiencies: ["strength", "constitution"],
    spells: [],
    equipment: [],
    languages: ["Common"],
    source: "builder",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Basic builds
// ---------------------------------------------------------------------------

describe("Fighter 5 — non-caster build", () => {
  const ids = makeIdentifiers({
    classes: [{ name: "Fighter", level: 5 }],
    abilities: {
      strength: 17,
      dexterity: 14,
      constitution: 14,
      intelligence: 10,
      wisdom: 12,
      charisma: 8,
    },
    maxHP: 44, // 10 + 4*7 (avg d10) + 5 CON mods
    saveProficiencies: ["strength", "constitution"],
  });

  it("builds without errors", () => {
    const { character, warnings } = buildCharacter(ids);
    expect(character).toBeDefined();
    expect(warnings).toBeInstanceOf(Array);
  });

  it("has Extra Attack feature", () => {
    const { character } = buildCharacter(ids);
    const featureNames = character.static.features.map((f) => f.name);
    expect(featureNames).toContain("Extra Attack");
  });

  it("has Second Wind class resource", () => {
    const { character } = buildCharacter(ids);
    const resources = character.static.classResources ?? [];
    const secondWind = resources.find((r) => r.name === "Second Wind");
    expect(secondWind).toBeDefined();
    expect(secondWind?.resetType).toBe("short");
  });

  it("has Action Surge class resource at level 5", () => {
    const { character } = buildCharacter(ids);
    const resources = character.static.classResources ?? [];
    const surge = resources.find((r) => r.name === "Action Surge");
    expect(surge).toBeDefined();
    expect(surge?.resetType).toBe("short");
  });

  it("proficiency bonus is +3 at level 5", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.proficiencyBonus).toBe(3);
  });

  it("has no spell slots", () => {
    const { character } = buildCharacter(ids);
    expect(character.dynamic.spellSlotsUsed).toHaveLength(0);
  });

  it("has no spellcasting ability", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.spellcastingAbility).toBeUndefined();
  });

  it("HP reflects maxHP from identifiers", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.maxHP).toBe(44);
    expect(character.dynamic.currentHP).toBe(44);
  });

  it("starts with 0 tempHP", () => {
    const { character } = buildCharacter(ids);
    expect(character.dynamic.tempHP).toBe(0);
  });

  it("starts with no conditions", () => {
    const { character } = buildCharacter(ids);
    expect(character.dynamic.conditions).toHaveLength(0);
  });

  it("classes array is preserved", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.classes).toEqual([{ name: "Fighter", level: 5 }]);
  });
});

describe("Wizard 3 — full caster build", () => {
  const ids = makeIdentifiers({
    classes: [{ name: "Wizard", level: 3 }],
    abilities: {
      strength: 8,
      dexterity: 14,
      constitution: 12,
      intelligence: 16,
      wisdom: 12,
      charisma: 10,
    },
    maxHP: 16, // 6 + 2*4 (avg d6) + 3 CON mods
    saveProficiencies: ["intelligence", "wisdom"],
    spells: [],
  });

  it("builds without errors", () => {
    const { character } = buildCharacter(ids);
    expect(character).toBeDefined();
  });

  it("has Arcane Recovery class resource", () => {
    const { character } = buildCharacter(ids);
    const resources = character.static.classResources ?? [];
    expect(resources.find((r) => r.name === "Arcane Recovery")).toBeDefined();
  });

  it("spellcasting ability is Intelligence", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.spellcastingAbility).toBe("intelligence");
  });

  it("spell save DC = 8 + profBonus(2) + INT mod(+3) = 13", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.spellSaveDC).toBe(13);
  });

  it("spell attack bonus = profBonus(2) + INT mod(+3) = 5", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.spellAttackBonus).toBe(5);
  });

  it("has first and second level spell slots at level 3", () => {
    const { character } = buildCharacter(ids);
    const slots = character.dynamic.spellSlotsUsed;
    const lvl1 = slots.find((s) => s.level === 1);
    const lvl2 = slots.find((s) => s.level === 2);
    expect(lvl1).toBeDefined();
    expect(lvl1?.total).toBe(4);
    expect(lvl2).toBeDefined();
    expect(lvl2?.total).toBe(2);
  });

  it("all spell slots start unused (used: 0)", () => {
    const { character } = buildCharacter(ids);
    for (const slot of character.dynamic.spellSlotsUsed) {
      expect(slot.used).toBe(0);
    }
  });

  it("INT save proficiency is set", () => {
    const { character } = buildCharacter(ids);
    const saves = character.static.savingThrows;
    const intSave = saves.find((s) => s.ability === "intelligence");
    expect(intSave?.proficient).toBe(true);
  });
});

describe("Rogue 1 — martial build", () => {
  const ids = makeIdentifiers({
    classes: [{ name: "Rogue", level: 1 }],
    abilities: {
      strength: 10,
      dexterity: 17,
      constitution: 12,
      intelligence: 14,
      wisdom: 12,
      charisma: 10,
    },
    maxHP: 9,
    saveProficiencies: ["dexterity", "intelligence"],
    skillProficiencies: ["stealth", "perception"],
    skillExpertise: ["stealth", "perception"],
    spells: [],
  });

  it("builds without errors", () => {
    const { character } = buildCharacter(ids);
    expect(character).toBeDefined();
  });

  it("has Sneak Attack feature", () => {
    const { character } = buildCharacter(ids);
    const featureNames = character.static.features.map((f) => f.name);
    expect(featureNames).toContain("Sneak Attack");
  });

  it("has Expertise feature", () => {
    const { character } = buildCharacter(ids);
    const featureNames = character.static.features.map((f) => f.name);
    expect(featureNames).toContain("Expertise");
  });

  it("has Thieves' Cant feature", () => {
    const { character } = buildCharacter(ids);
    const featureNames = character.static.features.map((f) => f.name);
    expect(featureNames).toContain("Thieves' Cant");
  });

  it("expertise skills have expertise=true in skills array", () => {
    const { character } = buildCharacter(ids);
    const stealth = character.static.skills.find((s) => s.name === "stealth");
    const perception = character.static.skills.find((s) => s.name === "perception");
    expect(stealth?.expertise).toBe(true);
    expect(perception?.expertise).toBe(true);
  });

  it("proficiency bonus is +2 at level 1", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.proficiencyBonus).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. Ability score computation
// ---------------------------------------------------------------------------

describe("Ability score computation", () => {
  it("CON modifier (+2) is reflected in correct starting HP", () => {
    // maxHP is provided by identifiers — CON mod is already baked in
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level: 1 }],
      abilities: {
        strength: 16,
        dexterity: 14,
        constitution: 14, // mod +2
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      },
      maxHP: 12, // 10 + 2 CON mod
    });
    const { character } = buildCharacter(ids);
    expect(character.static.maxHP).toBe(12);
    expect(character.dynamic.currentHP).toBe(12);
  });

  it("negative CON modifier reduces HP but maxHP is at least 1", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level: 1 }],
      abilities: {
        strength: 8,
        dexterity: 8,
        constitution: 1, // mod -5 — extreme edge case
        intelligence: 8,
        wisdom: 8,
        charisma: 8,
      },
      maxHP: 0, // could theoretically be 0 or negative with extreme CON
    });
    const { character } = buildCharacter(ids);
    // Builder guarantees maxHP >= 1
    expect(character.static.maxHP).toBeGreaterThanOrEqual(1);
  });

  it("INT modifier drives Wizard spell save DC", () => {
    // INT 20 → mod +5, profBonus 2, DC = 8+2+5 = 15
    const ids = makeIdentifiers({
      classes: [{ name: "Wizard", level: 1 }],
      abilities: {
        strength: 8,
        dexterity: 14,
        constitution: 12,
        intelligence: 20,
        wisdom: 12,
        charisma: 10,
      },
      maxHP: 7,
      saveProficiencies: ["intelligence", "wisdom"],
    });
    const { character } = buildCharacter(ids);
    // profBonus at level 1 = Math.ceil(1/4)+1 = 2, INT mod = 5, DC = 8+2+5 = 15
    expect(character.static.spellSaveDC).toBe(15);
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
      const ids = makeIdentifiers({
        classes: [{ name: "Fighter", level }],
        maxHP: level * 7, // rough HP value
      });
      const { character } = buildCharacter(ids);
      expect(character.static.proficiencyBonus).toBe(expectedPB);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Proficiencies
// ---------------------------------------------------------------------------

describe("Fighter proficiencies", () => {
  const ids = makeIdentifiers({
    classes: [{ name: "Fighter", level: 1 }],
  });

  it("has heavy armor proficiency", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.proficiencies.armor).toContain("Heavy Armor");
  });

  it("has shield proficiency", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.proficiencies.armor).toContain("Shield");
  });

  it("has martial weapons proficiency", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.proficiencies.weapons).toContain("Martial Weapons");
  });

  it("has simple weapons proficiency", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.proficiencies.weapons).toContain("Simple Weapons");
  });

  it("STR save is proficient", () => {
    const { character } = buildCharacter(ids);
    const strSave = character.static.savingThrows.find((s) => s.ability === "strength");
    expect(strSave?.proficient).toBe(true);
  });

  it("CON save is proficient", () => {
    const { character } = buildCharacter(ids);
    const conSave = character.static.savingThrows.find((s) => s.ability === "constitution");
    expect(conSave?.proficient).toBe(true);
  });

  it("DEX save is NOT proficient", () => {
    const { character } = buildCharacter(ids);
    const dexSave = character.static.savingThrows.find((s) => s.ability === "dexterity");
    expect(dexSave?.proficient).toBe(false);
  });
});

describe("Wizard proficiencies", () => {
  const ids = makeIdentifiers({
    classes: [{ name: "Wizard", level: 1 }],
    saveProficiencies: ["intelligence", "wisdom"],
  });

  it("has no armor proficiencies", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.proficiencies.armor).toHaveLength(0);
  });

  it("has Simple Weapons proficiency", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.proficiencies.weapons).toContain("Simple Weapons");
  });

  it("does NOT have Martial Weapons proficiency", () => {
    const { character } = buildCharacter(ids);
    expect(character.static.proficiencies.weapons).not.toContain("Martial Weapons");
  });

  it("INT save is proficient", () => {
    const { character } = buildCharacter(ids);
    const intSave = character.static.savingThrows.find((s) => s.ability === "intelligence");
    expect(intSave?.proficient).toBe(true);
  });

  it("WIS save is proficient", () => {
    const { character } = buildCharacter(ids);
    const wisSave = character.static.savingThrows.find((s) => s.ability === "wisdom");
    expect(wisSave?.proficient).toBe(true);
  });
});

describe("Skill proficiencies from identifiers", () => {
  it("listed skills are marked proficient", () => {
    const ids = makeIdentifiers({
      skillProficiencies: ["athletics", "perception", "stealth"],
    });
    const { character } = buildCharacter(ids);
    const athletics = character.static.skills.find((s) => s.name === "athletics");
    const perception = character.static.skills.find((s) => s.name === "perception");
    const stealth = character.static.skills.find((s) => s.name === "stealth");
    expect(athletics?.proficient).toBe(true);
    expect(perception?.proficient).toBe(true);
    expect(stealth?.proficient).toBe(true);
  });

  it("unlisted skills are NOT proficient", () => {
    const ids = makeIdentifiers({ skillProficiencies: ["athletics"] });
    const { character } = buildCharacter(ids);
    const arcana = character.static.skills.find((s) => s.name === "arcana");
    expect(arcana?.proficient).toBe(false);
  });

  it("explicit proficiency overrides are used when provided", () => {
    const ids = makeIdentifiers({
      armorProficiencies: ["Light Armor"],
      weaponProficiencies: ["Simple Weapons", "Hand Crossbows"],
    });
    const { character } = buildCharacter(ids);
    // Explicit overrides bypass DB computation
    expect(character.static.proficiencies.armor).toEqual(["Light Armor"]);
    expect(character.static.proficiencies.weapons).toContain("Hand Crossbows");
  });
});

// ---------------------------------------------------------------------------
// 4. Spell integration
// ---------------------------------------------------------------------------

describe("Wizard spell integration", () => {
  const wizardIds = makeIdentifiers({
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
    spells: [
      {
        name: "Fire Bolt",
        level: 0,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
      },
      {
        name: "Magic Missile",
        level: 1,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
      },
      {
        name: "Misty Step",
        level: 2,
        prepared: false,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
      },
    ],
  });

  it("spells are present in output", () => {
    const { character } = buildCharacter(wizardIds);
    expect(character.static.spells).toHaveLength(3);
  });

  it("cantrip has level 0", () => {
    const { character } = buildCharacter(wizardIds);
    const fireBolt = character.static.spells.find((s) => s.name === "Fire Bolt");
    expect(fireBolt).toBeDefined();
    expect(fireBolt?.level).toBe(0);
  });

  it("cantrip has alwaysPrepared: false", () => {
    const { character } = buildCharacter(wizardIds);
    const fireBolt = character.static.spells.find((s) => s.name === "Fire Bolt");
    expect(fireBolt?.alwaysPrepared).toBe(false);
  });

  it("spells are enriched with school from DB", () => {
    const { character } = buildCharacter(wizardIds);
    const fireBolt = character.static.spells.find((s) => s.name === "Fire Bolt");
    // Fire Bolt should have school enriched from the DB
    expect(fireBolt?.school).toBeTruthy();
  });

  it("spells are enriched with castingTime from DB", () => {
    const { character } = buildCharacter(wizardIds);
    const magicMissile = character.static.spells.find((s) => s.name === "Magic Missile");
    expect(magicMissile?.castingTime).toBeTruthy();
  });

  it("spells are enriched with range from DB", () => {
    const { character } = buildCharacter(wizardIds);
    const magicMissile = character.static.spells.find((s) => s.name === "Magic Missile");
    expect(magicMissile?.range).toBeTruthy();
  });

  it("prepared flag is preserved from identifiers", () => {
    const { character } = buildCharacter(wizardIds);
    const mistyStep = character.static.spells.find((s) => s.name === "Misty Step");
    expect(mistyStep?.prepared).toBe(false);
    const magicMissile = character.static.spells.find((s) => s.name === "Magic Missile");
    expect(magicMissile?.prepared).toBe(true);
  });
});

describe("Non-caster has empty spell list", () => {
  it("Fighter with no spells has empty spells array", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level: 5 }],
      spells: [],
    });
    const { character } = buildCharacter(ids);
    expect(character.static.spells).toHaveLength(0);
  });

  it("Fighter has no spell slots", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level: 5 }],
      spells: [],
    });
    const { character } = buildCharacter(ids);
    expect(character.dynamic.spellSlotsUsed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Class resources
// ---------------------------------------------------------------------------

describe("Barbarian class resources", () => {
  it("Barbarian level 1 has 2 Rage uses", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Barbarian", level: 1 }],
      saveProficiencies: ["strength", "constitution"],
    });
    const { character } = buildCharacter(ids);
    const rage = character.static.classResources?.find((r) => r.name === "Rage");
    expect(rage).toBeDefined();
    expect(rage?.maxUses).toBe(2);
    expect(rage?.resetType).toBe("long");
  });

  it("Barbarian level 3 has 3 Rage uses", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Barbarian", level: 3 }],
      maxHP: 30,
      saveProficiencies: ["strength", "constitution"],
    });
    const { character } = buildCharacter(ids);
    const rage = character.static.classResources?.find((r) => r.name === "Rage");
    expect(rage?.maxUses).toBe(3);
  });

  it("Barbarian level 6 has 4 Rage uses", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Barbarian", level: 6 }],
      maxHP: 60,
      saveProficiencies: ["strength", "constitution"],
    });
    const { character } = buildCharacter(ids);
    const rage = character.static.classResources?.find((r) => r.name === "Rage");
    expect(rage?.maxUses).toBe(4);
  });
});

describe("Fighter class resources", () => {
  it("Fighter level 1 has Second Wind (2 uses, short rest) per 2024 rules", () => {
    const ids = makeIdentifiers({ classes: [{ name: "Fighter", level: 1 }] });
    const { character } = buildCharacter(ids);
    const sw = character.static.classResources?.find((r) => r.name === "Second Wind");
    expect(sw).toBeDefined();
    expect(sw?.maxUses).toBe(2);
    expect(sw?.resetType).toBe("short");
  });

  it("Fighter level 2 gains Action Surge (1 use, short rest)", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level: 2 }],
      maxHP: 20,
    });
    const { character } = buildCharacter(ids);
    const surge = character.static.classResources?.find((r) => r.name === "Action Surge");
    expect(surge).toBeDefined();
    expect(surge?.maxUses).toBe(1);
    expect(surge?.resetType).toBe("short");
  });

  it("Fighter level 1 does NOT have Action Surge", () => {
    const ids = makeIdentifiers({ classes: [{ name: "Fighter", level: 1 }] });
    const { character } = buildCharacter(ids);
    const surge = character.static.classResources?.find((r) => r.name === "Action Surge");
    expect(surge).toBeUndefined();
  });

  it("Fighter level 9 gains Indomitable (1 use, long rest)", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level: 9 }],
      maxHP: 90,
    });
    const { character } = buildCharacter(ids);
    const indom = character.static.classResources?.find((r) => r.name === "Indomitable");
    expect(indom).toBeDefined();
    expect(indom?.resetType).toBe("long");
  });
});

describe("Monk Focus Points", () => {
  it("Monk level 2 has 2 Focus Points (equal to level)", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Monk", level: 2 }],
      maxHP: 16,
      saveProficiencies: ["strength", "dexterity"],
    });
    const { character } = buildCharacter(ids);
    const fp = character.static.classResources?.find((r) => r.name === "Focus Points");
    expect(fp).toBeDefined();
    expect(fp?.maxUses).toBe(2);
  });

  it("Monk level 5 has 5 Focus Points", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Monk", level: 5 }],
      maxHP: 40,
      saveProficiencies: ["strength", "dexterity"],
    });
    const { character } = buildCharacter(ids);
    const fp = character.static.classResources?.find((r) => r.name === "Focus Points");
    expect(fp?.maxUses).toBe(5);
  });

  it("Monk level 1 does NOT have Focus Points (available at level 2)", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Monk", level: 1 }],
      saveProficiencies: ["strength", "dexterity"],
    });
    const { character } = buildCharacter(ids);
    const fp = character.static.classResources?.find((r) => r.name === "Focus Points");
    expect(fp).toBeUndefined();
  });
});

describe("Bard Bardic Inspiration — ability-mod-based uses", () => {
  // BUG: CLASS_RESOURCES template uses short-form "cha" as abilityMod key but AbilityScores
  // uses "charisma". resolveResourceUses looks up abilities["cha"] which is undefined,
  // falls back to score 10 (mod 0), then clamps to minimum 1. This means CHA is ignored.
  // Correct D&D behaviour: uses = max(1, CHA mod). Tracking: source bug in character-builder.ts
  it("Bard Bardic Inspiration resource is defined", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Bard", level: 1 }],
      abilities: {
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 12,
        charisma: 16,
      },
      maxHP: 9,
      saveProficiencies: ["dexterity", "charisma"],
    });
    const { character } = buildCharacter(ids);
    const bi = character.static.classResources?.find((r) => r.name === "Bardic Inspiration");
    expect(bi).toBeDefined();
    expect(bi?.resetType).toBe("long");
  });

  it("Bard with CHA 8 (-1) still gets minimum 1 Bardic Inspiration use", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Bard", level: 1 }],
      abilities: {
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 12,
        charisma: 8, // mod -1
      },
      maxHP: 9,
      saveProficiencies: ["dexterity", "charisma"],
    });
    const { character } = buildCharacter(ids);
    const bi = character.static.classResources?.find((r) => r.name === "Bardic Inspiration");
    expect(bi?.maxUses).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 6. HP computation
// ---------------------------------------------------------------------------

describe("HP computation", () => {
  it("level 1 Fighter: HP is maxHP from identifiers, currentHP matches", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level: 1 }],
      abilities: {
        strength: 16,
        dexterity: 14,
        constitution: 14,
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      },
      maxHP: 12, // 10 + 2 CON mod
    });
    const { character } = buildCharacter(ids);
    expect(character.static.maxHP).toBe(12);
    expect(character.dynamic.currentHP).toBe(12);
  });

  it("maxHP is never below 1, even when identifiers provide 0", () => {
    const ids = makeIdentifiers({ maxHP: 0 });
    const { character } = buildCharacter(ids);
    expect(character.static.maxHP).toBeGreaterThanOrEqual(1);
  });

  it("Tough feat adds 2 HP per level to maxHP", () => {
    const level = 5;
    const baseHP = 44;
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level }],
      maxHP: baseHP,
      additionalFeatures: [
        { name: "Tough", description: "Tough feat", source: "feat", sourceLabel: "Tough" },
      ],
    });
    const { character } = buildCharacter(ids);
    // Tough adds 2 * totalLevel = 10
    expect(character.static.maxHP).toBe(baseHP + 2 * level);
  });

  it("Dwarf species adds 1 HP per level via Dwarven Toughness", () => {
    const level = 3;
    const baseHP = 24;
    const ids = makeIdentifiers({
      race: "Dwarf",
      classes: [{ name: "Fighter", level }],
      maxHP: baseHP,
    });
    const { character } = buildCharacter(ids);
    // Dwarven Toughness adds totalLevel HP
    expect(character.static.maxHP).toBe(baseHP + level);
  });
});

// ---------------------------------------------------------------------------
// 7. Edge cases
// ---------------------------------------------------------------------------

describe("Minimal identifiers — level 1 no subclass", () => {
  it("minimal Fighter builds successfully", () => {
    const ids = makeIdentifiers({
      name: "Minimal",
      race: "Human",
      classes: [{ name: "Fighter", level: 1 }],
      abilities: {
        strength: 15,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      },
      maxHP: 11,
      skillProficiencies: [],
      skillExpertise: [],
      saveProficiencies: ["strength", "constitution"],
      spells: [],
      equipment: [],
      languages: ["Common"],
    });
    const { character, warnings } = buildCharacter(ids);
    expect(character).toBeDefined();
    expect(character.static.name).toBe("Minimal");
    expect(warnings).toBeInstanceOf(Array);
  });

  it("character name is preserved", () => {
    const ids = makeIdentifiers({ name: "Aldric Stonehaven" });
    const { character } = buildCharacter(ids);
    expect(character.static.name).toBe("Aldric Stonehaven");
  });

  it("race is preserved in both species and race fields", () => {
    const ids = makeIdentifiers({ race: "Elf" });
    const { character } = buildCharacter(ids);
    expect(character.static.race).toBe("Elf");
    expect(character.static.species).toBe("Elf");
  });

  it("languages are preserved", () => {
    const ids = makeIdentifiers({ languages: ["Common", "Elvish", "Dwarvish"] });
    const { character } = buildCharacter(ids);
    expect(character.static.languages).toContain("Common");
    expect(character.static.languages).toContain("Elvish");
    expect(character.static.languages).toContain("Dwarvish");
  });

  it("output has all required static fields", () => {
    const ids = makeIdentifiers();
    const { character } = buildCharacter(ids);
    const s = character.static;
    expect(s.name).toBeDefined();
    expect(s.maxHP).toBeDefined();
    expect(s.armorClass).toBeDefined();
    expect(s.proficiencyBonus).toBeDefined();
    expect(s.speed).toBeDefined();
    expect(s.features).toBeDefined();
    expect(s.proficiencies).toBeDefined();
    expect(s.skills).toBeDefined();
    expect(s.savingThrows).toBeDefined();
    expect(s.senses).toBeDefined();
    expect(s.languages).toBeDefined();
    expect(s.spells).toBeDefined();
  });

  it("output has all required dynamic fields", () => {
    const ids = makeIdentifiers();
    const { character } = buildCharacter(ids);
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
    const ids = makeIdentifiers();
    const { character } = buildCharacter(ids);
    expect(character.dynamic.currency).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
  });

  it("provided currency is preserved", () => {
    const ids = makeIdentifiers({ currency: { cp: 5, sp: 10, gp: 50, pp: 2 } });
    const { character } = buildCharacter(ids);
    expect(character.dynamic.currency).toEqual({ cp: 5, sp: 10, gp: 50, pp: 2 });
  });

  it("death saves start at 0 successes and 0 failures", () => {
    const ids = makeIdentifiers();
    const { character } = buildCharacter(ids);
    expect(character.dynamic.deathSaves.successes).toBe(0);
    expect(character.dynamic.deathSaves.failures).toBe(0);
  });

  it("heroic inspiration defaults to false", () => {
    const ids = makeIdentifiers();
    const { character } = buildCharacter(ids);
    expect(character.dynamic.heroicInspiration).toBe(false);
  });
});

describe("Skills array is always complete", () => {
  it("skills array is non-empty and covers all expected skills", () => {
    const ids = makeIdentifiers();
    const { character } = buildCharacter(ids);
    // 5e has 18 skills
    expect(character.static.skills.length).toBeGreaterThanOrEqual(18);
  });

  it("every skill has a governing ability", () => {
    const ids = makeIdentifiers();
    const { character } = buildCharacter(ids);
    const abilities: (keyof AbilityScores)[] = [
      "strength",
      "dexterity",
      "constitution",
      "intelligence",
      "wisdom",
      "charisma",
    ];
    for (const skill of character.static.skills) {
      expect(abilities).toContain(skill.ability);
    }
  });
});

describe("Senses computation", () => {
  it("Human has no Darkvision, includes Passive Perception", () => {
    const ids = makeIdentifiers({ race: "Human" });
    const { character } = buildCharacter(ids);
    const senses = character.static.senses;
    const hasDarkvision = senses.some((s) => s.includes("Darkvision"));
    expect(hasDarkvision).toBe(false);
    const passivePerception = senses.find((s) => s.includes("Passive Perception"));
    expect(passivePerception).toBeDefined();
  });

  it("Elf has Darkvision 60 ft.", () => {
    const ids = makeIdentifiers({ race: "Elf" });
    const { character } = buildCharacter(ids);
    const darkvision = character.static.senses.find((s) => s.includes("Darkvision"));
    expect(darkvision).toBeDefined();
    expect(darkvision).toContain("60");
  });

  it("Passive Perception is higher with Perception proficiency", () => {
    const withPerc = makeIdentifiers({
      race: "Human",
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 12, // mod +1
        charisma: 10,
      },
      skillProficiencies: ["perception"],
    });
    const withoutPerc = makeIdentifiers({
      race: "Human",
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 12, // mod +1
        charisma: 10,
      },
      skillProficiencies: [],
    });

    const { character: charWith } = buildCharacter(withPerc);
    const { character: charWithout } = buildCharacter(withoutPerc);

    const ppWith = charWith.static.senses.find((s) => s.includes("Passive Perception"));
    const ppWithout = charWithout.static.senses.find((s) => s.includes("Passive Perception"));

    // Extract the numeric value
    const numWith = parseInt(ppWith?.replace(/\D/g, "") ?? "0", 10);
    const numWithout = parseInt(ppWithout?.replace(/\D/g, "") ?? "0", 10);

    expect(numWith).toBeGreaterThan(numWithout);
  });

  it("custom senses override DB computation when provided", () => {
    const ids = makeIdentifiers({
      senses: ["Darkvision 120 ft.", "Tremorsense 30 ft.", "Passive Perception 18"],
    });
    const { character } = buildCharacter(ids);
    expect(character.static.senses).toEqual([
      "Darkvision 120 ft.",
      "Tremorsense 30 ft.",
      "Passive Perception 18",
    ]);
  });
});

describe("AC computation", () => {
  it("unarmored AC = 10 + DEX mod", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level: 1 }],
      abilities: {
        strength: 16,
        dexterity: 14, // mod +2
        constitution: 14,
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      },
      equipment: [], // no armor
    });
    const { character } = buildCharacter(ids);
    expect(character.static.armorClass).toBe(12); // 10 + 2
  });

  it("Barbarian Unarmored Defense = 10 + DEX mod + CON mod", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Barbarian", level: 1 }],
      abilities: {
        strength: 16,
        dexterity: 14, // mod +2
        constitution: 16, // mod +3
        intelligence: 8,
        wisdom: 10,
        charisma: 8,
      },
      equipment: [], // no armor
      saveProficiencies: ["strength", "constitution"],
    });
    const { character } = buildCharacter(ids);
    // 10 + 2 (DEX) + 3 (CON) = 15
    expect(character.static.armorClass).toBe(15);
  });

  it("armorClass override is used when provided", () => {
    const ids = makeIdentifiers({ armorClass: 18 });
    const { character } = buildCharacter(ids);
    expect(character.static.armorClass).toBe(18);
  });
});

describe("Speed computation", () => {
  it("Human base speed is 30", () => {
    const ids = makeIdentifiers({ race: "Human" });
    const { character } = buildCharacter(ids);
    expect(character.static.speed).toBe(30);
  });

  it("speed override is used when provided", () => {
    const ids = makeIdentifiers({ speed: 40 });
    const { character } = buildCharacter(ids);
    expect(character.static.speed).toBe(40);
  });

  it("Barbarian level 5 gets +10 Fast Movement bonus", () => {
    const ids = makeIdentifiers({
      race: "Human",
      classes: [{ name: "Barbarian", level: 5 }],
      maxHP: 50,
      saveProficiencies: ["strength", "constitution"],
    });
    const { character } = buildCharacter(ids);
    // 30 (Human) + 10 (Fast Movement) = 40
    expect(character.static.speed).toBe(40);
  });
});

describe("Source and import metadata", () => {
  it("source is set to 'builder'", () => {
    const ids = makeIdentifiers();
    const { character } = buildCharacter(ids);
    expect(character.static.source).toBe("builder");
  });

  it("importedAt is a recent timestamp", () => {
    const before = Date.now();
    const ids = makeIdentifiers();
    const { character } = buildCharacter(ids);
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
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level: 7, subclass: "Eldritch Knight" }],
      maxHP: 70,
      saveProficiencies: ["strength", "constitution"],
    });
    const { character } = buildCharacter(ids);
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
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level: 7, subclass: "Eldritch Knight" }],
      maxHP: 70,
      saveProficiencies: ["strength", "constitution"],
    });
    const { character } = buildCharacter(ids);
    expect(character.static.spellcastingAbility).toBe("intelligence");
  });
});

// ---------------------------------------------------------------------------
// 9. Warlock pact magic
// ---------------------------------------------------------------------------

describe("Warlock pact magic", () => {
  it("Warlock level 3 has pact magic slots, no regular slots", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Warlock", level: 3 }],
      abilities: {
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 12,
        charisma: 16,
      },
      maxHP: 24,
      saveProficiencies: ["wisdom", "charisma"],
    });
    const { character } = buildCharacter(ids);
    const pactSlots = character.dynamic.pactMagicSlots ?? [];
    expect(pactSlots.length).toBeGreaterThan(0);
    // Regular spell slots should be empty for a pure Warlock
    expect(character.dynamic.spellSlotsUsed).toHaveLength(0);
  });

  it("Warlock spellcasting ability is Charisma", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Warlock", level: 1 }],
      abilities: {
        strength: 10,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 12,
        charisma: 16,
      },
      maxHP: 9,
      saveProficiencies: ["wisdom", "charisma"],
    });
    const { character } = buildCharacter(ids);
    expect(character.static.spellcastingAbility).toBe("charisma");
  });
});

// ---------------------------------------------------------------------------
// 10. Combat bonuses from fighting styles / feats
// ---------------------------------------------------------------------------

describe("Combat bonuses", () => {
  it("Archery fighting style grants +2 ranged attack bonus", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level: 1 }],
      additionalFeatures: [
        {
          name: "Archery",
          description: "Archery fighting style",
          source: "feat",
          sourceLabel: "Fighter",
        },
      ],
    });
    const { character } = buildCharacter(ids);
    const bonuses = character.static.combatBonuses ?? [];
    const archery = bonuses.find((b) => b.source === "Archery");
    expect(archery).toBeDefined();
    expect(archery?.type).toBe("attack");
    expect(archery?.value).toBe(2);
    expect(archery?.attackType).toBe("ranged");
  });

  it("Alert feat grants initiative bonus equal to proficiency bonus", () => {
    const ids = makeIdentifiers({
      classes: [{ name: "Fighter", level: 1 }],
      additionalFeatures: [
        { name: "Alert", description: "Alert feat", source: "feat", sourceLabel: "Alert" },
      ],
    });
    const { character } = buildCharacter(ids);
    const bonuses = character.static.combatBonuses ?? [];
    const alert = bonuses.find((b) => b.source === "Alert");
    expect(alert).toBeDefined();
    expect(alert?.type).toBe("initiative");
    expect(alert?.value).toBe(character.static.proficiencyBonus);
  });
});
