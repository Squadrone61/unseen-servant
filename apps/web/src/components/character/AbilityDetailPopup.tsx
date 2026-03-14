"use client";

import type { CharacterData } from "@aidnd/shared/types";
import type { AbilityScores } from "@aidnd/shared/types";
import {
  ABILITY_FULL_NAMES,
  SKILL_DISPLAY_NAMES,
  getModifier,
  formatModifier,
  formatBonus,
  getSkillModifier,
  getSavingThrowModifier,
} from "@aidnd/shared/utils";
import { DetailPopover } from "./DetailPopover";

interface AbilityDetailPopupProps {
  abilityKey: keyof AbilityScores;
  character: CharacterData;
  onClose: () => void;
  position: { x: number; y: number };
}

export function AbilityDetailPopup({
  abilityKey,
  character,
  onClose,
  position,
}: AbilityDetailPopupProps) {
  const s = character.static;
  const score = s.abilities[abilityKey];
  const mod = getModifier(score);
  const modStr = formatModifier(score);
  const fullName = ABILITY_FULL_NAMES[abilityKey];

  // Related saving throw
  const save = s.savingThrows.find((sv) => sv.ability === abilityKey);
  const saveMod = save
    ? getSavingThrowModifier(save, s.abilities, s.proficiencyBonus)
    : mod;
  const saveProficient = save?.proficient ?? false;

  // Related skills
  const relatedSkills = s.skills.filter((sk) => sk.ability === abilityKey);

  return (
    <DetailPopover title={fullName} onClose={onClose} position={position}>
      <div className="space-y-4">
        {/* Score + Modifier display */}
        <div className="flex items-center gap-4">
          <div className="bg-gray-900 border border-gray-600 rounded-lg p-3 text-center min-w-[80px]">
            <div
              className={`text-2xl font-bold ${
                mod > 0
                  ? "text-green-400"
                  : mod < 0
                  ? "text-red-400"
                  : "text-gray-300"
              }`}
            >
              {modStr}
            </div>
            <div className="text-sm text-gray-400">{score}</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-200">
              {fullName}
            </div>
            <div className="text-xs text-gray-500">Ability Score</div>
          </div>
        </div>

        {/* Saving Throw */}
        <div>
          <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1.5" style={{ fontFamily: "var(--font-cinzel)" }}>
            Saving Throw
          </div>
          <div className="flex items-center gap-2 bg-gray-900/50 border border-gray-700 rounded px-3 py-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                saveProficient ? "bg-green-500" : "bg-gray-600"
              }`}
            />
            <span className="text-sm text-gray-300">{fullName} Save</span>
            <span
              className={`ml-auto text-sm font-semibold ${
                saveMod >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {formatBonus(saveMod)}
            </span>
          </div>
        </div>

        {/* Related Skills */}
        {relatedSkills.length > 0 && (
          <div>
            <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1.5" style={{ fontFamily: "var(--font-cinzel)" }}>
              Related Skills
            </div>
            <div className="space-y-1">
              {relatedSkills.map((skill) => {
                const skillMod = getSkillModifier(
                  skill,
                  s.abilities,
                  s.proficiencyBonus
                );
                return (
                  <div
                    key={skill.name}
                    className="flex items-center gap-2 bg-gray-900/50 border border-gray-700 rounded px-3 py-2"
                  >
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        skill.expertise
                          ? "bg-yellow-500"
                          : skill.proficient
                          ? "bg-green-500"
                          : "bg-gray-600"
                      }`}
                    />
                    <span className="text-sm text-gray-300">
                      {SKILL_DISPLAY_NAMES[skill.name] || skill.name}
                    </span>
                    {skill.expertise && (
                      <span className="text-xs text-yellow-500 font-medium uppercase">
                        exp
                      </span>
                    )}
                    <span
                      className={`ml-auto text-sm font-semibold ${
                        skillMod >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {formatBonus(skillMod)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DetailPopover>
  );
}
