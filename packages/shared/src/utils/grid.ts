/**
 * Format a 0-indexed grid position as human-readable "A1" style coordinates.
 * Column = A-Z (from x), Row = 1-based (from y).
 */
export function formatGridPosition(pos: { x: number; y: number }): string {
  const col = String.fromCharCode(65 + (pos.x % 26));
  const row = pos.y + 1;
  return `${col}${row}`;
}
