"use client";

import { useMemo, useState } from "react";
import { backgroundsArray, getFeat } from "@unseen-servant/shared/data";
import type { BackgroundDb, FeatDb } from "@unseen-servant/shared/data";
import type { Ability } from "@unseen-servant/shared/types";
import { DetailPopover } from "@/components/character/DetailPopover";
import { EffectSummary } from "@/components/builder/EffectSummary";
import { RichText } from "@/components/ui/RichText";
import { ChoicePicker } from "@/components/builder/ChoicePicker";
import { InfoButton } from "@/components/builder/InfoButton";
import { useBuilder } from "../BuilderContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capitalise first letter only — "intelligence" → "Intelligence" */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function weightLabel(weight: number): string {
  return `+${weight}`;
}

// ---------------------------------------------------------------------------
// Background Detail Popover
// ---------------------------------------------------------------------------

function BackgroundPopover({
  background,
  onClose,
  position,
}: {
  background: BackgroundDb;
  onClose: () => void;
  position: { x: number; y: number };
}) {
  return (
    <DetailPopover title={background.name} onClose={onClose} position={position}>
      <div className="space-y-3">
        {/* Stat badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {background.skills.map((skill) => (
            <span
              key={skill}
              className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-300 border border-emerald-700/30"
            >
              {skill}
            </span>
          ))}
          {background.tools.map((tool) => (
            <span
              key={tool}
              className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-300 border border-blue-700/30"
            >
              {tool}
            </span>
          ))}
          {background.feat && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900/30 text-violet-300 border border-violet-700/30">
              {background.feat}
            </span>
          )}
        </div>

        {/* Effect badges (if present) */}
        {background.effects && <EffectSummary effects={background.effects} />}

        {/* Full description */}
        <div className="text-sm text-gray-300 leading-relaxed">
          <RichText text={background.description} />
        </div>
      </div>
    </DetailPopover>
  );
}

// ---------------------------------------------------------------------------
// Feat Detail Popover
// ---------------------------------------------------------------------------

function FeatPopover({
  feat,
  onClose,
  position,
}: {
  feat: FeatDb;
  onClose: () => void;
  position: { x: number; y: number };
}) {
  return (
    <DetailPopover title={feat.name} onClose={onClose} position={position}>
      <div className="space-y-3">
        {feat.description && (
          <div className="text-sm text-gray-300 leading-relaxed">
            <RichText text={feat.description} />
          </div>
        )}
        {feat.effects && <EffectSummary effects={feat.effects} />}
      </div>
    </DetailPopover>
  );
}

// ---------------------------------------------------------------------------
// Compact Background Card
// ---------------------------------------------------------------------------

function BackgroundCard({
  background,
  isSelected,
  onClick,
  onDetailsClick,
}: {
  background: BackgroundDb;
  isSelected: boolean;
  onClick: () => void;
  onDetailsClick: (e: React.MouseEvent) => void;
}) {
  const skillsText = background.skills.join(", ");
  const toolsText = background.tools.join(", ");

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-4 py-3 rounded-lg border transition-all duration-200
        ${
          isSelected
            ? "border-amber-500/50 bg-amber-950/20 ring-1 ring-amber-500/20"
            : "border-gray-700/30 bg-gray-800/40 hover:border-gray-600/50 hover:bg-gray-800/60"
        }
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`font-[family-name:var(--font-cinzel)] text-sm ${
              isSelected ? "text-amber-200" : "text-gray-200"
            }`}
          >
            {background.name}
          </span>
          <InfoButton onClick={onDetailsClick} />
        </div>
        <div className="flex flex-col items-end gap-0.5 min-w-0">
          {skillsText && <span className="text-xs text-gray-400 text-right">{skillsText}</span>}
          {toolsText && <span className="text-xs text-gray-500 text-right">{toolsText}</span>}
        </div>
      </div>
    </button>
  );
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
// AbilityDropdown
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
// AbilityScoreAssignment
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

  const sortedWeights = useMemo(() => [...weights].sort((a, b) => b - a), [weights]);

  const isThreeOnes = mode === "three-ones";

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

  const weightsAreUniform = sortedWeights.length >= 2 && sortedWeights[0] === sortedWeights[1];

  return (
    <div className="flex flex-col gap-4">
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

      <AbilityModeToggle mode={mode} onChange={onModeChange} />

      {isThreeOnes ? (
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
  const [popover, setPopover] = useState<{
    background: BackgroundDb;
    position: { x: number; y: number };
  } | null>(null);
  const [featPopover, setFeatPopover] = useState<{
    feat: FeatDb;
    position: { x: number; y: number };
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const sortedBackgrounds = useMemo(
    () => [...backgroundsArray].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const filteredBackgrounds = useMemo(() => {
    if (!searchQuery.trim()) return sortedBackgrounds;
    const q = searchQuery.toLowerCase();
    return sortedBackgrounds.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.skills.some((s) => s.toLowerCase().includes(q)) ||
        b.tools.some((t) => t.toLowerCase().includes(q)) ||
        (b.feat && b.feat.toLowerCase().includes(q)),
    );
  }, [sortedBackgrounds, searchQuery]);

  const selectedBg = useMemo<BackgroundDb | null>(() => {
    if (!state.background) return null;
    return sortedBackgrounds.find((b) => b.name === state.background) ?? null;
  }, [state.background, sortedBackgrounds]);

  function handleDetailsClick(background: BackgroundDb, e: React.MouseEvent) {
    setPopover({ background, position: { x: e.clientX, y: e.clientY } });
  }

  function handleToggleSelect(name: string) {
    if (state.background === name) {
      dispatch({ type: "CLEAR_BACKGROUND" });
    } else {
      dispatch({ type: "SET_BACKGROUND", background: name });
      dispatch({ type: "SET_ABILITY_SCORE_MODE", mode: "two-one" });
    }
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

  function handleOriginFeatChoice(choiceId: string, values: string[]) {
    if (!selectedBg?.feat) return;
    dispatch({ type: "SET_FEAT_CHOICE", featName: selectedBg.feat, choiceId, values });
  }

  const originFeat = useMemo(() => {
    if (!selectedBg?.feat) return null;
    return getFeat(selectedBg.feat) ?? null;
  }, [selectedBg]);

  return (
    <section aria-labelledby="background-step-heading" className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1
          id="background-step-heading"
          className="text-xl font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1"
        >
          Choose Your Background
        </h1>
        <p className="text-sm text-gray-400">
          Your background reflects your life before adventuring — skills, tools, and a feat that
          shapes who you are. Click a card to select it, or use the info icon to view full details.
        </p>
      </div>

      {/* Selected banner */}
      {selectedBg && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-950/15">
          <span className="text-sm text-amber-200 font-medium">✓ {selectedBg.name}</span>
          <span className="text-xs text-gray-500">
            {selectedBg.skills.join(", ")}
            {selectedBg.tools.length > 0 ? ` · ${selectedBg.tools.join(", ")}` : ""}
          </span>
          <div className="flex-1" />
          <button
            onClick={(e) => handleDetailsClick(selectedBg, e)}
            className="text-xs text-amber-400/70 hover:text-amber-300 transition-colors"
          >
            View Details
          </button>
          <button
            onClick={() => dispatch({ type: "CLEAR_BACKGROUND" })}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Change
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search backgrounds..."
          className="w-full pl-9 pr-4 py-2.5 bg-gray-800/60 border border-gray-700/40 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:border-amber-500/50 focus:outline-none transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            ✕
          </button>
        )}
      </div>

      {/* Compact grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filteredBackgrounds.map((bg) => (
          <BackgroundCard
            key={bg.name}
            background={bg}
            isSelected={state.background === bg.name}
            onClick={() => handleToggleSelect(bg.name)}
            onDetailsClick={(e) => handleDetailsClick(bg, e)}
          />
        ))}
        {filteredBackgrounds.length === 0 && (
          <p className="col-span-full text-center text-gray-500 text-sm py-6">
            No backgrounds match your search.
          </p>
        )}
      </div>

      <p className="text-xs text-gray-600 text-center">
        {sortedBackgrounds.length} backgrounds available
      </p>

      {/* Configuration section */}
      {selectedBg && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

          <div>
            <h2 className="text-lg font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1">
              Configure {selectedBg.name}
            </h2>
            <p className="text-sm text-gray-400">
              Distribute your ability score bonuses and make any background choices.
            </p>
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

          {/* Background choices */}
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

          {/* Origin feat — always shown when background has a feat */}
          {originFeat && (
            <div className="flex flex-col gap-3">
              <div className="h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
              <div className="flex items-center gap-2">
                <h3
                  className="text-sm font-semibold text-violet-400/90 uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-cinzel)" }}
                >
                  Origin Feat: {originFeat.name}
                </h3>
                <InfoButton
                  onClick={(e) =>
                    setFeatPopover({ feat: originFeat, position: { x: e.clientX, y: e.clientY } })
                  }
                />
              </div>

              {/* Feat description */}
              {originFeat.description && (
                <div className="bg-gray-800/30 border border-violet-700/20 rounded-lg p-4">
                  <div className="text-sm text-gray-300 leading-relaxed">
                    <RichText text={originFeat.description} />
                  </div>
                  {originFeat.effects && (
                    <div className="mt-3">
                      <EffectSummary effects={originFeat.effects} />
                    </div>
                  )}
                </div>
              )}

              {/* Feat choices (if any) */}
              {(originFeat.choices?.length ?? 0) > 0 && (
                <>
                  <p className="text-xs text-gray-500">
                    Configure the choices granted by{" "}
                    <span className="text-violet-300">{originFeat.name}</span> here.
                  </p>
                  {(originFeat.choices ?? []).map((choice) => (
                    <ChoicePicker
                      key={choice.id}
                      choice={choice}
                      selected={state.featChoices[originFeat.name]?.[choice.id] ?? []}
                      onSelect={(values) => handleOriginFeatChoice(choice.id, values)}
                      disabled={false}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Popovers */}
      {popover && (
        <BackgroundPopover
          background={popover.background}
          onClose={() => setPopover(null)}
          position={popover.position}
        />
      )}
      {featPopover && (
        <FeatPopover
          feat={featPopover.feat}
          onClose={() => setFeatPopover(null)}
          position={featPopover.position}
        />
      )}
    </section>
  );
}
