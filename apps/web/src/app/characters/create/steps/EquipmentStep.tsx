"use client";

import { useMemo, useState } from "react";
import { weaponsArray, armorArray, classesArray } from "@unseen-servant/shared/data";
import type { BaseItemDb } from "@unseen-servant/shared/types";
import type { InventoryItem } from "@unseen-servant/shared/types";
import { useBuilder } from "../BuilderContext";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_STARTING_GOLD = 75;

// Map from property abbreviation to readable name
const PROP_LABELS: Record<string, string> = {
  F: "Finesse",
  L: "Light",
  T: "Thrown",
  V: "Versatile",
  H: "Heavy",
  R: "Reach",
  "2H": "Two-Handed",
  A: "Ammunition",
  LD: "Loading",
  RLD: "Reload",
  BF: "Burst Fire",
  AF: "Ammunition (Futuristic)",
};

// Armor type from BaseItemDb.type code (strip source suffix like |XPHB)
const ARMOR_TYPE_LABELS: Record<string, string> = {
  LA: "Light",
  MA: "Medium",
  HA: "Heavy",
  S: "Shield",
};

// Standard adventuring packs and their contents (presented as single named items)
const ADVENTURING_PACKS: { name: string; description: string }[] = [
  {
    name: "Burglar's Pack",
    description:
      "Backpack, ball bearings, string, bell, candles, crowbar, hammer, pitons, lantern, oil, rations, tinderbox, waterskin",
  },
  {
    name: "Diplomat's Pack",
    description:
      "Chest, map case, fine clothes, bottle of ink, ink pen, lamp, oil, paper, perfume, sealing wax, soap",
  },
  {
    name: "Dungeoneer's Pack",
    description:
      "Backpack, crowbar, hammer, 10 pitons, 10 torches, tinderbox, 10 days rations, waterskin, 50 ft hempen rope",
  },
  {
    name: "Entertainer's Pack",
    description:
      "Backpack, bedroll, 2 costumes, 5 candles, 5 days rations, waterskin, disguise kit",
  },
  {
    name: "Explorer's Pack",
    description:
      "Backpack, bedroll, mess kit, tinderbox, 10 torches, 10 days rations, waterskin, 50 ft hempen rope",
  },
  {
    name: "Priest's Pack",
    description:
      "Backpack, blanket, 10 candles, tinderbox, alms box, 2 blocks of incense, censer, vestments, 2 days rations, waterskin",
  },
  {
    name: "Scholar's Pack",
    description:
      "Backpack, book of lore, bottle of ink, ink pen, 10 sheets of parchment, little bag of sand, small knife",
  },
];

// Classes that get martial weapon proficiency
const MARTIAL_CLASSES = new Set(["Barbarian", "Fighter", "Paladin", "Ranger"]);

// Classes that get shield proficiency (from class data armorProficiencies)
const SHIELD_CLASSES = new Set([
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Paladin",
  "Ranger",
]);

// ---------------------------------------------------------------------------
// Derived type helpers
// ---------------------------------------------------------------------------

/** Strip the source suffix from a type code: "LA|XPHB" → "LA" */
function typeCode(raw: string): string {
  return raw.split("|")[0];
}

function isWeapon(item: BaseItemDb): boolean {
  return item.weapon === true;
}

function isArmor(item: BaseItemDb): boolean {
  return item.armor === true;
}

function _isShield(item: BaseItemDb): boolean {
  return typeCode(item.type) === "S";
}

function armorTypeLabel(item: BaseItemDb): string {
  return ARMOR_TYPE_LABELS[typeCode(item.type)] ?? "Armor";
}

function expandProps(props: string[] | undefined): string {
  if (!props || props.length === 0) return "";
  return props.map((p) => PROP_LABELS[p] ?? p).join(", ");
}

// ---------------------------------------------------------------------------
// Weapon / Armor filtering by class proficiency
// ---------------------------------------------------------------------------

function weaponProficiencyLevel(className: string | null): "none" | "simple" | "martial" {
  if (!className) return "none";
  if (MARTIAL_CLASSES.has(className)) return "martial";
  // Check class data for explicit weapon proficiencies
  const cls = classesArray.find((c) => c.name === className);
  if (!cls) return "none";
  const hasSimple = cls.weaponProficiencies.some((p) => p.toLowerCase().includes("simple"));
  const hasMartial = cls.weaponProficiencies.some((p) => p.toLowerCase().includes("martial"));
  if (hasMartial) return "martial";
  if (hasSimple) return "simple";
  return "none";
}

function classArmorTypes(className: string | null): Set<string> {
  const allowed = new Set<string>();
  if (!className) return allowed;
  const cls = classesArray.find((c) => c.name === className);
  if (!cls) return allowed;
  for (const p of cls.armorProficiencies) {
    const lower = p.toLowerCase();
    if (lower.includes("light")) allowed.add("LA");
    if (lower.includes("medium")) allowed.add("MA");
    if (lower.includes("heavy")) allowed.add("HA");
  }
  return allowed;
}

function classHasShieldProf(className: string | null): boolean {
  if (!className) return false;
  if (SHIELD_CLASSES.has(className)) return true;
  const cls = classesArray.find((c) => c.name === className);
  if (!cls) return false;
  return cls.armorProficiencies.some((p) => p.toLowerCase().includes("shield"));
}

/** Filter to non-futuristic weapons (no AF property = no futuristic ammo, no RLD for modern) */
function isStandardWeapon(item: BaseItemDb): boolean {
  const props = item.properties ?? [];
  // Exclude futuristic ammo types
  if (props.includes("AF")) return false;
  // Exclude blowgun (very niche, and it's already confusing to show)
  // Keep everything else standard
  return true;
}

// ---------------------------------------------------------------------------
// InventoryItem factory
// ---------------------------------------------------------------------------

function baseItemToInventoryItem(item: BaseItemDb, equipped = false): InventoryItem {
  const tc = typeCode(item.type);
  let itemType = "Gear";
  if (item.weapon) itemType = "Weapon";
  else if (item.armor) itemType = "Armor";
  else if (tc === "S") itemType = "Shield";

  return {
    name: item.name,
    equipped,
    quantity: 1,
    type: itemType,
    armorClass: item.ac,
    damage: item.damage,
    damageType: item.damageType,
    range: item.range,
    properties: item.properties?.map((p) => PROP_LABELS[p] ?? p),
    weight: item.weight,
  };
}

function packToInventoryItem(pack: { name: string; description: string }): InventoryItem {
  return {
    name: pack.name,
    equipped: false,
    quantity: 1,
    type: "Gear",
    description: pack.description,
  };
}

// ---------------------------------------------------------------------------
// Item card (weapon/armor)
// ---------------------------------------------------------------------------

interface ItemCardProps {
  item: BaseItemDb;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function WeaponCard({ item, selected, onToggle, disabled }: ItemCardProps) {
  const propsStr = expandProps(item.properties);
  const catLabel = item.weaponCategory === "martial" ? "Martial" : "Simple";
  const typeLabel = typeCode(item.type) === "M" ? "Melee" : "Ranged";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        "w-full text-left rounded-lg border px-3 py-2.5 transition-all duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
        selected
          ? "border-amber-500/60 bg-amber-500/10"
          : disabled
            ? "border-gray-700/20 bg-gray-900/20 opacity-40 cursor-not-allowed"
            : "border-gray-700/30 bg-gray-800/40 hover:border-gray-600/50 hover:bg-gray-800/60",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={[
            "text-sm font-medium leading-tight",
            selected ? "text-amber-200" : "text-gray-200",
          ].join(" ")}
        >
          {item.name}
        </span>
        {item.damage && (
          <span className="shrink-0 text-xs font-mono text-amber-400/80 bg-amber-900/20 border border-amber-700/20 rounded px-1.5 py-0.5 leading-tight">
            {item.damage} {item.damageType}
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500">
        <span>
          {catLabel} · {typeLabel}
        </span>
        {propsStr && <span>{propsStr}</span>}
        {item.versatileDamage && <span>Versatile ({item.versatileDamage})</span>}
        {item.range && <span>Range {item.range} ft</span>}
        {item.weight && <span>{item.weight} lb</span>}
      </div>
    </button>
  );
}

function ArmorCard({ item, selected, onToggle, disabled }: ItemCardProps) {
  const typeLabel = armorTypeLabel(item);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        "w-full text-left rounded-lg border px-3 py-2.5 transition-all duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
        selected
          ? "border-amber-500/60 bg-amber-500/10"
          : disabled
            ? "border-gray-700/20 bg-gray-900/20 opacity-40 cursor-not-allowed"
            : "border-gray-700/30 bg-gray-800/40 hover:border-gray-600/50 hover:bg-gray-800/60",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={[
            "text-sm font-medium leading-tight",
            selected ? "text-amber-200" : "text-gray-200",
          ].join(" ")}
        >
          {item.name}
        </span>
        <span className="shrink-0 text-xs font-mono text-sky-400/80 bg-sky-900/20 border border-sky-700/20 rounded px-1.5 py-0.5 leading-tight">
          AC {item.ac ?? (typeCode(item.type) === "S" ? "+2" : "?")}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500">
        <span>{typeLabel}</span>
        {item.stealth && <span className="text-yellow-600/80">Stealth disadv.</span>}
        {item.strength && <span>Str {item.strength}+</span>}
        {item.weight && <span>{item.weight} lb</span>}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Pack selector card
// ---------------------------------------------------------------------------

interface PackCardProps {
  pack: { name: string; description: string };
  selected: boolean;
  onToggle: () => void;
}

function PackCard({ pack, selected, onToggle }: PackCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={[
        "w-full text-left rounded-lg border px-3 py-2.5 transition-all duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
        selected
          ? "border-amber-500/60 bg-amber-500/10"
          : "border-gray-700/30 bg-gray-800/40 hover:border-gray-600/50 hover:bg-gray-800/60",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={["text-sm font-medium", selected ? "text-amber-200" : "text-gray-200"].join(" ")}
      >
        {pack.name}
      </span>
      <p className="mt-0.5 text-xs text-gray-500 leading-snug">{pack.description}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Gold mode — shop item row
// ---------------------------------------------------------------------------

interface ShopItemRowProps {
  item: BaseItemDb;
  inCart: boolean;
  canAfford: boolean;
  goldCost: number;
  onAdd: () => void;
  onRemove: () => void;
}

function ShopItemRow({ item, inCart, canAfford, goldCost, onAdd, onRemove }: ShopItemRowProps) {
  const isWeaponItem = item.weapon === true;
  const propsStr = expandProps(item.properties);

  return (
    <div
      className={[
        "flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-100",
        inCart ? "border-amber-500/40 bg-amber-500/8" : "border-gray-700/20 bg-gray-800/30",
      ].join(" ")}
    >
      {/* Info */}
      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-200">{item.name}</span>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-gray-500">
          {isWeaponItem && item.damage && (
            <span>
              {item.damage} {item.damageType}
            </span>
          )}
          {!isWeaponItem && item.ac !== undefined && <span>AC {item.ac}</span>}
          {propsStr && <span>{propsStr}</span>}
          {item.weight !== undefined && <span>{item.weight} lb</span>}
        </div>
      </div>

      {/* Cost badge */}
      <span className="shrink-0 text-xs text-yellow-400/80 font-mono bg-yellow-900/20 border border-yellow-700/20 rounded px-1.5 py-0.5">
        {goldCost} gp
      </span>

      {/* Add/Remove */}
      {inCart ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          className="shrink-0 w-7 h-7 rounded border border-red-700/40 bg-red-900/20 text-red-400 hover:bg-red-900/40 transition-colors flex items-center justify-center text-lg leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
        >
          &minus;
        </button>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAfford}
          aria-label={`Add ${item.name}`}
          className="shrink-0 w-7 h-7 rounded border border-amber-700/40 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40 transition-colors flex items-center justify-center text-lg leading-none disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
        >
          +
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gold item costs (approximate PHB prices in gp)
// ---------------------------------------------------------------------------

const WEAPON_COSTS: Record<string, number> = {
  Club: 0,
  Dagger: 2,
  Greatclub: 0,
  Handaxe: 5,
  Javelin: 0,
  "Light Hammer": 2,
  Mace: 5,
  Quarterstaff: 0,
  Sickle: 1,
  Spear: 1,
  "Light Crossbow": 25,
  Dart: 0,
  Shortbow: 25,
  Sling: 0,
  Battleaxe: 10,
  Flail: 10,
  Glaive: 20,
  Greataxe: 30,
  Greatsword: 50,
  Halberd: 20,
  "Hand Crossbow": 75,
  "Heavy Crossbow": 50,
  Lance: 10,
  Longsword: 15,
  Maul: 10,
  Morningstar: 15,
  Pike: 5,
  Rapier: 25,
  Scimitar: 25,
  Shortsword: 10,
  Trident: 5,
  "War Pick": 5,
  Warhammer: 15,
  Whip: 2,
  Blowgun: 10,
  Longbow: 50,
  Net: 1,
};

const ARMOR_COSTS: Record<string, number> = {
  "Padded Armor": 5,
  "Leather Armor": 10,
  "Studded Leather Armor": 45,
  "Hide Armor": 10,
  "Chain Shirt": 50,
  "Scale Mail": 50,
  "Half Plate Armor": 750,
  Breastplate: 400,
  "Ring Mail": 30,
  "Chain Mail": 75,
  "Splint Armor": 200,
  "Plate Armor": 1500,
  Shield: 10,
};

const GEAR_COSTS: Record<string, number> = {
  "Explorer's Pack": 10,
  "Dungeoneer's Pack": 12,
  "Burglar's Pack": 16,
  "Diplomat's Pack": 39,
  "Entertainer's Pack": 40,
  "Priest's Pack": 19,
  "Scholar's Pack": 40,
  Backpack: 2,
  Bedroll: 1,
  "Hempen Rope (50 feet)": 1,
  Torch: 0,
  Rations: 1,
  Waterskin: 1,
  Tinderbox: 0,
  Lantern: 5,
  "Oil (flask)": 0,
  "Healer's Kit": 5,
  "Thieves' Tools": 25,
};

function itemCost(item: BaseItemDb): number {
  const tc = typeCode(item.type);
  if (item.weapon) return WEAPON_COSTS[item.name] ?? 5;
  if (item.armor || tc === "S") return ARMOR_COSTS[item.name] ?? 10;
  return GEAR_COSTS[item.name] ?? 1;
}

// ---------------------------------------------------------------------------
// Equipment chip panel — always-visible "Your Equipment" summary at top
// ---------------------------------------------------------------------------

interface EquipmentChipPanelProps {
  equipment: InventoryItem[];
  onRemove: (index: number) => void;
  goldInfo?: { remaining: number };
}

function EquipmentChipPanel({ equipment, onRemove, goldInfo }: EquipmentChipPanelProps) {
  return (
    <div className="rounded-lg border border-gray-700/30 bg-gray-900/40 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3
          className="text-sm font-semibold text-amber-400/90 uppercase tracking-wider"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Your Equipment
        </h3>
        {goldInfo !== undefined && (
          <span
            className={[
              "text-xs font-mono font-semibold",
              goldInfo.remaining < 0 ? "text-red-400" : "text-emerald-400",
            ].join(" ")}
          >
            {goldInfo.remaining} gp remaining
          </span>
        )}
      </div>
      {equipment.length === 0 ? (
        <p className="text-sm text-gray-600 italic">No equipment selected yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {equipment.map((item, i) => (
            <span
              key={`${item.name}-${i}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-900/15 text-amber-200 text-xs font-medium"
            >
              {item.name}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${item.name}`}
                className="text-amber-500/60 hover:text-red-400 transition-colors leading-none focus:outline-none"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Starting Equipment mode
// ---------------------------------------------------------------------------

type StartingTab = "weapons" | "armor" | "gear";

function StartingEquipmentPanel() {
  const { state, dispatch } = useBuilder();
  const [activeTab, setActiveTab] = useState<StartingTab>("weapons");
  const [tabSearch, setTabSearch] = useState("");
  const [selectedPack, setSelectedPack] = useState<string | null>(null);

  // Compute proficiency levels from class
  const weaponProf = useMemo(
    () => weaponProficiencyLevel(state.classes[0]?.name ?? null),
    [state.classes[0]?.name ?? null],
  );
  const allowedArmorTypes = useMemo(
    () => classArmorTypes(state.classes[0]?.name ?? null),
    [state.classes[0]?.name ?? null],
  );
  const hasShieldProf = useMemo(
    () => classHasShieldProf(state.classes[0]?.name ?? null),
    [state.classes[0]?.name ?? null],
  );

  // Filter weapons
  const filteredWeapons = useMemo(() => {
    const q = tabSearch.toLowerCase();
    return weaponsArray
      .filter((w) => {
        if (!isWeapon(w)) return false;
        if (!isStandardWeapon(w)) return false;
        if (weaponProf === "none") return false;
        if (weaponProf === "simple" && w.weaponCategory !== "simple") return false;
        return w.name.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.weaponCategory !== b.weaponCategory) {
          return a.weaponCategory === "simple" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  }, [weaponProf, tabSearch]);

  // Filter armor — include shield
  const filteredArmor = useMemo(() => {
    const q = tabSearch.toLowerCase();
    return armorArray
      .filter((a) => {
        const tc = typeCode(a.type);
        if (tc === "S") return hasShieldProf && a.name.toLowerCase().includes(q);
        if (!isArmor(a)) return false;
        if (!allowedArmorTypes.has(tc)) return false;
        return a.name.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const order = { LA: 0, MA: 1, HA: 2, S: 3 };
        const aOrder = order[typeCode(a.type) as keyof typeof order] ?? 9;
        const bOrder = order[typeCode(b.type) as keyof typeof order] ?? 9;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      });
  }, [allowedArmorTypes, hasShieldProf, tabSearch]);

  const selectedNames = useMemo(
    () => new Set(state.equipment.map((e) => e.name)),
    [state.equipment],
  );

  function toggleItem(item: BaseItemDb, equipOnAdd: boolean) {
    if (selectedNames.has(item.name)) {
      const idx = state.equipment.findIndex((e) => e.name === item.name);
      if (idx !== -1) dispatch({ type: "REMOVE_EQUIPMENT", index: idx });
    } else {
      dispatch({
        type: "ADD_EQUIPMENT",
        item: baseItemToInventoryItem(item, equipOnAdd),
      });
    }
  }

  function togglePack(pack: { name: string; description: string }) {
    if (selectedPack === pack.name) {
      const idx = state.equipment.findIndex((e) => e.name === pack.name);
      if (idx !== -1) dispatch({ type: "REMOVE_EQUIPMENT", index: idx });
      setSelectedPack(null);
    } else {
      if (selectedPack) {
        const oldIdx = state.equipment.findIndex((e) => e.name === selectedPack);
        if (oldIdx !== -1) dispatch({ type: "REMOVE_EQUIPMENT", index: oldIdx });
      }
      dispatch({ type: "ADD_EQUIPMENT", item: packToInventoryItem(pack) });
      setSelectedPack(pack.name);
    }
  }

  const hasNoClass = !(state.classes[0]?.name ?? null);
  const hasWeapons = weaponProf !== "none";
  const hasArmor = allowedArmorTypes.size > 0 || hasShieldProf;

  const tabs: { id: StartingTab; label: string }[] = [
    { id: "weapons", label: "Weapons" },
    { id: "armor", label: "Armor & Shields" },
    { id: "gear", label: "Gear & Packs" },
  ];

  function handleTabChange(tab: StartingTab) {
    setActiveTab(tab);
    setTabSearch("");
  }

  return (
    <div className="flex flex-col gap-4">
      {hasNoClass && (
        <div className="rounded-lg border border-amber-700/30 bg-amber-900/10 px-4 py-3 text-sm text-amber-300/80">
          Select a class first to see equipment options filtered to your proficiencies.
        </div>
      )}

      {/* Persistent equipment chip panel */}
      <EquipmentChipPanel
        equipment={state.equipment}
        onRemove={(i) => dispatch({ type: "REMOVE_EQUIPMENT", index: i })}
      />

      {/* Tab bar */}
      <div className="flex border-b border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={[
              "px-4 py-2.5 flex items-center justify-center text-xs font-medium transition-colors",
              activeTab === tab.id
                ? "text-amber-300 border-b-2 border-amber-400/70"
                : "text-gray-500 hover:text-gray-300",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search input */}
      <input
        type="search"
        value={tabSearch}
        onChange={(e) => setTabSearch(e.target.value)}
        placeholder={`Search ${activeTab === "gear" ? "gear & packs" : activeTab}...`}
        aria-label={`Search ${activeTab}`}
        className="w-full bg-gray-800/60 border border-gray-700/40 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
      />

      {/* Weapons tab */}
      {activeTab === "weapons" && (
        <div>
          {!hasWeapons ? (
            <p className="text-sm text-gray-600 italic">
              Your class does not grant weapon proficiencies. Select a class to unlock weapons.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3">
                {weaponProf === "martial"
                  ? "You are proficient with simple and martial weapons."
                  : "You are proficient with simple weapons."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredWeapons.map((w) => (
                  <WeaponCard
                    key={w.name}
                    item={w}
                    selected={selectedNames.has(w.name)}
                    onToggle={() => toggleItem(w, true)}
                  />
                ))}
              </div>
              {filteredWeapons.length === 0 && (
                <p className="text-sm text-gray-600 italic">No weapons match your search.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Armor & Shields tab */}
      {activeTab === "armor" && (
        <div>
          {!hasArmor ? (
            <p className="text-sm text-gray-600 italic">
              Your class does not grant armor proficiencies. Select a class to unlock armor.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3">
                Select the armor and shield you start with.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredArmor.map((a) => (
                  <ArmorCard
                    key={a.name}
                    item={a}
                    selected={selectedNames.has(a.name)}
                    onToggle={() => toggleItem(a, true)}
                  />
                ))}
              </div>
              {filteredArmor.length === 0 && (
                <p className="text-sm text-gray-600 italic">No armor matches your search.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Gear & Packs tab */}
      {activeTab === "gear" && (
        <div className="flex flex-col gap-4">
          <div>
            <h4
              className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Adventuring Packs
            </h4>
            <p className="text-xs text-gray-500 mb-3">
              Choose one pack. Each contains a curated set of supplies.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ADVENTURING_PACKS.filter((p) =>
                tabSearch ? p.name.toLowerCase().includes(tabSearch.toLowerCase()) : true,
              ).map((pack) => (
                <PackCard
                  key={pack.name}
                  pack={pack}
                  selected={selectedPack === pack.name}
                  onToggle={() => togglePack(pack)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buy with Gold mode
// ---------------------------------------------------------------------------

type ShopTab = "weapons" | "armor" | "gear";

const SHOP_GEAR_ITEMS = [
  "Backpack",
  "Bedroll",
  "Hempen Rope (50 feet)",
  "Torch",
  "Rations",
  "Waterskin",
  "Tinderbox",
  "Lantern",
  "Oil (flask)",
  "Healer's Kit",
  "Thieves' Tools",
];

function GoldShopPanel() {
  const { state, dispatch } = useBuilder();
  const [shopTab, setShopTab] = useState<ShopTab>("weapons");
  const [goldInput, setGoldInput] = useState(String(state.startingGold ?? DEFAULT_STARTING_GOLD));
  const [shopSearch, setShopSearch] = useState("");

  const startingGold = state.startingGold ?? DEFAULT_STARTING_GOLD;

  // Compute spent gold
  const spentGold = useMemo(() => {
    return state.equipment.reduce((acc, item) => {
      // find matching base item to get cost
      const found = [...weaponsArray, ...armorArray].find((b) => b.name === item.name);
      if (found) return acc + itemCost(found);
      // gear items
      return acc + (GEAR_COSTS[item.name] ?? 0);
    }, 0);
  }, [state.equipment]);

  const remainingGold = startingGold - spentGold;

  // All equippable weapon items (no futuristic)
  const shopWeapons = useMemo(() => {
    const q = shopSearch.toLowerCase();
    return weaponsArray
      .filter((w) => isWeapon(w) && isStandardWeapon(w) && w.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.weaponCategory !== b.weaponCategory) return a.weaponCategory === "simple" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [shopSearch]);

  const shopArmor = useMemo(() => {
    const q = shopSearch.toLowerCase();
    return armorArray
      .filter((a) => a.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const order = { LA: 0, MA: 1, HA: 2, S: 3 };
        const aO = order[typeCode(a.type) as keyof typeof order] ?? 9;
        const bO = order[typeCode(b.type) as keyof typeof order] ?? 9;
        if (aO !== bO) return aO - bO;
        return a.name.localeCompare(b.name);
      });
  }, [shopSearch]);

  const shopGearItems = useMemo(() => {
    const q = shopSearch.toLowerCase();
    return SHOP_GEAR_ITEMS.filter((name) => name.toLowerCase().includes(q)).map((name) => ({
      name,
      type: "OTH" as const,
      weight: undefined as number | undefined,
    }));
  }, [shopSearch]);

  const cartNames = useMemo(() => new Set(state.equipment.map((e) => e.name)), [state.equipment]);

  function handleGoldChange(val: string) {
    setGoldInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0) {
      dispatch({ type: "SET_STARTING_GOLD", gold: n });
    }
  }

  function addItem(item: BaseItemDb) {
    const cost = itemCost(item);
    if (cost > remainingGold) return;
    dispatch({ type: "ADD_EQUIPMENT", item: baseItemToInventoryItem(item, false) });
  }

  function removeItem(name: string) {
    const idx = state.equipment.findIndex((e) => e.name === name);
    if (idx !== -1) dispatch({ type: "REMOVE_EQUIPMENT", index: idx });
  }

  function addGearItem(name: string) {
    const cost = GEAR_COSTS[name] ?? 0;
    if (cost > remainingGold) return;
    dispatch({
      type: "ADD_EQUIPMENT",
      item: { name, equipped: false, quantity: 1, type: "Gear" },
    });
  }

  const tabs: { id: ShopTab; label: string }[] = [
    { id: "weapons", label: "Weapons" },
    { id: "armor", label: "Armor" },
    { id: "gear", label: "Gear" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Gold budget row */}
      <div className="flex items-center gap-4 p-4 rounded-lg bg-yellow-900/10 border border-yellow-700/20">
        <div className="flex flex-col gap-1">
          <label htmlFor="starting-gold" className="text-xs text-gray-400 font-medium">
            Starting Gold (gp)
          </label>
          <input
            id="starting-gold"
            type="number"
            min={0}
            value={goldInput}
            onChange={(e) => handleGoldChange(e.target.value)}
            className="w-24 bg-gray-800/60 border border-gray-700/40 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        <div className="flex-1" />

        <div className="text-right">
          <div className="text-xs text-gray-500 mb-0.5">Spent</div>
          <div className="text-base font-mono text-amber-400">{spentGold} gp</div>
        </div>

        <div className="text-right">
          <div className="text-xs text-gray-500 mb-0.5">Remaining</div>
          <div
            className={[
              "text-base font-mono font-semibold",
              remainingGold < 0 ? "text-red-400" : "text-emerald-400",
            ].join(" ")}
          >
            {remainingGold} gp
          </div>
        </div>
      </div>

      {/* Persistent equipment chip panel */}
      <EquipmentChipPanel
        equipment={state.equipment}
        onRemove={(i) => dispatch({ type: "REMOVE_EQUIPMENT", index: i })}
        goldInfo={{ remaining: remainingGold }}
      />

      {/* Shop tabs */}
      <div className="flex gap-1 p-1 bg-gray-900/60 rounded-lg border border-gray-700/30 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setShopTab(tab.id);
              setShopSearch("");
            }}
            aria-selected={shopTab === tab.id}
            className={[
              "px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150",
              shopTab === tab.id
                ? "bg-amber-500/20 text-amber-200 border border-amber-500/30"
                : "text-gray-400 hover:text-gray-200",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="search"
        value={shopSearch}
        onChange={(e) => setShopSearch(e.target.value)}
        placeholder={`Search ${shopTab}...`}
        aria-label={`Search ${shopTab}`}
        className="w-full bg-gray-800/60 border border-gray-700/40 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
      />

      {/* Item list */}
      <div className="flex flex-col gap-1.5">
        {shopTab === "weapons" &&
          shopWeapons.map((w) => (
            <ShopItemRow
              key={w.name}
              item={w}
              inCart={cartNames.has(w.name)}
              canAfford={itemCost(w) <= remainingGold}
              goldCost={itemCost(w)}
              onAdd={() => addItem(w)}
              onRemove={() => removeItem(w.name)}
            />
          ))}

        {shopTab === "armor" &&
          shopArmor.map((a) => (
            <ShopItemRow
              key={a.name}
              item={a}
              inCart={cartNames.has(a.name)}
              canAfford={itemCost(a) <= remainingGold}
              goldCost={itemCost(a)}
              onAdd={() => addItem(a)}
              onRemove={() => removeItem(a.name)}
            />
          ))}

        {shopTab === "gear" &&
          shopGearItems.map((g) => {
            const cost = GEAR_COSTS[g.name] ?? 0;
            const inCart = cartNames.has(g.name);
            const canAfford = cost <= remainingGold;
            // Gear items are simple objects not in BaseItemDb, so build a compatible shape
            const fakeItem: BaseItemDb = {
              name: g.name,
              type: "OTH",
            };
            return (
              <ShopItemRow
                key={g.name}
                item={fakeItem}
                inCart={inCart}
                canAfford={canAfford}
                goldCost={cost}
                onAdd={() => addGearItem(g.name)}
                onRemove={() => removeItem(g.name)}
              />
            );
          })}

        {shopTab === "weapons" && shopWeapons.length === 0 && (
          <p className="text-sm text-gray-600 italic">No weapons match.</p>
        )}
        {shopTab === "armor" && shopArmor.length === 0 && (
          <p className="text-sm text-gray-600 italic">No armor matches.</p>
        )}
        {shopTab === "gear" && shopGearItems.length === 0 && (
          <p className="text-sm text-gray-600 italic">No gear matches.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EquipmentStep (root)
// ---------------------------------------------------------------------------

export function EquipmentStep() {
  const { state, dispatch } = useBuilder();

  const mode = state.equipmentMode ?? "starting";

  return (
    <section aria-labelledby="equipment-step-heading" className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div>
        <h1
          id="equipment-step-heading"
          className="text-xl font-[family-name:var(--font-cinzel)] text-amber-200/90 mb-1"
        >
          Choose Your Equipment
        </h1>
        <p className="text-sm text-gray-400">
          Equip your character with weapons, armor, and supplies before setting out on your
          adventure.
        </p>
      </div>

      {/* ── Mode selector ── */}
      <div
        role="radiogroup"
        aria-label="Equipment acquisition method"
        className="flex gap-2 p-1 bg-gray-900/60 rounded-xl border border-gray-700/30 w-fit"
      >
        {(
          [
            { value: "starting", label: "Starting Equipment" },
            { value: "gold", label: "Buy with Gold" },
          ] as const
        ).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => dispatch({ type: "SET_EQUIPMENT_MODE", mode: value })}
            className={[
              "px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
              mode === value
                ? "bg-amber-500/20 text-amber-200 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.08)]"
                : "text-gray-400 hover:text-gray-200",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Mode panels ── */}
      {mode === "starting" ? <StartingEquipmentPanel /> : <GoldShopPanel />}
    </section>
  );
}
