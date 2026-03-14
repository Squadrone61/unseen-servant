import { useState, useMemo } from "react";
import type { CharacterData, CharacterSpell } from "@aidnd/shared/types";
import { getSpellAvailability } from "@aidnd/shared/utils";
import type { SpellAvailability } from "@aidnd/shared/utils";
import { FilterChipBar } from "../FilterChipBar";

interface SpellsTabProps {
  character: CharacterData;
  onSpellClick: (spell: CharacterSpell, e: React.MouseEvent) => void;
}

// Known/spontaneous casters — all learned spells are always available
const KNOWN_CASTER_CLASSES = new Set([
  "bard", "sorcerer", "ranger", "warlock",
]);

const AVAILABILITY_STYLES: Record<SpellAvailability, { dot: string; text: string }> = {
  active: { dot: "bg-green-500", text: "text-gray-200" },
  "ritual-only": { dot: "bg-blue-500", text: "text-blue-300/80" },
  known: { dot: "bg-gray-600 ring-1 ring-gray-500", text: "text-gray-500" },
};

function getClassBadge(spell: CharacterSpell): string | null {
  if (spell.spellSource !== "class") return null;
  if (!spell.alwaysPrepared) return null;

  // Per-spell sourceClass: show "Prepared" for always-prepared spells from prepared casters
  if (spell.sourceClass) {
    const isKnown = KNOWN_CASTER_CLASSES.has(spell.sourceClass.toLowerCase());
    return isKnown ? null : "Prepared";
  }

  // Fallback for old data without sourceClass
  return "Always";
}

function SpellRow({
  spell,
  onClick,
}: {
  spell: CharacterSpell;
  onClick: (e: React.MouseEvent) => void;
}) {
  const availability = getSpellAvailability(spell);
  const styles = AVAILABILITY_STYLES[availability];
  const classBadge = getClassBadge(spell);

  return (
    <div
      className={`text-xs flex items-center gap-1.5 cursor-pointer hover:text-amber-300 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-800/60 ${styles.text}`}
      onClick={onClick}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`}
      />
      <span className="truncate flex-1">{spell.name}</span>

      {/* Source badges */}
      {classBadge && (
        <span className="text-xs text-amber-400/70 shrink-0">{classBadge}</span>
      )}
      {spell.spellSource === "race" && (
        <span className="text-xs text-emerald-400/70 shrink-0">Species</span>
      )}
      {spell.spellSource === "feat" && (
        <span className="text-xs text-amber-400/70 shrink-0">Feat</span>
      )}
      {spell.spellSource === "item" && (
        <span className="text-xs text-cyan-400/70 shrink-0">Item</span>
      )}

      {/* Concentration & Ritual badges */}
      {spell.concentration && (
        <span className="text-xs text-yellow-500 font-semibold shrink-0">
          C
        </span>
      )}
      {spell.ritual && (
        <span className="text-xs text-blue-400 font-semibold shrink-0">
          R
        </span>
      )}
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
    const result = [
      { id: "all", label: "ALL", count: s.spells.length },
    ];
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

  const filteredLevels =
    filter === "all" ? spellLevels : [Number(filter)];

  const classResources = s.classResources || [];
  const pactSlots = (d.pactMagicSlots || []).filter((sl) => sl.total > 0);

  return (
    <div className="space-y-2">
      <FilterChipBar chips={chips} activeChipId={filter} onSelect={setFilter} />

      {/* Class Resources (Channel Divinity, Ki, Rage, etc.) */}
      {classResources.length > 0 && (
        <div className="space-y-1 pb-2 border-b border-gray-700/40">
          <div className="text-sm text-gray-500 uppercase tracking-wider font-medium px-1.5" style={{ fontFamily: "var(--font-cinzel)" }}>
            Class Resources
          </div>
          {classResources.map((resource) => {
            const used = (d.resourcesUsed || {})[resource.name] ?? 0;
            const remaining = resource.maxUses - used;
            return (
              <div
                key={resource.name}
                className="flex items-center gap-1.5 text-xs px-1.5 py-0.5"
              >
                <span className="text-gray-300 truncate flex-1">
                  {resource.name}
                </span>
                <span className="text-xs text-gray-500">
                  {resource.resetType === "short" ? "SR" : "LR"}
                </span>
                <span className="text-amber-400/80 shrink-0">
                  {remaining}/{resource.maxUses}
                </span>
              </div>
            );
          })}
        </div>
      )}

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

      {s.spells.length === 0 && classResources.length === 0 && (
        <div className="text-xs text-gray-600 text-center py-4">
          No spells known
        </div>
      )}

      <div className="space-y-2">
        {filteredLevels.map((lvl) => {
          const spellsAtLevel = s.spells
            .filter((sp) => sp.level === lvl)
            .sort(spellSort);
          if (spellsAtLevel.length === 0) return null;

          const slotData = d.spellSlotsUsed.find((sl) => sl.level === lvl);

          return (
            <div key={lvl}>
              <div className="text-xs text-gray-500 mb-0.5 flex items-center gap-1.5 px-1.5">
                <span className="font-medium">
                  {lvl === 0 ? "Cantrips" : `Level ${lvl}`}
                </span>
                {slotData && slotData.total > 0 && (
                  <span className="text-amber-400/80">
                    {slotData.total - slotData.used}/{slotData.total} slots
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {spellsAtLevel.map((sp) => (
                  <SpellRow
                    key={sp.name}
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
