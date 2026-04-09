"use client";

import { useMemo } from "react";
import { featsArray, getFeat, getBackground } from "@unseen-servant/shared/data";
import type { FeatDb, Ability } from "@unseen-servant/shared/types";
import { EntityCard } from "@/components/builder/EntityCard";
import { EntityGrid } from "@/components/builder/EntityGrid";
import { ChoicePicker } from "@/components/builder/ChoicePicker";
import { useBuilder } from "../BuilderContext";
import type { FeatSelection } from "../builder-state";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ASI levels for all classes in D&D 2024. */
const STANDARD_ASI_LEVELS = [4, 8, 12, 16, 19];

const ALL_ABILITIES: Ability[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

const ABILITY_LABELS: Record<Ability, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

/** Categories excluded from the general feat picker. */
const EXCLUDED_CATEGORIES = new Set(["Origin", "Fighting Style"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Checks whether a feat's prerequisite string is satisfied by the current
 * character state. This is a best-effort string-match — prerequisite strings
 * like "Level 4+" are checked against classLevel; all other prerequisites pass
 * by default (the DM / AI can enforce them in play).
 */
function meetsPrerequisite(feat: FeatDb, classLevel: number): boolean {
  if (!feat.prerequisite) return true;

  // Level requirement: "Level N+" pattern
  const levelMatch = feat.prerequisite.match(/Level\s+(\d+)\+/i);
  if (levelMatch) {
    const required = parseInt(levelMatch[1], 10);
    if (classLevel < required) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// ASI mode sub-component
// ---------------------------------------------------------------------------

interface ASIPanelProps {
  index: number;
  selection: FeatSelection;
  onUpdate: (sel: FeatSelection) => void;
}

function ASIPanel({ index, selection, onUpdate }: ASIPanelProps) {
  const asiAbilities = selection.asiAbilities ?? {};
  const totalPoints = Object.values(asiAbilities).reduce((s, v) => s + v, 0);

  // The player may add up to 2 points total, distributed as +2 to one or +1/+1 to two.
  const canAdd = totalPoints < 2;

  function handleToggle(ability: Ability) {
    const current = asiAbilities[ability] ?? 0;
    if (current > 0) {
      // Remove
      const updated: Partial<Record<Ability, number>> = { ...asiAbilities };
      delete updated[ability];
      onUpdate({ ...selection, asiAbilities: updated });
    } else if (canAdd) {
      // If we already have 1 point spent, add +1 to this ability
      // If nothing spent, default to +2 on first pick (player can then split)
      const remaining = 2 - totalPoints;
      const grant = remaining === 2 ? 2 : 1;

      // But if current total is 2 from a single +2, split it
      const updatedEntries = { ...asiAbilities };

      // If we had a +2 on one ability and now trying to split, keep +1/+1
      // Here we just add +1 since remaining is 1
      updatedEntries[ability] = grant;

      onUpdate({ ...selection, asiAbilities: updatedEntries });
    }
  }

  function handleSwitchToPlus2(ability: Ability) {
    // Reset to +2 on this single ability
    onUpdate({
      ...selection,
      asiAbilities: { [ability]: 2 } as Partial<Record<Ability, number>>,
    });
  }

  const selectedAbilities = Object.keys(asiAbilities) as Ability[];

  return (
    <div className="flex flex-col gap-3" aria-label={`ASI slot ${index + 1} ability selection`}>
      <p className="text-xs text-gray-400">
        Choose one ability for <span className="text-amber-300 font-medium">+2</span>, or two
        abilities for <span className="text-amber-300 font-medium">+1 / +1</span>.
      </p>

      {/* Current allocation chips */}
      {selectedAbilities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedAbilities.map((ab) => (
            <span
              key={ab}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-900/10 text-amber-300 text-xs font-medium"
            >
              {cap(ab)} +{asiAbilities[ab]}
              <button
                type="button"
                onClick={() => handleToggle(ab)}
                aria-label={`Remove ${cap(ab)} bonus`}
                className="ml-1 text-amber-500/60 hover:text-amber-300 transition-colors"
              >
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M2 2l6 6M8 2l-6 6" />
                </svg>
              </button>
            </span>
          ))}
          {/* If a single +2 is chosen, offer a split option */}
          {selectedAbilities.length === 1 && asiAbilities[selectedAbilities[0]] === 2 && (
            <span className="text-xs text-gray-600 self-center">
              or{" "}
              <button
                type="button"
                className="text-amber-400/70 hover:text-amber-300 underline underline-offset-2 transition-colors"
                onClick={() => {
                  // Remove current +2 and start fresh for split
                  onUpdate({ ...selection, asiAbilities: {} });
                }}
              >
                split into +1/+1
              </button>
            </span>
          )}
        </div>
      )}

      {/* Ability pill selector */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Ability choices">
        {ALL_ABILITIES.map((ability) => {
          const isSelected = (asiAbilities[ability] ?? 0) > 0;
          const isDisabled = !isSelected && !canAdd;

          return (
            <button
              key={ability}
              type="button"
              aria-pressed={isSelected}
              disabled={isDisabled}
              onClick={() => {
                if (isSelected) {
                  handleToggle(ability);
                } else if (totalPoints === 0) {
                  // First pick: grant +2
                  handleSwitchToPlus2(ability);
                } else {
                  // Second pick: add +1 (reduces first pick to +1 too)
                  const firstAbility = selectedAbilities[0];
                  onUpdate({
                    ...selection,
                    asiAbilities: {
                      [firstAbility]: 1,
                      [ability]: 1,
                    } as Partial<Record<Ability, number>>,
                  });
                }
              }}
              className={[
                "px-3 py-1.5 rounded-full text-sm border transition-all duration-150",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                isSelected
                  ? "border-amber-500/50 bg-amber-900/20 text-amber-200"
                  : "border-gray-600/40 bg-gray-800/40 text-gray-300 hover:border-gray-500/60 hover:text-gray-200",
                isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {ABILITY_LABELS[ability]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single ASI slot
// ---------------------------------------------------------------------------

interface AsiSlotProps {
  slotIndex: number;
  level: number;
  selection: FeatSelection;
  classLevel: number;
  alreadySelectedFeats: string[];
  onUpdate: (sel: FeatSelection) => void;
  featChoices: Record<string, Record<string, string[]>>;
  onFeatChoice: (featName: string, choiceId: string, values: string[]) => void;
}

function AsiSlot({
  slotIndex,
  level,
  selection,
  classLevel,
  alreadySelectedFeats,
  onUpdate,
  featChoices,
  onFeatChoice,
}: AsiSlotProps) {
  const isASI = selection.type === "asi";
  const isFeat = selection.type === "feat";

  // Filter eligible feats
  const eligibleFeats = useMemo(() => {
    return featsArray.filter((f) => {
      if (EXCLUDED_CATEGORIES.has(f.category)) return false;
      if (!f.repeatable && alreadySelectedFeats.includes(f.name) && selection.featName !== f.name)
        return false;
      if (!meetsPrerequisite(f, classLevel)) return false;
      return true;
    });
  }, [alreadySelectedFeats, classLevel, selection.featName]);

  const selectedFeatData = useMemo<FeatDb | undefined>(() => {
    if (!selection.featName) return undefined;
    return getFeat(selection.featName);
  }, [selection.featName]);

  function handleTypeToggle(type: "asi" | "feat") {
    if (type === "asi") {
      onUpdate({ level, type: "asi", asiAbilities: {} });
    } else {
      onUpdate({ level, type: "feat", featName: undefined });
    }
  }

  function handleFeatSelect(name: string) {
    // Toggle off if re-clicking
    if (selection.featName === name) {
      onUpdate({ level, type: "feat", featName: undefined });
    } else {
      onUpdate({ level, type: "feat", featName: name });
    }
  }

  return (
    <div className="bg-gray-800/40 border border-gray-700/30 rounded-lg p-5 mb-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs bg-amber-900/40 text-amber-300 border border-amber-700/40 rounded-full px-2 py-0.5 font-medium">
          Level {level}
        </span>
        <h3
          className="text-sm font-semibold text-gray-200"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Ability Score Improvement
        </h3>
      </div>

      {/* Type toggle */}
      <div className="flex gap-2 mb-5" role="radiogroup" aria-label={`Level ${level} ASI type`}>
        {(["asi", "feat"] as const).map((type) => {
          const selected = selection.type === type;
          const label = type === "asi" ? "Ability Score Increase" : "Choose a Feat";
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => handleTypeToggle(type)}
              className={[
                "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-all duration-150",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                selected
                  ? "border-amber-500/50 bg-amber-900/20 text-amber-200 font-medium"
                  : "border-gray-600/40 bg-gray-800/40 text-gray-400 hover:border-gray-500/60 hover:text-gray-200 cursor-pointer",
              ]
                .filter(Boolean)
                .join(" ")}
            >
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
              {label}
            </button>
          );
        })}
      </div>

      {/* ASI panel */}
      {isASI && <ASIPanel index={slotIndex} selection={selection} onUpdate={onUpdate} />}

      {/* Feat panel */}
      {isFeat && (
        <div className="flex flex-col gap-4">
          <EntityGrid<FeatDb>
            items={eligibleFeats}
            selected={selection.featName ?? null}
            onSelect={handleFeatSelect}
            searchable
            searchPlaceholder="Search feats..."
            renderCard={(feat, isSelected) => (
              <EntityCard
                name={feat.name}
                description={feat.description}
                effects={feat.effects}
                tags={[
                  { label: feat.category },
                  ...(feat.prerequisite
                    ? [
                        {
                          label: feat.prerequisite,
                          color: "bg-gray-700/40 text-gray-400 border-gray-600/40",
                        },
                      ]
                    : []),
                ]}
                selected={isSelected}
                expandable
              />
            )}
          />

          {/* Feat sub-choices */}
          {selectedFeatData && (selectedFeatData.choices?.length ?? 0) > 0 && (
            <>
              <div
                className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"
                aria-hidden="true"
              />
              <div>
                <h4
                  className="text-sm font-semibold text-amber-400/90 uppercase tracking-wider mb-3"
                  style={{ fontFamily: "var(--font-cinzel)" }}
                >
                  {selectedFeatData.name} Choices
                </h4>
                <div className="flex flex-col gap-3">
                  {(selectedFeatData.choices ?? []).map((choice) => (
                    <ChoicePicker
                      key={choice.id}
                      choice={choice}
                      selected={featChoices[selectedFeatData.name]?.[choice.id] ?? []}
                      onSelect={(values) => onFeatChoice(selectedFeatData.name, choice.id, values)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Origin feat display (from background) — read-only
// ---------------------------------------------------------------------------

interface OriginFeatDisplayProps {
  featName: string;
  featChoices: Record<string, string[]>;
  onFeatChoice: (choiceId: string, values: string[]) => void;
}

function OriginFeatDisplay({ featName, featChoices, onFeatChoice }: OriginFeatDisplayProps) {
  const feat = useMemo(() => getFeat(featName), [featName]);

  if (!feat) {
    return (
      <div className="bg-gray-800/40 border border-gray-700/30 rounded-lg p-4">
        <p className="text-sm text-gray-400">
          Origin feat: <span className="text-amber-300">{featName}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/40 border border-violet-700/30 rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs bg-violet-900/40 text-violet-300 border border-violet-700/40 rounded-full px-2 py-0.5 font-medium">
          Origin Feat
        </span>
        <h3
          className="text-sm font-semibold text-gray-200"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          {feat.name}
        </h3>
        <span className="text-xs text-gray-500 ml-auto">Granted by background</span>
      </div>

      <EntityCard
        name={feat.name}
        description={feat.description}
        effects={feat.effects}
        tags={[{ label: feat.category }]}
        expandable
      />

      {/* Origin feat choices */}
      {(feat.choices?.length ?? 0) > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {(feat.choices ?? []).map((choice) => (
            <ChoicePicker
              key={choice.id}
              choice={choice}
              selected={featChoices[choice.id] ?? []}
              onSelect={(values) => onFeatChoice(choice.id, values)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeatsStep
// ---------------------------------------------------------------------------

export function FeatsStep() {
  const { state, dispatch } = useBuilder();

  // Determine which ASI levels are unlocked for the current class level
  const unlockedAsiLevels = useMemo(
    () => STANDARD_ASI_LEVELS.filter((l) => l <= state.classLevel),
    [state.classLevel],
  );

  // Sync featSelections array length to match unlockedAsiLevels.
  // The reducer trims from the top on level changes; we need to ensure slots exist.
  const selections = useMemo<FeatSelection[]>(() => {
    const base = state.featSelections;
    return unlockedAsiLevels.map((level, i) => {
      return base[i] ?? { level, type: "asi", asiAbilities: {} };
    });
  }, [state.featSelections, unlockedAsiLevels]);

  // Collect all feat names currently selected (for duplicate check)
  const selectedFeatNames = useMemo(
    () =>
      selections.filter((s) => s.type === "feat" && s.featName).map((s) => s.featName as string),
    [selections],
  );

  // Origin feat from background
  const originFeatName = useMemo<string | null>(() => {
    if (!state.background) return null;
    const bg = getBackground(state.background);
    return bg?.feat ?? null;
  }, [state.background]);

  function handleSlotUpdate(index: number, sel: FeatSelection) {
    dispatch({ type: "SET_FEAT_SELECTION", index, selection: sel });
  }

  function handleFeatChoice(featName: string, choiceId: string, values: string[]) {
    dispatch({ type: "SET_FEAT_CHOICE", featName, choiceId, values });
  }

  function handleOriginFeatChoice(choiceId: string, values: string[]) {
    if (!originFeatName) return;
    dispatch({ type: "SET_FEAT_CHOICE", featName: originFeatName, choiceId, values });
  }

  const hasAsiSlots = unlockedAsiLevels.length > 0;

  return (
    <section aria-labelledby="feats-step-heading" className="flex flex-col gap-6">
      {/* Section header */}
      <div>
        <h1
          id="feats-step-heading"
          className="text-xl font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1"
        >
          Feats & Ability Improvements
        </h1>
        <p className="text-sm text-gray-400">
          At certain levels your class grants an Ability Score Improvement. You may take the raw
          bonus or spend the slot on a feat instead.
          {state.classLevel < 4 && (
            <span className="block mt-1 text-gray-500">
              You will unlock your first ASI at level 4. Increase your class level to access this
              step.
            </span>
          )}
        </p>
      </div>

      {/* Origin feat from background */}
      {originFeatName && (
        <>
          <div>
            <h2
              className="text-xs font-medium text-violet-400/80 uppercase tracking-widest mb-3"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Background Origin Feat
            </h2>
            <OriginFeatDisplay
              featName={originFeatName}
              featChoices={state.featChoices[originFeatName] ?? {}}
              onFeatChoice={handleOriginFeatChoice}
            />
          </div>

          {/* Divider */}
          {hasAsiSlots && (
            <div
              className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"
              aria-hidden="true"
            />
          )}
        </>
      )}

      {/* ASI / Feat slots */}
      {hasAsiSlots ? (
        <div>
          <h2
            className="text-xs font-medium text-amber-400/80 uppercase tracking-widest mb-4"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            Class ASI Slots
          </h2>
          {unlockedAsiLevels.map((level, i) => (
            <AsiSlot
              key={level}
              slotIndex={i}
              level={level}
              selection={selections[i]}
              classLevel={state.classLevel}
              alreadySelectedFeats={selectedFeatNames.filter((_, j) => j !== i)}
              onUpdate={(sel) => handleSlotUpdate(i, sel)}
              featChoices={state.featChoices}
              onFeatChoice={handleFeatChoice}
            />
          ))}
        </div>
      ) : (
        !originFeatName && (
          <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-8 text-center">
            <p className="text-gray-500 text-sm">
              No ASI slots yet. Increase your class level to 4 or above to unlock feat and ability
              score improvement choices.
            </p>
          </div>
        )
      )}
    </section>
  );
}
