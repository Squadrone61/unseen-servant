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
  shape: "sphere" | "cone" | "line" | "cube",
  center: { x: number; y: number },
  opts: {
    radius?: number;
    length?: number;
    width?: number;
    direction?: number; // degrees, 0=north, 90=east
  },
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  const radiusTiles = opts.radius ? Math.floor(opts.radius / 5) : 0;

  switch (shape) {
    case "sphere": {
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
    case "cube": {
      const halfW = opts.width ? Math.floor(opts.width / 5 / 2) : radiusTiles;
      for (let y = center.y - halfW; y <= center.y + halfW; y++) {
        for (let x = center.x - halfW; x <= center.x + halfW; x++) {
          if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) continue;
          tiles.push({ x, y });
        }
      }
      break;
    }
    case "cone": {
      const lengthTiles = opts.length ? Math.floor(opts.length / 5) : radiusTiles;
      const dir = ((opts.direction ?? 0) * Math.PI) / 180;
      // Direction vector (0deg = north = -y)
      const dx = Math.sin(dir);
      const dy = -Math.cos(dir);
      const halfAngle = Math.PI / 6; // 53-degree cone ≈ D&D cone

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
    case "line": {
      const lengthTiles = opts.length ? Math.floor(opts.length / 5) : 0;
      const widthTiles = opts.width ? Math.max(1, Math.floor(opts.width / 5)) : 1;
      const dir = ((opts.direction ?? 0) * Math.PI) / 180;
      const dx = Math.sin(dir);
      const dy = -Math.cos(dir);
      // Perpendicular
      const px = -dy;
      const py = dx;
      const halfW = (widthTiles - 1) / 2;

      for (let l = 0; l <= lengthTiles; l++) {
        for (let w = -Math.ceil(halfW); w <= Math.ceil(halfW); w++) {
          const tx = Math.round(center.x + dx * l + px * w);
          const ty = Math.round(center.y + dy * l + py * w);
          if (tx < 0 || tx >= mapWidth || ty < 0 || ty >= mapHeight) continue;
          tiles.push({ x: tx, y: ty });
        }
      }
      break;
    }
  }
  return tiles;
}
