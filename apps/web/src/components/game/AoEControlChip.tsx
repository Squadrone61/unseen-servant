"use client";

import { useState } from "react";
import type { StagedAoE, AoECounts } from "@/hooks/useAoEPlacement";

interface AoEControlChipProps {
  stagedAoE: StagedAoE;
  counts: AoECounts;
  onCancel: () => void;
  /** Position in screen coordinates to anchor the chip (near origin tile) */
  screenX: number;
  screenY: number;
}

function shapeSummary(aoe: StagedAoE): string {
  const shapeStr =
    aoe.shape === "rectangle"
      ? aoe.rectanglePreset === "line"
        ? "line"
        : aoe.rectanglePreset === "cube"
          ? "cube"
          : "rectangle"
      : aoe.shape;
  return `${aoe.size}ft ${shapeStr}`;
}

export function AoEControlChip({
  stagedAoE,
  counts,
  onCancel,
  screenX,
  screenY,
}: AoEControlChipProps) {
  const [showNames, setShowNames] = useState(false);

  const totalTargets = counts.enemies.length + counts.allies.length + counts.self.length;
  const targetSummary =
    totalTargets === 0
      ? "No targets"
      : [
          counts.enemies.length > 0
            ? `${counts.enemies.length} ${counts.enemies.length === 1 ? "enemy" : "enemies"}`
            : null,
          counts.allies.length > 0
            ? `${counts.allies.length} ${counts.allies.length === 1 ? "ally" : "allies"}`
            : null,
          counts.self.length > 0 ? `${counts.self.length === 1 ? "self" : "self+"}` : null,
        ]
          .filter(Boolean)
          .join(", ");

  const saveStr = stagedAoE.save
    ? ` · DC ${stagedAoE.save.dc === "spell_save_dc" ? "?" : stagedAoE.save.dc} ${stagedAoE.save.ability.toUpperCase().slice(0, 3)} save`
    : "";

  const allNames = [...counts.enemies, ...counts.allies, ...counts.self];

  return (
    <div
      className="fixed z-50 pointer-events-auto select-none"
      style={{ left: screenX, top: screenY - 12, transform: "translate(-50%, -100%)" }}
    >
      <div
        className="bg-gray-900/95 border rounded-lg shadow-xl text-xs backdrop-blur-sm"
        style={{ borderColor: stagedAoE.color + "80", minWidth: 170 }}
      >
        {/* Header: spell name + shape */}
        <div className="px-3 pt-2 pb-1">
          <div className="font-semibold text-gray-100" style={{ color: stagedAoE.color }}>
            {stagedAoE.spellName ?? stagedAoE.label ?? "AoE Template"}
          </div>
          <div className="text-gray-400 mt-0.5">
            {shapeSummary(stagedAoE)}
            {saveStr}
          </div>
        </div>

        {/* Targets line (hover to expand) */}
        <div
          className="px-3 py-1 border-t border-gray-700/40 cursor-pointer hover:bg-gray-800/40 transition-colors"
          onMouseEnter={() => setShowNames(true)}
          onMouseLeave={() => setShowNames(false)}
        >
          <span className="text-gray-300">Targets: {targetSummary}</span>
          {showNames && allNames.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {counts.enemies.map((n) => (
                <div key={n} className="text-red-400 pl-2">
                  {n}
                </div>
              ))}
              {counts.allies.map((n) => (
                <div key={n} className="text-blue-400 pl-2">
                  {n}
                </div>
              ))}
              {counts.self.map((n) => (
                <div key={n} className="text-amber-400 pl-2">
                  {n} (self)
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cancel button */}
        <div className="px-3 py-1.5 border-t border-gray-700/40">
          <button
            onClick={onCancel}
            className="w-full text-left text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1.5"
          >
            <span className="text-gray-600">[</span>
            Cancel
            <span className="font-mono text-gray-500 text-[10px]">Esc</span>
            <span className="text-gray-600">]</span>
          </button>
        </div>
      </div>
    </div>
  );
}
