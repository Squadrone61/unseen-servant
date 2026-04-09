"use client";

import { useMemo } from "react";
import { backgroundsArray } from "@unseen-servant/shared/data";
import type { BackgroundDb } from "@unseen-servant/shared/types";
import type { Ability } from "@unseen-servant/shared/types";
import { EntityCard } from "@/components/builder/EntityCard";
import { EntityGrid } from "@/components/builder/EntityGrid";
import { ChoicePicker } from "@/components/builder/ChoicePicker";
import { useBuilder } from "../BuilderContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capitalise first letter only — "intelligence" → "Intelligence" */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Returns the weight label for a given weight value, given the full weights
 * array. Assumes the common patterns [2,1] or [1,1,1].
 */
function weightLabel(weight: number): string {
  return `+${weight}`;
}

// ---------------------------------------------------------------------------
// AbilityModeToggle — radio pill selector for the two distribution modes
// ---------------------------------------------------------------------------

interface AbilityModeToggleProps {
  mode: "two-one" | "three-ones";
  onChange: (mode: "two-one" | "three-ones") => void;
}

function AbilityModeToggle({ mode, onChange }: AbilityModeToggleProps) {
  const options: { value: "two-one" | "three-ones"; label: string; hint: string }[] = [
    { value: "two-one", label: "+2 / +1", hint: "One ability gets +2, another gets +1" },
    {
      value: "three-ones",
      label: "+1 / +1 / +1",
      hint: "All three eligible abilities each get +1",
    },
  ];

  return (
    <div className="flex gap-2" role="radiogroup" aria-label="Ability score distribution mode">
      {options.map((opt) => {
        const selected = mode === opt.value;
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
// AbilityDropdown — single dropdown constrained to the `from` ability list,
// excluding whatever the other dropdown has already picked.
// ---------------------------------------------------------------------------

interface AbilityDropdownProps {
  id: string;
  label: string;
  value: Ability | null;
  options: Ability[];
  excluded: Ability[];
  onChange: (ability: Ability) => void;
}

function AbilityDropdown({ id, label, value, options, excluded, onChange }: AbilityDropdownProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-gray-400">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value as Ability)}
        className={[
          "bg-gray-800/60 border rounded-lg px-3 py-2 text-sm transition-colors",
          "focus:outline-none focus:border-amber-500/50",
          value ? "border-amber-500/40 text-gray-200" : "border-gray-600/40 text-gray-500",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={label}
      >
        <option value="" disabled>
          Choose ability...
        </option>
        {options.map((ability) => {
          const isExcluded = excluded.includes(ability) && ability !== value;
          return (
            <option key={ability} value={ability} disabled={isExcluded}>
              {cap(ability)}
            </option>
          );
        })}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AbilityScoreAssignment — the full sub-panel shown after a background is
// selected. Handles both "two-one" and "three-ones" modes.
// ---------------------------------------------------------------------------

interface AbilityScoreAssignmentProps {
  background: BackgroundDb;
  mode: "two-one" | "three-ones";
  assignments: Partial<Record<Ability, number>>;
  onModeChange: (mode: "two-one" | "three-ones") => void;
  onAssignmentsChange: (assignments: Partial<Record<Ability, number>>) => void;
}

function AbilityScoreAssignment({
  background,
  mode,
  assignments,
  onModeChange,
  onAssignmentsChange,
}: AbilityScoreAssignmentProps) {
  const { from, weights } = background.abilityScores;

  // Determine the sorted weight slots for "two-one" mode.
  // Weights are sorted descending so index 0 = largest weight (+2), index 1 = smaller (+1).
  const sortedWeights = useMemo(() => [...weights].sort((a, b) => b - a), [weights]);

  // For "three-ones" mode: every ability in `from` gets +1, no selection needed.
  const isThreeOnes = mode === "three-ones";

  // For two-one mode: which ability has the +2 and which has the +1?
  // Derivation: iterate assignment entries by insertion order.
  const assignedEntries = useMemo(
    () => Object.entries(assignments) as [Ability, number][],
    [assignments],
  );
  const plusTwoEntry = assignedEntries.find(([, v]) => v === sortedWeights[0]);
  const plusOneEntry = assignedEntries.find(
    ([k, v]) => v === sortedWeights[1] && k !== plusTwoEntry?.[0],
  );
  const derivedPlusTwo: Ability | null = plusTwoEntry ? plusTwoEntry[0] : null;
  const derivedPlusOne: Ability | null = plusOneEntry ? plusOneEntry[0] : null;

  function handlePlusTwoChange(ability: Ability) {
    const newAssignments: Partial<Record<Ability, number>> = {};
    newAssignments[ability] = sortedWeights[0];
    // Preserve the +1 if it was already set and is different from the new +2 pick
    if (derivedPlusOne && derivedPlusOne !== ability) {
      newAssignments[derivedPlusOne] = sortedWeights[1];
    }
    onAssignmentsChange(newAssignments);
  }

  function handlePlusOneChange(ability: Ability) {
    const newAssignments: Partial<Record<Ability, number>> = {};
    if (derivedPlusTwo) {
      newAssignments[derivedPlusTwo] = sortedWeights[0];
    }
    newAssignments[ability] = sortedWeights[1];
    onAssignmentsChange(newAssignments);
  }

  // Determine if two-one weights are identical (e.g. both +1 rather than +2/+1).
  // In that edge case we skip the dual dropdown since any ordering works.
  const weightsAreUniform = sortedWeights.length >= 2 && sortedWeights[0] === sortedWeights[1];

  return (
    <div className="flex flex-col gap-4">
      {/* Section header */}
      <div>
        <h3
          className="text-sm font-semibold text-amber-400/90 uppercase tracking-wider"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Ability Score Distribution
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Your background grants bonuses from:{" "}
          <span className="text-gray-400">{from.map(cap).join(", ")}</span>
        </p>
      </div>

      {/* Mode toggle */}
      <AbilityModeToggle mode={mode} onChange={onModeChange} />

      {/* Assignment UI */}
      {isThreeOnes ? (
        /* Three-ones: no interaction needed — show the fixed distribution */
        <div className="flex flex-wrap gap-2" aria-label="Automatic +1 distribution">
          {from.map((ability) => (
            <span
              key={ability}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600/30 bg-emerald-900/15 text-emerald-300 text-sm"
            >
              <svg
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M1.5 5l2.5 2.5 4.5-4.5" />
              </svg>
              {cap(ability)} <span className="text-emerald-400/80 font-medium">+1</span>
            </span>
          ))}
        </div>
      ) : weightsAreUniform ? (
        /* Uniform weights (e.g. +1/+1) — same treatment as three-ones */
        <div className="flex flex-wrap gap-2" aria-label="Automatic distribution">
          {from.slice(0, 2).map((ability) => (
            <span
              key={ability}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-600/30 bg-amber-900/10 text-amber-300 text-sm"
            >
              {cap(ability)}{" "}
              <span className="text-amber-400/80 font-medium">{weightLabel(sortedWeights[0])}</span>
            </span>
          ))}
        </div>
      ) : (
        /* Standard two-one: two dropdowns */
        <div className="flex flex-wrap gap-4 items-end">
          <AbilityDropdown
            id="ability-plus-two"
            label={`Gets ${weightLabel(sortedWeights[0])}`}
            value={derivedPlusTwo}
            options={from}
            excluded={derivedPlusOne ? [derivedPlusOne] : []}
            onChange={handlePlusTwoChange}
          />
          <AbilityDropdown
            id="ability-plus-one"
            label={`Gets ${weightLabel(sortedWeights[1])}`}
            value={derivedPlusOne}
            options={from}
            excluded={derivedPlusTwo ? [derivedPlusTwo] : []}
            onChange={handlePlusOneChange}
          />
          {/* Live preview chips once both are assigned */}
          {derivedPlusTwo && derivedPlusOne && (
            <div className="flex items-center gap-2 pb-0.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-900/10 text-amber-300 text-xs font-medium">
                {cap(derivedPlusTwo)} {weightLabel(sortedWeights[0])}
              </span>
              <span className="text-gray-600 text-xs">+</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-900/10 text-amber-300 text-xs font-medium">
                {cap(derivedPlusOne)} {weightLabel(sortedWeights[1])}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BackgroundStep — main exported component
// ---------------------------------------------------------------------------

export function BackgroundStep() {
  const { state, dispatch } = useBuilder();

  const selectedBg = useMemo<BackgroundDb | null>(() => {
    if (!state.background) return null;
    return backgroundsArray.find((b) => b.name === state.background) ?? null;
  }, [state.background]);

  function handleSelect(name: string) {
    // Toggle off if re-clicking the same background
    if (state.background === name) return;
    dispatch({ type: "SET_BACKGROUND", background: name });
    // Reset mode to default when background changes (reducer handles this too, but be explicit)
    dispatch({ type: "SET_ABILITY_SCORE_MODE", mode: "two-one" });
  }

  function handleModeChange(mode: "two-one" | "three-ones") {
    dispatch({ type: "SET_ABILITY_SCORE_MODE", mode });
  }

  function handleAssignmentsChange(assignments: Partial<Record<Ability, number>>) {
    dispatch({ type: "SET_ABILITY_SCORE_ASSIGNMENT", assignments });
  }

  function handleBackgroundChoice(choiceId: string, values: string[]) {
    dispatch({ type: "SET_BACKGROUND_CHOICE", choiceId, values });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Step heading */}
      <div>
        <h2
          className="text-xl font-semibold text-gray-100"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Choose Your Background
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Your background reflects your life before adventuring — skills, connections, and a feat
          that shapes who you are.
        </p>
      </div>

      {/* Divider */}
      <div className="h-px bg-gray-700/40" />

      {/* Grid */}
      <EntityGrid
        items={backgroundsArray}
        selected={state.background}
        onSelect={handleSelect}
        searchable
        searchPlaceholder="Search backgrounds..."
        renderCard={(bg: BackgroundDb, isSelected: boolean) => {
          const stats: string[] = [];
          if (bg.skills.length > 0) stats.push(bg.skills.join(", "));
          if (bg.tools.length > 0) stats.push(bg.tools.join(", "));

          const tags: { label: string; color?: string }[] = [];
          if (bg.feat) {
            tags.push({
              label: bg.feat,
              color: "bg-violet-900/30 text-violet-300 border-violet-600/30",
            });
          }

          return (
            <EntityCard
              name={bg.name}
              description={bg.description}
              stats={stats.length > 0 ? stats : undefined}
              tags={tags.length > 0 ? tags : undefined}
              selected={isSelected}
              expandable
            />
          );
        }}
      />

      {/* Post-selection panel */}
      {selectedBg && (
        <div className="flex flex-col gap-6">
          {/* Divider with label */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-700/40" />
            <span
              className="text-xs font-medium text-amber-400/70 uppercase tracking-widest"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Configure {selectedBg.name}
            </span>
            <div className="h-px flex-1 bg-gray-700/40" />
          </div>

          {/* Ability score assignment */}
          <section
            className="bg-gray-800/30 border border-gray-700/20 rounded-lg p-5"
            aria-label="Ability score distribution"
          >
            <AbilityScoreAssignment
              background={selectedBg}
              mode={state.abilityScoreMode}
              assignments={state.abilityScoreAssignments}
              onModeChange={handleModeChange}
              onAssignmentsChange={handleAssignmentsChange}
            />
          </section>

          {/* Background choices (tool proficiency picks, etc.) */}
          {selectedBg.choices && selectedBg.choices.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3
                className="text-sm font-semibold text-amber-400/90 uppercase tracking-wider"
                style={{ fontFamily: "var(--font-cinzel)" }}
              >
                Background Choices
              </h3>
              {selectedBg.choices.map((choice) => (
                <ChoicePicker
                  key={choice.id}
                  choice={choice}
                  selected={state.backgroundChoices[choice.id] ?? []}
                  onSelect={(values) => handleBackgroundChoice(choice.id, values)}
                  disabled={false}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
