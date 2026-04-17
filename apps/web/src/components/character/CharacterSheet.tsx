"use client";

import { useState, useMemo, useCallback } from "react";
import type {
  CharacterData,
  Spell,
  CharacterFeatureRef,
  AdvantageEntry,
  Item,
  AbilityScores,
} from "@unseen-servant/shared/types";
import {
  ABILITY_NAMES,
  formatBonus,
  formatClassString,
  getTotalLevel,
  getModifier,
  formatModifier,
} from "@unseen-servant/shared/utils";
import {
  getHP,
  getAC,
  getSpeed,
  getAdvantages,
  getSpellcasting,
  getAbilities,
  getScoreCaps,
  getPassivePerception,
  getInitiative,
} from "@unseen-servant/shared/character";
import type { StatBreakdownId } from "@unseen-servant/shared/detail";
import { HPBar } from "./HPBar";
import { ActionsTab } from "./tabs/ActionsTab";
import { SpellsTab } from "./tabs/SpellsTab";
import { InventoryTab } from "./tabs/InventoryTab";
import { FeaturesTab } from "./tabs/FeaturesTab";
import { StatsTab } from "./tabs/StatsTab";
import { TabBar } from "@/components/ui/TabBar";
import { EntityPopoverProvider, useEntityPopover } from "./EntityPopoverContext";
import { EntityDetailPopover } from "./EntityDetailPopover";
import type { StartPlacementParams } from "@/hooks/useAoEPlacement";

// ─── Helpers ───

function findAdvantages(advantages: AdvantageEntry[], ...subTypes: string[]): AdvantageEntry[] {
  return advantages.filter((a) => subTypes.includes(a.subType));
}

// ─── Types ───

type TabId = "stats" | "actions" | "spells" | "inventory" | "features";

interface CharacterSheetProps {
  character: CharacterData;
  /** If provided, shows "Place on map" CTA for AoE spells */
  onCastAoE?: (params: StartPlacementParams) => void;
}

// ─── Tab Bar Helper ───

function SheetTabBar({
  activeTab,
  onTabChange,
  showSpells,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  showSpells: boolean;
}) {
  const tabs: { value: TabId; label: string }[] = [
    { value: "stats", label: "Stats" },
    { value: "actions", label: "Actions" },
    ...(showSpells ? [{ value: "spells" as TabId, label: "Spells" }] : []),
    { value: "inventory", label: "Items" },
    { value: "features", label: "Feats" },
  ];

  return (
    <TabBar
      tabs={tabs}
      active={activeTab}
      onChange={onTabChange}
      stretch
      size="sm"
      className="shrink-0 border-t border-gray-700/40 bg-gray-800/60"
    />
  );
}

// ─── Stat Box ───

function StatBox({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded border border-gray-700/50 bg-gray-900/60 py-1 transition-colors hover:border-amber-500/50 hover:bg-gray-900/70"
    >
      <div className="text-xs text-gray-500 uppercase">{label}</div>
      <div className="text-base font-bold text-gray-200">{value}</div>
    </button>
  );
}

// ─── Main Component ───

export function CharacterSheet({ character, onCastAoE }: CharacterSheetProps) {
  return (
    <EntityPopoverProvider>
      <CharacterSheetInner character={character} onCastAoE={onCastAoE} />
    </EntityPopoverProvider>
  );
}

function CharacterSheetInner({ character, onCastAoE }: CharacterSheetProps) {
  const s = character.static;
  const d = character.dynamic;
  const abilities = useMemo(() => getAbilities(character), [character]);
  const scoreCaps = useMemo(() => getScoreCaps(character), [character]);
  const [activeTab, setActiveTab] = useState<TabId>("actions");
  const { stack, push } = useEntityPopover();

  // Find first class with spellcasting ability for primary spellcasting stats
  const primarySpellcasting = (() => {
    for (const cls of s.classes) {
      const sc = getSpellcasting(character, cls.name);
      if (sc) return sc;
    }
    return undefined;
  })();
  const isCaster = primarySpellcasting != null || s.spells.length > 0;
  const advantages = getAdvantages(character);
  const profBonus = Math.floor((getTotalLevel(s.classes) - 1) / 4) + 2;

  const handleAbilityClick = useCallback(
    (key: keyof AbilityScores, e: React.MouseEvent) => {
      push("ability-score", key, { x: e.clientX, y: e.clientY }, { character, ability: key });
    },
    [push, character],
  );

  const handleStatClick = useCallback(
    (stat: StatBreakdownId, e: React.MouseEvent) => {
      push("stat-breakdown", stat, { x: e.clientX, y: e.clientY }, { character, stat });
    },
    [push, character],
  );

  const handleSpellClick = useCallback(
    (spell: Spell, e: React.MouseEvent) => {
      push(
        "spell",
        spell.name,
        { x: e.clientX, y: e.clientY },
        undefined,
        onCastAoE ? { onCastAoE } : undefined,
      );
    },
    [push, onCastAoE],
  );

  const handleItemClick = useCallback(
    (item: Item, e: React.MouseEvent) => {
      push(
        "inventory-item",
        item.name,
        { x: e.clientX, y: e.clientY },
        { character, inventoryId: item.name },
      );
    },
    [push, character],
  );

  const handleFeatureClick = useCallback(
    (feature: CharacterFeatureRef, e: React.MouseEvent) => {
      const featureId = feature.featureName ?? feature.dbName;
      push("class-feature", featureId, { x: e.clientX, y: e.clientY }, { character, featureId });
    },
    [push, character],
  );

  return (
    <div className="flex h-full flex-col text-sm">
      {/* ═══ UPPER SECTION (compact, never overflows) ═══ */}
      <div className="shrink-0 space-y-3 p-3">
        {/* Character Identity */}
        <div>
          <h2
            className="text-lg font-bold text-amber-200/90"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            {s.name}
          </h2>
          <div className="text-xs text-gray-400">
            {s.species || s.race} &middot; {formatClassString(s.classes)} &middot; Lvl{" "}
            {getTotalLevel(s.classes)}
          </div>
        </div>

        {/* HP Bar — full width */}
        <HPBar current={d.currentHP} max={getHP(character)} temp={d.tempHP} />

        {/* Stat Boxes — 3-column grid, 2 rows */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <StatBox
            label="AC"
            value={String(getAC(character))}
            onClick={(e) => handleStatClick("ac", e)}
          />
          <StatBox
            label="Speed"
            value={`${getSpeed(character).walk} ft`}
            onClick={(e) => handleStatClick("speed", e)}
          />
          <StatBox
            label="Prof"
            value={formatBonus(profBonus)}
            onClick={(e) => handleStatClick("prof", e)}
          />
          {isCaster ? (
            <>
              <StatBox
                label="Spell DC"
                value={String(primarySpellcasting?.dc ?? "—")}
                onClick={(e) => handleStatClick("spell-dc", e)}
              />
              <StatBox
                label="Spell Atk"
                value={formatBonus(primarySpellcasting?.attackBonus ?? 0)}
                onClick={(e) => handleStatClick("spell-attack", e)}
              />
              <StatBox
                label="Init"
                value={formatBonus(getInitiative(character))}
                onClick={(e) => handleStatClick("init", e)}
              />
            </>
          ) : (
            <>
              <StatBox
                label="Init"
                value={formatBonus(getInitiative(character))}
                onClick={(e) => handleStatClick("init", e)}
              />
              <StatBox
                label="Hit Dice"
                value={String(getTotalLevel(s.classes))}
                onClick={(e) => handleStatClick("hit-dice", e)}
              />
              <StatBox
                label="Passive"
                value={String(getPassivePerception(character))}
                onClick={(e) => handleStatClick("passive", e)}
              />
            </>
          )}
        </div>

        {/* Heroic Inspiration */}
        <div
          className={`flex items-center gap-1.5 rounded px-2 py-0.5 ${
            d.heroicInspiration
              ? "border border-yellow-700/40 bg-yellow-900/20"
              : "border border-gray-700/30 bg-gray-900/30"
          }`}
        >
          <span
            className={`text-sm ${d.heroicInspiration ? "text-yellow-400 drop-shadow-glow-yellow" : "text-gray-600"}`}
          >
            {d.heroicInspiration ? "\u2605" : "\u2606"}
          </span>
          <span
            className={`text-xs font-medium ${d.heroicInspiration ? "text-yellow-300" : "text-gray-600"}`}
          >
            Heroic Inspiration
          </span>
        </div>

        {/* Concentration */}
        {d.concentratingOn && (
          <div>
            <div
              className="mb-1 text-sm font-medium tracking-wider text-gray-500 uppercase"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Concentrating On
            </div>
            <span className="rounded-full border border-purple-800/50 bg-purple-900/30 px-2 py-0.5 text-xs text-purple-300">
              {d.concentratingOn.spellName}
            </span>
          </div>
        )}

        {/* Conditions */}
        {d.conditions.length > 0 && (
          <div>
            <div
              className="mb-1 text-sm font-medium tracking-wider text-gray-500 uppercase"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Conditions
            </div>
            <div className="flex flex-wrap gap-1">
              {d.conditions.map((c, i) => (
                <span
                  key={i}
                  className="rounded-full border border-red-800/50 bg-red-900/30 px-2 py-0.5 text-xs text-red-400"
                  title={
                    typeof c === "string"
                      ? c
                      : c.duration
                        ? `${c.name} (${c.duration} rounds)`
                        : c.name
                  }
                >
                  {typeof c === "string" ? c : c.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Death Saves */}
        {(d.deathSaves.successes > 0 || d.deathSaves.failures > 0) && (
          <div className="flex gap-4">
            <div>
              <span className="text-xs text-gray-500">Saves: </span>
              {Array.from({ length: 3 }, (_, i) => (
                <span
                  key={i}
                  className={`mx-0.5 inline-block h-2 w-2 rounded-full ${
                    i < d.deathSaves.successes ? "bg-green-500" : "bg-gray-700"
                  }`}
                />
              ))}
            </div>
            <div>
              <span className="text-xs text-gray-500">Fails: </span>
              {Array.from({ length: 3 }, (_, i) => (
                <span
                  key={i}
                  className={`mx-0.5 inline-block h-2 w-2 rounded-full ${
                    i < d.deathSaves.failures ? "bg-red-500" : "bg-gray-700"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Ability Scores — compact 6-column row */}
        <div className="grid grid-cols-6 gap-1">
          {(Object.entries(ABILITY_NAMES) as [keyof AbilityScores, string][]).map(
            ([key, label]) => {
              const score = abilities[key];
              const mod = getModifier(score);
              const modStr = formatModifier(score);
              const abilityAdvs = findAdvantages(advantages, `${key}-ability-checks`);
              const hasAdv = abilityAdvs.some((a) => a.type === "advantage");
              const hasDisadv = abilityAdvs.some((a) => a.type === "disadvantage");
              const advTooltip = abilityAdvs
                .map((a) => {
                  const prefix = a.type === "advantage" ? "ADV" : "DIS";
                  return a.restriction ? `${prefix}: ${a.restriction}` : prefix;
                })
                .join("\n");
              return (
                <div
                  key={key}
                  className="relative cursor-pointer rounded border border-gray-700/50 bg-gray-900/60 p-1 py-1.5 text-center transition-colors hover:border-amber-500/50 hover:bg-gray-900/70"
                  onClick={(e) => handleAbilityClick(key, e)}
                >
                  <div className="text-xs font-medium tracking-wider text-gray-500 uppercase">
                    {label}
                  </div>
                  <div
                    className={`text-sm font-bold ${
                      mod > 0 ? "text-green-400" : mod < 0 ? "text-red-400" : "text-gray-300"
                    }`}
                  >
                    {modStr}
                  </div>
                  <div className="text-xs text-gray-500">
                    {score}
                    {scoreCaps[key] !== 20 && (
                      <span className="text-amber-400/60"> / {scoreCaps[key]}</span>
                    )}
                  </div>
                  {(hasAdv || hasDisadv) && (
                    <span className="absolute top-0.5 right-0.5" title={advTooltip}>
                      {hasAdv && <span className="text-xs font-bold text-green-400">▲</span>}
                      {hasDisadv && <span className="text-xs font-bold text-red-400">▼</span>}
                    </span>
                  )}
                </div>
              );
            },
          )}
        </div>
      </div>

      {/* ═══ TAB BAR ═══ */}
      <SheetTabBar activeTab={activeTab} onTabChange={setActiveTab} showSpells={isCaster} />

      {/* ═══ TAB CONTENT (scrollable, fills remaining space) ═══ */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "stats" && <StatsTab character={character} />}
        {activeTab === "actions" && (
          <ActionsTab
            character={character}
            onItemClick={handleItemClick}
            onFeatureClick={handleFeatureClick}
          />
        )}
        {activeTab === "spells" && (
          <SpellsTab character={character} onSpellClick={handleSpellClick} />
        )}
        {activeTab === "inventory" && (
          <InventoryTab character={character} onItemClick={handleItemClick} />
        )}
        {activeTab === "features" && (
          <FeaturesTab character={character} onFeatureClick={handleFeatureClick} />
        )}
      </div>

      {/* Entity popover stack — all detail clicks (ability, spell, item, feature, rich-text links) */}
      {stack.map((entry) => (
        <EntityDetailPopover key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
