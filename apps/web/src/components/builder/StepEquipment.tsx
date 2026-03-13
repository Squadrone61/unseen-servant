import { useMemo, useState } from "react";
import { baseItemsArray, allItemsArray } from "@aidnd/shared/data";
import type { BaseItemData } from "@aidnd/shared/data";
import { formatDamageType, decodeProperty, decodeMastery, formatItemCost, categorizeBaseItem } from "@aidnd/shared";
import type { StepProps, EquipmentEntry, BuilderAction } from "./types";
import { resolveStartingEquipment, getStartingEquipmentDescription } from "./utils";

type EquipmentTab = "weapon" | "armor" | "other" | "custom";

const TAB_ICONS: Record<EquipmentTab, React.ReactNode> = {
  weapon: (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M13.5 1.5a.5.5 0 0 0-.707 0L10.5 3.793 9.207 2.5a.5.5 0 0 0-.707.707L9.793 4.5 2.146 12.146a.5.5 0 0 0 0 .708l1 1a.5.5 0 0 0 .708 0L11.5 6.207l1.293 1.293a.5.5 0 0 0 .707-.707L12.207 5.5l2.293-2.293a.5.5 0 0 0 0-.707l-1-1z" />
    </svg>
  ),
  armor: (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 .5a.5.5 0 0 1 .386.184l4 5A.5.5 0 0 1 12.5 6v4a.5.5 0 0 1-.076.268l-4 6a.5.5 0 0 1-.848 0l-4-6A.5.5 0 0 1 3.5 10V6a.5.5 0 0 1 .114-.316l4-5A.5.5 0 0 1 8 .5zm0 1.401L4.5 6.265V9.93l3.5 5.25 3.5-5.25V6.265L8 1.9z" />
    </svg>
  ),
  other: (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M12 1a1 1 0 0 1 1 1v1.5h.5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H2.5A.5.5 0 0 1 2 11V4a.5.5 0 0 1 .5-.5H3V2a1 1 0 0 1 1-1h8zM4 3.5V2h8v1.5H4zM2.5 4.5v6h11v-6h-11z" />
      <path d="M4 7a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 7zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5A.5.5 0 0 1 4 9z" />
    </svg>
  ),
  custom: (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 0 0 1.829 1.828l1.936.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 0 0-1.828 1.829l-.645 1.936a.361.361 0 0 1-.686 0l-.645-1.937a2.89 2.89 0 0 0-1.828-1.828l-1.937-.645a.361.361 0 0 1 0-.686l1.937-.645a2.89 2.89 0 0 0 1.828-1.828l.645-1.937zM3.794 1.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387A1.734 1.734 0 0 0 4.593 5.69l-.387 1.162a.217.217 0 0 1-.412 0L3.407 5.69A1.734 1.734 0 0 0 2.31 4.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387A1.734 1.734 0 0 0 3.407 2.31l.387-1.162zM10.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.156 1.156 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.156 1.156 0 0 0-.732-.732L9.1 2.137a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732L10.863.1z" />
    </svg>
  ),
};

const TABS: { value: EquipmentTab; label: string }[] = [
  { value: "weapon", label: "Weapons" },
  { value: "armor", label: "Armor" },
  { value: "other", label: "Other" },
  { value: "custom", label: "Custom" },
];

// Category grouping definitions
const WEAPON_CATEGORIES = [
  { label: "Simple Melee", filter: (w: BaseItemData) => w.weaponCategory === "simple" && w.type?.split("|")[0] === "M" },
  { label: "Simple Ranged", filter: (w: BaseItemData) => w.weaponCategory === "simple" && w.type?.split("|")[0] === "R" },
  { label: "Martial Melee", filter: (w: BaseItemData) => w.weaponCategory === "martial" && w.type?.split("|")[0] === "M" },
  { label: "Martial Ranged", filter: (w: BaseItemData) => w.weaponCategory === "martial" && w.type?.split("|")[0] === "R" },
];

const ARMOR_CATEGORIES = [
  { label: "Light Armor", filter: (a: BaseItemData) => a.type?.split("|")[0] === "LA" },
  { label: "Medium Armor", filter: (a: BaseItemData) => a.type?.split("|")[0] === "MA" },
  { label: "Heavy Armor", filter: (a: BaseItemData) => a.type?.split("|")[0] === "HA" },
  { label: "Shields", filter: (a: BaseItemData) => a.type?.split("|")[0] === "S" },
];

// Pre-categorized item lists
const weaponItems = baseItemsArray.filter((item: BaseItemData) => item.weapon === true);
const armorItems = baseItemsArray.filter((item: BaseItemData) =>
  item.armor === true || item.type?.split("|")[0] === "S"
);

// "Other" tab: gear + tools from base items, plus ALL items from items.json
// Deduplicate by name (base items take priority since they have richer data)
const baseGearAndTools = baseItemsArray.filter((item: BaseItemData) => {
  const cat = categorizeBaseItem(item);
  return cat === "gear" || cat === "tool";
});
const baseItemNames = new Set(baseItemsArray.map((item: BaseItemData) => item.name.toLowerCase()));
const allOtherItems = allItemsArray.filter(
  (item: { name: string; type?: string }) => {
    // Skip items already in base items (weapons, armor are shown in their own tabs)
    if (baseItemNames.has(item.name.toLowerCase())) return false;
    // Skip items that are clearly weapons/armor (handled by other tabs)
    const typeCode = item.type?.split("|")[0] ?? "";
    if (["M", "R", "LA", "MA", "HA"].includes(typeCode)) return false;
    return true;
  }
);
const otherItems = [
  ...baseGearAndTools,
  ...allOtherItems,
].sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

export function StepEquipment({ state, dispatch }: StepProps) {
  const [tab, setTab] = useState<EquipmentTab>("weapon");
  const [search, setSearch] = useState("");

  const addItem = (name: string, source?: EquipmentEntry["source"]) => {
    const entry: EquipmentEntry = {
      name,
      quantity: 1,
      equipped: tab === "weapon" || tab === "armor",
      source: source ?? (tab === "custom" ? "item" : tab === "other" ? "gear" : tab),
    };
    dispatch({ type: "ADD_EQUIPMENT", entry });
  };

  // Decode mastery name from "Name|Source" format
  const parseMastery = (mastery: string) => decodeMastery(mastery);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-amber-200/90 tracking-wide" style={{ fontFamily: "var(--font-cinzel)" }}>
          Equipment
        </h2>
        <p className="text-xs text-gray-500">Add weapons, armor, gear, and tools to your inventory.</p>
        <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
      </div>

      {/* Starting Equipment Presets */}
      {state.classes.length > 0 && (() => {
        const className = state.classes[0].className;
        const desc = getStartingEquipmentDescription(className);
        if (!desc) return null;
        return (
          <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-gray-300" style={{ fontFamily: "var(--font-cinzel)" }}>
              Starting Equipment — {className}
            </div>
            <div className="flex gap-2">
              {(["A", "B"] as const).map((choice) => (
                <button
                  key={choice}
                  onClick={() => {
                    const { items, currency } = resolveStartingEquipment(className, choice);
                    dispatch({ type: "ADD_STARTING_EQUIPMENT", items, currency });
                  }}
                  className="flex-1 text-left px-3 py-2 rounded-lg border border-gray-700/50 bg-gray-900/40 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all text-xs"
                >
                  <div className="font-medium text-amber-300/80 mb-0.5">Option {choice}</div>
                  <div className="text-gray-500 text-[10px] leading-snug">{desc[choice]}</div>
                </button>
              ))}
            </div>
            <div className="text-[10px] text-gray-600">
              Clicking a preset adds items to your inventory. You can still add more items below.
            </div>
          </div>
        );
      })()}

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
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.value
                    ? "text-amber-300 border-b-2 border-amber-400/70"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {TAB_ICONS[t.value]}
                {t.label}
              </button>
            ))}
          </div>

          {tab !== "custom" && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${tab === "other" ? "items" : tab + "s"}...`}
              className="w-full bg-gray-900/60 border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30"
            />
          )}

          <div className="max-h-[480px] overflow-y-auto">
            {tab === "custom" ? (
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
                items={otherItems}
                search={search}
                equipment={state.equipment}
                onAdd={addItem}
              />
            )}
          </div>
        </div>

        {/* Right: Inventory */}
        <div className="w-64 shrink-0 space-y-4">
          <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-4 space-y-2">
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
                          ? "border-amber-500 bg-amber-500/80"
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
          <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-4 space-y-2">
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
                    className="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-center text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
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

const DAMAGE_TYPES = [
  "Slashing", "Piercing", "Bludgeoning", "Fire", "Cold", "Lightning",
  "Thunder", "Acid", "Poison", "Necrotic", "Radiant", "Force", "Psychic",
];

// Type pills grouped by category
const TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: "Combat", types: ["Weapon", "Armor", "Shield", "Ammunition"] },
  { label: "Magic", types: ["Wondrous Item", "Ring", "Rod", "Staff", "Wand", "Scroll"] },
  { label: "Mundane", types: ["Gear", "Potion", "Tool"] },
];

// Rarity with D&D-standard colors
const RARITIES: { name: string; color: string; ring: string; bg: string }[] = [
  { name: "Common",    color: "text-gray-400",   ring: "ring-gray-500",    bg: "bg-gray-500" },
  { name: "Uncommon",  color: "text-green-400",  ring: "ring-green-500",   bg: "bg-green-500" },
  { name: "Rare",      color: "text-blue-400",   ring: "ring-blue-500",    bg: "bg-blue-500" },
  { name: "Very Rare", color: "text-purple-400", ring: "ring-purple-500",  bg: "bg-purple-500" },
  { name: "Legendary", color: "text-amber-400",  ring: "ring-amber-500",   bg: "bg-amber-500" },
  { name: "Artifact",  color: "text-red-400",    ring: "ring-red-500",     bg: "bg-red-500" },
];

// Rarity border colors for item cards
const RARITY_BORDER: Record<string, string> = {
  Common:    "border-l-gray-500",
  Uncommon:  "border-l-green-500",
  Rare:      "border-l-blue-500",
  "Very Rare": "border-l-purple-500",
  Legendary: "border-l-amber-500",
  Artifact:  "border-l-red-500",
};

// Types that show weapon-related fields
const WEAPON_TYPES = new Set(["Weapon", "Ammunition"]);
// Types that show AC field
const ARMOR_TYPES = new Set(["Armor", "Shield"]);

const inputCls = "w-full bg-gray-900/80 border border-gray-700/80 rounded-md px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30 transition-colors";
const selectCls = "w-full bg-gray-900/80 border border-gray-700/80 rounded-md px-2.5 py-1.5 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30 transition-colors";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest shrink-0">
        {children}
      </span>
      <div className="h-px flex-1 bg-gradient-to-r from-gray-700 to-transparent" />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] text-gray-500 leading-none">{children}</span>
  );
}

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
  const [damage, setDamage] = useState("");
  const [damageType, setDamageType] = useState("");
  const [range, setRange] = useState("");
  const [armorClass, setArmorClass] = useState("");
  const [attackBonus, setAttackBonus] = useState("");
  const [properties, setProperties] = useState("");
  const [rarity, setRarity] = useState("");
  const [attunement, setAttunement] = useState(false);
  const [isMagicItem, setIsMagicItem] = useState(false);

  const resetForm = () => {
    setName("");
    setQuantity(1);
    setDescription("");
    setWeight("");
    setItemType("");
    setDamage("");
    setDamageType("");
    setRange("");
    setArmorClass("");
    setAttackBonus("");
    setProperties("");
    setRarity("");
    setAttunement(false);
    setIsMagicItem(false);
  };

  const handleAdd = () => {
    if (!name.trim()) return;
    const parsedProps = properties.trim()
      ? properties.split(",").map((p) => p.trim()).filter(Boolean)
      : undefined;
    const entry: EquipmentEntry = {
      name: name.trim(),
      quantity,
      equipped: false,
      source: "item",
      ...(itemType && { itemType }),
      ...(description.trim() && { description: description.trim() }),
      ...(weight && { weight: Number(weight) }),
      ...(damage.trim() && { damage: damage.trim() }),
      ...(damageType && { damageType }),
      ...(range.trim() && { range: range.trim() }),
      ...(armorClass && { armorClass: Number(armorClass) }),
      ...(attackBonus && { attackBonus: Number(attackBonus) }),
      ...(parsedProps && { properties: parsedProps }),
      ...(rarity && { rarity }),
      ...(attunement && { attunement: true }),
      ...(isMagicItem && { isMagicItem: true }),
    };
    dispatch({ type: "ADD_EQUIPMENT", entry });
    resetForm();
  };

  const showWeaponFields = WEAPON_TYPES.has(itemType);
  const showArmorFields = ARMOR_TYPES.has(itemType);
  const customItems = equipment.filter((e) => e.source === "item");

  return (
    <div className="space-y-3">
      {/* ── Form Card ── */}
      <div className="relative rounded-lg overflow-hidden">
        {/* Gradient top accent */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

        <div className="bg-gray-800/90 border border-gray-700/60 rounded-lg p-4 space-y-4">
          {/* ── Name ── */}
          <div className="space-y-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What are you adding?"
              className="w-full bg-transparent border-0 border-b border-gray-700 rounded-none px-0 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500/40 transition-colors"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>

          {/* ── Type Selector (pill groups) ── */}
          <div className="space-y-2">
            <SectionLabel>Type</SectionLabel>
            <div className="space-y-1.5">
              {TYPE_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-wrap gap-1">
                  {group.types.map((t) => {
                    const selected = itemType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setItemType(selected ? "" : t)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150 ${
                          selected
                            ? "bg-amber-500/80 text-amber-50 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
                            : "bg-gray-900/60 text-gray-500 hover:text-gray-300 hover:bg-gray-700/60"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* ── Qty + Weight ── */}
          <div className="grid grid-cols-[72px_96px] gap-3">
            <div className="space-y-1">
              <FieldLabel>Qty</FieldLabel>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className={inputCls + " text-center"}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel>Weight (lb.)</FieldLabel>
              <input
                type="number"
                min={0}
                step={0.1}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="--"
                className={inputCls}
              />
            </div>
          </div>

          {/* ── Weapon Stats (contextual) ── */}
          {showWeaponFields && (
            <div className="space-y-2">
              <SectionLabel>Weapon Stats</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <FieldLabel>Damage</FieldLabel>
                  <input
                    type="text"
                    value={damage}
                    onChange={(e) => setDamage(e.target.value)}
                    placeholder="e.g. 2d6"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Damage Type</FieldLabel>
                  <select
                    value={damageType}
                    onChange={(e) => setDamageType(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">--</option>
                    {DAMAGE_TYPES.map((dt) => (
                      <option key={dt} value={dt.toLowerCase()}>{dt}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_72px] gap-2">
                <div className="space-y-1">
                  <FieldLabel>Range</FieldLabel>
                  <input
                    type="text"
                    value={range}
                    onChange={(e) => setRange(e.target.value)}
                    placeholder="e.g. 20/60 ft."
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Atk +</FieldLabel>
                  <input
                    type="number"
                    value={attackBonus}
                    onChange={(e) => setAttackBonus(e.target.value)}
                    placeholder="--"
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <FieldLabel>Properties</FieldLabel>
                <input
                  type="text"
                  value={properties}
                  onChange={(e) => setProperties(e.target.value)}
                  placeholder="Versatile, Light, Finesse..."
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {/* ── Armor Stats (contextual) ── */}
          {showArmorFields && (
            <div className="space-y-2">
              <SectionLabel>Armor Stats</SectionLabel>
              <div className="w-24 space-y-1">
                <FieldLabel>Armor Class</FieldLabel>
                <input
                  type="number"
                  min={0}
                  value={armorClass}
                  onChange={(e) => setArmorClass(e.target.value)}
                  placeholder="--"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {/* ── Rarity (colored dot pills) ── */}
          <div className="space-y-2">
            <SectionLabel>Rarity</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {RARITIES.map((r) => {
                const selected = rarity === r.name;
                return (
                  <button
                    key={r.name}
                    type="button"
                    onClick={() => setRarity(selected ? "" : r.name)}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150 ${
                      selected
                        ? `${r.bg}/20 ${r.color} ring-1 ${r.ring}/50`
                        : "bg-gray-900/40 text-gray-600 hover:text-gray-400"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${selected ? r.bg : "bg-gray-700"}`} />
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Magic + Attunement (toggle pills) ── */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsMagicItem(!isMagicItem)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all duration-150 ${
                isMagicItem
                  ? "bg-purple-600/20 text-purple-300 ring-1 ring-purple-500/40"
                  : "bg-gray-900/40 text-gray-600 hover:text-gray-400 border border-gray-700/50"
              }`}
            >
              Magic Item
            </button>
            <button
              type="button"
              onClick={() => setAttunement(!attunement)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all duration-150 ${
                attunement
                  ? "bg-amber-600/20 text-amber-300 ring-1 ring-amber-500/40"
                  : "bg-gray-900/40 text-gray-600 hover:text-gray-400 border border-gray-700/50"
              }`}
            >
              Requires Attunement
            </button>
          </div>

          {/* ── Description ── */}
          <div className="space-y-1">
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of the item..."
              rows={2}
              className={inputCls + " resize-none"}
            />
          </div>

          {/* ── Add Button ── */}
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="w-full py-2 text-xs font-semibold rounded-md transition-all duration-200 bg-amber-600/80 hover:bg-amber-500/80 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-[0_0_16px_rgba(245,158,11,0.25)]"
          >
            Add to Inventory
          </button>
        </div>
      </div>

      {/* ── Custom Items List ── */}
      {customItems.length > 0 && (
        <div className="space-y-1.5">
          {customItems.map((entry) => {
            const rarityBorder = entry.rarity ? RARITY_BORDER[entry.rarity] : null;
            const rarityData = entry.rarity ? RARITIES.find((r) => r.name === entry.rarity) : null;

            const stats: string[] = [];
            if (entry.damage) {
              let dmg = entry.damage;
              if (entry.damageType) dmg += ` ${entry.damageType}`;
              stats.push(dmg);
            }
            if (entry.armorClass != null) stats.push(`AC ${entry.armorClass}`);
            if (entry.attackBonus != null) stats.push(`+${entry.attackBonus}`);
            if (entry.range) stats.push(entry.range);
            if (entry.properties?.length) stats.push(entry.properties.join(", "));
            if (entry.weight != null && entry.weight > 0) stats.push(`${entry.weight} lb.`);

            return (
              <div
                key={entry.name}
                className={`pl-3 pr-2.5 py-2 rounded-md border-l-2 bg-gray-800/60 text-xs ${
                  rarityBorder ?? "border-l-gray-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-200 font-medium truncate">{entry.name}</span>
                      {entry.quantity > 1 && (
                        <span className="text-[9px] text-gray-500 tabular-nums">x{entry.quantity}</span>
                      )}
                    </div>
                    {/* Tags row */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {entry.itemType && (
                        <span className="text-[9px] px-1.5 py-px rounded bg-gray-700/50 text-gray-500">
                          {entry.itemType}
                        </span>
                      )}
                      {rarityData && (
                        <span className={`text-[9px] px-1.5 py-px rounded ${rarityData.bg}/15 ${rarityData.color}`}>
                          {entry.rarity}
                        </span>
                      )}
                      {entry.isMagicItem && (
                        <span className="text-[9px] px-1.5 py-px rounded bg-purple-500/15 text-purple-400">
                          Magic
                        </span>
                      )}
                      {entry.attunement && (
                        <span className="text-[9px] px-1.5 py-px rounded bg-amber-500/15 text-amber-400">
                          Attunement
                        </span>
                      )}
                    </div>
                    {/* Stats line */}
                    {stats.length > 0 && (
                      <div className="text-[10px] text-gray-500 truncate">
                        {stats.join(" \u00b7 ")}
                      </div>
                    )}
                    {entry.description && (
                      <div className="text-[10px] text-gray-600 line-clamp-1 italic">
                        {entry.description}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
        let weapons = weaponItems.filter(cat.filter);
        if (search) {
          weapons = weapons.filter((w: BaseItemData) => w.name.toLowerCase().includes(q));
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
                        ? "border-amber-500/20 bg-amber-500/5"
                        : "border-gray-700/50 bg-gray-800/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-gray-200 truncate">{item.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {item.dmg1} {item.dmgType ? formatDamageType(item.dmgType) : ""}
                        {item.value ? <span> &middot; {formatItemCost(item.value)}</span> : null}
                        {item.weight != null && item.weight > 0 && <span> &middot; {item.weight} lb.</span>}
                        {item.mastery && item.mastery.length > 0 && (
                          <span className="ml-1 text-amber-400/60">
                            [{item.mastery.map((m: string) => parseMastery(m)).join(", ")}]
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onAdd(item.name)}
                      className={`shrink-0 text-[10px] px-2 py-1 rounded transition-colors ${
                        alreadyAdded
                          ? "text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
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
        let armorList = armorItems.filter(cat.filter);
        if (search) {
          armorList = armorList.filter((a: BaseItemData) => a.name.toLowerCase().includes(q));
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
                        ? "border-amber-500/20 bg-amber-500/5"
                        : "border-gray-700/50 bg-gray-800/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-gray-200 truncate">{item.name}</div>
                      <div className="text-[10px] text-gray-500">
                        AC {item.ac}
                        {item.stealth && <span> &middot; Stealth Disadv.</span>}
                        {item.strength && <span> &middot; Str {item.strength}</span>}
                        {item.value ? <span> &middot; {formatItemCost(item.value)}</span> : null}
                        {item.weight != null && item.weight > 0 && <span> &middot; {item.weight} lb.</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => onAdd(item.name)}
                      className={`shrink-0 text-[10px] px-2 py-1 rounded transition-colors ${
                        alreadyAdded
                          ? "text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OtherItem = { name: string; value?: number; weight?: number; rarity?: string; entries?: any[]; reqAttune?: unknown };

function FlatList({
  items,
  search,
  equipment,
  onAdd,
}: {
  items: OtherItem[];
  search: string;
  equipment: EquipmentEntry[];
  onAdd: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="space-y-1">
      {filtered.map((item) => {
        const alreadyAdded = equipment.some((e) => e.name === item.name);
        const isMagic = item.rarity && item.rarity !== "none";
        const isExpanded = expanded === item.name;
        const hasEntries = item.entries && item.entries.length > 0;
        const briefDesc = hasEntries
          ? item.entries!
              .filter((e: unknown) => typeof e === "string")
              .join(" ")
              .replace(/\{@[^}]+\|?([^|}]*)}/g, "$1")
              .slice(0, 120)
          : null;

        return (
          <div
            key={item.name}
            className={`rounded-lg border text-xs transition-colors ${
              alreadyAdded
                ? "border-amber-500/20 bg-amber-500/5"
                : "border-gray-700/50 bg-gray-800/50"
            }`}
          >
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : item.name)}
                className="min-w-0 text-left flex-1"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-200 truncate">{item.name}</span>
                  {isMagic && (
                    <span className={`text-[8px] px-1 py-px rounded shrink-0 ${RARITY_PILL[item.rarity!] ?? "bg-gray-700/50 text-gray-400"}`}>
                      {item.rarity}
                    </span>
                  )}
                  {!!item.reqAttune && (
                    <span className="text-[8px] px-1 py-px rounded bg-amber-900/30 text-amber-500/70 shrink-0">Attune</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500">
                  {formatItemCost(item.value)}
                  {item.weight != null && item.weight > 0 && <span> &middot; {item.weight} lb.</span>}
                  {!isMagic && briefDesc && (
                    <span className="ml-1 text-gray-600 truncate">&middot; {briefDesc}</span>
                  )}
                </div>
              </button>
              <button
                onClick={() => onAdd(item.name)}
                className={`shrink-0 text-[10px] px-2 py-1 rounded transition-colors ml-2 ${
                  alreadyAdded
                    ? "text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
                    : "text-gray-400 bg-gray-700 hover:bg-gray-600"
                }`}
              >
                {alreadyAdded ? "+1" : "Add"}
              </button>
            </div>
            {isExpanded && hasEntries && (
              <div className="px-2.5 pb-2 text-[10px] text-gray-400 leading-relaxed border-t border-gray-700/30 pt-1.5">
                {item.entries!
                  .filter((e: unknown) => typeof e === "string")
                  .map((e: string, i: number) => (
                    <p key={i} className="mb-1">
                      {e.replace(/\{@[^}]+\|?([^|}]*)}/g, "$1")}
                    </p>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const RARITY_PILL: Record<string, string> = {
  Common: "bg-gray-700/50 text-gray-400",
  Uncommon: "bg-green-900/30 text-green-400",
  Rare: "bg-blue-900/30 text-blue-400",
  "Very Rare": "bg-purple-900/30 text-purple-400",
  Legendary: "bg-amber-900/30 text-amber-400",
  Artifact: "bg-red-900/30 text-red-400",
};
