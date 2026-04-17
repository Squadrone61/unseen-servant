"use client";

import type React from "react";
import type { CharacterData, StatBreakdown, StatContribution } from "@unseen-servant/shared/types";
import type { StatBreakdownId } from "@unseen-servant/shared/detail";
import {
  getACBreakdown,
  getSpeedBreakdown,
  getProficiencyBonusBreakdown,
  getInitiativeBreakdown,
  getSpellcastingBreakdown,
  getHitDiceBreakdown,
  getPassivePerceptionBreakdown,
} from "@unseen-servant/shared/character";
import { formatBonus } from "@unseen-servant/shared/utils";
import { useEntityClick } from "./EntityPopoverContext";

// ─── Formatting ───

function formatValue(c: StatContribution): string {
  if (c.operation === "set") return `= ${c.value}`;
  if (c.operation === "base") return String(c.value);
  return formatBonus(c.value);
}

function valueTone(c: StatContribution): string {
  if (c.operation === "set") return "text-amber-300 font-semibold";
  if (c.operation === "base") return "text-gray-200";
  if (c.value > 0) return "text-emerald-300";
  if (c.value < 0) return "text-red-300";
  return "text-gray-300";
}

// ─── Title / total formatting per stat ───

function titleFor(stat: StatBreakdownId): string {
  switch (stat) {
    case "ac":
      return "Armor Class";
    case "speed":
      return "Speed";
    case "prof":
      return "Proficiency Bonus";
    case "init":
      return "Initiative";
    case "spell-dc":
      return "Spell Save DC";
    case "spell-attack":
      return "Spell Attack";
    case "hit-dice":
      return "Hit Dice";
    case "passive":
      return "Passive Perception";
  }
}

function formatTotal(stat: StatBreakdownId, total: number): string {
  switch (stat) {
    case "init":
    case "spell-attack":
      return formatBonus(total);
    case "prof":
      return formatBonus(total);
    case "speed":
      return `${total} ft`;
    default:
      return String(total);
  }
}

// ─── Rows ───

interface RowProps {
  contribution: StatContribution;
  /** True when an effect `set` overrides the base formula. Dims non-effect rows. */
  overridden?: boolean;
  onSourceClick?: (c: StatContribution, e: React.MouseEvent) => void;
}

function ContributionRow({ contribution, overridden, onSourceClick }: RowProps) {
  const clickable = Boolean(contribution.sourceCategory && contribution.sourceName);
  const dim = overridden;
  return (
    <div className={`flex items-baseline gap-2 px-2 py-1 ${dim ? "opacity-40" : ""}`}>
      {clickable ? (
        <button
          type="button"
          onClick={(e) => onSourceClick?.(contribution, e)}
          className={`text-left text-sm hover:underline ${
            dim ? "text-gray-400 line-through" : "text-amber-300 hover:text-amber-200"
          }`}
        >
          {contribution.label}
        </button>
      ) : (
        <span className={`text-sm ${dim ? "text-gray-400 line-through" : "text-gray-300"}`}>
          {contribution.label}
        </span>
      )}
      <span
        className={`ml-auto shrink-0 font-mono text-sm tabular-nums ${
          dim ? "text-gray-500 line-through" : valueTone(contribution)
        }`}
      >
        {formatValue(contribution)}
      </span>
    </div>
  );
}

function BreakdownSection({
  heading,
  headingValue,
  breakdown,
  onSourceClick,
}: {
  /** Omit to render the section header-less — used for the primary section whose total lives in the top HeaderBlock. */
  heading?: string;
  /** Shown on the right side of the heading row. */
  headingValue?: string;
  breakdown: StatBreakdown;
  onSourceClick?: (c: StatContribution, e: React.MouseEvent) => void;
}) {
  // If any effect-sourced `set` is active, the base formula is replaced.
  // Dim the base-formula rows so the math reads as "Dragon Hide = 15" rather
  // than "Unarmored 10 + DEX +2 + Dragon Hide = 15" (which doesn't add up).
  const hasEffectSet = breakdown.contributions.some((c) => c.fromEffect && c.operation === "set");
  return (
    <div>
      {heading && (
        <div
          className="mb-1 flex items-baseline gap-2 px-1 text-sm font-medium tracking-wider text-gray-500 uppercase"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          <span>{heading}</span>
          {headingValue != null && (
            <span className="ml-auto font-mono text-base font-bold text-amber-200/90 tabular-nums">
              {headingValue}
            </span>
          )}
        </div>
      )}
      <div className="space-y-0.5 rounded border border-gray-700/40 bg-gray-900/40 p-1">
        {breakdown.contributions.map((c, i) => (
          <ContributionRow
            key={i}
            contribution={c}
            overridden={hasEffectSet && !c.fromEffect}
            onSourceClick={onSourceClick}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main ───

interface StatBreakdownDetailProps {
  character: CharacterData;
  stat: StatBreakdownId;
}

export function StatBreakdownDetail({ character, stat }: StatBreakdownDetailProps) {
  const onEntityClick = useEntityClick();

  const handleSourceClick = (c: StatContribution, e: React.MouseEvent) => {
    if (!c.sourceCategory || !c.sourceName || !onEntityClick) return;
    onEntityClick(c.sourceCategory, c.sourceName, { x: e.clientX, y: e.clientY });
  };

  const title = titleFor(stat);

  // Spellcasting path: one breakdown section per class
  if (stat === "spell-dc" || stat === "spell-attack") {
    const entries = getSpellcastingBreakdown(character);
    if (entries.length === 0) {
      return (
        <div className="space-y-3">
          <HeaderBlock title={title} total="—" />
          <div className="text-sm text-gray-400 italic">
            This character has no spellcasting classes.
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <HeaderBlock
          title={title}
          total={
            stat === "spell-dc" ? String(entries[0].dc.total) : formatBonus(entries[0].attack.total)
          }
          subtitle={
            entries.length > 1 ? "Multiclass caster — per-class breakdown below" : undefined
          }
        />
        {entries.map((e) => {
          const bd = stat === "spell-dc" ? e.dc : e.attack;
          const value = stat === "spell-dc" ? String(bd.total) : formatBonus(bd.total);
          return (
            <BreakdownSection
              key={e.className}
              heading={entries.length > 1 ? e.className : undefined}
              headingValue={entries.length > 1 ? value : undefined}
              breakdown={bd}
              onSourceClick={handleSourceClick}
            />
          );
        })}
      </div>
    );
  }

  // Single-breakdown path
  let breakdown: StatBreakdown;
  switch (stat) {
    case "ac":
      breakdown = getACBreakdown(character);
      break;
    case "speed":
      breakdown = getSpeedBreakdown(character);
      break;
    case "prof":
      breakdown = getProficiencyBonusBreakdown(character);
      break;
    case "init":
      breakdown = getInitiativeBreakdown(character);
      break;
    case "hit-dice":
      breakdown = getHitDiceBreakdown(character);
      break;
    case "passive":
      breakdown = getPassivePerceptionBreakdown(character);
      break;
  }

  return (
    <div className="space-y-3">
      <HeaderBlock title={title} total={formatTotal(stat, breakdown.total)} />
      <BreakdownSection breakdown={breakdown} onSourceClick={handleSourceClick} />
      {breakdown.subBreakdowns?.map((sub) => (
        <BreakdownSection
          key={sub.label}
          heading={sub.label}
          headingValue={`${sub.total} ft`}
          breakdown={{ total: sub.total, contributions: sub.contributions }}
          onSourceClick={handleSourceClick}
        />
      ))}
    </div>
  );
}

// ─── Header ───

function HeaderBlock({
  title,
  total,
  subtitle,
}: {
  title: string;
  total: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-gray-700/40 pb-2">
      <div>
        <div
          className="text-sm font-medium tracking-wider text-gray-400 uppercase"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          {title}
        </div>
        {subtitle && <div className="mt-0.5 text-xs text-gray-500 italic">{subtitle}</div>}
      </div>
      <div className="font-mono text-2xl font-bold text-amber-200 tabular-nums">{total}</div>
    </div>
  );
}
