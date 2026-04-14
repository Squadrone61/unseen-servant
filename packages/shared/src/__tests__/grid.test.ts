import { describe, it, expect } from "vitest";
import {
  formatGridPosition,
  parseGridPosition,
  gridDistance,
  computeAoETiles,
  buildAoEShape,
  shapeContainsPoint,
  tilesInShape,
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
describe("computeAoETiles (sphere — true circle)", () => {
  const mapW = 20;
  const mapH = 20;
  const center = { x: 10, y: 10 };

  it("size:5 (r=1 tile) yields 5 tiles (plus shape)", () => {
    // Circle r=1 at (10.5,10.5) contains centers at dist ≤ 1:
    // (10,10), (9,10), (11,10), (10,9), (10,11)
    const tiles = computeAoETiles("sphere", center, { size: 5 }, mapW, mapH);
    expect(tiles).toHaveLength(5);
  });

  it("size:10 (r=2 tiles) includes orthogonals and excludes far diagonals", () => {
    const tiles = computeAoETiles("sphere", center, { size: 10 }, mapW, mapH);
    const has = (x: number, y: number) => tiles.some((t) => t.x === x && t.y === y);
    expect(has(10, 10)).toBe(true);
    expect(has(12, 10)).toBe(true); // dist √(1.5²+0.5²)? no: tile (12,10) center (12.5,10.5), dist=2 → in.
    expect(has(11, 11)).toBe(true); // (11.5,11.5) dist √2 ≈1.41 → in
    expect(has(12, 12)).toBe(false); // (12.5,12.5) dist √8 ≈2.83 → out
  });

  it("clips to map bounds at edge position", () => {
    const tiles = computeAoETiles("sphere", { x: 0, y: 0 }, { size: 10 }, mapW, mapH);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("undefined size yields only center tile (fallback)", () => {
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

  it("missing from/to/length yields 0 tiles", () => {
    const tiles = computeAoETiles("rectangle", center, {}, mapW, mapH);
    expect(tiles).toHaveLength(0);
  });

  it("oriented rectangle (length/width) axis-aligned east yields length×width tiles", () => {
    // anchor at (5,5), dir=90 (east), length=15ft (3 tiles), width=5ft (1 tile)
    const tiles = computeAoETiles(
      "rectangle",
      { x: 5, y: 5 },
      { direction: 90, length: 15, width: 5 },
      mapW,
      mapH,
    );
    // Obox center at (6+1, 5.5) along direction; axis-aligned box covers 3 tiles east of anchor.
    expect(tiles.length).toBeGreaterThanOrEqual(3);
    expect(tiles.length).toBeLessThanOrEqual(6);
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

// ---------------------------------------------------------------------------
// shapeContainsPoint / buildAoEShape / tilesInShape (new geometry API)
// ---------------------------------------------------------------------------
describe("shapeContainsPoint (circle)", () => {
  const s = buildAoEShape({ kind: "sphere", centerTile: { x: 5, y: 5 }, sizeFt: 10 });
  it("includes center point", () => {
    expect(shapeContainsPoint(s, { x: 5.5, y: 5.5 })).toBe(true);
  });
  it("includes point on the edge", () => {
    expect(shapeContainsPoint(s, { x: 5.5 + 2, y: 5.5 })).toBe(true);
  });
  it("excludes point beyond radius", () => {
    expect(shapeContainsPoint(s, { x: 5.5 + 2.5, y: 5.5 })).toBe(false);
  });
});

describe("shapeContainsPoint (cone triangle)", () => {
  const s = buildAoEShape({
    kind: "cone",
    casterTile: { x: 5, y: 5 },
    directionDeg: 90, // east
    sizeFt: 15,
  });
  it("includes a point just past caster on the aim line", () => {
    expect(shapeContainsPoint(s, { x: 6.5, y: 5.5 })).toBe(true);
  });
  it("excludes the caster tile center", () => {
    expect(shapeContainsPoint(s, { x: 5.5, y: 5.5 })).toBe(false);
  });
});

describe("shapeContainsPoint (obox)", () => {
  const s = buildAoEShape({
    kind: "obox",
    anchorTile: { x: 5, y: 5 },
    directionDeg: 90, // east
    lengthFt: 15,
    widthFt: 5,
  });
  it("includes tile centers along the length axis", () => {
    expect(shapeContainsPoint(s, { x: 6.5, y: 5.5 })).toBe(true);
    expect(shapeContainsPoint(s, { x: 7.5, y: 5.5 })).toBe(true);
    expect(shapeContainsPoint(s, { x: 8.5, y: 5.5 })).toBe(true);
  });
  it("excludes points outside the width band", () => {
    expect(shapeContainsPoint(s, { x: 6.5, y: 7 })).toBe(false);
  });
});

describe("tilesInShape", () => {
  it("circle r=2 tiles has 13 tiles (diamond + orthogonals)", () => {
    const s = buildAoEShape({ kind: "sphere", centerTile: { x: 5, y: 5 }, sizeFt: 10 });
    const tiles = tilesInShape(s, 20, 20);
    // center + 4 orthogonals at 1 + 4 at 2 + 4 diagonals at √2 = 13
    expect(tiles).toHaveLength(13);
  });
});
