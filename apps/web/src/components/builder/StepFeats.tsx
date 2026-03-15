import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AbilityScores } from "@unseen-servant/shared/types";
import type { FeatData } from "@unseen-servant/shared/data";
import { getFeat, getBackground } from "@unseen-servant/shared/data";
import type { StepProps, ASISelection } from "./types";
import { getSpellsByClass } from "@unseen-servant/shared/data";
import {
  formatPrerequisite,
  entriesToText,
  formatFeatCategory,
  getBackgroundFeat,
} from "@unseen-servant/shared";
import {
  getASILevelsForClasses,
  getEligibleFeats,
  getFinalAbilities,
  getAbilityMod,
  getFeatAbilityChoices,
  ALL_SKILLS,
  formatSkillName,
} from "./utils";
import { ClassASIPicker } from "./ASIAbilityPicker";
import { RichText } from "@/components/ui/RichText";

const ABILITY_KEYS: (keyof AbilityScores)[] = [
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

export function StepFeats({ state, dispatch }: StepProps) {
  const asiLevels = useMemo(
    () =>
      state.classes.length > 0
        ? getASILevelsForClasses(
            state.classes.map((c, i) => ({
              className: c.className,
              level: c.level,
              classIndex: i,
            })),
          )
        : [],
    [state.classes],
  );

  const totalLevel = state.classes.reduce((sum, c) => sum + c.level, 0);
  const finalAbilities = useMemo(() => getFinalAbilities(state), [state]);

  // Collect origin feat names for dedup in ASI feat picker
  const originFeatNames = useMemo(() => {
    const names: string[] = [];
    const bgData = state.background ? getBackground(state.background) : null;
    const bgFeat = bgData ? getBackgroundFeat(bgData) : null;
    if (bgFeat) names.push(bgFeat.toLowerCase());
    const versatileChoice = state.speciesChoices["Versatile"];
    if (
      versatileChoice &&
      typeof versatileChoice.selected === "string" &&
      versatileChoice.selected
    ) {
      names.push(versatileChoice.selected.toLowerCase());
    }
    return names;
  }, [state.background, state.speciesChoices]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2
          className="text-xl font-semibold text-amber-200/90 tracking-wide"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Ability Score Improvements &amp; Feats
        </h2>
        <p className="text-sm text-gray-500">
          At certain class levels, you can increase your ability scores or take a feat.
        </p>
        <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
      </div>

      <motion.div
        className="space-y-4"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.07 } },
        }}
      >
        {asiLevels.map((asi) => {
          const sel = state.asiSelections.find(
            (s) => s.classIndex === asi.classIndex && s.level === asi.level,
          );
          return (
            <motion.div
              key={`${asi.classIndex}-${asi.level}`}
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
              }}
            >
              <ASICard
                classIndex={asi.classIndex}
                dndClassName={asi.className}
                level={asi.level}
                selection={sel ?? null}
                allSelections={state.asiSelections}
                currentScores={finalAbilities}
                characterLevel={totalLevel}
                originFeatNames={originFeatNames}
                onChange={(selection) =>
                  dispatch({
                    type: "SET_ASI_SELECTION",
                    classIndex: asi.classIndex,
                    level: asi.level,
                    selection,
                  })
                }
              />
            </motion.div>
          );
        })}
      </motion.div>

      {/* Final Ability Score Preview */}
      <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-4">
        <div
          className="text-sm text-amber-200/70 font-medium mb-2"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Final Ability Scores (with all ASI/feat bonuses)
        </div>
        <div className="grid grid-cols-6 gap-3">
          {ABILITY_KEYS.map((ability) => {
            const score = finalAbilities[ability];
            const mod = getAbilityMod(score);
            return (
              <div
                key={ability}
                className="bg-gray-900/60 border border-gray-700/40 rounded-lg p-2 text-center"
              >
                <div className="text-xs text-gray-500 uppercase">{ABILITY_ABBREV[ability]}</div>
                <div className="text-lg font-bold text-gray-100">{score}</div>
                <div className="text-xs text-gray-400">
                  {mod >= 0 ? "+" : ""}
                  {mod}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ASICard({
  classIndex,
  dndClassName,
  level,
  selection,
  allSelections,
  currentScores,
  characterLevel,
  originFeatNames,
  onChange,
}: {
  classIndex: number;
  dndClassName: string;
  level: number;
  selection: ASISelection | null;
  allSelections: ASISelection[];
  currentScores: AbilityScores;
  characterLevel: number;
  originFeatNames: string[];
  onChange: (selection: ASISelection) => void;
}) {
  const type = selection?.type ?? "asi";

  return (
    <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* Class/level badge — more visually distinct */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/40 shadow-[0_0_8px_rgba(251,191,36,0.08)]">
            <svg
              className="w-3 h-3 text-amber-400/80"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
              />
            </svg>
            <span
              className="text-xs font-semibold text-amber-300 tracking-wide"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              {dndClassName}
            </span>
            <span className="text-xs text-amber-400/60">Lv {level}</span>
          </div>
          <span className="text-xs text-gray-500">ASI</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() =>
              onChange({
                classIndex,
                level,
                type: "asi",
                asiChoice: { mode: "two", abilities: {} },
              })
            }
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              type === "asi"
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                : "text-gray-500 border border-gray-700 hover:text-gray-300 hover:border-gray-600"
            }`}
          >
            Ability Score
          </button>
          <button
            onClick={() => onChange({ classIndex, level, type: "feat" })}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              type === "feat"
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                : "text-gray-500 border border-gray-700 hover:text-gray-300 hover:border-gray-600"
            }`}
          >
            Feat
          </button>
        </div>
      </div>

      {/* Content — animated swap between ASI and Feat */}
      <AnimatePresence mode="wait">
        {type === "asi" ? (
          <motion.div
            key="asi"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <ASIContent
              classIndex={classIndex}
              level={level}
              selection={selection}
              currentScores={currentScores}
              onChange={onChange}
            />
          </motion.div>
        ) : (
          <motion.div
            key="feat"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <FeatContent
              classIndex={classIndex}
              level={level}
              selection={selection}
              allSelections={allSelections}
              characterLevel={characterLevel}
              currentScores={currentScores}
              originFeatNames={originFeatNames}
              onChange={onChange}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ASIContent({
  classIndex,
  level,
  selection,
  currentScores,
  onChange,
}: {
  classIndex: number;
  level: number;
  selection: ASISelection | null;
  currentScores: AbilityScores;
  onChange: (selection: ASISelection) => void;
}) {
  const mode = selection?.asiChoice?.mode ?? "two";

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() =>
            onChange({ classIndex, level, type: "asi", asiChoice: { mode: "two", abilities: {} } })
          }
          className={`text-xs px-2 py-1 rounded ${
            mode === "two"
              ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              : "text-gray-500 border border-gray-700"
          }`}
        >
          +2 to one
        </button>
        <button
          onClick={() =>
            onChange({
              classIndex,
              level,
              type: "asi",
              asiChoice: { mode: "one-one", abilities: {} },
            })
          }
          className={`text-xs px-2 py-1 rounded ${
            mode === "one-one"
              ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              : "text-gray-500 border border-gray-700"
          }`}
        >
          +1 to two
        </button>
      </div>

      <ClassASIPicker
        mode={mode}
        assignments={selection?.asiChoice?.abilities ?? {}}
        onChange={(abilities) =>
          onChange({ classIndex, level, type: "asi", asiChoice: { mode, abilities } })
        }
        currentScores={currentScores}
      />
    </div>
  );
}

function FeatContent({
  classIndex,
  level,
  selection,
  allSelections,
  characterLevel,
  currentScores,
  originFeatNames,
  onChange,
}: {
  classIndex: number;
  level: number;
  selection: ASISelection | null;
  allSelections: ASISelection[];
  characterLevel: number;
  currentScores: AbilityScores;
  originFeatNames: string[];
  onChange: (selection: ASISelection) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | "G" | "EB">("all");

  // Feats already taken at other ASI levels or as origin feats (non-repeatable can't be picked again)
  const takenAtOtherLevels = useMemo(() => {
    const names = new Set<string>();
    for (const sel of allSelections) {
      if (
        sel.type === "feat" &&
        sel.featName &&
        !(sel.classIndex === classIndex && sel.level === level)
      ) {
        names.add(sel.featName.toLowerCase());
      }
    }
    for (const name of originFeatNames) {
      names.add(name);
    }
    return names;
  }, [allSelections, classIndex, level, originFeatNames]);

  const eligibleFeats = useMemo(() => getEligibleFeats(characterLevel), [characterLevel]);

  const filtered = useMemo(() => {
    let list = eligibleFeats;
    // Filter out non-repeatable feats already taken at other levels
    list = list.filter((f) => f.repeatable || !takenAtOtherLevels.has(f.name.toLowerCase()));
    if (category !== "all") {
      list = list.filter((f) => f.category === category);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }
    return list;
  }, [eligibleFeats, category, search, takenAtOtherLevels]);

  const selectedFeat = selection?.featName ? getFeat(selection.featName) : null;

  return (
    <div className="space-y-3">
      {/* Search + Filter */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search feats..."
          className="flex-1 bg-gray-900/60 border border-gray-700/60 rounded px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
        <div className="flex gap-1">
          {(["all", "G", "EB"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`text-xs px-2 py-1 rounded whitespace-nowrap transition-colors ${
                category === cat
                  ? cat === "EB"
                    ? "bg-amber-600/20 text-amber-300 border border-amber-500/40"
                    : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  : "text-gray-500 border border-gray-700 hover:text-gray-400 hover:border-gray-600"
              }`}
            >
              {cat === "all" ? "All" : formatFeatCategory(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Feat List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
        {filtered.map((feat, i) => (
          <motion.div
            key={feat.name}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.3) }}
          >
            <FeatCard
              feat={feat}
              isSelected={selection?.featName === feat.name}
              onSelect={() =>
                onChange({
                  classIndex,
                  level,
                  type: "feat",
                  featName: feat.name,
                  featAbilityChoice:
                    selection?.featName === feat.name ? selection?.featAbilityChoice : undefined,
                })
              }
            />
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-2 text-xs text-gray-600 py-4 text-center">
            No feats match your search.
          </div>
        )}
      </div>

      {/* Selected Feat Detail */}
      <AnimatePresence>
        {selectedFeat && (
          <motion.div
            key={selectedFeat.name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <SelectedFeatDetail
              feat={selectedFeat}
              selection={selection!}
              classIndex={classIndex}
              level={level}
              currentScores={currentScores}
              onChange={onChange}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  if (category === "EB") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-600/20 text-amber-300 border border-amber-500/35 font-medium uppercase tracking-wide">
        <svg className="w-2 h-2 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
        Epic Boon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full bg-gray-700/60 text-gray-400 border border-gray-600/40 font-medium uppercase tracking-wide">
      General
    </span>
  );
}

function FeatCard({
  feat,
  isSelected,
  onSelect,
}: {
  feat: FeatData;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const abilityChoices = getFeatAbilityChoices(feat);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        isSelected
          ? "border-amber-500/50 bg-amber-500/10 shadow-[0_0_12px_rgba(251,191,36,0.08)]"
          : "border-gray-700/50 bg-gray-900/60 hover:border-gray-600 hover:bg-gray-900/80"
      }`}
    >
      {/* Name + category badge row */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <span
          className={`text-sm font-semibold leading-tight ${isSelected ? "text-amber-200" : "text-gray-200"}`}
        >
          {feat.name}
        </span>
        <CategoryBadge category={feat.category} />
      </div>

      {/* Prerequisite */}
      {feat.prerequisite && (
        <div className="flex items-center gap-1 mt-1 mb-1">
          <svg
            className="w-2.5 h-2.5 text-orange-400/80 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <span className="text-xs text-orange-400/80">
            {formatPrerequisite(feat.prerequisite)}
          </span>
        </div>
      )}

      {/* Summary */}
      <div className="text-xs text-gray-500 line-clamp-2 mt-0.5">
        {abilityChoices.length > 0 && (
          <span className="text-emerald-500/90 mr-1">
            +1 {abilityChoices.map((a) => ABILITY_ABBREV[a]).join("/")} ·
          </span>
        )}
        {entriesToText(feat.entries).slice(0, 100)}...
      </div>
    </button>
  );
}

function SelectedFeatDetail({
  feat,
  selection,
  classIndex: _classIndex,
  level,
  currentScores,
  onChange,
}: {
  feat: FeatData;
  selection: ASISelection;
  classIndex: number;
  level: number;
  currentScores: AbilityScores;
  onChange: (selection: ASISelection) => void;
}) {
  const abilityChoices = getFeatAbilityChoices(feat);
  const needsAbilityChoice = abilityChoices.length > 1;

  return (
    <div className="bg-gray-900/70 border border-amber-500/30 rounded-xl p-4 space-y-2.5 shadow-[0_0_16px_rgba(251,191,36,0.07),inset_0_0_0_1px_rgba(251,191,36,0.04)]">
      {/* Detail header */}
      <div className="flex items-center justify-between gap-2">
        <div
          className="text-sm font-semibold text-amber-200"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          {feat.name}
        </div>
        <CategoryBadge category={feat.category} />
      </div>

      {feat.prerequisite && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-orange-500/8 border border-orange-500/20">
          <svg
            className="w-3 h-3 text-orange-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <span className="text-xs text-orange-300/90">
            <span className="text-orange-400/70 font-medium">Prerequisite:</span>{" "}
            {formatPrerequisite(feat.prerequisite)}
          </span>
        </div>
      )}

      <div className="line-clamp-6">
        <RichText entries={feat.entries} className="text-xs text-gray-400" />
      </div>

      {/* Ability Score Choice */}
      {abilityChoices.length > 0 && (
        <div className="pt-2 border-t border-gray-800">
          <div className="text-xs text-gray-500 font-medium mb-1.5">
            {needsAbilityChoice
              ? "Choose +1 ability score:"
              : `+1 ${ABILITY_ABBREV[abilityChoices[0]]}`}
          </div>
          {needsAbilityChoice ? (
            <div className="flex gap-1.5 flex-wrap">
              {abilityChoices.map((key) => {
                const isChosen = selection.featAbilityChoice === key;
                return (
                  <button
                    key={key}
                    onClick={() =>
                      onChange({
                        ...selection,
                        featAbilityChoice: isChosen ? undefined : key,
                      })
                    }
                    className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                      isChosen
                        ? "bg-amber-500/80 text-white shadow-[0_0_6px_rgba(251,191,36,0.3)]"
                        : "bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-600"
                    }`}
                  >
                    {ABILITY_ABBREV[key]}
                    {currentScores[key] !== undefined && (
                      <span className={`ml-1 ${isChosen ? "text-amber-200/70" : "text-gray-500"}`}>
                        ({currentScores[key]})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            // Auto-select single ability
            <AutoSelectAbility
              ability={abilityChoices[0]}
              selection={selection}
              onChange={onChange}
            />
          )}
        </div>
      )}

      {/* Proficiency grants */}
      {(feat.armorProficiencies || feat.weaponProficiencies || feat.toolProficiencies) && (
        <div className="text-xs text-gray-500">
          {feat.armorProficiencies && (
            <span>
              Armor:{" "}
              {feat.armorProficiencies
                .flatMap((p) => Object.keys(p).filter((k) => p[k]))
                .join(", ")}{" "}
              ·{" "}
            </span>
          )}
          {feat.weaponProficiencies && (
            <span>
              Weapons:{" "}
              {feat.weaponProficiencies
                .flatMap((p) => Object.keys(p).filter((k) => p[k]))
                .join(", ")}{" "}
              ·{" "}
            </span>
          )}
          {feat.toolProficiencies && (
            <span>
              Tools:{" "}
              {feat.toolProficiencies.flatMap((p) => Object.keys(p).filter((k) => p[k])).join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Speed bonus */}
      {feat.speed && (
        <div className="text-xs text-emerald-500">
          +{typeof feat.speed === "number" ? feat.speed : Object.values(feat.speed)[0]} ft. speed
        </div>
      )}

      {/* Sub-choices for specific feats */}
      <FeatSubChoices feat={feat} selection={selection} level={level} onChange={onChange} />
    </div>
  );
}

// ─── Feat Sub-Choices ────────────────────────────────────

const MI_CLASSES = ["Cleric", "Druid", "Wizard"];

function FeatSubChoices({
  feat,
  selection,
  level: _level,
  onChange,
}: {
  feat: FeatData;
  selection: ASISelection;
  level: number;
  onChange: (selection: ASISelection) => void;
}) {
  const lc = feat.name.toLowerCase();
  const subChoices = selection.featSubChoices ?? {};

  const updateSubChoices = (key: string, value: string[]) => {
    onChange({
      ...selection,
      featSubChoices: { ...subChoices, [key]: value },
    });
  };

  // Skilled: pick 3 skills
  if (lc === "skilled") {
    const selected = subChoices["skills"] ?? [];
    return (
      <div className="pt-1 border-t border-gray-800 space-y-1">
        <div className="text-xs text-gray-500 font-medium">
          Choose 3 skill proficiencies ({selected.length}/3)
        </div>
        <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
          {ALL_SKILLS.map((skill) => {
            const isSelected = selected.includes(skill);
            return (
              <button
                key={skill}
                onClick={() =>
                  updateSubChoices(
                    "skills",
                    isSelected
                      ? selected.filter((s) => s !== skill)
                      : selected.length < 3
                        ? [...selected, skill]
                        : selected,
                  )
                }
                disabled={!isSelected && selected.length >= 3}
                className={`text-xs px-1.5 py-0.5 rounded ${
                  isSelected
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    : selected.length >= 3
                      ? "text-gray-700 border border-gray-800"
                      : "text-gray-400 border border-gray-700 hover:text-gray-200"
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

  // Skill Expert: pick 1 skill proficiency
  if (lc === "skill expert") {
    const selected = subChoices["skills"] ?? [];
    return (
      <div className="pt-1 border-t border-gray-800 space-y-1">
        <div className="text-xs text-gray-500 font-medium">Choose 1 skill proficiency</div>
        <div className="flex flex-wrap gap-1">
          {ALL_SKILLS.map((skill) => {
            const isSelected = selected.includes(skill);
            return (
              <button
                key={skill}
                onClick={() => updateSubChoices("skills", isSelected ? [] : [skill])}
                className={`text-xs px-1.5 py-0.5 rounded ${
                  isSelected
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    : "text-gray-400 border border-gray-700 hover:text-gray-200"
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

  // Magic Initiate (general feat version): pick class + cantrips + spell
  if (lc.startsWith("magic initiate")) {
    const spellClass = subChoices["class"]?.[0] ?? "Cleric";
    const selectedCantrips = subChoices["cantrips"] ?? [];
    const selectedSpell = subChoices["spells"]?.[0] ?? "";

    const cantrips = getSpellsByClass(spellClass).filter((s) => s.level === 0);
    const level1Spells = getSpellsByClass(spellClass).filter((s) => s.level === 1);

    return (
      <div className="pt-1 border-t border-gray-800 space-y-2">
        <div className="text-xs text-gray-500 font-medium">Magic Initiate Choices</div>

        {/* Spell class */}
        <div className="flex gap-1">
          {MI_CLASSES.map((c) => (
            <button
              key={c}
              onClick={() =>
                onChange({
                  ...selection,
                  featSubChoices: { ...subChoices, class: [c], cantrips: [], spells: [] },
                })
              }
              className={`text-xs px-2 py-0.5 rounded ${
                spellClass === c
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  : "text-gray-500 border border-gray-700"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* 2 Cantrips */}
        <div>
          <div className="text-xs text-gray-500 mb-1">Cantrips ({selectedCantrips.length}/2)</div>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {cantrips.map((s) => {
              const isSel = selectedCantrips.includes(s.name);
              return (
                <button
                  key={s.name}
                  onClick={() =>
                    updateSubChoices(
                      "cantrips",
                      isSel
                        ? selectedCantrips.filter((n) => n !== s.name)
                        : selectedCantrips.length < 2
                          ? [...selectedCantrips, s.name]
                          : selectedCantrips,
                    )
                  }
                  disabled={!isSel && selectedCantrips.length >= 2}
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    isSel
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      : selectedCantrips.length >= 2
                        ? "text-gray-700 border border-gray-800"
                        : "text-gray-400 border border-gray-700 hover:text-gray-200"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* 1 Level 1 Spell */}
        <div>
          <div className="text-xs text-gray-500 mb-1">
            Level 1 Spell {selectedSpell && `(${selectedSpell})`}
          </div>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {level1Spells.map((s) => {
              const isSel = selectedSpell === s.name;
              return (
                <button
                  key={s.name}
                  onClick={() => updateSubChoices("spells", isSel ? [] : [s.name])}
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    isSel
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      : "text-gray-400 border border-gray-700 hover:text-gray-200"
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

  return null;
}

function AutoSelectAbility({
  ability,
  selection,
  onChange,
}: {
  ability: keyof AbilityScores;
  selection: ASISelection;
  onChange: (selection: ASISelection) => void;
}) {
  useEffect(() => {
    if (selection.featAbilityChoice !== ability) {
      onChange({ ...selection, featAbilityChoice: ability });
    }
  }, [ability, selection, onChange]);
  return null;
}
