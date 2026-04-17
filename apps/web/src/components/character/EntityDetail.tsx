"use client";

import type { EntityDetailData, BadgeTone } from "@unseen-servant/shared/detail";
import { RichText } from "@/components/ui/RichText";
import { useEntityClick } from "./EntityPopoverContext";

// ---------------------------------------------------------------------------
// Badge styling
// ---------------------------------------------------------------------------

const BADGE_CLASSES: Record<BadgeTone, string> = {
  amber: "bg-amber-900/20 text-amber-300 border border-amber-700/30",
  blue: "bg-blue-900/30 text-blue-300 border border-blue-700/30",
  green: "bg-green-900/30 text-green-300 border border-green-700/30",
  red: "bg-red-900/30 text-red-300 border border-red-700/30",
  violet: "bg-violet-900/30 text-violet-300 border border-violet-700/30",
  gray: "bg-gray-700/60 text-gray-300 border border-gray-600/40",
  yellow: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/50",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EntityDetailProps {
  data: EntityDetailData;
  onActionTriggered?: (label: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityDetail({ data, onActionTriggered }: EntityDetailProps) {
  const onEntityClick = useEntityClick();
  const { badges, properties, description, effectSummary, subtitle, sections, actions } = data;

  return (
    <div className="space-y-3">
      {/* 1. Subtitle */}
      {subtitle && <div className="text-xs text-gray-400 italic">{subtitle}</div>}

      {/* 2. Badges row */}
      {badges && badges.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {badges.map((badge, i) => {
            const toneClass = badge.tone ? BADGE_CLASSES[badge.tone] : BADGE_CLASSES.gray;
            return (
              <span key={i} className={`rounded-full px-2 py-0.5 text-xs ${toneClass}`}>
                {badge.label}
              </span>
            );
          })}
        </div>
      )}

      {/* 3. Properties grid (2-column) */}
      {properties && properties.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {properties.map((prop, i) => {
            const toneBorder = prop.tone
              ? BADGE_CLASSES[prop.tone]
              : "bg-gray-900/50 border border-gray-700";
            const valueTone =
              prop.tone === "amber"
                ? "text-amber-200 font-medium"
                : prop.tone === "green"
                  ? "text-emerald-200 font-medium"
                  : "text-gray-300";
            return (
              <div key={i} className={`${toneBorder} rounded px-2 py-1`}>
                <div className="text-xs text-gray-500 uppercase">{prop.label}</div>
                <div className={valueTone}>{prop.value}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Description */}
      {description && (
        <RichText
          text={description}
          className="text-sm text-gray-300"
          onEntityClick={onEntityClick}
        />
      )}

      {/* 5. Effect summary */}
      {effectSummary && (
        <div className="border-l-2 border-gray-600 pl-2 text-xs text-gray-400 italic">
          {effectSummary}
        </div>
      )}

      {/* 6. Sections */}
      {sections && sections.length > 0 && (
        <div className="space-y-2">
          {sections.map((section, i) => (
            <div key={i} className="flex items-baseline gap-2 text-sm">
              <div className="shrink-0 text-xs tracking-wide text-gray-500 uppercase">
                {section.heading}
              </div>
              <RichText
                text={section.body}
                className="text-gray-300"
                onEntityClick={onEntityClick}
              />
            </div>
          ))}
        </div>
      )}

      {/* 7. Action hints / CTAs */}
      {actions && actions.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => onActionTriggered?.(action.label)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600/80 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/80"
            >
              <span>{action.label}</span>
              {action.hint && <span className="text-xs text-amber-300/70">{action.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
