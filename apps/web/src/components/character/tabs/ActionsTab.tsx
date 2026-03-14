import { useState, useMemo } from "react";
import type {
  CharacterData,
  CharacterFeature,
  InventoryItem,
} from "@unseen-servant/shared/types";
import { FilterChipBar } from "../FilterChipBar";

interface ActionEntry {
  name: string;
  detail: string;
  item: InventoryItem;
}

interface ActionsTabProps {
  character: CharacterData;
  onItemClick: (item: InventoryItem, e: React.MouseEvent) => void;
  onFeatureClick: (feature: CharacterFeature, e: React.MouseEvent) => void;
}

// Standard D&D combat actions — always shown as a reference
const STANDARD_ACTIONS = [
  { name: "Attack", detail: "Melee or ranged attack" },
  { name: "Cast a Spell", detail: "Use an action spell" },
  { name: "Dash", detail: "Double movement speed" },
  { name: "Disengage", detail: "No opportunity attacks" },
  { name: "Dodge", detail: "Attacks have disadvantage" },
  { name: "Help", detail: "Give ally advantage" },
  { name: "Hide", detail: "Stealth check" },
  { name: "Ready", detail: "Prepare a reaction" },
  { name: "Search", detail: "Perception/Investigation" },
  { name: "Use an Object", detail: "Interact with object" },
];

type GroupId = "weapons" | "actions" | "bonus" | "reactions" | "other";

interface FeatureGroup {
  id: GroupId;
  label: string;
  features: CharacterFeature[];
}

const SOURCE_BADGE_STYLES: Record<string, string> = {
  race: "text-emerald-400/70",
  class: "text-amber-400/70",
  feat: "text-amber-300/70",
  background: "text-cyan-400/70",
};

function classifyFeature(f: CharacterFeature): GroupId {
  if (!f.activationType) return "other";
  const t = f.activationType.toLowerCase();
  if (t.includes("bonus action")) return "bonus";
  if (t.includes("reaction")) return "reactions";
  if (t.includes("action")) return "actions";
  return "other";
}

export function ActionsTab({
  character,
  onItemClick,
  onFeatureClick,
}: ActionsTabProps) {
  const [filter, setFilter] = useState<string>("all");
  const s = character.static;
  const d = character.dynamic;

  // Equipped weapons with damage
  const weapons: ActionEntry[] = useMemo(() => {
    const result: ActionEntry[] = [];
    for (const item of d.inventory) {
      if (item.equipped && item.damage) {
        const parts: string[] = [];
        if (item.range) parts.push(item.range);
        if (item.attackBonus != null) {
          parts.push(`${item.attackBonus >= 0 ? "+" : ""}${item.attackBonus}`);
        }
        parts.push(
          [item.damage, item.damageType].filter(Boolean).join(" ")
        );
        result.push({
          name: item.name,
          detail: parts.join(" · "),
          item,
        });
      }
    }
    return result;
  }, [d.inventory]);

  // Feature-based actions grouped by type
  const featureGroups: FeatureGroup[] = useMemo(() => {
    const buckets: Record<GroupId, CharacterFeature[]> = {
      actions: [],
      bonus: [],
      reactions: [],
      other: [],
      weapons: [], // unused, weapons are separate
    };

    for (const f of s.features) {
      if (!f.activationType) continue;
      buckets[classifyFeature(f)].push(f);
    }

    const groups: FeatureGroup[] = [];
    if (buckets.actions.length > 0)
      groups.push({ id: "actions", label: "Actions", features: buckets.actions });
    if (buckets.bonus.length > 0)
      groups.push({ id: "bonus", label: "Bonus Actions", features: buckets.bonus });
    if (buckets.reactions.length > 0)
      groups.push({ id: "reactions", label: "Reactions", features: buckets.reactions });
    if (buckets.other.length > 0)
      groups.push({ id: "other", label: "Other", features: buckets.other });
    return groups;
  }, [s.features]);

  // Build filter chips
  const chips = useMemo(() => {
    const totalFeatures = featureGroups.reduce((sum, g) => sum + g.features.length, 0);
    const result = [
      { id: "all", label: "ALL", count: weapons.length + totalFeatures },
    ];
    if (weapons.length > 0)
      result.push({ id: "weapons", label: "WEAPONS", count: weapons.length });
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
    filter === "all"
      ? featureGroups
      : featureGroups.filter((g) => g.id === filter);

  return (
    <div className="space-y-2">
      <FilterChipBar chips={chips} activeChipId={filter} onSelect={setFilter} />

      {/* Weapon attacks */}
      {showWeapons && weapons.length > 0 && (
        <div>
          <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-0.5 px-1.5" style={{ fontFamily: "var(--font-cinzel)" }}>
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
                <span className="text-gray-500 shrink-0 text-xs">
                  {action.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature-based actions grouped by type */}
      {visibleGroups.map((group) => (
        <div key={group.id}>
          <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-0.5 px-1.5" style={{ fontFamily: "var(--font-cinzel)" }}>
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.features.map((feature) => (
              <div
                key={feature.name}
                className="flex items-center gap-1.5 text-xs px-1.5 py-1 rounded cursor-pointer hover:bg-gray-800/60 transition-colors group"
                onClick={(e) => onFeatureClick(feature, e)}
              >
                <span className="text-gray-200 group-hover:text-amber-300 transition-colors truncate flex-1">
                  {feature.name}
                </span>
                <span
                  className={`text-xs shrink-0 ${SOURCE_BADGE_STYLES[feature.source] || "text-gray-500"}`}
                >
                  {feature.sourceLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {weapons.length === 0 && featureGroups.length === 0 && (
        <div className="text-xs text-gray-600 text-center py-4">
          No actions available
        </div>
      )}

      {/* Standard combat actions (reference) */}
      <div className="border-t border-gray-700/40 pt-2 mt-2">
        <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-0.5 px-1.5" style={{ fontFamily: "var(--font-cinzel)" }}>
          Standard Actions
        </div>
        <div className="space-y-0.5">
          {STANDARD_ACTIONS.map((sa) => (
            <div
              key={sa.name}
              className="flex items-center gap-1.5 text-xs px-1.5 py-0.5 text-gray-600"
            >
              <span className="truncate flex-1">{sa.name}</span>
              <span className="text-xs shrink-0">{sa.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
