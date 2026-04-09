"use client";

import { useState } from "react";
import type { EntityEffects } from "@unseen-servant/shared/types";
import { RichText } from "@/components/ui/RichText";
import { EffectSummary } from "./EffectSummary";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityCardProps {
  name: string;
  description?: string;
  effects?: EntityEffects;
  /** Quick stat badges shown below name — e.g. "Small/Medium", "30 ft", "DV 60" */
  stats?: string[];
  /** Category/type badges — e.g. "General", "Level 4+", "Evocation" */
  tags?: { label: string; color?: string }[];
  selected?: boolean;
  onClick?: () => void;
  /** If true, description starts collapsed with "Show more" toggle */
  expandable?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Tag badge
// ---------------------------------------------------------------------------

function TagBadge({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded text-xs border",
        color ? color : "bg-gray-700/40 text-gray-400 border-gray-600/40",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EntityCard({
  name,
  description,
  effects,
  stats,
  tags,
  selected = false,
  onClick,
  expandable = false,
  className,
}: EntityCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasDescription = Boolean(description);
  const isExpandable = expandable && hasDescription;
  const showDescription = hasDescription && (!isExpandable || expanded);

  const hasEffects =
    (effects?.modifiers?.length ?? 0) > 0 || (effects?.properties?.length ?? 0) > 0;
  const hasStats = stats && stats.length > 0;
  const hasTags = tags && tags.length > 0;

  const baseClass = [
    "bg-gray-800/40 border border-gray-700/30 rounded-lg p-4 transition-all duration-200",
    "hover:border-gray-600/50 hover:bg-gray-800/60",
    selected ? "border-amber-500/50 bg-amber-950/20 ring-1 ring-amber-500/20" : "",
    onClick ? "cursor-pointer" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={baseClass}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-pressed={onClick ? selected : undefined}
    >
      {/* Header row: name + tags */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-cinzel text-sm font-semibold text-gray-100 leading-snug">{name}</h3>
        {hasTags && (
          <div className="flex items-center gap-1 flex-wrap justify-end shrink-0">
            {tags!.map((tag, i) => (
              <TagBadge key={i} label={tag.label} color={tag.color} />
            ))}
          </div>
        )}
      </div>

      {/* Quick stats row */}
      {hasStats && (
        <p className="text-xs text-gray-400 mb-2 leading-relaxed">
          {stats!.map((s, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1 text-gray-600">&middot;</span>}
              {s}
            </span>
          ))}
        </p>
      )}

      {/* Effect badges */}
      {hasEffects && (
        <div className="mb-2">
          <EffectSummary effects={effects} compact={false} />
        </div>
      )}

      {/* Description */}
      {showDescription && (
        <div className="text-xs text-gray-400 leading-relaxed mt-1">
          <RichText text={description!} />
        </div>
      )}

      {/* Expand/collapse toggle */}
      {isExpandable && (
        <button
          type="button"
          className="mt-2 flex items-center gap-1 text-xs text-amber-400/70 hover:text-amber-300 transition-colors duration-150 focus:outline-none"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          aria-expanded={expanded}
        >
          <span
            className="inline-block transition-transform duration-150"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            &#9658;
          </span>
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
