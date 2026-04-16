"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { EntityCategory } from "@unseen-servant/shared/types";
import type { EntityDetailPayload } from "@unseen-servant/shared/detail";
import type { StartPlacementParams } from "@/hooks/useAoEPlacement";

// ---------------------------------------------------------------------------
// Action handlers passed alongside the entry (frontend-only, not serializable)
// ---------------------------------------------------------------------------

export interface PopoverActionHandlers {
  /** Only relevant for spell entries that have an AoE area. */
  onCastAoE?: (params: StartPlacementParams) => void;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PopoverEntry {
  id: string;
  category: EntityCategory;
  name: string;
  position: { x: number; y: number };
  level: number;
  payload?: EntityDetailPayload[EntityCategory];
  actionHandlers?: PopoverActionHandlers;
}

interface EntityPopoverContextType {
  stack: PopoverEntry[];
  push: (
    category: EntityCategory,
    name: string,
    position: { x: number; y: number },
    payload?: EntityDetailPayload[EntityCategory],
    actionHandlers?: PopoverActionHandlers,
  ) => void;
  pop: () => void;
  closeAll: () => void;
  isTopmost: (id: string) => boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const EntityPopoverContext = createContext<EntityPopoverContextType | null>(null);

let nextId = 0;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function EntityPopoverProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<PopoverEntry[]>([]);

  const push = useCallback(
    (
      category: EntityCategory,
      name: string,
      position: { x: number; y: number },
      payload?: EntityDetailPayload[EntityCategory],
      actionHandlers?: PopoverActionHandlers,
    ) => {
      // Don't open the same entity if it's already the topmost.
      // Equality considers category + name. For contextual categories that may
      // differ by payload, we treat any new push as distinct.
      setStack((prev) => {
        const top = prev[prev.length - 1];
        if (top && top.category === category && top.name === name && !payload) return prev;
        const entry: PopoverEntry = {
          id: `ep-${++nextId}`,
          category,
          name,
          position,
          level: prev.length,
          payload,
          actionHandlers,
        };
        return [...prev, entry];
      });
    },
    [],
  );

  const pop = useCallback(() => {
    setStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  }, []);

  const closeAll = useCallback(() => {
    setStack([]);
  }, []);

  const isTopmost = useCallback(
    (id: string) => {
      return stack.length > 0 && stack[stack.length - 1].id === id;
    },
    [stack],
  );

  return (
    <EntityPopoverContext.Provider value={{ stack, push, pop, closeAll, isTopmost }}>
      {children}
    </EntityPopoverContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useEntityPopover() {
  const ctx = useContext(EntityPopoverContext);
  if (!ctx) {
    throw new Error("useEntityPopover must be used within an EntityPopoverProvider");
  }
  return ctx;
}

/**
 * Convenience hook: returns an onEntityClick handler that pushes onto the popover stack.
 * Safe to use outside the provider (returns undefined if no provider is present).
 */
export function useEntityClick() {
  const ctx = useContext(EntityPopoverContext);
  const handleEntityClick = useCallback(
    (
      category: EntityCategory,
      name: string,
      position: { x: number; y: number },
      payload?: EntityDetailPayload[EntityCategory],
    ) => {
      ctx?.push(category, name, position, payload);
    },
    [ctx],
  );
  return ctx ? handleEntityClick : undefined;
}
