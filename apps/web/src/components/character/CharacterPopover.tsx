"use client";

import type { CharacterData } from "@unseen-servant/shared/types";
import {
  formatClassString,
  getTotalLevel,
  formatModifier,
  ABILITY_NAMES,
} from "@unseen-servant/shared/utils";

interface CharacterPopoverProps {
  character: CharacterData;
  playerName: string;
  online: boolean;
}

export function CharacterPopover({ character, playerName, online }: CharacterPopoverProps) {
  const s = character.static;
  const d = character.dynamic;
  const totalLevel = getTotalLevel(s.classes);
  const hpPercent = s.maxHP > 0 ? Math.round((d.currentHP / s.maxHP) * 100) : 0;

  return (
    <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-3 shadow-xl w-64 z-50 backdrop-blur-sm">
      {/* Header */}
      <div className="mb-2">
        <div
          className="text-sm font-bold text-amber-300"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          {s.name}
        </div>
        <div className="text-xs text-gray-400">
          {s.species || s.race} &middot; {formatClassString(s.classes)} &middot; Lvl {totalLevel}
        </div>
        <div className="text-xs text-gray-500">
          Played by{" "}
          <span className={online ? "text-green-400" : "text-gray-500"}>{playerName}</span>
          {!online && " (offline)"}
        </div>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="bg-gray-900/50 rounded px-2 py-1 text-center">
          <div className="text-xs text-gray-500">HP</div>
          <div
            className={`text-xs font-bold ${
              hpPercent > 50
                ? "text-green-400"
                : hpPercent > 25
                  ? "text-yellow-400"
                  : "text-red-400"
            }`}
          >
            {d.currentHP}/{s.maxHP}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded px-2 py-1 text-center">
          <div className="text-xs text-gray-500">AC</div>
          <div className="text-xs font-bold text-gray-200">{s.armorClass}</div>
        </div>
        <div className="bg-gray-900/50 rounded px-2 py-1 text-center">
          <div className="text-xs text-gray-500">Speed</div>
          <div className="text-xs font-bold text-gray-200">{s.speed} ft</div>
        </div>
      </div>

      {/* Abilities */}
      <div className="grid grid-cols-6 gap-1">
        {(Object.entries(ABILITY_NAMES) as [keyof typeof s.abilities, string][]).map(
          ([key, label]) => (
            <div key={key} className="text-center">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="text-xs font-medium text-gray-300">
                {formatModifier(s.abilities[key])}
              </div>
            </div>
          ),
        )}
      </div>

      {/* Conditions */}
      {d.conditions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {d.conditions.map((c, i) => (
            <span key={i} className="bg-red-900/30 text-red-400 text-xs px-1.5 py-0.5 rounded-full">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
