"use client";

import { createContext, useContext, useReducer, useState, type ReactNode } from "react";
import {
  type BuilderState,
  type BuilderAction,
  builderReducer,
  createInitialState,
} from "./builder-state";
import type { Item, Currency, CharacterTraits } from "@unseen-servant/shared/types";

// ─── Sibling equipment store ──────────────────────────────────────────────────
// Inventory and currency are runtime state owned by `dynamic.inventory` /
// `dynamic.currency`. Holding them in BuilderState made them go stale as soon
// as in-game MCP tools (add_item, update_currency, ...) mutated the live copy.
//
// This sibling store is the builder-flow's handle on that runtime state:
//  - On create: starts empty. User's picks seed `dynamic.inventory` on save.
//  - On edit load: seeded from `character.dynamic.inventory` / `.currency` so
//    the Equipment + Details steps show the live, post-mutation inventory.
//  - On save: sibling state becomes the new `dynamic.inventory` / `.currency`.

export interface EquipmentState {
  inventory: Item[];
  currency: Currency;
}

export type EquipmentAction =
  | { type: "ADD_EQUIPMENT"; item: Item }
  | { type: "ADD_EQUIPMENT_BATCH"; items: Item[] }
  | { type: "REMOVE_EQUIPMENT"; index: number }
  | { type: "REMOVE_EQUIPMENT_BATCH"; packName: string }
  | { type: "TOGGLE_EQUIPPED"; index: number }
  | { type: "SET_CURRENCY"; currency: Currency }
  | { type: "LOAD_EQUIPMENT"; state: EquipmentState }
  | { type: "RESET_EQUIPMENT" };

function createInitialEquipment(): EquipmentState {
  return { inventory: [], currency: { cp: 0, sp: 0, gp: 0, pp: 0 } };
}

function equipmentReducer(state: EquipmentState, action: EquipmentAction): EquipmentState {
  switch (action.type) {
    case "ADD_EQUIPMENT":
      return { ...state, inventory: [...state.inventory, action.item] };

    case "ADD_EQUIPMENT_BATCH":
      return { ...state, inventory: [...state.inventory, ...action.items] };

    case "REMOVE_EQUIPMENT":
      return { ...state, inventory: state.inventory.filter((_, i) => i !== action.index) };

    case "REMOVE_EQUIPMENT_BATCH":
      return {
        ...state,
        inventory: state.inventory.filter((item) => item.fromPack !== action.packName),
      };

    case "TOGGLE_EQUIPPED":
      return {
        ...state,
        inventory: state.inventory.map((item, i) =>
          i === action.index ? { ...item, equipped: !item.equipped } : item,
        ),
      };

    case "SET_CURRENCY":
      return { ...state, currency: action.currency };

    case "LOAD_EQUIPMENT":
      return action.state;

    case "RESET_EQUIPMENT":
      return createInitialEquipment();

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ─── Sibling identity store ───────────────────────────────────────────────────
// `traits` lives in `character.static.traits`, not in the builder snapshot.
// This sibling store is the Details step's handle on that value — seeded from
// `character.static.traits` on edit-mode load, flows back via `buildCharacter`.

export interface IdentityState {
  traits: CharacterTraits;
}

export type IdentityAction =
  | { type: "SET_TRAITS"; traits: Partial<CharacterTraits> }
  | { type: "LOAD_IDENTITY"; state: IdentityState }
  | { type: "RESET_IDENTITY" };

function createInitialIdentity(): IdentityState {
  return { traits: {} };
}

function identityReducer(state: IdentityState, action: IdentityAction): IdentityState {
  switch (action.type) {
    case "SET_TRAITS":
      return { ...state, traits: { ...state.traits, ...action.traits } };
    case "LOAD_IDENTITY":
      return action.state;
    case "RESET_IDENTITY":
      return createInitialIdentity();
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface BuilderContextValue {
  state: BuilderState;
  dispatch: React.Dispatch<BuilderAction>;
  equipment: EquipmentState;
  equipmentDispatch: React.Dispatch<EquipmentAction>;
  identity: IdentityState;
  identityDispatch: React.Dispatch<IdentityAction>;
  /** Which class tab is active in the Class/Feats/Spells steps — transient UI. */
  activeClassIndex: number;
  setActiveClassIndex: (index: number) => void;
}

const BuilderContext = createContext<BuilderContextValue | null>(null);

export function BuilderProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(builderReducer, undefined, createInitialState);
  const [equipment, equipmentDispatch] = useReducer(
    equipmentReducer,
    undefined,
    createInitialEquipment,
  );
  const [identity, identityDispatch] = useReducer(
    identityReducer,
    undefined,
    createInitialIdentity,
  );
  const [activeClassIndex, setActiveClassIndex] = useState(0);

  return (
    <BuilderContext.Provider
      value={{
        state,
        dispatch,
        equipment,
        equipmentDispatch,
        identity,
        identityDispatch,
        activeClassIndex,
        setActiveClassIndex,
      }}
    >
      {children}
    </BuilderContext.Provider>
  );
}

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder must be used within BuilderProvider");
  return ctx;
}
