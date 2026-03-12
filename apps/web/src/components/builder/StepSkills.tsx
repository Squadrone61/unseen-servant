import { useMemo } from "react";
import { getClass, getBackground } from "@aidnd/shared/data";
import type { AbilityScores } from "@aidnd/shared/types";
import type { StepProps } from "./types";
import {
  SKILL_ABILITY_MAP,
  formatSkillName,
  getAbilityMod,
  getFinalAbilities,
  getSpeciesSkills,
} from "./utils";

const ABILITY_ORDER: (keyof AbilityScores)[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

export function StepSkills({ state, dispatch }: StepProps) {
  const cls = state.className ? getClass(state.className) : null;
  const bg = state.background ? getBackground(state.background) : null;
  const finalAbilities = useMemo(() => getFinalAbilities(state), [state]);

  const bgSkills = useMemo(() => new Set(bg?.skillProficiencies ?? []), [bg]);
  const speciesSkills = useMemo(() => new Set(getSpeciesSkills(state)), [state]);
  const classSkillPool = useMemo(
    () => new Set(cls?.skillChoices.from ?? []),
    [cls]
  );
  const maxClassPicks = cls?.skillChoices.count ?? 0;

  // Expertise eligibility (2024 PHB levels)
  const canHaveExpertise = useMemo(() => {
    if (!state.className) return false;
    const lc = state.className.toLowerCase();
    if (lc === "rogue") return true;
    if (lc === "bard" && state.level >= 2) return true;
    if (lc === "ranger" && state.level >= 9) return true;
    return false;
  }, [state.className, state.level]);

  const maxExpertise = useMemo(() => {
    if (!state.className) return 0;
    const lc = state.className.toLowerCase();
    if (lc === "rogue") return state.level >= 6 ? 4 : 2;
    if (lc === "bard") return state.level >= 9 ? 4 : state.level >= 2 ? 2 : 0;
    if (lc === "ranger" && state.level >= 9) return 2;
    return 0;
  }, [state.className, state.level]);

  const profBonus = Math.ceil(state.level / 4) + 1;

  // Jack of All Trades: Bard level 2+ adds half-prof to non-proficient checks
  const hasJackOfAllTrades = state.className?.toLowerCase() === "bard" && state.level >= 2;
  const halfProfBonus = hasJackOfAllTrades ? Math.floor(profBonus / 2) : 0;

  // Group skills by ability
  const skillsByAbility = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const ability of ABILITY_ORDER) {
      groups[ability] = Object.entries(SKILL_ABILITY_MAP)
        .filter(([, ab]) => ab === ability)
        .map(([skill]) => skill)
        .sort();
    }
    return groups;
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-200 mb-1">
          Skill Proficiencies
        </h2>
        <p className="text-xs text-gray-500">
          Background and species skills are automatically included. Choose{" "}
          <span className="text-purple-400">{maxClassPicks}</span> class skills
          from the available options.
          {state.skillProficiencies.length > 0 && (
            <span className="ml-1">
              ({state.skillProficiencies.length}/{maxClassPicks} selected)
            </span>
          )}
        </p>
      </div>

      <div className="space-y-4">
        {ABILITY_ORDER.map((ability) => {
          const skills = skillsByAbility[ability];
          if (!skills || skills.length === 0) return null;
          // Hide ability groups with no selectable skills (e.g. Constitution)
          if (ability === "constitution") return null;

          return (
            <div key={ability}>
              <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">
                {ability.charAt(0).toUpperCase() + ability.slice(1)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {skills.map((skill) => {
                  const isBgSkill = bgSkills.has(skill);
                  const isSpeciesSkill = speciesSkills.has(skill);
                  const isGranted = isBgSkill || isSpeciesSkill;
                  const isClassPick =
                    state.skillProficiencies.includes(skill);
                  const isProficient = isGranted || isClassPick;
                  const isExpertise =
                    state.skillExpertise.includes(skill);
                  const inClassPool = classSkillPool.has(skill);
                  const atMax =
                    state.skillProficiencies.length >= maxClassPicks;

                  const abilityMod = getAbilityMod(finalAbilities[ability]);
                  let bonus = abilityMod;
                  if (isProficient) bonus += profBonus;
                  if (isExpertise) bonus += profBonus;
                  if (!isProficient && halfProfBonus > 0) bonus += halfProfBonus;

                  return (
                    <div
                      key={skill}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                        isGranted
                          ? "border-emerald-800/30 bg-emerald-900/10"
                          : isClassPick
                            ? "border-purple-500/30 bg-purple-600/10"
                            : "border-gray-700 bg-gray-800"
                      }`}
                    >
                      {/* Checkbox / indicator */}
                      {isGranted ? (
                        <div className="w-4 h-4 rounded border border-emerald-600 bg-emerald-600/30 flex items-center justify-center shrink-0">
                          <svg
                            className="w-3 h-3 text-emerald-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            dispatch({ type: "TOGGLE_SKILL", skill })
                          }
                          disabled={!inClassPool || (!isClassPick && atMax)}
                          className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                            isClassPick
                              ? "border-purple-500 bg-purple-600"
                              : !inClassPool || atMax
                                ? "border-gray-700 bg-gray-900 opacity-30"
                                : "border-gray-600 bg-gray-900 hover:border-gray-500"
                          }`}
                        >
                          {isClassPick && (
                            <svg
                              className="w-3 h-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                      )}

                      <span
                        className={`flex-1 ${
                          isProficient ? "text-gray-200" : "text-gray-500"
                        } ${!inClassPool && !isGranted ? "opacity-50" : ""}`}
                      >
                        {formatSkillName(skill)}
                      </span>

                      {/* Source tag for species skills */}
                      {isSpeciesSkill && !isBgSkill && (
                        <span className="text-[8px] text-emerald-500/60">SP</span>
                      )}

                      {/* Expertise toggle */}
                      {canHaveExpertise && isProficient && (
                        <button
                          onClick={() =>
                            dispatch({ type: "TOGGLE_EXPERTISE", skill })
                          }
                          disabled={
                            !isExpertise &&
                            state.skillExpertise.length >= maxExpertise
                          }
                          className={`text-[9px] px-1 rounded ${
                            isExpertise
                              ? "bg-yellow-600/30 text-yellow-400"
                              : state.skillExpertise.length >= maxExpertise
                                ? "text-gray-700"
                                : "text-gray-600 hover:text-gray-400"
                          }`}
                          title="Expertise"
                        >
                          E
                        </button>
                      )}

                      {/* Bonus */}
                      <span
                        className={`text-[10px] w-6 text-right shrink-0 ${
                          isProficient ? "text-gray-300" : "text-gray-600"
                        }`}
                      >
                        {bonus >= 0 ? "+" : ""}
                        {bonus}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-gray-600">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-emerald-600/50 inline-block" />
          Background / Species
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-purple-600/50 inline-block" />
          Class Pick
        </span>
        {canHaveExpertise && (
          <span className="flex items-center gap-1">
            <span className="text-yellow-400">E</span> Expertise ({state.skillExpertise.length}/{maxExpertise})
          </span>
        )}
      </div>
    </div>
  );
}
