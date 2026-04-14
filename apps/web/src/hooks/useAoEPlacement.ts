"use client";

import { useState, useMemo, useCallback } from "react";
import type { AoEOverlay, CombatState, GridPosition } from "@unseen-servant/shared/types";
import { computeAoETiles } from "@unseen-servant/shared/utils";

// ─── Types ───

export type AoEMode = "idle" | "placing" | "moving";

export interface StagedAoE {
  shape: "sphere" | "cone" | "rectangle";
  origin: GridPosition;
  size: number;
  direction?: number;
  spellName?: string;
  label?: string;
  color: string;
  concentration?: boolean;
  rectanglePreset?: "free" | "line" | "cube";
  /** Present in "moving" mode — refers to the overlay being repositioned. */
  targetAoeId?: string;
  /** True after the user releases the drag — aim is locked. */
  locked: boolean;
  /** Original overlay pose saved so Esc can revert the move. */
  savedOriginal?: AoEOverlay;
  /** Save throw info (for display in chip/badge) */
  save?: { ability: string; dc: "spell_save_dc" | number };
}

export interface AoECounts {
  enemies: string[];
  allies: string[];
  self: string[];
}

export interface StartPlacementParams {
  shape: "sphere" | "cone" | "rectangle";
  size: number;
  spellName?: string;
  label?: string;
  color?: string;
  concentration?: boolean;
  rectanglePreset?: "free" | "line" | "cube";
  save?: { ability: string; dc: "spell_save_dc" | number };
  /** If provided, snaps the initial origin to this tile. */
  originAnchor?: GridPosition;
}

export interface UseAoEPlacementResult {
  mode: AoEMode;
  stagedAoE: StagedAoE | null;
  affectedTiles: GridPosition[];
  affectedCombatants: AoECounts;
  startPlacement: (params: StartPlacementParams) => void;
  startMove: (aoe: AoEOverlay) => void;
  setAim: (originTile: GridPosition, cursorWorld: { x: number; y: number }) => void;
  setSize: (sizeFt: number) => void;
  cancel: () => void;
  clearStaged: () => void;
}

// ─── Hook ───

export function useAoEPlacement(
  combat: CombatState | null,
  map: { width: number; height: number } | null,
  myCharacterName?: string,
): UseAoEPlacementResult {
  const [mode, setMode] = useState<AoEMode>("idle");
  const [stagedAoE, setStagedAoE] = useState<StagedAoE | null>(null);

  // Find caster's position from combat state
  const casterPosition = useMemo((): GridPosition | undefined => {
    if (!combat || !myCharacterName) return undefined;
    const lcName = myCharacterName.toLowerCase();
    const combatant = Object.values(combat.combatants).find((c) => c.name.toLowerCase() === lcName);
    return combatant?.position ?? undefined;
  }, [combat, myCharacterName]);

  const startPlacement = useCallback(
    (params: StartPlacementParams) => {
      const origin = params.originAnchor ?? casterPosition ?? { x: 0, y: 0 };
      setStagedAoE({
        shape: params.shape,
        origin,
        size: params.size,
        direction: 90, // default east
        spellName: params.spellName,
        label: params.label ?? params.spellName ?? "AoE",
        color: params.color ?? "#BDBDBD",
        concentration: params.concentration,
        rectanglePreset: params.rectanglePreset,
        save: params.save,
        locked: false,
      });
      setMode("placing");
    },
    [casterPosition],
  );

  const startMove = useCallback((aoe: AoEOverlay) => {
    setStagedAoE({
      shape: aoe.shape,
      origin: aoe.center,
      size: aoe.size ?? 20,
      direction: aoe.direction,
      spellName: aoe.label,
      label: aoe.label,
      color: aoe.color,
      concentration: false,
      rectanglePreset: aoe.rectanglePreset,
      targetAoeId: aoe.id,
      locked: false,
      savedOriginal: aoe,
    });
    setMode("moving");
  }, []);

  const setAim = useCallback((originTile: GridPosition, cursorWorld: { x: number; y: number }) => {
    setStagedAoE((prev) => {
      if (!prev) return prev;
      // Compute direction from tile center to cursor world position
      const tileCenterX = originTile.x + 0.5;
      const tileCenterY = originTile.y + 0.5;
      const dx = cursorWorld.x - tileCenterX;
      const dy = cursorWorld.y - tileCenterY;
      // atan2: our convention is 0=north, 90=east, clockwise
      // Math atan2 gives angle from +x axis, CCW. Convert:
      const rad = Math.atan2(dx, -dy);
      const deg = ((rad * 180) / Math.PI + 360) % 360;
      return {
        ...prev,
        origin: originTile,
        direction: deg,
        locked: false,
      };
    });
  }, []);

  const setSize = useCallback((sizeFt: number) => {
    setStagedAoE((prev) => {
      if (!prev) return prev;
      return { ...prev, size: Math.max(5, sizeFt) };
    });
  }, []);

  const cancel = useCallback(() => {
    setStagedAoE(null);
    setMode("idle");
  }, []);

  const clearStaged = useCallback(() => {
    setStagedAoE(null);
    setMode("idle");
  }, []);

  // Compute affected tiles from staged AoE
  const affectedTiles = useMemo((): GridPosition[] => {
    if (!stagedAoE || !map) return [];
    const { shape, origin, size, direction } = stagedAoE;

    if (shape === "sphere") {
      return computeAoETiles("sphere", origin, { size }, map.width, map.height);
    }
    if (shape === "cone") {
      return computeAoETiles(
        "cone",
        origin,
        { size, direction: direction ?? 90 },
        map.width,
        map.height,
      );
    }
    if (shape === "rectangle") {
      const preset = stagedAoE.rectanglePreset;
      // Use rotated rectangle: length along direction, width depends on preset
      const length = size;
      const width = preset === "line" ? 5 : preset === "cube" ? size : size;
      return computeAoETiles(
        "rectangle",
        origin,
        { direction: direction ?? 0, length, width },
        map.width,
        map.height,
      );
    }
    return [];
  }, [stagedAoE, map]);

  // Classify combatants by whether they're in the affected tiles
  const affectedCombatants = useMemo((): AoECounts => {
    if (!combat || affectedTiles.length === 0) {
      return { enemies: [], allies: [], self: [] };
    }
    const tileSet = new Set(affectedTiles.map((t) => `${t.x},${t.y}`));
    const enemies: string[] = [];
    const allies: string[] = [];
    const self: string[] = [];
    const lcMyName = myCharacterName?.toLowerCase();

    for (const combatant of Object.values(combat.combatants)) {
      if (!combatant.position) continue;
      const key = `${combatant.position.x},${combatant.position.y}`;
      if (!tileSet.has(key)) continue;

      if (lcMyName && combatant.name.toLowerCase() === lcMyName) {
        self.push(combatant.name);
      } else if (combatant.type === "player") {
        allies.push(combatant.name);
      } else {
        enemies.push(combatant.name);
      }
    }

    return { enemies, allies, self };
  }, [combat, affectedTiles, myCharacterName]);

  return {
    mode,
    stagedAoE,
    affectedTiles,
    affectedCombatants,
    startPlacement,
    startMove,
    setAim,
    setSize,
    cancel,
    clearStaged,
  };
}
