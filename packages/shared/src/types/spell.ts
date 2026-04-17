// === Unified Spell Type ===
//
// Single shape replacing CharacterSpell. Metadata-only; mechanical behavior
// lives in the spell's EntityEffects.action in the DB. Enrichment happens
// once at build time — CharacterStaticData.spells stores fully-enriched Spell
// objects so the AI DM never needs to re-lookup metadata.

/**
 * A spell as it appears on a character sheet — enriched once at build time.
 * All metadata fields are required (non-optional) so consumers never need to
 * guard against missing data; the builder is responsible for populating them.
 *
 * Character-bound fields (prepared, alwaysPrepared, sourceClass, knownByClass,
 * spellSource) describe the character's relationship to this spell and are set
 * by the builder when the spell is added to the character.
 */
export interface Spell {
  // --- Spell identity & metadata (from DB) ---
  name: string;
  level: number; // 0 = cantrip
  school: string; // "Evocation", "Abjuration", etc.
  castingTime: string; // "1 action", "1 bonus action", "1 reaction", etc.
  range: string; // "120 feet", "Self", "Touch", "Self (20-foot radius)", etc.
  components: string; // "V, S, M (a pinch of sulfur)"
  duration: string; // "Instantaneous", "Concentration, up to 1 minute", etc.
  ritual: boolean;
  concentration: boolean;
  description: string; // Full text description (HTML tags stripped)

  // --- Character-bound fields (set by builder) ---
  /** Whether this spell is currently marked as prepared by the character. */
  prepared: boolean;
  /** True for always-prepared spells from class/subclass features (domain/oath spells). */
  alwaysPrepared: boolean;
  /** Class that grants this spell: "Paladin", "Wizard", "Warlock", etc. */
  sourceClass: string;
  /** True if the spell is in the character's spellbook/known list. */
  knownByClass: boolean;
  /** How the character gained access to this spell. */
  spellSource: "class" | "feat" | "species" | "item" | "race";
  /**
   * For spell_grant spells: how the spell can be cast.
   * "at_will" — no slot needed, unlimited uses (like a cantrip).
   * "always_prepared" — uses spell slots but always prepared.
   * "N/long_rest" or "N/short_rest" — N free casts per rest, no slot needed.
   * Undefined for normal class-learned spells.
   */
  grantUsage?: "at_will" | "always_prepared" | string;
}
