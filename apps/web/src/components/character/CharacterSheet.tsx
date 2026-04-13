"use client";

import { useState } from "react";
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
  getSenses,
  getAdvantages,
  getSpellcasting,
} from "@unseen-servant/shared/character";
import { HPBar } from "./HPBar";
import { AbilityDetailPopup } from "./AbilityDetailPopup";
import { SpellDetailPopup } from "./SpellDetailPopup";
import { ItemDetailPopup } from "./ItemDetailPopup";
import { FeatureDetailPopup } from "./FeatureDetailPopup";
import { ActionsTab } from "./tabs/ActionsTab";
import { SpellsTab } from "./tabs/SpellsTab";
import { InventoryTab } from "./tabs/InventoryTab";
import { FeaturesTab } from "./tabs/FeaturesTab";
import { StatsTab } from "./tabs/StatsTab";
import { TabBar } from "@/components/ui/TabBar";
import { EntityPopoverProvider, useEntityPopover } from "./EntityPopoverContext";
import { EntityDetailPopover } from "./EntityDetailPopover";

// ─── Helpers ───

function findAdvantages(advantages: AdvantageEntry[], ...subTypes: string[]): AdvantageEntry[] {
  return advantages.filter((a) => subTypes.includes(a.subType));
}

// ─── Types ───

type ClickPosition = { x: number; y: number };

type PopupState =
  | { type: "ability"; id: keyof AbilityScores; position: ClickPosition }
  | { type: "spell"; spell: Spell; position: ClickPosition }
  | { type: "item"; item: Item; position: ClickPosition }
  | { type: "feature"; feature: CharacterFeatureRef; position: ClickPosition }
  | null;

type TabId = "stats" | "actions" | "spells" | "inventory" | "features";

interface CharacterSheetProps {
  character: CharacterData;
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
      className="border-t border-gray-700/40 bg-gray-800/60 shrink-0"
    />
  );
}

// ─── Main Component ───

export function CharacterSheet({ character }: CharacterSheetProps) {
  return (
    <EntityPopoverProvider>
      <CharacterSheetInner character={character} />
    </EntityPopoverProvider>
  );
}

function CharacterSheetInner({ character }: CharacterSheetProps) {
  const s = character.static;
  const d = character.dynamic;
  const [activeTab, setActiveTab] = useState<TabId>("actions");
  const [popup, setPopup] = useState<PopupState>(null);
  const { stack } = useEntityPopover();

  // Find first class with spellcasting ability for primary spellcasting stats
  const primarySpellcasting = (() => {
    for (const cls of s.classes) {
      const sc = getSpellcasting(character, cls.name);
      if (sc) return sc;
    }
    return undefined;
  })();
  const isCaster = primarySpellcasting != null || s.spells.length > 0;
  const senses = getSenses(character);
  const advantages = getAdvantages(character);
  const profBonus = Math.floor((getTotalLevel(s.classes) - 1) / 4) + 2;

  return (
    <div className="flex flex-col h-full text-sm">
      {/* ═══ UPPER SECTION (compact, never overflows) ═══ */}
      <div className="shrink-0 p-3 space-y-3">
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
          <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
            <div className="text-xs text-gray-500 uppercase">AC</div>
            <div className="text-base font-bold text-gray-200">{getAC(character)}</div>
          </div>
          <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
            <div className="text-xs text-gray-500 uppercase">Speed</div>
            <div className="text-base font-bold text-gray-200">{getSpeed(character).walk} ft</div>
          </div>
          <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
            <div className="text-xs text-gray-500 uppercase">Prof</div>
            <div className="text-base font-bold text-gray-200">+{profBonus}</div>
          </div>
          {isCaster ? (
            <>
              <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
                <div className="text-xs text-gray-500 uppercase">Spell DC</div>
                <div className="text-base font-bold text-gray-200">{primarySpellcasting?.dc}</div>
              </div>
              <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
                <div className="text-xs text-gray-500 uppercase">Spell Atk</div>
                <div className="text-base font-bold text-gray-200">
                  {formatBonus(primarySpellcasting?.attackBonus ?? 0)}
                </div>
              </div>
              <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
                <div className="text-xs text-gray-500 uppercase">Init</div>
                <div className="text-base font-bold text-gray-200">
                  {formatBonus(getModifier(s.abilities.dexterity))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
                <div className="text-xs text-gray-500 uppercase">Init</div>
                <div className="text-base font-bold text-gray-200">
                  {formatBonus(getModifier(s.abilities.dexterity))}
                </div>
              </div>
              <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
                <div className="text-xs text-gray-500 uppercase">Hit Dice</div>
                <div className="text-base font-bold text-gray-200">{getTotalLevel(s.classes)}</div>
              </div>
              <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
                <div className="text-xs text-gray-500 uppercase">Passive</div>
                <div className="text-base font-bold text-gray-200">
                  {parseInt(
                    senses
                      .find((sense) => sense.startsWith("Passive Perception"))
                      ?.split(" ")
                      .at(-1) ?? String(10 + getModifier(s.abilities.wisdom)),
                    10,
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Heroic Inspiration */}
        <div
          className={`flex items-center gap-1.5 rounded px-2 py-0.5 ${
            d.heroicInspiration
              ? "bg-yellow-900/20 border border-yellow-700/40"
              : "bg-gray-900/30 border border-gray-700/30"
          }`}
        >
          <span
            className={`text-sm ${d.heroicInspiration ? "text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.4)]" : "text-gray-600"}`}
          >
            {d.heroicInspiration ? "\u2605" : "\u2606"}
          </span>
          <span
            className={`text-xs font-medium ${d.heroicInspiration ? "text-yellow-300" : "text-gray-600"}`}
          >
            Heroic Inspiration
          </span>
        </div>

        {/* Conditions */}
        {d.conditions.length > 0 && (
          <div>
            <div
              className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Conditions
            </div>
            <div className="flex flex-wrap gap-1">
              {d.conditions.map((c, i) => (
                <span
                  key={i}
                  className="bg-red-900/30 text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-800/50"
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
                  className={`inline-block w-2 h-2 rounded-full mx-0.5 ${
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
                  className={`inline-block w-2 h-2 rounded-full mx-0.5 ${
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
              const score = s.abilities[key];
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
                  className="bg-gray-900/60 border border-gray-700/50 rounded p-1 py-1.5 text-center relative cursor-pointer hover:border-amber-500/50 hover:bg-gray-900/70 transition-colors"
                  onClick={(e) =>
                    setPopup({ type: "ability", id: key, position: { x: e.clientX, y: e.clientY } })
                  }
                >
                  <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                    {label}
                  </div>
                  <div
                    className={`text-sm font-bold ${
                      mod > 0 ? "text-green-400" : mod < 0 ? "text-red-400" : "text-gray-300"
                    }`}
                  >
                    {modStr}
                  </div>
                  <div className="text-xs text-gray-500">{score}</div>
                  {(hasAdv || hasDisadv) && (
                    <span className="absolute top-0.5 right-0.5" title={advTooltip}>
                      {hasAdv && <span className="text-xs text-green-400 font-bold">▲</span>}
                      {hasDisadv && <span className="text-xs text-red-400 font-bold">▼</span>}
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
            onItemClick={(item, e) =>
              setPopup({ type: "item", item, position: { x: e.clientX, y: e.clientY } })
            }
            onFeatureClick={(feature, e) =>
              setPopup({ type: "feature", feature, position: { x: e.clientX, y: e.clientY } })
            }
          />
        )}
        {activeTab === "spells" && (
          <SpellsTab
            character={character}
            onSpellClick={(spell, e) =>
              setPopup({ type: "spell", spell, position: { x: e.clientX, y: e.clientY } })
            }
          />
        )}
        {activeTab === "inventory" && (
          <InventoryTab
            character={character}
            onItemClick={(item, e) =>
              setPopup({ type: "item", item, position: { x: e.clientX, y: e.clientY } })
            }
          />
        )}
        {activeTab === "features" && (
          <FeaturesTab
            character={character}
            onFeatureClick={(feature, e) =>
              setPopup({ type: "feature", feature, position: { x: e.clientX, y: e.clientY } })
            }
          />
        )}
      </div>

      {/* Popup popovers */}
      {popup?.type === "ability" && (
        <AbilityDetailPopup
          abilityKey={popup.id}
          character={character}
          onClose={() => setPopup(null)}
          position={popup.position}
        />
      )}
      {popup?.type === "spell" && (
        <SpellDetailPopup
          spell={popup.spell}
          onClose={() => setPopup(null)}
          position={popup.position}
        />
      )}
      {popup?.type === "item" && (
        <ItemDetailPopup
          item={popup.item}
          onClose={() => setPopup(null)}
          position={popup.position}
        />
      )}
      {popup?.type === "feature" && (
        <FeatureDetailPopup
          feature={popup.feature}
          onClose={() => setPopup(null)}
          position={popup.position}
        />
      )}

      {/* Entity popover stack (nested popovers from RichText entity clicks) */}
      {stack.map((entry) => (
        <EntityDetailPopover
          key={entry.id}
          id={entry.id}
          category={entry.category}
          name={entry.name}
          position={entry.position}
          level={entry.level}
        />
      ))}
    </div>
  );
}
