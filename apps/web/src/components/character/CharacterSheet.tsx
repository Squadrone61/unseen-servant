"use client";

import { useState } from "react";
import type {
  CharacterData,
  CharacterSpell,
  CharacterFeature,
  AdvantageEntry,
  InventoryItem,
  AbilityScores,
} from "@aidnd/shared/types";
import {
  ABILITY_NAMES,
  SKILL_DISPLAY_NAMES,
  ABILITY_FULL_NAMES,
  formatBonus,
  formatClassString,
  getTotalLevel,
  getSkillModifier,
  getSavingThrowModifier,
  getModifier,
  formatModifier,
} from "@aidnd/shared/utils";
import { HPBar } from "./HPBar";
import { AbilityDetailPopup } from "./AbilityDetailPopup";
import { SpellDetailPopup } from "./SpellDetailPopup";
import { ItemDetailPopup } from "./ItemDetailPopup";
import { FeatureDetailPopup } from "./FeatureDetailPopup";
import { ActionsTab } from "./tabs/ActionsTab";
import { SpellsTab } from "./tabs/SpellsTab";
import { InventoryTab } from "./tabs/InventoryTab";
import { FeaturesTab } from "./tabs/FeaturesTab";

// ─── Constants ───

/** SubTypes that are already displayed as markers on specific abilities/saves/skills */
const ABILITY_SPECIFIC_SUBTYPES = new Set([
  "strength-saving-throws", "dexterity-saving-throws", "constitution-saving-throws",
  "intelligence-saving-throws", "wisdom-saving-throws", "charisma-saving-throws",
  "strength-ability-checks", "dexterity-ability-checks", "constitution-ability-checks",
  "intelligence-ability-checks", "wisdom-ability-checks", "charisma-ability-checks",
  "acrobatics", "animal-handling", "arcana", "athletics", "deception", "history",
  "insight", "intimidation", "investigation", "medicine", "nature", "perception",
  "performance", "persuasion", "religion", "sleight-of-hand", "stealth", "survival",
]);

// ─── Helpers ───

function findAdvantages(
  advantages: AdvantageEntry[],
  ...subTypes: string[]
): AdvantageEntry[] {
  return advantages.filter((a) => subTypes.includes(a.subType));
}

function AdvMarker({
  entries,
  className = "",
}: {
  entries: AdvantageEntry[];
  className?: string;
}) {
  if (entries.length === 0) return null;

  const hasAdv = entries.some((e) => e.type === "advantage");
  const hasDisadv = entries.some((e) => e.type === "disadvantage");

  const tooltipLines = entries.map((e) => {
    const prefix = e.type === "advantage" ? "ADV" : "DIS";
    return e.restriction ? `${prefix}: ${e.restriction}` : prefix;
  });
  const tooltip = tooltipLines.join("\n");

  return (
    <span className={`shrink-0 ${className}`} title={tooltip}>
      {hasAdv && (
        <span className="text-xs text-green-400 font-bold">▲</span>
      )}
      {hasDisadv && (
        <span className="text-xs text-red-400 font-bold">▼</span>
      )}
    </span>
  );
}

// ─── Types ───

type ClickPosition = { x: number; y: number };

type PopupState =
  | { type: "ability"; id: keyof AbilityScores; position: ClickPosition }
  | { type: "spell"; spell: CharacterSpell; position: ClickPosition }
  | { type: "item"; item: InventoryItem; position: ClickPosition }
  | { type: "feature"; feature: CharacterFeature; position: ClickPosition }
  | null;

type TabId = "actions" | "spells" | "inventory" | "features";

interface CharacterSheetProps {
  character: CharacterData;
}

// ─── Tab Bar ───

function TabBar({
  activeTab,
  onTabChange,
  showSpells,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  showSpells: boolean;
}) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "actions", label: "Actions" },
    ...(showSpells ? [{ id: "spells" as TabId, label: "Spells" }] : []),
    { id: "inventory", label: "Inventory" },
    { id: "features", label: "Features" },
  ];

  return (
    <div className="flex border-t border-b border-gray-700/40 bg-gray-800/60 shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === tab.id
              ? "text-amber-400 border-b-2 border-amber-500"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ───

export function CharacterSheet({ character }: CharacterSheetProps) {
  const s = character.static;
  const d = character.dynamic;
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [profsOpen, setProfsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("actions");
  const [popup, setPopup] = useState<PopupState>(null);

  const isCaster = s.spellSaveDC != null && s.spellSaveDC > 0;

  return (
    <div className="flex flex-col h-full text-sm">
      {/* ═══ UPPER SECTION (not constrained) ═══ */}
      <div className="shrink-0 p-3 space-y-3">
        {/* Character Identity */}
        <div>
          <h2 className="text-lg font-bold text-amber-200/90" style={{ fontFamily: "var(--font-cinzel)" }}>{s.name}</h2>
          <div className="text-xs text-gray-400">
            {s.species || s.race} &middot; {formatClassString(s.classes)} &middot; Lvl{" "}
            {getTotalLevel(s.classes)}
          </div>
        </div>

        {/* HP Bar — full width */}
        <HPBar current={d.currentHP} max={s.maxHP} temp={d.tempHP} />

        {/* Stat Boxes — 3-column grid, 2 rows */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
            <div className="text-xs text-gray-500 uppercase">AC</div>
            <div className="text-base font-bold text-gray-200">
              {s.armorClass}
            </div>
          </div>
          <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
            <div className="text-xs text-gray-500 uppercase">Speed</div>
            <div className="text-base font-bold text-gray-200">
              {s.speed} ft
            </div>
          </div>
          <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
            <div className="text-xs text-gray-500 uppercase">Prof</div>
            <div className="text-base font-bold text-gray-200">
              +{s.proficiencyBonus}
            </div>
          </div>
          {isCaster ? (
            <>
              <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
                <div className="text-xs text-gray-500 uppercase">
                  Spell DC
                </div>
                <div className="text-base font-bold text-gray-200">
                  {s.spellSaveDC}
                </div>
              </div>
              <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
                <div className="text-xs text-gray-500 uppercase">
                  Spell Atk
                </div>
                <div className="text-base font-bold text-gray-200">
                  {formatBonus(s.spellAttackBonus ?? 0)}
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
                <div className="text-base font-bold text-gray-200">
                  {getTotalLevel(s.classes)}
                </div>
              </div>
              <div className="bg-gray-900/60 border border-gray-700/50 rounded py-1">
                <div className="text-xs text-gray-500 uppercase">Passive</div>
                <div className="text-base font-bold text-gray-200">
                  {parseInt(s.senses.find((sense) => sense.startsWith("Passive Perception"))?.split(" ").at(-1) ?? String(10 + getModifier(s.abilities.wisdom)), 10)}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Heroic Inspiration */}
        <div className={`flex items-center gap-1.5 rounded px-2 py-1 ${
          d.heroicInspiration
            ? "bg-yellow-900/20 border border-yellow-700/40"
            : "bg-gray-900/30 border border-gray-700/30"
        }`}>
          <span className={`text-sm ${d.heroicInspiration ? "text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.4)]" : "text-gray-600"}`}>
            {d.heroicInspiration ? "\u2605" : "\u2606"}
          </span>
          <span className={`text-xs font-medium ${d.heroicInspiration ? "text-yellow-300" : "text-gray-600"}`}>
            Heroic Inspiration
          </span>
        </div>

        {/* Conditions */}
        {d.conditions.length > 0 && (
          <div>
            <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1" style={{ fontFamily: "var(--font-cinzel)" }}>
              Conditions
            </div>
            <div className="flex flex-wrap gap-1">
              {d.conditions.map((c, i) => (
                <span
                  key={i}
                  className="bg-red-900/30 text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-800/50"
                >
                  {c}
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
                    i < d.deathSaves.successes
                      ? "bg-green-500"
                      : "bg-gray-700"
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
          {(
            Object.entries(ABILITY_NAMES) as [keyof AbilityScores, string][]
          ).map(([key, label]) => {
            const score = s.abilities[key];
            const mod = getModifier(score);
            const modStr = formatModifier(score);
            const abilityAdvs = findAdvantages(
              s.advantages,
              `${key}-ability-checks`
            );
            const hasAdv = abilityAdvs.some((a) => a.type === "advantage");
            const hasDisadv = abilityAdvs.some(
              (a) => a.type === "disadvantage"
            );
            const advTooltip = abilityAdvs
              .map((a) => {
                const prefix = a.type === "advantage" ? "ADV" : "DIS";
                return a.restriction
                  ? `${prefix}: ${a.restriction}`
                  : prefix;
              })
              .join("\n");
            return (
              <div
                key={key}
                className="bg-gray-900/60 border border-gray-700/50 rounded p-1 py-1.5 text-center relative cursor-pointer hover:border-amber-500/50 hover:bg-gray-900/70 transition-colors"
                onClick={(e) => setPopup({ type: "ability", id: key, position: { x: e.clientX, y: e.clientY } })}
              >
                <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                  {label}
                </div>
                <div
                  className={`text-sm font-bold ${
                    mod > 0
                      ? "text-green-400"
                      : mod < 0
                      ? "text-red-400"
                      : "text-gray-300"
                  }`}
                >
                  {modStr}
                </div>
                <div className="text-xs text-gray-500">{score}</div>
                {(hasAdv || hasDisadv) && (
                  <span
                    className="absolute top-0.5 right-0.5"
                    title={advTooltip}
                  >
                    {hasAdv && (
                      <span className="text-xs text-green-400 font-bold">
                        ▲
                      </span>
                    )}
                    {hasDisadv && (
                      <span className="text-xs text-red-400 font-bold">
                        ▼
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Saving Throws */}
        <div>
          <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1.5" style={{ fontFamily: "var(--font-cinzel)" }}>
            Saving Throws
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {s.savingThrows.map((save) => {
              const mod = getSavingThrowModifier(
                save,
                s.abilities,
                s.proficiencyBonus
              );
              const saveAdvs = findAdvantages(
                s.advantages,
                `${save.ability}-saving-throws`
              );
              return (
                <div
                  key={save.ability}
                  className="flex items-center gap-1.5 rounded px-2 py-1"
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      save.proficient
                        ? "bg-green-500"
                        : "bg-gray-600 ring-1 ring-gray-500"
                    }`}
                  />
                  <span className="text-xs text-gray-400">
                    {ABILITY_FULL_NAMES[save.ability]}
                  </span>
                  <AdvMarker entries={saveAdvs} />
                  <span
                    className={`ml-auto text-xs font-semibold ${
                      save.proficient
                        ? mod >= 0
                          ? "text-green-400"
                          : "text-red-400"
                        : mod >= 0
                        ? "text-gray-400"
                        : "text-red-400"
                    }`}
                  >
                    {formatBonus(mod)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Advantages / Disadvantages summary — only restricted, non-ability-specific */}
        {(() => {
          const globalAdvs = s.advantages.filter(
            (a) => a.restriction && !ABILITY_SPECIFIC_SUBTYPES.has(a.subType)
          );
          if (globalAdvs.length === 0) return null;
          return (
            <div className="space-y-0.5">
              <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1" style={{ fontFamily: "var(--font-cinzel)" }}>
                Advantages &amp; Disadvantages
              </div>
              {globalAdvs.map((a, i) => {
                const isAdv = a.type === "advantage";
                return (
                  <div
                    key={`${a.type}-${a.subType}-${i}`}
                    className="flex items-start gap-1.5 px-2 py-0.5 text-xs"
                  >
                    <span
                      className={`shrink-0 text-xs font-bold mt-0.5 ${
                        isAdv ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {isAdv ? "▲" : "▼"}
                    </span>
                    <span className="text-gray-300">
                      {a.subType.replace(/-/g, " ")}
                      <span className="text-gray-500 italic ml-1">
                        ({a.restriction})
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Skills (collapsible) */}
        {s.skills.length > 0 && (
          <div>
            <button
              onClick={() => setSkillsOpen(!skillsOpen)}
              className="flex items-center justify-between w-full text-sm text-gray-500 uppercase tracking-wider font-medium"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              <span>
                Skills (
                {s.skills.filter((sk) => sk.proficient || sk.expertise).length}{" "}
                proficient)
              </span>
              <span className="text-gray-600">
                {skillsOpen ? "\u2212" : "+"}
              </span>
            </button>
            {skillsOpen && (
              <div className="mt-1.5 space-y-0.5">
                {s.skills.map((skill) => {
                  const mod = getSkillModifier(
                    skill,
                    s.abilities,
                    s.proficiencyBonus
                  );
                  const skillAdvs = findAdvantages(
                    s.advantages,
                    skill.name
                  );
                  return (
                    <div
                      key={skill.name}
                      className={`flex items-center gap-1.5 rounded px-2 py-0.5 ${
                        skill.proficient || skill.expertise
                          ? "bg-gray-900/30"
                          : ""
                      }`}
                    >
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                          skill.expertise
                            ? "bg-yellow-500"
                            : skill.proficient
                            ? "bg-green-500"
                            : "bg-gray-700"
                        }`}
                      />
                      <span
                        className={`text-xs ${
                          skill.proficient || skill.expertise
                            ? "text-gray-300"
                            : "text-gray-500"
                        }`}
                      >
                        {SKILL_DISPLAY_NAMES[skill.name] || skill.name}
                      </span>
                      {skill.expertise && (
                        <span className="text-xs text-yellow-500 font-bold uppercase">
                          E
                        </span>
                      )}
                      <AdvMarker entries={skillAdvs} />
                      <span
                        className={`ml-auto text-xs font-semibold ${
                          skill.proficient || skill.expertise
                            ? mod >= 0
                              ? "text-gray-300"
                              : "text-red-400"
                            : "text-gray-600"
                        }`}
                      >
                        {formatBonus(mod)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Proficiencies (collapsible) */}
        {(s.proficiencies.armor.length > 0 ||
          s.proficiencies.weapons.length > 0 ||
          s.proficiencies.tools.length > 0 ||
          s.proficiencies.other.length > 0) && (
          <div>
            <button
              onClick={() => setProfsOpen(!profsOpen)}
              className="flex items-center justify-between w-full text-sm text-gray-500 uppercase tracking-wider font-medium"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              <span>Proficiencies</span>
              <span className="text-gray-600">
                {profsOpen ? "\u2212" : "+"}
              </span>
            </button>
            {profsOpen && (
              <div className="mt-1.5 space-y-1.5">
                {s.proficiencies.armor.length > 0 && (
                  <div>
                    <div className="text-sm text-gray-500 font-medium">
                      Armor
                    </div>
                    <div className="text-xs text-gray-300">
                      {s.proficiencies.armor.join(", ")}
                    </div>
                  </div>
                )}
                {s.proficiencies.weapons.length > 0 && (
                  <div>
                    <div className="text-sm text-gray-500 font-medium">
                      Weapons
                    </div>
                    <div className="text-xs text-gray-300">
                      {s.proficiencies.weapons.join(", ")}
                    </div>
                  </div>
                )}
                {s.proficiencies.tools.length > 0 && (
                  <div>
                    <div className="text-sm text-gray-500 font-medium">
                      Tools
                    </div>
                    <div className="text-xs text-gray-300">
                      {s.proficiencies.tools.join(", ")}
                    </div>
                  </div>
                )}
                {s.proficiencies.other.length > 0 && (
                  <div>
                    <div className="text-sm text-gray-500 font-medium">
                      Other
                    </div>
                    <div className="text-xs text-gray-300">
                      {s.proficiencies.other.join(", ")}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Languages & Senses */}
        {(s.languages.length > 0 || s.senses.length > 0) && (
          <div className="space-y-1.5">
            {s.languages.length > 0 && (
              <div>
                <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-0.5" style={{ fontFamily: "var(--font-cinzel)" }}>
                  Languages
                </div>
                <div className="text-xs text-gray-300">
                  {s.languages.join(", ")}
                </div>
              </div>
            )}
            {s.senses.length > 0 && (
              <div>
                <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-0.5" style={{ fontFamily: "var(--font-cinzel)" }}>
                  Senses
                </div>
                <div className="text-xs text-gray-300">
                  {s.senses.join(", ")}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ TAB BAR ═══ */}
      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        showSpells={isCaster || s.spells.length > 0}
      />

      {/* ═══ TAB CONTENT (scrollable, fills remaining space) ═══ */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "actions" && (
          <ActionsTab
            character={character}
            onItemClick={(item, e) => setPopup({ type: "item", item, position: { x: e.clientX, y: e.clientY } })}
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
            onItemClick={(item, e) => setPopup({ type: "item", item, position: { x: e.clientX, y: e.clientY } })}
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
    </div>
  );
}
