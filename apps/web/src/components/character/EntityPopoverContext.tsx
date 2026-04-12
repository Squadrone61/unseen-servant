"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { EntityCategory } from "@unseen-servant/shared/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PopoverEntry {
  id: string;
  category: EntityCategory;
  name: string;
  position: { x: number; y: number };
  level: number;
}

interface EntityPopoverContextType {
  stack: PopoverEntry[];
  push: (category: EntityCategory, name: string, position: { x: number; y: number }) => void;
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
    (category: EntityCategory, name: string, position: { x: number; y: number }) => {
      // Don't open the same entity if it's already the topmost
      setStack((prev) => {
        const top = prev[prev.length - 1];
        if (top && top.category === category && top.name === name) return prev;
        const entry: PopoverEntry = {
          id: `ep-${++nextId}`,
          category,
          name,
          position,
          level: prev.length,
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
// Hook
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
    (category: EntityCategory, name: string, position: { x: number; y: number }) => {
      ctx?.push(category, name, position);
    },
    [ctx],
  );
  return ctx ? handleEntityClick : undefined;
}
