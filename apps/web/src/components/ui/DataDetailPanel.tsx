"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import type { ParsedTag } from "@unseen-servant/shared";
import {
  getSpell, getMonster, getCondition, getDisease, getStatus,
  getMagicItem, getFeat, getOptionalFeature, getAction,
  formatSchool, formatCastingTime, formatRange, formatComponents,
  formatDuration, isConcentration, isRitual, formatSpellLevel,
  formatMonsterSize, formatMonsterType, formatMonsterAc, formatMonsterHp,
  formatMonsterSpeed, formatMonsterCr, formatAbilityMod, formatSaves,
  formatSkills, flattenResistances, flattenConditionImmunities, crToXp,
  formatFeatCategory, formatPrerequisite,
} from "@unseen-servant/shared";
import type {
  SpellData, MonsterData, ConditionData, MagicItemData,
  FeatData, OptionalFeatureData, ActionData, DiseaseData, StatusData,
  Entry,
} from "@unseen-servant/shared/data";
import { RichText } from "./RichText";

// ─── Types ──────────────────────────────────────────────

interface DataDetailPanelProps {
  /** The tag that was clicked to open this panel */
  tag: ParsedTag;
  /** Close the panel */
  onClose: () => void;
}

interface PanelStackEntry {
  tag: ParsedTag;
}

// ─── Main Panel ─────────────────────────────────────────

export function DataDetailPanel({ tag, onClose }: DataDetailPanelProps) {
  const [stack, setStack] = useState<PanelStackEntry[]>([{ tag }]);
  const panelRef = useRef<HTMLDivElement>(null);

  const currentTag = stack[stack.length - 1].tag;

  const handleClose = useCallback(() => {
    if (stack.length > 1) {
      setStack((s) => s.slice(0, -1));
    } else {
      onClose();
    }
  }, [stack.length, onClose]);

  const handleTagClick = useCallback((clickedTag: ParsedTag) => {
    setStack((s) => [...s, { tag: clickedTag }]);
  }, []);

  // Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleClose]);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-[1px]">
      <div
        ref={panelRef}
        className="w-full max-w-md h-full bg-gray-900/95 border-l border-gray-700/50 flex flex-col shadow-2xl animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/40 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {stack.length > 1 && (
              <button
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
                title="Back"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h3
              className="text-base font-semibold text-amber-200/90 truncate"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              {currentTag.displayText || currentTag.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 ml-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <DataContent tag={currentTag} onTagClick={handleTagClick} />
        </div>
      </div>
    </div>
  );
}

// ─── Content router ─────────────────────────────────────

function DataContent({ tag, onTagClick }: { tag: ParsedTag; onTagClick: (t: ParsedTag, e: React.MouseEvent) => void }) {
  switch (tag.type) {
    case "spell":
      return <SpellContent name={tag.name} onTagClick={onTagClick} />;
    case "condition":
      return <ConditionContent name={tag.name} onTagClick={onTagClick} />;
    case "disease":
      return <DiseaseContent name={tag.name} onTagClick={onTagClick} />;
    case "status":
      return <StatusContent name={tag.name} onTagClick={onTagClick} />;
    case "item":
      return <ItemContent name={tag.name} onTagClick={onTagClick} />;
    case "creature":
      return <MonsterContent name={tag.name} onTagClick={onTagClick} />;
    case "feat":
      return <FeatContent name={tag.name} onTagClick={onTagClick} />;
    case "optfeature":
      return <OptFeatureContent name={tag.name} onTagClick={onTagClick} />;
    case "action":
      return <ActionContent name={tag.name} onTagClick={onTagClick} />;
    default:
      return <div className="text-gray-500 text-sm">No data available for {tag.type}: {tag.name}</div>;
  }
}

// ─── Spell detail ───────────────────────────────────────

function SpellContent({ name, onTagClick }: { name: string; onTagClick: (t: ParsedTag, e: React.MouseEvent) => void }) {
  const spell = getSpell(name);
  if (!spell) return <NotFound type="Spell" name={name} />;

  return (
    <div className="space-y-3">
      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge color="amber">{formatSpellLevel(spell)}</Badge>
        <Badge color="gray">{formatSchool(spell.school)}</Badge>
        {isRitual(spell) && <Badge color="blue">Ritual</Badge>}
        {isConcentration(spell) && <Badge color="yellow">Concentration</Badge>}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Casting Time" value={formatCastingTime(spell)} />
        <StatBox label="Range" value={formatRange(spell.range)} />
        <StatBox label="Components" value={formatComponents(spell)} />
        <StatBox label="Duration" value={formatDuration(spell)} />
      </div>

      {/* Description */}
      {spell.entries && (
        <div>
          <SectionLabel>Description</SectionLabel>
          <RichText entries={spell.entries} onTagClick={onTagClick} />
        </div>
      )}

      {/* Higher Levels */}
      {spell.entriesHigherLevel && (
        <div>
          <SectionLabel>At Higher Levels</SectionLabel>
          <RichText entries={spell.entriesHigherLevel} onTagClick={onTagClick} />
        </div>
      )}

      <SourceLine source={spell.source} page={spell.page} />
    </div>
  );
}

// ─── Condition / Disease / Status ───────────────────────

function ConditionContent({ name, onTagClick }: { name: string; onTagClick: (t: ParsedTag, e: React.MouseEvent) => void }) {
  const cond = getCondition(name);
  if (!cond) return <NotFound type="Condition" name={name} />;
  return <EntriesBlock data={cond} onTagClick={onTagClick} badgeColor="red" badgeText="Condition" />;
}

function DiseaseContent({ name, onTagClick }: { name: string; onTagClick: (t: ParsedTag, e: React.MouseEvent) => void }) {
  const disease = getDisease(name);
  if (!disease) return <NotFound type="Disease" name={name} />;
  return <EntriesBlock data={disease} onTagClick={onTagClick} badgeColor="red" badgeText="Disease" />;
}

function StatusContent({ name, onTagClick }: { name: string; onTagClick: (t: ParsedTag, e: React.MouseEvent) => void }) {
  const status = getStatus(name);
  if (!status) return <NotFound type="Status" name={name} />;
  return <EntriesBlock data={status} onTagClick={onTagClick} badgeColor="orange" badgeText="Status" />;
}

// ─── Magic Item detail ──────────────────────────────────

function ItemContent({ name, onTagClick }: { name: string; onTagClick: (t: ParsedTag, e: React.MouseEvent) => void }) {
  const item = getMagicItem(name);
  if (!item) return <NotFound type="Item" name={name} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge color="emerald">Magic Item</Badge>
        {item.rarity && item.rarity !== "none" && (
          <Badge color={rarityColor(item.rarity)}>{capitalize(item.rarity)}</Badge>
        )}
        {item.reqAttune && (
          <Badge color="violet">
            Attunement{typeof item.reqAttune === "string" ? ` (${item.reqAttune})` : ""}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {item.bonusAc && <StatBox label="AC Bonus" value={item.bonusAc} />}
        {item.bonusWeapon && <StatBox label="Weapon Bonus" value={item.bonusWeapon} />}
        {item.bonusSpellAttack && <StatBox label="Spell Attack" value={item.bonusSpellAttack} />}
        {item.bonusSpellSaveDc && <StatBox label="Spell Save DC" value={item.bonusSpellSaveDc} />}
      </div>

      {item.entries && (
        <div>
          <SectionLabel>Description</SectionLabel>
          <RichText entries={item.entries as Entry[]} onTagClick={onTagClick} />
        </div>
      )}

      <SourceLine source={item.source} />
    </div>
  );
}

// ─── Monster stat block ─────────────────────────────────

function MonsterContent({ name, onTagClick }: { name: string; onTagClick: (t: ParsedTag, e: React.MouseEvent) => void }) {
  const m = getMonster(name);
  if (!m) return <NotFound type="Monster" name={name} />;

  const abilities = ["str", "dex", "con", "int", "wis", "cha"] as const;

  return (
    <div className="space-y-3">
      {/* Type line */}
      <div className="text-xs text-gray-400 italic">
        {formatMonsterSize(m.size)} {formatMonsterType(m.type)}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1.5">
        <StatBox label="AC" value={formatMonsterAc(m.ac)} />
        <StatBox label="HP" value={formatMonsterHp(m.hp)} />
        <StatBox label="Speed" value={formatMonsterSpeed(m.speed)} />
      </div>

      {/* Ability scores */}
      <div className="grid grid-cols-6 gap-1 text-center">
        {abilities.map((ab) => (
          <div key={ab} className="bg-gray-800/40 rounded px-1 py-1 border border-gray-700/30">
            <div className="text-xs text-gray-500 uppercase">{ab}</div>
            <div className="text-sm text-gray-200 font-medium">{m[ab]}</div>
            <div className="text-xs text-gray-400">{formatAbilityMod(m[ab])}</div>
          </div>
        ))}
      </div>

      {/* Saving throws, skills, etc. */}
      <div className="space-y-1 text-xs">
        {m.save && <DetailLine label="Saves" value={formatSaves(m.save)} />}
        {m.skill && <DetailLine label="Skills" value={formatSkills(m.skill)} />}
        {m.resist && <DetailLine label="Resistances" value={flattenResistances(m.resist)} />}
        {m.immune && <DetailLine label="Immunities" value={flattenResistances(m.immune)} />}
        {m.conditionImmune && <DetailLine label="Cond. Immunity" value={flattenConditionImmunities(m.conditionImmune)} />}
        {m.senses && <DetailLine label="Senses" value={m.senses.join(", ")} />}
        {m.languages && <DetailLine label="Languages" value={Array.isArray(m.languages) ? m.languages.join(", ") : m.languages} />}
        <DetailLine label="CR" value={`${formatMonsterCr(m.cr)} (${crToXp(m.cr)} XP)`} />
      </div>

      {/* Traits */}
      {m.trait && <MonsterActionBlock title="Traits" actions={m.trait} onTagClick={onTagClick} />}
      {m.action && <MonsterActionBlock title="Actions" actions={m.action} onTagClick={onTagClick} />}
      {m.bonus && <MonsterActionBlock title="Bonus Actions" actions={m.bonus} onTagClick={onTagClick} />}
      {m.reaction && <MonsterActionBlock title="Reactions" actions={m.reaction} onTagClick={onTagClick} />}
      {m.legendary && <MonsterActionBlock title="Legendary Actions" actions={m.legendary} onTagClick={onTagClick} />}

      {/* Spellcasting */}
      {m.spellcasting && m.spellcasting.map((sc, i) => (
        <div key={i}>
          <SectionLabel>{sc.name}</SectionLabel>
          {sc.headerEntries && <RichText entries={sc.headerEntries as Entry[]} onTagClick={onTagClick} />}
        </div>
      ))}

      <SourceLine source={m.source} page={m.page} />
    </div>
  );
}

// ─── Feat detail ────────────────────────────────────────

function FeatContent({ name, onTagClick }: { name: string; onTagClick: (t: ParsedTag, e: React.MouseEvent) => void }) {
  const feat = getFeat(name);
  if (!feat) return <NotFound type="Feat" name={name} />;

  const prereq = feat.prerequisite ? formatPrerequisite(feat.prerequisite) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge color="amber">{formatFeatCategory(feat.category)}</Badge>
        {feat.repeatable && <Badge color="gray">Repeatable</Badge>}
      </div>

      {prereq && (
        <div className="text-xs text-gray-400">
          <span className="text-gray-500">Prerequisite: </span>{prereq}
        </div>
      )}

      {feat.entries && (
        <div>
          <RichText entries={feat.entries as Entry[]} onTagClick={onTagClick} />
        </div>
      )}

      <SourceLine source={feat.source} />
    </div>
  );
}

// ─── Optional Feature detail ────────────────────────────

function OptFeatureContent({ name, onTagClick }: { name: string; onTagClick: (t: ParsedTag, e: React.MouseEvent) => void }) {
  const of = getOptionalFeature(name);
  if (!of) return <NotFound type="Optional Feature" name={name} />;

  return (
    <div className="space-y-3">
      <Badge color="cyan">Optional Feature</Badge>

      {of.entries && (
        <div>
          <RichText entries={of.entries as Entry[]} onTagClick={onTagClick} />
        </div>
      )}

      <SourceLine source={of.source} />
    </div>
  );
}

// ─── Action detail ──────────────────────────────────────

function ActionContent({ name, onTagClick }: { name: string; onTagClick: (t: ParsedTag, e: React.MouseEvent) => void }) {
  const action = getAction(name);
  if (!action) return <NotFound type="Action" name={name} />;

  return (
    <div className="space-y-3">
      <Badge color="sky">Action</Badge>

      {action.entries && (
        <div>
          <RichText entries={action.entries as Entry[]} onTagClick={onTagClick} />
        </div>
      )}

      <SourceLine source={action.source} />
    </div>
  );
}

// ─── Shared components ──────────────────────────────────

function EntriesBlock({
  data,
  onTagClick,
  badgeColor,
  badgeText,
}: {
  data: { name: string; source?: string; entries?: Entry[]; page?: number };
  onTagClick: (t: ParsedTag, e: React.MouseEvent) => void;
  badgeColor: string;
  badgeText: string;
}) {
  return (
    <div className="space-y-3">
      <Badge color={badgeColor}>{badgeText}</Badge>
      {data.entries && <RichText entries={data.entries} onTagClick={onTagClick} />}
      <SourceLine source={data.source} page={data.page} />
    </div>
  );
}

function MonsterActionBlock({
  title,
  actions,
  onTagClick,
}: {
  title: string;
  actions: { name?: string; entries?: Entry[] }[];
  onTagClick: (t: ParsedTag, e: React.MouseEvent) => void;
}) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <div className="space-y-2">
        {actions.map((a, i) => (
          <div key={i}>
            {a.name && (
              <span className="text-sm font-semibold text-gray-200 italic">{a.name}. </span>
            )}
            {a.entries && <RichText entries={a.entries as Entry[]} onTagClick={onTagClick} inline />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    amber: "bg-amber-900/20 text-amber-300 border-amber-700/30",
    gray: "bg-gray-800/40 text-gray-300 border-gray-600/30",
    blue: "bg-blue-900/30 text-blue-300 border-blue-700/40",
    yellow: "bg-yellow-900/30 text-yellow-300 border-yellow-700/40",
    red: "bg-red-900/20 text-red-300 border-red-700/30",
    orange: "bg-orange-900/20 text-orange-300 border-orange-700/30",
    emerald: "bg-emerald-900/20 text-emerald-300 border-emerald-700/30",
    violet: "bg-violet-900/20 text-violet-300 border-violet-700/30",
    cyan: "bg-cyan-900/20 text-cyan-300 border-cyan-700/30",
    sky: "bg-sky-900/20 text-sky-300 border-sky-700/30",
    uncommon: "bg-green-900/20 text-green-300 border-green-700/30",
    rare: "bg-blue-900/20 text-blue-300 border-blue-700/30",
    "very rare": "bg-purple-900/20 text-purple-300 border-purple-700/30",
    legendary: "bg-orange-900/20 text-orange-300 border-orange-700/30",
    artifact: "bg-red-900/20 text-red-300 border-red-700/30",
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/40 border border-gray-700/30 rounded px-2.5 py-1.5">
      <div className="text-sm text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm text-gray-300">{value}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1"
      style={{ fontFamily: "var(--font-cinzel)" }}
    >
      {children}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500 font-medium">{label}: </span>
      <span className="text-gray-300">{value}</span>
    </div>
  );
}

function SourceLine({ source, page }: { source?: string; page?: number }) {
  if (!source) return null;
  return (
    <div className="text-xs text-gray-600 pt-1 border-t border-gray-800/50">
      Source: {source}{page ? `, p. ${page}` : ""}
    </div>
  );
}

function NotFound({ type, name }: { type: string; name: string }) {
  return (
    <div className="text-gray-500 text-sm">
      {type} &ldquo;{name}&rdquo; not found in database.
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function rarityColor(rarity: string): string {
  const r = rarity.toLowerCase();
  if (r === "uncommon") return "uncommon";
  if (r === "rare") return "rare";
  if (r === "very rare") return "very rare";
  if (r === "legendary") return "legendary";
  if (r === "artifact") return "artifact";
  return "gray";
}
