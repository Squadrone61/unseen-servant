"use client";

import { useMemo } from "react";
import type { AbilityScores } from "@unseen-servant/shared/types";
import { useBuilder } from "../BuilderContext";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ABILITY_KEYS: (keyof AbilityScores)[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

const ABILITY_LABELS: Record<keyof AbilityScores, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

/** Values available in standard array — sorted descending for display. */
const STANDARD_ARRAY_VALUES = [15, 14, 13, 12, 10, 8];

/**
 * Point buy cost per score value (8–15).
 * Index = score - 8, so index 0 = score 8 costs 0, index 7 = score 15 costs 9.
 */
const POINT_BUY_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

const POINT_BUY_BUDGET = 27;
const POINT_BUY_MIN = 8;
const POINT_BUY_MAX = 15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function formatMod(score: number): string {
  const m = mod(score);
  return m >= 0 ? `+${m}` : `${m}`;
}

// ---------------------------------------------------------------------------
// Method selector
// ---------------------------------------------------------------------------

type AbilityMethod = "standard-array" | "point-buy" | "manual";

interface MethodSelectorProps {
  method: AbilityMethod;
  onChange: (method: AbilityMethod) => void;
}

const METHOD_OPTIONS: { value: AbilityMethod; label: string; hint: string }[] = [
  {
    value: "standard-array",
    label: "Standard Array",
    hint: "Assign the fixed set: 15, 14, 13, 12, 10, 8",
  },
  { value: "point-buy", label: "Point Buy", hint: "Spend 27 points to customise your scores" },
  { value: "manual", label: "Manual", hint: "Enter any values directly" },
];

function MethodSelector({ method, onChange }: MethodSelectorProps) {
  return (
    <div
      className="flex gap-2 flex-wrap"
      role="radiogroup"
      aria-label="Ability score generation method"
    >
      {METHOD_OPTIONS.map((opt) => {
        const selected = method === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            className={[
              "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
              selected
                ? "border-amber-500/50 bg-amber-900/20 text-amber-200"
                : "border-gray-600/40 bg-gray-800/40 text-gray-400 hover:border-gray-500/60 hover:text-gray-200 cursor-pointer",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/* Radio dot */}
            <span
              aria-hidden="true"
              className={[
                "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                selected ? "border-amber-400" : "border-gray-600",
              ].join(" ")}
            >
              {selected && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />
              )}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standard Array allocator
// ---------------------------------------------------------------------------

interface StandardArrayAllocatorProps {
  bases: AbilityScores;
  bgBonuses: Partial<Record<keyof AbilityScores, number>>;
  onChange: (abilities: AbilityScores) => void;
}

function StandardArrayAllocator({ bases, bgBonuses, onChange }: StandardArrayAllocatorProps) {
  // Track which value is assigned to which ability
  const _usedValues = Object.values(bases) as number[];

  function handleChange(ability: keyof AbilityScores, value: number) {
    onChange({ ...bases, [ability]: value });
  }

  return (
    <div className="flex flex-col gap-2">
      {ABILITY_KEYS.map((ability) => {
        const base = bases[ability];
        const bg = bgBonuses[ability] ?? 0;
        const final = base + bg;

        // Options for this dropdown: all SA values; mark as "taken" if used elsewhere
        const availableOptions = STANDARD_ARRAY_VALUES.map((v) => {
          const takenByOther = ABILITY_KEYS.filter((a) => a !== ability).some(
            (a) => bases[a] === v,
          );
          return { value: v, disabled: takenByOther };
        });

        return (
          <div
            key={ability}
            className="flex items-center gap-3 bg-gray-800/40 border border-gray-700/30 rounded-lg px-4 py-3"
          >
            {/* Ability name */}
            <span className="font-medium text-gray-300 w-10 shrink-0 text-sm">
              {ABILITY_LABELS[ability]}
            </span>

            {/* Base score dropdown */}
            <select
              value={base}
              onChange={(e) => handleChange(ability, Number(e.target.value))}
              aria-label={`${ABILITY_LABELS[ability]} base score`}
              className="bg-gray-900/60 border border-gray-700/40 rounded px-2 py-1 w-16 text-center text-sm text-gray-200 focus:outline-none focus:border-amber-500/50 transition-colors"
              style={{ colorScheme: "dark" }}
            >
              {availableOptions.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.value}
                </option>
              ))}
            </select>

            {/* Base modifier */}
            <span className="text-gray-500 text-sm w-8 text-center" aria-hidden="true">
              {formatMod(base)}
            </span>

            {/* Background bonus */}
            {bg !== 0 ? (
              <span className="text-amber-400/80 text-xs w-12 text-center">+{bg} bg</span>
            ) : (
              <span className="w-12" aria-hidden="true" />
            )}

            {/* Arrow */}
            <span className="text-gray-600 text-xs" aria-hidden="true">
              =
            </span>

            {/* Final score */}
            <span
              className="text-amber-200 font-semibold w-8 text-center"
              aria-label={`Final ${ABILITY_LABELS[ability]}`}
            >
              {final}
            </span>

            {/* Final modifier */}
            <span className="text-gray-400 text-sm w-10 text-center">({formatMod(final)})</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Point Buy allocator
// ---------------------------------------------------------------------------

interface PointBuyAllocatorProps {
  bases: AbilityScores;
  bgBonuses: Partial<Record<keyof AbilityScores, number>>;
  onChange: (abilities: AbilityScores) => void;
}

function PointBuyAllocator({ bases, bgBonuses, onChange }: PointBuyAllocatorProps) {
  const spent = useMemo(() => {
    return (Object.values(bases) as number[]).reduce((sum, score) => {
      return sum + (POINT_BUY_COSTS[score] ?? 0);
    }, 0);
  }, [bases]);

  const remaining = POINT_BUY_BUDGET - spent;

  function canIncrease(ability: keyof AbilityScores): boolean {
    const current = bases[ability];
    if (current >= POINT_BUY_MAX) return false;
    const nextCost = POINT_BUY_COSTS[current + 1] - POINT_BUY_COSTS[current];
    return remaining >= nextCost;
  }

  function canDecrease(ability: keyof AbilityScores): boolean {
    return bases[ability] > POINT_BUY_MIN;
  }

  function handleIncrease(ability: keyof AbilityScores) {
    if (!canIncrease(ability)) return;
    onChange({ ...bases, [ability]: bases[ability] + 1 });
  }

  function handleDecrease(ability: keyof AbilityScores) {
    if (!canDecrease(ability)) return;
    onChange({ ...bases, [ability]: bases[ability] - 1 });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Points counter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Points remaining:</span>
        <span
          className={[
            "text-sm font-semibold tabular-nums",
            remaining > 0
              ? "text-amber-400"
              : remaining === 0
                ? "text-emerald-400"
                : "text-red-400",
          ].join(" ")}
          aria-live="polite"
          aria-label={`${remaining} points remaining`}
        >
          {remaining}
        </span>
        <span className="text-xs text-gray-600">/ {POINT_BUY_BUDGET}</span>
      </div>

      <div className="flex flex-col gap-2">
        {ABILITY_KEYS.map((ability) => {
          const base = bases[ability];
          const bg = bgBonuses[ability] ?? 0;
          const final = base + bg;
          const cost = POINT_BUY_COSTS[base] ?? 0;

          return (
            <div
              key={ability}
              className="flex items-center gap-3 bg-gray-800/40 border border-gray-700/30 rounded-lg px-4 py-3"
            >
              {/* Ability name */}
              <span className="font-medium text-gray-300 w-10 shrink-0 text-sm">
                {ABILITY_LABELS[ability]}
              </span>

              {/* Decrement */}
              <button
                type="button"
                onClick={() => handleDecrease(ability)}
                disabled={!canDecrease(ability)}
                aria-label={`Decrease ${ABILITY_LABELS[ability]}`}
                className={[
                  "w-6 h-6 rounded flex items-center justify-center text-sm border transition-colors",
                  canDecrease(ability)
                    ? "border-gray-600/60 bg-gray-700/40 text-gray-300 hover:border-gray-500/80 hover:text-gray-100"
                    : "border-gray-700/30 bg-gray-800/20 text-gray-700 cursor-not-allowed",
                ].join(" ")}
              >
                −
              </button>

              {/* Base score */}
              <span className="bg-gray-900/60 border border-gray-700/40 rounded px-2 py-1 w-10 text-center text-sm text-gray-200 tabular-nums">
                {base}
              </span>

              {/* Increment */}
              <button
                type="button"
                onClick={() => handleIncrease(ability)}
                disabled={!canIncrease(ability)}
                aria-label={`Increase ${ABILITY_LABELS[ability]}`}
                className={[
                  "w-6 h-6 rounded flex items-center justify-center text-sm border transition-colors",
                  canIncrease(ability)
                    ? "border-gray-600/60 bg-gray-700/40 text-gray-300 hover:border-gray-500/80 hover:text-gray-100"
                    : "border-gray-700/30 bg-gray-800/20 text-gray-700 cursor-not-allowed",
                ].join(" ")}
              >
                +
              </button>

              {/* Cost badge */}
              <span className="text-gray-600 text-xs w-10 text-center">{cost}pt</span>

              {/* Base modifier */}
              <span className="text-gray-500 text-sm w-8 text-center" aria-hidden="true">
                {formatMod(base)}
              </span>

              {/* Background bonus */}
              {bg !== 0 ? (
                <span className="text-amber-400/80 text-xs w-12 text-center">+{bg} bg</span>
              ) : (
                <span className="w-12" aria-hidden="true" />
              )}

              {/* Arrow */}
              <span className="text-gray-600 text-xs" aria-hidden="true">
                =
              </span>

              {/* Final score */}
              <span
                className="text-amber-200 font-semibold w-8 text-center"
                aria-label={`Final ${ABILITY_LABELS[ability]}`}
              >
                {final}
              </span>

              {/* Final modifier */}
              <span className="text-gray-400 text-sm w-10 text-center">({formatMod(final)})</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual allocator
// ---------------------------------------------------------------------------

interface ManualAllocatorProps {
  bases: AbilityScores;
  bgBonuses: Partial<Record<keyof AbilityScores, number>>;
  onChange: (abilities: AbilityScores) => void;
}

function ManualAllocator({ bases, bgBonuses, onChange }: ManualAllocatorProps) {
  function handleChange(ability: keyof AbilityScores, raw: string) {
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) return;
    const clamped = Math.max(1, Math.min(30, parsed));
    onChange({ ...bases, [ability]: clamped });
  }

  return (
    <div className="flex flex-col gap-2">
      {ABILITY_KEYS.map((ability) => {
        const base = bases[ability];
        const bg = bgBonuses[ability] ?? 0;
        const final = base + bg;

        return (
          <div
            key={ability}
            className="flex items-center gap-3 bg-gray-800/40 border border-gray-700/30 rounded-lg px-4 py-3"
          >
            {/* Ability name */}
            <span className="font-medium text-gray-300 w-10 shrink-0 text-sm">
              {ABILITY_LABELS[ability]}
            </span>

            {/* Free input */}
            <input
              type="number"
              min={1}
              max={30}
              value={base}
              onChange={(e) => handleChange(ability, e.target.value)}
              aria-label={`${ABILITY_LABELS[ability]} score`}
              className="bg-gray-900/60 border border-gray-700/40 rounded px-2 py-1 w-16 text-center text-sm text-gray-200 focus:outline-none focus:border-amber-500/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />

            {/* Base modifier */}
            <span className="text-gray-500 text-sm w-8 text-center" aria-hidden="true">
              {formatMod(base)}
            </span>

            {/* Background bonus */}
            {bg !== 0 ? (
              <span className="text-amber-400/80 text-xs w-12 text-center">+{bg} bg</span>
            ) : (
              <span className="w-12" aria-hidden="true" />
            )}

            {/* Arrow */}
            <span className="text-gray-600 text-xs" aria-hidden="true">
              =
            </span>

            {/* Final score */}
            <span
              className="text-amber-200 font-semibold w-8 text-center"
              aria-label={`Final ${ABILITY_LABELS[ability]}`}
            >
              {final}
            </span>

            {/* Final modifier */}
            <span className="text-gray-400 text-sm w-10 text-center">({formatMod(final)})</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AbilitiesStep
// ---------------------------------------------------------------------------

export function AbilitiesStep() {
  const { state, dispatch } = useBuilder();

  const bgBonuses = state.abilityScoreAssignments as Partial<Record<keyof AbilityScores, number>>;

  function handleMethodChange(method: "standard-array" | "point-buy" | "manual") {
    dispatch({ type: "SET_ABILITY_METHOD", method });
    // Reset bases to the method's starting values
    if (method === "standard-array") {
      // Assign standard array in order as default
      dispatch({
        type: "SET_BASE_ABILITIES",
        abilities: {
          strength: 15,
          dexterity: 14,
          constitution: 13,
          intelligence: 12,
          wisdom: 10,
          charisma: 8,
        },
      });
    } else if (method === "point-buy") {
      dispatch({
        type: "SET_BASE_ABILITIES",
        abilities: {
          strength: 8,
          dexterity: 8,
          constitution: 8,
          intelligence: 8,
          wisdom: 8,
          charisma: 8,
        },
      });
    }
    // Manual: keep existing values so nothing is lost on accidental toggle
  }

  function handleAbilitiesChange(abilities: AbilityScores) {
    dispatch({ type: "SET_BASE_ABILITIES", abilities });
  }

  return (
    <section aria-labelledby="abilities-step-heading" className="flex flex-col gap-6">
      {/* Section header */}
      <div>
        <h1
          id="abilities-step-heading"
          className="text-xl font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1"
        >
          Ability Scores
        </h1>
        <p className="text-sm text-gray-400">
          Your six ability scores define your physical and mental capabilities. Background bonuses
          are applied automatically.
        </p>
      </div>

      {/* Method selector */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Generation Method
        </span>
        <MethodSelector method={state.abilityMethod} onChange={handleMethodChange} />
      </div>

      {/* Divider */}
      <div
        className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"
        aria-hidden="true"
      />

      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 text-xs text-gray-600 uppercase tracking-wider">
        <span className="w-10 shrink-0">Ability</span>
        {state.abilityMethod === "point-buy" ? (
          <>
            <span className="w-6" aria-hidden="true" />
            <span className="w-10 text-center">Base</span>
            <span className="w-6" aria-hidden="true" />
            <span className="w-10 text-center">Cost</span>
            <span className="w-8 text-center">Mod</span>
            <span className="w-12 text-center">Bg</span>
            <span className="w-4" aria-hidden="true" />
            <span className="w-8 text-center">Final</span>
            <span className="w-10 text-center">Mod</span>
          </>
        ) : (
          <>
            <span className="w-16 text-center">Base</span>
            <span className="w-8 text-center">Mod</span>
            <span className="w-12 text-center">Bg</span>
            <span className="w-4" aria-hidden="true" />
            <span className="w-8 text-center">Final</span>
            <span className="w-10 text-center">Mod</span>
          </>
        )}
      </div>

      {/* Allocator */}
      {state.abilityMethod === "standard-array" && (
        <StandardArrayAllocator
          bases={state.baseAbilities}
          bgBonuses={bgBonuses}
          onChange={handleAbilitiesChange}
        />
      )}
      {state.abilityMethod === "point-buy" && (
        <PointBuyAllocator
          bases={state.baseAbilities}
          bgBonuses={bgBonuses}
          onChange={handleAbilitiesChange}
        />
      )}
      {state.abilityMethod === "manual" && (
        <ManualAllocator
          bases={state.baseAbilities}
          bgBonuses={bgBonuses}
          onChange={handleAbilitiesChange}
        />
      )}

      {/* Legend */}
      <p className="text-xs text-gray-600">
        Scores shown are base values. Background bonuses (+bg) are added to produce your final
        score. The game engine applies the final totals.
      </p>
    </section>
  );
}
