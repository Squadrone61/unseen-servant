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

// ─── AoE geometry helpers ───────────────────────────────────────────────

/**
 * Direction vector from cone/rect direction in degrees (0 = north, 90 = east, clockwise).
 */
function dirVector(deg: number): { dx: number; dy: number } {
  const r = (deg * Math.PI) / 180;
  return { dx: Math.sin(r), dy: -Math.cos(r) };
}

/**
 * Signed-cross-product test: is point p on the same side (or on) edge (a→b)?
 */
function sideOfEdge(
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number },
): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

/** Point-in-triangle via sign consistency of the three edge cross-products. */
function pointInTriangle(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): boolean {
  const d1 = sideOfEdge(a, b, p);
  const d2 = sideOfEdge(b, c, p);
  const d3 = sideOfEdge(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Point-in-convex-polygon (vertices in CW or CCW order). */
function pointInConvexPoly(p: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = sideOfEdge(a, b, p);
    if (d !== 0) {
      if (sign === 0) sign = d > 0 ? 1 : -1;
      else if ((sign > 0 && d < 0) || (sign < 0 && d > 0)) return false;
    }
  }
  return true;
}

/**
 * Estimate the fraction of tile (tx, ty) area covered by `test(point)`.
 * Uses a 5×5 sub-sampling grid — 25 samples per tile, good enough for the D&D 50% rule.
 */
const SUB_N = 5;
function tileCoverageFraction(
  tx: number,
  ty: number,
  test: (p: { x: number; y: number }) => boolean,
): number {
  let hits = 0;
  const total = SUB_N * SUB_N;
  for (let j = 0; j < SUB_N; j++) {
    for (let i = 0; i < SUB_N; i++) {
      const px = tx + (i + 0.5) / SUB_N;
      const py = ty + (j + 0.5) / SUB_N;
      if (test({ x: px, y: py })) hits++;
    }
  }
  return hits / total;
}

/**
 * Pick the corner of the caster tile that best projects along the aim direction.
 * Returns world-coord corner position.
 */
function pickConeOriginCorner(
  center: { x: number; y: number },
  direction: number,
): { x: number; y: number } {
  const { dx, dy } = dirVector(direction);
  const corners = [
    { x: center.x, y: center.y }, // NW
    { x: center.x + 1, y: center.y }, // NE
    { x: center.x + 1, y: center.y + 1 }, // SE
    { x: center.x, y: center.y + 1 }, // SW
  ];
  const cx = center.x + 0.5;
  const cy = center.y + 0.5;
  let best = corners[0];
  let bestDot = -Infinity;
  for (const c of corners) {
    const ox = c.x - cx;
    const oy = c.y - cy;
    const d = ox * dx + oy * dy;
    if (d > bestDot) {
      bestDot = d;
      best = c;
    }
  }
  return best;
}

/**
 * Compute tiles affected by an AoE shape.
 * All distances in feet; 1 tile = 5ft.
 *
 * Cone: corner-origin + atan(0.5) half-angle (D&D "width = distance" rule).
 * Accepts arbitrary `direction` in degrees (no snapping). Tile included if ≥50% of its area
 * falls inside the triangle.
 *
 * Rectangle: if `from`/`to` given → axis-aligned (back-compat). Otherwise if `direction`+`length`
 * (+optional `width`) given → rotated rectangle anchored at `center` corner nearest the direction,
 * with same 50%-coverage rule.
 */
export function computeAoETiles(
  shape: "sphere" | "cone" | "rectangle",
  center: { x: number; y: number },
  opts: {
    size?: number; // radius for sphere (ft), length for cone (ft)
    direction?: number; // degrees, 0=north, 90=east
    from?: { x: number; y: number }; // axis-aligned rectangle corner A
    to?: { x: number; y: number }; // axis-aligned rectangle corner B
    length?: number; // rotated rectangle length (ft, along direction)
    width?: number; // rotated rectangle width (ft, perpendicular)
  },
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];

  switch (shape) {
    case "sphere": {
      const radiusTiles = opts.size ? Math.floor(opts.size / 5) : 0;
      for (let y = center.y - radiusTiles; y <= center.y + radiusTiles; y++) {
        for (let x = center.x - radiusTiles; x <= center.x + radiusTiles; x++) {
          if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) continue;
          if (Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) <= radiusTiles) {
            tiles.push({ x, y });
          }
        }
      }
      break;
    }
    case "cone": {
      const lengthTiles = opts.size ? opts.size / 5 : 0;
      if (lengthTiles <= 0) break;
      const direction = opts.direction ?? 0;
      const { dx, dy } = dirVector(direction);
      const origin = pickConeOriginCorner(center, direction);
      const halfTan = 0.5; // tan(atan(0.5)) — D&D cone half-angle: width at distance d = d
      // Perpendicular to direction (right-hand).
      const px = -dy;
      const py = dx;
      const tip = { x: origin.x + dx * lengthTiles, y: origin.y + dy * lengthTiles };
      const leftBase = {
        x: tip.x - px * lengthTiles * halfTan,
        y: tip.y - py * lengthTiles * halfTan,
      };
      const rightBase = {
        x: tip.x + px * lengthTiles * halfTan,
        y: tip.y + py * lengthTiles * halfTan,
      };
      const inTri = (p: { x: number; y: number }) =>
        pointInTriangle(p, origin, leftBase, rightBase);

      // Bounding box around the triangle for iteration.
      const minX = Math.max(0, Math.floor(Math.min(origin.x, leftBase.x, rightBase.x)));
      const maxX = Math.min(mapWidth - 1, Math.ceil(Math.max(origin.x, leftBase.x, rightBase.x)));
      const minY = Math.max(0, Math.floor(Math.min(origin.y, leftBase.y, rightBase.y)));
      const maxY = Math.min(mapHeight - 1, Math.ceil(Math.max(origin.y, leftBase.y, rightBase.y)));

      for (let ty = minY; ty <= maxY; ty++) {
        for (let tx = minX; tx <= maxX; tx++) {
          if (tileCoverageFraction(tx, ty, inTri) >= 0.5) {
            tiles.push({ x: tx, y: ty });
          }
        }
      }
      break;
    }
    case "rectangle": {
      // Axis-aligned path (back-compat).
      if (opts.from && opts.to) {
        const minX = Math.min(opts.from.x, opts.to.x);
        const maxX = Math.max(opts.from.x, opts.to.x);
        const minY = Math.min(opts.from.y, opts.to.y);
        const maxY = Math.max(opts.from.y, opts.to.y);
        for (let ty = minY; ty <= maxY; ty++) {
          for (let tx = minX; tx <= maxX; tx++) {
            if (tx >= 0 && tx < mapWidth && ty >= 0 && ty < mapHeight) {
              tiles.push({ x: tx, y: ty });
            }
          }
        }
        break;
      }
      // Rotated rectangle: anchor corner at `center` corner nearest direction, extending
      // `length` along direction and `width` across (centered on the axis).
      const length = opts.length ? opts.length / 5 : 0;
      const width = opts.width ? opts.width / 5 : 1;
      if (length <= 0) break;
      const direction = opts.direction ?? 0;
      const { dx, dy } = dirVector(direction);
      const origin = pickConeOriginCorner(center, direction);
      const px = -dy;
      const py = dx;
      const halfW = width / 2;
      const p0 = { x: origin.x - px * halfW, y: origin.y - py * halfW };
      const p1 = { x: origin.x + px * halfW, y: origin.y + py * halfW };
      const p2 = { x: p1.x + dx * length, y: p1.y + dy * length };
      const p3 = { x: p0.x + dx * length, y: p0.y + dy * length };
      const poly = [p0, p1, p2, p3];
      const inPoly = (p: { x: number; y: number }) => pointInConvexPoly(p, poly);

      const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x, p3.x)));
      const maxX = Math.min(mapWidth - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x, p3.x)));
      const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y, p3.y)));
      const maxY = Math.min(mapHeight - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y, p3.y)));

      for (let ty = minY; ty <= maxY; ty++) {
        for (let tx = minX; tx <= maxX; tx++) {
          if (tileCoverageFraction(tx, ty, inPoly) >= 0.5) {
            tiles.push({ x: tx, y: ty });
          }
        }
      }
      break;
    }
  }
  return tiles;
}
