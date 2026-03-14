import { useMemo } from "react";
import { motion } from "framer-motion";
import type { AbilityScores } from "@aidnd/shared/types";
import { getBackground } from "@aidnd/shared/data";
import type { StepProps, AbilityMethod, ASIMode } from "./types";
import {
  STANDARD_ARRAY,
  POINT_BUY_POOL,
  getPointBuyCost,
  getAbilityMod,
  getFinalAbilities,
} from "./utils";
import { ASIAbilityPicker } from "./ASIAbilityPicker";
import { gridItem } from "./animations";

const ABILITY_KEYS: (keyof AbilityScores)[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

const ABILITY_SHORT: Record<keyof AbilityScores, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

const ABILITY_FULL: Record<keyof AbilityScores, string> = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
  charisma: "Charisma",
};

const METHODS: { value: AbilityMethod; label: string }[] = [
  { value: "standard-array", label: "Standard Array" },
  { value: "point-buy", label: "Point Buy" },
  { value: "manual", label: "Manual" },
];

export function StepAbilities({ state, dispatch }: StepProps) {
  const pointsUsed = useMemo(
    () =>
      state.abilityMethod === "point-buy"
        ? getPointBuyCost(state.baseAbilities)
        : 0,
    [state.abilityMethod, state.baseAbilities]
  );

  const finalAbilities = useMemo(() => getFinalAbilities(state), [state]);

  // 2024 PHB: background suggests 3 abilities but player can assign ASI to ANY ability
  const allowedAbilities = undefined;

  // For standard array: track which values have been assigned
  const usedValues = useMemo(() => {
    if (state.abilityMethod !== "standard-array") return new Set<number>();
    return new Set(Object.values(state.baseAbilities).filter((v) => v > 0 && STANDARD_ARRAY.includes(v)));
  }, [state.abilityMethod, state.baseAbilities]);

  const pointBuyOverBudget = pointsUsed > POINT_BUY_POOL;
  const pointBuyPercent = Math.min(100, (pointsUsed / POINT_BUY_POOL) * 100);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-amber-200/90 tracking-wide" style={{ fontFamily: "var(--font-cinzel)" }}>
          Ability Scores
        </h2>
        <p className="text-sm text-gray-500">Set your base ability scores, then apply your background ability score increases.</p>
        <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
      </div>

      {/* Method Tabs */}
      <div className="flex border-b border-gray-700">
        {METHODS.map((m) => (
          <button
            key={m.value}
            onClick={() =>
              dispatch({ type: "SET_ABILITY_METHOD", method: m.value })
            }
            className={`px-4 py-2.5 text-xs font-medium transition-colors ${
              state.abilityMethod === m.value
                ? "text-amber-300 border-b-2 border-amber-400/70"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Point Buy progress bar */}
      {state.abilityMethod === "point-buy" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Points Spent</span>
            <span className={`font-semibold tabular-nums ${pointBuyOverBudget ? "text-red-400" : pointsUsed === POINT_BUY_POOL ? "text-emerald-400" : "text-amber-300"}`}>
              {pointsUsed} / {POINT_BUY_POOL}
            </span>
          </div>
          <div className="h-2.5 w-full bg-gray-800 rounded-full overflow-hidden border border-gray-700/50">
            <motion.div
              className={`h-full rounded-full transition-colors duration-300 ${
                pointBuyOverBudget
                  ? "bg-red-500"
                  : pointsUsed === POINT_BUY_POOL
                  ? "bg-emerald-500"
                  : "bg-amber-500"
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${pointBuyPercent}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
          {pointBuyOverBudget && (
            <p className="text-xs text-red-400">Over budget by {pointsUsed - POINT_BUY_POOL} point{pointsUsed - POINT_BUY_POOL !== 1 ? "s" : ""}. Lower some scores.</p>
          )}
        </div>
      )}

      {/* Standard Array available values */}
      {state.abilityMethod === "standard-array" && (
        <div className="space-y-1.5">
          <div className="text-sm text-gray-500 uppercase tracking-wider">Available Values</div>
          <div className="flex flex-wrap gap-1.5">
            {STANDARD_ARRAY.map((v, i) => {
              const assignedCount = countInArray(Object.values(state.baseAbilities), v);
              const totalCount = countInArray(STANDARD_ARRAY, v);
              const usedCount = Math.min(assignedCount, totalCount);
              // Show one pill per occurrence in the standard array
              return Array.from({ length: totalCount }).map((_, j) => {
                const isUsed = j < usedCount;
                return (
                  <span
                    key={`${v}-${i}-${j}`}
                    className={`inline-flex items-center justify-center w-9 h-7 rounded text-xs font-semibold border transition-all duration-200 ${
                      isUsed
                        ? "bg-gray-800/30 border-gray-700/30 text-gray-600"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    }`}
                  >
                    {v}
                  </span>
                );
              });
            })}
          </div>
        </div>
      )}

      {/* Ability Score Cards */}
      <div className="grid grid-cols-6 gap-2.5">
        {ABILITY_KEYS.map((ability, i) => {
          const baseVal = state.baseAbilities[ability];
          const mod = baseVal > 0 ? getAbilityMod(baseVal) : null;
          const barPercent = Math.min(100, (baseVal / 20) * 100);

          return (
            <motion.div
              key={ability}
              custom={i}
              variants={gridItem}
              initial="initial"
              animate="animate"
              className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-3 text-center flex flex-col gap-2"
            >
              {/* Ability label */}
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wider leading-none">
                {ABILITY_SHORT[ability]}
              </div>

              {/* Input control */}
              {state.abilityMethod === "standard-array" ? (
                <select
                  value={baseVal}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_ABILITY",
                      ability,
                      value: Number(e.target.value),
                    })
                  }
                  className="w-full bg-gray-900 border border-gray-700 rounded px-1 py-1.5 text-center text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                >
                  <option value={0}>--</option>
                  {STANDARD_ARRAY.map((v) => (
                    <option
                      key={v}
                      value={v}
                      disabled={
                        usedValues.has(v) && state.baseAbilities[ability] !== v
                          ? countInArray(Object.values(state.baseAbilities), v) >= countInArray(STANDARD_ARRAY, v)
                          : false
                      }
                    >
                      {v}
                    </option>
                  ))}
                </select>
              ) : state.abilityMethod === "point-buy" ? (
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() =>
                      dispatch({
                        type: "SET_ABILITY",
                        ability,
                        value: Math.max(8, baseVal - 1),
                      })
                    }
                    disabled={baseVal <= 8}
                    className="w-7 h-7 rounded bg-gray-900 text-gray-400 hover:bg-gray-700 hover:text-amber-300 disabled:opacity-30 text-sm font-bold transition-colors"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-sm text-gray-100 font-semibold tabular-nums">
                    {baseVal}
                  </span>
                  <button
                    onClick={() =>
                      dispatch({
                        type: "SET_ABILITY",
                        ability,
                        value: Math.min(15, baseVal + 1),
                      })
                    }
                    disabled={baseVal >= 15}
                    className="w-7 h-7 rounded bg-gray-900 text-gray-400 hover:bg-gray-700 hover:text-amber-300 disabled:opacity-30 text-sm font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
              ) : (
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={baseVal || ""}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_ABILITY",
                      ability,
                      value: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-gray-900 border border-gray-700 rounded px-1 py-1.5 text-center text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
              )}

              {/* Modifier badge */}
              <div className="text-xs font-medium tabular-nums leading-none">
                {mod !== null ? (
                  <span className={mod >= 0 ? "text-amber-300/90" : "text-gray-500"}>
                    {mod >= 0 ? "+" : ""}{mod}
                  </span>
                ) : (
                  <span className="text-gray-700">&nbsp;</span>
                )}
              </div>

              {/* Amber progress bar */}
              <div className="h-1 w-full bg-gray-700/50 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-amber-500/70"
                  initial={{ width: 0 }}
                  animate={{ width: baseVal > 0 ? `${barPercent}%` : "0%" }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Background ASI */}
      <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-gray-200">
              Background Ability Score Increases
            </div>
            <div className="text-sm text-gray-500 mt-0.5">
              PHB 2024: Choose +2/+1 to two different abilities, or +1/+1/+1 to three.
            </div>
          </div>
          {/* ASI mode toggle — larger touch targets */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => dispatch({ type: "SET_ASI_MODE", mode: "two-one" })}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                state.asiMode === "two-one"
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-inner"
                  : "text-gray-500 border border-gray-700 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              +2 / +1
            </button>
            <button
              onClick={() =>
                dispatch({ type: "SET_ASI_MODE", mode: "three-ones" })
              }
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                state.asiMode === "three-ones"
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-inner"
                  : "text-gray-500 border border-gray-700 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              +1 / +1 / +1
            </button>
            {Object.keys(state.asiAssignments).length > 0 && (
              <button
                onClick={() => dispatch({ type: "CLEAR_ASI" })}
                className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <ASIAbilityPickerWrapper
          mode={state.asiMode}
          assignments={state.asiAssignments}
          onChange={(a) => dispatch({ type: "HYDRATE", state: { asiAssignments: a } })}
          allowedAbilities={allowedAbilities}
        />
      </div>

      {/* Final Scores Table */}
      <div className="space-y-2">
        <div className="text-sm text-amber-200/70 font-medium" style={{ fontFamily: "var(--font-cinzel)" }}>
          Final Ability Scores
        </div>
        <div className="bg-gray-900/40 border border-gray-700/40 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 border-b border-gray-700/40 bg-gray-800/40">
            <div className="text-xs text-gray-600 uppercase tracking-wider">Ability</div>
            <div className="text-xs text-gray-600 uppercase tracking-wider text-center w-10">Base</div>
            <div className="text-xs text-gray-600 uppercase tracking-wider text-center w-10">ASI</div>
            <div className="text-xs text-gray-600 uppercase tracking-wider text-center w-12">Total</div>
            <div className="text-xs text-gray-600 uppercase tracking-wider text-center w-10">Mod</div>
          </div>
          {/* Table rows */}
          {ABILITY_KEYS.map((ability, i) => {
            const base = state.baseAbilities[ability];
            const asi = state.asiAssignments[ability] ?? 0;
            const final_ = finalAbilities[ability];
            const mod = getAbilityMod(final_);
            const hasValue = final_ > 0;
            const isEven = i % 2 === 0;

            return (
              <motion.div
                key={ability}
                custom={i}
                variants={gridItem}
                initial="initial"
                animate="animate"
                className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-2 items-center ${
                  isEven ? "bg-transparent" : "bg-gray-800/20"
                }`}
              >
                {/* Ability name */}
                <div className="text-xs text-gray-400">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1.5">
                    {ABILITY_SHORT[ability]}
                  </span>
                  <span className="hidden sm:inline text-gray-600">{ABILITY_FULL[ability]}</span>
                </div>
                {/* Base */}
                <div className="w-10 text-center text-xs text-gray-500 tabular-nums">
                  {base > 0 ? base : "—"}
                </div>
                {/* ASI */}
                <div className="w-10 text-center text-xs tabular-nums">
                  {asi > 0 ? (
                    <span className="text-amber-400/80">+{asi}</span>
                  ) : (
                    <span className="text-gray-700">—</span>
                  )}
                </div>
                {/* Total */}
                <div className="w-12 text-center text-sm font-bold tabular-nums">
                  {hasValue ? (
                    <span className="text-gray-100">{final_}</span>
                  ) : (
                    <span className="text-gray-700">—</span>
                  )}
                </div>
                {/* Modifier — most prominent */}
                <div className="w-10 text-center">
                  {hasValue ? (
                    <span
                      className={`inline-flex items-center justify-center text-xs font-bold tabular-nums rounded px-1.5 py-0.5 ${
                        mod > 0
                          ? "text-amber-300 bg-amber-500/10 border border-amber-500/20"
                          : mod < 0
                          ? "text-red-400 bg-red-500/10 border border-red-500/20"
                          : "text-gray-400 bg-gray-700/40 border border-gray-600/30"
                      }`}
                    >
                      {mod >= 0 ? "+" : ""}{mod}
                    </span>
                  ) : (
                    <span className="text-gray-700 text-xs">—</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ASIAbilityPickerWrapper({
  mode,
  assignments,
  onChange,
  allowedAbilities,
}: {
  mode: ASIMode;
  assignments: Partial<Record<keyof AbilityScores, number>>;
  onChange: (a: Partial<Record<keyof AbilityScores, number>>) => void;
  allowedAbilities?: (keyof AbilityScores)[];
}) {
  return (
    <ASIAbilityPicker
      mode={mode === "two-one" ? "two-one" : "three-ones"}
      assignments={assignments}
      onChange={onChange}
      allowedAbilities={allowedAbilities}
    />
  );
}

function countInArray(arr: number[], val: number): number {
  return arr.filter((v) => v === val).length;
}
