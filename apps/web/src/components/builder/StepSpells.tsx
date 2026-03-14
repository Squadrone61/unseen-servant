import { useMemo, useState, useEffect } from "react";
import { getSpellsByClass, getSpell } from "@aidnd/shared/data";
import type { SpellData } from "@aidnd/shared/data";
import type { StepProps } from "./types";
import { RichText } from "@/components/ui/RichText";
import {
  getCantripsKnown,
  getSpellsKnownOrPrepared,
  getMaxSpellLevel,
  getAbilityMod,
  getFinalAbilities,
  isCasterClass,
  getSubclassAlwaysPrepared,
  RITUAL_CASTER_CLASSES,
} from "./utils";
import {
  isRitual,
  isConcentration,
  formatCastingTime,
  formatRange,
  formatDuration,
  formatComponents,
  formatSchool,
} from "@aidnd/shared";

// ─── School color system ──────────────────────────────────────────────────────

type SchoolCode = "A" | "C" | "D" | "E" | "V" | "I" | "N" | "T" | string;

interface SchoolStyle {
  dot: string;       // bg color class for the dot
  border: string;    // left border color class
  badge: string;     // badge bg + text
  text: string;      // school name text color
}

const SCHOOL_STYLES: Record<string, SchoolStyle> = {
  A: {
    dot: "bg-blue-400",
    border: "border-l-blue-500/60",
    badge: "bg-blue-900/30 text-blue-300 border border-blue-700/40",
    text: "text-blue-400/80",
  },
  C: {
    dot: "bg-amber-400",
    border: "border-l-amber-500/60",
    badge: "bg-amber-900/30 text-amber-300 border border-amber-700/40",
    text: "text-amber-400/80",
  },
  D: {
    dot: "bg-gray-300",
    border: "border-l-gray-400/60",
    badge: "bg-gray-700/40 text-gray-300 border border-gray-600/40",
    text: "text-gray-400/80",
  },
  E: {
    dot: "bg-pink-400",
    border: "border-l-pink-500/60",
    badge: "bg-pink-900/30 text-pink-300 border border-pink-700/40",
    text: "text-pink-400/80",
  },
  V: {
    dot: "bg-orange-400",
    border: "border-l-orange-500/60",
    badge: "bg-orange-900/30 text-orange-300 border border-orange-700/40",
    text: "text-orange-400/80",
  },
  I: {
    dot: "bg-purple-400",
    border: "border-l-purple-500/60",
    badge: "bg-purple-900/30 text-purple-300 border border-purple-700/40",
    text: "text-purple-400/80",
  },
  N: {
    dot: "bg-emerald-500",
    border: "border-l-emerald-600/60",
    badge: "bg-emerald-950/50 text-emerald-400 border border-emerald-800/40",
    text: "text-emerald-500/80",
  },
  T: {
    dot: "bg-teal-400",
    border: "border-l-teal-500/60",
    badge: "bg-teal-900/30 text-teal-300 border border-teal-700/40",
    text: "text-teal-400/80",
  },
};

const DEFAULT_SCHOOL_STYLE: SchoolStyle = {
  dot: "bg-gray-500",
  border: "border-l-gray-600/40",
  badge: "bg-gray-800/50 text-gray-400 border border-gray-700/40",
  text: "text-gray-500",
};

function getSchoolStyle(school: SchoolCode): SchoolStyle {
  return SCHOOL_STYLES[school] ?? DEFAULT_SCHOOL_STYLE;
}

// ─── Spellcasting ability map ────────────────────────────────────────────────

const SPELLCASTING_ABILITY_MAP: Record<string, string> = {
  bard: "charisma",
  cleric: "wisdom",
  druid: "wisdom",
  paladin: "charisma",
  ranger: "wisdom",
  sorcerer: "charisma",
  warlock: "charisma",
  wizard: "intelligence",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function StepSpells({ state, dispatch }: StepProps) {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<number | null>(null);
  const [expandedSpell, setExpandedSpell] = useState<string | null>(null);
  const [ritualOnly, setRitualOnly] = useState(false);
  const [cantripsExpanded, setCantripsExpanded] = useState(true);

  // Find the first caster class for spell display
  const casterClass = state.classes.find(c => isCasterClass(c.className));
  const className = casterClass?.className ?? "";
  const classLevel = casterClass?.level ?? 1;
  const classSubclass = casterClass?.subclass ?? null;

  const finalAbilities = useMemo(() => getFinalAbilities(state), [state]);

  const castingAbility = SPELLCASTING_ABILITY_MAP[className.toLowerCase()] as
    | keyof typeof finalAbilities
    | undefined;
  const abilityMod = castingAbility
    ? getAbilityMod(finalAbilities[castingAbility])
    : 0;

  // Per-class spell selections
  const selectedCantrips = state.spellSelections[className]?.cantrips ?? [];
  const selectedSpells = state.spellSelections[className]?.spells ?? [];

  const maxCantrips = getCantripsKnown(className, classLevel);
  const maxSpellLevel = getMaxSpellLevel(className, classLevel);
  const spellInfo = getSpellsKnownOrPrepared(
    className,
    classLevel,
    abilityMod
  );

  // Always-prepared spells from subclass
  const alwaysPrepared = useMemo(
    () => getSubclassAlwaysPrepared(className, classSubclass, classLevel),
    [className, classSubclass, classLevel]
  );
  const alwaysPreparedSet = useMemo(
    () => new Set(alwaysPrepared.map((s) => s.toLowerCase())),
    [alwaysPrepared]
  );

  // Auto-collapse cantrips when selection is complete
  useEffect(() => {
    if (selectedCantrips.length >= maxCantrips && maxCantrips > 0) {
      setCantripsExpanded(false);
    }
  }, [selectedCantrips.length, maxCantrips]);

  // Ritual caster check
  const isRitualCaster = RITUAL_CASTER_CLASSES.has(className.toLowerCase());
  const isWizard = className.toLowerCase() === "wizard";

  // Get class spell list
  const classSpells = useMemo(() => {
    if (!className) return [];
    return getSpellsByClass(className);
  }, [className]);

  // Filter spells
  const cantrips = useMemo(
    () => classSpells.filter((s) => s.level === 0),
    [classSpells]
  );

  const leveled = useMemo(() => {
    return classSpells.filter(
      (s) => s.level > 0 && s.level <= maxSpellLevel
    );
  }, [classSpells, maxSpellLevel]);

  const filteredCantrips = useMemo(() => {
    let list = cantrips;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          formatSchool(s.school).toLowerCase().includes(q)
      );
    }
    return list;
  }, [cantrips, search]);

  const filteredLeveled = useMemo(() => {
    let list = leveled;
    if (levelFilter !== null) {
      list = list.filter((s) => s.level === levelFilter);
    }
    if (ritualOnly) {
      list = list.filter((s) => isRitual(s));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          formatSchool(s.school).toLowerCase().includes(q)
      );
    }
    return list;
  }, [leveled, levelFilter, ritualOnly, search]);

  if (!casterClass) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-lg mb-2">No Spellcasting</div>
        <p className="text-xs">
          {state.classes[0]?.className || "This class"} does not have spellcasting. You can skip
          this step.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-amber-200/90 tracking-wide" style={{ fontFamily: "var(--font-cinzel)" }}>
          Spells
        </h2>
        <p className="text-sm text-gray-500">
          Select your cantrips and {spellInfo.type === "known" ? "known" : "prepared"} spells.
          {castingAbility && (
            <span className="ml-1 text-amber-300">
              Casting: {castingAbility.charAt(0).toUpperCase() + castingAbility.slice(1)} (
              {abilityMod >= 0 ? "+" : ""}
              {abilityMod})
            </span>
          )}
        </p>
        <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
        {isRitualCaster && (
          <p className="text-xs text-gray-600 mt-0.5">
            {isWizard
              ? "As a Wizard, you can ritual cast any spell in your spellbook with the Ritual tag without preparing it."
              : "You can ritual cast prepared spells with the Ritual tag without expending a spell slot."}
          </p>
        )}
      </div>

      <div className="flex gap-4">
        {/* Left: Spell Browser */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search spells..."
            className="w-full bg-gray-900/60 border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30"
          />

          {/* Cantrips (collapsible) */}
          <div>
            <button
              onClick={() => setCantripsExpanded(!cantripsExpanded)}
              className="flex items-center justify-between w-full mb-2"
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`w-3 h-3 text-gray-500 transition-transform ${cantripsExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-xs font-medium text-gray-300">Cantrips</span>
                {/* Progress pill */}
                <SelectionPill current={selectedCantrips.length} max={maxCantrips} />
              </div>
              {!cantripsExpanded && selectedCantrips.length > 0 && (
                <span className="text-xs text-amber-400/70 truncate max-w-[60%] text-right">
                  {selectedCantrips.join(", ")}
                </span>
              )}
            </button>

            {/* Cantrips progress bar */}
            {cantripsExpanded && maxCantrips > 0 && (
              <ProgressBar current={selectedCantrips.length} max={maxCantrips} className="mb-2" />
            )}

            {cantripsExpanded && (
              <div className="space-y-1">
                {filteredCantrips.map((spell) => (
                  <SpellRow
                    key={spell.name}
                    spell={spell}
                    isCantrip
                    selected={selectedCantrips.includes(spell.name)}
                    disabled={
                      !selectedCantrips.includes(spell.name) &&
                      selectedCantrips.length >= maxCantrips
                    }
                    locked={false}
                    expanded={expandedSpell === spell.name}
                    isRitualCaster={isRitualCaster}
                    onToggle={() =>
                      dispatch({ type: "TOGGLE_CANTRIP", className, spell: spell.name })
                    }
                    onExpand={() =>
                      setExpandedSpell(
                        expandedSpell === spell.name ? null : spell.name
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Level Filter + Leveled Spells */}
          {maxSpellLevel > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-300">
                    Spells
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setLevelFilter(null)}
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        levelFilter === null
                          ? "bg-amber-500/15 text-amber-300"
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      All
                    </button>
                    {Array.from({ length: maxSpellLevel }, (_, i) => i + 1).map(
                      (l) => (
                        <button
                          key={l}
                          onClick={() => setLevelFilter(l)}
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            levelFilter === l
                              ? "bg-amber-500/15 text-amber-300"
                              : "text-gray-500 hover:text-gray-300"
                          }`}
                        >
                          {l}
                        </button>
                      )
                    )}
                    {isRitualCaster && (
                      <button
                        onClick={() => setRitualOnly(!ritualOnly)}
                        className={`text-xs px-1.5 py-0.5 rounded ml-1 ${
                          ritualOnly
                            ? "bg-cyan-600/20 text-cyan-400"
                            : "text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        Ritual
                      </button>
                    )}
                  </div>
                </div>
                {/* Selection pill for leveled spells */}
                <SelectionPill current={selectedSpells.length} max={spellInfo.count} label={spellInfo.type} />
              </div>

              {/* Leveled spells progress bar */}
              {spellInfo.count > 0 && (
                <ProgressBar current={selectedSpells.length} max={spellInfo.count} className="mb-2" />
              )}

              <div className="space-y-1 max-h-96 overflow-y-auto">
                {filteredLeveled.map((spell) => {
                  const isAlwaysPrepared = alwaysPreparedSet.has(spell.name.toLowerCase());
                  return (
                    <SpellRow
                      key={spell.name}
                      spell={spell}
                      isCantrip={false}
                      selected={selectedSpells.includes(spell.name) || isAlwaysPrepared}
                      disabled={
                        isAlwaysPrepared ||
                        (!selectedSpells.includes(spell.name) &&
                          selectedSpells.length >= spellInfo.count)
                      }
                      locked={isAlwaysPrepared}
                      expanded={expandedSpell === spell.name}
                      isRitualCaster={isRitualCaster}
                      onToggle={() => {
                        if (!isAlwaysPrepared) {
                          dispatch({ type: "TOGGLE_SPELL", className, spell: spell.name });
                        }
                      }}
                      onExpand={() =>
                        setExpandedSpell(
                          expandedSpell === spell.name ? null : spell.name
                        )
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Selected Spells sidebar */}
        <SelectedSpellsSidebar
          selectedCantrips={selectedCantrips}
          selectedSpells={selectedSpells}
          alwaysPrepared={alwaysPrepared}
        />
      </div>
    </div>
  );
}

// ─── Progress components ──────────────────────────────────────────────────────

function SelectionPill({
  current,
  max,
  label,
}: {
  current: number;
  max: number;
  label?: string;
}) {
  const full = current >= max && max > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
        full
          ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40"
          : "bg-gray-800/70 text-gray-400 border border-gray-700/40"
      }`}
    >
      {current}/{max}
      {label && <span className="opacity-60">{label}</span>}
    </span>
  );
}

function ProgressBar({
  current,
  max,
  className = "",
}: {
  current: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const full = current >= max && max > 0;
  return (
    <div className={`h-1 w-full bg-gray-800/60 rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-300 ${
          full ? "bg-emerald-500/70" : "bg-amber-500/50"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── SpellRow ─────────────────────────────────────────────────────────────────

function SpellRow({
  spell,
  isCantrip,
  selected,
  disabled,
  locked,
  expanded,
  isRitualCaster,
  onToggle,
  onExpand,
}: {
  spell: SpellData;
  isCantrip: boolean;
  selected: boolean;
  disabled: boolean;
  locked: boolean;
  expanded: boolean;
  isRitualCaster: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const schoolStyle = getSchoolStyle(spell.school);
  const ritual = isRitual(spell);
  const concentration = isConcentration(spell);

  return (
    <div
      className={`border-l-2 rounded-lg transition-colors ${schoolStyle.border} ${
        locked
          ? "border border-l-2 border-amber-500/20 bg-amber-600/5"
          : selected
            ? "border border-l-2 border-amber-500/25 bg-amber-500/5"
            : isCantrip
              ? "border border-l-2 border-indigo-800/30 bg-indigo-950/20"
              : "border border-l-2 border-gray-700/50 bg-gray-800/50"
      } ${
        // Cantrips get a subtle gradient shimmer
        isCantrip && !selected && !locked
          ? "bg-gradient-to-r from-indigo-950/30 via-gray-800/50 to-gray-800/50"
          : ""
      }`}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {/* School color dot */}
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${schoolStyle.dot} ${disabled ? "opacity-30" : "opacity-80"}`} />

        {/* Checkbox */}
        {locked ? (
          <div className="w-4 h-4 rounded border border-amber-600 bg-amber-600/30 flex items-center justify-center shrink-0">
            <svg className="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <button
            onClick={onToggle}
            disabled={disabled}
            className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
              selected
                ? "border-amber-500 bg-amber-500/80"
                : disabled
                  ? "border-gray-700 bg-gray-900 opacity-30"
                  : "border-gray-600 bg-gray-900 hover:border-gray-500"
            }`}
          >
            {selected && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        )}

        {/* Spell name + school */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs ${disabled && !selected ? "text-gray-500" : "text-gray-200"}`}>
            {spell.name}
          </span>
          <span className={`text-xs ${schoolStyle.text}`}>
            {formatSchool(spell.school)}
          </span>

          {/* Concentration badge */}
          {concentration && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-900/40 text-violet-300 border border-violet-700/40 font-medium leading-none">
              C
            </span>
          )}

          {/* Ritual badge */}
          {ritual && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium leading-none ${
              isRitualCaster
                ? "bg-cyan-900/40 text-cyan-300 border border-cyan-700/40"
                : "bg-gray-800/50 text-gray-600 border border-gray-700/40"
            }`}>
              R
            </span>
          )}

          {/* Always prepared badge */}
          {locked && (
            <span className="text-xs px-1 text-amber-500/80">always</span>
          )}
        </div>

        {/* Level label */}
        <span className="text-xs text-gray-600 shrink-0">
          {isCantrip ? "Cantrip" : `Lv.${spell.level}`}
        </span>

        {/* Expand button */}
        <button
          onClick={onExpand}
          className="text-gray-600 hover:text-gray-400 shrink-0"
        >
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="px-2.5 pb-2 border-t border-gray-700/50 pt-1.5 space-y-1">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
            <span>{formatCastingTime(spell)}</span>
            <span>{formatRange(spell.range)}</span>
            <span>{formatDuration(spell)}</span>
            <span>{formatComponents(spell)}</span>
          </div>
          <div className="line-clamp-6">
            <RichText entries={spell.entries} className="text-xs text-gray-400" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Selected spells sidebar ──────────────────────────────────────────────────

const SPELL_LEVEL_LABELS: Record<number, string> = {
  1: "1st Level",
  2: "2nd Level",
  3: "3rd Level",
  4: "4th Level",
  5: "5th Level",
  6: "6th Level",
  7: "7th Level",
  8: "8th Level",
  9: "9th Level",
};

function SidebarSpellEntry({ name }: { name: string }) {
  const spell = getSpell(name);
  const schoolStyle = spell ? getSchoolStyle(spell.school) : DEFAULT_SCHOOL_STYLE;
  return (
    <div className="flex items-center gap-1.5 py-0.5 group">
      <div className={`w-1 h-1 rounded-full shrink-0 ${schoolStyle.dot} opacity-70`} />
      <span className="text-xs text-gray-300 leading-tight truncate flex-1">{name}</span>
      {spell && (
        <span className={`text-xs shrink-0 ${schoolStyle.text} opacity-70`}>
          {formatSchool(spell.school).slice(0, 3)}
        </span>
      )}
    </div>
  );
}

function SelectedSpellsSidebar({
  selectedCantrips,
  selectedSpells,
  alwaysPrepared,
}: {
  selectedCantrips: string[];
  selectedSpells: string[];
  alwaysPrepared: string[];
}) {
  const hasSpells =
    alwaysPrepared.length > 0 ||
    selectedCantrips.length > 0 ||
    selectedSpells.length > 0;

  // Group leveled spells by spell level
  const spellsByLevel = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const name of selectedSpells) {
      const spell = getSpell(name);
      const lvl = spell?.level ?? 0;
      if (!map.has(lvl)) map.set(lvl, []);
      map.get(lvl)!.push(name);
    }
    return map;
  }, [selectedSpells]);

  const alwaysPreparedByLevel = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const name of alwaysPrepared) {
      const spell = getSpell(name);
      const lvl = spell?.level ?? 0;
      if (!map.has(lvl)) map.set(lvl, []);
      map.get(lvl)!.push(name);
    }
    return map;
  }, [alwaysPrepared]);

  const sortedLevels = useMemo(
    () => Array.from(spellsByLevel.keys()).sort((a, b) => a - b),
    [spellsByLevel]
  );

  const sortedAlwaysLevels = useMemo(
    () => Array.from(alwaysPreparedByLevel.keys()).sort((a, b) => a - b),
    [alwaysPreparedByLevel]
  );

  const totalCount = selectedCantrips.length + selectedSpells.length + alwaysPrepared.length;

  return (
    <div className="w-64 shrink-0 self-start sticky top-0">
      {/* Header card */}
      <div className="bg-gray-800/80 border border-gray-700/50 rounded-t-lg px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Spellbook icon */}
          <svg className="w-3.5 h-3.5 text-amber-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span className="text-sm font-medium text-gray-200" style={{ fontFamily: "var(--font-cinzel)" }}>
            Spellbook
          </span>
        </div>
        {totalCount > 0 && (
          <span className="text-xs bg-amber-900/30 text-amber-300 border border-amber-700/30 px-1.5 py-0.5 rounded-full">
            {totalCount}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="bg-gray-900/60 border border-t-0 border-gray-700/40 rounded-b-lg p-3 space-y-3 max-h-[560px] overflow-y-auto">
        {!hasSpells ? (
          <p className="text-xs text-gray-600 text-center py-2">No spells selected yet.</p>
        ) : (
          <>
            {/* Always-Prepared spells grouped by level */}
            {sortedAlwaysLevels.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-sm font-medium text-amber-500/80 uppercase tracking-widest">
                  Always Prepared
                </div>
                {sortedAlwaysLevels.map((lvl) => (
                  <div key={lvl}>
                    <div className="text-xs text-gray-600 uppercase tracking-wider mb-0.5 pl-2.5">
                      {SPELL_LEVEL_LABELS[lvl] ?? `Level ${lvl}`}
                    </div>
                    <div className="pl-2">
                      {(alwaysPreparedByLevel.get(lvl) ?? []).map((name) => (
                        <SidebarSpellEntry key={name} name={name} />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="h-px bg-gray-700/40" />
              </div>
            )}

            {/* Cantrips */}
            {selectedCantrips.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-indigo-400/70 uppercase tracking-widest mb-1">
                  Cantrips
                </div>
                <div className="pl-2">
                  {selectedCantrips.map((name) => (
                    <SidebarSpellEntry key={name} name={name} />
                  ))}
                </div>
                {sortedLevels.length > 0 && <div className="h-px bg-gray-700/40 mt-1.5" />}
              </div>
            )}

            {/* Leveled spells grouped by level */}
            {sortedLevels.length > 0 && (
              <div className="space-y-2">
                {sortedLevels.map((lvl) => (
                  <div key={lvl}>
                    <div className="text-sm text-gray-500 uppercase tracking-wider mb-0.5 font-medium">
                      {SPELL_LEVEL_LABELS[lvl] ?? `Level ${lvl}`}
                    </div>
                    <div className="pl-2">
                      {(spellsByLevel.get(lvl) ?? []).map((name) => (
                        <SidebarSpellEntry key={name} name={name} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
