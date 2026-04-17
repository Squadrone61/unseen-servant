"use client";

import type { AoEOverlay } from "@unseen-servant/shared/types";
import { buildAoEShape, dirVector, type AoEShape } from "@unseen-servant/shared/utils";

/**
 * Reconstruct an AoEShape (world coords in tile-units) from a stored overlay.
 * Falls back across the legacy wire formats (from/to, length/width, tile- vs corner-origin).
 */
export function overlayToShape(aoe: AoEOverlay): AoEShape | null {
  if (aoe.shape === "sphere" && aoe.size) {
    const r = aoe.size / 5;
    return aoe.cornerOrigin
      ? { kind: "circle", cx: aoe.center.x, cy: aoe.center.y, r }
      : buildAoEShape({ kind: "sphere", centerTile: aoe.center, sizeFt: aoe.size });
  }
  if (aoe.shape === "cone" && aoe.size != null) {
    return buildAoEShape({
      kind: "cone",
      casterTile: aoe.center,
      directionDeg: aoe.direction ?? 0,
      sizeFt: aoe.size,
    });
  }
  if (aoe.shape === "rectangle") {
    if (aoe.length && aoe.length > 0) {
      const lengthTiles = aoe.length / 5;
      const widthTiles = (aoe.width ?? 5) / 5;
      return aoe.cornerOrigin
        ? {
            kind: "obox",
            cx: aoe.center.x,
            cy: aoe.center.y,
            length: lengthTiles,
            width: widthTiles,
            dir: aoe.direction ?? 0,
          }
        : buildAoEShape({
            kind: "obox",
            anchorTile: aoe.center,
            directionDeg: aoe.direction ?? 0,
            lengthFt: aoe.length,
            widthFt: aoe.width ?? 5,
          });
    }
    if (aoe.from && aoe.to) {
      const minX = Math.min(aoe.from.x, aoe.to.x);
      const maxX = Math.max(aoe.from.x, aoe.to.x);
      const minY = Math.min(aoe.from.y, aoe.to.y);
      const maxY = Math.max(aoe.from.y, aoe.to.y);
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
  return null;
}

interface AoEShapeOverlayProps {
  committed: Array<{ aoe: AoEOverlay; shape: AoEShape }>;
  staged: { color: string } | null;
  stagedShape: AoEShape | null;
  width: number;
  height: number;
  tileUnit: number;
}

/** SVG layer that draws real circles/triangles/oboxes for staged + committed AoEs. */
export function AoEShapeOverlay({
  committed,
  staged,
  stagedShape,
  width,
  height,
  tileUnit,
}: AoEShapeOverlayProps) {
  return (
    <svg className="pointer-events-none absolute inset-0" style={{ zIndex: 18, width, height }}>
      {committed.map(({ aoe, shape }) => (
        <AoEShapePath
          key={`committed-${aoe.id}`}
          shape={shape}
          color={aoe.color}
          fillOpacity={0.18}
          strokeOpacity={0.7}
          tileUnit={tileUnit}
          pulse
        />
      ))}
      {staged && stagedShape && (
        <AoEShapePath
          shape={stagedShape}
          color={staged.color}
          fillOpacity={0.28}
          strokeOpacity={0.9}
          tileUnit={tileUnit}
        />
      )}
    </svg>
  );
}

interface AoEShapePathProps {
  shape: AoEShape;
  color: string;
  fillOpacity: number;
  strokeOpacity: number;
  tileUnit: number;
  pulse?: boolean;
}

function AoEShapePath({
  shape,
  color,
  fillOpacity,
  strokeOpacity,
  tileUnit,
  pulse,
}: AoEShapePathProps) {
  const toPx = (p: { x: number; y: number }) => ({ x: p.x * tileUnit, y: p.y * tileUnit });
  const style: React.CSSProperties = pulse ? { animation: "aoePulse 3s ease-in-out infinite" } : {};
  const common = {
    fill: color,
    fillOpacity,
    stroke: color,
    strokeOpacity,
    strokeWidth: 1.5,
    style,
  };

  if (shape.kind === "circle") {
    const c = toPx({ x: shape.cx, y: shape.cy });
    return <circle cx={c.x} cy={c.y} r={shape.r * tileUnit} {...common} />;
  }
  if (shape.kind === "triangle") {
    const pts = [shape.a, shape.b, shape.c].map(toPx);
    return <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} {...common} />;
  }
  // obox — four rotated corners around (cx, cy)
  const { dx, dy } = dirVector(shape.dir);
  const hl = shape.length / 2;
  const hw = shape.width / 2;
  const corners = [
    { x: shape.cx - dx * hl + dy * hw, y: shape.cy - dy * hl - dx * hw },
    { x: shape.cx + dx * hl + dy * hw, y: shape.cy + dy * hl - dx * hw },
    { x: shape.cx + dx * hl - dy * hw, y: shape.cy + dy * hl + dx * hw },
    { x: shape.cx - dx * hl - dy * hw, y: shape.cy - dy * hl + dx * hw },
  ].map(toPx);
  return <polygon points={corners.map((p) => `${p.x},${p.y}`).join(" ")} {...common} />;
}
