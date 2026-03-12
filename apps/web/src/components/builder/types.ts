import type {
  AbilityScores,
  CharacterAppearance,
  CharacterTraits,
  Currency,
} from "@aidnd/shared/types";

// ─── Step Types ─────────────────────────────────────────

export type BuilderStep =
  | "species"
  | "background"
  | "class"
  | "abilities"
  | "feats"
  | "skills"
  | "spells"
  | "equipment"
  | "details"
  | "review";

export const BUILDER_STEPS: BuilderStep[] = [
  "species",
  "background",
  "class",
  "abilities",
  "feats",
  "skills",
  "spells",
  "equipment",
  "details",
  "review",
];

export const STEP_LABELS: Record<BuilderStep, string> = {
  species: "Species",
  background: "Background",
  class: "Class",
  abilities: "Abilities",
  feats: "Feats",
  skills: "Skills",
  spells: "Spells",
  equipment: "Equipment",
  details: "Details",
  review: "Review",
};

// ─── ASI / Feat Selection at Class Levels ──────────────

export interface ASISelection {
  level: number;
  type: "asi" | "feat";
  // ASI mode
  asiChoice?: {
    mode: "two" | "one-one";
    abilities: Partial<Record<keyof AbilityScores, number>>;
  };
  // Feat mode
  featName?: string;
  featAbilityChoice?: keyof AbilityScores;
  featSubChoices?: Record<string, string[]>;
}

export interface OriginFeatOverrides {
  abilityChoice?: string; // spellcasting ability for Magic Initiate
  spellClass?: string; // Cleric/Druid/Wizard for Magic Initiate
  cantrips?: string[];
  spell?: string;
  skillChoices?: string[]; // for Skilled
  toolChoices?: string[]; // for Skilled/Crafter/Musician
}

// ─── Equipment Entry ────────────────────────────────────

export interface EquipmentEntry {
  name: string;
  quantity: number;
  equipped: boolean;
  source: "weapon" | "armor" | "gear" | "tool" | "item";
  // Custom item fields (only used when source === "item")
  description?: string;
  weight?: number;
  itemType?: string;
}

// ─── Builder State ──────────────────────────────────────

export type AbilityMethod = "standard-array" | "point-buy" | "manual";
export type ASIMode = "two-one" | "three-ones";

// ─── Species Trait Choices ──────────────────────────────

export interface TraitChoiceDefinition {
  traitName: string;
  choiceType: "skill" | "skills" | "feat" | "lineage" | "ancestry" | "language";
  count?: number;
  options?: string[];
  featCategory?: string;
  lineageOptions?: { name: string; description: string }[];
  secondaryChoice?: {
    type: "spellcasting-ability";
    options: string[];
  };
}

// ─── Class Feature Choices ─────────────────────────────

export interface FeatureChoiceDefinition {
  className: string;
  featureName: string;
  level: number;
  options: { name: string; description: string }[];
  count: number;
  countAtLevel?: Record<number, number>;
}

// ─── Builder State ──────────────────────────────────────

export interface BuilderState {
  currentStep: BuilderStep;
  editingId: string | null;

  // Step 1: Species
  species: string | null;
  nameFromSpeciesStep: string;
  speciesChoices: Record<string, {
    selected: string | string[];
    secondarySelected?: string;
  }>;

  // Step 2: Background
  background: string | null;

  // Step 3: Class
  className: string | null;
  level: number;
  subclass: string | null;
  featureChoices: Record<string, string[]>;
  weaponMasteries: string[];

  // Step 4: Abilities
  abilityMethod: AbilityMethod;
  baseAbilities: AbilityScores;
  asiMode: ASIMode;
  asiAssignments: Partial<Record<keyof AbilityScores, number>>;

  // Step 4b: Feats (ASI at class levels)
  asiSelections: ASISelection[];

  // Step 4c: Origin feat overrides
  originFeatOverrides: OriginFeatOverrides;

  // Step 5: Skills
  skillProficiencies: string[];
  skillExpertise: string[];

  // Step 6: Spells
  selectedCantrips: string[];
  selectedSpells: string[];

  // Step 7: Equipment
  equipment: EquipmentEntry[];
  currency: Currency;

  // Step 8: Details
  name: string;
  alignment: string;
  backstory: string;
  appearance: Partial<CharacterAppearance>;
  traits: Partial<CharacterTraits>;
}

// ─── Builder Choices (serialized for edit mode) ─────────

export type BuilderChoices = Omit<BuilderState, "currentStep" | "editingId">;

// ─── Builder Actions ────────────────────────────────────

export type BuilderAction =
  // Navigation
  | { type: "SET_STEP"; step: BuilderStep }
  | { type: "HYDRATE"; state: Partial<BuilderState> }

  // Species
  | { type: "SET_SPECIES"; species: string }
  | { type: "SET_NAME_EARLY"; name: string }
  | { type: "SET_SPECIES_CHOICE"; traitName: string; selected: string | string[] }
  | { type: "SET_SPECIES_SECONDARY_CHOICE"; traitName: string; selected: string }

  // Background
  | { type: "SET_BACKGROUND"; background: string }

  // Class
  | { type: "SET_CLASS"; className: string }
  | { type: "SET_LEVEL"; level: number }
  | { type: "SET_SUBCLASS"; subclass: string | null }
  | { type: "SET_FEATURE_CHOICE"; featureName: string; selected: string[] }
  | { type: "SET_WEAPON_MASTERIES"; weapons: string[] }

  // Abilities
  | { type: "SET_ABILITY_METHOD"; method: AbilityMethod }
  | { type: "SET_BASE_ABILITIES"; abilities: AbilityScores }
  | { type: "SET_ABILITY"; ability: keyof AbilityScores; value: number }
  | { type: "SET_ASI_MODE"; mode: ASIMode }
  | { type: "SET_ASI_ASSIGNMENT"; ability: keyof AbilityScores; value: number }
  | { type: "CLEAR_ASI" }

  // Feats (ASI at class levels)
  | { type: "SET_ASI_SELECTION"; level: number; selection: ASISelection }
  | { type: "CLEAR_ASI_SELECTIONS" }

  // Origin feat overrides
  | { type: "SET_ORIGIN_FEAT_OVERRIDES"; overrides: Partial<OriginFeatOverrides> }

  // Skills
  | { type: "TOGGLE_SKILL"; skill: string }
  | { type: "TOGGLE_EXPERTISE"; skill: string }
  | { type: "RESET_SKILLS" }

  // Spells
  | { type: "TOGGLE_CANTRIP"; spell: string }
  | { type: "TOGGLE_SPELL"; spell: string }
  | { type: "RESET_SPELLS" }

  // Equipment
  | { type: "ADD_EQUIPMENT"; entry: EquipmentEntry }
  | { type: "REMOVE_EQUIPMENT"; name: string }
  | { type: "SET_EQUIPMENT_QUANTITY"; name: string; quantity: number }
  | { type: "TOGGLE_EQUIPPED"; name: string }
  | { type: "SET_CURRENCY"; currency: Currency }

  // Details
  | { type: "SET_NAME"; name: string }
  | { type: "SET_ALIGNMENT"; alignment: string }
  | { type: "SET_BACKSTORY"; backstory: string }
  | { type: "SET_APPEARANCE"; appearance: Partial<CharacterAppearance> }
  | { type: "SET_TRAITS"; traits: Partial<CharacterTraits> };

// ─── Step Props ─────────────────────────────────────────

export interface StepProps {
  state: BuilderState;
  dispatch: React.Dispatch<BuilderAction>;
}
