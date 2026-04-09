"use client";

import { createContext, useContext, useReducer, type ReactNode } from "react";
import {
  type BuilderState,
  type BuilderAction,
  builderReducer,
  createInitialState,
} from "./builder-state";

interface BuilderContextValue {
  state: BuilderState;
  dispatch: React.Dispatch<BuilderAction>;
}

const BuilderContext = createContext<BuilderContextValue | null>(null);

export function BuilderProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(builderReducer, undefined, createInitialState);
  return <BuilderContext.Provider value={{ state, dispatch }}>{children}</BuilderContext.Provider>;
}

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder must be used within BuilderProvider");
  return ctx;
}
