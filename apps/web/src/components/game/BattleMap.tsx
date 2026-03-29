"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { InitiativeTracker } from "./InitiativeTracker";
import type {
  BattleMapState,
  CombatState,
  CharacterData,
  GridPosition,
  Combatant,
  TileType,
  CreatureSize,
  AoEOverlay,
  TileObjectCategory,
  ConditionEntry,
  MapTile,
} from "@unseen-servant/shared/types";
import { formatGridPosition, gridDistance, computeAoETiles } from "@unseen-servant/shared/utils";

// ─── Constants ───

const TILE_SIZE = 40;
const TILE_GAP = 1;
const LABEL_SIZE = 18;

const TILE_BG: Record<TileType, string> = {
  floor: "#26262c",
  wall: "#131318",
  water: "#182535",
  difficult_terrain: "#28221a",
  door: "#34291a",
  pit: "#0a0a0e",
  stairs: "#282830",
};

// Object abbreviation mapping
const OBJECT_ABBR: Record<string, string> = {
  table: "Tb",
  barrel: "Br",
  chair: "Ch",
  bookshelf: "Bk",
  crate: "Cr",
  door: "Dr",
  trap: "Tr",
  hazard: "Tr",
  pillar: "Pi",
  statue: "St",
  altar: "Al",
  ladder: "Ld",
};

// Object category colors
const CATEGORY_COLOR: Record<TileObjectCategory, string> = {
  furniture: "#D4A24E",
  hazard: "#DC3545",
  interactable: "#4FC3F7",
  container: "#8B8B8B",
  weapon: "#94A3B8",
};

// ─── Helpers ───

function sizeSpan(s: CreatureSize): number {
  switch (s) {
    case "large":
      return 2;
    case "huge":
      return 3;
    case "gargantuan":
      return 4;
    default:
      return 1;
  }
}

function getObjectAbbr(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, abbr] of Object.entries(OBJECT_ABBR)) {
    if (lower.includes(key)) return abbr;
  }
  return name.slice(0, 2).charAt(0).toUpperCase() + name.slice(1, 2);
}

// ─── BFS reachable tiles ───

function getReachableTiles(from: GridPosition, budgetFt: number, map: BattleMapState): Set<string> {
  const reachable = new Set<string>();
  if (budgetFt <= 0) return reachable;

  const best = new Map<string, number>();
  const startKey = `${from.x},${from.y}`;
  best.set(startKey, 0);

  // 0-1 BFS with deque (5ft = 0-cost bucket, 10ft = 1-cost bucket)
  const deque: { x: number; y: number; cost: number }[] = [{ x: from.x, y: from.y, cost: 0 }];
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
  ];

  while (deque.length > 0) {
    const cur = deque.shift()!;
    // Skip if we've already found a cheaper path to this node
    const curKey = `${cur.x},${cur.y}`;
    if ((best.get(curKey) ?? Infinity) < cur.cost) continue;

    for (const { dx, dy } of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;

      const tile = map.tiles[ny]?.[nx];
      if (!tile) continue;
      if (tile.type === "wall" || tile.type === "pit") continue;

      const moveCost = tile.type === "difficult_terrain" || tile.type === "water" ? 10 : 5;
      const total = cur.cost + moveCost;
      if (total > budgetFt) continue;

      const key = `${nx},${ny}`;
      if ((best.get(key) ?? Infinity) <= total) continue;
      best.set(key, total);
      reachable.add(key);

      // 0-1 BFS: push cheap moves to front, expensive to back
      if (moveCost === 5) {
        deque.unshift({ x: nx, y: ny, cost: total });
      } else {
        deque.push({ x: nx, y: ny, cost: total });
      }
    }
  }

  reachable.delete(startKey);
  return reachable;
}

// ─── AoE pulse animation style ───
const AOE_PULSE_KEYFRAMES = `
@keyframes aoePulse {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 0.25; }
}
`;

// ─── Component ───

interface BattleMapProps {
  map: BattleMapState;
  combat: CombatState;
  partyCharacters: Record<string, CharacterData>;
  myCharacterName?: string;
  onMoveToken: (to: GridPosition) => void;
  onEndTurn: () => void;
  onCombatantClick?: (combatantId: string) => void;
  highlightedCombatantId?: string | null;
  style?: React.CSSProperties;
  className?: string;
}

// Drag state stored in ref to avoid re-renders during drag
interface DragState {
  active: boolean;
  combatantId: string | null;
  startPos: GridPosition | null;
  currentPixel: { x: number; y: number } | null;
  currentTile: GridPosition | null;
}

export function BattleMap({
  map,
  combat,
  partyCharacters,
  myCharacterName,
  onMoveToken,
  onEndTurn: _onEndTurn,
  onCombatantClick,
  highlightedCombatantId,
  style,
  className,
}: BattleMapProps) {
  const [hoveredTile, setHoveredTile] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [showReachable, setShowReachable] = useState(false);
  const [hoveredTokenId, setHoveredTokenId] = useState<string | null>(null);
  const [measureTarget, setMeasureTarget] = useState<GridPosition | null>(null);
  const [dragRender, setDragRender] = useState(0); // increment to force re-render during drag
  const [hoveredAoeId, setHoveredAoeId] = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState>({
    active: false,
    combatantId: null,
    startPos: null,
    currentPixel: null,
    currentTile: null,
  });
  const justDraggedRef = useRef(false);

  // My combatant
  const myCombatant = useMemo(() => {
    if (!myCharacterName) return null;
    const lcName = myCharacterName.toLowerCase();
    return (
      Object.values(combat.combatants).find(
        (c) => c.type === "player" && c.name.toLowerCase() === lcName,
      ) ?? null
    );
  }, [combat.combatants, myCharacterName]);

  // Is it my turn?
  const activeId = combat.turnOrder[combat.turnIndex];
  const isMyTurn = myCombatant !== null && activeId === myCombatant.id;

  // Reachable tiles — computed on demand
  const reachable = useMemo(() => {
    if (!showReachable || !myCombatant?.position) return new Set<string>();
    return getReachableTiles(
      myCombatant.position,
      myCombatant.speed - myCombatant.movementUsed,
      map,
    );
  }, [showReachable, myCombatant, map]);

  // Scroll highlighted combatant into view
  useEffect(() => {
    if (!highlightedCombatantId || !gridRef.current) return;
    const el = gridRef.current.querySelector(`[data-combatant="${highlightedCombatantId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [highlightedCombatantId]);

  // Resolve conditions for a combatant (returns ConditionEntry[])
  const getConditionEntries = useCallback(
    (c: Combatant): ConditionEntry[] => {
      if (c.type === "player") {
        const char = Object.values(partyCharacters).find(
          (p) => p.static.name.toLowerCase() === c.name.toLowerCase(),
        );
        const conditions = char?.dynamic.conditions ?? c.conditions ?? [];
        return conditions.map((cond) => (typeof cond === "string" ? { name: cond } : cond));
      }
      const conditions = c.conditions ?? [];
      return conditions.map((cond) => (typeof cond === "string" ? { name: cond } : cond));
    },
    [partyCharacters],
  );

  // Get condition names only
  const getConditions = useCallback(
    (c: Combatant): string[] => {
      return getConditionEntries(c).map((e) => e.name);
    },
    [getConditionEntries],
  );

  // Click handler for tiles
  const handleTileClick = useCallback(
    (x: number, y: number) => {
      if (showReachable && reachable.has(`${x},${y}`)) {
        onMoveToken({ x, y });
        setShowReachable(false);
        setSelectedTokenId(null);
      }
    },
    [showReachable, reachable, onMoveToken],
  );

  // Click on own token to select and show reachable
  const handleTokenClick = useCallback(
    (combatant: Combatant) => {
      // Ignore clicks that fire immediately after a drag release
      if (justDraggedRef.current) return;
      if (isMyTurn && myCombatant && combatant.id === myCombatant.id) {
        if (selectedTokenId === combatant.id) {
          // Deselect
          setSelectedTokenId(null);
          setShowReachable(false);
        } else {
          setSelectedTokenId(combatant.id);
          setShowReachable(true);
        }
      }
      onCombatantClick?.(combatant.id);
    },
    [isMyTurn, myCombatant, selectedTokenId, onCombatantClick],
  );

  // ─── Drag to Move ───

  const pixelToTile = useCallback(
    (clientX: number, clientY: number): GridPosition | null => {
      if (!gridContainerRef.current) return null;
      const rect = gridContainerRef.current.getBoundingClientRect();
      const x = Math.floor((clientX - rect.left) / ((TILE_SIZE + TILE_GAP) * zoom));
      const y = Math.floor((clientY - rect.top) / ((TILE_SIZE + TILE_GAP) * zoom));
      if (x < 0 || x >= map.width || y < 0 || y >= map.height) return null;
      return { x, y };
    },
    [map.width, map.height, zoom],
  );

  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent, combatant: Combatant) => {
      if (!isMyTurn || !myCombatant || combatant.id !== myCombatant.id) return;
      if (!combatant.position) return;

      e.preventDefault();
      e.stopPropagation();

      const ds = dragStateRef.current;
      ds.active = true;
      ds.combatantId = combatant.id;
      ds.startPos = { ...combatant.position };
      ds.currentTile = { ...combatant.position };
      ds.currentPixel = null;

      setShowReachable(true);
      setDragRender((prev) => prev + 1);
    },
    [isMyTurn, myCombatant],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds.active) return;

      ds.currentPixel = { x: e.clientX, y: e.clientY };
      const tile = pixelToTile(e.clientX, e.clientY);
      ds.currentTile = tile;
      setDragRender((prev) => prev + 1);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const ds = dragStateRef.current;
      if (!ds.active) return;

      const touch = e.touches[0];
      ds.currentPixel = { x: touch.clientX, y: touch.clientY };
      const tile = pixelToTile(touch.clientX, touch.clientY);
      ds.currentTile = tile;
      setDragRender((prev) => prev + 1);
    };

    const handleDragEnd = () => {
      const ds = dragStateRef.current;
      if (!ds.active) return;

      const targetTile = ds.currentTile;
      const startPos = ds.startPos;

      // Reset drag state
      ds.active = false;
      ds.combatantId = null;
      ds.startPos = null;
      ds.currentPixel = null;
      ds.currentTile = null;

      // Suppress the click event that fires right after mouseup on the same element
      justDraggedRef.current = true;
      requestAnimationFrame(() => {
        justDraggedRef.current = false;
      });

      setDragRender((prev) => prev + 1);

      if (
        targetTile &&
        startPos &&
        !(targetTile.x === startPos.x && targetTile.y === startPos.y) &&
        reachable.has(`${targetTile.x},${targetTile.y}`)
      ) {
        onMoveToken(targetTile);
      }

      setShowReachable(false);
      setSelectedTokenId(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleDragEnd);
    window.addEventListener("touchcancel", handleDragEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleDragEnd);
      window.removeEventListener("touchcancel", handleDragEnd);
    };
  }, [pixelToTile, reachable, onMoveToken]);

  // Combatants that have map positions
  const tokens = useMemo(
    () =>
      Object.values(combat.combatants)
        .filter((c): c is Combatant & { position: GridPosition } => c.position != null)
        .map((c) => ({
          ...c,
          span: sizeSpan(c.size),
          conds: getConditions(c),
        })),
    [combat.combatants, getConditions],
  );

  const movementLeft = myCombatant ? myCombatant.speed - myCombatant.movementUsed : 0;

  // Column labels (A, B, C...)
  const colLabels = useMemo(
    () => Array.from({ length: map.width }, (_, i) => String.fromCharCode(65 + (i % 26))),
    [map.width],
  );

  // AoE tiles computation
  const aoeTileMap = useMemo(() => {
    const aoeList = combat.activeAoE;
    if (!aoeList || aoeList.length === 0) return new Map<string, AoEOverlay[]>();

    const tileMap = new Map<string, AoEOverlay[]>();
    for (const aoe of aoeList) {
      const tiles = computeAoETiles(
        aoe.shape,
        aoe.center,
        {
          radius: aoe.radius,
          length: aoe.length,
          width: aoe.width,
          direction: aoe.direction,
        },
        map.width,
        map.height,
      );
      for (const t of tiles) {
        const key = `${t.x},${t.y}`;
        const existing = tileMap.get(key);
        if (existing) {
          existing.push(aoe);
        } else {
          tileMap.set(key, [aoe]);
        }
      }
    }
    return tileMap;
  }, [combat.activeAoE, map.width, map.height]);

  // AoE center labels
  const aoeCenters = useMemo(() => {
    const aoeList = combat.activeAoE;
    if (!aoeList || aoeList.length === 0) return [];
    return aoeList.map((aoe) => ({
      aoe,
      key: `${aoe.center.x},${aoe.center.y}`,
    }));
  }, [combat.activeAoE]);

  // Set of tiles affected by AoE (for token ring detection)
  const aoeTileSet = useMemo(() => {
    const result = new Map<string, string>(); // tileKey -> color
    for (const [key, aoes] of aoeTileMap.entries()) {
      result.set(key, aoes[0].color);
    }
    return result;
  }, [aoeTileMap]);

  // Grid dimensions in px
  const gridWidthPx = map.width * TILE_SIZE + (map.width - 1) * TILE_GAP;
  const gridHeightPx = map.height * TILE_SIZE + (map.height - 1) * TILE_GAP;

  // Token tooltip data resolver
  const getTokenTooltipData = useCallback(
    (c: Combatant) => {
      const isPlayer = c.type === "player";
      let currentHP: number | undefined;
      let maxHP: number | undefined;
      let ac: number | undefined;
      let concentration: { spellName: string; since?: number } | undefined;
      let conditionEntries: ConditionEntry[] = [];

      if (isPlayer) {
        const char = Object.values(partyCharacters).find(
          (p) => p.static.name.toLowerCase() === c.name.toLowerCase(),
        );
        if (char) {
          currentHP = char.dynamic.currentHP;
          maxHP = char.static.maxHP;
          ac = char.static.armorClass;
          concentration = char.dynamic.concentratingOn;
          conditionEntries = char.dynamic.conditions ?? [];
        }
      } else {
        currentHP = c.currentHP;
        maxHP = c.maxHP;
        ac = c.armorClass;
        concentration = c.concentratingOn;
        conditionEntries = (c.conditions ?? []).map((cond) =>
          typeof cond === "string" ? { name: cond } : cond,
        );
      }

      // Movement remaining (only during their turn)
      const isActiveTurn = c.id === activeId;
      const moveRemaining = isActiveTurn ? c.speed - c.movementUsed : undefined;

      // Grid position in A1 notation
      const posLabel = c.position ? formatGridPosition(c.position) : undefined;

      return {
        isPlayer,
        currentHP,
        maxHP,
        ac,
        concentration,
        conditionEntries,
        moveRemaining,
        posLabel,
      };
    },
    [partyCharacters, activeId],
  );

  // Tile tooltip data
  const getTileTooltipData = useCallback((tile: MapTile) => {
    const parts: string[] = [];
    if (tile.object) {
      parts.push(tile.object.name);
      if (tile.object.description) parts.push(tile.object.description);
    }
    if (tile.cover) {
      const coverLabel =
        tile.cover === "half"
          ? "Half cover"
          : tile.cover === "three-quarters"
            ? "Three-quarters cover"
            : "Full cover";
      parts.push(coverLabel);
    }
    if (tile.elevation && tile.elevation !== 0) {
      parts.push(`Elevation: ${tile.elevation > 0 ? "+" : ""}${tile.elevation}ft`);
    }
    if (tile.label) {
      parts.push(tile.label);
    }
    return parts.length > 0 ? parts : null;
  }, []);

  // Measurement line data (always active)
  const measureLine = useMemo(() => {
    if (!measureTarget || !myCombatant?.position) return null;
    const from = myCombatant.position;
    const to = measureTarget;
    const dist = gridDistance(from, to);

    const fromPx = {
      x: from.x * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
      y: from.y * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
    };
    const toPx = {
      x: to.x * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
      y: to.y * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
    };
    const midPx = {
      x: (fromPx.x + toPx.x) / 2,
      y: (fromPx.y + toPx.y) / 2,
    };

    return { fromPx, toPx, midPx, dist };
  }, [measureTarget, myCombatant?.position]);

  // Suppress the dragRender lint warning -- it is intentionally used for side-effect re-render
  void dragRender;

  return (
    <div className={`flex flex-col bg-[#111114] shrink-0 ${className ?? ""}`} style={style}>
      {/* AoE pulse animation */}
      <style dangerouslySetInnerHTML={{ __html: AOE_PULSE_KEYFRAMES }} />

      {/* Initiative Tracker (merged) */}
      <InitiativeTracker
        combat={combat}
        partyCharacters={partyCharacters}
        onCombatantClick={onCombatantClick}
      />

      {/* Your-turn banner */}
      {isMyTurn && (
        <div className="px-3 py-1.5 bg-amber-950/40 border-b border-amber-800/30 text-amber-300 text-xs font-medium tracking-wide flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Your turn &mdash; drag your token or click a highlighted tile to move
            <span className="text-amber-500/70 font-mono ml-1">{movementLeft}ft remaining</span>
          </div>
        </div>
      )}

      {/* Scrollable map area */}
      <div className="flex-1 min-h-0 overflow-auto p-2 relative flex items-start justify-center">
        {/* Zoom Controls */}
        <div className="absolute top-2 right-2 z-10 bg-gray-800/80 rounded flex gap-1 p-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="w-6 h-6 flex items-center justify-center text-xs text-gray-400 hover:text-gray-200 rounded hover:bg-gray-700/60 transition-colors"
            title="Zoom out"
          >
            -
          </button>
          <button
            onClick={() => setZoom(1)}
            className="px-1.5 h-6 flex items-center justify-center text-xs text-gray-400 hover:text-gray-200 rounded hover:bg-gray-700/60 transition-colors font-mono"
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
            className="w-6 h-6 flex items-center justify-center text-xs text-gray-400 hover:text-gray-200 rounded hover:bg-gray-700/60 transition-colors"
            title="Zoom in"
          >
            +
          </button>
        </div>

        {/* Labeled grid wrapper */}
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            display: "inline-block",
          }}
        >
          {/* Column labels row */}
          <div className="flex" style={{ marginLeft: LABEL_SIZE }}>
            {colLabels.map((label, i) => (
              <div
                key={`cl-${i}`}
                className="text-xs text-gray-600 flex items-center justify-center select-none"
                style={{
                  width: TILE_SIZE + (i < map.width - 1 ? TILE_GAP : 0),
                  height: LABEL_SIZE,
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Row labels + grid */}
          <div className="flex">
            {/* Row labels column */}
            <div className="flex flex-col" style={{ width: LABEL_SIZE }}>
              {Array.from({ length: map.height }, (_, i) => (
                <div
                  key={`rl-${i}`}
                  className="text-xs text-gray-600 flex items-center justify-center select-none"
                  style={{
                    height: TILE_SIZE + (i < map.height - 1 ? TILE_GAP : 0),
                    width: LABEL_SIZE,
                  }}
                >
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Grid + Token overlay container */}
            <div
              ref={gridContainerRef}
              className="relative"
              style={{
                width: gridWidthPx,
                height: gridHeightPx,
              }}
            >
              {/* ─── Layer 1: Tile Grid ─── */}
              <div
                ref={gridRef}
                className="absolute inset-0 rounded-sm overflow-hidden"
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${map.width}, ${TILE_SIZE}px)`,
                  gridTemplateRows: `repeat(${map.height}, ${TILE_SIZE}px)`,
                  gap: TILE_GAP,
                  backgroundColor: "#1c1c20",
                }}
              >
                {map.tiles.map((row, y) =>
                  row.map((tile, x) => {
                    const key = `${x},${y}`;
                    const isReach = reachable.has(key);
                    const isHoveredHere = hoveredTile === key;
                    const aoeOverlays = aoeTileMap.get(key);
                    const ds = dragStateRef.current;
                    const isDragTarget =
                      ds.active &&
                      ds.currentTile &&
                      ds.currentTile.x === x &&
                      ds.currentTile.y === y;
                    const isDragReachable = isDragTarget && isReach;
                    const isDragUnreachable = isDragTarget && !isReach;

                    // Cover border styling
                    let coverBorder: React.CSSProperties = {};
                    if (tile.cover === "half") {
                      coverBorder = { border: "1px dashed #D4A24E" };
                    } else if (tile.cover === "three-quarters") {
                      coverBorder = {
                        border: "1.5px solid #D4A24E",
                      };
                    } else if (tile.cover === "full") {
                      coverBorder = { border: "2px solid #D4A24E" };
                    }

                    const tileTooltipData = getTileTooltipData(tile);

                    return (
                      <div
                        key={`t-${key}`}
                        role={isReach ? "button" : undefined}
                        tabIndex={isReach ? 0 : undefined}
                        className={isReach ? "cursor-pointer" : ""}
                        style={{
                          gridRow: y + 1,
                          gridColumn: x + 1,
                          backgroundColor: TILE_BG[tile.type],
                          position: "relative",
                          ...coverBorder,
                        }}
                        onClick={() => handleTileClick(x, y)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleTileClick(x, y);
                        }}
                        onMouseEnter={() => {
                          setHoveredTile(key);
                          setMeasureTarget({ x, y });
                        }}
                        onMouseLeave={() => {
                          setHoveredTile(null);
                          setMeasureTarget(null);
                        }}
                      >
                        {/* Terrain textures */}
                        {tile.type === "difficult_terrain" && (
                          <div
                            className="absolute inset-0 opacity-20 pointer-events-none"
                            style={{
                              backgroundImage:
                                "repeating-linear-gradient(45deg, transparent 0 3px, rgba(180,140,60,.3) 3px 4px)",
                            }}
                          />
                        )}
                        {tile.type === "water" && (
                          <div
                            className="absolute inset-0 opacity-20 pointer-events-none"
                            style={{
                              backgroundImage:
                                "repeating-linear-gradient(160deg, transparent 0 5px, rgba(60,140,200,.25) 5px 6px)",
                            }}
                          />
                        )}
                        {tile.type === "stairs" && (
                          <div
                            className="absolute inset-0 opacity-25 pointer-events-none"
                            style={{
                              backgroundImage:
                                "repeating-linear-gradient(0deg, transparent 0 6px, rgba(200,200,220,.12) 6px 7px)",
                            }}
                          />
                        )}
                        {tile.type === "door" && (
                          <div className="absolute inset-[28%] rounded-sm border border-amber-800/40 bg-amber-900/15 pointer-events-none" />
                        )}

                        {/* Object abbreviation */}
                        {tile.object && (
                          <div
                            className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
                            style={{
                              color: CATEGORY_COLOR[tile.object.category] ?? "#8B8B8B",
                              opacity: 0.4,
                              fontSize: 10,
                              fontFamily: "monospace",
                              fontWeight: 700,
                            }}
                          >
                            {getObjectAbbr(tile.object.name)}
                          </div>
                        )}

                        {/* Elevation indicator */}
                        {tile.elevation != null && tile.elevation !== 0 && (
                          <div
                            className="absolute top-0 right-0.5 pointer-events-none select-none"
                            style={{
                              fontSize: 7,
                              color: tile.elevation > 0 ? "#94A3B8" : "#F59E0B",
                              opacity: 0.6,
                              fontFamily: "monospace",
                              lineHeight: 1,
                              paddingTop: 1,
                            }}
                          >
                            {tile.elevation > 0 ? "+" : ""}
                            {tile.elevation}
                          </div>
                        )}

                        {/* AoE overlay */}
                        {aoeOverlays && aoeOverlays.length > 0 && (
                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              backgroundColor: aoeOverlays[0].color,
                              animation: "aoePulse 3s ease-in-out infinite",
                            }}
                          />
                        )}

                        {/* Movement range overlay (only when showing reachable) */}
                        {isReach && !isDragTarget && (
                          <div className="absolute inset-0 pointer-events-none bg-emerald-500/10 ring-1 ring-inset ring-emerald-600/20" />
                        )}

                        {/* Drag target highlight */}
                        {isDragReachable && (
                          <div className="absolute inset-0 pointer-events-none bg-emerald-400/30 ring-2 ring-inset ring-emerald-400/50" />
                        )}
                        {isDragUnreachable && (
                          <div className="absolute inset-0 pointer-events-none bg-red-500/20 ring-1 ring-inset ring-red-500/40" />
                        )}

                        {/* Coordinate label on hover */}
                        {isHoveredHere && (
                          <div
                            className="absolute bottom-0 left-0 pointer-events-none select-none"
                            style={{
                              fontSize: 7,
                              color: "#9CA3AF",
                              opacity: 0.6,
                              fontFamily: "monospace",
                              lineHeight: 1,
                              paddingBottom: 1,
                              paddingLeft: 2,
                            }}
                          >
                            {formatGridPosition({ x, y })}
                          </div>
                        )}

                        {/* Tile tooltip on hover */}
                        {isHoveredHere && tileTooltipData && (
                          <div
                            className="absolute left-1/2 bottom-full mb-1 -translate-x-1/2 bg-gray-900 border border-gray-600/50 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-200 max-w-xs pointer-events-none"
                            style={{ zIndex: 35 }}
                          >
                            {tileTooltipData.map((line, i) => (
                              <div
                                key={i}
                                className={i > 0 ? "text-gray-400 mt-0.5" : "font-medium"}
                              >
                                {line}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }),
                )}
              </div>

              {/* ─── Layer 2: AoE center markers + hover tooltips ─── */}
              {aoeCenters.map(({ aoe }) => {
                const left = aoe.center.x * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2;
                const top = aoe.center.y * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2;
                const sizeLabel = aoe.radius
                  ? `${aoe.radius}ft ${aoe.shape}`
                  : aoe.length
                    ? `${aoe.length}ft ${aoe.shape}`
                    : aoe.shape;
                const isHovered = hoveredAoeId === aoe.id;
                return (
                  <div
                    key={`aoe-marker-${aoe.id}`}
                    className="absolute"
                    style={{
                      left,
                      top,
                      transform: "translate(-50%, -50%)",
                      zIndex: 19,
                    }}
                    onMouseEnter={() => setHoveredAoeId(aoe.id)}
                    onMouseLeave={() => setHoveredAoeId(null)}
                  >
                    {/* Pulsing dot marker */}
                    <div
                      className="w-3 h-3 rounded-full border border-white/40"
                      style={{
                        backgroundColor: aoe.color,
                        boxShadow: `0 0 6px ${aoe.color}`,
                        animation: "aoePulse 3s ease-in-out infinite",
                      }}
                    />
                    {/* Tooltip on hover */}
                    {isHovered && (
                      <div
                        className="absolute left-1/2 bottom-full mb-1 -translate-x-1/2 bg-gray-900 border border-gray-600/50 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-200 max-w-xs pointer-events-none"
                        style={{ zIndex: 35 }}
                      >
                        <div className="font-medium" style={{ color: aoe.color }}>
                          {aoe.label}
                        </div>
                        <div className="text-gray-400 mt-0.5">{sizeLabel}</div>
                        {aoe.casterName && (
                          <div className="text-gray-500 mt-0.5">Cast by {aoe.casterName}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* ─── Layer 3: Measurement SVG overlay ─── */}
              {measureLine && (
                <svg
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    zIndex: 25,
                    width: gridWidthPx,
                    height: gridHeightPx,
                  }}
                >
                  <line
                    x1={measureLine.fromPx.x}
                    y1={measureLine.fromPx.y}
                    x2={measureLine.toPx.x}
                    y2={measureLine.toPx.y}
                    stroke="#60A5FA"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    opacity={0.7}
                  />
                  <rect
                    x={measureLine.midPx.x - 16}
                    y={measureLine.midPx.y - 8}
                    width={32}
                    height={16}
                    rx={4}
                    fill="#1E293B"
                    stroke="#3B82F6"
                    strokeWidth={0.5}
                    opacity={0.9}
                  />
                  <text
                    x={measureLine.midPx.x}
                    y={measureLine.midPx.y + 4}
                    textAnchor="middle"
                    fill="#93C5FD"
                    fontSize={9}
                    fontFamily="monospace"
                  >
                    {measureLine.dist}ft
                  </text>
                </svg>
              )}

              {/* ─── Layer 4: Tokens (absolute positioned) ─── */}
              {tokens.map((c) => {
                const isActive = c.id === activeId;
                const isHL = c.id === highlightedCombatantId;
                const isPlayer = c.type === "player";
                const isEnemy = c.type === "enemy";
                const isDead = c.type !== "player" && c.currentHP !== undefined && c.currentHP <= 0;

                const color =
                  c.tokenColor ?? (isPlayer ? "#4a7cf7" : isEnemy ? "#dc3545" : "#3ea864");
                const size = c.span * TILE_SIZE + (c.span - 1) * TILE_GAP - 8;
                const initials =
                  c.name.length <= 2 ? c.name.toUpperCase() : c.name.slice(0, 2).toUpperCase();

                // Position calculation
                const ds = dragStateRef.current;
                const isDragging = ds.active && ds.combatantId === c.id;

                let tokenLeft: number;
                let tokenTop: number;

                if (isDragging && ds.currentPixel && gridContainerRef.current) {
                  // While dragging, follow cursor
                  const rect = gridContainerRef.current.getBoundingClientRect();
                  tokenLeft = (ds.currentPixel.x - rect.left) / zoom - size / 2;
                  tokenTop = (ds.currentPixel.y - rect.top) / zoom - size / 2;
                } else {
                  // Normal position: center token in tile
                  const tileSpanPx = c.span * TILE_SIZE + (c.span - 1) * TILE_GAP;
                  tokenLeft = c.position.x * (TILE_SIZE + TILE_GAP) + tileSpanPx / 2 - size / 2;
                  tokenTop = c.position.y * (TILE_SIZE + TILE_GAP) + tileSpanPx / 2 - size / 2;
                }

                // Check if token is in AoE for ring effect
                const aoeColor = aoeTileSet.get(`${c.position.x},${c.position.y}`);

                // Is this my token?
                const isMyToken = myCombatant && c.id === myCombatant.id;
                const canDrag = isMyTurn && isMyToken;

                // Tooltip position: show above by default, below if near top
                const showTooltipBelow = c.position.y <= 2;
                const isHovered = hoveredTokenId === c.id;

                return (
                  <div
                    key={`tk-${c.id}`}
                    data-combatant={c.id}
                    className="absolute flex items-center justify-center"
                    style={{
                      left: tokenLeft,
                      top: tokenTop,
                      width: size,
                      height: size,
                      zIndex: isDragging ? 28 : isActive ? 22 : 20,
                      transition: isDragging ? "none" : "left 300ms ease-out, top 300ms ease-out",
                      cursor: canDrag ? "grab" : "default",
                    }}
                    onMouseDown={(e) => {
                      if (canDrag) handleDragStart(e, c);
                    }}
                    onTouchStart={(e) => {
                      if (canDrag) handleDragStart(e, c);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTokenClick(c);
                    }}
                    onMouseEnter={() => setHoveredTokenId(c.id)}
                    onMouseLeave={() => setHoveredTokenId(null)}
                  >
                    {/* Circle */}
                    <div
                      className={`rounded-full flex items-center justify-center border-2 font-bold select-none shrink-0 ${
                        isDead ? "opacity-25 grayscale" : ""
                      }`}
                      style={{
                        width: size,
                        height: size,
                        backgroundColor: color,
                        borderColor: `color-mix(in srgb, ${color} 60%, black)`,
                        fontSize: c.span > 1 ? 14 : 11,
                        color: "#fff",
                        textShadow: "0 1px 2px rgba(0,0,0,.5)",
                        boxShadow: isActive
                          ? `0 0 0 2px rgba(251,191,36,.7), 0 0 10px 2px rgba(251,191,36,.3), 0 0 4px ${color}80`
                          : isHL
                            ? `0 0 0 2px rgba(56,189,248,.6), 0 0 8px rgba(56,189,248,.25)`
                            : `0 2px 6px rgba(0,0,0,.5)`,
                        outline: aoeColor ? `2px solid ${aoeColor}` : undefined,
                        outlineOffset: aoeColor ? 1 : undefined,
                      }}
                    >
                      {initials}
                    </div>

                    {/* Hover Tooltip */}
                    {isHovered &&
                      !isDragging &&
                      (() => {
                        const tooltip = getTokenTooltipData(c);
                        const hpPercent =
                          tooltip.maxHP && tooltip.currentHP !== undefined
                            ? Math.max(0, Math.min(100, (tooltip.currentHP / tooltip.maxHP) * 100))
                            : null;
                        const hpBarColor =
                          hpPercent !== null
                            ? hpPercent > 50
                              ? "#22C55E"
                              : hpPercent > 25
                                ? "#EAB308"
                                : "#EF4444"
                            : null;

                        return (
                          <div
                            className="absolute left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-600/50 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[120px] max-w-[220px]"
                            style={{
                              zIndex: 30,
                              ...(showTooltipBelow ? { top: size + 4 } : { bottom: size + 4 }),
                            }}
                          >
                            {/* Name */}
                            <div className="text-gray-100 font-medium mb-1 whitespace-nowrap">
                              {c.name}
                            </div>

                            {/* HP bar */}
                            {hpPercent !== null && (
                              <div className="mb-1">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-gray-400">HP</span>
                                  {/* Show exact numbers for players, hide for enemies */}
                                  {tooltip.isPlayer ? (
                                    <span className="text-gray-200 font-mono">
                                      {tooltip.currentHP}/{tooltip.maxHP}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 font-mono">
                                      {hpPercent > 75
                                        ? "Healthy"
                                        : hpPercent > 50
                                          ? "Wounded"
                                          : hpPercent > 25
                                            ? "Bloodied"
                                            : hpPercent > 0
                                              ? "Critical"
                                              : "Down"}
                                    </span>
                                  )}
                                </div>
                                <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${hpPercent}%`,
                                      backgroundColor: hpBarColor ?? "#666",
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* AC */}
                            {tooltip.ac !== undefined && (
                              <div className="flex items-center gap-1.5 text-gray-400">
                                <span>AC</span>
                                <span className="text-gray-200 font-mono">{tooltip.ac}</span>
                              </div>
                            )}

                            {/* Conditions */}
                            {tooltip.conditionEntries.length > 0 && (
                              <div className="mt-1 pt-1 border-t border-gray-700/50">
                                {tooltip.conditionEntries.map((cond, i) => (
                                  <div key={i} className="text-orange-400 flex items-center gap-1">
                                    <span>{cond.name}</span>
                                    {cond.duration != null && (
                                      <span className="text-orange-600 text-[10px]">
                                        ({cond.duration}
                                        rd)
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Concentration */}
                            {tooltip.concentration && (
                              <div className="mt-1 pt-1 border-t border-gray-700/50 text-purple-400">
                                Concentrating: {tooltip.concentration.spellName}
                              </div>
                            )}

                            {/* Movement remaining */}
                            {tooltip.moveRemaining !== undefined && (
                              <div className="mt-1 pt-1 border-t border-gray-700/50 text-gray-400">
                                Movement:{" "}
                                <span className="text-gray-200 font-mono">
                                  {tooltip.moveRemaining}
                                  ft
                                </span>
                              </div>
                            )}

                            {/* Grid position */}
                            {tooltip.posLabel && (
                              <div className="mt-1 text-gray-500 font-mono">{tooltip.posLabel}</div>
                            )}
                          </div>
                        );
                      })()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
