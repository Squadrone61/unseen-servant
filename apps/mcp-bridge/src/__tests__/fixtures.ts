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
import {
  makeFighterBuilderState,
  makeClericBuilderState,
  makeWarlockBuilderState,
  makeBarbarianBuilderState,
  makeMulticlassBuilderState,
} from "@unseen-servant/shared/test-helpers";

// ---------------------------------------------------------------------------
// Theron — Level 5 Human Fighter / Champion
// ---------------------------------------------------------------------------

/**
 * Level 5 Human Fighter/Champion built via the real character builder.
 * Covers: HP, combat, inventory, death saves, conditions, inspiration, exhaustion.
 *
 * Stats: STR 16, DEX 14, CON 14, INT 10, WIS 12, CHA 8
 * Expected: maxHP=44 (10+4×6+5×2 CON), AC=18 (chain mail 16 + shield 2),
 *           proficiency +3, Second Wind ×2 + Action Surge ×1 (short rest resources)
 */
export function createFighterCharacter(): CharacterData {
  const { character } = buildCharacter(makeFighterBuilderState());
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
 * Expected: maxHP=48+5 Dwarven Toughness, AC=18 (chain mail + shield),
 *           proficiency +3, Channel Divinity ×2 (short rest),
 *           spell slots 4/3/2, spellcasting WIS (DC 15, +7)
 */
export function createClericCharacter(): CharacterData {
  const { character } = buildCharacter(makeClericBuilderState());
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
 * Expected: maxHP=38, AC=13 (leather 11 + DEX 2),
 *           pact magic: 2 slots at level 3, spellcasting CHA (DC 15, +7)
 */
export function createWarlockCharacter(): CharacterData {
  const { character } = buildCharacter(makeWarlockBuilderState());
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
 * Expected: maxHP=55, AC=15 (10 + DEX 2 + CON 3 unarmored),
 *           proficiency +3, Rage ×3 (long rest)
 */
export function createBarbarianCharacter(): CharacterData {
  const { character } = buildCharacter(makeBarbarianBuilderState());
  return character;
}

// ---------------------------------------------------------------------------
// Selene — Level 5 Half-Elf Cleric 3 / Warlock 2 (Multiclass)
// ---------------------------------------------------------------------------

/**
 * Level 5 Half-Elf Cleric 3 (Life Domain) / Warlock 2 (Archfey) multiclass.
 * Covers: multiclass hit dice, pact + regular slots, mixed rest resources.
 *
 * Stats: STR 10, DEX 12, CON 14, INT 10, WIS 16, CHA 16
 * Expected: proficiency +3, regular slots from Cleric 3, pact slots from Warlock 2
 */
export function createMulticlassCharacter(): CharacterData {
  const { character } = buildCharacter(makeMulticlassBuilderState());
  return character;
}
