"use client";

import type { InventoryItem } from "@unseen-servant/shared/types";
import { DetailPopover } from "./DetailPopover";
import { RichText } from "../ui/RichText";
import { useEntityClick } from "./EntityPopoverContext";
import { RARITY_COLORS } from "./utils";

interface ItemDetailPopupProps {
  item: InventoryItem;
  onClose: () => void;
  position: { x: number; y: number };
}

export function ItemDetailPopup({ item, onClose, position }: ItemDetailPopupProps) {
  const onEntityClick = useEntityClick();
  const rarityColor = RARITY_COLORS[item.rarity ?? ""] ?? "text-gray-300";

  return (
    <DetailPopover title={item.name} onClose={onClose} position={position}>
      <div className="space-y-3">
        {/* Header badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {item.type && (
            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
              {item.type}
            </span>
          )}
          {item.rarity && (
            <span className={`text-xs font-medium ${rarityColor}`}>{item.rarity}</span>
          )}
          {item.isMagicItem && (
            <span className="text-xs bg-amber-900/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-700/30">
              Magic
            </span>
          )}
          {item.attunement && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${
                item.isAttuned
                  ? "bg-blue-900/40 text-blue-300 border-blue-700/50"
                  : "bg-gray-800 text-gray-500 border-gray-600"
              }`}
            >
              {item.isAttuned ? "Attuned" : "Requires Attunement"}
            </span>
          )}
          {item.equipped && (
            <span className="text-xs bg-green-900/40 text-green-300 px-2 py-0.5 rounded-full border border-green-700/50">
              Equipped
            </span>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {item.damage && (
            <div className="bg-gray-900/50 border border-gray-700 rounded px-2.5 py-1.5">
              <div className="text-xs text-gray-500 uppercase">Damage</div>
              <div className="text-sm text-gray-300">
                {item.damage}
                {item.damageType && <span className="text-gray-500"> {item.damageType}</span>}
              </div>
            </div>
          )}
          {item.armorClass != null && item.armorClass > 0 && (
            <div className="bg-gray-900/50 border border-gray-700 rounded px-2.5 py-1.5">
              <div className="text-xs text-gray-500 uppercase">AC</div>
              <div className="text-sm text-gray-300">{item.armorClass}</div>
            </div>
          )}
          {item.weight != null && item.weight > 0 && (
            <div className="bg-gray-900/50 border border-gray-700 rounded px-2.5 py-1.5">
              <div className="text-xs text-gray-500 uppercase">Weight</div>
              <div className="text-sm text-gray-300">{item.weight} lb</div>
            </div>
          )}
          {item.quantity > 1 && (
            <div className="bg-gray-900/50 border border-gray-700 rounded px-2.5 py-1.5">
              <div className="text-xs text-gray-500 uppercase">Qty</div>
              <div className="text-sm text-gray-300">{item.quantity}</div>
            </div>
          )}
        </div>

        {/* Properties */}
        {item.properties && item.properties.length > 0 && (
          <div>
            <div
              className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Properties
            </div>
            <div className="flex flex-wrap gap-1">
              {item.properties.map((prop) => (
                <span
                  key={prop}
                  className="text-xs bg-gray-700/50 text-gray-300 px-2 py-0.5 rounded"
                >
                  {prop}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mastery */}
        {item.mastery && (
          <div>
            <div
              className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Mastery: {item.mastery.name}
            </div>
            <RichText
              text={item.mastery.description}
              className="text-gray-300 text-sm"
              onEntityClick={onEntityClick}
            />
          </div>
        )}

        {/* Description */}
        {item.description && (
          <div>
            <div
              className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Description
            </div>
            <RichText
              text={item.description}
              className="text-gray-300 text-sm"
              onEntityClick={onEntityClick}
            />
          </div>
        )}
      </div>
    </DetailPopover>
  );
}
