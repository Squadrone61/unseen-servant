import { getClass, getSpell } from "@unseen-servant/shared/data";

// Re-export types from shared for backward compatibility with local imports
export type {
  BuilderStep,
  BuilderClassEntry,
  FeatSelection,
  BuilderState,
  BuilderAction,
} from "@unseen-servant/shared/types";

import type {
  BuilderState,
  BuilderStep,
  BuilderAction,
  BuilderClassEntry,
} from "@unseen-servant/shared/types";

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
    classes: [],
    activeClassIndex: 0,

    // Step 4
    abilityMethod: "standard-array",
    baseAbilities: {
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 0,
      wisdom: 0,
      charisma: 0,
    },

    // Step 5
    featSelections: [],
    featChoices: {},

    // Step 6
    cantrips: {},
    preparedSpells: {},

    // Step 7

    // Step 8
    name: "",
    appearance: {},
    backstory: "",
    alignment: "",
    traits: {},
    equipment: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  };
}

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
      return state.classes.length > 0;
    case "abilities":
      // Complete when all six scores have been assigned (no zeros)
      return (Object.values(state.baseAbilities) as number[]).every((v) => v > 0);
    case "feats": {
      // Need a class first; then complete when no ASI slots exist or all are filled
      if (state.classes.length === 0) return false;
      const totalLevel = state.classes.reduce((s, c) => s + c.level, 0);
      const asiCount = [4, 8, 12, 16, 19].filter((l) => l <= totalLevel).length;
      if (asiCount === 0) return true;
      return state.featSelections.every((s) =>
        s.type === "feat"
          ? Boolean(s.featName)
          : s.asiAbilities !== undefined && Object.keys(s.asiAbilities).length > 0,
      );
    }
    case "spells":
      // Complete once a class is selected (non-casters have nothing to pick)
      return state.classes.length > 0;
    case "equipment":
      // Complete once a class is selected
      return state.classes.length > 0;
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
    case "ADD_CLASS": {
      // Prevent duplicates and enforce total level cap (20)
      const totalLevel = state.classes.reduce((sum, c) => sum + c.level, 0);
      if (state.classes.some((c) => c.name === action.className)) {
        next = state;
        break;
      }
      if (totalLevel >= 20) {
        next = state;
        break;
      }
      const newEntry: BuilderClassEntry = {
        name: action.className,
        level: 1,
        subclass: null,
        skills: [],
        choices: {},
      };
      const newClasses = [...state.classes, newEntry];
      next = {
        ...state,
        classes: newClasses,
        activeClassIndex: newClasses.length - 1,
        // Keep existing class spells, new class starts empty
        cantrips: { ...state.cantrips },
        preparedSpells: { ...state.preparedSpells },
      };
      break;
    }

    case "REMOVE_CLASS": {
      if (action.index >= state.classes.length) {
        next = state;
        break;
      }
      const removedName = state.classes[action.index].name;
      const remaining = state.classes.filter((_, i) => i !== action.index);
      const newIndex = Math.min(state.activeClassIndex, remaining.length - 1);
      // Trim feat selections to total level of remaining classes
      const newTotal = remaining.reduce((sum, c) => sum + c.level, 0);
      // Remove spells for the removed class
      const { [removedName]: _rc, ...keptCantrips } = state.cantrips;
      const { [removedName]: _rp, ...keptPrepared } = state.preparedSpells;
      next = {
        ...state,
        classes: remaining,
        activeClassIndex: newIndex,
        featSelections: state.featSelections.filter((s) => s.level <= newTotal),
        cantrips: keptCantrips,
        preparedSpells: keptPrepared,
      };
      break;
    }

    case "SET_ACTIVE_CLASS":
      next = { ...state, activeClassIndex: action.index };
      break;

    case "SET_CLASS_LEVEL": {
      const entry = state.classes[action.index];
      if (!entry) {
        next = state;
        break;
      }
      const newLevel = action.level;
      // Clamp so total never exceeds 20
      const otherLevels = state.classes.reduce(
        (sum, c, i) => (i === action.index ? sum : sum + c.level),
        0,
      );
      const clampedLevel = Math.min(newLevel, Math.max(1, 20 - otherLevels));
      const updatedEntry: BuilderClassEntry = { ...entry, level: clampedLevel };
      const updatedClasses = state.classes.map((c, i) => (i === action.index ? updatedEntry : c));
      const newTotal = updatedClasses.reduce((sum, c) => sum + c.level, 0);
      // Prune spells for the changed class that exceed the new max spell level.
      const changedClassName = updatedEntry.name;
      const classDb = getClass(changedClassName);
      const spellSlotTable = classDb?.spellSlotTable;
      let nextCantrips: typeof state.cantrips;
      let nextPreparedSpells: typeof state.preparedSpells;
      if (!spellSlotTable) {
        // Non-caster: clear this class's spells
        const { [changedClassName]: _cc, ...restC } = state.cantrips;
        const { [changedClassName]: _cp, ...restP } = state.preparedSpells;
        nextCantrips = restC;
        nextPreparedSpells = restP;
      } else {
        // Cantrips unaffected by level change
        nextCantrips = state.cantrips;
        // Determine the highest spell level accessible at the new level
        const slotsAtLevel = spellSlotTable[clampedLevel - 1] ?? [];
        let maxSpellLevel = 0;
        for (let i = slotsAtLevel.length - 1; i >= 0; i--) {
          if ((slotsAtLevel[i] ?? 0) > 0) {
            maxSpellLevel = i + 1;
            break;
          }
        }
        // Filter this class's prepared spells to those within the new max level
        const classSpells = state.preparedSpells[changedClassName] ?? [];
        nextPreparedSpells = {
          ...state.preparedSpells,
          [changedClassName]: classSpells.filter((spellName) => {
            const spell = getSpell(spellName);
            if (!spell) return false;
            return spell.level <= maxSpellLevel;
          }),
        };
      }
      next = {
        ...state,
        classes: updatedClasses,
        // Trim feat selections that fall beyond the new total level
        featSelections: state.featSelections.filter((s) => s.level <= newTotal),
        cantrips: nextCantrips,
        preparedSpells: nextPreparedSpells,
      };
      break;
    }

    case "SET_CLASS_SUBCLASS": {
      const entry = state.classes[action.index];
      if (!entry) {
        next = state;
        break;
      }
      // Clear subclass-specific choices (prefixed "subclass:") for this entry
      const cleanedChoices = Object.fromEntries(
        Object.entries(entry.choices).filter(([key]) => !key.startsWith("subclass:")),
      );
      const updatedEntry: BuilderClassEntry = {
        ...entry,
        subclass: action.subclass || null,
        choices: cleanedChoices,
      };
      next = {
        ...state,
        classes: state.classes.map((c, i) => (i === action.index ? updatedEntry : c)),
      };
      break;
    }

    case "SET_CLASS_SKILLS": {
      const entry = state.classes[action.index];
      if (!entry) {
        next = state;
        break;
      }
      next = {
        ...state,
        classes: state.classes.map((c, i) =>
          i === action.index ? { ...c, skills: action.skills } : c,
        ),
      };
      break;
    }

    case "SET_CLASS_CHOICE": {
      const entry = state.classes[action.index];
      if (!entry) {
        next = state;
        break;
      }
      next = {
        ...state,
        classes: state.classes.map((c, i) =>
          i === action.index
            ? { ...c, choices: { ...c.choices, [action.choiceId]: action.values } }
            : c,
        ),
      };
      break;
    }

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
      next = {
        ...state,
        cantrips: { ...state.cantrips, [action.className]: action.cantrips },
      };
      break;

    case "SET_PREPARED_SPELLS":
      next = {
        ...state,
        preparedSpells: { ...state.preparedSpells, [action.className]: action.spells },
      };
      break;

    // ---- Equipment ---------------------------------------------------------
    case "ADD_EQUIPMENT":
      next = { ...state, equipment: [...state.equipment, action.item] };
      break;

    case "ADD_EQUIPMENT_BATCH":
      next = { ...state, equipment: [...state.equipment, ...action.items] };
      break;

    case "REMOVE_EQUIPMENT": {
      const updated = state.equipment.filter((_, i) => i !== action.index);
      next = { ...state, equipment: updated };
      break;
    }

    case "REMOVE_EQUIPMENT_BATCH": {
      const updated = state.equipment.filter((item) => item.fromPack !== action.packName);
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

    case "SET_TRAITS":
      next = {
        ...state,
        traits: { ...state.traits, ...action.traits },
      };
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
