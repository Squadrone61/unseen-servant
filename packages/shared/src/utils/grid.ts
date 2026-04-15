/**
 * Format a 0-indexed grid position as human-readable "A1" style coordinates.
 * Column = A-Z (from x), Row = 1-based (from y).
 */
export function formatGridPosition(pos: { x: number; y: number }): string {
  const col = String.fromCharCode(65 + (pos.x % 26));
  const row = pos.y + 1;
  return `${col}${row}`;
}

/**
 * Parse an "A1" style coordinate string back to 0-indexed {x, y}.
 * Returns null if the string is not a valid grid coordinate.
 */
export function parseGridPosition(coord: string): { x: number; y: number } | null {
  const match = coord.trim().match(/^([A-Za-z])(\d{1,2})$/);
  if (!match) return null;
  const x = match[1].toUpperCase().charCodeAt(0) - 65;
  const y = parseInt(match[2], 10) - 1;
  if (x < 0 || x > 25 || y < 0) return null;
  return { x, y };
}

/**
 * Compute Chebyshev distance between two grid positions in feet (1 tile = 5ft).
 */
export function gridDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 5;
}

/**
 * Whether a tile blocks movement. Walls and pits are always blocking; any tile
 * carrying a non-destroyed object with full cover also blocks (a creature can't
 * walk through a closed armoire). Half / three-quarters cover remain walkable.
 */
export function isTileBlocking(tile: {
  type?: string;
  object?: { destructible?: boolean; hp?: number } | undefined;
  cover?: string;
}): boolean {
  if (tile.type === "wall" || tile.type === "pit") return true;
  if (tile.object && tile.cover === "full") {
    // A destroyed destructible object (hp === 0) no longer blocks
    if (tile.object.destructible && tile.object.hp === 0) return false;
    return true;
  }
  return false;
}

// ─── AoE geometry ───────────────────────────────────────────────────────────
//
// All math in "tile units" (1 unit = 5ft). Tile (x,y) occupies [x, x+1] × [y, y+1];
// its center is (x+0.5, y+0.5). Shapes are built once from high-level inputs and
// then queried with `shapeContainsPoint` for hit-testing and `tilesInShape` for
// enumerating affected cells.

export type Pt = { x: number; y: number };

export type AoEShape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "triangle"; a: Pt; b: Pt; c: Pt }
  | { kind: "obox"; cx: number; cy: number; length: number; width: number; dir: number };

/** Direction unit vector (0° = north, 90° = east, clockwise). */
export function dirVector(deg: number): { dx: number; dy: number } {
  const r = (deg * Math.PI) / 180;
  return { dx: Math.sin(r), dy: -Math.cos(r) };
}

function sideOfEdge(a: Pt, b: Pt, p: Pt): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

export function pointInTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const d1 = sideOfEdge(a, b, p);
  const d2 = sideOfEdge(b, c, p);
  const d3 = sideOfEdge(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** True if point p lies inside/on the shape. */
export function shapeContainsPoint(shape: AoEShape, p: Pt): boolean {
  switch (shape.kind) {
    case "circle": {
      const dx = p.x - shape.cx;
      const dy = p.y - shape.cy;
      return dx * dx + dy * dy <= shape.r * shape.r + 1e-9;
    }
    case "triangle":
      return pointInTriangle(p, shape.a, shape.b, shape.c);
    case "obox": {
      const { dx, dy } = dirVector(shape.dir);
      // axis-along = (dx, dy); axis-across = (-dy, dx)
      const ox = p.x - shape.cx;
      const oy = p.y - shape.cy;
      const along = ox * dx + oy * dy;
      const across = ox * -dy + oy * dx;
      const eps = 1e-9;
      return (
        along >= -shape.length / 2 - eps &&
        along <= shape.length / 2 + eps &&
        across >= -shape.width / 2 - eps &&
        across <= shape.width / 2 + eps
      );
    }
  }
}

/** Axis-aligned bounding box of the shape in world (tile) coords. */
function shapeBounds(shape: AoEShape): { minX: number; maxX: number; minY: number; maxY: number } {
  switch (shape.kind) {
    case "circle":
      return {
        minX: shape.cx - shape.r,
        maxX: shape.cx + shape.r,
        minY: shape.cy - shape.r,
        maxY: shape.cy + shape.r,
      };
    case "triangle": {
      const xs = [shape.a.x, shape.b.x, shape.c.x];
      const ys = [shape.a.y, shape.b.y, shape.c.y];
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      };
    }
    case "obox": {
      const { dx, dy } = dirVector(shape.dir);
      const hl = shape.length / 2;
      const hw = shape.width / 2;
      const corners: Pt[] = [
        { x: shape.cx + dx * hl + -dy * hw, y: shape.cy + dy * hl + dx * hw },
        { x: shape.cx + dx * hl - -dy * hw, y: shape.cy + dy * hl - dx * hw },
        { x: shape.cx - dx * hl + -dy * hw, y: shape.cy - dy * hl + dx * hw },
        { x: shape.cx - dx * hl - -dy * hw, y: shape.cy - dy * hl - dx * hw },
      ];
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      };
    }
  }
}

/**
 * Enumerate all map tiles whose center lies inside the shape.
 * "Whatever the shape touches (at tile centers) is affected."
 */
export function tilesInShape(
  shape: AoEShape,
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number }[] {
  const b = shapeBounds(shape);
  const minX = Math.max(0, Math.floor(b.minX));
  const maxX = Math.min(mapWidth - 1, Math.ceil(b.maxX));
  const minY = Math.max(0, Math.floor(b.minY));
  const maxY = Math.min(mapHeight - 1, Math.ceil(b.maxY));
  const out: { x: number; y: number }[] = [];
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (shapeContainsPoint(shape, { x: tx + 0.5, y: ty + 0.5 })) {
        out.push({ x: tx, y: ty });
      }
    }
  }
  return out;
}

// ─── Shape builders ─────────────────────────────────────────────────────────

export interface SphereInput {
  kind: "sphere";
  centerTile: { x: number; y: number };
  sizeFt: number;
}
export interface ConeInput {
  kind: "cone";
  casterTile: { x: number; y: number };
  directionDeg: number;
  sizeFt: number;
}
export interface OBoxInput {
  kind: "obox";
  anchorTile: { x: number; y: number };
  directionDeg: number;
  lengthFt: number;
  widthFt: number;
}
export type AoEShapeInput = SphereInput | ConeInput | OBoxInput;

/** Build an AoEShape (world coords in tile units) from high-level input. */
export function buildAoEShape(input: AoEShapeInput): AoEShape {
  if (input.kind === "sphere") {
    return {
      kind: "circle",
      cx: input.centerTile.x + 0.5,
      cy: input.centerTile.y + 0.5,
      r: input.sizeFt / 5,
    };
  }
  if (input.kind === "cone") {
    const { dx, dy } = dirVector(input.directionDeg);
    const casterCx = input.casterTile.x + 0.5;
    const casterCy = input.casterTile.y + 0.5;
    // Apex on the caster-tile edge in the aim direction.
    const apex = { x: casterCx + dx * 0.5, y: casterCy + dy * 0.5 };
    const lengthTiles = input.sizeFt / 5;
    // D&D half-angle: width at distance d = d → half = d/2 → tan(half-angle) = 0.5.
    const halfTan = 0.5;
    const tip = { x: apex.x + dx * lengthTiles, y: apex.y + dy * lengthTiles };
    const px = -dy;
    const py = dx;
    const left = {
      x: tip.x - px * lengthTiles * halfTan,
      y: tip.y - py * lengthTiles * halfTan,
    };
    const right = {
      x: tip.x + px * lengthTiles * halfTan,
      y: tip.y + py * lengthTiles * halfTan,
    };
    return { kind: "triangle", a: apex, b: left, c: right };
  }
  // obox
  const { dx, dy } = dirVector(input.directionDeg);
  const anchorCx = input.anchorTile.x + 0.5;
  const anchorCy = input.anchorTile.y + 0.5;
  const lengthTiles = input.lengthFt / 5;
  const widthTiles = input.widthFt / 5;
  // Anchor sits at the short back edge of the rectangle; center is length/2 along dir.
  const cx = anchorCx + (dx * lengthTiles) / 2;
  const cy = anchorCy + (dy * lengthTiles) / 2;
  return {
    kind: "obox",
    cx,
    cy,
    length: lengthTiles,
    width: widthTiles,
    dir: input.directionDeg,
  };
}

// ─── Back-compat wrapper ───────────────────────────────────────────────────
//
// `computeAoETiles` preserves the legacy signature used by the MCP bridge
// (`apply_area_effect`, `show_aoe`, `move_aoe`) and older tests. Internally it
// builds the new AoEShape and queries `tilesInShape`.

export function computeAoETiles(
  shape: "sphere" | "cone" | "rectangle",
  center: { x: number; y: number },
  opts: {
    size?: number;
    direction?: number;
    from?: { x: number; y: number };
    to?: { x: number; y: number };
    length?: number;
    width?: number;
    cornerOrigin?: boolean;
  },
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number }[] {
  if (shape === "sphere") {
    if (!opts.size) return [{ x: center.x, y: center.y }];
    const r = opts.size / 5;
    const s: AoEShape = opts.cornerOrigin
      ? { kind: "circle", cx: center.x, cy: center.y, r }
      : buildAoEShape({ kind: "sphere", centerTile: center, sizeFt: opts.size });
    return tilesInShape(s, mapWidth, mapHeight);
  }
  if (shape === "cone") {
    if (!opts.size) return [];
    const s = buildAoEShape({
      kind: "cone",
      casterTile: center,
      directionDeg: opts.direction ?? 0,
      sizeFt: opts.size,
    });
    return tilesInShape(s, mapWidth, mapHeight);
  }
  // rectangle
  if (opts.length && opts.length > 0) {
    const lengthTiles = opts.length / 5;
    const widthTiles = (opts.width ?? 5) / 5;
    const s: AoEShape = opts.cornerOrigin
      ? {
          kind: "obox",
          cx: center.x,
          cy: center.y,
          length: lengthTiles,
          width: widthTiles,
          dir: opts.direction ?? 0,
        }
      : buildAoEShape({
          kind: "obox",
          anchorTile: center,
          directionDeg: opts.direction ?? 0,
          lengthFt: opts.length,
          widthFt: opts.width ?? 5,
        });
    return tilesInShape(s, mapWidth, mapHeight);
  }
  if (opts.from && opts.to) {
    const minX = Math.max(0, Math.min(opts.from.x, opts.to.x));
    const maxX = Math.min(mapWidth - 1, Math.max(opts.from.x, opts.to.x));
    const minY = Math.max(0, Math.min(opts.from.y, opts.to.y));
    const maxY = Math.min(mapHeight - 1, Math.max(opts.from.y, opts.to.y));
    const out: { x: number; y: number }[] = [];
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        out.push({ x: tx, y: ty });
      }
    }
    return out;
  }
  return [];
}
