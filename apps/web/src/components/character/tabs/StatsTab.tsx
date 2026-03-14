"use client";

import type { CharacterData, AdvantageEntry } from "@unseen-servant/shared/types";
import {
  ABILITY_FULL_NAMES,
  SKILL_DISPLAY_NAMES,
  formatBonus,
  getSkillModifier,
  getSavingThrowModifier,
} from "@unseen-servant/shared/utils";

// ─── Constants ───

/** SubTypes that are already displayed as markers on specific abilities/saves/skills */
const ABILITY_SPECIFIC_SUBTYPES = new Set([
  "strength-saving-throws", "dexterity-saving-throws", "constitution-saving-throws",
  "intelligence-saving-throws", "wisdom-saving-throws", "charisma-saving-throws",
  "strength-ability-checks", "dexterity-ability-checks", "constitution-ability-checks",
  "intelligence-ability-checks", "wisdom-ability-checks", "charisma-ability-checks",
  "acrobatics", "animal-handling", "arcana", "athletics", "deception", "history",
  "insight", "intimidation", "investigation", "medicine", "nature", "perception",
  "performance", "persuasion", "religion", "sleight-of-hand", "stealth", "survival",
]);

// ─── Helpers ───

function findAdvantages(
  advantages: AdvantageEntry[],
  ...subTypes: string[]
): AdvantageEntry[] {
  return advantages.filter((a) => subTypes.includes(a.subType));
}

function AdvMarker({
  entries,
  className = "",
}: {
  entries: AdvantageEntry[];
  className?: string;
}) {
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
      {hasAdv && (
        <span className="text-xs text-green-400 font-bold">▲</span>
      )}
      {hasDisadv && (
        <span className="text-xs text-red-400 font-bold">▼</span>
      )}
    </span>
  );
}

// ─── Component ───

interface StatsTabProps {
  character: CharacterData;
}

export function StatsTab({ character }: StatsTabProps) {
  const s = character.static;

  return (
    <div className="space-y-4">
      {/* Saving Throws */}
      <div>
        <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1.5" style={{ fontFamily: "var(--font-cinzel)" }}>
          Saving Throws
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {s.savingThrows.map((save) => {
            const mod = getSavingThrowModifier(
              save,
              s.abilities,
              s.proficiencyBonus
            );
            const saveAdvs = findAdvantages(
              s.advantages,
              `${save.ability}-saving-throws`
            );
            return (
              <div
                key={save.ability}
                className="flex items-center gap-1.5 rounded px-2 py-1"
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                    save.proficient
                      ? "bg-green-500"
                      : "bg-gray-600 ring-1 ring-gray-500"
                  }`}
                />
                <span className="text-xs text-gray-400">
                  {ABILITY_FULL_NAMES[save.ability]}
                </span>
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
      {s.skills.length > 0 && (
        <div>
          <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1.5" style={{ fontFamily: "var(--font-cinzel)" }}>
            Skills ({s.skills.filter((sk) => sk.proficient || sk.expertise).length} proficient)
          </div>
          <div className="space-y-0.5">
            {s.skills.map((skill) => {
              const mod = getSkillModifier(
                skill,
                s.abilities,
                s.proficiencyBonus
              );
              const skillAdvs = findAdvantages(
                s.advantages,
                skill.name
              );
              return (
                <div
                  key={skill.name}
                  className={`flex items-center gap-1.5 rounded px-2 py-0.5 ${
                    skill.proficient || skill.expertise
                      ? "bg-gray-900/30"
                      : ""
                  }`}
                >
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                      skill.expertise
                        ? "bg-yellow-500"
                        : skill.proficient
                        ? "bg-green-500"
                        : "bg-gray-700"
                    }`}
                  />
                  <span
                    className={`text-xs ${
                      skill.proficient || skill.expertise
                        ? "text-gray-300"
                        : "text-gray-500"
                    }`}
                  >
                    {SKILL_DISPLAY_NAMES[skill.name] || skill.name}
                  </span>
                  {skill.expertise && (
                    <span className="text-xs text-yellow-500 font-bold uppercase">
                      E
                    </span>
                  )}
                  <AdvMarker entries={skillAdvs} />
                  <span
                    className={`ml-auto text-xs font-semibold ${
                      skill.proficient || skill.expertise
                        ? mod >= 0
                          ? "text-gray-300"
                          : "text-red-400"
                        : "text-gray-600"
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
        const globalAdvs = s.advantages.filter(
          (a) => a.restriction && !ABILITY_SPECIFIC_SUBTYPES.has(a.subType)
        );
        if (globalAdvs.length === 0) return null;
        return (
          <div className="space-y-0.5">
            <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1" style={{ fontFamily: "var(--font-cinzel)" }}>
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
                    className={`shrink-0 text-xs font-bold mt-0.5 ${
                      isAdv ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {isAdv ? "▲" : "▼"}
                  </span>
                  <span className="text-gray-300">
                    {a.subType.replace(/-/g, " ")}
                    <span className="text-gray-500 italic ml-1">
                      ({a.restriction})
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Proficiencies — always expanded */}
      {(s.proficiencies.armor.length > 0 ||
        s.proficiencies.weapons.length > 0 ||
        s.proficiencies.tools.length > 0 ||
        s.proficiencies.other.length > 0) && (
        <div>
          <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1.5" style={{ fontFamily: "var(--font-cinzel)" }}>
            Proficiencies
          </div>
          <div className="space-y-1.5">
            {s.proficiencies.armor.length > 0 && (
              <div>
                <div className="text-sm text-gray-500 font-medium">
                  Armor
                </div>
                <div className="text-xs text-gray-300">
                  {s.proficiencies.armor.join(", ")}
                </div>
              </div>
            )}
            {s.proficiencies.weapons.length > 0 && (
              <div>
                <div className="text-sm text-gray-500 font-medium">
                  Weapons
                </div>
                <div className="text-xs text-gray-300">
                  {s.proficiencies.weapons.join(", ")}
                </div>
              </div>
            )}
            {s.proficiencies.tools.length > 0 && (
              <div>
                <div className="text-sm text-gray-500 font-medium">
                  Tools
                </div>
                <div className="text-xs text-gray-300">
                  {s.proficiencies.tools.join(", ")}
                </div>
              </div>
            )}
            {s.proficiencies.other.length > 0 && (
              <div>
                <div className="text-sm text-gray-500 font-medium">
                  Other
                </div>
                <div className="text-xs text-gray-300">
                  {s.proficiencies.other.join(", ")}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Languages & Senses */}
      {(s.languages.length > 0 || s.senses.length > 0) && (
        <div className="space-y-1.5">
          {s.languages.length > 0 && (
            <div>
              <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-0.5" style={{ fontFamily: "var(--font-cinzel)" }}>
                Languages
              </div>
              <div className="text-xs text-gray-300">
                {s.languages.join(", ")}
              </div>
            </div>
          )}
          {s.senses.length > 0 && (
            <div>
              <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-0.5" style={{ fontFamily: "var(--font-cinzel)" }}>
                Senses
              </div>
              <div className="text-xs text-gray-300">
                {s.senses.join(", ")}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
