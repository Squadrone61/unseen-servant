import type { AbilityScores } from "@aidnd/shared/types";
import { getAbilityMod } from "./utils";

const ABILITY_KEYS: (keyof AbilityScores)[] = [
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
];

const ABILITY_SHORT: Record<keyof AbilityScores, string> = {
  strength: "STR", dexterity: "DEX", constitution: "CON",
  intelligence: "INT", wisdom: "WIS", charisma: "CHA",
};

interface ASIAbilityPickerProps {
  mode: "two-one" | "three-ones";
  assignments: Partial<Record<keyof AbilityScores, number>>;
  onChange: (assignments: Partial<Record<keyof AbilityScores, number>>) => void;
  /** Current ability scores to display (optional) */
  currentScores?: AbilityScores;
  /** Label for the section */
  label?: string;
  /** When provided, only these abilities are selectable (others are dimmed/disabled) */
  allowedAbilities?: (keyof AbilityScores)[];
}

export function ASIAbilityPicker({
  mode,
  assignments,
  onChange,
  currentScores,
  allowedAbilities,
}: ASIAbilityPickerProps) {
  if (mode === "two-one") {
    return (
      <TwoOnePicker
        assignments={assignments}
        onChange={onChange}
        currentScores={currentScores}
        allowedAbilities={allowedAbilities}
      />
    );
  }
  return (
    <ThreeOnesPicker
      assignments={assignments}
      onChange={onChange}
      currentScores={currentScores}
      allowedAbilities={allowedAbilities}
    />
  );
}

function TwoOnePicker({
  assignments,
  onChange,
  currentScores,
  allowedAbilities,
}: {
  assignments: Partial<Record<keyof AbilityScores, number>>;
  onChange: (a: Partial<Record<keyof AbilityScores, number>>) => void;
  currentScores?: AbilityScores;
  allowedAbilities?: (keyof AbilityScores)[];
}) {
  const plusTwo = Object.entries(assignments).find(([, v]) => v === 2)?.[0] as
    | keyof AbilityScores
    | undefined;
  const plusOne = Object.entries(assignments).find(([, v]) => v === 1)?.[0] as
    | keyof AbilityScores
    | undefined;

  return (
    <div className="grid grid-cols-6 gap-2">
      {ABILITY_KEYS.map((ability) => {
        const is2 = plusTwo === ability;
        const is1 = plusOne === ability;
        const isDisabled = allowedAbilities && allowedAbilities.length > 0 && !allowedAbilities.includes(ability);
        return (
          <div key={ability} className={`text-center space-y-1 ${isDisabled ? "opacity-30" : ""}`}>
            <div className="text-xs text-gray-500 uppercase">
              {ABILITY_SHORT[ability]}
            </div>
            {currentScores && (
              <div className="text-xs text-gray-400">
                {currentScores[ability]}
                <span className="text-gray-600 ml-0.5">
                  ({getAbilityMod(currentScores[ability]) >= 0 ? "+" : ""}
                  {getAbilityMod(currentScores[ability])})
                </span>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <button
                disabled={isDisabled}
                onClick={() => {
                  const next = { ...assignments };
                  if (plusTwo) delete next[plusTwo];
                  if (!is2) {
                    if (is1) delete next[ability];
                    next[ability] = 2;
                  }
                  onChange(next);
                }}
                className={`text-xs px-1 py-0.5 rounded transition-colors ${
                  is2
                    ? "bg-amber-500/80 text-white"
                    : isDisabled
                      ? "bg-gray-900/60 text-gray-700 cursor-not-allowed"
                      : "bg-gray-900/60 text-gray-500 hover:text-gray-300"
                }`}
              >
                +2
              </button>
              <button
                disabled={isDisabled}
                onClick={() => {
                  const next = { ...assignments };
                  if (plusOne) delete next[plusOne];
                  if (!is1) {
                    if (is2) delete next[ability];
                    next[ability] = 1;
                  }
                  onChange(next);
                }}
                className={`text-xs px-1 py-0.5 rounded transition-colors ${
                  is1
                    ? "bg-amber-500/60 text-white"
                    : isDisabled
                      ? "bg-gray-900/60 text-gray-700 cursor-not-allowed"
                      : "bg-gray-900/60 text-gray-500 hover:text-gray-300"
                }`}
              >
                +1
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ThreeOnesPicker({
  assignments,
  onChange,
  currentScores,
  allowedAbilities,
}: {
  assignments: Partial<Record<keyof AbilityScores, number>>;
  onChange: (a: Partial<Record<keyof AbilityScores, number>>) => void;
  currentScores?: AbilityScores;
  allowedAbilities?: (keyof AbilityScores)[];
}) {
  const selected = Object.entries(assignments)
    .filter(([, v]) => v === 1)
    .map(([k]) => k as keyof AbilityScores);

  return (
    <div className="grid grid-cols-6 gap-2">
      {ABILITY_KEYS.map((ability) => {
        const isSelected = selected.includes(ability);
        const isDisabled = allowedAbilities && allowedAbilities.length > 0 && !allowedAbilities.includes(ability);
        return (
          <div key={ability} className={`text-center space-y-1 ${isDisabled ? "opacity-30" : ""}`}>
            <div className="text-xs text-gray-500 uppercase">
              {ABILITY_SHORT[ability]}
            </div>
            {currentScores && (
              <div className="text-xs text-gray-400">
                {currentScores[ability]}
                <span className="text-gray-600 ml-0.5">
                  ({getAbilityMod(currentScores[ability]) >= 0 ? "+" : ""}
                  {getAbilityMod(currentScores[ability])})
                </span>
              </div>
            )}
            <button
              onClick={() => {
                if (isSelected) {
                  const next = { ...assignments };
                  delete next[ability];
                  onChange(next);
                } else if (selected.length < 3) {
                  onChange({ ...assignments, [ability]: 1 });
                }
              }}
              disabled={isDisabled || (!isSelected && selected.length >= 3)}
              className={`text-xs px-2 py-1 rounded w-full transition-colors ${
                isSelected
                  ? "bg-amber-500/60 text-white"
                  : isDisabled
                    ? "bg-gray-900/60 text-gray-700 cursor-not-allowed"
                    : selected.length >= 3
                      ? "bg-gray-900/60 text-gray-700"
                      : "bg-gray-900/60 text-gray-500 hover:text-gray-300"
              }`}
            >
              +1
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Simple +2/+1 Picker for Class ASI ─────────────────

interface ClassASIPickerProps {
  mode: "two" | "one-one";
  assignments: Partial<Record<keyof AbilityScores, number>>;
  onChange: (assignments: Partial<Record<keyof AbilityScores, number>>) => void;
  currentScores?: AbilityScores;
}

export function ClassASIPicker({
  mode,
  assignments,
  onChange,
  currentScores,
}: ClassASIPickerProps) {
  if (mode === "two") {
    // +2 to one ability
    const selected = Object.entries(assignments).find(([, v]) => v === 2)?.[0] as
      | keyof AbilityScores
      | undefined;

    return (
      <div className="grid grid-cols-6 gap-2">
        {ABILITY_KEYS.map((ability) => {
          const isSelected = selected === ability;
          const score = currentScores?.[ability];
          return (
            <button
              key={ability}
              onClick={() => onChange(isSelected ? {} : { [ability]: 2 })}
              className={`text-center p-2 rounded-lg border transition-all duration-200 ${
                isSelected
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                  : "border-gray-700/50 bg-gray-800/50 text-gray-400 hover:border-gray-600"
              }`}
            >
              <div className="text-xs text-gray-500 uppercase">{ABILITY_SHORT[ability]}</div>
              {score !== undefined && (
                <div className="text-sm font-medium">{score}</div>
              )}
              <div className={`text-xs ${isSelected ? "text-amber-400" : "text-gray-600"}`}>
                +2
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // +1 to two different abilities
  const selected = Object.entries(assignments)
    .filter(([, v]) => v === 1)
    .map(([k]) => k as keyof AbilityScores);

  return (
    <div className="grid grid-cols-6 gap-2">
      {ABILITY_KEYS.map((ability) => {
        const isSelected = selected.includes(ability);
        const score = currentScores?.[ability];
        return (
          <button
            key={ability}
            onClick={() => {
              if (isSelected) {
                const next = { ...assignments };
                delete next[ability];
                onChange(next);
              } else if (selected.length < 2) {
                onChange({ ...assignments, [ability]: 1 });
              }
            }}
            disabled={!isSelected && selected.length >= 2}
            className={`text-center p-2 rounded-lg border transition-all duration-200 ${
              isSelected
                ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                : selected.length >= 2
                  ? "border-gray-700/50 bg-gray-800/50 text-gray-600"
                  : "border-gray-700/50 bg-gray-800/50 text-gray-400 hover:border-gray-600"
            }`}
          >
            <div className="text-xs text-gray-500 uppercase">{ABILITY_SHORT[ability]}</div>
            {score !== undefined && (
              <div className="text-sm font-medium">{score}</div>
            )}
            <div className={`text-xs ${isSelected ? "text-amber-400" : "text-gray-600"}`}>
              +1
            </div>
          </button>
        );
      })}
    </div>
  );
}
