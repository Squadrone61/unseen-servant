import type {
  AbilityScores,
  CharacterAppearance,
  InventoryItem,
  Currency,
  Ability,
} from "@unseen-servant/shared/types";

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

export const BUILDER_STEPS: BuilderStep[] = [
  "species",
  "background",
  "class",
  "abilities",
  "feats",
  "spells",
  "equipment",
  "details",
];

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/**
 * Represents a single ASI/feat selection at a given class level.
 */
export interface FeatSelection {
  /** Class level that grants this ASI/feat slot. */
  level: number;
  /** Whether the player picked a feat or a raw ability score increase. */
  type: "feat" | "asi";
  /** Feat name — populated when type === 'feat'. */
  featName?: string;
  /**
   * Ability increases — populated when type === 'asi'.
   * Keys are ability names; values are the numeric increase (+1 or +2).
   */
  asiAbilities?: Partial<Record<Ability, number>>;
}

// ---------------------------------------------------------------------------
// BuilderState
// ---------------------------------------------------------------------------

export interface BuilderState {
  currentStep: BuilderStep;
  completedSteps: BuilderStep[];

  // --- Step 1: Species ---
  species: string | null;
  /** choiceId → selected values (e.g. "skill-proficiency" → ["Perception"]) */
  speciesChoices: Record<string, string[]>;

  // --- Step 2: Background ---
  background: string | null;
  /** choiceId → selected values */
  backgroundChoices: Record<string, string[]>;
  /** How the background's ability score bonuses are distributed: +2/+1 or +1/+1/+1 */
  abilityScoreMode: "two-one" | "three-ones";
  /** Which abilities receive the background's ability score bonuses */
  abilityScoreAssignments: Partial<Record<Ability, number>>;

  // --- Step 3: Class ---
  className: string | null;
  classLevel: number;
  subclass: string | null;
  /** Skill proficiency selections granted by class */
  classSkills: string[];
  /** Feature choice selections keyed by choiceId */
  classChoices: Record<string, string[]>;

  // --- Step 4: Abilities ---
  abilityMethod: "standard-array" | "point-buy" | "manual";
  baseAbilities: AbilityScores;

  // --- Step 5: Feats & ASIs ---
  /** One entry per ASI slot unlocked by class level */
  featSelections: FeatSelection[];
  /** featName → choiceId → selections (for feats that have sub-choices) */
  featChoices: Record<string, Record<string, string[]>>;

  // --- Step 6: Spells ---
  cantrips: string[];
  preparedSpells: string[];

  // --- Step 7: Equipment ---
  equipmentMode: "starting" | "gold";
  startingGold: number;

  // --- Step 8: Details ---
  name: string;
  appearance: Partial<CharacterAppearance>;
  backstory: string;
  alignment: string;
  equipment: InventoryItem[];
  currency: Currency;
}

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

export function createInitialState(): BuilderState {
  return {
    currentStep: "species",
    completedSteps: [],

    // Step 1
    species: null,
    speciesChoices: {},

    // Step 2
    background: null,
    backgroundChoices: {},
    abilityScoreMode: "two-one",
    abilityScoreAssignments: {},

    // Step 3
    className: null,
    classLevel: 1,
    subclass: null,
    classSkills: [],
    classChoices: {},

    // Step 4
    abilityMethod: "standard-array",
    baseAbilities: {
      strength: 8,
      dexterity: 8,
      constitution: 8,
      intelligence: 8,
      wisdom: 8,
      charisma: 8,
    },

    // Step 5
    featSelections: [],
    featChoices: {},

    // Step 6
    cantrips: [],
    preparedSpells: [],

    // Step 7
    equipmentMode: "starting",
    startingGold: 75,

    // Step 8
    name: "",
    appearance: {},
    backstory: "",
    alignment: "",
    equipment: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  };
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
  | {
      type: "SET_ABILITY_SCORE_ASSIGNMENT";
      assignments: Partial<Record<Ability, number>>;
    }

  // Class
  | { type: "SET_CLASS"; className: string }
  | { type: "SET_CLASS_LEVEL"; level: number }
  | { type: "SET_SUBCLASS"; subclass: string }
  | { type: "SET_CLASS_SKILLS"; skills: string[] }
  | { type: "SET_CLASS_CHOICE"; choiceId: string; values: string[] }

  // Abilities
  | { type: "SET_ABILITY_METHOD"; method: BuilderState["abilityMethod"] }
  | { type: "SET_BASE_ABILITIES"; abilities: AbilityScores }

  // Feats & ASIs
  | { type: "SET_FEAT_SELECTION"; index: number; selection: FeatSelection }
  | {
      type: "SET_FEAT_CHOICE";
      featName: string;
      choiceId: string;
      values: string[];
    }

  // Spells
  | { type: "SET_CANTRIPS"; cantrips: string[] }
  | { type: "SET_PREPARED_SPELLS"; spells: string[] }

  // Equipment
  | { type: "SET_EQUIPMENT_MODE"; mode: "starting" | "gold" }
  | { type: "SET_STARTING_GOLD"; gold: number }
  | { type: "ADD_EQUIPMENT"; item: InventoryItem }
  | { type: "REMOVE_EQUIPMENT"; index: number }
  | { type: "TOGGLE_EQUIPPED"; index: number }

  // Details
  | { type: "SET_NAME"; name: string }
  | { type: "SET_APPEARANCE"; appearance: Partial<CharacterAppearance> }
  | { type: "SET_BACKSTORY"; backstory: string }
  | { type: "SET_ALIGNMENT"; alignment: string }
  | { type: "SET_EQUIPMENT"; equipment: InventoryItem[] }
  | { type: "SET_CURRENCY"; currency: Currency }

  // Lifecycle
  | { type: "LOAD_STATE"; state: BuilderState }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Step completion helpers
// ---------------------------------------------------------------------------

/**
 * Determines whether a given step has all required fields filled.
 * Used to populate `completedSteps` after each action.
 */
function isStepComplete(step: BuilderStep, state: BuilderState): boolean {
  switch (step) {
    case "species":
      return state.species !== null;
    case "background":
      return state.background !== null;
    case "class":
      return state.className !== null;
    case "abilities":
      // All six base ability scores must be non-zero
      return (Object.values(state.baseAbilities) as number[]).every((v) => v > 0);
    case "feats":
      // Complete when every unlocked slot has been assigned
      return (
        state.featSelections.length === 0 ||
        state.featSelections.every((s) =>
          s.type === "feat"
            ? Boolean(s.featName)
            : s.asiAbilities !== undefined && Object.keys(s.asiAbilities).length > 0,
        )
      );
    case "spells":
      // No hard requirement — a non-caster class will have no selections
      return true;
    case "equipment":
      // Always considered complete — equipment is optional
      return true;
    case "details":
      return state.name.trim().length > 0;
    default:
      return false;
  }
}

/**
 * Recomputes the completedSteps array from scratch based on the current state.
 * Always derives from state rather than incrementally modifying to avoid drift.
 */
function recomputeCompletedSteps(state: BuilderState): BuilderStep[] {
  return BUILDER_STEPS.filter((step) => isStepComplete(step, state));
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  let next: BuilderState;

  switch (action.type) {
    // ---- Navigation --------------------------------------------------------
    case "SET_STEP":
      next = { ...state, currentStep: action.step };
      break;

    // ---- Species -----------------------------------------------------------
    case "SET_SPECIES":
      next = {
        ...state,
        species: action.species,
        // Cascade: clear dependent choices when species changes
        speciesChoices: {},
      };
      break;

    case "SET_SPECIES_CHOICE":
      next = {
        ...state,
        speciesChoices: {
          ...state.speciesChoices,
          [action.choiceId]: action.values,
        },
      };
      break;

    case "CLEAR_SPECIES":
      next = {
        ...state,
        species: null,
        speciesChoices: {},
      };
      break;

    // ---- Background --------------------------------------------------------
    case "SET_BACKGROUND":
      next = {
        ...state,
        background: action.background,
        // Cascade: clear dependent choices and assignments when background changes
        backgroundChoices: {},
        abilityScoreAssignments: {},
      };
      break;

    case "CLEAR_BACKGROUND":
      next = {
        ...state,
        background: null,
        backgroundChoices: {},
        abilityScoreAssignments: {},
      };
      break;

    case "SET_BACKGROUND_CHOICE":
      next = {
        ...state,
        backgroundChoices: {
          ...state.backgroundChoices,
          [action.choiceId]: action.values,
        },
      };
      break;

    case "SET_ABILITY_SCORE_MODE":
      next = {
        ...state,
        abilityScoreMode: action.mode,
        // Reset assignments since the distribution model changed
        abilityScoreAssignments: {},
      };
      break;

    case "SET_ABILITY_SCORE_ASSIGNMENT":
      next = {
        ...state,
        abilityScoreAssignments: action.assignments,
      };
      break;

    // ---- Class -------------------------------------------------------------
    case "SET_CLASS":
      next = {
        ...state,
        className: action.className,
        // Cascade: reset all class-dependent state
        subclass: null,
        classSkills: [],
        classChoices: {},
        featSelections: [],
        featChoices: {},
        cantrips: [],
        preparedSpells: [],
      };
      break;

    case "SET_CLASS_LEVEL": {
      const prevLevel = state.classLevel;
      const newLevel = action.level;
      next = {
        ...state,
        classLevel: newLevel,
        // Cascade: reset spells if the caster status boundary is crossed
        // (level 1 → multi-level jumps may add/remove caster ability)
        cantrips: newLevel !== prevLevel ? [] : state.cantrips,
        preparedSpells: newLevel !== prevLevel ? [] : state.preparedSpells,
        // Trim featSelections to the slots available at the new level;
        // the builder page is responsible for computing how many slots exist,
        // but we ensure the array never exceeds the new level's slot count
        // by slicing conservatively — the page will repopulate slots as needed.
        featSelections: state.featSelections.filter((s) => s.level <= newLevel),
      };
      break;
    }

    case "SET_SUBCLASS":
      next = {
        ...state,
        subclass: action.subclass,
        // Cascade: clear subclass-specific class choices (those keyed with
        // "subclass:" prefix by convention) when subclass changes
        classChoices: Object.fromEntries(
          Object.entries(state.classChoices).filter(([key]) => !key.startsWith("subclass:")),
        ),
      };
      break;

    case "SET_CLASS_SKILLS":
      next = { ...state, classSkills: action.skills };
      break;

    case "SET_CLASS_CHOICE":
      next = {
        ...state,
        classChoices: {
          ...state.classChoices,
          [action.choiceId]: action.values,
        },
      };
      break;

    // ---- Abilities ---------------------------------------------------------
    case "SET_ABILITY_METHOD":
      next = { ...state, abilityMethod: action.method };
      break;

    case "SET_BASE_ABILITIES":
      next = { ...state, baseAbilities: action.abilities };
      break;

    // ---- Feats & ASIs ------------------------------------------------------
    case "SET_FEAT_SELECTION": {
      const updated = [...state.featSelections];
      updated[action.index] = action.selection;
      // Remove feat choices for a slot that changed away from a feat
      const prev = state.featSelections[action.index];
      let featChoices = state.featChoices;
      if (
        prev?.type === "feat" &&
        prev.featName &&
        (action.selection.type !== "feat" || action.selection.featName !== prev.featName)
      ) {
        featChoices = { ...featChoices };
        delete featChoices[prev.featName];
      }
      next = { ...state, featSelections: updated, featChoices };
      break;
    }

    case "SET_FEAT_CHOICE":
      next = {
        ...state,
        featChoices: {
          ...state.featChoices,
          [action.featName]: {
            ...(state.featChoices[action.featName] ?? {}),
            [action.choiceId]: action.values,
          },
        },
      };
      break;

    // ---- Spells ------------------------------------------------------------
    case "SET_CANTRIPS":
      next = { ...state, cantrips: action.cantrips };
      break;

    case "SET_PREPARED_SPELLS":
      next = { ...state, preparedSpells: action.spells };
      break;

    // ---- Equipment ---------------------------------------------------------
    case "SET_EQUIPMENT_MODE":
      next = { ...state, equipmentMode: action.mode };
      break;

    case "SET_STARTING_GOLD":
      next = { ...state, startingGold: action.gold };
      break;

    case "ADD_EQUIPMENT":
      next = { ...state, equipment: [...state.equipment, action.item] };
      break;

    case "REMOVE_EQUIPMENT": {
      const updated = state.equipment.filter((_, i) => i !== action.index);
      next = { ...state, equipment: updated };
      break;
    }

    case "TOGGLE_EQUIPPED": {
      const updated = state.equipment.map((item, i) =>
        i === action.index ? { ...item, equipped: !item.equipped } : item,
      );
      next = { ...state, equipment: updated };
      break;
    }

    // ---- Details -----------------------------------------------------------
    case "SET_NAME":
      next = { ...state, name: action.name };
      break;

    case "SET_APPEARANCE":
      next = {
        ...state,
        appearance: { ...state.appearance, ...action.appearance },
      };
      break;

    case "SET_BACKSTORY":
      next = { ...state, backstory: action.backstory };
      break;

    case "SET_ALIGNMENT":
      next = { ...state, alignment: action.alignment };
      break;

    case "SET_EQUIPMENT":
      next = { ...state, equipment: action.equipment };
      break;

    case "SET_CURRENCY":
      next = { ...state, currency: action.currency };
      break;

    // ---- Lifecycle ---------------------------------------------------------
    case "LOAD_STATE":
      // Full replacement for edit mode; recompute completedSteps to be safe
      next = {
        ...action.state,
        completedSteps: recomputeCompletedSteps(action.state),
      };
      return next;

    case "RESET":
      return createInitialState();

    default: {
      // Exhaustiveness check — TypeScript will error here if a case is missing
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }

  // Recompute completedSteps after every state change
  next = { ...next, completedSteps: recomputeCompletedSteps(next) };
  return next;
}
