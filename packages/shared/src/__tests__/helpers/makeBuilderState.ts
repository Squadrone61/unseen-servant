/**
 * Test helper: makeBuilderState
 *
 * Creates a fully-populated BuilderState with sensible defaults
 * (Human Fighter 1, standard array abilities), then deep-merges overrides.
 *
 * Also exports convenience builders for common fixture archetypes used in
 * mcp-bridge tests.
 */

import type { BuilderState, BuilderClassEntry } from "../../types/builder.js";
import type { AbilityScores } from "../../types/character.js";
import type { Item } from "../../types/item.js";

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

export const DEFAULT_ABILITIES: AbilityScores = {
  strength: 16,
  dexterity: 14,
  constitution: 14,
  intelligence: 10,
  wisdom: 12,
  charisma: 8,
};

const DEFAULT_CLASS: BuilderClassEntry = {
  name: "Fighter",
  level: 1,
  subclass: null,
  skills: [],
  choices: {},
};

// ---------------------------------------------------------------------------
// Core helper
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid BuilderState. The `overrides` object is a shallow merge
 * at the top level; nested objects (classes, featSelections, etc.) should be
 * provided in full when overriding.
 */
export function makeBuilderState(overrides: Partial<BuilderState> = {}): BuilderState {
  return {
    currentStep: "details",
    completedSteps: [],
    species: "Human",
    speciesChoices: {},
    background: null,
    backgroundChoices: {},
    abilityScoreMode: "two-one",
    abilityScoreAssignments: {},
    classes: [{ ...DEFAULT_CLASS }],
    activeClassIndex: 0,
    abilityMethod: "manual",
    baseAbilities: { ...DEFAULT_ABILITIES },
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Convenience builders for mcp-bridge fixture archetypes
// ---------------------------------------------------------------------------

/**
 * Theron — Human Fighter 5 / Champion
 * STR 16, DEX 14, CON 14, INT 10, WIS 12, CHA 8
 * Equipment: Longsword, Shield, Chain Mail
 */
export function makeFighterBuilderState(overrides: Partial<BuilderState> = {}): BuilderState {
  return makeBuilderState({
    name: "Theron",
    species: "Human",
    classes: [
      {
        name: "Fighter",
        level: 5,
        subclass: "Champion",
        skills: ["athletics", "perception"],
        choices: {},
      },
    ],
    baseAbilities: {
      strength: 16,
      dexterity: 14,
      constitution: 14,
      intelligence: 10,
      wisdom: 12,
      charisma: 8,
    },
    equipment: [
      {
        name: "Longsword",
        equipped: true,
        quantity: 1,
        weapon: {
          damage: "1d8",
          damageType: "slashing",
          properties: ["Versatile"],
          versatile: "1d10",
        },
      } satisfies Item,
      {
        name: "Shield",
        equipped: true,
        quantity: 1,
        armor: { type: "shield", baseAc: 2 },
      } satisfies Item,
      {
        name: "Chain Mail",
        equipped: true,
        quantity: 1,
        armor: { type: "heavy", baseAc: 16, stealthDisadvantage: true },
      } satisfies Item,
    ],
    currency: { cp: 0, sp: 0, gp: 50, pp: 0 },
    traits: { personalityTraits: "Brave and loyal" },
    ...overrides,
  });
}

/**
 * Brynn — Dwarf Cleric 5 / Life Domain
 * STR 14, DEX 10, CON 16, INT 12, WIS 18, CHA 8
 * Equipment: Mace, Shield, Chain Mail
 */
export function makeClericBuilderState(overrides: Partial<BuilderState> = {}): BuilderState {
  return makeBuilderState({
    name: "Brynn",
    species: "Dwarf",
    classes: [
      {
        name: "Cleric",
        level: 5,
        subclass: "Life Domain",
        skills: ["medicine", "religion"],
        choices: {},
      },
    ],
    baseAbilities: {
      strength: 14,
      dexterity: 10,
      constitution: 16,
      intelligence: 12,
      wisdom: 18,
      charisma: 8,
    },
    preparedSpells: {
      Cleric: ["Cure Wounds", "Bless", "Spiritual Weapon", "Spirit Guardians"],
    },
    cantrips: {
      Cleric: ["Sacred Flame"],
    },
    equipment: [
      {
        name: "Mace",
        equipped: true,
        quantity: 1,
        weapon: { damage: "1d6", damageType: "bludgeoning" },
      } satisfies Item,
      {
        name: "Shield",
        equipped: true,
        quantity: 1,
        armor: { type: "shield", baseAc: 2 },
      } satisfies Item,
      {
        name: "Chain Mail",
        equipped: true,
        quantity: 1,
        armor: { type: "heavy", baseAc: 16, stealthDisadvantage: true },
      } satisfies Item,
    ],
    speciesChoices: { language_extra: ["Dwarvish"] },
    currency: { cp: 0, sp: 0, gp: 75, pp: 0 },
    traits: { personalityTraits: "Compassionate healer" },
    ...overrides,
  });
}

/**
 * Zara — Tiefling Warlock 5 / Fiend
 * STR 8, DEX 14, CON 14, INT 10, WIS 12, CHA 18
 * Equipment: Light Crossbow, Leather Armor, Component Pouch
 */
export function makeWarlockBuilderState(overrides: Partial<BuilderState> = {}): BuilderState {
  return makeBuilderState({
    name: "Zara",
    species: "Tiefling",
    classes: [
      {
        name: "Warlock",
        level: 5,
        subclass: "Fiend",
        skills: ["arcana", "deception"],
        choices: {},
      },
    ],
    baseAbilities: {
      strength: 8,
      dexterity: 14,
      constitution: 14,
      intelligence: 10,
      wisdom: 12,
      charisma: 18,
    },
    preparedSpells: {
      Warlock: ["Hex", "Armor of Agathys", "Counterspell"],
    },
    cantrips: {
      Warlock: ["Eldritch Blast", "Minor Illusion"],
    },
    equipment: [
      {
        name: "Light Crossbow",
        equipped: true,
        quantity: 1,
        weapon: {
          damage: "1d8",
          damageType: "piercing",
          properties: ["Ammunition", "Loading"],
          range: "80/320",
        },
      } satisfies Item,
      {
        name: "Leather Armor",
        equipped: true,
        quantity: 1,
        armor: { type: "light", baseAc: 11 },
      } satisfies Item,
      { name: "Component Pouch", equipped: true, quantity: 1 } satisfies Item,
    ],
    speciesChoices: { language_extra: ["Infernal"] },
    currency: { cp: 0, sp: 0, gp: 30, pp: 0 },
    traits: { personalityTraits: "Haunted by the pact she made" },
    ...overrides,
  });
}

/**
 * Gruk — Half-Orc Barbarian 5 / Berserker
 * STR 18, DEX 14, CON 16, INT 8, WIS 10, CHA 10
 * Equipment: Greataxe, Javelins (no armor — Unarmored Defense)
 */
export function makeBarbarianBuilderState(overrides: Partial<BuilderState> = {}): BuilderState {
  return makeBuilderState({
    name: "Gruk",
    species: "Half-Orc",
    classes: [
      {
        name: "Barbarian",
        level: 5,
        subclass: "Berserker",
        skills: ["athletics", "intimidation"],
        choices: {},
      },
    ],
    baseAbilities: {
      strength: 18,
      dexterity: 14,
      constitution: 16,
      intelligence: 8,
      wisdom: 10,
      charisma: 10,
    },
    equipment: [
      {
        name: "Greataxe",
        equipped: true,
        quantity: 1,
        weapon: { damage: "1d12", damageType: "slashing", properties: ["Heavy", "Two-Handed"] },
      } satisfies Item,
      {
        name: "Javelin",
        equipped: false,
        quantity: 4,
        weapon: { damage: "1d6", damageType: "piercing", properties: ["Thrown"], range: "30/120" },
      } satisfies Item,
    ],
    speciesChoices: { language_extra: ["Orc"] },
    currency: { cp: 0, sp: 5, gp: 10, pp: 0 },
    traits: { personalityTraits: "Fierce but protective of allies" },
    ...overrides,
  });
}

/**
 * Selene — Half-Elf Cleric 3 (Life Domain) / Warlock 2 (Archfey)
 * STR 10, DEX 12, CON 14, INT 10, WIS 16, CHA 16
 */
export function makeMulticlassBuilderState(overrides: Partial<BuilderState> = {}): BuilderState {
  return makeBuilderState({
    name: "Selene",
    species: "Half-Elf",
    classes: [
      {
        name: "Cleric",
        level: 3,
        subclass: "Life Domain",
        skills: ["medicine", "religion"],
        choices: {},
      },
      { name: "Warlock", level: 2, subclass: "Archfey", skills: ["deception"], choices: {} },
    ],
    baseAbilities: {
      strength: 10,
      dexterity: 12,
      constitution: 14,
      intelligence: 10,
      wisdom: 16,
      charisma: 16,
    },
    preparedSpells: {
      Cleric: ["Cure Wounds", "Bless", "Spiritual Weapon"],
      Warlock: ["Hex", "Faerie Fire"],
    },
    cantrips: {
      Cleric: ["Sacred Flame"],
      Warlock: ["Eldritch Blast"],
    },
    equipment: [
      {
        name: "Mace",
        equipped: true,
        quantity: 1,
        weapon: { damage: "1d6", damageType: "bludgeoning" },
      } satisfies Item,
      {
        name: "Chain Shirt",
        equipped: true,
        quantity: 1,
        armor: { type: "medium", baseAc: 13, dexCap: 2 },
      } satisfies Item,
    ],
    currency: { cp: 0, sp: 0, gp: 60, pp: 0 },
    traits: { personalityTraits: "Seeks balance between divine and eldritch power" },
    ...overrides,
  });
}
