import { useState, useMemo } from "react";
import type { CharacterData, Item } from "@unseen-servant/shared/types";
import { FilterChipBar } from "../FilterChipBar";
import { RARITY_COLORS } from "../utils";

interface InventoryTabProps {
  character: CharacterData;
  onItemClick: (item: Item, e: React.MouseEvent) => void;
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
        <div className="border-b border-gray-700/40 px-1.5 pb-1">
          <div
            className="mb-0.5 text-sm font-medium tracking-wider text-gray-500 uppercase"
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
        <div className="py-4 text-center text-xs text-gray-600">No items</div>
      )}

      <div className="space-y-0.5">
        {sorted.map((item, i) => {
          const isMagic = !!item.rarity && item.rarity !== "Common";
          const rarityColor =
            item.rarity && RARITY_COLORS[item.rarity]
              ? RARITY_COLORS[item.rarity]
              : item.equipped
                ? "text-gray-200"
                : "text-gray-400";

          // Determine type label from sub-objects
          let typeLabel: string | undefined;
          if (item.weapon) typeLabel = "Weapon";
          else if (item.armor) {
            typeLabel =
              item.armor.type === "shield"
                ? "Shield"
                : `${item.armor.type.charAt(0).toUpperCase() + item.armor.type.slice(1)} Armor`;
          }

          return (
            <div
              key={`${item.name}-${i}`}
              className="group flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors hover:bg-gray-800/60"
              onClick={(e) => onItemClick(item, e)}
            >
              {/* Equipped indicator */}
              <span
                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                  item.equipped ? "bg-green-500" : "bg-gray-700"
                }`}
              />

              {/* Name */}
              <span
                className={`flex-1 truncate transition-colors group-hover:text-amber-300 ${rarityColor}`}
              >
                {item.name}
                {isMagic && <span className="ml-0.5 text-amber-400">✦</span>}
              </span>

              {/* Attunement indicator */}
              {item.attunement && (
                <span
                  className={`shrink-0 text-xs ${
                    item.attuned ? "text-amber-400" : "text-gray-600"
                  }`}
                  title={item.attuned ? "Attuned" : "Requires attunement"}
                >
                  ◈
                </span>
              )}

              {/* Quantity */}
              {item.quantity > 1 && (
                <span className="shrink-0 text-xs text-gray-500">×{item.quantity}</span>
              )}

              {/* Type badge */}
              {typeLabel && <span className="shrink-0 text-xs text-gray-600">{typeLabel}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
