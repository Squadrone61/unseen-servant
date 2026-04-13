"use client";

import { useMemo, useState } from "react";
import { classesArray } from "@unseen-servant/shared/data";
import type {
  ClassDb,
  ClassFeatureDb,
  SubclassDb,
  SubclassFeatureDb,
} from "@unseen-servant/shared/types";
import { DetailPopover } from "@/components/character/DetailPopover";
import { ChoicePicker } from "@/components/builder/ChoicePicker";
import { WeaponMasteryPicker } from "@/components/builder/WeaponMasteryPicker";
import { EffectSummary } from "@/components/builder/EffectSummary";
import { RichText } from "@/components/ui/RichText";
import { InfoButton } from "@/components/builder/InfoButton";
import { useBuilder } from "../BuilderContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an Ability string from the DB (e.g. "strength") → "STR" */
const ABILITY_ABBR: Record<string, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

function abilityAbbr(a: string): string {
  return ABILITY_ABBR[a.toLowerCase()] ?? a.toUpperCase().slice(0, 3);
}

/** Build the compact stat line: "d10 · STR/CON saves" */
function buildStatLine(cls: ClassDb): string {
  const parts: string[] = [`d${cls.hitDiceFaces}`];
  if (cls.savingThrows.length > 0) {
    parts.push(cls.savingThrows.map(abilityAbbr).join("/") + " saves");
  }
  return parts.join(" · ");
}

/** Build proficiency summary line: "All Armor · All Weapons" */
function buildProficiencyLine(cls: ClassDb): string {
  const parts: string[] = [];

  if (cls.armorProficiencies.length > 0) {
    const armors = cls.armorProficiencies;
    const hasAllArmor =
      armors.includes("Light Armor") &&
      armors.includes("Medium Armor") &&
      armors.includes("Heavy Armor");
    parts.push(hasAllArmor ? "All Armor" : armors.join(", "));
  } else {
    parts.push("No Armor");
  }

  if (cls.weaponProficiencies.length > 0) {
    const weapons = cls.weaponProficiencies;
    const hasAllWeapons = weapons.includes("Simple Weapons") && weapons.includes("Martial Weapons");
    parts.push(hasAllWeapons ? "All Weapons" : weapons.join(", "));
  }

  if (cls.toolProficiencies.length > 0) {
    parts.push(cls.toolProficiencies.join(", "));
  }

  return parts.join(" · ");
}

/** Caster type label + style for badge */
function getCasterBadge(
  progression: string | undefined,
): { label: string; className: string } | null {
  if (!progression) return null;
  const labels: Record<string, string> = {
    full: "Full Caster",
    half: "Half Caster",
    third: "1/3 Caster",
    pact: "Pact Magic",
  };
  return {
    label: labels[progression] ?? progression,
    className: "bg-violet-900/40 text-violet-300 border border-violet-700/40",
  };
}

/** Returns the subclass unlock level for a given class (defaults to 3). */
function getSubclassUnlockLevel(cls: ClassDb): number {
  const subclassFeature = cls.features.find((f) => f.name.toLowerCase().includes("subclass"));
  return subclassFeature?.level ?? 3;
}

/** Returns class features up to the given level, excluding "Subclass" placeholder features. */
function getClassFeaturesUpToLevel(cls: ClassDb, level: number): ClassFeatureDb[] {
  return cls.features.filter((f) => f.level <= level && !f.name.toLowerCase().includes("subclass"));
}

/** Returns subclass features up to the given level. */
function getSubclassFeaturesUpToLevel(sub: SubclassDb, level: number): SubclassFeatureDb[] {
  return sub.features.filter((f) => f.level <= level);
}

/** Group features by level. */
function groupByLevel<T extends { level: number }>(features: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const f of features) {
    const existing = map.get(f.level) ?? [];
    existing.push(f);
    map.set(f.level, existing);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Class Popover
// ---------------------------------------------------------------------------

function ClassPopover({
  cls,
  onClose,
  position,
}: {
  cls: ClassDb;
  onClose: () => void;
  position: { x: number; y: number };
}) {
  const casterBadge = getCasterBadge(cls.casterProgression);
  const profLine = buildProficiencyLine(cls);

  return (
    <DetailPopover title={cls.name} onClose={onClose} position={position}>
      <div className="space-y-3">
        {/* Quick stats */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-700/30">
            d{cls.hitDiceFaces} Hit Die
          </span>
          {cls.savingThrows.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-300 border border-gray-600/30">
              {cls.savingThrows.map(abilityAbbr).join("/")} saves
            </span>
          )}
          {casterBadge && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${casterBadge.className}`}>
              {casterBadge.label}
            </span>
          )}
        </div>

        {/* Proficiencies */}
        {profLine && <p className="text-xs text-gray-400 leading-relaxed">{profLine}</p>}

        {/* Description */}
        <div className="text-sm text-gray-300 leading-relaxed">
          <RichText text={cls.description} />
        </div>

        {/* Skill choices count */}
        {cls.skillChoices && (
          <p className="text-xs text-gray-500">
            Choose {cls.skillChoices.count} skill
            {cls.skillChoices.count !== 1 ? "s" : ""} from {cls.skillChoices.from.length} options.
          </p>
        )}
      </div>
    </DetailPopover>
  );
}

// ---------------------------------------------------------------------------
// Compact Class Card
// ---------------------------------------------------------------------------

function ClassCard({
  cls,
  isSelected,
  onClick,
  onInfo,
}: {
  cls: ClassDb;
  isSelected: boolean;
  onClick: () => void;
  onInfo: (e: React.MouseEvent) => void;
}) {
  const statLine = buildStatLine(cls);
  const profLine = buildProficiencyLine(cls);
  const casterBadge = getCasterBadge(cls.casterProgression);

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-4 py-3 rounded-lg border transition-all duration-200
        ${
          isSelected
            ? "border-amber-500/50 bg-amber-950/20 ring-1 ring-amber-500/20"
            : "border-gray-700/30 bg-gray-800/40 hover:border-gray-600/50 hover:bg-gray-800/60"
        }
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span
              className={`font-[family-name:var(--font-cinzel)] text-sm ${
                isSelected ? "text-amber-200" : "text-gray-200"
              }`}
            >
              {cls.name}
            </span>
            {casterBadge && (
              <span
                className={`text-[10px] px-1.5 py-px rounded-full shrink-0 ${casterBadge.className}`}
              >
                {casterBadge.label}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500">{profLine}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400 whitespace-nowrap tabular-nums">{statLine}</span>
          <InfoButton onClick={onInfo} />
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Subclass Popover
// ---------------------------------------------------------------------------

function SubclassPopover({
  subclass,
  onClose,
  position,
}: {
  subclass: SubclassDb;
  onClose: () => void;
  position: { x: number; y: number };
}) {
  const casterBadge = getCasterBadge(subclass.casterProgression);

  return (
    <DetailPopover title={subclass.name} onClose={onClose} position={position}>
      <div className="space-y-3">
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {casterBadge && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${casterBadge.className}`}>
              {casterBadge.label}
            </span>
          )}
          {subclass.additionalSpells && subclass.additionalSpells.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-300 border border-blue-700/30">
              Bonus Spells
            </span>
          )}
        </div>

        {/* Description */}
        {subclass.description && (
          <div className="text-sm text-gray-300 leading-relaxed">
            <RichText text={subclass.description} />
          </div>
        )}

        {/* Additional spells */}
        {subclass.additionalSpells && subclass.additionalSpells.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-blue-300/80 uppercase tracking-wide">
              Additional Spells
            </span>
            <div className="flex flex-wrap gap-1.5">
              {subclass.additionalSpells.map((entry) => (
                <span
                  key={`${entry.spell}-${entry.minLevel}`}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs border bg-violet-900/20 text-violet-300 border-violet-700/30"
                >
                  {entry.spell}
                  {entry.minLevel > 1 && (
                    <span className="ml-1 text-violet-400/60">L{entry.minLevel}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Feature preview (first feature name only as a teaser) */}
        {subclass.features.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Features
            </span>
            <ul className="flex flex-col gap-1">
              {subclass.features.slice(0, 6).map((f) => (
                <li key={f.name} className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="inline-flex items-center px-1 py-px rounded text-[10px] bg-gray-700/40 text-gray-500 border border-gray-600/30 tabular-nums font-mono">
                    {f.level}
                  </span>
                  {f.name}
                </li>
              ))}
              {subclass.features.length > 6 && (
                <li className="text-xs text-gray-600 italic pl-5">
                  +{subclass.features.length - 6} more
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </DetailPopover>
  );
}

// ---------------------------------------------------------------------------
// Compact Subclass Card
// ---------------------------------------------------------------------------

function SubclassCard({
  subclass,
  isSelected,
  onClick,
  onInfo,
}: {
  subclass: SubclassDb;
  isSelected: boolean;
  onClick: () => void;
  onInfo: (e: React.MouseEvent) => void;
}) {
  const casterBadge = getCasterBadge(subclass.casterProgression);
  const hasBonusSpells = subclass.additionalSpells && subclass.additionalSpells.length > 0;

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-4 py-3 rounded-lg border transition-all duration-200
        ${
          isSelected
            ? "border-amber-500/50 bg-amber-950/20 ring-1 ring-amber-500/20"
            : "border-gray-700/30 bg-gray-800/40 hover:border-gray-600/50 hover:bg-gray-800/60"
        }
      `}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-[family-name:var(--font-cinzel)] text-sm ${
            isSelected ? "text-amber-200" : "text-gray-200"
          }`}
        >
          {subclass.name}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasBonusSpells && (
            <span className="text-[10px] px-1.5 py-px rounded-full bg-blue-900/30 text-blue-300 border border-blue-700/30">
              Spells
            </span>
          )}
          {casterBadge && (
            <span className={`text-[10px] px-1.5 py-px rounded-full ${casterBadge.className}`}>
              {casterBadge.label}
            </span>
          )}
          <InfoButton onClick={onInfo} />
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Level Picker
// ---------------------------------------------------------------------------

interface LevelPickerProps {
  level: number;
  maxLevel: number;
  onChange: (level: number) => void;
}

function LevelPicker({ level, maxLevel, onChange }: LevelPickerProps) {
  function clamp(v: number) {
    return Math.min(maxLevel, Math.max(1, v));
  }

  return (
    <div className="flex items-center gap-4" role="group" aria-label="Character level">
      {/* Decrement */}
      <button
        type="button"
        aria-label="Decrease level"
        disabled={level <= 1}
        onClick={() => onChange(clamp(level - 1))}
        className={[
          "w-8 h-8 rounded-lg border flex items-center justify-center transition-all duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
          level <= 1
            ? "border-gray-700/30 text-gray-600 cursor-not-allowed"
            : "border-gray-600/40 text-gray-300 hover:border-amber-500/50 hover:text-amber-300 cursor-pointer",
        ].join(" ")}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
        </svg>
      </button>

      {/* Slider + number display */}
      <div className="flex-1 flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={maxLevel}
          value={level}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Level slider"
          aria-valuemin={1}
          aria-valuemax={maxLevel}
          aria-valuenow={level}
          className="
            flex-1 h-1.5 appearance-none rounded-full bg-gray-700
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-amber-400
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-amber-500
            [&::-moz-range-thumb]:w-4
            [&::-moz-range-thumb]:h-4
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-amber-400
            [&::-moz-range-thumb]:cursor-pointer
            [&::-moz-range-thumb]:border-2
            [&::-moz-range-thumb]:border-amber-500
            accent-amber-500
          "
        />
        <span
          className="w-8 text-center font-[family-name:var(--font-cinzel)] text-amber-300 text-base font-semibold tabular-nums"
          aria-live="polite"
        >
          {level}
        </span>
      </div>

      {/* Increment */}
      <button
        type="button"
        aria-label="Increase level"
        disabled={level >= maxLevel}
        onClick={() => onChange(clamp(level + 1))}
        className={[
          "w-8 h-8 rounded-lg border flex items-center justify-center transition-all duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
          level >= maxLevel
            ? "border-gray-700/30 text-gray-600 cursor-not-allowed"
            : "border-gray-600/40 text-gray-300 hover:border-amber-500/50 hover:text-amber-300 cursor-pointer",
        ].join(" ")}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16" />
        </svg>
      </button>

      {/* Ordinal label */}
      <span className="text-sm text-gray-400 w-16 shrink-0">{ordinalLevel(level)}</span>
    </div>
  );
}

function ordinalLevel(n: number): string {
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]) + " Level";
}

// ---------------------------------------------------------------------------
// Level Badge
// ---------------------------------------------------------------------------

function LevelBadge({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs border bg-gray-700/40 text-gray-400 border-gray-600/30 font-mono tabular-nums">
      Lv {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Feature Row
// ---------------------------------------------------------------------------

interface FeatureRowProps {
  feature: ClassFeatureDb | SubclassFeatureDb;
  choiceSelections: Record<string, string[]>;
  onChoiceSelect: (choiceId: string, values: string[]) => void;
  choicePrefix?: string;
  /** When provided, renders a WeaponMasteryPicker for the "Weapon Mastery" feature. */
  weaponMasteryClassName?: string;
}

function FeatureRow({
  feature,
  choiceSelections,
  onChoiceSelect,
  choicePrefix = "",
  weaponMasteryClassName,
}: FeatureRowProps) {
  const [expanded, setExpanded] = useState(false);

  const hasDescription = Boolean(feature.description);
  const hasEffects =
    (feature.effects?.modifiers?.length ?? 0) > 0 || (feature.effects?.properties?.length ?? 0) > 0;

  const permanentChoices = feature.choices?.filter((c) => c.timing === "permanent") ?? [];
  const hasPermanentChoices = permanentChoices.length > 0;

  const isWeaponMastery =
    feature.name === "Weapon Mastery" &&
    weaponMasteryClassName !== undefined &&
    weaponMasteryClassName in
      ({ Barbarian: 1, Fighter: 1, Paladin: 1, Ranger: 1, Rogue: 1 } as Record<string, number>);

  const WEAPON_MASTERY_CHOICE_ID = "weapon-mastery";

  return (
    <li className="flex flex-col gap-2 pl-4 border-l-2 border-gray-700/40">
      {/* Feature header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-200">{feature.name}</span>
          {hasEffects && <EffectSummary effects={feature.effects} compact />}
          {(hasPermanentChoices || isWeaponMastery) && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs border bg-amber-900/20 text-amber-400/80 border-amber-600/30">
              choose
            </span>
          )}
        </div>

        {hasDescription && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse feature description" : "Expand feature description"}
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 flex items-center gap-1 text-xs text-amber-400/60 hover:text-amber-300 transition-colors duration-150 focus:outline-none"
          >
            <svg
              className={[
                "w-3 h-3 transition-transform duration-150",
                expanded ? "rotate-90" : "rotate-0",
              ].join(" ")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {expanded ? "Less" : "More"}
          </button>
        )}
      </div>

      {expanded && hasDescription && (
        <div className="text-xs text-gray-400 leading-relaxed">
          <RichText text={feature.description} />
        </div>
      )}

      {isWeaponMastery && (
        <div className="mt-1">
          <WeaponMasteryPicker
            className={weaponMasteryClassName ?? ""}
            selected={choiceSelections[WEAPON_MASTERY_CHOICE_ID] ?? []}
            onSelect={(weapons) => onChoiceSelect(WEAPON_MASTERY_CHOICE_ID, weapons)}
          />
        </div>
      )}

      {hasPermanentChoices && (
        <div className="flex flex-col gap-2 mt-1">
          {permanentChoices.map((choice) => {
            const choiceId = choicePrefix ? `${choicePrefix}${choice.id}` : choice.id;
            return (
              <ChoicePicker
                key={choiceId}
                choice={choice}
                selected={choiceSelections[choiceId] ?? []}
                onSelect={(values) => onChoiceSelect(choiceId, values)}
                nestedSelections={choiceSelections}
                onNestedSelect={(nestedId, values) => onChoiceSelect(nestedId, values)}
              />
            );
          })}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Feature Level Group
// ---------------------------------------------------------------------------

interface FeatureLevelGroupProps {
  level: number;
  features: (ClassFeatureDb | SubclassFeatureDb)[];
  choiceSelections: Record<string, string[]>;
  onChoiceSelect: (choiceId: string, values: string[]) => void;
  choicePrefix?: string;
  extra?: React.ReactNode;
  weaponMasteryClassName?: string;
}

function FeatureLevelGroup({
  level,
  features,
  choiceSelections,
  onChoiceSelect,
  choicePrefix,
  extra,
  weaponMasteryClassName,
}: FeatureLevelGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 mb-2">
        <LevelBadge level={level} />
        <div className="h-px flex-1 bg-gray-700/30" aria-hidden="true" />
      </div>

      <ul className="flex flex-col gap-3" role="list">
        {features.map((feature) => (
          <FeatureRow
            key={feature.name}
            feature={feature}
            choiceSelections={choiceSelections}
            onChoiceSelect={onChoiceSelect}
            choicePrefix={choicePrefix}
            weaponMasteryClassName={weaponMasteryClassName}
          />
        ))}
        {extra}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Class Tabs (multiclass)
// ---------------------------------------------------------------------------

interface ClassTabsProps {
  classes: Array<{ name: string; level: number }>;
  activeIndex: number;
  atCap: boolean;
  onTabClick: (index: number) => void;
  onRemove: (index: number) => void;
  onAddClass: () => void;
}

function ClassTabs({
  classes,
  activeIndex,
  atCap,
  onTabClick,
  onRemove,
  onAddClass,
}: ClassTabsProps) {
  return (
    <div
      className="flex gap-0 border-b border-gray-700/40 overflow-x-auto"
      role="tablist"
      aria-label="Class selection"
    >
      {classes.map((entry, idx) => (
        <div key={entry.name} className="flex items-stretch shrink-0">
          <button
            type="button"
            role="tab"
            aria-selected={idx === activeIndex}
            onClick={() => onTabClick(idx)}
            className={[
              "px-3 py-2 text-sm border-b-2 transition-colors duration-100 flex items-center gap-1.5",
              idx === activeIndex
                ? "border-amber-500 text-amber-400 font-medium"
                : "border-transparent text-gray-500 hover:text-gray-300",
            ].join(" ")}
          >
            <span className="font-[family-name:var(--font-cinzel)]">{entry.name}</span>
            <span className="text-[10px] text-gray-500 tabular-nums">Lv {entry.level}</span>
          </button>
          {/* Remove button — only show when there are multiple classes */}
          {classes.length > 1 && (
            <button
              type="button"
              aria-label={`Remove ${entry.name}`}
              onClick={() => onRemove(idx)}
              className="px-1 pb-0.5 text-gray-600 hover:text-red-400 transition-colors duration-100 border-b-2 border-transparent"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}

      {/* Add class tab */}
      <button
        type="button"
        disabled={atCap}
        onClick={onAddClass}
        title={atCap ? "Total character level is 20 (maximum)" : "Add a multiclass"}
        className={[
          "shrink-0 px-3 py-2 text-sm border-b-2 border-transparent transition-colors duration-100 flex items-center gap-1",
          atCap ? "text-gray-700 cursor-not-allowed" : "text-gray-500 hover:text-amber-300",
        ].join(" ")}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16" />
        </svg>
        Add Class
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multiclass Requirements Warning
// ---------------------------------------------------------------------------

interface MulticlassWarningProps {
  cls: ClassDb;
  /** Resolved ability scores (base + background bonuses) */
  resolvedScores: Record<string, number>;
}

function MulticlassWarning({ cls, resolvedScores }: MulticlassWarningProps) {
  if (!cls.multiclassing?.requirements) return null;

  const unmet = Object.entries(cls.multiclassing.requirements).filter(([ability, minScore]) => {
    const score = resolvedScores[ability.toLowerCase()] ?? 0;
    return score < minScore;
  });

  if (unmet.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-4 py-3 rounded-lg border border-amber-600/30 bg-amber-950/20">
      {unmet.map(([ability, _minScore]) => {
        const score = resolvedScores[ability.toLowerCase()] ?? 0;
        return (
          <p key={ability} className="text-xs text-amber-300/90 leading-relaxed">
            Warning: {cls.name} multiclass requires {abilityAbbr(ability)} 13+. Your current score
            is {score}.
          </p>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ClassStep() {
  const { state, dispatch } = useBuilder();

  const [classPopover, setClassPopover] = useState<{
    cls: ClassDb;
    position: { x: number; y: number };
  } | null>(null);

  const [subclassPopover, setSubclassPopover] = useState<{
    subclass: SubclassDb;
    position: { x: number; y: number };
  } | null>(null);

  /** True when the user has opened the "add a class" picker panel. */
  const [isAddingClass, setIsAddingClass] = useState(false);

  // Sorted class list
  const sortedClasses = useMemo(
    () => [...classesArray].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  // Derived values for the currently active class entry
  const activeIdx = state.activeClassIndex;
  const activeEntry = state.classes[activeIdx] ?? null;
  const activeClassName = activeEntry?.name ?? null;
  const activeClassLevel = activeEntry?.level ?? 1;
  const activeSubclass = activeEntry?.subclass ?? null;
  const activeClassSkills = activeEntry?.skills ?? [];
  const activeClassChoices = activeEntry?.choices ?? {};

  // Total level across all classes
  const totalLevel = useMemo(
    () => state.classes.reduce((sum, c) => sum + c.level, 0),
    [state.classes],
  );
  const atCap = totalLevel >= 20;

  // Max level this class can reach (20 minus all other classes' levels, min 1)
  const otherLevels = useMemo(
    () => state.classes.reduce((sum, c, i) => (i === activeIdx ? sum : sum + c.level), 0),
    [state.classes, activeIdx],
  );
  const maxLevelForActive = Math.max(1, 20 - otherLevels);

  // Resolved selected class data
  const selectedClass = useMemo(
    () =>
      activeClassName ? (sortedClasses.find((c) => c.name === activeClassName) ?? null) : null,
    [activeClassName, sortedClasses],
  );

  // Subclass unlock level
  const subclassUnlockLevel = useMemo(
    () => (selectedClass ? getSubclassUnlockLevel(selectedClass) : 3),
    [selectedClass],
  );

  const subclassAvailable = activeClassLevel >= subclassUnlockLevel;

  // Resolved selected subclass data
  const selectedSubclass = useMemo(
    () =>
      selectedClass && activeSubclass
        ? (selectedClass.subclasses.find((s) => s.name === activeSubclass) ?? null)
        : null,
    [selectedClass, activeSubclass],
  );

  // Class features up to current level (excluding subclass placeholder)
  const classFeatures = useMemo(
    () => (selectedClass ? getClassFeaturesUpToLevel(selectedClass, activeClassLevel) : []),
    [selectedClass, activeClassLevel],
  );

  const classFeaturesByLevel = useMemo(() => groupByLevel(classFeatures), [classFeatures]);

  // Subclass features up to current level
  const subclassFeatures = useMemo(
    () =>
      selectedSubclass ? getSubclassFeaturesUpToLevel(selectedSubclass, activeClassLevel) : [],
    [selectedSubclass, activeClassLevel],
  );

  const subclassFeaturesByLevel = useMemo(() => groupByLevel(subclassFeatures), [subclassFeatures]);

  // Merged level list for feature timeline
  const allFeatureLevels = useMemo(() => {
    const levelsSet = new Set<number>([
      ...classFeaturesByLevel.keys(),
      ...subclassFeaturesByLevel.keys(),
    ]);
    return [...levelsSet].sort((a, b) => a - b);
  }, [classFeaturesByLevel, subclassFeaturesByLevel]);

  // Resolved ability scores (base + background bonuses) for multiclass requirement checks
  const resolvedAbilityScores = useMemo(() => {
    const result: Record<string, number> = { ...state.baseAbilities };
    for (const [ability, bonus] of Object.entries(state.abilityScoreAssignments)) {
      if (typeof bonus === "number") {
        result[ability] = (result[ability] ?? 0) + bonus;
      }
    }
    return result;
  }, [state.baseAbilities, state.abilityScoreAssignments]);

  // Classes already chosen — used to exclude them from the add-class picker
  const chosenClassNames = useMemo(
    () => new Set(state.classes.map((c) => c.name)),
    [state.classes],
  );

  // Filtered class list for the add-class picker (excludes already-chosen classes)
  const availableToAdd = useMemo(
    () => sortedClasses.filter((c) => !chosenClassNames.has(c.name)),
    [sortedClasses, chosenClassNames],
  );

  // Whether to show the multiclass tabs (only when 2+ classes exist)
  const showTabs = state.classes.length > 1;

  // Whether to show the initial class grid (no class chosen yet, or user hit "Change")
  const showInitialPicker = state.classes.length === 0;

  // ---- Handlers ------------------------------------------------------------

  function handleClassInfo(cls: ClassDb, e: React.MouseEvent) {
    setClassPopover({ cls, position: { x: e.clientX, y: e.clientY } });
  }

  function handleClassCardClick(name: string) {
    if (activeClassName === name) return;
    // No classes chosen yet: first selection
    if (state.classes.length === 0) {
      dispatch({ type: "ADD_CLASS", className: name });
    } else {
      // Replacing the primary class (single-class mode, "Change" was clicked)
      dispatch({ type: "REMOVE_CLASS", index: 0 });
      dispatch({ type: "ADD_CLASS", className: name });
    }
  }

  function handleAddClassCardClick(name: string) {
    dispatch({ type: "ADD_CLASS", className: name });
    setIsAddingClass(false);
  }

  function handleLevelChange(level: number) {
    dispatch({ type: "SET_CLASS_LEVEL", index: activeIdx, level });
  }

  function handleSubclassInfo(subclass: SubclassDb, e: React.MouseEvent) {
    setSubclassPopover({ subclass, position: { x: e.clientX, y: e.clientY } });
  }

  function handleSubclassCardClick(name: string) {
    handleSubclassToggleSelect(name);
  }

  function handleSubclassToggleSelect(name: string) {
    if (activeSubclass === name) {
      dispatch({ type: "SET_CLASS_SUBCLASS", index: activeIdx, subclass: "" });
    } else {
      dispatch({ type: "SET_CLASS_SUBCLASS", index: activeIdx, subclass: name });
    }
  }

  function handleSkillSelect(skills: string[]) {
    dispatch({ type: "SET_CLASS_SKILLS", index: activeIdx, skills });
  }

  function handleClassChoice(choiceId: string, values: string[]) {
    dispatch({ type: "SET_CLASS_CHOICE", index: activeIdx, choiceId, values });
  }

  function handleTabClick(index: number) {
    dispatch({ type: "SET_ACTIVE_CLASS", index });
    setIsAddingClass(false);
  }

  function handleRemoveClass(index: number) {
    dispatch({ type: "REMOVE_CLASS", index });
    setIsAddingClass(false);
  }

  // ---- Derived display values -----------------------------------------------

  const selectedClassStatLine = selectedClass ? buildStatLine(selectedClass) : null;

  // ---- Render ---------------------------------------------------------------

  return (
    <section aria-labelledby="class-step-heading" className="flex flex-col gap-8">
      {/* ── Section header ── */}
      <div>
        <h1
          id="class-step-heading"
          className="text-xl font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1"
        >
          Choose Your Class
        </h1>
        <p className="text-sm text-gray-400">
          Your class defines your primary role in the adventuring party — your combat style,
          abilities, and the features you gain as you level up. Click any class to see full details.
        </p>
      </div>

      {/* ── Initial class grid (no class chosen yet) ── */}
      {showInitialPicker && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {sortedClasses.map((cls) => (
            <ClassCard
              key={cls.name}
              cls={cls}
              isSelected={false}
              onClick={() => handleClassCardClick(cls.name)}
              onInfo={(e) => handleClassInfo(cls, e)}
            />
          ))}
        </div>
      )}

      {/* ── Configuration panel — shown when at least one class is chosen ── */}
      {state.classes.length > 0 && (
        <>
          {/* ── Multiclass tabs (only when 2+ classes) ── */}
          {showTabs && (
            <ClassTabs
              classes={state.classes}
              activeIndex={activeIdx}
              atCap={atCap}
              onTabClick={handleTabClick}
              onRemove={handleRemoveClass}
              onAddClass={() => setIsAddingClass(true)}
            />
          )}

          {/* ── Add class picker panel (shown when isAddingClass = true) ── */}
          {isAddingClass && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-[family-name:var(--font-cinzel)] text-gray-200 mb-0.5">
                    Add a Class
                  </h3>
                  <p className="text-xs text-gray-500">
                    Remaining levels: {20 - totalLevel}. Each class starts at level 1.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingClass(false)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {availableToAdd.map((cls) => (
                  <ClassCard
                    key={cls.name}
                    cls={cls}
                    isSelected={false}
                    onClick={() => handleAddClassCardClick(cls.name)}
                    onInfo={(e) => handleClassInfo(cls, e)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Single-class banner (only when not in tabs mode and not adding) ── */}
          {!showTabs && !isAddingClass && selectedClass && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-950/15">
              <span className="text-sm text-amber-200 font-medium">{selectedClass.name}</span>
              <span className="text-xs text-gray-500">{selectedClassStatLine}</span>
              <div className="flex-1" />
              <button
                onClick={(e) => handleClassInfo(selectedClass, e)}
                className="text-xs text-amber-400/70 hover:text-amber-300 transition-colors"
              >
                View Details
              </button>
              <button
                onClick={() => dispatch({ type: "REMOVE_CLASS", index: 0 })}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Change
              </button>
            </div>
          )}

          {/* ── Active class configuration (hidden while adding) ── */}
          {!isAddingClass && selectedClass && (
            <>
              {/* Divider */}
              <div
                className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"
                aria-hidden="true"
              />

              {/* ── Multiclass requirement warning (for non-primary classes) ── */}
              {activeIdx > 0 && (
                <MulticlassWarning cls={selectedClass} resolvedScores={resolvedAbilityScores} />
              )}

              {/* ── Total level cap notice ── */}
              {atCap && (
                <div className="px-4 py-2.5 rounded-lg border border-gray-700/30 bg-gray-800/30">
                  <p className="text-xs text-gray-400">
                    Total character level: 20 (maximum). To increase one class, reduce another.
                  </p>
                </div>
              )}

              {/* ── Level Picker ── */}
              <div className="bg-gray-800/30 border border-gray-700/20 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-300">
                    {showTabs ? `${selectedClass.name} Level` : "Character Level"}
                  </span>
                  <div className="flex items-center gap-3">
                    {showTabs && (
                      <span className="text-xs text-gray-600 tabular-nums">
                        Total: {totalLevel}/20
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      Proficiency Bonus: +{Math.floor((totalLevel - 1) / 4) + 2}
                    </span>
                  </div>
                </div>
                <LevelPicker
                  level={activeClassLevel}
                  maxLevel={maxLevelForActive}
                  onChange={handleLevelChange}
                />
              </div>

              {/* ── Skill Proficiencies ── */}
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-base font-[family-name:var(--font-cinzel)] text-gray-200 mb-1">
                    Skill Proficiencies
                  </h3>
                  <p className="text-xs text-gray-500">
                    {activeIdx === 0
                      ? `Choose ${selectedClass.skillChoices.count} skill${selectedClass.skillChoices.count !== 1 ? "s" : ""} from the ${selectedClass.name} skill list.`
                      : `Multiclass: choose ${selectedClass.multiclassing?.proficienciesGained?.skills?.count ?? selectedClass.skillChoices.count} skill${(selectedClass.multiclassing?.proficienciesGained?.skills?.count ?? selectedClass.skillChoices.count) !== 1 ? "s" : ""} from the ${selectedClass.name} list.`}
                  </p>
                </div>
                <ChoicePicker
                  choice={{
                    id: `class-skills-${activeIdx}`,
                    label: `${selectedClass.name} Skills`,
                    count:
                      activeIdx === 0
                        ? selectedClass.skillChoices.count
                        : (selectedClass.multiclassing?.proficienciesGained?.skills?.count ??
                          selectedClass.skillChoices.count),
                    timing: "permanent",
                    pool: "skill_proficiency",
                    from:
                      activeIdx === 0
                        ? selectedClass.skillChoices.from
                        : (selectedClass.multiclassing?.proficienciesGained?.skills?.from ??
                          selectedClass.skillChoices.from),
                  }}
                  selected={activeClassSkills}
                  onSelect={handleSkillSelect}
                />
              </div>

              {/* ── Subclass Picker ── (only when level >= subclass unlock level) */}
              {subclassAvailable && selectedClass.subclasses.length > 0 && (
                <>
                  <div
                    className="h-px bg-gradient-to-r from-transparent via-gray-700/40 to-transparent"
                    aria-hidden="true"
                  />

                  <div className="flex flex-col gap-4">
                    <div>
                      <h3 className="text-base font-[family-name:var(--font-cinzel)] text-gray-200 mb-1">
                        {selectedClass.name} Subclass
                      </h3>
                      <p className="text-xs text-gray-500">
                        At level {subclassUnlockLevel}, you choose a subclass that specialises your{" "}
                        {selectedClass.name}. Click any subclass to see details and select it.
                      </p>
                    </div>

                    {/* Selected subclass banner */}
                    {selectedSubclass && (
                      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-amber-500/20 bg-amber-950/10">
                        <span className="text-sm text-amber-200 font-medium">
                          {selectedSubclass.name}
                        </span>
                        <div className="flex-1" />
                        <button
                          onClick={(e) => handleSubclassInfo(selectedSubclass, e)}
                          className="text-xs text-amber-400/70 hover:text-amber-300 transition-colors"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() =>
                            dispatch({
                              type: "SET_CLASS_SUBCLASS",
                              index: activeIdx,
                              subclass: "",
                            })
                          }
                          className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                        >
                          Change
                        </button>
                      </div>
                    )}

                    {/* Subclass compact grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                      {selectedClass.subclasses.map((sub) => (
                        <SubclassCard
                          key={sub.name}
                          subclass={sub}
                          isSelected={activeSubclass === sub.name}
                          onClick={() => handleSubclassCardClick(sub.name)}
                          onInfo={(e) => handleSubclassInfo(sub, e)}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ── Feature List ── */}
              {allFeatureLevels.length > 0 && (
                <>
                  <div
                    className="h-px bg-gradient-to-r from-transparent via-gray-700/40 to-transparent"
                    aria-hidden="true"
                  />

                  <div className="flex flex-col gap-4">
                    <div>
                      <h3 className="text-base font-[family-name:var(--font-cinzel)] text-gray-200 mb-1">
                        Class Features
                      </h3>
                      <p className="text-xs text-gray-500">
                        Features you gain from level 1 through {activeClassLevel}. Features marked
                        "choose" require a permanent selection below.
                      </p>
                    </div>

                    <div className="flex flex-col gap-6">
                      {allFeatureLevels.map((lvl) => {
                        const classAtLevel = classFeaturesByLevel.get(lvl) ?? [];
                        const subclassAtLevel = subclassFeaturesByLevel.get(lvl) ?? [];

                        const isSubclassUnlockLevel = lvl === subclassUnlockLevel;
                        const showSubclassPrompt =
                          isSubclassUnlockLevel && subclassAvailable && !selectedSubclass;

                        const subclassPrompt = showSubclassPrompt ? (
                          <li className="flex items-center gap-2 pl-4 border-l-2 border-dashed border-amber-600/30 text-sm text-amber-400/70 italic">
                            <svg
                              className="w-4 h-4 shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            Pick a subclass above to see its features here.
                          </li>
                        ) : null;

                        return (
                          <FeatureLevelGroup
                            key={lvl}
                            level={lvl}
                            features={[...classAtLevel, ...subclassAtLevel]}
                            choiceSelections={activeClassChoices}
                            onChoiceSelect={handleClassChoice}
                            choicePrefix=""
                            extra={subclassPrompt}
                            weaponMasteryClassName={activeClassName ?? undefined}
                          />
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {allFeatureLevels.length === 0 && (
                <p className="text-sm text-gray-500 italic">
                  No features available for level {activeClassLevel}.
                </p>
              )}

              {/* ── Add a Class button (single-class mode, not at cap) ── */}
              {!showTabs && !atCap && (
                <>
                  <div
                    className="h-px bg-gradient-to-r from-transparent via-gray-700/20 to-transparent"
                    aria-hidden="true"
                  />
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setIsAddingClass(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 border border-gray-700/40 rounded-lg hover:border-amber-500/30 hover:text-amber-300 transition-all duration-150"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16" />
                      </svg>
                      Add a Class (Multiclass)
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ── Class Popover ── */}
      {classPopover && (
        <ClassPopover
          cls={classPopover.cls}
          onClose={() => setClassPopover(null)}
          position={classPopover.position}
        />
      )}

      {/* ── Subclass Popover ── */}
      {subclassPopover && (
        <SubclassPopover
          subclass={subclassPopover.subclass}
          onClose={() => setSubclassPopover(null)}
          position={subclassPopover.position}
        />
      )}
    </section>
  );
}
