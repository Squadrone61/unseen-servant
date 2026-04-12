import { useState, useMemo } from "react";
import type { CharacterData, CharacterSpell } from "@unseen-servant/shared/types";
import { getSpellAvailability } from "@unseen-servant/shared/utils";
import type { SpellAvailability } from "@unseen-servant/shared/utils";
import { FilterChipBar } from "../FilterChipBar";

interface SpellsTabProps {
  character: CharacterData;
  onSpellClick: (spell: CharacterSpell, e: React.MouseEvent) => void;
}

const AVAILABILITY_STYLES: Record<SpellAvailability, { dot: string; text: string }> = {
  active: { dot: "bg-green-500", text: "text-gray-200" },
  "ritual-only": { dot: "bg-blue-500", text: "text-blue-300/80" },
  known: { dot: "bg-gray-600 ring-1 ring-gray-500", text: "text-gray-500" },
};

function SpellRow({
  spell,
  onClick,
}: {
  spell: CharacterSpell;
  onClick: (e: React.MouseEvent) => void;
}) {
  const availability = getSpellAvailability(spell);
  const styles = AVAILABILITY_STYLES[availability];

  return (
    <div
      className={`text-xs flex items-center gap-1.5 cursor-pointer hover:text-amber-300 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-800/60 ${styles.text}`}
      onClick={onClick}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} />
      <span className="truncate flex-1">{spell.name}</span>

      {/* Source badges */}
      {spell.spellSource === "race" && (
        <span className="text-xs text-emerald-400/60 font-semibold shrink-0" title="Species spell">
          S
        </span>
      )}
      {spell.spellSource === "feat" && (
        <span className="text-xs text-amber-400/60 font-semibold shrink-0" title="Feat spell">
          F
        </span>
      )}
      {spell.spellSource === "item" && (
        <span className="text-xs text-cyan-400/60 font-semibold shrink-0" title="Item spell">
          I
        </span>
      )}

      {/* Concentration & Ritual badges */}
      {spell.concentration && (
        <span className="text-xs text-yellow-500 font-semibold shrink-0">C</span>
      )}
      {spell.ritual && <span className="text-xs text-blue-400 font-semibold shrink-0">R</span>}
    </div>
  );
}

export function SpellsTab({ character, onSpellClick }: SpellsTabProps) {
  const [filter, setFilter] = useState<string>("all");
  const s = character.static;
  const d = character.dynamic;

  // Sort: active first, then ritual-only, then known; within each group alphabetical
  const spellSort = (a: CharacterSpell, b: CharacterSpell) => {
    const order: Record<SpellAvailability, number> = {
      active: 0,
      "ritual-only": 1,
      known: 2,
    };
    const aOrder = order[getSpellAvailability(a)];
    const bOrder = order[getSpellAvailability(b)];
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  };

  // Determine which spell levels exist
  const spellLevels = useMemo(() => {
    const levels = new Set(s.spells.map((sp) => sp.level));
    return Array.from(levels).sort((a, b) => a - b);
  }, [s.spells]);

  const chips = useMemo(() => {
    const result = [{ id: "all", label: "ALL", count: s.spells.length }];
    for (const lvl of spellLevels) {
      const count = s.spells.filter((sp) => sp.level === lvl).length;
      result.push({
        id: String(lvl),
        label: lvl === 0 ? "CANTRIP" : String(lvl),
        count,
      });
    }
    return result;
  }, [s.spells, spellLevels]);

  const filteredLevels = filter === "all" ? spellLevels : [Number(filter)];

  const pactSlots = (d.pactMagicSlots || []).filter((sl) => sl.total > 0);

  return (
    <div className="space-y-2">
      <FilterChipBar chips={chips} activeChipId={filter} onSelect={setFilter} />

      {/* Pact Magic Slots (Warlock) */}
      {pactSlots.length > 0 && (
        <div className="flex items-center gap-2 text-xs px-1.5 py-1 bg-amber-500/10 border border-gray-700/50 rounded">
          <span className="text-amber-400 font-medium text-xs">Pact Slots</span>
          {pactSlots.map((sl) => (
            <span key={sl.level} className="text-gray-300">
              <span className="text-gray-500 text-xs">Lvl {sl.level}:</span>{" "}
              <span className="text-amber-400/80">
                {sl.total - sl.used}/{sl.total}
              </span>
            </span>
          ))}
          <span className="text-xs text-gray-600 ml-auto">short rest</span>
        </div>
      )}

      {s.spells.length === 0 && pactSlots.length === 0 && (
        <div className="text-xs text-gray-600 text-center py-4">No spells known</div>
      )}

      <div className="space-y-2">
        {filteredLevels.map((lvl) => {
          const spellsAtLevel = s.spells.filter((sp) => sp.level === lvl).sort(spellSort);
          if (spellsAtLevel.length === 0) return null;

          const slotData = d.spellSlotsUsed.find((sl) => sl.level === lvl);

          return (
            <div key={lvl}>
              <div className="text-xs text-gray-500 mb-0.5 flex items-center gap-1.5 px-1.5">
                <span className="font-medium">{lvl === 0 ? "Cantrips" : `Level ${lvl}`}</span>
                {slotData && slotData.total > 0 && (
                  <span className="text-amber-400/80">
                    {slotData.total - slotData.used}/{slotData.total} slots
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {spellsAtLevel.map((sp, i) => (
                  <SpellRow
                    key={`${sp.name}-${i}`}
                    spell={sp}
                    onClick={(e) => onSpellClick(sp, e)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
