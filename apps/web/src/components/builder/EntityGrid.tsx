"use client";

import { useState, useMemo, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EntityGridProps<T extends { name: string }> {
  items: T[];
  selected: string | null;
  onSelect: (name: string) => void;
  renderCard: (item: T, isSelected: boolean) => ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityGrid<T extends { name: string }>({
  items,
  selected,
  onSelect,
  renderCard,
  searchable = false,
  searchPlaceholder = "Search...",
  className,
}: EntityGridProps<T>) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchable || query.trim() === "") return items;
    const lower = query.trim().toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(lower));
  }, [items, searchable, query]);

  return (
    <div className={["flex flex-col gap-3", className].filter(Boolean).join(" ")}>
      {/* Search bar */}
      {searchable && (
        <div className="relative">
          {/* Search icon */}
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
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full bg-gray-800/60 border border-gray-700/40 rounded-lg pl-10 pr-4 py-2 text-gray-200 placeholder-gray-500 focus:border-amber-500/50 focus:outline-none text-sm transition-colors"
          />
          {/* Clear button */}
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
      )}

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((item) => (
            <div
              key={item.name}
              role="button"
              tabIndex={0}
              aria-pressed={selected === item.name}
              onClick={() => onSelect(item.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(item.name);
                }
              }}
              className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 rounded-lg"
            >
              {renderCard(item, selected === item.name)}
            </div>
          ))}
        </div>
      ) : (
        <div className="py-10 text-center text-sm text-gray-500">
          {searchable && query.trim().length > 0
            ? `No results for "${query}"`
            : "No items available."}
        </div>
      )}
    </div>
  );
}
