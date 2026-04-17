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
        <div className="flex flex-wrap items-center gap-2">
          {(background.effects?.properties ?? [])
            .filter((p) => p.type === "proficiency" && p.category === "skill")
            .map((p) => (
              <span
                key={(p as { value: string }).value}
                className="rounded-full border border-emerald-700/30 bg-emerald-900/30 px-2 py-0.5 text-xs text-emerald-300"
              >
                {(p as { value: string }).value}
              </span>
            ))}
          {(background.effects?.properties ?? [])
            .filter((p) => p.type === "proficiency" && p.category === "tool")
            .map((p) => (
              <span
                key={(p as { value: string }).value}
                className="rounded-full border border-blue-700/30 bg-blue-900/30 px-2 py-0.5 text-xs text-blue-300"
              >
                {(p as { value: string }).value}
              </span>
            ))}
          {background.feat && (
            <span className="rounded-full border border-violet-700/30 bg-violet-900/30 px-2 py-0.5 text-xs text-violet-300">
              {background.feat}
            </span>
          )}
        </div>

        {/* Effect badges (if present) */}
        {background.effects && <EffectSummary effects={background.effects} />}

        {/* Full description */}
        <div className="text-sm leading-relaxed text-gray-300">
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
          <div className="text-sm leading-relaxed text-gray-300">
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
  const skillsText = (background.effects?.properties ?? [])
    .filter((p) => p.type === "proficiency" && p.category === "skill")
    .map((p) => (p as { value: string }).value)
    .join(", ");
  const toolsText = (background.effects?.properties ?? [])
    .filter((p) => p.type === "proficiency" && p.category === "tool")
    .map((p) => (p as { value: string }).value)
    .join(", ");

  return (
    <button
      onClick={onClick}
      className={`
        w-full rounded-lg border px-4 py-3 text-left transition-all duration-200
        ${
          isSelected
            ? "border-amber-500/50 bg-amber-950/20 ring-1 ring-amber-500/20"
            : "border-gray-700/30 bg-gray-800/40 hover:border-gray-600/50 hover:bg-gray-800/60"
        }
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`font-cinzel text-sm ${isSelected ? "text-amber-200" : "text-gray-200"}`}
          >
            {background.name}
          </span>
          <InfoButton onClick={onDetailsClick} />
        </div>
        <div className="flex min-w-0 flex-col items-end gap-0.5">
          {skillsText && <span className="text-right text-xs text-gray-400">{skillsText}</span>}
          {toolsText && <span className="text-right text-xs text-gray-500">{toolsText}</span>}
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
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
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
          className="text-sm font-semibold tracking-wider text-amber-400/90 uppercase"
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-900/15 px-3 py-1.5 text-sm text-emerald-300"
            >
              <svg
                className="h-3.5 w-3.5 shrink-0"
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
              {cap(ability)} <span className="font-medium text-emerald-400/80">+1</span>
            </span>
          ))}
        </div>
      ) : weightsAreUniform ? (
        <div className="flex flex-wrap gap-2" aria-label="Automatic distribution">
          {from.slice(0, 2).map((ability) => (
            <span
              key={ability}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-600/30 bg-amber-900/10 px-3 py-1.5 text-sm text-amber-300"
            >
              {cap(ability)}{" "}
              <span className="font-medium text-amber-400/80">{weightLabel(sortedWeights[0])}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-4">
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
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-900/10 px-2.5 py-1 text-xs font-medium text-amber-300">
                {cap(derivedPlusTwo)} {weightLabel(sortedWeights[0])}
              </span>
              <span className="text-xs text-gray-600">+</span>
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-900/10 px-2.5 py-1 text-xs font-medium text-amber-300">
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
    return sortedBackgrounds.filter((b) => {
      if (b.name.toLowerCase().includes(q)) return true;
      if (b.feat && b.feat.toLowerCase().includes(q)) return true;
      const props = b.effects?.properties ?? [];
      return props.some((p) => {
        if (p.type !== "proficiency") return false;
        if (p.category !== "skill" && p.category !== "tool") return false;
        return p.value.toLowerCase().includes(q);
      });
    });
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
        <h1 id="background-step-heading" className="mb-1 font-cinzel text-xl text-amber-200/90">
          Choose Your Background
        </h1>
        <p className="text-sm text-gray-400">
          Your background reflects your life before adventuring — skills, tools, and a feat that
          shapes who you are. Click a card to select it, or use the info icon to view full details.
        </p>
      </div>

      {/* Selected banner */}
      {selectedBg && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-950/15 px-4 py-3">
          <span className="text-sm font-medium text-amber-200">✓ {selectedBg.name}</span>
          <span className="text-xs text-gray-500">
            {(selectedBg.effects?.properties ?? [])
              .filter((p) => p.type === "proficiency" && p.category === "skill")
              .map((p) => (p as { value: string }).value)
              .join(", ")}
            {(() => {
              const tools = (selectedBg.effects?.properties ?? [])
                .filter((p) => p.type === "proficiency" && p.category === "tool")
                .map((p) => (p as { value: string }).value);
              return tools.length > 0 ? ` · ${tools.join(", ")}` : "";
            })()}
          </span>
          <div className="flex-1" />
          <button
            onClick={(e) => handleDetailsClick(selectedBg, e)}
            className="text-xs text-amber-400/70 transition-colors hover:text-amber-300"
          >
            View Details
          </button>
          <button
            onClick={() => dispatch({ type: "CLEAR_BACKGROUND" })}
            className="text-xs text-gray-500 transition-colors hover:text-red-400"
          >
            Change
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-gray-500">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search backgrounds..."
          className="w-full rounded-lg border border-gray-700/40 bg-gray-800/60 py-2.5 pr-4 pl-9 text-sm text-gray-200 placeholder-gray-500 transition-colors focus:border-amber-500/50 focus:outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            ✕
          </button>
        )}
      </div>

      {/* Compact grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          <p className="col-span-full py-6 text-center text-sm text-gray-500">
            No backgrounds match your search.
          </p>
        )}
      </div>

      <p className="text-center text-xs text-gray-600">
        {sortedBackgrounds.length} backgrounds available
      </p>

      {/* Configuration section */}
      {selectedBg && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

          <div>
            <h2 className="mb-1 font-cinzel text-lg text-amber-200/90">
              Configure {selectedBg.name}
            </h2>
            <p className="text-sm text-gray-400">
              Distribute your ability score bonuses and make any background choices.
            </p>
          </div>

          {/* Ability score assignment */}
          <section
            className="rounded-lg border border-gray-700/20 bg-gray-800/30 p-5"
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
                className="text-sm font-semibold tracking-wider text-amber-400/90 uppercase"
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
                  className="text-sm font-semibold tracking-wider text-violet-400/90 uppercase"
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
                <div className="rounded-lg border border-violet-700/20 bg-gray-800/30 p-4">
                  <div className="text-sm leading-relaxed text-gray-300">
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
