"use client";

import type { CharacterData, AdvantageEntry } from "@unseen-servant/shared/types";
import {
  ABILITY_FULL_NAMES,
  SKILL_DISPLAY_NAMES,
  formatBonus,
  getSkillModifier,
  getSavingThrowModifier,
  getTotalLevel,
} from "@unseen-servant/shared/utils";
import {
  getSkills,
  getSavingThrows,
  getAdvantages,
  getProficiencies,
  getSenses,
  getAbilities,
  getRollMinimums,
} from "@unseen-servant/shared/character";
import { useMemo } from "react";

// ─── Constants ───

/** SubTypes that are already displayed as markers on specific abilities/saves/skills */
const ABILITY_SPECIFIC_SUBTYPES = new Set([
  "strength-saving-throws",
  "dexterity-saving-throws",
  "constitution-saving-throws",
  "intelligence-saving-throws",
  "wisdom-saving-throws",
  "charisma-saving-throws",
  "strength-ability-checks",
  "dexterity-ability-checks",
  "constitution-ability-checks",
  "intelligence-ability-checks",
  "wisdom-ability-checks",
  "charisma-ability-checks",
  "acrobatics",
  "animal-handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight-of-hand",
  "stealth",
  "survival",
]);

// ─── Helpers ───

function findAdvantages(advantages: AdvantageEntry[], ...subTypes: string[]): AdvantageEntry[] {
  return advantages.filter((a) => subTypes.includes(a.subType));
}

function AdvMarker({ entries, className = "" }: { entries: AdvantageEntry[]; className?: string }) {
  if (entries.length === 0) return null;

  const hasAdv = entries.some((e) => e.type === "advantage");
  const hasDisadv = entries.some((e) => e.type === "disadvantage");

  const tooltipLines = entries.map((e) => {
    const prefix = e.type === "advantage" ? "ADV" : "DIS";
    return e.restriction ? `${prefix}: ${e.restriction}` : prefix;
  });
  const tooltip = tooltipLines.join("\n");

  return (
    <span className={`shrink-0 ${className}`} title={tooltip}>
      {hasAdv && <span className="text-xs font-bold text-green-400">▲</span>}
      {hasDisadv && <span className="text-xs font-bold text-red-400">▼</span>}
    </span>
  );
}

// ─── Component ───

interface StatsTabProps {
  character: CharacterData;
}

export function StatsTab({ character }: StatsTabProps) {
  const s = character.static;
  const abilities = useMemo(() => getAbilities(character), [character]);
  const profBonus = Math.floor((getTotalLevel(s.classes) - 1) / 4) + 2;
  const savingThrows = getSavingThrows(character);
  const skills = getSkills(character);
  const advantages = getAdvantages(character);
  const rollMinimums = getRollMinimums(character);
  const armorProfs = getProficiencies(character, "armor");
  const weaponProfs = getProficiencies(character, "weapons");
  const toolProfs = getProficiencies(character, "tools");
  const otherProfs = getProficiencies(character, "other");
  const senses = getSenses(character);

  return (
    <div className="space-y-4">
      {/* Saving Throws */}
      <div>
        <div
          className="mb-1.5 text-sm font-medium tracking-wider text-gray-500 uppercase"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Saving Throws
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {savingThrows.map((save) => {
            const mod = getSavingThrowModifier(save, abilities, profBonus);
            const saveAdvs = findAdvantages(advantages, `${save.ability}-saving-throws`);
            return (
              <div key={save.ability} className="flex items-center gap-1.5 rounded px-2 py-1">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                    save.proficient ? "bg-green-500" : "bg-gray-600 ring-1 ring-gray-500"
                  }`}
                />
                <span className="text-xs text-gray-400">{ABILITY_FULL_NAMES[save.ability]}</span>
                <AdvMarker entries={saveAdvs} />
                <span
                  className={`ml-auto text-xs font-semibold ${
                    save.proficient
                      ? mod >= 0
                        ? "text-green-400"
                        : "text-red-400"
                      : mod >= 0
                        ? "text-gray-400"
                        : "text-red-400"
                  }`}
                >
                  {formatBonus(mod)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Skills — always expanded */}
      {skills.length > 0 && (
        <div>
          <div
            className="mb-1.5 text-sm font-medium tracking-wider text-gray-500 uppercase"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            Skills ({skills.filter((sk) => sk.proficient || sk.expertise).length} proficient)
          </div>
          <div className="space-y-0.5">
            {skills.map((skill) => {
              const mod = getSkillModifier(skill, abilities, profBonus);
              const skillAdvs = findAdvantages(advantages, skill.name);
              const proficient = skill.proficient || skill.expertise;
              const skillFloor = rollMinimums.find((m) => {
                if (m.proficientOnly && !proficient) return false;
                if (m.on === skill.name) return true;
                if (m.on === "ability_check") return true;
                if (m.on === `${skill.ability}_check`) return true;
                return false;
              });
              return (
                <div
                  key={skill.name}
                  className={`flex items-center gap-1.5 rounded px-2 py-0.5 ${
                    proficient ? "bg-gray-900/30" : ""
                  }`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                      skill.expertise
                        ? "bg-yellow-500"
                        : skill.proficient
                          ? "bg-green-500"
                          : "bg-gray-700"
                    }`}
                  />
                  <span className={`text-xs ${proficient ? "text-gray-300" : "text-gray-500"}`}>
                    {SKILL_DISPLAY_NAMES[skill.name] || skill.name}
                  </span>
                  {skill.expertise && (
                    <span className="text-xs font-bold text-yellow-500 uppercase">E</span>
                  )}
                  <AdvMarker entries={skillAdvs} />
                  {skillFloor && (
                    <span
                      className="text-xs font-bold text-amber-400/80"
                      title={
                        skillFloor.mode === "total"
                          ? `Roll floor: if total < ${skillFloor.min}, use ${skillFloor.min}`
                          : `Roll floor: treat any d20 ≤ ${skillFloor.min - 1} as ${skillFloor.min}`
                      }
                    >
                      {skillFloor.mode === "total" ? "T" : ""}≥{skillFloor.min}
                    </span>
                  )}
                  <span
                    className={`ml-auto text-xs font-semibold ${
                      proficient ? (mod >= 0 ? "text-gray-300" : "text-red-400") : "text-gray-600"
                    }`}
                  >
                    {formatBonus(mod)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Advantages & Disadvantages — global, non-ability-specific */}
      {(() => {
        const globalAdvs = advantages.filter(
          (a) => a.restriction && !ABILITY_SPECIFIC_SUBTYPES.has(a.subType),
        );
        if (globalAdvs.length === 0) return null;
        return (
          <div className="space-y-0.5">
            <div
              className="mb-1 text-sm font-medium tracking-wider text-gray-500 uppercase"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Advantages &amp; Disadvantages
            </div>
            {globalAdvs.map((a, i) => {
              const isAdv = a.type === "advantage";
              return (
                <div
                  key={`${a.type}-${a.subType}-${i}`}
                  className="flex items-start gap-1.5 px-2 py-0.5 text-xs"
                >
                  <span
                    className={`mt-0.5 shrink-0 text-xs font-bold ${
                      isAdv ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {isAdv ? "▲" : "▼"}
                  </span>
                  <span className="text-gray-300">
                    {a.subType.replace(/-/g, " ")}
                    <span className="ml-1 text-gray-500 italic">({a.restriction})</span>
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Proficiencies — always expanded */}
      {(armorProfs.length > 0 ||
        weaponProfs.length > 0 ||
        toolProfs.length > 0 ||
        otherProfs.length > 0) && (
        <div>
          <div
            className="mb-1.5 text-sm font-medium tracking-wider text-gray-500 uppercase"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            Proficiencies
          </div>
          <div className="space-y-1.5">
            {armorProfs.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-500">Armor</div>
                <div className="text-xs text-gray-300">{armorProfs.join(", ")}</div>
              </div>
            )}
            {weaponProfs.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-500">Weapons</div>
                <div className="text-xs text-gray-300">{weaponProfs.join(", ")}</div>
              </div>
            )}
            {toolProfs.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-500">Tools</div>
                <div className="text-xs text-gray-300">{toolProfs.join(", ")}</div>
              </div>
            )}
            {otherProfs.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-500">Other</div>
                <div className="text-xs text-gray-300">{otherProfs.join(", ")}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Languages & Senses */}
      {(s.languages.length > 0 || senses.length > 0) && (
        <div className="space-y-1.5">
          {s.languages.length > 0 && (
            <div>
              <div
                className="mb-0.5 text-sm font-medium tracking-wider text-gray-500 uppercase"
                style={{ fontFamily: "var(--font-cinzel)" }}
              >
                Languages
              </div>
              <div className="text-xs text-gray-300">{s.languages.join(", ")}</div>
            </div>
          )}
          {senses.length > 0 && (
            <div>
              <div
                className="mb-0.5 text-sm font-medium tracking-wider text-gray-500 uppercase"
                style={{ fontFamily: "var(--font-cinzel)" }}
              >
                Senses
              </div>
              <div className="text-xs text-gray-300">{senses.join(", ")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
