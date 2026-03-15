/**
 * CharacterIdentifiers — the player-specific choices that parsers extract.
 * Everything the shared D&D 2024 database can't know: names, chosen scores,
 * chosen proficiencies, spell selections, equipment, etc.
 *
 * Parsers produce this, then delegate to buildCharacter().
 */

import type {
  AbilityScores,
  CharacterClass,
  CharacterSpell,
  CharacterTraits,
  CharacterAppearance,
  AdvantageEntry,
  InventoryItem,
  Currency,
  CharacterFeature,
} from "../types/character";

export interface CharacterIdentifiers {
  name: string;
  race: string; // species name
  classes: CharacterClass[];
  background?: string;
  abilities: AbilityScores; // final 6 scores (player rolled/chose)
  maxHP: number; // source's HP (player rolled/chose per level)

  // Proficiency selections
  skillProficiencies: string[]; // skill slugs chosen by player
  skillExpertise: string[]; // skills with expertise
  skillBonuses?: Map<string, number>; // flat bonuses from items/features (Jack of All Trades, etc.)
  saveProficiencies: (keyof AbilityScores)[]; // save proficiency abilities
  saveBonuses?: Map<keyof AbilityScores, number>; // flat save bonuses

  // Spells
  spells: CharacterSpell[];

  // Features — parser-specific features that override/supplement DB features
  additionalFeatures?: CharacterFeature[];

  // Equipment
  equipment: InventoryItem[];
  languages: string[];
  toolProficiencies?: string[];

  // Traits, appearance & backstory
  traits?: CharacterTraits;
  appearance?: CharacterAppearance;
  backstory?: string;
  currency?: Currency;
  advantages?: AdvantageEntry[];
  senses?: string[]; // custom senses beyond DB defaults (e.g. DDB darkvision from traits)

  // Armor/weapon proficiencies — if provided, override DB computation
  // (DDB extracts these from modifiers with entityTypeId, which is more accurate)
  armorProficiencies?: string[];
  weaponProficiencies?: string[];
  otherProficiencies?: string[];

  // AC override — if provided, skip builder AC computation
  // (DDB has its own complex AC computation with modifier stacking)
  armorClass?: number;

  // Speed override — if provided, skip builder speed computation
  speed?: number;

  // Import metadata
  source: "builder";
}
