"use client";

import type { CharacterData } from "@unseen-servant/shared/types";

interface LivePreviewProps {
  character: CharacterData | null;
  warnings: string[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signedMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

const ABILITY_LABELS: [keyof import("@unseen-servant/shared/types").AbilityScores, string][] = [
  ["strength", "STR"],
  ["dexterity", "DEX"],
  ["constitution", "CON"],
  ["intelligence", "INT"],
  ["wisdom", "WIS"],
  ["charisma", "CHA"],
];

function SectionHeader({ label }: { label: string }) {
  return (
    <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2 mt-4 first:mt-0">{label}</h3>
  );
}

function Divider() {
  return <div className="h-px bg-gray-700/30 my-3" />;
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyPreview() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <p className="text-gray-600 text-sm text-center">
        Select a class and set abilities to see preview
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Populated preview
// ---------------------------------------------------------------------------

function CharacterPreview({ character }: { character: CharacterData }) {
  const s = character.static;

  const className = s.classes.map((c) => `${c.name} ${c.level}`).join(" / ");

  const backgroundLabel = (s as CharacterData["static"] & { background?: string }).background;

  const identityFull = [s.race, backgroundLabel, className].filter(Boolean).join(" · ");

  // Skills: only proficient ones with total bonus
  const proficientSkills = s.skills
    .filter((sk) => sk.proficient || sk.expertise)
    .slice(0, 8)
    .map((sk) => {
      const prefix = sk.expertise ? "2x " : "";
      const bonus = sk.bonus ?? 0;
      return `${prefix}${titleCase(sk.name)} ${bonus >= 0 ? "+" : ""}${bonus}`;
    });

  // Save proficiencies: abbreviated
  const saveProfLabels = s.savingThrows
    .filter((sv) => sv.proficient)
    .map((sv) => sv.ability.slice(0, 3).toUpperCase());

  // Features: first 6 names
  const featureNames = s.features.slice(0, 6).map((f) => f.name);

  // Spells
  const cantrips = s.spells.filter((sp) => sp.level === 0).map((sp) => sp.name);
  const prepared = s.spells.filter((sp) => sp.level > 0 && sp.prepared);

  // Spell slots: non-zero from dynamic
  const spellSlots = character.dynamic.spellSlotsUsed;

  return (
    <div className="p-4 text-sm">
      {/* Identity */}
      <p
        className="text-amber-300 font-medium text-base mb-0.5"
        style={{ fontFamily: "var(--font-cinzel)" }}
      >
        {s.name || "Unnamed"}
      </p>
      <p className="text-gray-400 text-xs mb-1">{identityFull}</p>

      <Divider />

      {/* Core Stats */}
      <SectionHeader label="Core Stats" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <StatRow label="HP" value={String(s.maxHP)} />
        <StatRow label="AC" value={String(s.armorClass)} />
        <StatRow label="Speed" value={`${s.speed} ft`} />
        <StatRow label="Prof" value={`+${s.proficiencyBonus}`} />
      </div>

      <Divider />

      {/* Ability Scores */}
      <SectionHeader label="Ability Scores" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {ABILITY_LABELS.map(([key, abbr]) => {
          const score = s.abilities[key];
          return (
            <div key={key} className="flex justify-between">
              <span className="text-gray-500">{abbr}</span>
              <span className="text-amber-200 font-medium tabular-nums">
                {score}
                <span className="text-gray-500 font-normal ml-1">({signedMod(score)})</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Proficiencies */}
      {(saveProfLabels.length > 0 || proficientSkills.length > 0) && (
        <>
          <Divider />
          <SectionHeader label="Proficiencies" />
          {saveProfLabels.length > 0 && (
            <div className="mb-1">
              <span className="text-gray-500">Saves: </span>
              <span className="text-amber-200">{saveProfLabels.join(", ")}</span>
            </div>
          )}
          {proficientSkills.length > 0 && (
            <div>
              <span className="text-gray-500">Skills: </span>
              <span className="text-amber-200">{proficientSkills.join(", ")}</span>
            </div>
          )}
        </>
      )}

      {/* Features */}
      {featureNames.length > 0 && (
        <>
          <Divider />
          <SectionHeader label="Features" />
          <ul className="space-y-0.5">
            {featureNames.map((name) => (
              <li key={name} className="text-gray-400 flex gap-1.5">
                <span className="text-gray-600 shrink-0">•</span>
                <span>{name}</span>
              </li>
            ))}
            {s.features.length > 6 && (
              <li className="text-gray-600 text-xs pl-3.5">+{s.features.length - 6} more</li>
            )}
          </ul>
        </>
      )}

      {/* Spells */}
      {(cantrips.length > 0 || prepared.length > 0) && (
        <>
          <Divider />
          <SectionHeader label="Spells" />
          {cantrips.length > 0 && (
            <div className="mb-1">
              <span className="text-gray-500">Cantrips: </span>
              <span className="text-amber-200">{cantrips.join(", ")}</span>
            </div>
          )}
          {prepared.length > 0 && (
            <div>
              <span className="text-gray-500">Prepared: </span>
              <span className="text-amber-200">
                {prepared.length} spell{prepared.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          {spellSlots.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {spellSlots.map((slot) => (
                <span key={slot.level} className="text-gray-500 text-xs">
                  L{slot.level}: <span className="text-amber-200">{slot.total}</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {/* Languages */}
      {s.languages.length > 0 && (
        <>
          <Divider />
          <SectionHeader label="Languages" />
          <p className="text-gray-400">{s.languages.join(", ")}</p>
        </>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-amber-200 font-medium">{value}</span>
    </div>
  );
}

function titleCase(str: string): string {
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Component export
// ---------------------------------------------------------------------------

export function LivePreview({ character, warnings, className }: LivePreviewProps) {
  return (
    <aside
      className={[
        "w-[280px] shrink-0 flex flex-col bg-gray-900/50 border-l border-gray-700/40 overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/40 shrink-0">
        <h2
          className="text-xs font-medium text-amber-400/80 uppercase tracking-widest"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Character Preview
        </h2>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {character ? <CharacterPreview character={character} /> : <EmptyPreview />}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="shrink-0 border-t border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-400/80 flex gap-1.5 items-start">
              <span className="shrink-0" aria-hidden="true">
                &#9888;
              </span>
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}
    </aside>
  );
}
