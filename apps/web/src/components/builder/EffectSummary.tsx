"use client";

import type { EntityEffects, Property } from "@unseen-servant/shared/types";
import { ABILITY_ABBR, summarizeEffects } from "@unseen-servant/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EffectSummaryProps {
  effects?: EntityEffects;
  className?: string;
  /** true = single line with overflow hidden, false = wrap */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Badge data shape (kept for visual rendering only)
// ---------------------------------------------------------------------------

interface Badge {
  label: string;
  className: string;
  title?: string;
}

function badgeClassFromProperty(prop: Property, compact: boolean): string | null {
  switch (prop.type) {
    case "resistance":
    case "immunity":
    case "vulnerability":
    case "condition_immunity":
      return prop.type === "immunity"
        ? "bg-red-900/60 text-red-200 border border-red-700/50"
        : "bg-red-900/40 text-red-300 border border-red-700/40";
    case "proficiency":
      return "bg-gray-700/40 text-gray-300 border border-gray-600/40";
    case "expertise":
      return "bg-teal-900/40 text-teal-300 border border-teal-700/40";
    case "sense":
      return "bg-blue-900/40 text-blue-300 border border-blue-700/40";
    case "spell_grant":
      return "bg-violet-900/40 text-violet-300 border border-violet-700/40";
    case "resource":
      return "bg-amber-900/40 text-amber-300 border border-amber-700/40";
    case "advantage":
      return "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40";
    case "disadvantage":
      return "bg-orange-900/40 text-orange-300 border border-orange-700/40";
    case "extra_attack":
    case "weapon_mastery_grant":
    case "score_cap":
    case "roll_minimum":
      return "bg-amber-900/40 text-amber-300 border border-amber-700/40";
    case "crit_rider":
      return "bg-red-900/40 text-red-300 border border-red-700/40";
    case "grant":
      return "bg-purple-900/40 text-purple-300 border border-purple-700/40";
    case "note":
      if (compact) return null;
      return "bg-transparent text-gray-500 border-0 italic text-left";
    default:
      return "bg-gray-700/40 text-gray-300 border border-gray-600/40";
  }
}

function modifierBadgeClass(target: string): string {
  if (target in ABILITY_ABBR) return "bg-amber-900/40 text-amber-300 border border-amber-700/40";
  if (target === "ac") return "bg-blue-900/40 text-blue-300 border border-blue-700/40";
  if (target === "hp") return "bg-red-900/40 text-red-300 border border-red-700/40";
  if (target === "speed" || target.startsWith("speed_"))
    return "bg-green-900/40 text-green-300 border border-green-700/40";
  if (target === "initiative") return "bg-green-900/40 text-green-300 border border-green-700/40";
  if (target.startsWith("attack") || target.startsWith("damage"))
    return "bg-amber-900/40 text-amber-300 border border-amber-700/40";
  return "bg-gray-700/40 text-gray-300 border border-gray-600/40";
}

// ---------------------------------------------------------------------------
// Main component — thin wrapper over shared summarizeEffects
// ---------------------------------------------------------------------------

export function EffectSummary({ effects, className, compact = false }: EffectSummaryProps) {
  if (!effects) return null;

  const badges: Badge[] = [];

  if (effects.modifiers) {
    for (const mod of effects.modifiers) {
      const label = summarizeEffects({ modifiers: [mod] });
      if (label) {
        badges.push({ label, className: modifierBadgeClass(mod.target) });
      }
    }
  }

  if (effects.properties) {
    for (const prop of effects.properties) {
      const cssClass = badgeClassFromProperty(prop, compact);
      if (cssClass === null) continue;
      const label = summarizeEffects({ properties: [prop] });
      if (label) {
        badges.push({ label, className: cssClass });
      }
    }
  }

  if (badges.length === 0) return null;

  const containerClass = [
    "flex gap-1",
    compact ? "flex-nowrap overflow-hidden" : "flex-wrap",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass}>
      {badges.map((badge, i) => (
        <span
          key={i}
          className={[
            "inline-flex items-center px-2 py-0.5 rounded text-xs border",
            badge.className,
          ].join(" ")}
          title={badge.title}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
