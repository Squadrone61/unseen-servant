"use client";

import { useState, useMemo } from "react";
import type { FeatureChoice, ChoiceOption } from "@unseen-servant/shared/types";
import { featsArray, spellsArray } from "@unseen-servant/shared";
import { RichText } from "@/components/ui/RichText";
import { EffectSummary } from "./EffectSummary";

// ---------------------------------------------------------------------------
// Static pool data
// ---------------------------------------------------------------------------

const ALL_SKILLS: string[] = [
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival",
];

const ALL_ABILITIES: string[] = [
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma",
];

const COMMON_LANGUAGES: string[] = [
  "Common",
  "Dwarvish",
  "Elvish",
  "Giant",
  "Gnomish",
  "Goblin",
  "Halfling",
  "Orc",
  "Abyssal",
  "Celestial",
  "Deep Speech",
  "Draconic",
  "Infernal",
  "Primordial",
  "Sylvan",
  "Undercommon",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derives the candidate item list for pool-based choices. */
function resolvePool(choice: Extract<FeatureChoice, { pool: string }>): string[] | null {
  const { pool, from } = choice;

  // If a constrained list is supplied, always prefer it.
  if (from && from.length > 0) return from;

  switch (pool) {
    case "skill_proficiency":
    case "skill_expertise":
    case "skill_proficiency_or_expertise":
      return ALL_SKILLS;

    case "ability_score":
      return ALL_ABILITIES;

    case "language":
      return COMMON_LANGUAGES;

    case "tool":
      // No universal list — caller must supply `from`
      return null;

    case "fighting_style": {
      const fightingStyleFeats = featsArray.filter((f) => f.category === "Fighting Style");
      return fightingStyleFeats.map((f) => f.name);
    }

    case "spell_cantrip": {
      const cantrips = spellsArray.filter((s) => s.level === 0);
      if (from && from.length > 0) {
        return cantrips.filter((s) => s.classes.some((c) => from.includes(c))).map((s) => s.name);
      }
      return cantrips.map((s) => s.name);
    }

    default:
      return null;
  }
}

/** Remaining picks label. */
function remainingLabel(count: number, selected: number): string {
  const rem = count - selected;
  if (rem <= 0) return "All picked";
  return `Pick ${rem} of ${count}`;
}

// ---------------------------------------------------------------------------
// Shared selection helpers
// ---------------------------------------------------------------------------

function toggleItem(selected: string[], item: string, count: number, radio: boolean): string[] {
  if (radio) {
    return selected[0] === item ? [] : [item];
  }
  if (selected.includes(item)) {
    return selected.filter((s) => s !== item);
  }
  if (selected.length >= count) {
    // Replace the oldest pick
    return [...selected.slice(1), item];
  }
  return [...selected, item];
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

// ---- Options-based --------------------------------------------------------

interface OptionCardProps {
  option: ChoiceOption;
  isSelected: boolean;
  onToggle: () => void;
  radio: boolean;
  disabled: boolean;
  /** Nested choice UI rendered below the card when selected */
  nested?: React.ReactNode;
}

function OptionCard({ option, isSelected, onToggle, radio, disabled, nested }: OptionCardProps) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-pressed={isSelected}
        disabled={disabled && !isSelected}
        onClick={onToggle}
        className={[
          "text-left w-full rounded-lg border p-3 transition-all duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
          isSelected
            ? "border-amber-500/60 bg-amber-900/20"
            : "border-gray-700/30 bg-gray-800/30 hover:border-gray-600/50 hover:bg-gray-800/50",
          disabled && !isSelected ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Header row */}
        <div className="flex items-start gap-2">
          {/* Checkbox / radio indicator */}
          <span
            aria-hidden="true"
            className={[
              "mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center",
              radio ? "rounded-full" : "rounded",
              isSelected
                ? "bg-amber-500 border-amber-500 text-gray-900"
                : "bg-gray-800 border-gray-600",
            ].join(" ")}
          >
            {isSelected && (
              <svg
                className="w-2.5 h-2.5"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {radio ? (
                  <circle cx="5" cy="5" r="2.5" fill="currentColor" stroke="none" />
                ) : (
                  <path d="M1.5 5l2.5 2.5 4.5-4.5" />
                )}
              </svg>
            )}
          </span>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-200">{option.label}</div>
            {option.description && (
              <div className="mt-1 text-xs text-gray-400 leading-relaxed">
                <RichText text={option.description} />
              </div>
            )}
            {option.effects && (
              <div className="mt-2">
                <EffectSummary effects={option.effects} />
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Nested choices rendered outside the button to avoid invalid DOM nesting */}
      {isSelected && nested && (
        <div className="ml-4 pl-4 border-l-2 border-amber-500/20 mt-3">{nested}</div>
      )}
    </div>
  );
}

// ---- Pool: pill buttons (≤ 10 items) --------------------------------------

interface PillGridProps {
  items: string[];
  selected: string[];
  count: number;
  onToggle: (item: string) => void;
  disabled: boolean;
}

function PillGrid({ items, selected, count, onToggle, disabled }: PillGridProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const isSelected = selected.includes(item);
        const isDisabled = disabled || (!isSelected && selected.length >= count);
        return (
          <button
            key={item}
            type="button"
            aria-pressed={isSelected}
            disabled={isDisabled && !isSelected}
            onClick={() => onToggle(item)}
            className={[
              "px-3 py-1.5 rounded-full text-sm border transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
              isSelected
                ? "border-amber-500/50 bg-amber-900/20 text-amber-200"
                : "border-gray-600/40 bg-gray-800/40 text-gray-300 hover:border-gray-500/60 hover:text-gray-200",
              isDisabled && !isSelected ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

// ---- Pool: checkbox grid (11-30 items) ------------------------------------

interface CheckboxGridProps {
  items: string[];
  selected: string[];
  count: number;
  onToggle: (item: string) => void;
  disabled: boolean;
}

function CheckboxGrid({ items, selected, count, onToggle, disabled }: CheckboxGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
      {items.map((item) => {
        const isSelected = selected.includes(item);
        const isDisabled = disabled || (!isSelected && selected.length >= count);
        return (
          <label
            key={item}
            className={[
              "flex items-center gap-2 text-sm rounded px-2 py-1 transition-colors cursor-pointer",
              isSelected ? "text-amber-200" : "text-gray-300 hover:text-gray-200",
              isDisabled && !isSelected ? "opacity-40 cursor-not-allowed" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <input
              type="checkbox"
              checked={isSelected}
              disabled={isDisabled && !isSelected}
              onChange={() => onToggle(item)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={[
                "w-4 h-4 shrink-0 rounded border flex items-center justify-center",
                isSelected
                  ? "bg-amber-500 border-amber-500 text-gray-900"
                  : "bg-gray-800 border-gray-600",
              ].join(" ")}
            >
              {isSelected && (
                <svg
                  className="w-2.5 h-2.5"
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
              )}
            </span>
            {item}
          </label>
        );
      })}
    </div>
  );
}

// ---- Pool: searchable list (30+ items) ------------------------------------

interface SearchableListProps {
  items: string[];
  selected: string[];
  count: number;
  onToggle: (item: string) => void;
  disabled: boolean;
}

function SearchableList({ items, selected, count, onToggle, disabled }: SearchableListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const lower = query.trim().toLowerCase();
    return items.filter((i) => i.toLowerCase().includes(lower));
  }, [items, query]);

  return (
    <div className="flex flex-col gap-2">
      {/* Search input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          aria-label="Search options"
          className="w-full bg-gray-800/60 border border-gray-700/40 rounded-lg pl-10 pr-4 py-2 text-gray-200 placeholder-gray-500 focus:border-amber-500/50 focus:outline-none text-sm transition-colors"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Scrollable list */}
      <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-700/30 bg-gray-900/30 divide-y divide-gray-700/20">
        {filtered.length === 0 ? (
          <div className="py-4 text-center text-sm text-gray-500">No results</div>
        ) : (
          filtered.map((item) => {
            const isSelected = selected.includes(item);
            const isDisabled = disabled || (!isSelected && selected.length >= count);
            return (
              <button
                key={item}
                type="button"
                aria-pressed={isSelected}
                disabled={isDisabled && !isSelected}
                onClick={() => onToggle(item)}
                className={[
                  "w-full text-left px-3 py-2 text-sm transition-colors",
                  "focus:outline-none focus-visible:bg-gray-800/60",
                  isSelected
                    ? "bg-amber-900/20 text-amber-200 hover:bg-amber-900/30"
                    : "text-gray-300 hover:bg-gray-800/40 hover:text-gray-200",
                  isDisabled && !isSelected ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="flex items-center gap-2">
                  {isSelected && (
                    <svg
                      className="w-3.5 h-3.5 text-amber-400 shrink-0"
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
                  )}
                  {!isSelected && <span className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                  {item}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fallback label for unresolvable pools
// ---------------------------------------------------------------------------

function PoolFallback({ label }: { label: string }) {
  return (
    <p className="text-sm text-gray-500 italic">{label} — selection handled at class/feat level.</p>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface ChoicePickerProps {
  choice: FeatureChoice;
  selected: string[];
  onSelect: (selections: string[]) => void;
  /** Nested selections keyed by child choice id */
  nestedSelections?: Record<string, string[]>;
  onNestedSelect?: (choiceId: string, selections: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function ChoicePicker({
  choice,
  selected,
  onSelect,
  nestedSelections = {},
  onNestedSelect,
  disabled = false,
  className,
}: ChoicePickerProps) {
  const radio = choice.count === 1;
  const remainingText = remainingLabel(choice.count, selected.length);
  const allPicked = selected.length >= choice.count;

  // ---- Options-based -------------------------------------------------------

  if ("options" in choice && choice.options) {
    const handleToggle = (label: string) => {
      if (disabled) return;
      onSelect(toggleItem(selected, label, choice.count, radio));
    };

    return (
      <div
        className={["bg-gray-800/30 border border-gray-700/20 rounded-lg p-4", className]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-300">{choice.label}</span>
          <span
            className={[
              "text-xs px-2 py-0.5 rounded-full border",
              allPicked
                ? "border-emerald-600/40 bg-emerald-900/20 text-emerald-400"
                : "border-amber-600/30 bg-amber-900/10 text-amber-400/80",
            ].join(" ")}
          >
            {remainingText}
          </span>
        </div>

        {/* Option cards */}
        <div className="flex flex-col gap-2">
          {choice.options.map((option: ChoiceOption) => {
            const isSelected = selected.includes(option.label);

            // Build nested picker nodes for options that have sub-choices
            const nestedNode =
              isSelected && option.choices && option.choices.length > 0
                ? option.choices.map((nestedChoice) => (
                    <ChoicePicker
                      key={nestedChoice.id}
                      choice={nestedChoice}
                      selected={nestedSelections[nestedChoice.id] ?? []}
                      onSelect={(s) => onNestedSelect?.(nestedChoice.id, s)}
                      nestedSelections={nestedSelections}
                      onNestedSelect={onNestedSelect}
                      disabled={disabled}
                    />
                  ))
                : undefined;

            return (
              <OptionCard
                key={option.label}
                option={option}
                isSelected={isSelected}
                radio={radio}
                disabled={disabled || (!isSelected && allPicked)}
                onToggle={() => handleToggle(option.label)}
                nested={
                  nestedNode ? <div className="flex flex-col gap-3">{nestedNode}</div> : undefined
                }
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Pool-based ----------------------------------------------------------

  if ("pool" in choice && choice.pool) {
    const poolChoice = choice as Extract<FeatureChoice, { pool: string }>;
    const items = resolvePool(poolChoice);

    const handleToggle = (item: string) => {
      if (disabled) return;
      onSelect(toggleItem(selected, item, choice.count, radio));
    };

    // Determine render tier
    const renderPoolBody = () => {
      if (!items) {
        // No data — show fallback label
        return <PoolFallback label={choice.label} />;
      }

      if (items.length <= 10) {
        return (
          <PillGrid
            items={items}
            selected={selected}
            count={choice.count}
            onToggle={handleToggle}
            disabled={disabled}
          />
        );
      }

      if (items.length <= 30) {
        return (
          <CheckboxGrid
            items={items}
            selected={selected}
            count={choice.count}
            onToggle={handleToggle}
            disabled={disabled}
          />
        );
      }

      // Large pool — searchable list
      return (
        <SearchableList
          items={items}
          selected={selected}
          count={choice.count}
          onToggle={handleToggle}
          disabled={disabled}
        />
      );
    };

    return (
      <div
        className={["bg-gray-800/30 border border-gray-700/20 rounded-lg p-4", className]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-300">{choice.label}</span>
          {items && (
            <span
              className={[
                "text-xs px-2 py-0.5 rounded-full border",
                allPicked
                  ? "border-emerald-600/40 bg-emerald-900/20 text-emerald-400"
                  : "border-amber-600/30 bg-amber-900/10 text-amber-400/80",
              ].join(" ")}
            >
              {remainingText}
            </span>
          )}
        </div>

        {renderPoolBody()}
      </div>
    );
  }

  // Malformed choice — render nothing
  return null;
}
