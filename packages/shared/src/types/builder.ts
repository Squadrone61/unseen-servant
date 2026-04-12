/**
 * Builder state types — shared between the web app (which owns the reducer)
 * and CharacterData (which stores the snapshot for lossless edit round-trips).
 */

import type {
  AbilityScores,
  CharacterAppearance,
  CharacterTraits,
  InventoryItem,
  Currency,
} from "./character";
import type { Ability } from "./effects";

// ---------------------------------------------------------------------------
// Step type
// ---------------------------------------------------------------------------

export type BuilderStep =
  | "species"
  | "background"
  | "class"
  | "abilities"
  | "feats"
  | "spells"
  | "equipment"
  | "details";

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export interface FeatSelection {
  level: number;
  type: "feat" | "asi";
  featName?: string;
  asiAbilities?: Partial<Record<Ability, number>>;
}

export interface BuilderClassEntry {
  name: string;
  level: number;
  subclass: string | null;
  skills: string[];
  choices: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// BuilderState
// ---------------------------------------------------------------------------

export interface BuilderState {
  currentStep: BuilderStep;
  completedSteps: BuilderStep[];

  // --- Step 1: Species ---
  species: string | null;
  speciesChoices: Record<string, string[]>;

  // --- Step 2: Background ---
  background: string | null;
  backgroundChoices: Record<string, string[]>;
  abilityScoreMode: "two-one" | "three-ones";
  abilityScoreAssignments: Partial<Record<Ability, number>>;

  // --- Step 3: Class ---
  classes: BuilderClassEntry[];
  activeClassIndex: number;

  // --- Step 4: Abilities ---
  abilityMethod: "standard-array" | "point-buy" | "manual";
  baseAbilities: AbilityScores;

  // --- Step 5: Feats & ASIs ---
  featSelections: FeatSelection[];
  featChoices: Record<string, Record<string, string[]>>;

  // --- Step 6: Spells ---
  cantrips: Record<string, string[]>;
  preparedSpells: Record<string, string[]>;

  // --- Step 7: Equipment ---

  // --- Step 8: Details ---
  name: string;
  appearance: Partial<CharacterAppearance>;
  backstory: string;
  alignment: string;
  traits: CharacterTraits;
  equipment: InventoryItem[];
  currency: Currency;
}

// ---------------------------------------------------------------------------
// BuilderAction discriminated union
// ---------------------------------------------------------------------------

export type BuilderAction =
  // Navigation
  | { type: "SET_STEP"; step: BuilderStep }

  // Species
  | { type: "SET_SPECIES"; species: string }
  | { type: "SET_SPECIES_CHOICE"; choiceId: string; values: string[] }
  | { type: "CLEAR_SPECIES" }

  // Background
  | { type: "SET_BACKGROUND"; background: string }
  | { type: "CLEAR_BACKGROUND" }
  | { type: "SET_BACKGROUND_CHOICE"; choiceId: string; values: string[] }
  | { type: "SET_ABILITY_SCORE_MODE"; mode: BuilderState["abilityScoreMode"] }
  | { type: "SET_ABILITY_SCORE_ASSIGNMENT"; assignments: Partial<Record<Ability, number>> }

  // Class
  | { type: "ADD_CLASS"; className: string }
  | { type: "REMOVE_CLASS"; index: number }
  | { type: "SET_ACTIVE_CLASS"; index: number }
  | { type: "SET_CLASS_LEVEL"; index: number; level: number }
  | { type: "SET_CLASS_SUBCLASS"; index: number; subclass: string }
  | { type: "SET_CLASS_SKILLS"; index: number; skills: string[] }
  | { type: "SET_CLASS_CHOICE"; index: number; choiceId: string; values: string[] }

  // Abilities
  | { type: "SET_ABILITY_METHOD"; method: BuilderState["abilityMethod"] }
  | { type: "SET_BASE_ABILITIES"; abilities: AbilityScores }

  // Feats & ASIs
  | { type: "SET_FEAT_SELECTION"; index: number; selection: FeatSelection }
  | { type: "SET_FEAT_CHOICE"; featName: string; choiceId: string; values: string[] }

  // Spells
  | { type: "SET_CANTRIPS"; className: string; cantrips: string[] }
  | { type: "SET_PREPARED_SPELLS"; className: string; spells: string[] }

  // Equipment
  | { type: "ADD_EQUIPMENT"; item: InventoryItem }
  | { type: "ADD_EQUIPMENT_BATCH"; items: InventoryItem[] }
  | { type: "REMOVE_EQUIPMENT"; index: number }
  | { type: "REMOVE_EQUIPMENT_BATCH"; packName: string }
  | { type: "TOGGLE_EQUIPPED"; index: number }

  // Details
  | { type: "SET_NAME"; name: string }
  | { type: "SET_APPEARANCE"; appearance: Partial<CharacterAppearance> }
  | { type: "SET_BACKSTORY"; backstory: string }
  | { type: "SET_ALIGNMENT"; alignment: string }
  | { type: "SET_TRAITS"; traits: Partial<CharacterTraits> }
  | { type: "SET_EQUIPMENT"; equipment: InventoryItem[] }
  | { type: "SET_CURRENCY"; currency: Currency }

  // Lifecycle
  | { type: "LOAD_STATE"; state: BuilderState }
  | { type: "RESET" };
