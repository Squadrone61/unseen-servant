"use client";

import { useMemo } from "react";
import { weaponsArray } from "@unseen-servant/shared";
import type { BaseItemDb } from "@unseen-servant/shared/types";

// ---------------------------------------------------------------------------
// Per-class weapon mastery counts at level 1
// (We use level-1 count for character creation; the builder only needs the
//  starting count since higher-level gains are tracked in-play.)
// ---------------------------------------------------------------------------

const MASTERY_COUNT_AT_LEVEL_1: Record<string, number> = {
  Barbarian: 2,
  Fighter: 3,
  Paladin: 2,
  Ranger: 2,
  Rogue: 2,
};

// ---------------------------------------------------------------------------
// Weapon eligibility by class
// ---------------------------------------------------------------------------

/**
 * Returns weapons from the full weapon list that:
 *   1. Have at least one mastery property defined.
 *   2. Fall within the class's weapon proficiency scope.
 *
 * Scope rules:
 *   - Barbarian: Simple + Martial **Melee** only (type starts with "M|")
 *   - Rogue: Simple (all) + Martial with Finesse ("F") or Light ("L") property
 *   - All others (Fighter, Paladin, Ranger): Simple + Martial (all)
 */
function getEligibleWeapons(className: string): BaseItemDb[] {
  const weapons = weaponsArray as BaseItemDb[];
  const withMastery = weapons.filter((w) => w.mastery && w.mastery.length > 0);

  if (className === "Barbarian") {
    // Melee only: the raw DB "type" field starts with "M|" for melee weapons.
    // BaseItemDb doesn't expose the raw type field, so we identify melee weapons
    // as those without a "range" field (ranged weapons always have a range property).
    return withMastery.filter((w) => !w.range);
  }

  if (className === "Rogue") {
    return withMastery.filter((w) => {
      if (w.weaponCategory === "simple") return true;
      if (
        w.weaponCategory === "martial" &&
        w.properties &&
        (w.properties.includes("F") || w.properties.includes("L"))
      )
        return true;
      return false;
    });
  }

  // Fighter, Paladin, Ranger — all Simple + Martial weapons with mastery
  return withMastery;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function remainingLabel(count: number, selected: number): string {
  const rem = count - selected;
  if (rem <= 0) return "All picked";
  return `Pick ${rem} more`;
}

function toggleWeapon(selected: string[], name: string, count: number): string[] {
  if (selected.includes(name)) {
    return selected.filter((s) => s !== name);
  }
  if (selected.length >= count) {
    // Replace the oldest pick
    return [...selected.slice(1), name];
  }
  return [...selected, name];
}

// ---------------------------------------------------------------------------
// Weapon Card
// ---------------------------------------------------------------------------

interface WeaponCardProps {
  weapon: BaseItemDb;
  isSelected: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function WeaponCard({ weapon, isSelected, disabled, onToggle }: WeaponCardProps) {
  const mastery = weapon.mastery?.[0] ?? "";
  const damage = weapon.damage ?? (weapon.versatileDamage ? "1" : "—");
  const damageDisplay = weapon.versatileDamage ? `${damage}/${weapon.versatileDamage}` : damage;

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      disabled={disabled && !isSelected}
      onClick={onToggle}
      className={[
        "text-left w-full rounded-lg border px-3 py-2.5 transition-all duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
        isSelected
          ? "border-amber-500/60 bg-amber-900/20"
          : "border-gray-700/30 bg-gray-800/30 hover:border-gray-600/50 hover:bg-gray-800/50",
        disabled && !isSelected ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        {/* Left: selection indicator + name */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className={[
              "shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center",
              isSelected
                ? "bg-amber-500 border-amber-500 text-gray-900"
                : "bg-gray-800 border-gray-600",
            ].join(" ")}
          >
            {isSelected && (
              <svg
                className="w-2 h-2"
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
          <span
            className={`text-sm font-medium truncate ${
              isSelected ? "text-amber-200" : "text-gray-200"
            }`}
          >
            {weapon.name}
          </span>
        </div>

        {/* Right: damage + mastery badge */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-500 font-mono tabular-nums">{damageDisplay}</span>
          {mastery && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-900/30 text-violet-300 border border-violet-700/30 whitespace-nowrap">
              {mastery}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface WeaponMasteryPickerProps {
  className: string;
  selected: string[];
  onSelect: (weapons: string[]) => void;
  disabled?: boolean;
}

export function WeaponMasteryPicker({
  className,
  selected,
  onSelect,
  disabled = false,
}: WeaponMasteryPickerProps) {
  const count = MASTERY_COUNT_AT_LEVEL_1[className] ?? 2;

  const eligibleWeapons = useMemo(() => {
    const weapons = getEligibleWeapons(className);
    return [...weapons].sort((a, b) => {
      // Simple before martial, then alphabetical within category
      if (a.weaponCategory !== b.weaponCategory) {
        return a.weaponCategory === "simple" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [className]);

  const allPicked = selected.length >= count;
  const remainingText = remainingLabel(count, selected.length);

  function handleToggle(name: string) {
    if (disabled) return;
    onSelect(toggleWeapon(selected, name, count));
  }

  return (
    <div className="bg-gray-800/30 border border-gray-700/20 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-300">Weapon Mastery Choices</span>
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

      {/* Weapon grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {eligibleWeapons.map((weapon) => (
          <WeaponCard
            key={weapon.name}
            weapon={weapon}
            isSelected={selected.includes(weapon.name)}
            disabled={disabled || (!selected.includes(weapon.name) && allPicked)}
            onToggle={() => handleToggle(weapon.name)}
          />
        ))}
      </div>

      {eligibleWeapons.length === 0 && (
        <p className="text-sm text-gray-500 italic">No eligible weapons found.</p>
      )}
    </div>
  );
}
