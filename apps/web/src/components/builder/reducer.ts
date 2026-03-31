import type { AbilityScores, Currency } from "@unseen-servant/shared/types";
import type { BuilderState, BuilderAction, ClassEntry } from "./types";
import {
  DEFAULT_ABILITIES,
  POINT_BUY_DEFAULT,
  STANDARD_ARRAY_DEFAULT,
  getASILevelsForClasses,
} from "./utils";

function createEmptyClassEntry(className: string): ClassEntry {
  return {
    className,
    level: 1,
    subclass: null,
    optionalFeatureSelections: {},
    weaponMasteries: [],
  };
}

export function createInitialState(editingId?: string | null): BuilderState {
  return {
    currentStep: "species",
    editingId: editingId ?? null,
    species: null,
    nameFromSpeciesStep: "",
    speciesChoices: {},
    background: null,
    backgroundLanguages: [],
    classes: [],
    activeClassIndex: 0,
    abilityMethod: "standard-array",
    baseAbilities: { ...STANDARD_ARRAY_DEFAULT },
    asiMode: "two-one",
    asiAssignments: {},
    asiSelections: [],
    originFeatOverrides: {},
    speciesOriginFeatOverrides: {},
    skillProficiencies: [],
    skillExpertise: [],
    spellSelections: {},
    startingEquipmentChoice: "A",
    equipment: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    name: "",
    alignment: "",
    backstory: "",
    appearance: {},
    traits: {},
  };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    // ─── Navigation ───────────────────────────
    case "SET_STEP":
      return { ...state, currentStep: action.step };

    case "HYDRATE":
      return { ...state, ...action.state };

    // ─── Species ──────────────────────────────
    case "SET_SPECIES":
      return {
        ...state,
        species: action.species,
        speciesChoices: {},
        speciesOriginFeatOverrides: {},
      };

    case "SET_NAME_EARLY":
      return { ...state, nameFromSpeciesStep: action.name };

    case "SET_SPECIES_CHOICE":
      return {
        ...state,
        speciesChoices: {
          ...state.speciesChoices,
          [action.traitName]: {
            ...state.speciesChoices[action.traitName],
            selected: action.selected,
          },
        },
      };

    case "SET_SPECIES_SECONDARY_CHOICE":
      return {
        ...state,
        speciesChoices: {
          ...state.speciesChoices,
          [action.traitName]: {
            ...state.speciesChoices[action.traitName],
            selected: state.speciesChoices[action.traitName]?.selected ?? "",
            secondarySelected: action.selected,
          },
        },
      };

    // ─── Background ───────────────────────────
    case "SET_BACKGROUND":
      return {
        ...state,
        background: action.background,
        skillProficiencies: [],
        originFeatOverrides: {},
      };

    case "SET_BACKGROUND_LANGUAGES":
      return { ...state, backgroundLanguages: action.languages };

    // ─── Class (multiclass) ──────────────────
    case "ADD_CLASS": {
      // If there's already a single class, replace it (not multiclass)
      if (state.classes.length === 1) {
        // Same class: just make it active, don't reset anything
        if (state.classes[0].className === action.className) {
          return { ...state, activeClassIndex: 0 };
        }
        // Different class: replace it
        const newEntry = createEmptyClassEntry(action.className);
        return {
          ...state,
          classes: [newEntry],
          activeClassIndex: 0,
          skillProficiencies: [],
          skillExpertise: [],
          spellSelections: {},
          equipment: [],
          asiSelections: [],
        };
      }
      // No class yet: add fresh
      const newEntry = createEmptyClassEntry(action.className);
      return {
        ...state,
        classes: [newEntry],
        activeClassIndex: 0,
      };
    }

    case "REMOVE_CLASS": {
      if (state.classes.length <= 1) return state;
      const newClasses = state.classes.filter((_, i) => i !== action.index);
      const removedClassName = state.classes[action.index]?.className;
      const newActiveIndex = Math.min(state.activeClassIndex, newClasses.length - 1);

      // Remove spell selections for the removed class
      const newSpellSelections = { ...state.spellSelections };
      if (removedClassName) {
        delete newSpellSelections[removedClassName];
      }

      // Trim ASI selections for the removed class
      const newAsiSelections = state.asiSelections
        .filter((s) => s.classIndex !== action.index)
        .map((s) => ({
          ...s,
          classIndex: s.classIndex > action.index ? s.classIndex - 1 : s.classIndex,
        }));

      return {
        ...state,
        classes: newClasses,
        activeClassIndex: newActiveIndex,
        spellSelections: newSpellSelections,
        asiSelections: newAsiSelections,
        skillProficiencies: [],
        skillExpertise: [],
      };
    }

    case "SET_ACTIVE_CLASS":
      return { ...state, activeClassIndex: action.index };

    case "SET_CLASS_NAME": {
      const newClasses = [...state.classes];
      const oldClassName = newClasses[action.index]?.className;
      newClasses[action.index] = createEmptyClassEntry(action.className);

      // Remove old spell selections
      const newSpellSelections = { ...state.spellSelections };
      if (oldClassName) {
        delete newSpellSelections[oldClassName];
      }

      return {
        ...state,
        classes: newClasses,
        spellSelections: newSpellSelections,
        skillProficiencies: [],
        skillExpertise: [],
        asiSelections: state.asiSelections.filter((s) => s.classIndex !== action.index),
        equipment: [],
      };
    }

    case "SET_CLASS_LEVEL": {
      const newClasses = [...state.classes];
      const entry = { ...newClasses[action.index] };
      entry.level = action.level;
      if (action.level < 3) {
        entry.subclass = null;
      }
      newClasses[action.index] = entry;

      // Trim ASI selections for this class to valid levels
      const validLevels = new Set(
        getASILevelsForClasses([{ className: entry.className, level: action.level }])
          .filter((a) => a.classIndex === action.index)
          .map((a) => a.level),
      );
      const trimmedAsi = state.asiSelections.filter(
        (s) => s.classIndex !== action.index || validLevels.has(s.level),
      );

      // Reset spell selections for this class
      const newSpellSelections = { ...state.spellSelections };
      delete newSpellSelections[entry.className];

      return {
        ...state,
        classes: newClasses,
        asiSelections: trimmedAsi,
        spellSelections: newSpellSelections,
      };
    }

    case "SET_CLASS_SUBCLASS": {
      const newClasses = [...state.classes];
      newClasses[action.index] = { ...newClasses[action.index], subclass: action.subclass };

      // Reset spell selections for this class (subclass may change always-prepared)
      const className = newClasses[action.index].className;
      const newSpellSelections = { ...state.spellSelections };
      delete newSpellSelections[className];

      return { ...state, classes: newClasses, spellSelections: newSpellSelections };
    }

    case "SET_OPTIONAL_FEATURE": {
      const newClasses = [...state.classes];
      newClasses[action.index] = {
        ...newClasses[action.index],
        optionalFeatureSelections: {
          ...newClasses[action.index].optionalFeatureSelections,
          [action.featureType]: action.selected,
        },
      };
      return { ...state, classes: newClasses };
    }

    case "SET_WEAPON_MASTERIES": {
      const newClasses = [...state.classes];
      newClasses[action.index] = {
        ...newClasses[action.index],
        weaponMasteries: action.weapons,
      };
      return { ...state, classes: newClasses };
    }

    // ─── Abilities ────────────────────────────
    case "SET_ABILITY_METHOD": {
      const defaults: Record<string, AbilityScores> = {
        "standard-array": { ...STANDARD_ARRAY_DEFAULT },
        "point-buy": { ...POINT_BUY_DEFAULT },
        manual: { ...DEFAULT_ABILITIES },
      };
      return {
        ...state,
        abilityMethod: action.method,
        baseAbilities: defaults[action.method],
        asiAssignments: {},
      };
    }

    case "SET_BASE_ABILITIES":
      return { ...state, baseAbilities: action.abilities };

    case "SET_ABILITY":
      return {
        ...state,
        baseAbilities: {
          ...state.baseAbilities,
          [action.ability]: action.value,
        },
      };

    case "SET_ASI_MODE":
      return { ...state, asiMode: action.mode, asiAssignments: {} };

    case "SET_ASI_ASSIGNMENT":
      return {
        ...state,
        asiAssignments: {
          ...state.asiAssignments,
          [action.ability]: action.value,
        },
      };

    case "CLEAR_ASI":
      return { ...state, asiAssignments: {} };

    // ─── Feats / ASI Selections ────────────────
    case "SET_ASI_SELECTION": {
      const existing = state.asiSelections.filter(
        (s) => !(s.classIndex === action.classIndex && s.level === action.level),
      );
      return {
        ...state,
        asiSelections: [...existing, action.selection].sort((a, b) =>
          a.classIndex !== b.classIndex ? a.classIndex - b.classIndex : a.level - b.level,
        ),
      };
    }

    case "CLEAR_ASI_SELECTIONS":
      return { ...state, asiSelections: [] };

    case "SET_ORIGIN_FEAT_OVERRIDES":
      return {
        ...state,
        originFeatOverrides: { ...state.originFeatOverrides, ...action.overrides },
      };

    case "SET_SPECIES_ORIGIN_FEAT_OVERRIDES":
      return {
        ...state,
        speciesOriginFeatOverrides: { ...state.speciesOriginFeatOverrides, ...action.overrides },
      };

    // ─── Skills ───────────────────────────────
    case "TOGGLE_SKILL": {
      const has = state.skillProficiencies.includes(action.skill);
      return {
        ...state,
        skillProficiencies: has
          ? state.skillProficiencies.filter((s) => s !== action.skill)
          : [...state.skillProficiencies, action.skill],
        skillExpertise: has
          ? state.skillExpertise.filter((s) => s !== action.skill)
          : state.skillExpertise,
      };
    }

    case "TOGGLE_EXPERTISE": {
      const has = state.skillExpertise.includes(action.skill);
      return {
        ...state,
        skillExpertise: has
          ? state.skillExpertise.filter((s) => s !== action.skill)
          : [...state.skillExpertise, action.skill],
      };
    }

    case "RESET_SKILLS":
      return { ...state, skillProficiencies: [], skillExpertise: [] };

    // ─── Spells (per-class) ──────────────────
    case "TOGGLE_CANTRIP": {
      const sel = state.spellSelections[action.className] ?? { cantrips: [], spells: [] };
      const has = sel.cantrips.includes(action.spell);
      return {
        ...state,
        spellSelections: {
          ...state.spellSelections,
          [action.className]: {
            ...sel,
            cantrips: has
              ? sel.cantrips.filter((s) => s !== action.spell)
              : [...sel.cantrips, action.spell],
          },
        },
      };
    }

    case "TOGGLE_SPELL": {
      const sel = state.spellSelections[action.className] ?? { cantrips: [], spells: [] };
      const has = sel.spells.includes(action.spell);
      return {
        ...state,
        spellSelections: {
          ...state.spellSelections,
          [action.className]: {
            ...sel,
            spells: has
              ? sel.spells.filter((s) => s !== action.spell)
              : [...sel.spells, action.spell],
          },
        },
      };
    }

    case "RESET_SPELLS":
      return { ...state, spellSelections: {} };

    case "RESET_CLASS_SPELLS": {
      const newSel = { ...state.spellSelections };
      delete newSel[action.className];
      return { ...state, spellSelections: newSel };
    }

    // ─── Equipment ────────────────────────────
    case "SET_STARTING_EQUIPMENT_CHOICE":
      return { ...state, startingEquipmentChoice: action.choice };

    case "ADD_EQUIPMENT": {
      const existing = state.equipment.find(
        (e) => e.name === action.entry.name && e.source === action.entry.source,
      );
      if (existing) {
        return {
          ...state,
          equipment: state.equipment.map((e) =>
            e.name === action.entry.name && e.source === action.entry.source
              ? { ...e, quantity: e.quantity + action.entry.quantity }
              : e,
          ),
        };
      }
      return { ...state, equipment: [...state.equipment, action.entry] };
    }

    case "REMOVE_EQUIPMENT":
      return {
        ...state,
        equipment: state.equipment.filter((e) => e.name !== action.name),
      };

    case "SET_EQUIPMENT_QUANTITY":
      return {
        ...state,
        equipment: state.equipment.map((e) =>
          e.name === action.name ? { ...e, quantity: action.quantity } : e,
        ),
      };

    case "TOGGLE_EQUIPPED":
      return {
        ...state,
        equipment: state.equipment.map((e) =>
          e.name === action.name ? { ...e, equipped: !e.equipped } : e,
        ),
      };

    case "ADD_STARTING_EQUIPMENT": {
      let newEquipment = [...state.equipment];
      for (const item of action.items) {
        const existing = newEquipment.find((e) => e.name === item.name && e.source === item.source);
        if (existing) {
          newEquipment = newEquipment.map((e) =>
            e.name === item.name && e.source === item.source
              ? { ...e, quantity: e.quantity + item.quantity }
              : e,
          );
        } else {
          newEquipment.push(item);
        }
      }
      const newCurrency: Currency = {
        cp: state.currency.cp + action.currency.cp,
        sp: state.currency.sp + action.currency.sp,
        gp: state.currency.gp + action.currency.gp,
        pp: state.currency.pp + action.currency.pp,
      };
      return { ...state, equipment: newEquipment, currency: newCurrency };
    }

    case "SET_CURRENCY":
      return { ...state, currency: action.currency };

    // ─── Details ──────────────────────────────
    case "SET_NAME":
      return { ...state, name: action.name };

    case "SET_ALIGNMENT":
      return { ...state, alignment: action.alignment };

    case "SET_BACKSTORY":
      return { ...state, backstory: action.backstory };

    case "SET_APPEARANCE":
      return { ...state, appearance: { ...state.appearance, ...action.appearance } };

    case "SET_TRAITS":
      return { ...state, traits: { ...state.traits, ...action.traits } };

    default:
      return state;
  }
}
