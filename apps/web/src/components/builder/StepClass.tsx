import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { classesArray, getClass, baseItemsArray } from "@aidnd/shared/data";
import type { ClassAssembled, ClassFeatureRaw, SubclassFeatureRaw } from "@aidnd/shared/data";
import type { BaseItemData, OptionalFeatureData } from "@aidnd/shared/data";
import {
  getHitDiceFaces,
  getCasterType,
  getArmorProfs,
  getWeaponProfs,
  getSkillChoices,
  getSavingThrows,
  getSpellSlotTable,
  ABILITY_MAP,
  decodeMastery,
} from "@aidnd/shared";
import type { StepProps } from "./types";
import { RichText } from "../ui/RichText";
import {
  deduplicateSubclasses,
  formatSkillName,
  getClassOptionalFeatures,
  getWeaponMasteryConfig,
} from "./utils";
import { gridItem, cardHover } from "./animations";

// ─── Helpers ─────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

type CasterDisplay = {
  label: string;
  badgeClass: string;
};

function getCasterDisplay(cls: ClassAssembled): CasterDisplay | null {
  const raw = getCasterType(cls);
  if (!raw) return null;
  switch (raw) {
    case "full":
      return { label: "Full Caster", badgeClass: "bg-blue-900/30 text-blue-400 border border-blue-800/30" };
    case "half":
      return { label: "Half Caster", badgeClass: "bg-teal-900/30 text-teal-400 border border-teal-800/30" };
    case "artificer":
      // BUG #8 fix: artificer progression maps to Half Caster display
      return { label: "Half Caster", badgeClass: "bg-teal-900/30 text-teal-400 border border-teal-800/30" };
    case "pact":
      return { label: "Pact Caster", badgeClass: "bg-purple-900/30 text-purple-400 border border-purple-800/30" };
    default:
      return null;
  }
}

// BUG #12: Strip {@filter ...} tags, extracting display text before the first pipe
function stripFilterTags(text: string): string {
  return text.replace(/\{@filter\s[^}]*\}/g, (match) => {
    const inner = match.slice(9, -1); // remove "{@filter " prefix and "}" suffix
    return inner.split("|")[0];
  });
}

// ─── Modern/sci-fi weapon filter ─────────────────────────
// BUG #11: Exclude modern/sci-fi weapons from weapon mastery picker
const MODERN_WEAPON_PATTERNS = /pistol|musket|laser|antimatter|automatic|rifle|revolver|shotgun|blaster/i;

// ─── Main Step ────────────────────────────────────────────

export function StepClass({ state, dispatch }: StepProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return classesArray;
    const q = search.toLowerCase();
    return classesArray.filter((c) => c.name.toLowerCase().includes(q));
  }, [search]);

  const activeClass = state.classes[state.activeClassIndex] ?? null;
  const selected = activeClass ? getClass(activeClass.className) : null;

  // Feature choices available at current level
  const featureChoiceDefs = useMemo(() => {
    if (!activeClass) return [];
    return getClassOptionalFeatures(activeClass.className, activeClass.level);
  }, [activeClass]);

  // Weapon mastery config
  const masteryConfig = useMemo(() => {
    if (!activeClass) return null;
    return getWeaponMasteryConfig(activeClass.className, activeClass.level);
  }, [activeClass]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-amber-200/90 tracking-wide" style={{ fontFamily: "var(--font-cinzel)" }}>
          Choose Your Class
        </h2>
        <p className="text-xs text-gray-500">
          Your class determines your hit dice, proficiencies, features, and spellcasting ability.
        </p>
        <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search classes..."
        className="w-full bg-gray-900/60 border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30"
      />

      {/* Full-width class grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {filtered.map((cls, i) => {
          const isActive = activeClass?.className === cls.name;
          const hitDice = getHitDiceFaces(cls);
          const caster = getCasterDisplay(cls);

          return (
            <motion.button
              key={cls.name}
              variants={gridItem}
              initial="initial"
              animate="animate"
              custom={i}
              whileHover={cardHover}
              onClick={() => {
                dispatch({ type: "ADD_CLASS", className: cls.name });
              }}
              className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors duration-200 ${
                isActive
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.08)]"
                  : "border-gray-700/50 bg-gray-800/50 text-gray-300 hover:border-gray-600 hover:bg-gray-800"
              }`}
            >
              <div className="font-medium truncate">{cls.name}</div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {/* Hit die badge */}
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700/80 text-gray-400 border border-gray-600/40 font-mono">
                  d{hitDice}
                </span>
                {/* Caster type badge */}
                {caster ? (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${caster.badgeClass}`}>
                    {caster.label}
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700/40">
                    Non-caster
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Level selector pill strip */}
      {activeClass && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 shrink-0">Level</span>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {Array.from({ length: 20 }, (_, i) => i + 1).map((l) => (
                <button
                  key={l}
                  onClick={() =>
                    dispatch({ type: "SET_CLASS_LEVEL", index: state.activeClassIndex, level: l })
                  }
                  className={`shrink-0 w-7 h-7 rounded-full text-[10px] font-medium transition-all ${
                    activeClass.level === l
                      ? "bg-amber-500/80 text-white shadow-[0_0_8px_rgba(245,158,11,0.3)]"
                      : "bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Subclass Picker */}
          {activeClass.level >= 3 && selected && selected.resolvedSubclasses.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-400 shrink-0">Subclass</label>
              <select
                value={activeClass.subclass ?? ""}
                onChange={(e) =>
                  dispatch({
                    type: "SET_CLASS_SUBCLASS",
                    index: state.activeClassIndex,
                    subclass: e.target.value || null,
                  })
                }
                className="bg-gray-900/60 border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30"
              >
                <option value="">None</option>
                {deduplicateSubclasses(selected.resolvedSubclasses).map((sc) => (
                  <option key={sc.name} value={sc.name}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Side-by-side: Choices + Class Detail */}
      {selected && activeClass && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
          {/* Left: Feature choices, weapon mastery, class features */}
          <div className="space-y-3 min-w-0">
            {/* Feature Choices */}
            {featureChoiceDefs.map((def) => {
              const featureTypeKey = def.featureTypes[0];
              const currentSelected = activeClass.optionalFeatureSelections[featureTypeKey] ?? [];
              return (
                <FeatureChoicePicker
                  key={`${activeClass.className}-${def.name}`}
                  featureName={def.name}
                  options={def.options}
                  maxCount={def.count}
                  selected={currentSelected}
                  onSelect={(val) =>
                    dispatch({
                      type: "SET_OPTIONAL_FEATURE",
                      index: state.activeClassIndex,
                      featureType: featureTypeKey,
                      selected: val,
                    })
                  }
                />
              );
            })}

            {/* Weapon Mastery */}
            {masteryConfig && (
              <WeaponMasteryPicker
                config={masteryConfig}
                selected={activeClass.weaponMasteries}
                onSelect={(weapons) =>
                  dispatch({ type: "SET_WEAPON_MASTERIES", index: state.activeClassIndex, weapons })
                }
              />
            )}

            {/* Features Reference */}
            <ClassFeaturesSection cls={selected} level={activeClass.level} subclassName={activeClass.subclass} />
          </div>

          {/* Right: Class Detail */}
          <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-4 self-start">
            <h3
              className="text-sm font-semibold text-amber-300/90 mb-3"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              {selected.name}
            </h3>
            <ClassDetail cls={selected} level={activeClass.level} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Feature Choice Picker ────────────────────────────────

function FeatureChoicePicker({
  featureName,
  options,
  maxCount,
  selected,
  onSelect,
}: {
  featureName: string;
  options: OptionalFeatureData[];
  maxCount: number;
  selected: string[];
  onSelect: (val: string[]) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onSelect(selected.filter((s) => s !== name));
    } else {
      if (selected.length >= maxCount) return;
      onSelect([...selected, name]);
    }
  };

  return (
    <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-200">{featureName}</div>
        <div className="text-[10px] text-gray-500">
          {selected.length}/{maxCount}
        </div>
      </div>
      {/* Compact chip grid */}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.name);
          const atMax = selected.length >= maxCount && !isSelected;
          const isExpanded = expanded === opt.name;
          return (
            <button
              key={opt.name}
              onClick={() => toggle(opt.name)}
              disabled={atMax}
              className={`text-[10px] px-2.5 py-1 rounded-md border transition-all duration-150 ${
                isSelected
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-300 font-medium"
                  : atMax
                    ? "border-gray-700/30 bg-gray-900/30 text-gray-600 opacity-40"
                    : "border-gray-700/60 bg-gray-900/40 text-gray-300 hover:border-gray-500 hover:text-gray-200"
              }`}
              onContextMenu={(e) => {
                e.preventDefault();
                setExpanded(isExpanded ? null : opt.name);
              }}
            >
              {opt.name}
            </button>
          );
        })}
      </div>
      {/* Expandable detail for selected or inspected option */}
      {(expanded || selected.length > 0) && (() => {
        const detailName = expanded ?? selected[selected.length - 1];
        const detailOpt = options.find((o) => o.name === detailName);
        if (!detailOpt) return null;
        return (
          <div className="border-t border-gray-700/40 pt-2 mt-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-amber-300/80">{detailOpt.name}</span>
              {expanded && (
                <button onClick={() => setExpanded(null)} className="text-gray-600 hover:text-gray-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <RichText entries={detailOpt.entries} className="text-xs text-gray-500 line-clamp-4" />
          </div>
        );
      })()}
      {/* Hint */}
      {selected.length === 0 && !expanded && (
        <div className="text-[9px] text-gray-600">Click to select &middot; Right-click for details</div>
      )}
    </div>
  );
}

// ─── Weapon Mastery Picker ────────────────────────────────

function WeaponMasteryPicker({
  config,
  selected,
  onSelect,
}: {
  config: { count: number; restriction?: "melee" };
  selected: string[];
  onSelect: (val: string[]) => void;
}) {
  const [search, setSearch] = useState("");

  const eligibleWeapons = useMemo(() => {
    let weapons = baseItemsArray.filter(
      (w): w is BaseItemData & { mastery: string[] } => !!w.weapon && !!w.mastery && w.mastery.length > 0
    );
    // BUG #11: Filter out modern/sci-fi weapons
    weapons = weapons.filter((w) => !MODERN_WEAPON_PATTERNS.test(w.name));
    if (config.restriction === "melee") {
      weapons = weapons.filter((w) => w.type === "M");
    }
    if (search) {
      const q = search.toLowerCase();
      weapons = weapons.filter((w) => w.name.toLowerCase().includes(q));
    }
    return weapons;
  }, [config.restriction, search]);

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onSelect(selected.filter((s) => s !== name));
    } else {
      if (selected.length >= config.count) return;
      onSelect([...selected, name]);
    }
  };

  return (
    <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-200">Weapon Mastery</div>
        <div className="text-[10px] text-gray-500">
          {selected.length}/{config.count}
        </div>
      </div>
      <p className="text-[10px] text-gray-500">
        Choose {config.count} weapon{config.count > 1 ? "s" : ""} to master
        {config.restriction === "melee" ? " (melee only)" : ""}.
      </p>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search weapons..."
        className="w-full bg-gray-900/60 border border-gray-700/60 rounded px-2 py-1 text-[10px] text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30"
      />
      <div className="max-h-64 overflow-y-auto space-y-0.5">
        {eligibleWeapons.map((w) => {
          const isSelected = selected.includes(w.name);
          const atMax = selected.length >= config.count && !isSelected;
          return (
            <button
              key={w.name}
              onClick={() => toggle(w.name)}
              disabled={atMax}
              className={`w-full text-left flex items-center justify-between px-2 py-1 rounded text-[10px] transition-colors ${
                isSelected
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  : atMax
                    ? "text-gray-600 opacity-40 border border-transparent"
                    : "text-gray-300 hover:bg-gray-700/50 border border-transparent"
              }`}
            >
              <span>{w.name}</span>
              {w.mastery.length > 0 && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    isSelected ? "bg-purple-900/30 text-purple-400" : "bg-gray-700 text-gray-500"
                  }`}
                >
                  {w.mastery.map(decodeMastery).join(", ")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Class Detail Panel ───────────────────────────────────

function ClassDetail({
  cls,
  level,
}: {
  cls: ClassAssembled;
  level: number;
}) {
  const hitDice = getHitDiceFaces(cls);
  const caster = getCasterDisplay(cls);
  const savingThrows = getSavingThrows(cls);
  const armorProfs = getArmorProfs(cls);
  const weaponProfs = getWeaponProfs(cls);
  const skillChoices = getSkillChoices(cls);
  const spellSlotTable = getSpellSlotTable(cls);
  const primaryAbilities = cls.primaryAbility
    .flatMap((obj) => Object.keys(obj).filter((k) => obj[k]))
    .map((k) => ABILITY_MAP[k] ?? k);

  return (
    <div className="space-y-4">
      {/* Core stat badges */}
      <div className="flex flex-wrap gap-1.5">
        <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1">
          <div className="text-[9px] text-gray-500 uppercase">Hit Dice</div>
          <div className="text-xs text-gray-200 font-medium font-mono">d{hitDice}</div>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1">
          <div className="text-[9px] text-gray-500 uppercase">Primary</div>
          <div className="text-xs text-gray-200 font-medium">{primaryAbilities.join(", ")}</div>
        </div>
        {caster && (
          <div className={`rounded px-2 py-1 ${caster.badgeClass}`}>
            <div className="text-[9px] uppercase opacity-70">Casting</div>
            <div className="text-xs font-medium">{caster.label}</div>
          </div>
        )}
      </div>

      {/* Saving Throws */}
      <div>
        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">
          Saving Throws
        </div>
        <div className="text-xs text-gray-300">
          {savingThrows.map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(", ")}
        </div>
      </div>

      {/* Armor Proficiencies */}
      {armorProfs.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">
            Armor
          </div>
          <div className="text-xs text-gray-300">
            {armorProfs.join(", ")}
          </div>
        </div>
      )}

      {/* Weapon Proficiencies — BUG #12: strip {@filter} tags */}
      {weaponProfs.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">
            Weapons
          </div>
          <div className="text-xs text-gray-300">
            {weaponProfs.map(stripFilterTags).join(", ")}
          </div>
        </div>
      )}

      {/* Skill Choices */}
      {skillChoices && (
        <div>
          <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">
            Skill Choices ({skillChoices.count})
          </div>
          <div className="flex flex-wrap gap-1">
            {skillChoices.from.map((s: string) => (
              <span
                key={s}
                className="text-[10px] bg-purple-900/20 text-purple-400 border border-purple-800/30 rounded px-1.5 py-0.5"
              >
                {formatSkillName(s)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Spell Slot Table */}
      {spellSlotTable && spellSlotTable.length > 0 && (
        <SpellSlotTable slots={spellSlotTable} currentLevel={level} />
      )}

      <div className="text-[10px] text-gray-600">{cls.source}</div>
    </div>
  );
}

// ─── Class Features Section (full-width, collapsible) ─────

function ClassFeaturesSection({
  cls,
  level,
  subclassName,
}: {
  cls: ClassAssembled;
  level: number;
  subclassName: string | null;
}) {
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  const classFeatures = cls.resolvedFeatures.filter((f: ClassFeatureRaw) => f.level <= level);

  const subclassData = useMemo(() => {
    if (!subclassName) return null;
    return cls.resolvedSubclasses.find((sc) => sc.name === subclassName) ?? null;
  }, [cls, subclassName]);

  const subclassFeatures =
    subclassData?.resolvedFeatures.filter((f: SubclassFeatureRaw) => f.level <= level) ?? [];
  const totalCount = classFeatures.length + subclassFeatures.length;

  if (totalCount === 0) return null;

  // Group features by level for a compact timeline view
  const featuresByLevel = new Map<number, { class: ClassFeatureRaw[]; subclass: SubclassFeatureRaw[] }>();
  for (const f of classFeatures) {
    if (!featuresByLevel.has(f.level)) featuresByLevel.set(f.level, { class: [], subclass: [] });
    featuresByLevel.get(f.level)!.class.push(f);
  }
  for (const f of subclassFeatures) {
    if (!featuresByLevel.has(f.level)) featuresByLevel.set(f.level, { class: [], subclass: [] });
    featuresByLevel.get(f.level)!.subclass.push(f);
  }

  // Build a lookup map from key → feature for both class and subclass features
  const featureByKey = new Map<string, ClassFeatureRaw | SubclassFeatureRaw>();
  for (const f of classFeatures) featureByKey.set(`${f.name}-${f.level}`, f);
  for (let i = 0; i < subclassFeatures.length; i++) {
    const f = subclassFeatures[i];
    featureByKey.set(`sc-${f.name}-${f.level}-${i}`, f);
  }
  const expandedOpt = expandedFeature ? featureByKey.get(expandedFeature) ?? null : null;

  return (
    <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-3 space-y-2">
      <div className="text-xs font-medium text-gray-200">
        Class Features
        <span className="text-[10px] text-gray-500 font-normal ml-2">
          Lv 1–{level} &middot; {totalCount}
        </span>
      </div>

      {/* Compact timeline */}
      <div className="space-y-1.5">
        {Array.from(featuresByLevel.entries())
          .sort(([a], [b]) => a - b)
          .map(([lv, features]) => (
            <div key={lv} className="flex items-start gap-2">
              <span className="text-[9px] text-gray-600 font-mono w-5 shrink-0 pt-0.5 text-right">{lv}</span>
              <div className="flex flex-wrap gap-1">
                {features.class.map((f) => {
                  const key = `${f.name}-${f.level}`;
                  const isExpanded = expandedFeature === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setExpandedFeature(isExpanded ? null : key)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        isExpanded
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                          : "border-gray-700/50 bg-gray-900/40 text-gray-300 hover:border-gray-600 hover:text-gray-200"
                      }`}
                    >
                      {f.name}
                    </button>
                  );
                })}
                {features.subclass.map((f, i) => {
                  const key = `sc-${f.name}-${f.level}-${i}`;
                  const isExpanded = expandedFeature === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setExpandedFeature(isExpanded ? null : key)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        isExpanded
                          ? "border-purple-500/30 bg-purple-500/10 text-purple-300"
                          : "border-purple-800/30 bg-purple-900/20 text-purple-400/80 hover:border-purple-700/50 hover:text-purple-300"
                      }`}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      {/* Expanded feature detail */}
      {expandedOpt && (
        <div className="border-t border-gray-700/40 pt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-amber-300/80">{expandedOpt.name}</span>
            <button onClick={() => setExpandedFeature(null)} className="text-gray-600 hover:text-gray-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <RichText entries={expandedOpt.entries} className="text-xs text-gray-500" />
        </div>
      )}
    </div>
  );
}

// ─── Spell Slot Table ─────────────────────────────────────

function SpellSlotTable({
  slots,
  currentLevel,
}: {
  slots: number[][];
  currentLevel: number;
}) {
  const row = slots[Math.min(currentLevel, 20) - 1];
  if (!row || row.every((v) => v === 0)) return null;

  const maxCol = row.reduce((max, v, i) => (v > 0 ? i : max), -1);
  if (maxCol < 0) return null;

  return (
    <div>
      <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">
        Spell Slots (Level {currentLevel})
      </div>
      <div className="flex gap-1">
        {row.slice(0, maxCol + 1).map((count, i) => (
          <div
            key={i}
            className="bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-center"
          >
            <div className="text-[8px] text-gray-600">{ordinal(i + 1)}</div>
            <div className="text-[10px] text-gray-300 font-medium">{count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
