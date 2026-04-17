"use client";

import type React from "react";
import type { CharacterData, AbilityScores, StatContribution } from "@unseen-servant/shared/types";
import {
  ABILITY_FULL_NAMES,
  SKILL_DISPLAY_NAMES,
  formatBonus,
  formatModifier,
  getSkillModifier,
  getSavingThrowModifier,
  getProficiencyBonus,
  getTotalLevel,
} from "@unseen-servant/shared/utils";
import {
  getAbilities,
  getSkills,
  getSavingThrows,
  getAbilityBreakdown,
} from "@unseen-servant/shared/character";
import { useEntityClick } from "./EntityPopoverContext";

// ─── Value formatting ───

function formatContribValue(c: StatContribution): string {
  if (c.operation === "set") return `= ${c.value}`;
  if (c.operation === "base") return String(c.value);
  return formatBonus(c.value);
}

function contribTone(c: StatContribution): string {
  if (c.operation === "set") return "text-amber-300 font-semibold";
  if (c.operation === "base") return "text-gray-200";
  if (c.value > 0) return "text-emerald-300";
  if (c.value < 0) return "text-red-300";
  return "text-gray-300";
}

// ─── Component ───

interface AbilityScoreDetailProps {
  character: CharacterData;
  ability: keyof AbilityScores;
}

export function AbilityScoreDetail({ character, ability }: AbilityScoreDetailProps) {
  const onEntityClick = useEntityClick();
  const abilities = getAbilities(character);
  const score = abilities[ability];
  const mod = Math.floor((score - 10) / 2);
  const profBonus = getProficiencyBonus(getTotalLevel(character.static.classes));
  const save = getSavingThrows(character).find((sv) => sv.ability === ability);
  const saveMod = save ? getSavingThrowModifier(save, abilities, profBonus) : mod;
  const abilitySkills = getSkills(character).filter((s) => s.ability === ability);
  const breakdown = getAbilityBreakdown(character, ability);
  const hasEffectSources = breakdown.contributions.some((c) => c.operation !== "base");

  const handleSourceClick = (c: StatContribution, e: React.MouseEvent) => {
    if (!c.sourceCategory || !c.sourceName || !onEntityClick) return;
    onEntityClick(c.sourceCategory, c.sourceName, { x: e.clientX, y: e.clientY });
  };

  return (
    <div className="space-y-3">
      {/* Header: ability full name, score + modifier big */}
      <div className="flex items-center justify-between border-b border-gray-700/40 pb-2">
        <div
          className="text-sm font-medium tracking-wider text-gray-400 uppercase"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          {ABILITY_FULL_NAMES[ability]}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-bold text-amber-200 tabular-nums">
            {formatModifier(score)}
          </span>
          <span className="font-mono text-sm text-gray-500">({score})</span>
        </div>
      </div>

      {/* Saves & Skills */}
      <div>
        <SectionHeading>Save & Skills</SectionHeading>
        <div className="space-y-0.5 rounded border border-gray-700/40 bg-gray-900/40 p-1">
          <Row
            left={
              <>
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    save?.proficient ? "bg-green-500" : "bg-gray-600"
                  }`}
                />
                <span className="text-sm text-gray-300">Saving Throw</span>
              </>
            }
            right={
              <span
                className={`font-mono text-sm font-semibold tabular-nums ${
                  save?.proficient ? "text-amber-200" : "text-gray-400"
                }`}
              >
                {formatBonus(saveMod)}
              </span>
            }
          />
          {abilitySkills.map((sk) => {
            const skMod = getSkillModifier(sk, abilities, profBonus);
            const proficient = sk.proficient || sk.expertise;
            return (
              <Row
                key={sk.name}
                left={
                  <>
                    <span
                      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                        sk.expertise
                          ? "bg-yellow-500"
                          : sk.proficient
                            ? "bg-green-500"
                            : "bg-gray-700"
                      }`}
                    />
                    <span className={`text-sm ${proficient ? "text-gray-200" : "text-gray-400"}`}>
                      {SKILL_DISPLAY_NAMES[sk.name] ?? sk.name}
                    </span>
                    {sk.expertise && (
                      <span className="text-xs font-bold text-yellow-500 uppercase">E</span>
                    )}
                  </>
                }
                right={
                  <span
                    className={`font-mono text-sm font-semibold tabular-nums ${
                      proficient ? "text-amber-200" : "text-gray-400"
                    }`}
                  >
                    {formatBonus(skMod)}
                  </span>
                }
              />
            );
          })}
        </div>
      </div>

      {/* Sources — only when effects contribute beyond the base score */}
      {hasEffectSources && (
        <div>
          <SectionHeading>Sources</SectionHeading>
          <div className="space-y-0.5 rounded border border-gray-700/40 bg-gray-900/40 p-1">
            {(() => {
              const hasEffectSet = breakdown.contributions.some(
                (c) => c.fromEffect && c.operation === "set",
              );
              return breakdown.contributions.map((c, i) => {
                const overridden = hasEffectSet && !c.fromEffect;
                const clickable = Boolean(c.sourceCategory && c.sourceName);
                return (
                  <Row
                    key={i}
                    left={
                      clickable ? (
                        <button
                          type="button"
                          onClick={(e) => handleSourceClick(c, e)}
                          className={`text-left text-sm hover:underline ${
                            overridden
                              ? "text-gray-400 line-through opacity-40"
                              : "text-amber-300 hover:text-amber-200"
                          }`}
                        >
                          {c.label}
                        </button>
                      ) : (
                        <span
                          className={`text-sm ${
                            overridden ? "text-gray-400 line-through opacity-40" : "text-gray-300"
                          }`}
                        >
                          {c.label}
                        </span>
                      )
                    }
                    right={
                      <span
                        className={`font-mono text-sm tabular-nums ${
                          overridden ? "text-gray-500 line-through opacity-40" : contribTone(c)
                        }`}
                      >
                        {formatContribValue(c)}
                      </span>
                    }
                  />
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Primitives ───

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-1.5 text-sm font-medium tracking-wider text-gray-500 uppercase"
      style={{ fontFamily: "var(--font-cinzel)" }}
    >
      {children}
    </div>
  );
}

function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      {left}
      <span className="ml-auto shrink-0">{right}</span>
    </div>
  );
}
