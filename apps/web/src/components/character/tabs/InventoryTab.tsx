import { useState, useMemo, useEffect, useRef } from "react";
import { Reorder, useDragControls, type DragControls } from "framer-motion";
import type { CharacterData, Item } from "@unseen-servant/shared/types";
import { FilterChipBar } from "../FilterChipBar";
import { RARITY_COLORS } from "../utils";

interface InventoryTabProps {
  character: CharacterData;
  onItemClick: (item: Item, e: React.MouseEvent) => void;
  /** Called with item names in the new desired order. Absent = read-only inventory. */
  onReorderInventory?: (order: string[]) => void;
}

interface InventoryRowProps {
  item: Item;
  onItemClick: (item: Item, e: React.MouseEvent) => void;
  draggable: boolean;
  dragControls?: DragControls;
}

function InventoryRowContent({ item, onItemClick, draggable, dragControls }: InventoryRowProps) {
  const isMagic = !!item.rarity && item.rarity !== "Common";
  const rarityColor =
    item.rarity && RARITY_COLORS[item.rarity]
      ? RARITY_COLORS[item.rarity]
      : item.equipped
        ? "text-gray-200"
        : "text-gray-400";

  let typeLabel: string | undefined;
  if (item.weapon) typeLabel = "Weapon";
  else if (item.armor) {
    typeLabel =
      item.armor.type === "shield"
        ? "Shield"
        : `${item.armor.type.charAt(0).toUpperCase() + item.armor.type.slice(1)} Armor`;
  }

  return (
    <>
      {/* Drag handle (only when reordering is enabled) */}
      {draggable && dragControls && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            dragControls.start(e);
          }}
          aria-label={`Reorder ${item.name}`}
          className="shrink-0 cursor-grab touch-none px-0.5 text-gray-600 transition-colors hover:text-amber-400 active:cursor-grabbing"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
            <circle cx="2.5" cy="2.5" r="1" />
            <circle cx="7.5" cy="2.5" r="1" />
            <circle cx="2.5" cy="7" r="1" />
            <circle cx="7.5" cy="7" r="1" />
            <circle cx="2.5" cy="11.5" r="1" />
            <circle cx="7.5" cy="11.5" r="1" />
          </svg>
        </button>
      )}

      {/* Equipped indicator */}
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
          item.equipped ? "bg-green-500" : "bg-gray-700"
        }`}
      />

      {/* Name (click to open popover) */}
      <span
        className={`flex-1 cursor-pointer truncate transition-colors hover:text-amber-300 ${rarityColor}`}
        onClick={(e) => onItemClick(item, e)}
      >
        {item.name}
        {isMagic && <span className="ml-0.5 text-amber-400">✦</span>}
      </span>

      {/* Attunement indicator */}
      {item.attunement && (
        <span
          className={`shrink-0 text-xs ${item.attuned ? "text-amber-400" : "text-gray-600"}`}
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
    </>
  );
}

function ReorderableRow({
  item,
  onItemClick,
}: {
  item: Item;
  onItemClick: (item: Item, e: React.MouseEvent) => void;
}) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      className="group flex items-center gap-1.5 rounded bg-gray-900/0 px-1.5 py-1 text-xs transition-colors hover:bg-gray-800/60"
    >
      <InventoryRowContent
        item={item}
        onItemClick={onItemClick}
        draggable={true}
        dragControls={dragControls}
      />
    </Reorder.Item>
  );
}

function StaticRow({
  item,
  onItemClick,
}: {
  item: Item;
  onItemClick: (item: Item, e: React.MouseEvent) => void;
}) {
  return (
    <div className="group flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors hover:bg-gray-800/60">
      <InventoryRowContent item={item} onItemClick={onItemClick} draggable={false} />
    </div>
  );
}

export function InventoryTab({ character, onItemClick, onReorderInventory }: InventoryTabProps) {
  const [filter, setFilter] = useState<string>("all");
  const d = character.dynamic;

  // Local optimistic copy so drag-reorder updates immediately while we debounce
  // the dispatch back to the bridge / library. Synced from props whenever the
  // authoritative inventory changes (add_item, remove_item, etc.).
  const [localItems, setLocalItems] = useState<Item[]>(d.inventory);
  useEffect(() => {
    setLocalItems(d.inventory);
  }, [d.inventory]);

  const counts = useMemo(() => {
    const equipped = localItems.filter((i) => i.equipped).length;
    const attunement = localItems.filter((i) => i.attunement).length;
    return { equipped, attunement };
  }, [localItems]);

  const chips = [
    { id: "all", label: "ALL", count: localItems.length },
    { id: "equipment", label: "EQUIPPED", count: counts.equipped },
    ...(counts.attunement > 0
      ? [{ id: "attunement", label: "ATTUNEMENT", count: counts.attunement }]
      : []),
  ];

  const filteredView = useMemo(() => {
    switch (filter) {
      case "equipment":
        return localItems.filter((i) => i.equipped);
      case "attunement":
        return localItems.filter((i) => i.attunement);
      default:
        return localItems;
    }
  }, [localItems, filter]);

  const draggable = filter === "all" && !!onReorderInventory;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleReorder(newOrder: Item[]) {
    setLocalItems(newOrder);
    if (!onReorderInventory) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onReorderInventory(newOrder.map((i) => i.name));
    }, 300);
  }

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

      {filteredView.length === 0 && (
        <div className="py-4 text-center text-xs text-gray-600">No items</div>
      )}

      {draggable ? (
        <Reorder.Group
          axis="y"
          values={localItems}
          onReorder={handleReorder}
          as="div"
          className="space-y-0.5"
        >
          {localItems.map((item) => (
            <ReorderableRow key={item.name} item={item} onItemClick={onItemClick} />
          ))}
        </Reorder.Group>
      ) : (
        <div className="space-y-0.5">
          {filteredView.map((item) => (
            <StaticRow key={item.name} item={item} onItemClick={onItemClick} />
          ))}
        </div>
      )}
    </div>
  );
}
