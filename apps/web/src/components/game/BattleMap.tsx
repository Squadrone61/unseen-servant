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
} from "@aidnd/shared/types";

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

const CONDITION_ABBR: Record<string, string> = {
  poisoned: "PSN",
  stunned: "STN",
  prone: "PRN",
  unconscious: "UNC",
  blinded: "BLN",
  charmed: "CHR",
  deafened: "DEF",
  frightened: "FRT",
  grappled: "GRP",
  incapacitated: "INC",
  invisible: "INV",
  paralyzed: "PAR",
  petrified: "PTR",
  restrained: "RST",
  exhaustion: "EXH",
  concentrating: "CON",
};

// ─── Helpers ───

function condAbbr(c: string): string {
  return CONDITION_ABBR[c.toLowerCase()] || c.slice(0, 3).toUpperCase();
}

function sizeSpan(s: CreatureSize): number {
  switch (s) {
    case "large": return 2;
    case "huge": return 3;
    case "gargantuan": return 4;
    default: return 1;
  }
}

// ─── BFS reachable tiles ───

function getReachableTiles(
  from: GridPosition,
  budgetFt: number,
  map: BattleMapState,
): Set<string> {
  const reachable = new Set<string>();
  if (budgetFt <= 0) return reachable;

  const best = new Map<string, number>();
  const startKey = `${from.x},${from.y}`;
  best.set(startKey, 0);

  // 0-1 BFS with deque (5ft = 0-cost bucket, 10ft = 1-cost bucket)
  const deque: { x: number; y: number; cost: number }[] = [{ x: from.x, y: from.y, cost: 0 }];
  const dirs = [
    { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
    { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
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

export function BattleMap({
  map,
  combat,
  partyCharacters,
  myCharacterName,
  onMoveToken,
  onEndTurn,
  onCombatantClick,
  highlightedCombatantId,
  style,
  className,
}: BattleMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  // My combatant
  const myCombatant = useMemo(() => {
    if (!myCharacterName) return null;
    const lcName = myCharacterName.toLowerCase();
    return Object.values(combat.combatants).find(
      (c) => c.type === "player" && c.name.toLowerCase() === lcName,
    ) ?? null;
  }, [combat.combatants, myCharacterName]);

  // Is it my turn?
  const activeId = combat.turnOrder[combat.turnIndex];
  const isMyTurn = myCombatant !== null && activeId === myCombatant.id;

  // Reachable tiles
  const reachable = useMemo(() => {
    if (!isMyTurn || !myCombatant?.position) return new Set<string>();
    return getReachableTiles(
      myCombatant.position,
      myCombatant.speed - myCombatant.movementUsed,
      map,
    );
  }, [isMyTurn, myCombatant, map]);

  // Scroll highlighted combatant into view
  useEffect(() => {
    if (!highlightedCombatantId || !gridRef.current) return;
    const el = gridRef.current.querySelector(`[data-combatant="${highlightedCombatantId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [highlightedCombatantId]);

  // Resolve conditions for a combatant
  const getConditions = useCallback(
    (c: Combatant): string[] => {
      if (c.type === "player") {
        const char = Object.values(partyCharacters).find(
          (p) => p.static.name.toLowerCase() === c.name.toLowerCase(),
        );
        return char?.dynamic.conditions ?? c.conditions ?? [];
      }
      return c.conditions ?? [];
    },
    [partyCharacters],
  );

  const handleClick = useCallback(
    (x: number, y: number) => {
      if (reachable.has(`${x},${y}`)) onMoveToken({ x, y });
    },
    [reachable, onMoveToken],
  );

  // Combatants that have map positions
  const tokens = useMemo(
    () =>
      Object.values(combat.combatants)
        .filter((c): c is Combatant & { position: GridPosition } => c.position != null)
        .map((c) => ({ ...c, span: sizeSpan(c.size), conds: getConditions(c) })),
    [combat.combatants, getConditions],
  );

  const movementLeft = myCombatant ? myCombatant.speed - myCombatant.movementUsed : 0;

  // Column labels (A, B, C...)
  const colLabels = useMemo(
    () => Array.from({ length: map.width }, (_, i) => String.fromCharCode(65 + (i % 26))),
    [map.width],
  );

  return (
    <div className={`flex flex-col bg-[#111114] shrink-0 ${className ?? ""}`} style={style}>
      {/* Initiative Tracker (merged) */}
      <InitiativeTracker combat={combat} onCombatantClick={onCombatantClick} />

      {/* Your-turn banner */}
      {isMyTurn && (
        <div className="px-3 py-1.5 bg-amber-950/40 border-b border-amber-800/30 text-amber-300 text-xs font-medium tracking-wide flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Your turn &mdash; click a highlighted tile to move
            <span className="text-amber-500/70 font-mono ml-1">
              {movementLeft}ft remaining
            </span>
          </div>
        </div>
      )}

      {/* Scrollable map area */}
      <div className="flex-1 min-h-0 overflow-auto p-2 relative">
        {/* Zoom Controls */}
        <div className="absolute top-2 right-2 z-10 bg-gray-800/80 rounded flex gap-1 p-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="w-6 h-6 flex items-center justify-center text-xs text-gray-400 hover:text-gray-200 rounded hover:bg-gray-700 transition-colors"
            title="Zoom out"
          >
            -
          </button>
          <button
            onClick={() => setZoom(1)}
            className="px-1.5 h-6 flex items-center justify-center text-[10px] text-gray-400 hover:text-gray-200 rounded hover:bg-gray-700 transition-colors font-mono"
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
            className="w-6 h-6 flex items-center justify-center text-xs text-gray-400 hover:text-gray-200 rounded hover:bg-gray-700 transition-colors"
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
                className="text-[9px] text-gray-600 flex items-center justify-center select-none"
                style={{ width: TILE_SIZE + (i < map.width - 1 ? TILE_GAP : 0), height: LABEL_SIZE }}
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
                  className="text-[9px] text-gray-600 flex items-center justify-center select-none"
                  style={{ height: TILE_SIZE + (i < map.height - 1 ? TILE_GAP : 0), width: LABEL_SIZE }}
                >
                  {i + 1}
                </div>
              ))}
            </div>

            {/* The grid itself */}
            <div
              ref={gridRef}
              className="relative rounded-sm overflow-hidden"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${map.width}, ${TILE_SIZE}px)`,
                gridTemplateRows: `repeat(${map.height}, ${TILE_SIZE}px)`,
                gap: TILE_GAP,
                backgroundColor: "#1c1c20",
              }}
            >
              {/* ─── Layer 1: Tiles ─── */}
              {map.tiles.map((row, y) =>
                row.map((tile, x) => {
                  const key = `${x},${y}`;
                  const isReach = reachable.has(key);
                  const isHover = hovered === key && isReach;
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
                      }}
                      onClick={() => handleClick(x, y)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleClick(x, y); }}
                      onMouseEnter={() => { if (isReach) setHovered(key); }}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {/* Terrain textures */}
                      {tile.type === "difficult_terrain" && (
                        <div className="absolute inset-0 opacity-20 pointer-events-none"
                          style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent 0 3px, rgba(180,140,60,.3) 3px 4px)" }} />
                      )}
                      {tile.type === "water" && (
                        <div className="absolute inset-0 opacity-20 pointer-events-none"
                          style={{ backgroundImage: "repeating-linear-gradient(160deg, transparent 0 5px, rgba(60,140,200,.25) 5px 6px)" }} />
                      )}
                      {tile.type === "stairs" && (
                        <div className="absolute inset-0 opacity-25 pointer-events-none"
                          style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 6px, rgba(200,200,220,.12) 6px 7px)" }} />
                      )}
                      {tile.type === "door" && (
                        <div className="absolute inset-[28%] rounded-sm border border-amber-800/40 bg-amber-900/15 pointer-events-none" />
                      )}
                      {/* Movement range overlay */}
                      {isReach && (
                        <div className={`absolute inset-0 pointer-events-none transition-colors duration-75 ${
                          isHover
                            ? "bg-emerald-400/25 ring-1 ring-inset ring-emerald-400/40"
                            : "bg-emerald-500/10 ring-1 ring-inset ring-emerald-600/20"
                        }`} />
                      )}
                    </div>
                  );
                }),
              )}

              {/* ─── Layer 2: Tokens ─── */}
              {tokens.map((c) => {
                const isActive = c.id === activeId;
                const isHL = c.id === highlightedCombatantId;
                const isPlayer = c.type === "player";
                const isEnemy = c.type === "enemy";
                const isDead = c.type !== "player" && c.currentHP !== undefined && c.currentHP <= 0;

                const color = c.tokenColor ?? (isPlayer ? "#4a7cf7" : isEnemy ? "#dc3545" : "#3ea864");
                const size = c.span * TILE_SIZE + (c.span - 1) * TILE_GAP - 8;
                const initials = c.name.length <= 2 ? c.name.toUpperCase() : c.name.slice(0, 2).toUpperCase();

                return (
                  <div
                    key={`tk-${c.id}`}
                    data-combatant={c.id}
                    className="flex flex-col items-center justify-center pointer-events-none"
                    style={{
                      gridRow: `${c.position.y + 1} / span ${c.span}`,
                      gridColumn: `${c.position.x + 1} / span ${c.span}`,
                      zIndex: isActive ? 22 : 20,
                    }}
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
                      }}
                    >
                      {initials}
                    </div>

                    {/* Name label */}
                    <div
                      className="text-[7px] text-gray-400 truncate text-center leading-tight mt-px pointer-events-none"
                      style={{ maxWidth: TILE_SIZE }}
                    >
                      {c.name}
                    </div>

                    {/* Conditions */}
                    {c.conds.length > 0 && !isDead && (
                      <div className="flex gap-px flex-wrap justify-center max-w-full">
                        {c.conds.slice(0, 2).map((cond) => (
                          <span
                            key={cond}
                            className="text-[6.5px] leading-none px-0.5 py-px rounded-sm bg-orange-900/80 text-orange-300 font-mono font-bold"
                            title={cond}
                          >
                            {condAbbr(cond)}
                          </span>
                        ))}
                        {c.conds.length > 2 && (
                          <span
                            className="text-[6.5px] leading-none px-0.5 py-px rounded-sm bg-gray-700/80 text-gray-400 font-mono"
                            title={c.conds.join(", ")}
                          >
                            +{c.conds.length - 2}
                          </span>
                        )}
                      </div>
                    )}
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
