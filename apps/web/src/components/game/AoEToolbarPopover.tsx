"use client";

import { useState, useRef, useEffect } from "react";
import type { StartPlacementParams } from "@/hooks/useAoEPlacement";

interface AoEToolbarPopoverProps {
  onStartPlacement: (params: StartPlacementParams) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

type ShapeOption = "sphere" | "cone" | "rect-free" | "rect-line" | "rect-cube";

const SHAPE_LABELS: Record<ShapeOption, string> = {
  sphere: "Sphere",
  cone: "Cone",
  "rect-free": "Rectangle",
  "rect-line": "Line",
  "rect-cube": "Cube",
};

export function AoEToolbarPopover({
  onStartPlacement,
  onClose,
  anchorRef,
}: AoEToolbarPopoverProps) {
  const [selectedShape, setSelectedShape] = useState<ShapeOption>("sphere");
  const [sizeInput, setSizeInput] = useState("20");
  const [label, setLabel] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, anchorRef]);

  // Close on Esc
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const sizeLabel =
    selectedShape === "rect-free"
      ? "Size (ft) — drag sets both axes"
      : selectedShape === "rect-line"
        ? "Size (ft) — drag sets length"
        : selectedShape === "rect-cube"
          ? "Size (ft) — click to place"
          : "Size (ft)";

  const handleStart = () => {
    const sizeFt = Math.max(5, parseInt(sizeInput, 10) || 20);
    let shape: "sphere" | "cone" | "rectangle" = "sphere";
    let rectanglePreset: "free" | "line" | "cube" | undefined;

    switch (selectedShape) {
      case "sphere":
        shape = "sphere";
        break;
      case "cone":
        shape = "cone";
        break;
      case "rect-free":
        shape = "rectangle";
        rectanglePreset = "free";
        break;
      case "rect-line":
        shape = "rectangle";
        rectanglePreset = "line";
        break;
      case "rect-cube":
        shape = "rectangle";
        rectanglePreset = "cube";
        break;
    }

    onStartPlacement({
      shape,
      size: sizeFt,
      label: label.trim() || undefined,
      color: "#BDBDBD",
      rectanglePreset,
    });
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      className="absolute top-10 right-0 z-50 bg-gray-900 border border-gray-700/50 rounded-lg shadow-xl p-3 w-52"
    >
      <div className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wider">
        Place AoE Template
      </div>

      {/* Shape picker */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 mb-1">Shape</div>
        <div className="grid grid-cols-3 gap-1">
          {(Object.keys(SHAPE_LABELS) as ShapeOption[]).map((s) => (
            <button
              key={s}
              onClick={() => setSelectedShape(s)}
              className={`text-xs px-1.5 py-1 rounded transition-colors border ${
                selectedShape === s
                  ? "bg-amber-600/30 border-amber-500/50 text-amber-300"
                  : "bg-gray-800/60 border-gray-700/40 text-gray-400 hover:text-gray-200 hover:border-gray-600/50"
              }`}
            >
              {SHAPE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Size input */}
      <div className="mb-3">
        <label className="text-xs text-gray-500 block mb-1">{sizeLabel}</label>
        <input
          type="number"
          min={5}
          step={5}
          value={sizeInput}
          onChange={(e) => setSizeInput(e.target.value)}
          className="w-full bg-gray-800/60 border border-gray-700/40 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
      </div>

      {/* Optional label */}
      <div className="mb-3">
        <label className="text-xs text-gray-500 block mb-1">Label (optional)</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Fog Cloud"
          maxLength={30}
          className="w-full bg-gray-800/60 border border-gray-700/40 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
      </div>

      <button
        onClick={handleStart}
        className="w-full bg-amber-600/80 hover:bg-amber-500/80 text-amber-100 text-xs font-medium rounded py-1.5 transition-colors"
      >
        Start Placing
      </button>
    </div>
  );
}
