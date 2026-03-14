"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type InteractionMode = "idle" | "dragging" | ResizeEdge;

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STORAGE_KEY = "unseen-notes-panel-geometry";
const MIN_WIDTH = 280;
const MIN_HEIGHT = 200;
const VISIBLE_PX = 40;

function getDefaultGeometry(): Geometry {
  if (typeof window === "undefined") {
    return { x: 600, y: 200, width: 320, height: 440 };
  }
  return {
    x: window.innerWidth - 360,
    y: window.innerHeight - 480,
    width: 320,
    height: 440,
  };
}

function loadGeometry(): Geometry {
  if (typeof window === "undefined") return getDefaultGeometry();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Geometry;
      if (parsed.width >= MIN_WIDTH && parsed.height >= MIN_HEIGHT) {
        return clampToViewport(parsed);
      }
    }
  } catch {
    // ignore
  }
  return getDefaultGeometry();
}

function clampToViewport(g: Geometry): Geometry {
  if (typeof window === "undefined") return g;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(g.width, MIN_WIDTH), vw - 40);
  const height = Math.min(Math.max(g.height, MIN_HEIGHT), vh - 40);
  const x = Math.min(Math.max(g.x, VISIBLE_PX - width), vw - VISIBLE_PX);
  const y = Math.min(Math.max(g.y, 0), vh - VISIBLE_PX);
  return { x, y, width, height };
}

export function usePanelGeometry() {
  const [geometry, setGeometry] = useState<Geometry>(loadGeometry);
  const modeRef = useRef<InteractionMode>("idle");
  const startMouseRef = useRef({ x: 0, y: 0 });
  const startGeoRef = useRef<Geometry>(geometry);

  const persist = useCallback((g: Geometry) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
    } catch {
      // ignore
    }
  }, []);

  const isInteracting = modeRef.current !== "idle";

  // Global mousemove/mouseup handlers
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const mode = modeRef.current;
      if (mode === "idle") return;

      const dx = e.clientX - startMouseRef.current.x;
      const dy = e.clientY - startMouseRef.current.y;
      const s = startGeoRef.current;

      if (mode === "dragging") {
        setGeometry(clampToViewport({ ...s, x: s.x + dx, y: s.y + dy }));
        return;
      }

      // Resize
      let { x, y, width, height } = s;

      if (mode.includes("e")) {
        width = Math.max(MIN_WIDTH, s.width + dx);
      }
      if (mode.includes("w")) {
        const newWidth = Math.max(MIN_WIDTH, s.width - dx);
        x = s.x + s.width - newWidth;
        width = newWidth;
      }
      if (mode.includes("s")) {
        height = Math.max(MIN_HEIGHT, s.height + dy);
      }
      if (mode.includes("n")) {
        const newHeight = Math.max(MIN_HEIGHT, s.height - dy);
        y = s.y + s.height - newHeight;
        height = newHeight;
      }

      const maxW = window.innerWidth - 40;
      const maxH = window.innerHeight - 40;
      width = Math.min(width, maxW);
      height = Math.min(height, maxH);

      setGeometry(clampToViewport({ x, y, width, height }));
    };

    const onMouseUp = () => {
      if (modeRef.current !== "idle") {
        modeRef.current = "idle";
        setGeometry((g) => {
          persist(g);
          return g;
        });
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [persist]);

  // Re-clamp on window resize
  useEffect(() => {
    const onResize = () => {
      setGeometry((g) => {
        const clamped = clampToViewport(g);
        persist(clamped);
        return clamped;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [persist]);

  const startInteraction = useCallback(
    (mode: InteractionMode, e: React.MouseEvent) => {
      e.preventDefault();
      modeRef.current = mode;
      startMouseRef.current = { x: e.clientX, y: e.clientY };
      setGeometry((g) => {
        startGeoRef.current = g;
        return g;
      });
    },
    [],
  );

  const dragHandleProps = {
    onMouseDown: (e: React.MouseEvent) => startInteraction("dragging", e),
    style: { cursor: "move" } as React.CSSProperties,
  };

  const resizeHandleProps = useCallback(
    (edge: ResizeEdge) => ({
      onMouseDown: (e: React.MouseEvent) => startInteraction(edge, e),
      style: {
        cursor: EDGE_CURSORS[edge],
      } as React.CSSProperties,
    }),
    [startInteraction],
  );

  const resetGeometry = useCallback(() => {
    const def = getDefaultGeometry();
    setGeometry(def);
    persist(def);
  }, [persist]);

  return { geometry, dragHandleProps, resizeHandleProps, isInteracting, resetGeometry };
}

const EDGE_CURSORS: Record<ResizeEdge, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  sw: "nesw-resize",
};
