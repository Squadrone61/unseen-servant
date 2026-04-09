"use client";

import { useEffect, useMemo, useState } from "react";
import { spellsArray, classesArray } from "@unseen-servant/shared/data";
import type { SpellDb, SpellLevel, ClassName } from "@unseen-servant/shared/types";
import { RichText } from "@/components/ui/RichText";
import { useBuilder } from "../BuilderContext";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHOOL_COLORS: Record<string, string> = {
  Abjuration: "bg-blue-900/40 text-blue-300 border-blue-700/40",
  Conjuration: "bg-yellow-900/40 text-yellow-300 border-yellow-700/40",
  Divination: "bg-sky-900/40 text-sky-300 border-sky-700/40",
  Enchantment: "bg-pink-900/40 text-pink-300 border-pink-700/40",
  Evocation: "bg-red-900/40 text-red-300 border-red-700/40",
  Illusion: "bg-purple-900/40 text-purple-300 border-purple-700/40",
  Necromancy: "bg-green-900/40 text-green-300 border-green-700/40",
  Transmutation: "bg-orange-900/40 text-orange-300 border-orange-700/40",
};

const ORDINAL: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "5th",
  6: "6th",
  7: "7th",
  8: "8th",
  9: "9th",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function schoolBadge(school: string): string {
  return SCHOOL_COLORS[school] ?? "bg-gray-700/40 text-gray-400 border-gray-600/40";
}

/** Highest spell level the class can access at this level via spell slot table. */
function maxSpellLevel(slotTable: number[][] | undefined, classLevel: number): number {
  if (!slotTable) return 0;
  const row = slotTable[classLevel - 1];
  if (!row) return 0;
  // row index 0 = level 1 slots, index 8 = level 9 slots
  for (let i = 8; i >= 0; i--) {
    if (row[i] > 0) return i + 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Spell card
// ---------------------------------------------------------------------------

interface SpellCardProps {
  spell: SpellDb;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}

function SpellCard({ spell, selected, onToggle, disabled }: SpellCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={[
        "bg-gray-800/30 border rounded px-3 py-2 transition-colors duration-100",
        selected
          ? "border-amber-500/50 bg-amber-500/5"
          : disabled
            ? "border-gray-700/20 opacity-50"
            : "border-gray-700/20 hover:border-gray-600/40",
      ].join(" ")}
    >
      {/* Top row: checkbox + name + school + level */}
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={selected ? `Deselect ${spell.name}` : `Select ${spell.name}`}
          className={[
            "mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors",
            selected
              ? "border-amber-500 bg-amber-500/30"
              : disabled
                ? "border-gray-700/40 bg-gray-800/40 cursor-not-allowed"
                : "border-gray-600 bg-gray-800/60 hover:border-amber-500/60",
          ].join(" ")}
        >
          {selected && (
            <svg
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-2.5 h-2.5 text-amber-400"
            >
              <path d="M1.5 5l2.5 2.5 5-5" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <span
              className={[
                "text-sm font-medium",
                selected ? "text-amber-200" : "text-gray-200",
              ].join(" ")}
            >
              {spell.name}
            </span>
            <span
              className={[
                "inline-flex items-center px-1.5 py-0 rounded text-[10px] border",
                schoolBadge(spell.school),
              ].join(" ")}
            >
              {spell.school}
            </span>
            {spell.level === 0 ? (
              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] border bg-gray-700/30 text-gray-400 border-gray-600/30">
                Cantrip
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] border bg-gray-700/30 text-gray-400 border-gray-600/30">
                Level {spell.level}
              </span>
            )}
            {spell.concentration && (
              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] border bg-teal-900/30 text-teal-400 border-teal-700/30">
                C
              </span>
            )}
            {spell.ritual && (
              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] border bg-violet-900/30 text-violet-400 border-violet-700/30">
                R
              </span>
            )}
          </div>

          {/* Meta line */}
          <p className="text-xs text-gray-500 leading-snug">
            {spell.castingTime} &middot; {spell.range} &middot; {spell.duration}
          </p>
        </div>
      </div>

      {/* Expandable description */}
      <div className="mt-1.5 pl-6">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
          aria-expanded={expanded}
        >
          <svg
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className={["w-2.5 h-2.5 transition-transform", expanded ? "rotate-90" : ""].join(" ")}
          >
            <path d="M2.5 2l5 3-5 3" />
          </svg>
          {expanded ? "Hide" : "Description"}
        </button>
        {expanded && (
          <div className="mt-1.5 text-xs text-gray-400 leading-relaxed">
            <RichText text={spell.description} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Counter badge
// ---------------------------------------------------------------------------

function Counter({ current, max }: { current: number; max: number }) {
  const full = current >= max;
  return (
    <span className={["text-sm font-medium", full ? "text-amber-400" : "text-gray-400"].join(" ")}>
      {current} of {max} selected
    </span>
  );
}

// ---------------------------------------------------------------------------
// Always-prepared badge list
// ---------------------------------------------------------------------------

function AlwaysPreparedBadges({ spellNames }: { spellNames: string[] }) {
  if (spellNames.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-xs text-gray-500">Always Prepared:</span>
      {spellNames.map((name) => (
        <span
          key={name}
          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-violet-900/30 text-violet-300 border border-violet-700/30"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SpellsStep() {
  const { state, dispatch } = useBuilder();

  const [cantripSearch, setCantripSearch] = useState("");
  const [spellSearch, setSpellSearch] = useState("");
  const [activeSpellLevel, setActiveSpellLevel] = useState<SpellLevel>(1);

  // ── Resolve class data ──────────────────────────────────────────────────────
  const classDb = useMemo(
    () => (state.className ? (classesArray.find((c) => c.name === state.className) ?? null) : null),
    [state.className],
  );

  const isCaster = Boolean(classDb?.cantripProgression || classDb?.preparedSpellsProgression);

  const numCantrips = classDb?.cantripProgression?.[state.classLevel - 1] ?? 0;
  const numPrepared = classDb?.preparedSpellsProgression?.[state.classLevel - 1] ?? 0;
  const highestSlotLevel = maxSpellLevel(classDb?.spellSlotTable, state.classLevel);

  // ── Always-prepared spells from subclass additionalSpells ──────────────────
  const alwaysPrepared = useMemo<string[]>(() => {
    if (!classDb || !state.subclass) return [];
    const sub = classDb.subclasses.find((s) => s.name === state.subclass);
    return sub?.additionalSpells ?? [];
  }, [classDb, state.subclass]);

  // ── Spell lists filtered by class ─────────────────────────────────────────
  const className = state.className as ClassName | null;

  const classCantrips = useMemo<SpellDb[]>(() => {
    if (!className) return [];
    return spellsArray
      .filter((s) => s.level === 0 && s.classes.includes(className))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [className]);

  const classSpells = useMemo<SpellDb[]>(() => {
    if (!className) return [];
    return spellsArray
      .filter((s) => s.level > 0 && s.level <= highestSlotLevel && s.classes.includes(className))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [className, highestSlotLevel]);

  // ── Filtered views (search) ────────────────────────────────────────────────
  const filteredCantrips = useMemo<SpellDb[]>(() => {
    const q = cantripSearch.trim().toLowerCase();
    if (!q) return classCantrips;
    return classCantrips.filter((s) => s.name.toLowerCase().includes(q));
  }, [classCantrips, cantripSearch]);

  const filteredSpells = useMemo<SpellDb[]>(() => {
    const q = spellSearch.trim().toLowerCase();
    const levelFiltered = classSpells.filter((s) => s.level === activeSpellLevel);
    if (!q) return levelFiltered;
    return levelFiltered.filter((s) => s.name.toLowerCase().includes(q));
  }, [classSpells, spellSearch, activeSpellLevel]);

  // ── Available spell levels ─────────────────────────────────────────────────
  const availableSpellLevels = useMemo<SpellLevel[]>(() => {
    const levels = new Set<SpellLevel>();
    for (const s of classSpells) levels.add(s.level);
    return (Array.from(levels).sort((a, b) => a - b) as SpellLevel[]).filter((l) => l >= 1);
  }, [classSpells]);

  // Keep activeSpellLevel in bounds when class/level changes
  useEffect(() => {
    if (availableSpellLevels.length > 0 && !availableSpellLevels.includes(activeSpellLevel)) {
      setActiveSpellLevel(availableSpellLevels[0]);
    }
  }, [availableSpellLevels, activeSpellLevel]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function toggleCantrip(name: string) {
    const current = state.cantrips;
    if (current.includes(name)) {
      dispatch({ type: "SET_CANTRIPS", cantrips: current.filter((c) => c !== name) });
    } else if (current.length < numCantrips) {
      dispatch({ type: "SET_CANTRIPS", cantrips: [...current, name] });
    }
  }

  function toggleSpell(name: string) {
    const current = state.preparedSpells;
    if (current.includes(name)) {
      dispatch({ type: "SET_PREPARED_SPELLS", spells: current.filter((s) => s !== name) });
    } else if (current.length < numPrepared) {
      dispatch({ type: "SET_PREPARED_SPELLS", spells: [...current, name] });
    }
  }

  // ── Non-caster ─────────────────────────────────────────────────────────────
  if (!isCaster) {
    return (
      <section aria-labelledby="spells-step-heading" className="flex flex-col gap-6">
        <div>
          <h1
            id="spells-step-heading"
            className="text-xl font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1"
          >
            Spells
          </h1>
          <p className="text-sm text-gray-400">
            {state.className
              ? `${state.className}s do not use spells. Continue to the next step.`
              : "Choose a class first to see spell options."}
          </p>
        </div>

        <div className="bg-gray-800/30 border border-gray-700/20 rounded-lg p-8 text-center">
          <p className="text-gray-600 text-sm font-[family-name:var(--font-cinzel)]">
            No spells available for this class.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="spells-step-heading" className="flex flex-col gap-8">
      {/* ── Header ── */}
      <div>
        <h1
          id="spells-step-heading"
          className="text-xl font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1"
        >
          Choose Your Spells
        </h1>
        <p className="text-sm text-gray-400">
          Select spells for your {state.className} at level {state.classLevel}.
        </p>
      </div>

      {/* ── Always-prepared spells ── */}
      {alwaysPrepared.length > 0 && <AlwaysPreparedBadges spellNames={alwaysPrepared} />}

      {/* ── Cantrips section ── */}
      {numCantrips > 0 && (
        <div className="flex flex-col gap-3">
          {/* Section header + counter */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-[family-name:var(--font-cinzel)] text-amber-200/80">
              Choose {numCantrips} Cantrip{numCantrips !== 1 ? "s" : ""}
            </h2>
            <Counter current={state.cantrips.length} max={numCantrips} />
          </div>

          {/* Search */}
          <input
            type="text"
            value={cantripSearch}
            onChange={(e) => setCantripSearch(e.target.value)}
            placeholder="Search cantrips..."
            className="w-full bg-gray-800/60 border border-gray-700/40 rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
            aria-label="Search cantrips"
          />

          {/* Cantrip grid */}
          {filteredCantrips.length === 0 ? (
            <p className="text-sm text-gray-600 py-4 text-center">No cantrips match your search.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filteredCantrips.map((spell) => {
                const selected = state.cantrips.includes(spell.name);
                const atMax = state.cantrips.length >= numCantrips;
                return (
                  <SpellCard
                    key={spell.name}
                    spell={spell}
                    selected={selected}
                    onToggle={() => toggleCantrip(spell.name)}
                    disabled={!selected && atMax}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Divider between cantrips and prepared spells */}
      {numCantrips > 0 && numPrepared > 0 && (
        <div
          className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"
          aria-hidden="true"
        />
      )}

      {/* ── Prepared spells section ── */}
      {numPrepared > 0 && availableSpellLevels.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* Section header + counter */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-[family-name:var(--font-cinzel)] text-amber-200/80">
              Prepare {numPrepared} Spell{numPrepared !== 1 ? "s" : ""}
            </h2>
            <Counter current={state.preparedSpells.length} max={numPrepared} />
          </div>

          {/* Level tabs */}
          <div
            className="flex gap-0 border-b border-gray-700/40 overflow-x-auto"
            role="tablist"
            aria-label="Spell level"
          >
            {availableSpellLevels.map((level) => {
              const isActive = level === activeSpellLevel;
              const countAtLevel = state.preparedSpells.filter((name) => {
                const spell = spellsArray.find((s) => s.name === name);
                return spell?.level === level;
              }).length;
              return (
                <button
                  key={level}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveSpellLevel(level)}
                  className={[
                    "shrink-0 px-3 py-2 text-sm border-b-2 transition-colors duration-100 flex items-center gap-1.5",
                    isActive
                      ? "border-amber-500 text-amber-400 font-medium"
                      : "border-transparent text-gray-500 hover:text-gray-300",
                  ].join(" ")}
                >
                  {ORDINAL[level] ?? `${level}th`}
                  {countAtLevel > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 text-[10px] flex items-center justify-center font-medium">
                      {countAtLevel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <input
            type="text"
            value={spellSearch}
            onChange={(e) => setSpellSearch(e.target.value)}
            placeholder={`Search ${ORDINAL[activeSpellLevel] ?? `level ${activeSpellLevel}`} spells...`}
            className="w-full bg-gray-800/60 border border-gray-700/40 rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
            aria-label="Search spells"
          />

          {/* Spell grid */}
          {filteredSpells.length === 0 ? (
            <p className="text-sm text-gray-600 py-4 text-center">No spells match your search.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filteredSpells.map((spell) => {
                const selected = state.preparedSpells.includes(spell.name);
                const atMax = state.preparedSpells.length >= numPrepared;
                return (
                  <SpellCard
                    key={spell.name}
                    spell={spell}
                    selected={selected}
                    onToggle={() => toggleSpell(spell.name)}
                    disabled={!selected && atMax}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
