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
        <div className="flex items-center gap-2 flex-wrap">
          {badges.map((badge, i) => {
            const toneClass = badge.tone ? BADGE_CLASSES[badge.tone] : BADGE_CLASSES.gray;
            return (
              <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${toneClass}`}>
                {badge.label}
              </span>
            );
          })}
        </div>
      )}

      {/* 3. Properties grid (2-column) */}
      {properties && properties.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {properties.map((prop, i) => (
            <div key={i} className="bg-gray-900/50 border border-gray-700 rounded px-2 py-1">
              <div className="text-gray-500 uppercase text-[10px]">{prop.label}</div>
              <div className="text-gray-300">{prop.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 4. Description */}
      {description && (
        <RichText
          text={description}
          className="text-gray-300 text-sm"
          onEntityClick={onEntityClick}
        />
      )}

      {/* 5. Effect summary */}
      {effectSummary && (
        <div className="text-xs text-gray-400 italic border-l-2 border-gray-600 pl-2">
          {effectSummary}
        </div>
      )}

      {/* 6. Sections */}
      {sections && sections.length > 0 && (
        <div className="space-y-2">
          {sections.map((section, i) => (
            <div key={i} className="flex items-baseline gap-2 text-sm">
              <div className="text-[11px] text-gray-500 uppercase tracking-wide shrink-0">
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
              className="w-full bg-amber-600/80 hover:bg-amber-500/80 text-amber-100 text-sm font-medium rounded-lg py-2 transition-colors flex items-center justify-center gap-2"
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
