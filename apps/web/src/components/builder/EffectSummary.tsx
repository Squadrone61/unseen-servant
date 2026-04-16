"use client";

import type { EntityEffects, Modifier, Property } from "@unseen-servant/shared/types";

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
// Badge data shape
// ---------------------------------------------------------------------------

interface Badge {
  label: string;
  className: string;
  /** Full text for tooltip — set when label is truncated */
  title?: string;
}

// ---------------------------------------------------------------------------
// Helpers — Modifier → Badge
// ---------------------------------------------------------------------------

/** Format a modifier value as a short prefix string like "+2", "+Prof", "+Expr" */
function formatValue(value: number | string): string {
  if (typeof value === "number") {
    return value >= 0 ? `+${value}` : String(value);
  }
  // Expression strings: produce a human-readable prefix
  if (value === "prof") return "+Prof";
  if (value.includes("*")) return `+Scaled`;
  if (value.includes("table")) return "+Scaled";
  // Fallback: truncate long expressions
  const trimmed = value.length > 10 ? value.slice(0, 9) + "…" : value;
  return `+${trimmed}`;
}

/** Capitalise first letter of each word */
function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

const ABILITY_ABBR: Record<string, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

function modifierBadge(mod: Modifier): Badge {
  const prefix = formatValue(mod.value);
  const t = mod.target;

  // Ability score modifiers (via the "set" unarmored-defense style or direct ability targets)
  if (t in ABILITY_ABBR) {
    return {
      label: `${prefix} ${ABILITY_ABBR[t]}`,
      className: "bg-amber-900/40 text-amber-300 border border-amber-700/40",
    };
  }

  if (t === "ac") {
    return {
      label: `${prefix} AC`,
      className: "bg-blue-900/40 text-blue-300 border border-blue-700/40",
    };
  }

  if (t === "hp") {
    // Detect per-level pattern in expression
    const isPerLevel =
      typeof mod.value === "string" && (mod.value.includes("lvl") || mod.value.includes("*"));
    return {
      label: isPerLevel ? `${prefix} HP/lvl` : `${prefix} HP`,
      className: "bg-red-900/40 text-red-300 border border-red-700/40",
    };
  }

  if (t === "speed" || t.startsWith("speed_")) {
    const suffix = t === "speed" ? "Speed" : titleCase(t.replace("speed_", "") + " Speed");
    return {
      label: `${prefix} ${suffix}`,
      className: "bg-green-900/40 text-green-300 border border-green-700/40",
    };
  }

  if (t === "initiative") {
    return {
      label: `${prefix} Initiative`,
      className: "bg-green-900/40 text-green-300 border border-green-700/40",
    };
  }

  if (t.startsWith("attack")) {
    const suffix = t === "attack" ? "Attack" : titleCase(t.replace("attack_", "") + " Attack");
    return {
      label: `${prefix} ${suffix}`,
      className: "bg-amber-900/40 text-amber-300 border border-amber-700/40",
    };
  }

  if (t.startsWith("damage")) {
    const suffix = t === "damage" ? "Damage" : titleCase(t.replace("damage_", "") + " Damage");
    return {
      label: `${prefix} ${suffix}`,
      className: "bg-amber-900/40 text-amber-300 border border-amber-700/40",
    };
  }

  // Fallback
  const readable = titleCase(t.replace(/_/g, " "));
  return {
    label: `${prefix} ${readable}`,
    className: "bg-gray-700/40 text-gray-300 border border-gray-600/40",
  };
}

// ---------------------------------------------------------------------------
// Helpers — Property → Badge
// ---------------------------------------------------------------------------

/** Format a usage string into a short human-readable suffix */
function formatUsage(
  usage: "at_will" | "always_prepared" | `${number}/${"short" | "long"}_rest`,
): string {
  if (usage === "at_will") return "at will";
  if (usage === "always_prepared") return "prepared";
  // e.g. "1/long_rest" → "1/LR", "2/short_rest" → "2/SR"
  return usage.replace("/long_rest", "/LR").replace("/short_rest", "/SR");
}

function propertyBadge(prop: Property, compact: boolean): Badge | null {
  switch (prop.type) {
    case "resistance":
      return {
        label: `Resist ${titleCase(prop.damageType)}`,
        className: "bg-red-900/40 text-red-300 border border-red-700/40",
      };

    case "immunity":
      return {
        label: `Immune ${titleCase(prop.damageType)}`,
        className: "bg-red-900/60 text-red-200 border border-red-700/50",
      };

    case "vulnerability":
      return {
        label: `Vuln ${titleCase(prop.damageType)}`,
        className: "bg-red-900/40 text-red-300 border border-red-700/40",
      };

    case "condition_immunity":
      return {
        label: `Immune: ${prop.conditionName}`,
        className: "bg-red-900/40 text-red-300 border border-red-700/40",
      };

    case "proficiency": {
      const label = `Prof: ${titleCase(prop.value)}`;
      return {
        label,
        className: "bg-gray-700/40 text-gray-300 border border-gray-600/40",
      };
    }

    case "expertise":
      return {
        label: `Expertise: ${prop.skill}`,
        className: "bg-teal-900/40 text-teal-300 border border-teal-700/40",
      };

    case "sense": {
      const senseLabel = titleCase(prop.sense);
      return {
        label: `${senseLabel} ${prop.range}ft`,
        className: "bg-blue-900/40 text-blue-300 border border-blue-700/40",
      };
    }

    case "spell_grant": {
      const usageSuffix = formatUsage(prop.usage);
      return {
        label: `${titleCase(prop.spell)} (${usageSuffix})`,
        className: "bg-violet-900/40 text-violet-300 border border-violet-700/40",
      };
    }

    case "resource": {
      const restLabel =
        [prop.shortRest && "SR", prop.longRest && "LR"].filter(Boolean).join("/") || "LR";
      const maxLabel = typeof prop.maxUses === "number" ? String(prop.maxUses) : "Scaled";
      return {
        label: `${prop.name} (${maxLabel}/${restLabel})`,
        className: "bg-amber-900/40 text-amber-300 border border-amber-700/40",
      };
    }

    case "advantage": {
      const target = titleCase(prop.on.replace(/_/g, " "));
      return {
        label: `Adv: ${target}`,
        className: "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40",
      };
    }

    case "disadvantage": {
      const target = titleCase(prop.on.replace(/_/g, " "));
      return {
        label: `Disadv: ${target}`,
        className: "bg-orange-900/40 text-orange-300 border border-orange-700/40",
      };
    }

    case "extra_attack":
      return {
        label: prop.count > 1 ? `Extra Attack ×${prop.count}` : "Extra Attack",
        className: "bg-amber-900/40 text-amber-300 border border-amber-700/40",
      };

    case "score_cap":
      return {
        label: `${titleCase(prop.ability)} Max ${prop.max}`,
        className: "bg-amber-900/40 text-amber-300 border border-amber-700/40",
      };

    case "grant":
      return {
        label: `Grants: ${prop.grant}`,
        className: "bg-purple-900/40 text-purple-300 border border-purple-700/40",
      };

    case "note": {
      if (compact) return null;
      return {
        label: prop.text,
        className: "bg-transparent text-gray-500 border-0 italic text-left",
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EffectSummary({ effects, className, compact = false }: EffectSummaryProps) {
  if (!effects) return null;

  const badges: Badge[] = [];

  if (effects.modifiers) {
    for (const mod of effects.modifiers) {
      badges.push(modifierBadge(mod));
    }
  }

  if (effects.properties) {
    for (const prop of effects.properties) {
      const badge = propertyBadge(prop, compact);
      if (badge) badges.push(badge);
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
