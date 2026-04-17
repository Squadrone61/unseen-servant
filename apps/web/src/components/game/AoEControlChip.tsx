"use client";

import { useState } from "react";
import type { StagedAoE, AoECounts } from "@/hooks/useAoEPlacement";

interface AoEControlChipProps {
  stagedAoE: StagedAoE;
  counts: AoECounts;
  onCancel: () => void;
}

function shapeSummary(aoe: StagedAoE): string {
  if (aoe.shape === "rectangle") {
    const preset = aoe.rectanglePreset ?? "free";
    if (preset === "cube") return `${aoe.size}ft cube`;
    if (preset === "line") return `${aoe.length ?? aoe.size}ft line`;
    // free: derive dimensions from rectFrom/rectTo
    if (aoe.rectFrom && aoe.rectTo) {
      const w = Math.abs(aoe.rectTo.x - aoe.rectFrom.x) + 1;
      const h = Math.abs(aoe.rectTo.y - aoe.rectFrom.y) + 1;
      return `${w * 5}×${h * 5}ft rectangle`;
    }
    return `${aoe.size}ft rectangle`;
  }
  return `${aoe.size}ft ${aoe.shape}`;
}

export function AoEControlChip({ stagedAoE, counts, onCancel }: AoEControlChipProps) {
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
    <div className="pointer-events-auto select-none">
      <div
        className="rounded-lg border bg-gray-900/95 text-xs shadow-xl backdrop-blur-sm"
        style={{ borderColor: stagedAoE.color + "80", minWidth: 180 }}
      >
        <div className="px-3 pt-2 pb-1">
          <div className="font-semibold" style={{ color: stagedAoE.color }}>
            {stagedAoE.spellName ?? stagedAoE.label ?? "AoE Template"}
          </div>
          <div className="mt-0.5 text-gray-400">
            {shapeSummary(stagedAoE)}
            {saveStr}
          </div>
        </div>

        <div
          className="cursor-pointer border-t border-gray-700/40 px-3 py-1 transition-colors hover:bg-gray-800/40"
          onMouseEnter={() => setShowNames(true)}
          onMouseLeave={() => setShowNames(false)}
        >
          <span className="text-gray-300">Targets: {targetSummary}</span>
          {showNames && allNames.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {counts.enemies.map((n) => (
                <div key={n} className="pl-2 text-red-400">
                  {n}
                </div>
              ))}
              {counts.allies.map((n) => (
                <div key={n} className="pl-2 text-blue-400">
                  {n}
                </div>
              ))}
              {counts.self.map((n) => (
                <div key={n} className="pl-2 text-amber-400">
                  {n} (self)
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-700/40 px-3 py-1.5">
          <button
            onClick={onCancel}
            className="flex w-full items-center gap-1.5 text-left text-gray-400 transition-colors hover:text-gray-200"
          >
            <span className="text-gray-600">[</span>
            Cancel
            <span className="font-mono text-xs text-gray-500">Esc</span>
            <span className="text-gray-600">]</span>
          </button>
        </div>
      </div>
    </div>
  );
}
