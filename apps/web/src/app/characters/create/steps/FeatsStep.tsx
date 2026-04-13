"use client";

import { useMemo, useState } from "react";
import { featsArray, getFeat, getBackground } from "@unseen-servant/shared/data";
import { enumerateAsiSlots, type AsiSlot as AsiSlotMeta } from "@unseen-servant/shared/character";
import type { FeatDb, Ability } from "@unseen-servant/shared/types";
import { DetailPopover } from "@/components/character/DetailPopover";
import { EffectSummary } from "@/components/builder/EffectSummary";
import { RichText } from "@/components/ui/RichText";
import { ChoicePicker } from "@/components/builder/ChoicePicker";
import { InfoButton } from "@/components/builder/InfoButton";
import { useBuilder } from "../BuilderContext";
import type { FeatSelection } from "../builder-state";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// Category badge colours
const CATEGORY_BADGE: Record<string, string> = {
  General: "bg-gray-700/50 text-gray-300 border-gray-600/40",
  "Epic Boon": "bg-amber-900/40 text-amber-300 border-amber-700/40",
  "Fighting Style": "bg-blue-900/40 text-blue-300 border-blue-700/40",
  Origin: "bg-violet-900/40 text-violet-300 border-violet-700/40",
};

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
// Feat Detail Popover
// ---------------------------------------------------------------------------

interface FeatPopoverProps {
  feat: FeatDb;
  onClose: () => void;
  position: { x: number; y: number };
}

function FeatPopover({ feat, onClose, position }: FeatPopoverProps) {
  return (
    <DetailPopover title={feat.name} onClose={onClose} position={position}>
      <div className="space-y-3">
        {/* Meta badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_BADGE[feat.category] ?? "bg-gray-700/50 text-gray-300 border-gray-600/30"}`}
          >
            {feat.category}
          </span>
          {feat.prerequisite && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/40 text-gray-400 border border-gray-600/40">
              {feat.prerequisite}
            </span>
          )}
          {feat.repeatable && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-900/40 text-teal-300 border border-teal-700/40">
              Repeatable
            </span>
          )}
        </div>

        {/* Effect badges */}
        {feat.effects && <EffectSummary effects={feat.effects} />}

        {/* Description */}
        <div className="text-sm text-gray-300 leading-relaxed">
          <RichText text={feat.description} />
        </div>
      </div>
    </DetailPopover>
  );
}

// ---------------------------------------------------------------------------
// Compact Feat Card
// ---------------------------------------------------------------------------

interface FeatCardProps {
  feat: FeatDb;
  isSelected: boolean;
  onClick: () => void;
  onInfo: (e: React.MouseEvent) => void;
}

function FeatCard({ feat, isSelected, onClick, onInfo }: FeatCardProps) {
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
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-[family-name:var(--font-cinzel)] text-sm ${
            isSelected ? "text-amber-200" : "text-gray-200"
          }`}
        >
          {feat.name}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {feat.category}
            {feat.prerequisite ? ` · ${feat.prerequisite}` : ""}
          </span>
          <InfoButton onClick={onInfo} />
        </div>
      </div>
    </button>
  );
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
  const selectedAbilities = Object.keys(asiAbilities) as Ability[];
  const mode: "none" | "plus2" | "split" =
    selectedAbilities.length === 0
      ? "none"
      : selectedAbilities.length === 1 && asiAbilities[selectedAbilities[0]] === 2
        ? "plus2"
        : "split";

  function handleClick(ability: Ability) {
    const isSelected = (asiAbilities[ability] ?? 0) > 0;

    if (isSelected) {
      // Deselect this ability
      const updated = { ...asiAbilities };
      delete updated[ability];
      onUpdate({ ...selection, asiAbilities: updated });
    } else if (mode === "none") {
      // Nothing selected yet — give +2 to this ability
      onUpdate({
        ...selection,
        asiAbilities: { [ability]: 2 } as Partial<Record<Ability, number>>,
      });
    } else if (mode === "plus2") {
      // One ability has +2 — split into +1/+1 with this new ability
      const firstAbility = selectedAbilities[0];
      onUpdate({
        ...selection,
        asiAbilities: {
          [firstAbility]: 1,
          [ability]: 1,
        } as Partial<Record<Ability, number>>,
      });
    }
    // If mode === "split" and clicking an unselected ability, do nothing (already at 2 picks)
  }

  function handleClear() {
    onUpdate({ ...selection, asiAbilities: {} });
  }

  return (
    <div className="flex flex-col gap-3" aria-label={`ASI slot ${index + 1} ability selection`}>
      <p className="text-xs text-gray-400">
        Choose one ability for <span className="text-amber-300 font-medium">+2</span>, or two
        abilities for <span className="text-amber-300 font-medium">+1 / +1</span>.
        {mode === "none" && " Click an ability to start."}
        {mode === "plus2" &&
          " Click another ability to split into +1/+1, or click the selected one to remove."}
      </p>

      {/* Current allocation chips */}
      {selectedAbilities.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {selectedAbilities.map((ab) => (
            <span
              key={ab}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-900/10 text-amber-300 text-xs font-medium"
            >
              {cap(ab)} +{asiAbilities[ab]}
              <button
                type="button"
                onClick={() => handleClick(ab)}
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
          <button
            type="button"
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            onClick={handleClear}
          >
            Reset
          </button>
        </div>
      )}

      {/* Ability pill selector */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Ability choices">
        {ALL_ABILITIES.map((ability) => {
          const isSelected = (asiAbilities[ability] ?? 0) > 0;
          // Disable unselected pills only when we already have two +1 picks
          const isDisabled = !isSelected && mode === "split";

          return (
            <button
              key={ability}
              type="button"
              aria-pressed={isSelected}
              disabled={isDisabled}
              onClick={() => handleClick(ability)}
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
  isEpicBoon?: boolean;
  alreadySelectedFeats: string[];
  onUpdate: (sel: FeatSelection) => void;
  featChoices: Record<string, Record<string, string[]>>;
  onFeatChoice: (featName: string, choiceId: string, values: string[]) => void;
}

function AsiSlot({
  slotIndex: _slotIndex,
  level,
  selection,
  classLevel,
  isEpicBoon,
  alreadySelectedFeats,
  onUpdate,
  featChoices,
  onFeatChoice,
}: AsiSlotProps) {
  const isASI = selection.type === "asi";
  const isFeat = selection.type === "feat";

  const [popover, setPopover] = useState<{
    feat: FeatDb;
    position: { x: number; y: number };
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  const filteredFeats = useMemo(() => {
    if (!searchQuery.trim()) return eligibleFeats;
    const q = searchQuery.toLowerCase();
    return eligibleFeats.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        (f.prerequisite ?? "").toLowerCase().includes(q),
    );
  }, [eligibleFeats, searchQuery]);

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
    // Clear search and popover when switching modes
    setSearchQuery("");
    setPopover(null);
  }

  function handleFeatInfo(feat: FeatDb, e: React.MouseEvent) {
    setPopover({ feat, position: { x: e.clientX, y: e.clientY } });
  }

  function handleFeatCardClick(feat: FeatDb) {
    handleFeatSelect(feat.name);
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
          {isEpicBoon ? "Epic Boon" : "Ability Score Improvement"}
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
      {isASI && <ASIPanel index={_slotIndex} selection={selection} onUpdate={onUpdate} />}

      {/* Feat panel */}
      {isFeat && (
        <div className="flex flex-col gap-3">
          {/* Selected feat banner */}
          {selectedFeatData && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-950/15">
              <span className="text-sm text-amber-200 font-medium">
                &#10003; {selectedFeatData.name}
              </span>
              <span className="text-xs text-gray-500">
                {selectedFeatData.category}
                {selectedFeatData.prerequisite ? ` · ${selectedFeatData.prerequisite}` : ""}
              </span>
              <div className="flex-1" />
              <button
                onClick={(e) => handleFeatInfo(selectedFeatData, e)}
                className="text-xs text-amber-400/70 hover:text-amber-300 transition-colors"
              >
                View Details
              </button>
              <button
                onClick={() => onUpdate({ level, type: "feat", featName: undefined })}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Change
              </button>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search feats..."
              aria-label="Search feats"
              className="w-full pl-9 pr-4 py-2.5 bg-gray-800/60 border border-gray-700/40 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:border-amber-500/50 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Compact feat grid — height capped to avoid infinite page growth */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-80 overflow-y-auto rounded-lg pr-1"
            role="listbox"
            aria-label="Available feats"
          >
            {filteredFeats.map((feat) => (
              <FeatCard
                key={feat.name}
                feat={feat}
                isSelected={selection.featName === feat.name}
                onClick={() => handleFeatCardClick(feat)}
                onInfo={(e) => handleFeatInfo(feat, e)}
              />
            ))}
            {filteredFeats.length === 0 && (
              <p className="col-span-full text-center text-gray-500 text-sm py-6">
                No feats match your search.
              </p>
            )}
          </div>

          <p className="text-xs text-gray-600">
            {filteredFeats.length} feat{filteredFeats.length !== 1 ? "s" : ""} available · click to
            select · info icon for details
          </p>

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

      {/* Feat popover — rendered at slot level so it can overlay the whole page */}
      {popover && (
        <FeatPopover
          feat={popover.feat}
          onClose={() => setPopover(null)}
          position={popover.position}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Origin feat display (from background) — read-only, choices configured in Background step
// ---------------------------------------------------------------------------

interface OriginFeatDisplayProps {
  featName: string;
}

function OriginFeatDisplay({ featName }: OriginFeatDisplayProps) {
  const feat = useMemo(() => getFeat(featName), [featName]);

  const [popover, setPopover] = useState<{
    position: { x: number; y: number };
  } | null>(null);

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

      {/* Compact display row */}
      <button
        onClick={(e) => setPopover({ position: { x: e.clientX, y: e.clientY } })}
        className="w-full text-left px-4 py-3 rounded-lg border border-violet-700/20 bg-gray-800/30 hover:border-violet-600/40 hover:bg-gray-800/50 transition-all duration-200 mb-3"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-[family-name:var(--font-cinzel)] text-sm text-violet-200">
            {feat.name}
          </span>
          <span className="text-xs text-gray-500 shrink-0">
            {feat.category}
            {feat.prerequisite ? ` · ${feat.prerequisite}` : ""}
          </span>
        </div>
        {feat.effects && (
          <div className="mt-1.5">
            <EffectSummary effects={feat.effects} compact />
          </div>
        )}
      </button>

      {/* Note for feats that have choices */}
      {(feat.choices?.length ?? 0) > 0 && (
        <p className="text-xs text-gray-500 italic">
          Choices for this feat are configured in the{" "}
          <span className="text-violet-400">Background</span> step.
        </p>
      )}

      {/* Details popover */}
      {popover && (
        <DetailPopover
          title={feat.name}
          onClose={() => setPopover(null)}
          position={popover.position}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_BADGE[feat.category] ?? "bg-gray-700/50 text-gray-300 border-gray-600/30"}`}
              >
                {feat.category}
              </span>
              {feat.prerequisite && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/40 text-gray-400 border border-gray-600/40">
                  {feat.prerequisite}
                </span>
              )}
            </div>
            {feat.effects && <EffectSummary effects={feat.effects} />}
            <div className="text-sm text-gray-300 leading-relaxed">
              <RichText text={feat.description} />
            </div>
          </div>
        </DetailPopover>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeatsStep
// ---------------------------------------------------------------------------

export function FeatsStep() {
  const { state, dispatch } = useBuilder();

  // Per-class ASI / Epic Boon slots (RAW 2024: granted per class at that
  // class's own level; Fighter/Rogue have extras — all encoded in class data).
  const asiSlots = useMemo<AsiSlotMeta[]>(() => enumerateAsiSlots(state.classes), [state.classes]);

  // For each slot, find or default a selection. Default type = "asi".
  const selectionsBySlot = useMemo<FeatSelection[]>(() => {
    return asiSlots.map((slot) => {
      const match = state.featSelections.find(
        (s) => s.classIndex === slot.classIndex && s.level === slot.classLevel,
      );
      return (
        match ?? {
          classIndex: slot.classIndex,
          className: slot.className,
          level: slot.classLevel,
          type: "asi" as const,
          asiAbilities: {},
        }
      );
    });
  }, [asiSlots, state.featSelections]);

  // Collect all feat names currently selected (for duplicate check)
  const selectedFeatNames = useMemo(
    () =>
      selectionsBySlot
        .filter((s) => s.type === "feat" && s.featName)
        .map((s) => s.featName as string),
    [selectionsBySlot],
  );

  // Origin feat from background
  const originFeatName = useMemo<string | null>(() => {
    if (!state.background) return null;
    const bg = getBackground(state.background);
    return bg?.feat ?? null;
  }, [state.background]);

  function handleSlotUpdate(slot: AsiSlotMeta, sel: FeatSelection) {
    dispatch({
      type: "SET_FEAT_SELECTION",
      index: -1,
      selection: {
        ...sel,
        classIndex: slot.classIndex,
        className: slot.className,
        level: slot.classLevel,
      },
    });
  }

  function handleFeatChoice(featName: string, choiceId: string, values: string[]) {
    dispatch({ type: "SET_FEAT_CHOICE", featName, choiceId, values });
  }

  // Group slots by classIndex for display
  const slotsByClass = useMemo(() => {
    const groups = new Map<number, { className: string; entries: AsiSlotMeta[] }>();
    asiSlots.forEach((slot) => {
      const g = groups.get(slot.classIndex);
      if (g) g.entries.push(slot);
      else groups.set(slot.classIndex, { className: slot.className, entries: [slot] });
    });
    return Array.from(groups.entries()).map(([classIndex, v]) => ({
      classIndex,
      className: v.className,
      entries: v.entries,
    }));
  }, [asiSlots]);

  const hasAsiSlots = asiSlots.length > 0;
  const noSlotsYet = !hasAsiSlots && state.classes.length > 0;

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
          Each class grants Ability Score Improvement slots at its own levels (4, 8, 12, 16).
          Fighters gain extra slots at 6 and 14; Rogues gain an extra at 10; every class gains an
          Epic Boon feat slot at 19. Each slot may be spent on a +2 (or +1/+1) ability bump or on a
          feat.
          {noSlotsYet && (
            <span className="block mt-1 text-gray-500">
              No ASI slots unlocked yet. Raise a class to level 4 or higher to unlock them.
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
            <OriginFeatDisplay featName={originFeatName} />
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

      {/* ASI / Feat slots, grouped by class */}
      {hasAsiSlots && (
        <div className="flex flex-col gap-6">
          {slotsByClass.map((group) => (
            <div key={group.classIndex}>
              <h2
                className="text-xs font-medium text-amber-400/80 uppercase tracking-widest mb-4"
                style={{ fontFamily: "var(--font-cinzel)" }}
              >
                {group.className} — ASI Slots
              </h2>
              {group.entries.map((slot) => {
                const selectionIndex = asiSlots.indexOf(slot);
                const selection = selectionsBySlot[selectionIndex];
                return (
                  <AsiSlot
                    key={`${slot.classIndex}-${slot.classLevel}`}
                    slotIndex={selectionIndex}
                    level={slot.classLevel}
                    selection={selection}
                    classLevel={state.classes[slot.classIndex]?.level ?? slot.classLevel}
                    isEpicBoon={slot.isEpicBoon}
                    alreadySelectedFeats={selectedFeatNames.filter(
                      (name) => selection.featName !== name,
                    )}
                    onUpdate={(sel) => handleSlotUpdate(slot, sel)}
                    featChoices={state.featChoices}
                    onFeatChoice={handleFeatChoice}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
