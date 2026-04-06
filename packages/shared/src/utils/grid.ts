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
 * Compute tiles affected by an AoE shape.
 * All distances in feet; 1 tile = 5ft.
 */
export function computeAoETiles(
  shape: "sphere" | "cone" | "rectangle",
  center: { x: number; y: number },
  opts: {
    size?: number; // radius for sphere (in feet), length for cone (in feet)
    direction?: number; // degrees, 0=north, 90=east — cone only
    from?: { x: number; y: number }; // starting corner — rectangle only
    to?: { x: number; y: number }; // opposite corner — rectangle only
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
          // Chebyshev distance for D&D grid
          if (Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) <= radiusTiles) {
            tiles.push({ x, y });
          }
        }
      }
      break;
    }
    case "cone": {
      const lengthTiles = opts.size ? Math.floor(opts.size / 5) : 0;
      const dir = ((opts.direction ?? 0) * Math.PI) / 180;
      // Direction vector (0deg = north = -y)
      const dx = Math.sin(dir);
      const dy = -Math.cos(dir);
      // D&D cone: width at any point equals distance from origin → half-angle = atan(1) ≈ 45°
      const halfAngle = Math.atan(1);

      for (let ty = center.y - lengthTiles; ty <= center.y + lengthTiles; ty++) {
        for (let tx = center.x - lengthTiles; tx <= center.x + lengthTiles; tx++) {
          if (tx < 0 || tx >= mapWidth || ty < 0 || ty >= mapHeight) continue;
          const vx = tx - center.x;
          const vy = ty - center.y;
          const dist = Math.sqrt(vx * vx + vy * vy);
          if (dist === 0 || dist > lengthTiles) continue;
          const dot = (vx * dx + vy * dy) / dist;
          if (dot >= Math.cos(halfAngle)) {
            tiles.push({ x: tx, y: ty });
          }
        }
      }
      break;
    }
    case "rectangle": {
      if (!opts.from || !opts.to) break;
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
  }
  return tiles;
}
