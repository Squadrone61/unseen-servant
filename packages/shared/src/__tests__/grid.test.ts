import { describe, it, expect } from "vitest";
import {
  formatGridPosition,
  parseGridPosition,
  gridDistance,
  computeAoETiles,
} from "../utils/grid.js";

// ---------------------------------------------------------------------------
// formatGridPosition
// ---------------------------------------------------------------------------
describe("formatGridPosition", () => {
  it("formats origin as A1", () => {
    expect(formatGridPosition({ x: 0, y: 0 })).toBe("A1");
  });

  it("formats x=25 as Z column", () => {
    expect(formatGridPosition({ x: 25, y: 0 })).toBe("Z1");
  });

  it("formats y=9 as row 10", () => {
    expect(formatGridPosition({ x: 0, y: 9 })).toBe("A10");
  });

  it("formats {x:4, y:7} as E8", () => {
    expect(formatGridPosition({ x: 4, y: 7 })).toBe("E8");
  });
});

// ---------------------------------------------------------------------------
// parseGridPosition
// ---------------------------------------------------------------------------
describe("parseGridPosition", () => {
  it("parses A1 as {x:0, y:0}", () => {
    expect(parseGridPosition("A1")).toEqual({ x: 0, y: 0 });
  });

  it("parses E8 as {x:4, y:7}", () => {
    expect(parseGridPosition("E8")).toEqual({ x: 4, y: 7 });
  });

  it("parses Z1 as {x:25, y:0}", () => {
    expect(parseGridPosition("Z1")).toEqual({ x: 25, y: 0 });
  });

  it("parses lowercase a1 as {x:0, y:0}", () => {
    expect(parseGridPosition("a1")).toEqual({ x: 0, y: 0 });
  });

  it("parses coordinate with surrounding whitespace", () => {
    expect(parseGridPosition(" A1 ")).toEqual({ x: 0, y: 0 });
  });

  it("returns null for empty string", () => {
    expect(parseGridPosition("")).toBeNull();
  });

  it("returns null for multi-letter column (AA1)", () => {
    expect(parseGridPosition("AA1")).toBeNull();
  });

  it("returns null for row 0 (A0)", () => {
    expect(parseGridPosition("A0")).toBeNull();
  });

  it("returns null for column-only input (A)", () => {
    expect(parseGridPosition("A")).toBeNull();
  });

  it("returns null for row-only input (1)", () => {
    expect(parseGridPosition("1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------
describe("formatGridPosition / parseGridPosition round-trip", () => {
  it("format(parse('E8')) === 'E8'", () => {
    const parsed = parseGridPosition("E8");
    expect(parsed).not.toBeNull();
    expect(formatGridPosition(parsed!)).toBe("E8");
  });

  it("parse(format({x:4, y:7})) deep equals {x:4, y:7}", () => {
    const formatted = formatGridPosition({ x: 4, y: 7 });
    expect(parseGridPosition(formatted)).toEqual({ x: 4, y: 7 });
  });
});

// ---------------------------------------------------------------------------
// gridDistance
// ---------------------------------------------------------------------------
describe("gridDistance", () => {
  it("returns 0 for same position", () => {
    expect(gridDistance({ x: 3, y: 3 }, { x: 3, y: 3 })).toBe(0);
  });

  it("returns 5 for 1-tile horizontal move", () => {
    expect(gridDistance({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(5);
  });

  it("uses Chebyshev: max(3,4)=4 tiles = 20ft for {0,0}→{3,4}", () => {
    expect(gridDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(20);
  });

  it("returns 30 for 6-tile vertical move", () => {
    expect(gridDistance({ x: 0, y: 0 }, { x: 0, y: 6 })).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// computeAoETiles — sphere
// ---------------------------------------------------------------------------
describe("computeAoETiles (sphere)", () => {
  const mapW = 10;
  const mapH = 10;
  const center = { x: 5, y: 5 };

  it("size:5 (1-tile radius) yields 9 tiles (3x3 block)", () => {
    const tiles = computeAoETiles("sphere", center, { size: 5 }, mapW, mapH);
    expect(tiles).toHaveLength(9);
  });

  it("size:10 (2-tile radius) yields 25 tiles (5x5 block)", () => {
    const tiles = computeAoETiles("sphere", center, { size: 10 }, mapW, mapH);
    expect(tiles).toHaveLength(25);
  });

  it("size:20 (4-tile radius) yields 81 tiles (9x9 block)", () => {
    const tiles = computeAoETiles("sphere", center, { size: 20 }, mapW, mapH);
    expect(tiles).toHaveLength(81);
  });

  it("clips to map bounds at edge position", () => {
    // size:10 (2-tile radius) centered at {0,0} on 10x10 — tiles outside bounds are dropped
    const tiles = computeAoETiles("sphere", { x: 0, y: 0 }, { size: 10 }, mapW, mapH);
    // Full 5x5 would be 25 but top-left corner clips to 3x3 = 9 tiles (x:0..2, y:0..2)
    expect(tiles).toHaveLength(9);
  });

  it("undefined size yields only center tile (radiusTiles=0)", () => {
    const tiles = computeAoETiles("sphere", center, {}, mapW, mapH);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toEqual(center);
  });
});

// ---------------------------------------------------------------------------
// computeAoETiles — cone
// ---------------------------------------------------------------------------
describe("computeAoETiles (cone)", () => {
  const mapW = 10;
  const mapH = 10;
  const center = { x: 5, y: 5 };

  it("undefined size yields 0 tiles (dist===0 check skips center)", () => {
    const tiles = computeAoETiles("cone", center, {}, mapW, mapH);
    expect(tiles).toHaveLength(0);
  });

  it("size:15 direction:0 (north) yields non-empty tile set north of center", () => {
    const tiles = computeAoETiles("cone", center, { size: 15, direction: 0 }, mapW, mapH);
    expect(tiles.length).toBeGreaterThan(0);
    // All tiles should be north of or at the same y as center (y <= center.y)
    // and must not include the center itself
    for (const tile of tiles) {
      expect(tile.y).toBeLessThanOrEqual(center.y);
    }
    expect(tiles.find((t) => t.x === center.x && t.y === center.y)).toBeUndefined();
  });

  it("size:15 direction:90 (east) yields tiles east of center", () => {
    const tiles = computeAoETiles("cone", center, { size: 15, direction: 90 }, mapW, mapH);
    expect(tiles.length).toBeGreaterThan(0);
    // All tiles should be east of or at the same x as center (x >= center.x)
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(center.x);
    }
    expect(tiles.find((t) => t.x === center.x && t.y === center.y)).toBeUndefined();
  });

  it("all tiles are within cone length of origin corner (corner-origin geometry)", () => {
    const size = 15;
    const lengthTiles = size / 5; // 3
    const tiles = computeAoETiles("cone", center, { size, direction: 0 }, mapW, mapH);
    // Corner origin may sit on any caster-tile corner (worst-case diagonal = L*sqrt(2)).
    const maxDistFromCenter = lengthTiles * Math.SQRT2 + 1; // +1 tile slack for tile centers
    for (const tile of tiles) {
      const dist = Math.sqrt(
        Math.pow(tile.x + 0.5 - (center.x + 0.5), 2) + Math.pow(tile.y + 0.5 - (center.y + 0.5), 2),
      );
      expect(dist).toBeLessThanOrEqual(maxDistFromCenter);
    }
  });

  it("cone 15ft (3 tiles) east produces roughly 6 affected tiles (D&D template rule)", () => {
    const tiles = computeAoETiles("cone", center, { size: 15, direction: 90 }, mapW, mapH);
    // D&D 15ft cone: 1+2+3 = 6 cardinal tiles
    expect(tiles.length).toBeGreaterThanOrEqual(3);
    expect(tiles.length).toBeLessThanOrEqual(9);
  });

  it("cone with arbitrary direction (37°) does not crash and returns non-empty tiles", () => {
    const tiles = computeAoETiles("cone", center, { size: 30, direction: 37 }, mapW, mapH);
    expect(tiles.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// computeAoETiles — rectangle
// ---------------------------------------------------------------------------
describe("computeAoETiles (rectangle)", () => {
  const mapW = 10;
  const mapH = 10;
  const center = { x: 0, y: 0 }; // rectangle ignores center

  it("3x3 from:{x:2,y:2} to:{x:4,y:4} yields 9 tiles", () => {
    const tiles = computeAoETiles(
      "rectangle",
      center,
      { from: { x: 2, y: 2 }, to: { x: 4, y: 4 } },
      mapW,
      mapH,
    );
    expect(tiles).toHaveLength(9);
  });

  it("single row from:{x:0,y:0} to:{x:9,y:0} yields 10 tiles", () => {
    const tiles = computeAoETiles(
      "rectangle",
      center,
      { from: { x: 0, y: 0 }, to: { x: 9, y: 0 } },
      mapW,
      mapH,
    );
    expect(tiles).toHaveLength(10);
  });

  it("single-point from:{x:5,y:5} to:{x:5,y:5} yields 1 tile", () => {
    const tiles = computeAoETiles(
      "rectangle",
      center,
      { from: { x: 5, y: 5 }, to: { x: 5, y: 5 } },
      mapW,
      mapH,
    );
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toEqual({ x: 5, y: 5 });
  });

  it("order doesn't matter: from:{x:4,y:4} to:{x:2,y:2} same as forward order", () => {
    const forward = computeAoETiles(
      "rectangle",
      center,
      { from: { x: 2, y: 2 }, to: { x: 4, y: 4 } },
      mapW,
      mapH,
    );
    const reversed = computeAoETiles(
      "rectangle",
      center,
      { from: { x: 4, y: 4 }, to: { x: 2, y: 2 } },
      mapW,
      mapH,
    );
    expect(reversed).toHaveLength(forward.length);
    // Both should contain the same tiles (order may differ)
    const toKey = (t: { x: number; y: number }) => `${t.x},${t.y}`;
    expect(new Set(reversed.map(toKey))).toEqual(new Set(forward.map(toKey)));
  });

  it("missing from/to yields 0 tiles", () => {
    const tiles = computeAoETiles("rectangle", center, {}, mapW, mapH);
    expect(tiles).toHaveLength(0);
  });

  it("clips when rect extends past map bounds", () => {
    // from:{x:8,y:8} to:{x:11,y:11} on 10x10 — x and y are capped at 9
    const tiles = computeAoETiles(
      "rectangle",
      center,
      { from: { x: 8, y: 8 }, to: { x: 11, y: 11 } },
      mapW,
      mapH,
    );
    // Only x:8,9 and y:8,9 are in bounds → 2x2 = 4 tiles
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(mapW);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeLessThan(mapH);
    }
  });
});
