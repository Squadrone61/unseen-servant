import { useState, useMemo } from "react";
import type { CharacterData, InventoryItem } from "@unseen-servant/shared/types";
import { FilterChipBar } from "../FilterChipBar";
import { RARITY_COLORS } from "../utils";

interface InventoryTabProps {
  character: CharacterData;
  onItemClick: (item: InventoryItem, e: React.MouseEvent) => void;
}

export function InventoryTab({ character, onItemClick }: InventoryTabProps) {
  const [filter, setFilter] = useState<string>("all");
  const d = character.dynamic;

  const counts = useMemo(() => {
    const equipped = d.inventory.filter((i) => i.equipped).length;
    const attunement = d.inventory.filter((i) => i.attunement).length;
    return { equipped, attunement };
  }, [d.inventory]);

  const chips = [
    { id: "all", label: "ALL", count: d.inventory.length },
    { id: "equipment", label: "EQUIPPED", count: counts.equipped },
    ...(counts.attunement > 0
      ? [{ id: "attunement", label: "ATTUNEMENT", count: counts.attunement }]
      : []),
  ];

  const filtered = useMemo(() => {
    switch (filter) {
      case "equipment":
        return d.inventory.filter((i) => i.equipped);
      case "attunement":
        return d.inventory.filter((i) => i.attunement);
      default:
        return d.inventory;
    }
  }, [d.inventory, filter]);

  // Sort: equipped first, then by name
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

  const hasCurrency =
    d.currency.gp > 0 || d.currency.sp > 0 || d.currency.cp > 0 || d.currency.pp > 0;

  return (
    <div className="space-y-2">
      {/* Currency */}
      {hasCurrency && (
        <div className="px-1.5 pb-1 border-b border-gray-700/40">
          <div
            className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-0.5"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            Currency
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {d.currency.pp > 0 && <span className="text-gray-300">{d.currency.pp} PP</span>}
            {d.currency.gp > 0 && <span className="text-yellow-400">{d.currency.gp} GP</span>}
            {d.currency.sp > 0 && <span className="text-gray-400">{d.currency.sp} SP</span>}
            {d.currency.cp > 0 && <span className="text-orange-400">{d.currency.cp} CP</span>}
          </div>
        </div>
      )}

      <FilterChipBar chips={chips} activeChipId={filter} onSelect={setFilter} />

      {sorted.length === 0 && (
        <div className="text-xs text-gray-600 text-center py-4">No items</div>
      )}

      <div className="space-y-0.5">
        {sorted.map((item, i) => {
          const rarityColor =
            item.rarity && RARITY_COLORS[item.rarity]
              ? RARITY_COLORS[item.rarity]
              : item.equipped
                ? "text-gray-200"
                : "text-gray-400";

          return (
            <div
              key={`${item.name}-${i}`}
              className="flex items-center gap-1.5 text-xs px-1.5 py-1 rounded cursor-pointer hover:bg-gray-800/60 transition-colors group"
              onClick={(e) => onItemClick(item, e)}
            >
              {/* Equipped indicator */}
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                  item.equipped ? "bg-green-500" : "bg-gray-700"
                }`}
              />

              {/* Name */}
              <span
                className={`truncate flex-1 group-hover:text-amber-300 transition-colors ${rarityColor}`}
              >
                {item.name}
                {item.isMagicItem && <span className="text-amber-400 ml-0.5">✦</span>}
              </span>

              {/* Attunement indicator */}
              {item.attunement && (
                <span
                  className={`text-xs shrink-0 ${
                    item.isAttuned ? "text-amber-400" : "text-gray-600"
                  }`}
                  title={item.isAttuned ? "Attuned" : "Requires attunement"}
                >
                  ◈
                </span>
              )}

              {/* Quantity */}
              {item.quantity > 1 && (
                <span className="text-gray-500 text-xs shrink-0">×{item.quantity}</span>
              )}

              {/* Type badge */}
              {item.type && <span className="text-xs text-gray-600 shrink-0">{item.type}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
