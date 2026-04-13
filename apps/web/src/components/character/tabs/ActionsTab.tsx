import { useState, useMemo } from "react";
import type { CharacterData, CharacterFeatureRef, Item } from "@unseen-servant/shared/types";
import { actionsArray, resolveFeatureActivation } from "@unseen-servant/shared/data";
import { getTotalLevel } from "@unseen-servant/shared/utils";
import { getClassResources, getProficiencies } from "@unseen-servant/shared/character";
import { FilterChipBar } from "../FilterChipBar";

interface ActionEntry {
  name: string;
  detail: string;
  item: Item;
}

interface ActionsTabProps {
  character: CharacterData;
  onItemClick: (item: Item, e: React.MouseEvent) => void;
  onFeatureClick: (feature: CharacterFeatureRef, e: React.MouseEvent) => void;
}

// Standard D&D combat actions from database, grouped by activation type
const STANDARD_ACTION_GROUPS = (() => {
  const actions: { name: string; unit: string; description: string }[] = [];
  const bonusActions: { name: string; unit: string; description: string }[] = [];
  const reactions: { name: string; unit: string; description: string }[] = [];

  for (const a of actionsArray) {
    const timeStr = a.time ?? "";
    const unit = timeStr.includes("bonus")
      ? "bonus"
      : timeStr.includes("reaction")
        ? "reaction"
        : "action";
    const desc = a.description;
    const entry = { name: a.name, unit, description: desc };
    if (unit === "bonus") bonusActions.push(entry);
    else if (unit === "reaction") reactions.push(entry);
    else actions.push(entry);
  }
  return { actions, bonusActions, reactions };
})();

type GroupId = "weapons" | "actions" | "bonus" | "reactions";

interface FeatureGroup {
  id: GroupId;
  label: string;
  features: CharacterFeatureRef[];
}

const SOURCE_BADGE_STYLES: Record<string, string> = {
  species: "text-emerald-400/70",
  class: "text-amber-400/70",
  subclass: "text-amber-400/70",
  feat: "text-amber-300/70",
  background: "text-cyan-400/70",
};

type FeatureGroupId = "actions" | "bonus" | "reactions";

function classifyFeature(f: CharacterFeatureRef): FeatureGroupId | null {
  const activation = resolveFeatureActivation(f);
  switch (activation) {
    case "action":
      return "actions";
    case "bonus":
      return "bonus";
    case "reaction":
      return "reactions";
    default:
      return null; // passive features stay in the Features tab
  }
}

export function ActionsTab({ character, onItemClick, onFeatureClick }: ActionsTabProps) {
  const [filter, setFilter] = useState<string>("all");
  const s = character.static;
  const d = character.dynamic;
  const profBonus = Math.floor((getTotalLevel(s.classes) - 1) / 4) + 2;
  const weaponProfsList = getProficiencies(character, "weapons");
  const classResources = getClassResources(character);

  // Equipped weapons with damage
  const weapons: ActionEntry[] = useMemo(() => {
    const result: ActionEntry[] = [];
    for (const item of d.inventory) {
      if (item.equipped && item.weapon) {
        const parts: string[] = [];
        const { damage, damageType, range, properties } = item.weapon;
        if (range) parts.push(range);
        // Compute attack bonus inline (mirrors getWeaponAttack logic):
        // Ammunition → DEX, Finesse → max(STR,DEX), else STR
        const strMod = Math.floor((s.abilities.strength - 10) / 2);
        const dexMod = Math.floor((s.abilities.dexterity - 10) / 2);
        const props = properties ?? [];
        let abilityMod: number;
        if (props.includes("Ammunition")) {
          abilityMod = dexMod;
        } else if (props.includes("Finesse")) {
          abilityMod = Math.max(strMod, dexMod);
        } else {
          abilityMod = strMod;
        }
        const weaponProfs = weaponProfsList.map((p) => p.toLowerCase());
        const isProficient =
          weaponProfs.some((p) => p.includes("simple") || p.includes("martial")) ||
          weaponProfs.includes(item.name.toLowerCase());
        const attackBonus = abilityMod + (isProficient ? profBonus : 0);
        parts.push(`${attackBonus >= 0 ? "+" : ""}${attackBonus}`);
        parts.push([damage, damageType].filter(Boolean).join(" "));
        result.push({
          name: item.name,
          detail: parts.join(" · "),
          item,
        });
      }
    }
    return result;
  }, [d.inventory, s.abilities, profBonus, weaponProfsList]);

  // Feature-based actions grouped by type
  const featureGroups: FeatureGroup[] = useMemo(() => {
    const buckets: Record<Exclude<GroupId, "weapons">, CharacterFeatureRef[]> = {
      actions: [],
      bonus: [],
      reactions: [],
    };

    for (const f of s.features) {
      const id = classifyFeature(f);
      if (id) buckets[id].push(f);
    }

    const groups: FeatureGroup[] = [];
    if (buckets.actions.length > 0)
      groups.push({ id: "actions", label: "Actions", features: buckets.actions });
    if (buckets.bonus.length > 0)
      groups.push({ id: "bonus", label: "Bonus Actions", features: buckets.bonus });
    if (buckets.reactions.length > 0)
      groups.push({ id: "reactions", label: "Reactions", features: buckets.reactions });
    return groups;
  }, [s.features]);

  // Build filter chips
  const chips = useMemo(() => {
    const totalFeatures = featureGroups.reduce((sum, g) => sum + g.features.length, 0);
    const result = [{ id: "all", label: "ALL", count: weapons.length + totalFeatures }];
    if (weapons.length > 0) result.push({ id: "weapons", label: "WEAPONS", count: weapons.length });
    for (const group of featureGroups) {
      result.push({
        id: group.id,
        label: group.label.toUpperCase(),
        count: group.features.length,
      });
    }
    return result;
  }, [weapons, featureGroups]);

  const showWeapons = filter === "all" || filter === "weapons";
  const visibleGroups =
    filter === "all" ? featureGroups : featureGroups.filter((g) => g.id === filter);

  return (
    <div className="space-y-2">
      {/* Class Resources (Rage, Ki, Channel Divinity, Superiority Dice, etc.) */}
      {classResources.length > 0 && (
        <div className="space-y-1 pb-2 border-b border-gray-700/40">
          <div
            className="text-sm text-gray-500 uppercase tracking-wider font-medium px-1.5"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            Class Resources
          </div>
          {classResources.map((resource) => {
            const used = (d.resourcesUsed || {})[resource.name] ?? 0;
            const remaining = resource.maxUses - used;
            return (
              <div key={resource.name} className="flex items-center gap-1.5 text-xs px-1.5 py-0.5">
                <span className="text-gray-300 truncate flex-1">{resource.name}</span>
                <span className="text-xs text-gray-500">
                  {[resource.shortRest && "SR", resource.longRest && "LR"]
                    .filter(Boolean)
                    .join("/")}
                </span>
                <span className="text-amber-400/80 shrink-0">
                  {remaining}/{resource.maxUses}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <FilterChipBar chips={chips} activeChipId={filter} onSelect={setFilter} />

      {/* Weapon attacks */}
      {showWeapons && weapons.length > 0 && (
        <div>
          <div
            className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-0.5 px-1.5"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            Weapons
          </div>
          <div className="space-y-0.5">
            {weapons.map((action, i) => (
              <div
                key={`${action.name}-${i}`}
                className="flex items-center gap-1.5 text-xs px-1.5 py-1 rounded cursor-pointer hover:bg-gray-800/60 transition-colors group"
                onClick={(e) => onItemClick(action.item, e)}
              >
                <span className="text-gray-200 group-hover:text-amber-300 transition-colors truncate flex-1">
                  {action.name}
                </span>
                <span className="text-gray-500 shrink-0 text-xs">{action.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature-based actions grouped by type */}
      {visibleGroups.map((group) => (
        <div key={group.id}>
          <div
            className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-0.5 px-1.5"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.features.map((feature, i) => (
              <div
                key={`${feature.dbKind}-${feature.dbName}-${feature.featureName ?? ""}-${i}`}
                className="flex items-center gap-1.5 text-xs px-1.5 py-1 rounded cursor-pointer hover:bg-gray-800/60 transition-colors group"
                onClick={(e) => onFeatureClick(feature, e)}
              >
                <span className="text-gray-200 group-hover:text-amber-300 transition-colors truncate flex-1">
                  {feature.featureName ?? feature.dbName}
                </span>
                <span
                  className={`text-xs shrink-0 ${SOURCE_BADGE_STYLES[feature.dbKind] || "text-gray-500"}`}
                >
                  {feature.sourceLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {weapons.length === 0 && featureGroups.length === 0 && (
        <div className="text-xs text-gray-600 text-center py-4">No actions available</div>
      )}

      {/* Standard combat actions (from D&D database) */}
      <StandardActionsSection label="Standard Actions" items={STANDARD_ACTION_GROUPS.actions} />
      {STANDARD_ACTION_GROUPS.bonusActions.length > 0 && (
        <StandardActionsSection label="Bonus Actions" items={STANDARD_ACTION_GROUPS.bonusActions} />
      )}
      {STANDARD_ACTION_GROUPS.reactions.length > 0 && (
        <StandardActionsSection label="Reactions" items={STANDARD_ACTION_GROUPS.reactions} />
      )}
    </div>
  );
}

function StandardActionsSection({
  label,
  items,
}: {
  label: string;
  items: { name: string; description: string }[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="border-t border-gray-700/40 pt-2 mt-2">
      <div
        className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-0.5 px-1.5"
        style={{ fontFamily: "var(--font-cinzel)" }}
      >
        {label}
      </div>
      <div className="space-y-0.5">
        {items.map((sa) => (
          <div key={sa.name}>
            <div
              className="flex items-center gap-1.5 text-xs px-1.5 py-1 rounded cursor-pointer hover:bg-gray-800/60 transition-colors text-gray-500 hover:text-gray-300"
              onClick={() => setExpanded(expanded === sa.name ? null : sa.name)}
            >
              <svg
                className={`w-2.5 h-2.5 shrink-0 transition-transform ${expanded === sa.name ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <span className="truncate flex-1">{sa.name}</span>
            </div>
            {expanded === sa.name && (
              <div className="text-xs text-gray-500 px-1.5 pl-6 pb-1 leading-relaxed">
                {sa.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
