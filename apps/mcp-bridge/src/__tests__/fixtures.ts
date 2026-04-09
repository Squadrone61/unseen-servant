/**
 * Character fixtures built via the real `buildCharacter()` pipeline from
 * `@unseen-servant/shared/builders` — the same code path the character builder
 * UI uses. Tests exercise the full stack: D&D 2024 database lookups, spell slot
 * computation, class feature assembly, AC calculation, etc.
 *
 * Fixture roster:
 *
 * | Name    | Build                     | Archetype            | Exercises                                       |
 * |---------|---------------------------|----------------------|-------------------------------------------------|
 * | Theron  | Human Fighter 5 Champion  | Armored martial      | HP, AC, short-rest resources, death saves        |
 * | Brynn   | Dwarf Cleric 5 Life       | Full divine caster   | Spell slots, concentration, Channel Divinity     |
 * | Zara    | Tiefling Warlock 5 Fiend  | Pact magic caster    | Pact slots, short-rest slot recovery, CHA-based  |
 * | Gruk    | Half-Orc Barbarian 5 Bskr | Unarmored martial    | Rage (long-rest), Unarmored Defense, no spells   |
 * | Selene  | Half-Elf Cleric3/Warlock2 | Multiclass hybrid    | Mixed hit dice, pact + regular slots, dual CHA   |
 */

import type { CharacterData } from "@unseen-servant/shared/types";
import { buildCharacter } from "@unseen-servant/shared/builders";
import type { CharacterIdentifiers } from "@unseen-servant/shared/builders";

// ---------------------------------------------------------------------------
// Theron — Level 5 Human Fighter / Champion
// ---------------------------------------------------------------------------

/**
 * Level 5 Human Fighter/Champion built via the real character builder.
 * Covers: HP, combat, inventory, death saves, conditions, inspiration, exhaustion.
 *
 * Stats: STR 16, DEX 14, CON 14, INT 10, WIS 12, CHA 8
 * Expected: maxHP=44 (10+4×6+5×2 CON), AC=18 (chain mail 16 + shield 2),
 *           proficiency +3, Second Wind ×3 + Action Surge ×1 (short rest resources)
 */
export function createFighterCharacter(): CharacterData {
  const ids: CharacterIdentifiers = {
    name: "Theron",
    race: "Human",
    classes: [{ name: "Fighter", level: 5, subclass: "Champion" }],
    abilities: {
      strength: 16,
      dexterity: 14,
      constitution: 14,
      intelligence: 10,
      wisdom: 12,
      charisma: 8,
    },
    maxHP: 44,
    skillProficiencies: ["athletics", "perception"],
    skillExpertise: [],
    saveProficiencies: ["strength", "constitution"],
    spells: [],
    equipment: [
      {
        name: "Longsword",
        equipped: true,
        quantity: 1,
        type: "Weapon",
        damage: "1d8",
        damageType: "slashing",
        properties: ["Versatile"],
      },
      {
        name: "Shield",
        equipped: true,
        quantity: 1,
        type: "Shield",
        armorClass: 2,
      },
      {
        name: "Chain Mail",
        equipped: true,
        quantity: 1,
        type: "Armor",
        armorClass: 16,
      },
    ],
    languages: ["Common"],
    currency: { cp: 0, sp: 0, gp: 50, pp: 0 },
    traits: { personalityTraits: "Brave and loyal" },
    source: "builder",
  };

  const { character } = buildCharacter(ids);
  return character;
}

// ---------------------------------------------------------------------------
// Brynn — Level 5 Dwarf Cleric / Life Domain
// ---------------------------------------------------------------------------

/**
 * Level 5 Dwarf Cleric/Life Domain built via the real character builder.
 * Covers: spell slots, concentration, rest recovery, class resources.
 *
 * Stats: STR 14, DEX 10, CON 16, INT 12, WIS 18, CHA 8
 * Expected: maxHP=53 (8+4×5+5×3 CON=48, +5 Dwarven Toughness), AC=18 (chain mail + shield),
 *           proficiency +3, Channel Divinity ×2 (short rest),
 *           spell slots 4/3/2, spellcasting WIS (DC 15, +7)
 */
export function createClericCharacter(): CharacterData {
  const ids: CharacterIdentifiers = {
    name: "Brynn",
    race: "Dwarf",
    classes: [{ name: "Cleric", level: 5, subclass: "Life Domain" }],
    abilities: {
      strength: 14,
      dexterity: 10,
      constitution: 16,
      intelligence: 12,
      wisdom: 18,
      charisma: 8,
    },
    maxHP: 48,
    skillProficiencies: ["medicine", "religion"],
    skillExpertise: [],
    saveProficiencies: ["wisdom", "charisma"],
    spells: [
      {
        name: "Sacred Flame",
        level: 0,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Cleric",
      },
      {
        name: "Cure Wounds",
        level: 1,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Cleric",
      },
      {
        name: "Bless",
        level: 1,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Cleric",
      },
      {
        name: "Spiritual Weapon",
        level: 2,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Cleric",
      },
      {
        name: "Spirit Guardians",
        level: 3,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Cleric",
      },
    ],
    equipment: [
      {
        name: "Mace",
        equipped: true,
        quantity: 1,
        type: "Weapon",
        damage: "1d6",
        damageType: "bludgeoning",
      },
      {
        name: "Shield",
        equipped: true,
        quantity: 1,
        type: "Shield",
        armorClass: 2,
      },
      {
        name: "Chain Mail",
        equipped: true,
        quantity: 1,
        type: "Armor",
        armorClass: 16,
      },
    ],
    languages: ["Common", "Dwarvish"],
    currency: { cp: 0, sp: 0, gp: 75, pp: 0 },
    traits: { personalityTraits: "Compassionate healer" },
    source: "builder",
  };

  const { character } = buildCharacter(ids);
  return character;
}

// ---------------------------------------------------------------------------
// Zara — Level 5 Tiefling Warlock / Fiend
// ---------------------------------------------------------------------------

/**
 * Level 5 Tiefling Warlock/Fiend built via the real character builder.
 * Covers: pact magic slots, short-rest pact slot recovery, CHA-based casting.
 *
 * Stats: STR 8, DEX 14, CON 14, INT 10, WIS 12, CHA 18
 * Expected: maxHP=38 (8+4×5+5×2 CON), AC=14 (leather 11 + DEX 2 + shield? no shield for warlock feel),
 *           proficiency +3, NO class resources (warlock: []),
 *           pact magic: 2 slots at level 3, spellcasting CHA (DC 15, +7)
 */
export function createWarlockCharacter(): CharacterData {
  const ids: CharacterIdentifiers = {
    name: "Zara",
    race: "Tiefling",
    classes: [{ name: "Warlock", level: 5, subclass: "Fiend" }],
    abilities: {
      strength: 8,
      dexterity: 14,
      constitution: 14,
      intelligence: 10,
      wisdom: 12,
      charisma: 18,
    },
    // Warlock HP: 8 (level 1) + 4×5 (levels 2-5, d8 fixed) + 5×2 (CON) = 38
    maxHP: 38,
    skillProficiencies: ["arcana", "deception"],
    skillExpertise: [],
    saveProficiencies: ["wisdom", "charisma"],
    spells: [
      {
        name: "Eldritch Blast",
        level: 0,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Warlock",
      },
      {
        name: "Minor Illusion",
        level: 0,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Warlock",
      },
      {
        name: "Hex",
        level: 1,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Warlock",
      },
      {
        name: "Armor of Agathys",
        level: 1,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Warlock",
      },
      {
        name: "Counterspell",
        level: 3,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Warlock",
      },
    ],
    equipment: [
      {
        name: "Light Crossbow",
        equipped: true,
        quantity: 1,
        type: "Weapon",
        damage: "1d8",
        damageType: "piercing",
        properties: ["Ammunition", "Loading"],
        range: "80/320",
      },
      {
        name: "Leather Armor",
        equipped: true,
        quantity: 1,
        type: "Armor",
        armorClass: 11,
      },
      {
        name: "Component Pouch",
        equipped: true,
        quantity: 1,
        type: "Gear",
      },
    ],
    languages: ["Common", "Infernal"],
    currency: { cp: 0, sp: 0, gp: 30, pp: 0 },
    traits: { personalityTraits: "Haunted by the pact she made" },
    source: "builder",
  };

  const { character } = buildCharacter(ids);
  return character;
}

// ---------------------------------------------------------------------------
// Gruk — Level 5 Half-Orc Barbarian / Berserker
// ---------------------------------------------------------------------------

/**
 * Level 5 Half-Orc Barbarian/Berserker built via the real character builder.
 * Covers: Rage (long-rest resource), Unarmored Defense (10+DEX+CON), no spells.
 *
 * Stats: STR 18, DEX 14, CON 16, INT 8, WIS 10, CHA 10
 * Expected: maxHP=55 (12+4×7+5×3 CON), AC=14 (10 + DEX 2 + CON 3 = 15 unarmored),
 *           proficiency +3, Rage ×3 (long rest)
 *
 * NOTE: No body armor equipped — triggers Unarmored Defense path in builder.
 */
export function createBarbarianCharacter(): CharacterData {
  const ids: CharacterIdentifiers = {
    name: "Gruk",
    race: "Half-Orc",
    classes: [{ name: "Barbarian", level: 5, subclass: "Berserker" }],
    abilities: {
      strength: 18,
      dexterity: 14,
      constitution: 16,
      intelligence: 8,
      wisdom: 10,
      charisma: 10,
    },
    // Barbarian HP: 12 (level 1) + 4×7 (levels 2-5, d12 fixed) + 5×3 (CON) = 55
    maxHP: 55,
    skillProficiencies: ["athletics", "intimidation"],
    skillExpertise: [],
    saveProficiencies: ["strength", "constitution"],
    spells: [],
    equipment: [
      {
        name: "Greataxe",
        equipped: true,
        quantity: 1,
        type: "Weapon",
        damage: "1d12",
        damageType: "slashing",
        properties: ["Heavy", "Two-Handed"],
      },
      {
        name: "Javelin",
        equipped: false,
        quantity: 4,
        type: "Weapon",
        damage: "1d6",
        damageType: "piercing",
        properties: ["Thrown"],
        range: "30/120",
      },
    ],
    languages: ["Common", "Orc"],
    currency: { cp: 0, sp: 5, gp: 10, pp: 0 },
    traits: { personalityTraits: "Fierce but protective of allies" },
    source: "builder",
  };

  const { character } = buildCharacter(ids);
  return character;
}

// ---------------------------------------------------------------------------
// Selene — Level 5 Half-Elf Cleric 3 / Warlock 2 (Multiclass)
// ---------------------------------------------------------------------------

/**
 * Level 5 Half-Elf Cleric 3 (Life Domain) / Warlock 2 (Archfey) multiclass.
 * Covers: multiclass hit dice (d8 Cleric + d8 Warlock), pact + regular slots,
 *         mixed short/long rest resources, CHA-based pact + WIS-based divine.
 *
 * Stats: STR 10, DEX 12, CON 14, INT 10, WIS 16, CHA 16
 * Expected: maxHP=38 (8+4×5+5×2 CON), proficiency +3,
 *           regular slots from Cleric 3: 4 L1 + 2 L2,
 *           pact slots from Warlock 2: 2 L1,
 *           Channel Divinity ×2 (short rest),
 *           hit dice: "5d8" (both classes use d8)
 */
export function createMulticlassCharacter(): CharacterData {
  const ids: CharacterIdentifiers = {
    name: "Selene",
    race: "Half-Elf",
    classes: [
      { name: "Cleric", level: 3, subclass: "Life Domain" },
      { name: "Warlock", level: 2, subclass: "Archfey" },
    ],
    abilities: {
      strength: 10,
      dexterity: 12,
      constitution: 14,
      intelligence: 10,
      wisdom: 16,
      charisma: 16,
    },
    // Mixed HP: Cleric L1 (8) + Cleric L2-3 (2×5) + Warlock L4-5 (2×5) + 5×2 (CON) = 38
    maxHP: 38,
    skillProficiencies: ["medicine", "religion", "deception"],
    skillExpertise: [],
    saveProficiencies: ["wisdom", "charisma"],
    spells: [
      // Cleric cantrip
      {
        name: "Sacred Flame",
        level: 0,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Cleric",
      },
      // Cleric L1
      {
        name: "Cure Wounds",
        level: 1,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Cleric",
      },
      {
        name: "Bless",
        level: 1,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Cleric",
      },
      // Cleric L2
      {
        name: "Spiritual Weapon",
        level: 2,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Cleric",
      },
      // Warlock cantrip
      {
        name: "Eldritch Blast",
        level: 0,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Warlock",
      },
      // Warlock L1
      {
        name: "Hex",
        level: 1,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: "Warlock",
      },
    ],
    equipment: [
      {
        name: "Mace",
        equipped: true,
        quantity: 1,
        type: "Weapon",
        damage: "1d6",
        damageType: "bludgeoning",
      },
      {
        name: "Shield",
        equipped: true,
        quantity: 1,
        type: "Shield",
        armorClass: 2,
      },
      {
        name: "Scale Mail",
        equipped: true,
        quantity: 1,
        type: "Armor",
        armorClass: 14,
      },
    ],
    languages: ["Common", "Elvish", "Sylvan"],
    currency: { cp: 0, sp: 0, gp: 40, pp: 0 },
    traits: { personalityTraits: "Torn between divine duty and fey bargain" },
    source: "builder",
  };

  const { character } = buildCharacter(ids);
  return character;
}
