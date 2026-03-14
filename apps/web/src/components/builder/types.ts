import type {
  AbilityScores,
  CharacterAppearance,
  CharacterTraits,
  Currency,
} from "@unseen-servant/shared/types";

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
  classIndex: number; // which class in classes[] this ASI belongs to
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
  source: "weapon" | "armor" | "gear" | "tool" | "magic-item" | "item";
  // Custom item fields (only used when source === "item")
  description?: string;
  weight?: number;
  itemType?: string;
  armorClass?: number;
  damage?: string;
  damageType?: string;
  range?: string;
  attackBonus?: number;
  properties?: string[];
  rarity?: string;
  attunement?: boolean;
  isMagicItem?: boolean;
}

// ─── Multiclass Class Entry ─────────────────────────────

export interface ClassEntry {
  className: string;
  level: number;
  subclass: string | null;
  /** Optional feature selections keyed by feature type (e.g. "EI" → ["Agonizing Blast", ...]) */
  optionalFeatureSelections: Record<string, string[]>;
  /** Weapon masteries chosen for this class */
  weaponMasteries: string[];
}

// ─── Builder State ──────────────────────────────────────

export type AbilityMethod = "standard-array" | "point-buy" | "manual";
export type ASIMode = "two-one" | "three-ones";

// ─── Species Trait Choices ──────────────────────────────

export interface TraitChoiceDefinition {
  traitName: string;
  choiceType: "skill" | "skills" | "feat" | "lineage" | "ancestry" | "language" | "resistance" | "size";
  count?: number;
  options?: string[];
  featCategory?: string;
  lineageOptions?: { name: string; description: string }[];
  secondaryChoice?: {
    type: "spellcasting-ability";
    options: string[];
  };
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
  backgroundLanguages: string[];

  // Step 3: Class (MULTICLASS)
  classes: ClassEntry[];
  activeClassIndex: number;

  // Step 4: Abilities
  abilityMethod: AbilityMethod;
  baseAbilities: AbilityScores;
  asiMode: ASIMode;
  asiAssignments: Partial<Record<keyof AbilityScores, number>>;

  // Step 4b: Feats (ASI at class levels — spans ALL classes)
  asiSelections: ASISelection[];

  // Step 4c: Origin feat overrides
  originFeatOverrides: OriginFeatOverrides;
  speciesOriginFeatOverrides: OriginFeatOverrides;

  // Step 5: Skills
  skillProficiencies: string[];
  skillExpertise: string[];

  // Step 6: Spells (per-class selections)
  spellSelections: Record<string, {
    cantrips: string[];
    spells: string[];
  }>;

  // Step 7: Equipment
  startingEquipmentChoice: "A" | "B" | "custom";
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
  | { type: "SET_BACKGROUND_LANGUAGES"; languages: string[] }

  // Class (multiclass)
  | { type: "ADD_CLASS"; className: string }
  | { type: "REMOVE_CLASS"; index: number }
  | { type: "SET_ACTIVE_CLASS"; index: number }
  | { type: "SET_CLASS_NAME"; index: number; className: string }
  | { type: "SET_CLASS_LEVEL"; index: number; level: number }
  | { type: "SET_CLASS_SUBCLASS"; index: number; subclass: string | null }
  | { type: "SET_OPTIONAL_FEATURE"; index: number; featureType: string; selected: string[] }
  | { type: "SET_WEAPON_MASTERIES"; index: number; weapons: string[] }

  // Abilities
  | { type: "SET_ABILITY_METHOD"; method: AbilityMethod }
  | { type: "SET_BASE_ABILITIES"; abilities: AbilityScores }
  | { type: "SET_ABILITY"; ability: keyof AbilityScores; value: number }
  | { type: "SET_ASI_MODE"; mode: ASIMode }
  | { type: "SET_ASI_ASSIGNMENT"; ability: keyof AbilityScores; value: number }
  | { type: "CLEAR_ASI" }

  // Feats (ASI at class levels)
  | { type: "SET_ASI_SELECTION"; classIndex: number; level: number; selection: ASISelection }
  | { type: "CLEAR_ASI_SELECTIONS" }

  // Origin feat overrides
  | { type: "SET_ORIGIN_FEAT_OVERRIDES"; overrides: Partial<OriginFeatOverrides> }
  | { type: "SET_SPECIES_ORIGIN_FEAT_OVERRIDES"; overrides: Partial<OriginFeatOverrides> }

  // Skills
  | { type: "TOGGLE_SKILL"; skill: string }
  | { type: "TOGGLE_EXPERTISE"; skill: string }
  | { type: "RESET_SKILLS" }

  // Spells (per-class)
  | { type: "TOGGLE_CANTRIP"; className: string; spell: string }
  | { type: "TOGGLE_SPELL"; className: string; spell: string }
  | { type: "RESET_SPELLS" }
  | { type: "RESET_CLASS_SPELLS"; className: string }

  // Equipment
  | { type: "SET_STARTING_EQUIPMENT_CHOICE"; choice: "A" | "B" | "custom" }
  | { type: "ADD_STARTING_EQUIPMENT"; items: EquipmentEntry[]; currency: import("@unseen-servant/shared/types").Currency }
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
