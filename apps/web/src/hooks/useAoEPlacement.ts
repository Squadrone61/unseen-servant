"use client";

import { useState, useMemo, useCallback } from "react";
import type {
  AoEOverlay,
  CombatState,
  CreatureSize,
  GridPosition,
} from "@unseen-servant/shared/types";
import type { AoEShape } from "@unseen-servant/shared/utils";
import { buildAoEShape, tilesInShape, shapeContainsPoint } from "@unseen-servant/shared/utils";

function sizeSpan(s: CreatureSize): number {
  switch (s) {
    case "gargantuan":
      return 4;
    case "huge":
      return 3;
    case "large":
      return 2;
    default:
      return 1;
  }
}

// ─── Types ───

export type AoEMode = "idle" | "placing" | "moving";

export type RectanglePreset = "free" | "line" | "cube";

/**
 * Staged AoE currently being placed or moved. Fields are shape-specific:
 * - sphere:    origin = grid corner (world coord in tile-units). size = radius ft.
 * - cone:      origin = caster tile. direction = aim deg. size = length ft.
 * - rectangle:
 *     - line:  origin = anchor tile. direction + length + width=5.
 *     - cube:  origin = grid corner. size = side ft (length=width=size).
 *     - free:  rectFrom/rectTo = opposing corner tiles (axis-aligned).
 */
export interface StagedAoE {
  shape: "sphere" | "cone" | "rectangle";
  origin: GridPosition;
  size: number;
  direction?: number;
  length?: number;
  width?: number;
  rectFrom?: GridPosition;
  rectTo?: GridPosition;
  spellName?: string;
  label?: string;
  color: string;
  concentration?: boolean;
  rectanglePreset?: RectanglePreset;
  targetAoeId?: string;
  locked: boolean;
  savedOriginal?: AoEOverlay;
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
  rectanglePreset?: RectanglePreset;
  save?: { ability: string; dc: "spell_save_dc" | number };
  originAnchor?: GridPosition;
}

/** Single pointer sample used by `updateAim`. */
export interface AimPointer {
  /** The tile the pointer is over (floor of world coords). */
  tile: GridPosition;
  /** The world position (tile-units). */
  world: { x: number; y: number };
  /** The tile the drag started on (for shapes that anchor on mousedown). */
  anchorTile: GridPosition;
}

export interface UseAoEPlacementResult {
  mode: AoEMode;
  stagedAoE: StagedAoE | null;
  affectedTiles: GridPosition[];
  affectedCombatants: AoECounts;
  shape: AoEShape | null;
  startPlacement: (params: StartPlacementParams) => void;
  startMove: (aoe: AoEOverlay) => void;
  /** Dispatch a pointer update to the currently staged AoE. */
  updateAim: (pointer: AimPointer) => void;
  setSize: (sizeFt: number) => void;
  cancel: () => void;
  clearStaged: () => void;
}

// ─── Helpers ───

const nearestCorner = (world: { x: number; y: number }): GridPosition => ({
  x: Math.round(world.x),
  y: Math.round(world.y),
});

/** Degrees with 0=north, 90=east, clockwise. */
const angleDeg = (dx: number, dy: number): number =>
  ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;

// ─── Hook ───

export function useAoEPlacement(
  combat: CombatState | null,
  map: { width: number; height: number } | null,
  myCharacterName?: string,
): UseAoEPlacementResult {
  const [mode, setMode] = useState<AoEMode>("idle");
  const [stagedAoE, setStagedAoE] = useState<StagedAoE | null>(null);

  const casterPosition = useMemo((): GridPosition | undefined => {
    if (!combat || !myCharacterName) return undefined;
    const lcName = myCharacterName.toLowerCase();
    const combatant = Object.values(combat.combatants).find((c) => c.name.toLowerCase() === lcName);
    return combatant?.position ?? undefined;
  }, [combat, myCharacterName]);

  const startPlacement = useCallback(
    (params: StartPlacementParams) => {
      const origin = params.originAnchor ?? casterPosition ?? { x: 0, y: 0 };
      const isRect = params.shape === "rectangle";
      const preset: RectanglePreset | undefined = isRect
        ? (params.rectanglePreset ?? "free")
        : undefined;
      setStagedAoE({
        shape: params.shape,
        origin,
        size: params.size,
        direction: params.shape === "cone" || preset === "line" ? 90 : undefined,
        length: preset === "cube" ? params.size : isRect ? params.size : undefined,
        width: preset === "cube" ? params.size : preset === "line" ? 5 : undefined,
        spellName: params.spellName,
        label: params.label ?? params.spellName ?? "AoE",
        color: params.color ?? "#BDBDBD",
        concentration: params.concentration,
        rectanglePreset: preset,
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
      length: aoe.length,
      width: aoe.width,
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

  /** Route a pointer sample to the right update based on staged shape/preset. */
  const updateAim = useCallback(({ tile, world, anchorTile }: AimPointer) => {
    setStagedAoE((prev) => {
      if (!prev) return prev;
      switch (prev.shape) {
        case "sphere":
          return { ...prev, origin: nearestCorner(world), locked: false };
        case "cone": {
          const originCx = prev.origin.x + 0.5;
          const originCy = prev.origin.y + 0.5;
          const dx = world.x - originCx;
          const dy = world.y - originCy;
          if (dx === 0 && dy === 0) return prev;
          return { ...prev, direction: angleDeg(dx, dy), locked: false };
        }
        case "rectangle": {
          const preset = prev.rectanglePreset ?? "free";
          if (preset === "cube") {
            return { ...prev, origin: nearestCorner(world), locked: false };
          }
          if (preset === "free") {
            return {
              ...prev,
              rectFrom: anchorTile,
              rectTo: tile,
              origin: anchorTile,
              locked: false,
            };
          }
          // line: rotates, length from drag distance
          const anchorCx = anchorTile.x + 0.5;
          const anchorCy = anchorTile.y + 0.5;
          const dx = world.x - anchorCx;
          const dy = world.y - anchorCy;
          const distTiles = Math.sqrt(dx * dx + dy * dy);
          const lengthFt = Math.max(1, Math.round(distTiles)) * 5;
          const direction = distTiles > 1e-6 ? angleDeg(dx, dy) : (prev.direction ?? 90);
          return {
            ...prev,
            origin: anchorTile,
            direction,
            length: lengthFt,
            width: 5,
            locked: false,
          };
        }
      }
    });
  }, []);

  const setSize = useCallback((sizeFt: number) => {
    setStagedAoE((prev) => {
      if (!prev) return prev;
      const size = Math.max(5, sizeFt);
      const nextLength = prev.rectanglePreset === "cube" ? size : prev.length;
      const nextWidth = prev.rectanglePreset === "cube" ? size : prev.width;
      return { ...prev, size, length: nextLength, width: nextWidth };
    });
  }, []);

  const cancel = useCallback(() => {
    setStagedAoE(null);
    setMode("idle");
  }, []);

  const clearStaged = cancel;

  // Build geometric shape from staged state.
  const shape = useMemo((): AoEShape | null => {
    if (!stagedAoE) return null;
    switch (stagedAoE.shape) {
      case "sphere":
        // origin is a grid corner in world coords.
        return {
          kind: "circle",
          cx: stagedAoE.origin.x,
          cy: stagedAoE.origin.y,
          r: stagedAoE.size / 5,
        };
      case "cone":
        return buildAoEShape({
          kind: "cone",
          casterTile: stagedAoE.origin,
          directionDeg: stagedAoE.direction ?? 90,
          sizeFt: stagedAoE.size,
        });
      case "rectangle": {
        const preset = stagedAoE.rectanglePreset ?? "free";
        if (preset === "line") {
          const lengthFt = stagedAoE.length ?? stagedAoE.size;
          if (lengthFt <= 0) return null;
          return buildAoEShape({
            kind: "obox",
            anchorTile: stagedAoE.origin,
            directionDeg: stagedAoE.direction ?? 90,
            lengthFt,
            widthFt: 5,
          });
        }
        if (preset === "cube") {
          const sideTiles = stagedAoE.size / 5;
          return {
            kind: "obox",
            cx: stagedAoE.origin.x,
            cy: stagedAoE.origin.y,
            length: sideTiles,
            width: sideTiles,
            dir: 0,
          };
        }
        // free — axis-aligned from rectFrom..rectTo
        const from = stagedAoE.rectFrom ?? stagedAoE.origin;
        const to = stagedAoE.rectTo ?? stagedAoE.origin;
        const minX = Math.min(from.x, to.x);
        const maxX = Math.max(from.x, to.x);
        const minY = Math.min(from.y, to.y);
        const maxY = Math.max(from.y, to.y);
        return {
          kind: "obox",
          cx: (minX + maxX + 1) / 2,
          cy: (minY + maxY + 1) / 2,
          length: maxY - minY + 1,
          width: maxX - minX + 1,
          dir: 0,
        };
      }
    }
  }, [stagedAoE]);

  const affectedTiles = useMemo((): GridPosition[] => {
    if (!shape || !map) return [];
    return tilesInShape(shape, map.width, map.height);
  }, [shape, map]);

  const affectedCombatants = useMemo((): AoECounts => {
    if (!combat || !shape) return { enemies: [], allies: [], self: [] };
    const enemies: string[] = [];
    const allies: string[] = [];
    const self: string[] = [];
    const lcMyName = myCharacterName?.toLowerCase();

    for (const combatant of Object.values(combat.combatants)) {
      const pos = combatant.position;
      if (!pos) continue;
      const span = sizeSpan(combatant.size);
      let hit = false;
      for (let dy = 0; dy < span && !hit; dy++) {
        for (let dx = 0; dx < span && !hit; dx++) {
          if (shapeContainsPoint(shape, { x: pos.x + dx + 0.5, y: pos.y + dy + 0.5 })) {
            hit = true;
          }
        }
      }
      if (!hit) continue;

      if (lcMyName && combatant.name.toLowerCase() === lcMyName) {
        self.push(combatant.name);
      } else if (combatant.type === "player") {
        allies.push(combatant.name);
      } else {
        enemies.push(combatant.name);
      }
    }
    return { enemies, allies, self };
  }, [combat, shape, myCharacterName]);

  return {
    mode,
    stagedAoE,
    affectedTiles,
    affectedCombatants,
    shape,
    startPlacement,
    startMove,
    updateAim,
    setSize,
    cancel,
    clearStaged,
  };
}
