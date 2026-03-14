"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getSpecies, featsArray, getSpellsByClass } from "@unseen-servant/shared/data";
import { RichText } from "@/components/ui/RichText";
import type { SpeciesData, FeatData } from "@unseen-servant/shared/data";
import type { StepProps, TraitChoiceDefinition } from "./types";
import {
  getFilteredSpecies,
  getSpeciesTraitChoices,
  formatSkillName,
  ALL_SKILLS,
} from "./utils";
import { formatSpeciesSize, getSpeciesSpeed, entriesToText, SIZE_MAP } from "@unseen-servant/shared";
import { gridItem, cardHover } from "./animations";

export function StepSpecies({ state, dispatch }: StepProps) {
  const allSpecies = useMemo(() => getFilteredSpecies(), []);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return allSpecies;
    const q = search.toLowerCase();
    return allSpecies.filter((s) => s.name.toLowerCase().includes(q));
  }, [allSpecies, search]);

  const selected = state.species ? getSpecies(state.species) : null;
  const traitChoices = state.species
    ? getSpeciesTraitChoices(state.species)
    : [];

  function handleSpeciesClick(name: string) {
    dispatch({ type: "SET_SPECIES", species: name });
  }

  // Source badge color mapping
  function sourceBadgeClass(source: string) {
    if (source === "XPHB") return "bg-amber-900/30 text-amber-400/80 border-amber-700/30";
    if (source === "MPMM") return "bg-purple-900/30 text-purple-400/80 border-purple-700/30";
    return "bg-gray-800/60 text-gray-500 border-gray-700/30";
  }

  return (
    <div className="space-y-5">
      <StepHeader
        title="Choose Your Species"
        description="Your species determines traits, speed, and special abilities."
      />

      {/* Character name (optional early entry) */}
      <div>
        <label
          className="text-sm text-gray-500 uppercase tracking-wider block mb-1.5"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Character Name{" "}
          <span className="normal-case tracking-normal text-gray-600">(optional)</span>
        </label>
        <input
          type="text"
          value={state.nameFromSpeciesStep}
          onChange={(e) => dispatch({ type: "SET_NAME_EARLY", name: e.target.value })}
          placeholder="Enter a name..."
          className="w-full max-w-xs bg-gray-900/60 border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30 transition-colors"
        />
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search species..."
        className="w-full bg-gray-900/60 border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30 transition-colors"
      />

      {/* Full-width grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
        {filtered.map((sp, i) => {
          const isSelected = state.species === sp.name;
          return (
            <motion.button
              key={sp.name}
              custom={i}
              variants={gridItem}
              initial="initial"
              animate="animate"
              whileHover={cardHover}
              onPointerDown={(e) => {
                e.preventDefault();
                handleSpeciesClick(sp.name);
              }}
              className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors duration-200 ${
                isSelected
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.12)]"
                  : "border-gray-700/50 bg-gray-800/50 text-gray-300 hover:border-gray-600 hover:bg-gray-800"
              }`}
            >
              <div
                className="font-medium truncate text-xs leading-snug"
                style={{ fontFamily: "var(--font-cinzel)" }}
              >
                {sp.name}
              </div>
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                <span className="text-xs bg-gray-900/60 border border-gray-700/40 rounded px-1.5 py-0.5 text-gray-400">
                  {formatSpeciesSize(sp.size)}
                </span>
                <span className="text-xs bg-gray-900/60 border border-gray-700/40 rounded px-1.5 py-0.5 text-gray-400">
                  {getSpeciesSpeed(sp)} ft.
                </span>
                {sp.source && (
                  <span
                    className={`text-xs border rounded px-1.5 py-0.5 ${sourceBadgeClass(sp.source)}`}
                  >
                    {sp.source}
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Trait Choices + Species Detail — side by side */}
      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
          {/* Left: Trait Choices */}
          {traitChoices.length > 0 ? (
            <div
              key={state.species}
              className="bg-gray-800/60 border-l-2 border-amber-500/60 border-y border-r border-gray-700/40 rounded-r-lg p-4 space-y-3"
            >
              <div
                className="text-sm font-medium text-amber-300/80"
                style={{ fontFamily: "var(--font-cinzel)" }}
              >
                Trait Choices for {selected.name}
              </div>
              {traitChoices.map((def) => (
                <TraitChoicePicker
                  key={def.traitName}
                  definition={def}
                  value={state.speciesChoices[def.traitName]}
                  state={state}
                  dispatch={dispatch}
                />
              ))}
            </div>
          ) : (
            <div />
          )}

          {/* Right: Species Detail */}
          <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-4 self-start">
            <h3
              className="text-sm font-semibold text-amber-300/90 mb-3"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              {selected.name}
            </h3>
            <SpeciesDetail species={selected} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared Step Header ──────────────────────────────────

function StepHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h2
        className="text-xl font-semibold text-amber-200/90 tracking-wide"
        style={{ fontFamily: "var(--font-cinzel)" }}
      >
        {title}
      </h2>
      <p className="text-sm text-gray-500">{description}</p>
      <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
    </div>
  );
}

// ─── Trait Choice Picker ─────────────────────────────────

function TraitChoicePicker({
  definition,
  value,
  state,
  dispatch,
}: {
  definition: TraitChoiceDefinition;
  value?: { selected: string | string[]; secondarySelected?: string };
  state: StepProps["state"];
  dispatch: StepProps["dispatch"];
}) {
  const { traitName, choiceType } = definition;

  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium text-gray-200">{traitName}</div>

      {choiceType === "skill" && (
        <SkillPicker
          traitName={traitName}
          options={definition.options ?? ALL_SKILLS}
          count={1}
          value={value?.selected ? [typeof value.selected === "string" ? value.selected : value.selected[0]] : []}
          dispatch={dispatch}
        />
      )}

      {choiceType === "skills" && (
        <SkillPicker
          traitName={traitName}
          options={definition.options ?? ALL_SKILLS}
          count={definition.count ?? 2}
          value={Array.isArray(value?.selected) ? value.selected : []}
          dispatch={dispatch}
        />
      )}

      {choiceType === "feat" && (
        <>
          <FeatPicker
            traitName={traitName}
            category={definition.featCategory!}
            value={typeof value?.selected === "string" ? value.selected : ""}
            dispatch={dispatch}
          />
          {/* Sub-choices for feats that need them */}
          {typeof value?.selected === "string" && value.selected.toLowerCase() === "skilled" && (
            <SpeciesSkilledChoices state={state} dispatch={dispatch} />
          )}
          {typeof value?.selected === "string" && value.selected.toLowerCase().startsWith("magic initiate") && (
            <SpeciesMagicInitiateChoices featName={value.selected} state={state} dispatch={dispatch} />
          )}
        </>
      )}

      {choiceType === "size" && (
        <div className="flex gap-1.5">
          {(definition.options ?? []).map((sizeCode) => {
            const label = SIZE_MAP[sizeCode] ?? sizeCode;
            const isSelected = value?.selected === sizeCode;
            return (
              <button
                key={sizeCode}
                onClick={() => dispatch({ type: "SET_SPECIES_CHOICE", traitName, selected: sizeCode })}
                className={`text-xs px-2.5 py-1 rounded-md border transition-all duration-150 ${
                  isSelected
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                    : "border-gray-700/60 bg-gray-900/40 text-gray-400 hover:border-gray-600"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {choiceType === "language" && (
        <SkillPicker
          traitName={traitName}
          options={definition.options ?? []}
          count={definition.count ?? 1}
          value={Array.isArray(value?.selected) ? value.selected : value?.selected ? [value.selected] : []}
          dispatch={dispatch}
        />
      )}

      {(choiceType === "lineage" || choiceType === "ancestry") && (
        <LineagePicker
          traitName={traitName}
          options={definition.lineageOptions ?? []}
          value={typeof value?.selected === "string" ? value.selected : ""}
          dispatch={dispatch}
        />
      )}

      {definition.secondaryChoice && (
        <div className="mt-1.5">
          <div className="text-xs text-gray-500 mb-1">Spellcasting Ability</div>
          <div className="flex gap-1.5">
            {definition.secondaryChoice.options.map((opt) => (
              <button
                key={opt}
                onClick={() =>
                  dispatch({
                    type: "SET_SPECIES_SECONDARY_CHOICE",
                    traitName,
                    selected: opt,
                  })
                }
                className={`text-xs px-2.5 py-1 rounded-md border transition-all duration-150 ${
                  value?.secondarySelected === opt
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                    : "border-gray-700 bg-gray-900/60 text-gray-400 hover:border-gray-600"
                }`}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Skill Picker ────────────────────────────────────────

function SkillPicker({
  traitName,
  options,
  count,
  value,
  dispatch,
}: {
  traitName: string;
  options: string[];
  count: number;
  value: string[];
  dispatch: StepProps["dispatch"];
}) {
  const toggle = (skill: string) => {
    const has = value.includes(skill);
    let newVal: string | string[];
    if (has) {
      newVal = count === 1 ? "" : value.filter((s) => s !== skill);
    } else {
      if (value.length >= count) return;
      newVal = count === 1 ? skill : [...value, skill];
    }
    dispatch({ type: "SET_SPECIES_CHOICE", traitName, selected: newVal });
  };

  return (
    <div className="flex flex-wrap gap-1">
      {options.map((skill) => {
        const isSelected = value.includes(skill);
        const atMax = value.length >= count && !isSelected;
        return (
          <button
            key={skill}
            onClick={() => toggle(skill)}
            disabled={atMax}
            className={`text-xs px-2.5 py-1 rounded-md border transition-all duration-150 ${
              isSelected
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : atMax
                  ? "border-gray-700/30 bg-gray-900/30 text-gray-600 opacity-40"
                  : "border-gray-700/60 bg-gray-900/40 text-gray-400 hover:border-gray-600"
            }`}
          >
            {formatSkillName(skill)}
          </button>
        );
      })}
      <div className="text-xs text-gray-600 self-center ml-1">
        {value.length}/{count}
      </div>
    </div>
  );
}

// ─── Feat Picker ─────────────────────────────────────────

/** Extract bold sub-benefit names from feat entries */
function parseFeatBenefits(entries: import("@unseen-servant/shared/data").Entry[]): string[] {
  const text = entriesToText(entries);
  const matches = text.match(/\*\*([^*]+?)\.?\*\*/g);
  if (!matches) return [];
  return matches
    .map((m) => m.replace(/\*\*/g, "").replace(/\.$/, ""))
    .filter((b) => !b.toLowerCase().startsWith("you gain"));
}

function FeatPicker({
  traitName,
  category,
  value,
  dispatch,
}: {
  traitName: string;
  category: string;
  value: string;
  dispatch: StepProps["dispatch"];
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const originFeats = useMemo(
    () => category
      ? featsArray.filter((f: FeatData) => f.category === category)
      : featsArray.filter((f: FeatData) => !!f.category),
    [category]
  );

  const filtered = useMemo(() => {
    if (!search) return originFeats;
    const q = search.toLowerCase();
    return originFeats.filter((f) => f.name.toLowerCase().includes(q));
  }, [originFeats, search]);

  return (
    <div className="space-y-1.5">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search feats..."
        className="w-full bg-gray-900/60 border border-gray-700/60 rounded-md px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
      <div className="max-h-64 overflow-y-auto space-y-1">
        {filtered.map((feat) => {
          const isSelected = value === feat.name;
          const isExpanded = expanded === feat.name;
          const benefits = parseFeatBenefits(feat.entries);
          return (
            <div
              key={feat.name}
              className={`rounded-lg border transition-all duration-150 ${
                isSelected
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-gray-700/50 bg-gray-900/40 hover:border-gray-600"
              }`}
            >
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <button
                  onClick={() =>
                    dispatch({ type: "SET_SPECIES_CHOICE", traitName, selected: feat.name })
                  }
                  className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-colors ${
                    isSelected
                      ? "border-amber-500 bg-amber-500/80"
                      : "border-gray-600 bg-gray-900 hover:border-gray-500"
                  }`}
                >
                  {isSelected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() =>
                    dispatch({ type: "SET_SPECIES_CHOICE", traitName, selected: feat.name })
                  }
                  className="flex-1 min-w-0 text-left"
                >
                  <span className={`text-xs font-medium ${isSelected ? "text-amber-200" : "text-gray-200"}`}>
                    {feat.name}
                  </span>
                  {benefits.length > 0 && (
                    <span className="text-xs text-gray-500 ml-1.5">
                      {benefits.join(", ")}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setExpanded(isExpanded ? null : feat.name)}
                  className="text-gray-600 hover:text-gray-400 shrink-0"
                >
                  <svg
                    className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {isExpanded && (
                <div className="px-2.5 pb-2 border-t border-gray-700/50 pt-1.5">
                  <RichText entries={feat.entries} className="text-xs text-gray-400" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Species Feat Sub-Choices ────────────────────────────

function SpeciesSkilledChoices({ state, dispatch }: StepProps) {
  const overrides = state.speciesOriginFeatOverrides;
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
                  type: "SET_SPECIES_ORIGIN_FEAT_OVERRIDES",
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

const MI_CLASSES = ["Cleric", "Druid", "Wizard"];

function SpeciesMagicInitiateChoices({
  featName,
  state,
  dispatch,
}: { featName: string } & StepProps) {
  const matchedClass = MI_CLASSES.find((c) =>
    featName.toLowerCase().includes(c.toLowerCase())
  );
  const overrides = state.speciesOriginFeatOverrides;
  const spellClass = matchedClass ?? overrides.spellClass ?? "Druid";

  const cantrips = useMemo(
    () => getSpellsByClass(spellClass).filter((s) => s.level === 0),
    [spellClass]
  );
  const level1Spells = useMemo(
    () => getSpellsByClass(spellClass).filter((s) => s.level === 1),
    [spellClass]
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
                    type: "SET_SPECIES_ORIGIN_FEAT_OVERRIDES",
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
                  type: "SET_SPECIES_ORIGIN_FEAT_OVERRIDES",
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
        <div className="text-xs text-gray-500 mb-1">
          Cantrips ({selectedCantrips.length}/2)
        </div>
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
                    type: "SET_SPECIES_ORIGIN_FEAT_OVERRIDES",
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
                    type: "SET_SPECIES_ORIGIN_FEAT_OVERRIDES",
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

// ─── Lineage/Ancestry Picker ─────────────────────────────

function LineagePicker({
  traitName,
  options,
  value,
  dispatch,
}: {
  traitName: string;
  options: { name: string; description: string }[];
  value: string;
  dispatch: StepProps["dispatch"];
}) {
  return (
    <div className="space-y-1">
      {options.map((opt) => (
        <button
          key={opt.name}
          onClick={() =>
            dispatch({ type: "SET_SPECIES_CHOICE", traitName, selected: opt.name })
          }
          className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition-all duration-150 ${
            value === opt.name
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-gray-700/50 bg-gray-900/40 hover:border-gray-600"
          }`}
        >
          <div className={`font-medium ${value === opt.name ? "text-amber-200" : "text-gray-200"}`}>
            {opt.name}
          </div>
          <div className="text-gray-500 mt-0.5 text-xs">{opt.description}</div>
        </button>
      ))}
    </div>
  );
}

// ─── Species Detail Panel ────────────────────────────────

function SpeciesDetail({ species }: { species: SpeciesData }) {
  return (
    <div className="space-y-3">
      {/* Stat badges */}
      <div className="flex flex-wrap gap-1.5">
        <StatBadge label="Size" value={formatSpeciesSize(species.size)} />
        <StatBadge label="Speed" value={`${getSpeciesSpeed(species)} ft.`} />
        {species.darkvision && species.name !== "Custom Lineage" && (
          <StatBadge label="Darkvision" value={`${species.darkvision} ft.`} />
        )}
      </div>

      {/* Traits */}
      {species.entries.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-gray-500 font-medium uppercase tracking-wider">
            Traits
          </div>
          {species.entries.map((entry, i) => {
            const entryObj = typeof entry === "object" && entry !== null ? entry as unknown as Record<string, unknown> : null;
            const entryName = entryObj && "name" in entryObj ? entryObj.name as string : null;
            // Plain string entries: render as description text without trait header
            if (!entryName) {
              return (
                <div key={`desc-${i}`} className="pl-2.5">
                  <RichText entries={[entry]} className="text-xs text-gray-500 italic" />
                </div>
              );
            }
            // Pass only child entries to RichText to avoid double-rendering the name
            const childEntries = entryObj && "entries" in entryObj && Array.isArray(entryObj.entries)
              ? entryObj.entries as import("@unseen-servant/shared/data").Entry[]
              : [entry];
            return (
              <div
                key={entryName}
                className="border-l-2 border-amber-500/30 pl-2.5"
              >
                <div className="text-sm font-medium text-gray-200">{entryName}</div>
                <div className="mt-0.5">
                  <RichText entries={childEntries} className="text-xs text-gray-400" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resistances */}
      {species.resist && species.resist.length > 0 && (
        <div>
          <div className="text-sm text-gray-500 font-medium uppercase tracking-wider mb-1">
            Resistances
          </div>
          <div className="flex flex-wrap gap-1">
            {species.resist.map((r, i) => {
              if (typeof r === "string") {
                return (
                  <span
                    key={r}
                    className="text-xs bg-red-900/20 text-red-400 border border-red-800/30 rounded-md px-1.5 py-0.5"
                  >
                    {r}
                  </span>
                );
              }
              // Choice-based resistance (e.g., Tiefling: choose from poison, necrotic, fire)
              return (
                <span
                  key={`choose-${i}`}
                  className="text-xs bg-red-900/20 text-red-400 border border-red-800/30 rounded-md px-1.5 py-0.5"
                >
                  Choose: {r.choose.from.join(", ")}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Languages */}
      {(() => {
        const languages = species.languageProficiencies?.flatMap(lp => Object.keys(lp).filter(k => lp[k] === true)) ?? [];
        return languages.length > 0 ? (
          <div>
            <div className="text-sm text-gray-500 font-medium uppercase tracking-wider mb-1">
              Languages
            </div>
            <div className="flex flex-wrap gap-1">
              {languages.map((l) => (
                <span
                  key={l}
                  className="text-xs bg-blue-900/20 text-blue-400 border border-blue-800/30 rounded-md px-1.5 py-0.5"
                >
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </span>
              ))}
            </div>
          </div>
        ) : null;
      })()}

      {/* Source */}
      <div className="text-xs text-gray-600">{species.source}</div>
    </div>
  );
}

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-md px-2 py-1">
      <div className="text-xs text-gray-500 uppercase">{label}</div>
      <div className="text-xs text-gray-200 font-medium">{value}</div>
    </div>
  );
}
