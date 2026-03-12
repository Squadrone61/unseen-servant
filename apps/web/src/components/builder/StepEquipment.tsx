import { useMemo, useState } from "react";
import { equipmentDb } from "@aidnd/shared/data";
import type { WeaponData, ArmorData } from "@aidnd/shared/data";
import type { StepProps, EquipmentEntry, BuilderAction } from "./types";

type EquipmentTab = "weapon" | "armor" | "gear" | "tool" | "item";

const TABS: { value: EquipmentTab; label: string }[] = [
  { value: "weapon", label: "Weapons" },
  { value: "armor", label: "Armor" },
  { value: "gear", label: "Gear" },
  { value: "tool", label: "Tools" },
  { value: "item", label: "Items" },
];

// Category grouping definitions
const WEAPON_CATEGORIES = [
  { label: "Simple Melee", filter: (w: WeaponData) => w.category === "simple" && w.type === "melee" },
  { label: "Simple Ranged", filter: (w: WeaponData) => w.category === "simple" && w.type === "ranged" },
  { label: "Martial Melee", filter: (w: WeaponData) => w.category === "martial" && w.type === "melee" },
  { label: "Martial Ranged", filter: (w: WeaponData) => w.category === "martial" && w.type === "ranged" },
];

const ARMOR_CATEGORIES = [
  { label: "Light Armor", filter: (a: ArmorData) => a.category === "light" },
  { label: "Medium Armor", filter: (a: ArmorData) => a.category === "medium" },
  { label: "Heavy Armor", filter: (a: ArmorData) => a.category === "heavy" },
  { label: "Shields", filter: (a: ArmorData) => a.category === "shield" },
];

export function StepEquipment({ state, dispatch }: StepProps) {
  const [tab, setTab] = useState<EquipmentTab>("weapon");
  const [search, setSearch] = useState("");

  const addItem = (name: string) => {
    const entry: EquipmentEntry = {
      name,
      quantity: 1,
      equipped: tab === "weapon" || tab === "armor",
      source: tab,
    };
    dispatch({ type: "ADD_EQUIPMENT", entry });
  };

  // Parse mastery name from "Name|Source" format
  const parseMastery = (mastery: string) => mastery.split("|")[0];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-200 mb-1">Equipment</h2>
        <p className="text-xs text-gray-500">
          Add weapons, armor, gear, and tools to your inventory.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Left: Browser */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setTab(t.value);
                  setSearch("");
                }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.value
                    ? "text-purple-400 border-b-2 border-purple-400"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab !== "item" && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${tab}s...`}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          )}

          <div className="max-h-[480px] overflow-y-auto">
            {tab === "item" ? (
              <CustomItemsPanel
                equipment={state.equipment}
                dispatch={dispatch}
              />
            ) : tab === "weapon" ? (
              <GroupedWeapons
                search={search}
                equipment={state.equipment}
                onAdd={addItem}
                parseMastery={parseMastery}
              />
            ) : tab === "armor" ? (
              <GroupedArmor
                search={search}
                equipment={state.equipment}
                onAdd={addItem}
              />
            ) : (
              <FlatList
                items={
                  tab === "gear"
                    ? equipmentDb.gear
                    : equipmentDb.tools
                }
                search={search}
                tab={tab}
                equipment={state.equipment}
                onAdd={addItem}
              />
            )}
          </div>
        </div>

        {/* Right: Inventory */}
        <div className="w-64 shrink-0 space-y-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-2">
            <div className="text-xs font-medium text-gray-300">Inventory</div>
            {state.equipment.length === 0 ? (
              <div className="text-[10px] text-gray-600 text-center py-4">
                No items added
              </div>
            ) : (
              <div className="space-y-1">
                {state.equipment.map((entry) => (
                  <div
                    key={`${entry.source}-${entry.name}`}
                    className="flex items-center gap-2 text-[10px]"
                  >
                    <button
                      onClick={() =>
                        dispatch({ type: "TOGGLE_EQUIPPED", name: entry.name })
                      }
                      className={`w-3 h-3 rounded-sm border shrink-0 ${
                        entry.equipped
                          ? "border-purple-500 bg-purple-600"
                          : "border-gray-600"
                      }`}
                      title={entry.equipped ? "Equipped" : "Unequipped"}
                    />
                    <span className="flex-1 text-gray-300 truncate">
                      {entry.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          entry.quantity > 1
                            ? dispatch({
                                type: "SET_EQUIPMENT_QUANTITY",
                                name: entry.name,
                                quantity: entry.quantity - 1,
                              })
                            : dispatch({
                                type: "REMOVE_EQUIPMENT",
                                name: entry.name,
                              })
                        }
                        className="text-gray-600 hover:text-gray-400"
                      >
                        -
                      </button>
                      <span className="text-gray-400 w-4 text-center">
                        {entry.quantity}
                      </span>
                      <button
                        onClick={() =>
                          dispatch({
                            type: "SET_EQUIPMENT_QUANTITY",
                            name: entry.name,
                            quantity: entry.quantity + 1,
                          })
                        }
                        className="text-gray-600 hover:text-gray-400"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() =>
                        dispatch({ type: "REMOVE_EQUIPMENT", name: entry.name })
                      }
                      className="text-gray-600 hover:text-red-400"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Currency */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-2">
            <div className="text-xs font-medium text-gray-300">Currency</div>
            <div className="grid grid-cols-5 gap-1">
              {(["cp", "sp", "ep", "gp", "pp"] as const).map((coin) => (
                <div key={coin} className="text-center">
                  <div className="text-[9px] text-gray-500 uppercase">
                    {coin}
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={state.currency[coin]}
                    onChange={(e) =>
                      dispatch({
                        type: "SET_CURRENCY",
                        currency: {
                          ...state.currency,
                          [coin]: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                    className="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-center text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Items Panel ─────────────────────────────────

function CustomItemsPanel({
  equipment,
  dispatch,
}: {
  equipment: EquipmentEntry[];
  dispatch: React.Dispatch<BuilderAction>;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState("");
  const [weight, setWeight] = useState("");
  const [itemType, setItemType] = useState("");

  const handleAdd = () => {
    if (!name.trim()) return;
    const entry: EquipmentEntry = {
      name: name.trim(),
      quantity,
      equipped: false,
      source: "item",
      ...(description.trim() && { description: description.trim() }),
      ...(weight && { weight: Number(weight) }),
      ...(itemType.trim() && { itemType: itemType.trim() }),
    };
    dispatch({ type: "ADD_EQUIPMENT", entry });
    setName("");
    setQuantity(1);
    setDescription("");
    setWeight("");
    setItemType("");
  };

  const customItems = equipment.filter((e) => e.source === "item");

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-2">
        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
          Add Custom Item
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name *"
          className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
            placeholder="Type (e.g. Potion)"
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <input
            type="number"
            min={0}
            step={0.1}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="Weight (lb.)"
            className="w-24 bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            placeholder="Qty"
            className="w-14 bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 text-center placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
        />
        <button
          onClick={handleAdd}
          disabled={!name.trim()}
          className="w-full py-1.5 text-xs font-medium rounded transition-colors bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add Item
        </button>
      </div>

      {customItems.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
            Custom Items
          </div>
          {customItems.map((entry) => (
            <div
              key={entry.name}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-purple-500/20 bg-purple-600/5 text-xs"
            >
              <div className="min-w-0">
                <div className="text-gray-200 truncate">{entry.name}</div>
                <div className="text-[10px] text-gray-500">
                  {entry.itemType && <span>{entry.itemType}</span>}
                  {entry.weight != null && entry.weight > 0 && (
                    <span>
                      {entry.itemType ? " \u00b7 " : ""}{entry.weight} lb.
                    </span>
                  )}
                  {entry.description && (
                    <span>
                      {(entry.itemType || (entry.weight != null && entry.weight > 0)) ? " \u00b7 " : ""}
                      {entry.description}
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-[10px] text-gray-500 ml-2">
                x{entry.quantity}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Grouped Weapons ─────────────────────────────────────

function GroupedWeapons({
  search,
  equipment,
  onAdd,
  parseMastery,
}: {
  search: string;
  equipment: EquipmentEntry[];
  onAdd: (name: string) => void;
  parseMastery: (m: string) => string;
}) {
  const q = search.toLowerCase();

  return (
    <div className="space-y-3">
      {WEAPON_CATEGORIES.map((cat) => {
        let weapons = equipmentDb.weapons.filter(cat.filter);
        if (search) {
          weapons = weapons.filter((w) => w.name.toLowerCase().includes(q));
        }
        if (weapons.length === 0) return null;

        return (
          <div key={cat.label}>
            <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1 sticky top-0 bg-gray-900 py-0.5">
              {cat.label}
            </div>
            <div className="space-y-1">
              {weapons.map((item) => {
                const alreadyAdded = equipment.some(
                  (e) => e.name === item.name && e.source === "weapon"
                );
                return (
                  <div
                    key={item.name}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs ${
                      alreadyAdded
                        ? "border-purple-500/20 bg-purple-600/5"
                        : "border-gray-700 bg-gray-800"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-gray-200 truncate">{item.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {item.damage} {item.damageType}
                        {item.cost && <span> &middot; {item.cost}</span>}
                        {item.weight > 0 && <span> &middot; {item.weight} lb.</span>}
                        {item.mastery && (
                          <span className="ml-1 text-purple-400/60">
                            [{parseMastery(item.mastery)}]
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onAdd(item.name)}
                      className={`shrink-0 text-[10px] px-2 py-1 rounded transition-colors ${
                        alreadyAdded
                          ? "text-purple-400 bg-purple-600/10 hover:bg-purple-600/20"
                          : "text-gray-400 bg-gray-700 hover:bg-gray-600"
                      }`}
                    >
                      {alreadyAdded ? "+1" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Grouped Armor ───────────────────────────────────────

function GroupedArmor({
  search,
  equipment,
  onAdd,
}: {
  search: string;
  equipment: EquipmentEntry[];
  onAdd: (name: string) => void;
}) {
  const q = search.toLowerCase();

  return (
    <div className="space-y-3">
      {ARMOR_CATEGORIES.map((cat) => {
        let armorList = equipmentDb.armor.filter(cat.filter);
        if (search) {
          armorList = armorList.filter((a) => a.name.toLowerCase().includes(q));
        }
        if (armorList.length === 0) return null;

        return (
          <div key={cat.label}>
            <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1 sticky top-0 bg-gray-900 py-0.5">
              {cat.label}
            </div>
            <div className="space-y-1">
              {armorList.map((item) => {
                const alreadyAdded = equipment.some(
                  (e) => e.name === item.name && e.source === "armor"
                );
                return (
                  <div
                    key={item.name}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs ${
                      alreadyAdded
                        ? "border-purple-500/20 bg-purple-600/5"
                        : "border-gray-700 bg-gray-800"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-gray-200 truncate">{item.name}</div>
                      <div className="text-[10px] text-gray-500">
                        AC {item.ac}
                        {item.dexCap !== undefined && <span> (max Dex +{item.dexCap})</span>}
                        {item.stealthDisadvantage && <span> &middot; Stealth Disadv.</span>}
                        {item.cost && <span> &middot; {item.cost}</span>}
                        {item.weight > 0 && <span> &middot; {item.weight} lb.</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => onAdd(item.name)}
                      className={`shrink-0 text-[10px] px-2 py-1 rounded transition-colors ${
                        alreadyAdded
                          ? "text-purple-400 bg-purple-600/10 hover:bg-purple-600/20"
                          : "text-gray-400 bg-gray-700 hover:bg-gray-600"
                      }`}
                    >
                      {alreadyAdded ? "+1" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Flat List (gear/tools) ──────────────────────────────

function FlatList({
  items,
  search,
  tab,
  equipment,
  onAdd,
}: {
  items: { name: string; cost: string; weight: number; description?: string }[];
  search: string;
  tab: EquipmentTab;
  equipment: EquipmentEntry[];
  onAdd: (name: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="space-y-1">
      {filtered.map((item) => {
        const alreadyAdded = equipment.some(
          (e) => e.name === item.name && e.source === tab
        );
        return (
          <div
            key={item.name}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs ${
              alreadyAdded
                ? "border-purple-500/20 bg-purple-600/5"
                : "border-gray-700 bg-gray-800"
            }`}
          >
            <div className="min-w-0">
              <div className="text-gray-200 truncate">{item.name}</div>
              <div className="text-[10px] text-gray-500">
                {item.cost}
                {item.weight > 0 && <span> &middot; {item.weight} lb.</span>}
              </div>
            </div>
            <button
              onClick={() => onAdd(item.name)}
              className={`shrink-0 text-[10px] px-2 py-1 rounded transition-colors ${
                alreadyAdded
                  ? "text-purple-400 bg-purple-600/10 hover:bg-purple-600/20"
                  : "text-gray-400 bg-gray-700 hover:bg-gray-600"
              }`}
            >
              {alreadyAdded ? "+1" : "Add"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
