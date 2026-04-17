"use client";

import { useState, useMemo } from "react";
import type { FeatureChoice } from "@unseen-servant/shared/types";
import type { ResolveChoiceContext, ResolvedOption } from "@unseen-servant/shared/builders";
import { resolveChoice } from "@unseen-servant/shared/builders";
import { useEntityClick } from "@/components/character/EntityPopoverContext";
import { InfoButton } from "./InfoButton";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function remainingLabel(count: number, selected: number): string {
  const rem = count - selected;
  if (rem <= 0) return "All picked";
  return `Pick ${rem} of ${count}`;
}

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
// OptionRow — single card in the unified grid
// ---------------------------------------------------------------------------

interface OptionRowProps {
  option: ResolvedOption;
  isSelected: boolean;
  radio: boolean;
  disabled: boolean;
  onToggle: () => void;
  onInfo: (e: React.MouseEvent) => void;
  nested?: React.ReactNode;
}

function OptionRow({
  option,
  isSelected,
  radio,
  disabled,
  onToggle,
  onInfo,
  nested,
}: OptionRowProps) {
  return (
    <div
      aria-disabled={option.disabled ? true : undefined}
      title={option.disabled && option.disabledReason ? option.disabledReason : undefined}
      className={option.disabled ? "opacity-40" : undefined}
    >
      <div
        className={[
          "flex items-center gap-2 w-full rounded-lg border px-3 py-2 transition-all duration-150",
          isSelected
            ? "border-amber-500/60 bg-amber-900/20"
            : "border-gray-700/30 bg-gray-800/30 hover:border-gray-600/50 hover:bg-gray-800/50",
          disabled && !isSelected ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Checkbox / radio — clicking the whole row toggles */}
        <button
          type="button"
          aria-pressed={isSelected}
          disabled={(disabled || !!option.disabled) && !isSelected}
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 rounded"
        >
          <span
            aria-hidden="true"
            className={[
              "shrink-0 w-4 h-4 border flex items-center justify-center",
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
          <span
            className={`text-sm font-medium truncate ${
              isSelected ? "text-amber-200" : "text-gray-200"
            }`}
          >
            {option.name}
          </span>
        </button>

        {/* Info button */}
        <InfoButton onClick={onInfo} />
      </div>

      {/* Nested choices rendered outside the selection row */}
      {isSelected && nested && (
        <div className="ml-4 pl-4 border-l-2 border-amber-500/20 mt-2 flex flex-col gap-2">
          {nested}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search input — only rendered when options.length > 15
// ---------------------------------------------------------------------------

interface SearchInputProps {
  query: string;
  onChange: (q: string) => void;
}

function SearchInput({ query, onChange }: SearchInputProps) {
  return (
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
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search..."
        aria-label="Search options"
        className="w-full bg-gray-800/60 border border-gray-700/40 rounded-lg pl-10 pr-9 py-2 text-gray-200 placeholder-gray-500 focus:border-amber-500/50 focus:outline-none text-sm transition-colors"
      />
      {query.length > 0 && (
        <button
          type="button"
          onClick={() => onChange("")}
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
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ChoicePickerProps {
  choice: FeatureChoice;
  selected: string[];
  onSelect: (values: string[]) => void;
  /** Context for resolving pool choices (e.g. className for weapon_mastery). */
  ctx?: ResolveChoiceContext;
  /**
   * Unified nested selections map keyed by choice ID (including nested IDs).
   * Used for both options-based sub-choices and pool-item sub-choices.
   */
  nestedSelections?: Record<string, string[]>;
  onNestedSelect?: (choiceId: string, values: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function ChoicePicker({
  choice,
  selected,
  onSelect,
  ctx,
  nestedSelections = {},
  onNestedSelect,
  disabled = false,
  className,
}: ChoicePickerProps) {
  const radio = choice.count === 1;
  const allPicked = selected.length >= choice.count;
  const remainingText = remainingLabel(choice.count, selected.length);

  const onEntityClick = useEntityClick();

  // Resolve options via shared adapter — no DB imports in this file
  const resolvedOptions = useMemo(() => resolveChoice(choice, ctx), [choice, ctx]);

  // Search state — only used when options.length > 15
  const [query, setQuery] = useState("");

  const visibleOptions = useMemo(() => {
    let opts = resolvedOptions;
    if (opts.length > 15 && query.trim()) {
      const lower = query.trim().toLowerCase();
      opts = opts.filter((o) => o.name.toLowerCase().includes(lower));
    }
    // Sort: enabled options first, disabled last (stable within each group)
    return [...opts].sort((a, b) => {
      const ad = a.disabled ? 1 : 0;
      const bd = b.disabled ? 1 : 0;
      return ad - bd;
    });
  }, [resolvedOptions, query]);

  const handleToggle = (optionId: string) => {
    if (disabled) return;
    onSelect(toggleItem(selected, optionId, choice.count, radio));
  };

  const handleInfo = (option: ResolvedOption, e: React.MouseEvent) => {
    e.stopPropagation();
    onEntityClick?.(
      option.detail.category,
      option.detail.name,
      { x: e.clientX, y: e.clientY },
      option.detail.payload,
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

      {/* Search (only when > 15 options) */}
      {resolvedOptions.length > 15 && (
        <div className="mb-3">
          <SearchInput query={query} onChange={setQuery} />
        </div>
      )}

      {/* Option grid */}
      <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto">
        {visibleOptions.length === 0 && query.trim() && (
          <p className="text-sm text-gray-500 italic py-2 text-center">No results</p>
        )}
        {visibleOptions.map((option) => {
          const isSelected = selected.includes(option.id);
          const isDisabled = disabled || !!option.disabled || (!isSelected && allPicked);

          // Build nested pickers for sub-choices unlocked by this option
          const nestedNode =
            isSelected && option.subChoices && option.subChoices.length > 0
              ? option.subChoices.map((subChoice) => (
                  <ChoicePicker
                    key={subChoice.id}
                    choice={subChoice}
                    selected={nestedSelections[subChoice.id] ?? []}
                    onSelect={(values) => onNestedSelect?.(subChoice.id, values)}
                    ctx={ctx}
                    nestedSelections={nestedSelections}
                    onNestedSelect={onNestedSelect}
                    disabled={disabled}
                  />
                ))
              : undefined;

          return (
            <OptionRow
              key={option.id}
              option={option}
              isSelected={isSelected}
              radio={radio}
              disabled={isDisabled}
              onToggle={() => handleToggle(option.id)}
              onInfo={(e) => handleInfo(option, e)}
              nested={nestedNode}
            />
          );
        })}
      </div>
    </div>
  );
}
