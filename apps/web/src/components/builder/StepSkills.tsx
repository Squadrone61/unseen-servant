import { useMemo } from "react";
import { motion } from "framer-motion";
import { getClass, getBackground } from "@unseen-servant/shared/data";
import { getSkillChoices, getBackgroundSkills } from "@unseen-servant/shared";
import type { AbilityScores } from "@unseen-servant/shared/types";
import type { StepProps } from "./types";
import {
  SKILL_ABILITY_MAP,
  formatSkillName,
  getAbilityMod,
  getFinalAbilities,
  getSpeciesSkills,
} from "./utils";
import { gridItem } from "./animations";

const ABILITY_ORDER: (keyof AbilityScores)[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

const ABILITY_ABBREV: Record<keyof AbilityScores, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

const ABILITY_ACCENT: Record<keyof AbilityScores, string> = {
  strength: "bg-red-500/60",
  dexterity: "bg-green-500/60",
  constitution: "bg-orange-500/60",
  intelligence: "bg-blue-500/60",
  wisdom: "bg-purple-500/60",
  charisma: "bg-pink-500/60",
};

export function StepSkills({ state, dispatch }: StepProps) {
  const primaryClass = state.classes[0];
  const cls = primaryClass?.className ? getClass(primaryClass.className) : null;
  const bg = state.background ? getBackground(state.background) : null;
  const finalAbilities = useMemo(() => getFinalAbilities(state), [state]);

  const bgSkills = useMemo(() => {
    const skills = bg ? getBackgroundSkills(bg) : [];
    // Include Skilled feat skill choices from background origin feat
    if (state.originFeatOverrides.skillChoices) {
      skills.push(...state.originFeatOverrides.skillChoices);
    }
    return new Set(skills);
  }, [bg, state.originFeatOverrides.skillChoices]);
  const speciesSkills = useMemo(() => {
    const skills = getSpeciesSkills(state);
    // Include Skilled feat skill choices from species origin feat
    if (state.speciesOriginFeatOverrides.skillChoices) {
      skills.push(...state.speciesOriginFeatOverrides.skillChoices);
    }
    return new Set(skills);
  }, [state]);
  const classSkillChoices = cls ? getSkillChoices(cls) : undefined;
  const maxClassPicks = classSkillChoices?.count ?? 0;

  // Expertise eligibility (2024 PHB levels) — check across all classes
  const canHaveExpertise = useMemo(() => {
    return state.classes.some((c) => {
      const lc = c.className.toLowerCase();
      if (lc === "rogue") return true;
      if (lc === "bard" && c.level >= 2) return true;
      if (lc === "ranger" && c.level >= 9) return true;
      return false;
    });
  }, [state.classes]);

  const maxExpertise = useMemo(() => {
    let total = 0;
    for (const c of state.classes) {
      const lc = c.className.toLowerCase();
      if (lc === "rogue") total += c.level >= 6 ? 4 : 2;
      else if (lc === "bard") total += c.level >= 9 ? 4 : c.level >= 2 ? 2 : 0;
      else if (lc === "ranger" && c.level >= 9) total += 2;
    }
    return total;
  }, [state.classes]);

  const totalLevel = state.classes.reduce((sum, c) => sum + c.level, 0);
  const profBonus = Math.ceil(totalLevel / 4) + 1;

  // Jack of All Trades: Bard level 2+ adds half-prof to non-proficient checks
  const hasJackOfAllTrades = state.classes.some(
    (c) => c.className.toLowerCase() === "bard" && c.level >= 2
  );
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

  const classPickCount = state.skillProficiencies.length;
  const classPicksComplete = classPickCount >= maxClassPicks;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <h2
          className="text-xl font-semibold text-amber-200/90 tracking-wide"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Skill Proficiencies
        </h2>
        <p className="text-sm text-gray-500">
          Background and species skills are automatically included. Choose {maxClassPicks > 0 ? maxClassPicks : "your"} additional
          skill proficiencies.
        </p>
        <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
      </div>

      {/* Prominent counter */}
      {maxClassPicks > 0 && (
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
              classPicksComplete
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-gray-700/60 bg-gray-800/60 text-gray-400"
            }`}
          >
            <span
              className={`text-base font-bold tabular-nums ${
                classPicksComplete ? "text-amber-300" : "text-gray-200"
              }`}
            >
              {classPickCount}
              <span className="text-gray-500 font-normal">/{maxClassPicks}</span>
            </span>
            <span>class skills selected</span>
            {classPicksComplete && (
              <svg
                className="w-3.5 h-3.5 text-amber-400 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
          {canHaveExpertise && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-yellow-700/40 bg-yellow-900/10 text-xs font-medium text-yellow-400/80">
              <ExpertiseBadge active={false} size="sm" />
              <span>
                {state.skillExpertise.length}
                <span className="text-yellow-700">/{maxExpertise}</span> expertise
              </span>
            </div>
          )}
          {hasJackOfAllTrades && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-blue-700/30 bg-blue-900/10 text-xs text-blue-400/70">
              <span>Jack of All Trades</span>
              <span className="text-blue-500/50">(+{halfProfBonus})</span>
            </div>
          )}
        </div>
      )}

      {/* Skill groups */}
      <div className="space-y-4">
        {ABILITY_ORDER.map((ability, groupIndex) => {
          const skills = skillsByAbility[ability];
          if (!skills || skills.length === 0) return null;
          if (ability === "constitution") return null;

          const abilityMod = getAbilityMod(finalAbilities[ability]);
          const modSign = abilityMod >= 0 ? "+" : "";
          const accentColor = ABILITY_ACCENT[ability];

          return (
            <motion.div
              key={ability}
              variants={gridItem}
              initial="initial"
              animate="animate"
              custom={groupIndex}
            >
              {/* Ability group header */}
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-0.5 h-4 rounded-full ${accentColor}`} />
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  {ABILITY_ABBREV[ability]}
                </span>
                <span className="text-xs text-gray-600">·</span>
                <span
                  className={`text-xs font-mono font-bold tabular-nums ${
                    abilityMod > 0
                      ? "text-green-400"
                      : abilityMod < 0
                        ? "text-red-400"
                        : "text-gray-500"
                  }`}
                >
                  {modSign}{abilityMod}
                </span>
                <div className="flex-1 h-px bg-gray-800/60 ml-1" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {skills.map((skill, skillIndex) => {
                  const isBgSkill = bgSkills.has(skill);
                  const isSpeciesSkill = speciesSkills.has(skill);
                  const isGranted = isBgSkill || isSpeciesSkill;
                  const isClassPick = state.skillProficiencies.includes(skill);
                  const isProficient = isGranted || isClassPick;
                  const isExpertise = state.skillExpertise.includes(skill);
                  const atMax = state.skillProficiencies.length >= maxClassPicks;

                  let bonus = abilityMod;
                  if (isProficient) bonus += profBonus;
                  if (isExpertise) bonus += profBonus;
                  if (!isProficient && halfProfBonus > 0) bonus += halfProfBonus;

                  const bonusSign = bonus >= 0 ? "+" : "";
                  const bonusColor =
                    bonus > 0
                      ? "text-green-400"
                      : bonus < 0
                        ? "text-red-400"
                        : "text-gray-500";

                  return (
                    <motion.div
                      key={skill}
                      variants={gridItem}
                      initial="initial"
                      animate="animate"
                      custom={groupIndex * 10 + skillIndex}
                      className={`relative flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                        isGranted
                          ? "border-emerald-700/40 bg-emerald-900/15 shadow-[inset_0_0_8px_rgba(16,185,129,0.04)]"
                          : isClassPick
                            ? "border-amber-500/40 bg-amber-500/10 shadow-[inset_0_0_8px_rgba(245,158,11,0.05)]"
                            : "border-gray-700/50 bg-gray-800/50"
                      }`}
                    >
                      {/* Left accent bar for proficient skills */}
                      {isProficient && (
                        <div
                          className={`absolute left-0 top-1 bottom-1 w-0.5 rounded-full ${
                            isGranted ? "bg-emerald-500/60" : "bg-amber-500/60"
                          }`}
                        />
                      )}

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
                          onClick={() => dispatch({ type: "TOGGLE_SKILL", skill })}
                          disabled={!isClassPick && atMax}
                          className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                            isClassPick
                              ? "border-amber-500 bg-amber-500/80"
                              : atMax
                                ? "border-gray-700 bg-gray-900 opacity-30"
                                : "border-gray-600 bg-gray-900 hover:border-amber-600/60 hover:bg-amber-900/10"
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

                      {/* Skill name */}
                      <span
                        className={`flex-1 truncate ${
                          isProficient
                            ? isGranted
                              ? "text-emerald-200/90"
                              : "text-amber-200/90"
                            : "text-gray-500"
                        }`}
                      >
                        {formatSkillName(skill)}
                      </span>

                      {/* Source tag for species skills */}
                      {isSpeciesSkill && !isBgSkill && (
                        <span className="text-xs px-1 py-0.5 rounded bg-emerald-900/30 text-emerald-600/70 border border-emerald-800/30 shrink-0">
                          SP
                        </span>
                      )}

                      {/* Expertise badge */}
                      {canHaveExpertise && isProficient && (
                        <button
                          onClick={() =>
                            dispatch({ type: "TOGGLE_EXPERTISE", skill })
                          }
                          disabled={
                            !isExpertise &&
                            state.skillExpertise.length >= maxExpertise
                          }
                          title={isExpertise ? "Remove expertise" : "Grant expertise"}
                          className={`shrink-0 transition-opacity ${
                            !isExpertise && state.skillExpertise.length >= maxExpertise
                              ? "opacity-20 cursor-not-allowed"
                              : "hover:opacity-80"
                          }`}
                        >
                          <ExpertiseBadge active={isExpertise} size="sm" />
                        </button>
                      )}

                      {/* Bonus — large and color-coded */}
                      <span
                        className={`text-sm font-bold font-mono tabular-nums w-7 text-right shrink-0 ${
                          isProficient ? bonusColor : "text-gray-600"
                        }`}
                      >
                        {bonusSign}{bonus}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-600 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-emerald-700/50 border border-emerald-700/40 inline-block" />
          Background / Species
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-amber-600/40 border border-amber-600/30 inline-block" />
          Class Pick
        </span>
        {canHaveExpertise && (
          <span className="flex items-center gap-1.5">
            <ExpertiseBadge active={true} size="xs" />
            Expertise (double proficiency)
          </span>
        )}
        {hasJackOfAllTrades && (
          <span className="flex items-center gap-1.5">
            <span className="text-blue-400/60">◆</span>
            Jack of All Trades (+{halfProfBonus} to unproficient)
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Expertise Badge ──────────────────────────────────────

function ExpertiseBadge({
  active,
  size,
}: {
  active: boolean;
  size: "sm" | "xs";
}) {
  if (size === "xs") {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full border ${
          active
            ? "border-yellow-500/80 bg-yellow-900/40 text-yellow-400"
            : "border-yellow-700/40 bg-yellow-900/10 text-yellow-600/50"
        }`}
        style={{ width: 14, height: 14, fontSize: 7, fontWeight: 700, letterSpacing: "0.02em" }}
      >
        E
      </span>
    );
  }

  // sm — shown in skill row
  return (
    <span
      title={active ? "Expertise" : "Click to grant expertise"}
      className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-bold tracking-wide leading-none border transition-colors ${
        active
          ? "border-yellow-500/60 bg-yellow-900/40 text-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.15)]"
          : "border-yellow-800/30 bg-yellow-900/10 text-yellow-700/50"
      }`}
    >
      {/* Double-ring icon */}
      <svg
        viewBox="0 0 10 10"
        className="w-2.5 h-2.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 1.5 : 1}
      >
        <circle cx="3.5" cy="5" r="2.5" />
        <circle cx="6.5" cy="5" r="2.5" />
      </svg>
      EXP
    </span>
  );
}
