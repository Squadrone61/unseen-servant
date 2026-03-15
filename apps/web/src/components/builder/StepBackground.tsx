"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  backgroundsArray,
  getBackground,
  getFeat,
  getSpellsByClass,
  languagesArray,
} from "@unseen-servant/shared/data";
import type { BackgroundData } from "@unseen-servant/shared/data";
import type { StepProps } from "./types";
import { formatSkillName, ALL_SKILLS, getFeatToolChoiceInfo } from "./utils";
import {
  getBackgroundSkills,
  getBackgroundTools,
  getBackgroundFeat,
  getBackgroundAbilityScores,
  ABILITY_MAP,
} from "@unseen-servant/shared";
import { RichText } from "@/components/ui/RichText";
import { gridItem, cardHover } from "./animations";

const STANDARD_LANGUAGES = languagesArray
  .filter((l) => l.type === "standard" && l.name !== "Common")
  .map((l) => l.name);
const BACKGROUND_LANG_COUNT = 2;

export function StepBackground({ state, dispatch }: StepProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return backgroundsArray;
    const q = search.toLowerCase();
    return backgroundsArray.filter((b) => b.name.toLowerCase().includes(q));
  }, [search]);

  const selected = state.background ? getBackground(state.background) : null;

  function handleSelect(bgName: string) {
    dispatch({ type: "SET_BACKGROUND", background: bgName });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2
          className="text-xl font-semibold text-amber-200/90 tracking-wide"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Choose Your Background
        </h2>
        <p className="text-sm text-gray-500">
          Your background provides skill proficiencies, a tool proficiency, an origin feat, and
          ability score increases.
        </p>
        <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search backgrounds..."
        className="w-full bg-gray-900/60 border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30 transition-colors"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
        {filtered.map((bg, i) => {
          const isSelected = state.background === bg.name;
          const skillList = getBackgroundSkills(bg);
          const featName = getBackgroundFeat(bg);

          return (
            <motion.button
              key={bg.name}
              custom={i}
              variants={gridItem}
              initial="initial"
              animate="animate"
              whileHover={cardHover}
              onPointerDown={() => handleSelect(bg.name)}
              className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all duration-200 ${
                isSelected
                  ? "border-amber-500/60 bg-amber-500/10 text-amber-200 shadow-[0_0_14px_rgba(245,158,11,0.12)]"
                  : "border-gray-700/50 bg-gray-800/50 text-gray-300 hover:border-gray-600 hover:bg-gray-800"
              }`}
            >
              <div className="font-medium truncate text-sm">{bg.name}</div>

              {skillList.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {skillList.map((s) => (
                    <span
                      key={s}
                      className="text-xs bg-purple-900/20 text-purple-400 border border-purple-800/30 rounded px-1 py-0.5 leading-none"
                    >
                      {formatSkillName(s)}
                    </span>
                  ))}
                </div>
              )}

              {featName && (
                <div className="text-xs text-amber-500/70 mt-1 truncate">{featName}</div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Inline detail + language picker */}
      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
          {/* Left: Language picker + feat choices */}
          <div className="space-y-3">
            <LanguagePicker state={state} dispatch={dispatch} />
            <BackgroundDetailContent bg={selected} state={state} dispatch={dispatch} />
          </div>

          {/* Right: Background detail panel */}
          <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-4 self-start">
            <div
              className="text-sm font-medium text-amber-200/90 mb-2"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              {selected.name}
            </div>
            <BackgroundSummary bg={selected} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Language Picker ────────────────────────────────────

function LanguagePicker({ state, dispatch }: StepProps) {
  const selected = state.backgroundLanguages ?? [];

  function toggle(lang: string) {
    const has = selected.includes(lang);
    const next = has
      ? selected.filter((l) => l !== lang)
      : selected.length < BACKGROUND_LANG_COUNT
        ? [...selected, lang]
        : selected;
    dispatch({ type: "SET_BACKGROUND_LANGUAGES", languages: next });
  }

  return (
    <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3">
      <div className="text-sm text-gray-500 font-medium uppercase tracking-wider mb-1.5">
        Languages — Common + {BACKGROUND_LANG_COUNT} of your choice ({selected.length}/
        {BACKGROUND_LANG_COUNT})
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs bg-emerald-900/20 text-emerald-400 border border-emerald-800/30 rounded-md px-2 py-0.5">
          Common (always)
        </span>
        {STANDARD_LANGUAGES.map((lang) => {
          const isSelected = selected.includes(lang);
          return (
            <button
              key={lang}
              onClick={() => toggle(lang)}
              disabled={!isSelected && selected.length >= BACKGROUND_LANG_COUNT}
              className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
                isSelected
                  ? "bg-emerald-600/15 text-emerald-400 border border-emerald-500/30"
                  : selected.length >= BACKGROUND_LANG_COUNT
                    ? "text-gray-700 border border-gray-800"
                    : "text-gray-400 border border-gray-700/60 hover:text-gray-200"
              }`}
            >
              {lang}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Background Summary (right panel) ───────────────────

function BackgroundSummary({ bg }: { bg: BackgroundData }) {
  const featName = getBackgroundFeat(bg) ?? null;
  const featData = featName ? getFeat(featName) : null;
  const abilityInfo = getBackgroundAbilityScores(bg);
  const abilityScores = abilityInfo ? abilityInfo.from.map((k) => ABILITY_MAP[k] ?? k) : [];

  return (
    <div className="space-y-3">
      {/* Skill Proficiencies */}
      <div>
        <div className="text-sm text-gray-500 font-medium uppercase tracking-wider mb-1">
          Skill Proficiencies
        </div>
        <div className="flex flex-wrap gap-1">
          {getBackgroundSkills(bg).map((s) => (
            <span
              key={s}
              className="text-xs bg-purple-900/20 text-purple-400 border border-purple-800/30 rounded-md px-1.5 py-0.5"
            >
              {formatSkillName(s)}
            </span>
          ))}
        </div>
      </div>

      {/* Tool Proficiency */}
      {getBackgroundTools(bg).length > 0 && (
        <div>
          <div className="text-sm text-gray-500 font-medium uppercase tracking-wider mb-1">
            Tool Proficiency
          </div>
          <div className="flex flex-wrap gap-1">
            {getBackgroundTools(bg).map((t) => (
              <span
                key={t}
                className="text-xs bg-gray-900/60 text-gray-300 border border-gray-700/50 rounded-md px-1.5 py-0.5"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ability Scores */}
      {abilityScores.length > 0 && (
        <div>
          <div className="text-sm text-gray-500 font-medium uppercase tracking-wider mb-1">
            Ability Score Increases
          </div>
          <div className="flex flex-wrap gap-1">
            {abilityScores.map((a) => (
              <span
                key={a}
                className="text-xs bg-blue-900/20 text-blue-400 border border-blue-800/30 rounded-md px-1.5 py-0.5 capitalize"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Feat preview */}
      {featName && (
        <div>
          <div className="text-sm text-gray-500 font-medium uppercase tracking-wider mb-1">
            Origin Feat
          </div>
          <div className="border-l-2 border-amber-500/30 pl-2.5">
            <div className="text-sm font-medium text-gray-200">{featName}</div>
            {featData && (
              <div className="line-clamp-4 mt-0.5">
                <RichText entries={featData.entries} className="text-xs text-gray-400" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Source */}
      <div className="text-xs text-gray-600">{bg.source}</div>
    </div>
  );
}

// ─── Origin Feat Choices (left panel) ───────────────────

function BackgroundDetailContent({ bg, state, dispatch }: { bg: BackgroundData } & StepProps) {
  const featName = getBackgroundFeat(bg) ?? null;

  if (!featName) return null;

  const toolInfo = getFeatToolChoiceInfo(featName);
  const needsChoices =
    featName.toLowerCase().startsWith("magic initiate") ||
    featName.toLowerCase() === "skilled" ||
    toolInfo !== null;

  if (!needsChoices) return null;

  return (
    <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3">
      {featName.toLowerCase().startsWith("magic initiate") && (
        <MagicInitiateChoices featName={featName} state={state} dispatch={dispatch} />
      )}
      {featName.toLowerCase() === "skilled" && <SkilledChoices state={state} dispatch={dispatch} />}
      {toolInfo && (
        <ToolChoices featName={featName} toolInfo={toolInfo} state={state} dispatch={dispatch} />
      )}
    </div>
  );
}

// ─── Magic Initiate Origin Feat Choices ──────────────────

const MI_CLASSES = ["Cleric", "Druid", "Wizard"];

function MagicInitiateChoices({
  featName,
  state,
  dispatch,
}: {
  featName: string;
} & StepProps) {
  const matchedClass = MI_CLASSES.find((c) => featName.toLowerCase().includes(c.toLowerCase()));
  const overrides = state.originFeatOverrides;
  const spellClass = matchedClass ?? overrides.spellClass ?? "Druid";

  const cantrips = useMemo(
    () => getSpellsByClass(spellClass).filter((s) => s.level === 0),
    [spellClass],
  );
  const level1Spells = useMemo(
    () => getSpellsByClass(spellClass).filter((s) => s.level === 1),
    [spellClass],
  );

  const selectedCantrips = overrides.cantrips ?? [];
  const selectedSpell = overrides.spell ?? "";

  return (
    <div className="mt-2 space-y-2 border-t border-gray-700/50 pt-2">
      <div className="text-xs text-gray-500 font-medium">Magic Initiate Choices</div>

      {!matchedClass && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Spell List</div>
          <div className="flex gap-1">
            {MI_CLASSES.map((c) => (
              <button
                key={c}
                onClick={() =>
                  dispatch({
                    type: "SET_ORIGIN_FEAT_OVERRIDES",
                    overrides: { spellClass: c, cantrips: [], spell: "" },
                  })
                }
                className={`text-xs px-2.5 py-1 rounded-md transition-all duration-150 ${
                  spellClass === c
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    : "text-gray-500 border border-gray-700/60"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs text-gray-500 mb-1">Spellcasting Ability</div>
        <div className="flex gap-1">
          {["Intelligence", "Wisdom", "Charisma"].map((a) => (
            <button
              key={a}
              onClick={() =>
                dispatch({
                  type: "SET_ORIGIN_FEAT_OVERRIDES",
                  overrides: { abilityChoice: a },
                })
              }
              className={`text-xs px-2.5 py-1 rounded-md transition-all duration-150 ${
                (overrides.abilityChoice ?? "").toLowerCase() === a.toLowerCase()
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  : "text-gray-500 border border-gray-700/60"
              }`}
            >
              {a.slice(0, 3).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1">Cantrips ({selectedCantrips.length}/2)</div>
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
          {cantrips.map((s) => {
            const isSelected = selectedCantrips.includes(s.name);
            return (
              <button
                key={s.name}
                onClick={() => {
                  const next = isSelected
                    ? selectedCantrips.filter((n) => n !== s.name)
                    : selectedCantrips.length < 2
                      ? [...selectedCantrips, s.name]
                      : selectedCantrips;
                  dispatch({
                    type: "SET_ORIGIN_FEAT_OVERRIDES",
                    overrides: { cantrips: next },
                  });
                }}
                disabled={!isSelected && selectedCantrips.length >= 2}
                className={`text-xs px-1.5 py-0.5 rounded-md transition-colors ${
                  isSelected
                    ? "bg-purple-600/15 text-purple-400 border border-purple-500/30"
                    : selectedCantrips.length >= 2
                      ? "text-gray-700 border border-gray-800"
                      : "text-gray-400 border border-gray-700/60 hover:text-gray-200"
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1">
          Level 1 Spell {selectedSpell ? `(${selectedSpell})` : "(pick one)"}
        </div>
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
          {level1Spells.map((s) => {
            const isSelected = selectedSpell === s.name;
            return (
              <button
                key={s.name}
                onClick={() =>
                  dispatch({
                    type: "SET_ORIGIN_FEAT_OVERRIDES",
                    overrides: { spell: isSelected ? "" : s.name },
                  })
                }
                className={`text-xs px-1.5 py-0.5 rounded-md transition-colors ${
                  isSelected
                    ? "bg-purple-600/15 text-purple-400 border border-purple-500/30"
                    : "text-gray-400 border border-gray-700/60 hover:text-gray-200"
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Skilled Origin Feat Choices ─────────────────────────

function SkilledChoices({ state, dispatch }: StepProps) {
  const overrides = state.originFeatOverrides;
  const selectedSkills = overrides.skillChoices ?? [];

  return (
    <div className="mt-2 space-y-2 border-t border-gray-700/50 pt-2">
      <div className="text-xs text-gray-500 font-medium">
        Skilled: Choose 3 skill proficiencies ({selectedSkills.length}/3)
      </div>
      <div className="flex flex-wrap gap-1">
        {ALL_SKILLS.map((skill) => {
          const isSelected = selectedSkills.includes(skill);
          return (
            <button
              key={skill}
              onClick={() => {
                const next = isSelected
                  ? selectedSkills.filter((s) => s !== skill)
                  : selectedSkills.length < 3
                    ? [...selectedSkills, skill]
                    : selectedSkills;
                dispatch({
                  type: "SET_ORIGIN_FEAT_OVERRIDES",
                  overrides: { skillChoices: next },
                });
              }}
              disabled={!isSelected && selectedSkills.length >= 3}
              className={`text-xs px-1.5 py-0.5 rounded-md transition-colors ${
                isSelected
                  ? "bg-purple-600/15 text-purple-400 border border-purple-500/30"
                  : selectedSkills.length >= 3
                    ? "text-gray-700 border border-gray-800"
                    : "text-gray-400 border border-gray-700/60 hover:text-gray-200"
              }`}
            >
              {formatSkillName(skill)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tool Proficiency Choices (Musician/Crafter) ─────────

function ToolChoices({
  featName,
  toolInfo,
  state,
  dispatch,
}: {
  featName: string;
  toolInfo: { options: string[]; count: number };
} & StepProps) {
  const overrides = state.originFeatOverrides;
  const selectedTools = overrides.toolChoices ?? [];

  return (
    <div className="mt-2 space-y-2 border-t border-gray-700/50 pt-2">
      <div className="text-xs text-gray-500 font-medium">
        {featName}: Choose {toolInfo.count} tool proficiencies ({selectedTools.length}/
        {toolInfo.count})
      </div>
      <div className="flex flex-wrap gap-1">
        {toolInfo.options.map((tool) => {
          const isSelected = selectedTools.includes(tool);
          return (
            <button
              key={tool}
              onClick={() => {
                const next = isSelected
                  ? selectedTools.filter((t) => t !== tool)
                  : selectedTools.length < toolInfo.count
                    ? [...selectedTools, tool]
                    : selectedTools;
                dispatch({
                  type: "SET_ORIGIN_FEAT_OVERRIDES",
                  overrides: { toolChoices: next },
                });
              }}
              disabled={!isSelected && selectedTools.length >= toolInfo.count}
              className={`text-xs px-1.5 py-0.5 rounded-md transition-colors ${
                isSelected
                  ? "bg-purple-600/15 text-purple-400 border border-purple-500/30"
                  : selectedTools.length >= toolInfo.count
                    ? "text-gray-700 border border-gray-800"
                    : "text-gray-400 border border-gray-700/60 hover:text-gray-200"
              }`}
            >
              {tool}
            </button>
          );
        })}
      </div>
    </div>
  );
}
