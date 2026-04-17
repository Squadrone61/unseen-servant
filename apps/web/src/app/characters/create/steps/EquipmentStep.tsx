"use client";

import { useMemo, useState } from "react";
import {
  weaponsArray,
  armorArray,
  classesArray,
  packsArray,
  getBaseItem,
} from "@unseen-servant/shared/data";
import type { BaseItemDb, PackDb } from "@unseen-servant/shared/types";
import type { Item } from "@unseen-servant/shared/types";
import { useBuilder } from "../BuilderContext";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

/** Derive a human-readable description from structured pack contents. */
function packDescription(pack: PackDb): string {
  return pack.contents.map((c) => (c.quantity > 1 ? `${c.quantity} ${c.item}` : c.item)).join(", ");
}

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

function _isArmor(item: BaseItemDb): boolean {
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
// Weapon / Armor proficiency — multi-class aware
// ---------------------------------------------------------------------------

/**
 * Compute the highest weapon proficiency level across all classes.
 * "martial" > "simple" > "none"
 */
/** Extract weapon and armor proficiency strings from class effects (L1 feature or class-level). */
function getClassWeaponArmorProfs(cls: {
  features: {
    name: string;
    level: number;
    effects?: { properties?: Array<{ type: string; category?: string; value?: string }> };
  }[];
  effects?: { properties?: Array<{ type: string; category?: string; value?: string }> };
}): { weapons: string[]; armor: string[] } {
  const l1Feat = cls.features.find((f) => f.name === "Proficiencies" && f.level === 1);
  const props = l1Feat?.effects?.properties ?? cls.effects?.properties ?? [];
  const weapons: string[] = [];
  const armor: string[] = [];
  for (const p of props) {
    if (p.type !== "proficiency") continue;
    if (p.category === "weapon" && p.value) weapons.push(p.value);
    if (p.category === "armor" && p.value) armor.push(p.value);
  }
  return { weapons, armor };
}

function weaponProficiencyLevelForClasses(classNames: string[]): "none" | "simple" | "martial" {
  let best: "none" | "simple" | "martial" = "none";
  for (const className of classNames) {
    if (best === "martial") break; // can't go higher
    const cls = classesArray.find((c) => c.name === className);
    if (!cls) continue;
    const { weapons } = getClassWeaponArmorProfs(cls);
    const hasMartial = weapons.some((p) => p.toLowerCase().includes("martial"));
    const hasSimple = weapons.some((p) => p.toLowerCase().includes("simple"));
    if (hasMartial) {
      best = "martial";
    } else if (hasSimple && best === "none") {
      best = "simple";
    }
  }
  return best;
}

/**
 * Return the union of allowed armor type codes across all classes.
 */
function classArmorTypesForClasses(classNames: string[]): Set<string> {
  const allowed = new Set<string>();
  for (const className of classNames) {
    const cls = classesArray.find((c) => c.name === className);
    if (!cls) continue;
    const { armor } = getClassWeaponArmorProfs(cls);
    for (const p of armor) {
      const lower = p.toLowerCase();
      if (lower.includes("light")) allowed.add("LA");
      if (lower.includes("medium")) allowed.add("MA");
      if (lower.includes("heavy")) allowed.add("HA");
    }
  }
  return allowed;
}

/**
 * Return true if any class grants shield proficiency.
 */
function classHasShieldProfForClasses(classNames: string[]): boolean {
  for (const className of classNames) {
    const cls = classesArray.find((c) => c.name === className);
    if (!cls) continue;
    const { armor } = getClassWeaponArmorProfs(cls);
    if (armor.some((p) => p.toLowerCase().includes("shield"))) return true;
  }
  return false;
}

/**
 * Return true if the character is proficient with the given weapon or armor item.
 */
function isItemProficient(
  item: BaseItemDb,
  weaponProf: "none" | "simple" | "martial",
  allowedArmorTypes: Set<string>,
  hasShieldProf: boolean,
): boolean {
  const tc = typeCode(item.type);
  if (item.weapon) {
    if (weaponProf === "martial") return true;
    if (weaponProf === "simple") return item.weaponCategory === "simple";
    return false;
  }
  if (tc === "S") return hasShieldProf;
  if (item.armor) return allowedArmorTypes.has(tc);
  return true; // gear items have no proficiency requirement
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
// Item factory — converts BaseItemDb into the unified Item shape
// ---------------------------------------------------------------------------

function baseItemToItem(dbItem: BaseItemDb, equipped = false): Item {
  const tc = typeCode(dbItem.type);

  const result: Item = {
    name: dbItem.name,
    equipped,
    quantity: 1,
    ...(dbItem.description ? { description: dbItem.description } : {}),
    ...(dbItem.weight !== undefined ? { weight: dbItem.weight } : {}),
  };

  if (dbItem.weapon && dbItem.damage && dbItem.damageType) {
    const masteryName = dbItem.mastery?.[0];
    result.weapon = {
      damage: dbItem.damage,
      damageType: dbItem.damageType,
      ...(dbItem.properties?.length
        ? { properties: dbItem.properties.map((p) => PROP_LABELS[p] ?? p) }
        : {}),
      ...(masteryName ? { mastery: masteryName } : {}),
      ...(dbItem.range !== undefined ? { range: dbItem.range } : {}),
      ...(dbItem.versatileDamage !== undefined ? { versatile: dbItem.versatileDamage } : {}),
    };
  } else if (dbItem.armor && dbItem.ac != null) {
    const typePrefix = tc;
    let armorType: "light" | "medium" | "heavy" | "shield";
    switch (typePrefix) {
      case "LA":
        armorType = "light";
        break;
      case "MA":
        armorType = "medium";
        break;
      case "HA":
        armorType = "heavy";
        break;
      default:
        armorType = "light";
    }
    result.armor = {
      type: armorType,
      baseAc: dbItem.ac,
      ...(typePrefix === "MA" ? { dexCap: 2 } : {}),
      ...(dbItem.strength ? { strReq: parseInt(dbItem.strength, 10) || undefined } : {}),
      ...(dbItem.stealth ? { stealthDisadvantage: true } : {}),
    };
  } else if (tc === "S" && dbItem.ac != null) {
    result.armor = {
      type: "shield",
      baseAc: dbItem.ac,
    };
  }

  return result;
}

function packToItems(pack: PackDb): Item[] {
  return pack.contents.map(({ item, quantity }) => {
    const gearItem = getBaseItem(item);
    return {
      name: item,
      equipped: false,
      quantity,
      ...(gearItem?.weight !== undefined ? { weight: gearItem.weight } : {}),
      ...(gearItem?.description ? { description: gearItem.description } : {}),
      fromPack: pack.name,
    } as Item;
  });
}

// ---------------------------------------------------------------------------
// Item card (weapon/armor)
// ---------------------------------------------------------------------------

interface ItemCardProps {
  item: BaseItemDb;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** When true the item is shown dimmed with a "Not proficient" label */
  notProficient?: boolean;
}

function WeaponCard({ item, selected, onToggle, disabled, notProficient }: ItemCardProps) {
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
            : notProficient
              ? "border-gray-700/20 bg-gray-900/20 opacity-50"
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
        <div className="flex shrink-0 items-center gap-1.5">
          {notProficient && (
            <span className="rounded border border-red-700/20 bg-red-900/20 px-1.5 py-0.5 text-xs leading-tight text-red-400/80">
              Not proficient
            </span>
          )}
          {item.damage && (
            <span className="rounded border border-amber-700/20 bg-amber-900/20 px-1.5 py-0.5 font-mono text-xs leading-tight text-amber-400/80">
              {item.damage} {item.damageType}
            </span>
          )}
          {item.mastery?.[0] && (
            <span className="rounded border border-violet-700/20 bg-violet-900/20 px-1.5 py-0.5 text-xs leading-tight text-violet-400/80">
              {item.mastery[0]}
            </span>
          )}
        </div>
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

function ArmorCard({ item, selected, onToggle, disabled, notProficient }: ItemCardProps) {
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
            : notProficient
              ? "border-gray-700/20 bg-gray-900/20 opacity-50"
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
        <div className="flex shrink-0 items-center gap-1.5">
          {notProficient && (
            <span className="rounded border border-red-700/20 bg-red-900/20 px-1.5 py-0.5 text-xs leading-tight text-red-400/80">
              Not proficient
            </span>
          )}
          <span className="rounded border border-sky-700/20 bg-sky-900/20 px-1.5 py-0.5 font-mono text-xs leading-tight text-sky-400/80">
            AC {item.ac ?? (typeCode(item.type) === "S" ? "+2" : "?")}
          </span>
        </div>
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
  pack: PackDb;
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
      <p className="mt-0.5 text-xs leading-snug text-gray-500">{packDescription(pack)}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Equipment chip panel — always-visible "Your Equipment" summary at top
// ---------------------------------------------------------------------------

interface EquipmentChipPanelProps {
  equipment: Item[];
  onRemove: (index: number) => void;
  onToggleEquipped: (index: number) => void;
  onAddCustom: (item: Item) => void;
}

function EquipmentChipPanel({
  equipment,
  onRemove,
  onToggleEquipped,
  onAddCustom,
}: EquipmentChipPanelProps) {
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty] = useState(1);

  function handleAddCustom() {
    const name = customName.trim();
    if (!name) return;
    onAddCustom({
      name,
      quantity: Math.max(1, customQty),
      equipped: false,
    });
    setCustomName("");
    setCustomQty(1);
  }

  return (
    <div className="rounded-lg border border-gray-700/30 bg-gray-900/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          className="text-sm font-semibold tracking-wider text-amber-400/90 uppercase"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          Your Equipment
        </h3>
      </div>

      {equipment.length === 0 ? (
        <p className="mb-3 text-sm text-gray-600 italic">No equipment selected yet.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1.5">
          {equipment.map((item, i) => (
            <li
              key={`${item.name}-${i}`}
              className="flex items-center gap-2 rounded-md border border-gray-700/40 bg-gray-800/50 px-2.5 py-1.5"
            >
              <span className="flex-1 truncate text-sm text-gray-200">
                {item.name}
                {item.quantity > 1 && (
                  <span className="ml-1 text-gray-500">&times;{item.quantity}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onToggleEquipped(i)}
                aria-pressed={item.equipped}
                aria-label={item.equipped ? `Unequip ${item.name}` : `Equip ${item.name}`}
                className={[
                  "text-xs px-2 py-0.5 rounded-full border transition-colors",
                  item.equipped
                    ? "border-emerald-500/40 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/30"
                    : "border-gray-600/40 bg-gray-800/60 text-gray-400 hover:text-gray-200",
                ].join(" ")}
              >
                {item.equipped ? "Equipped" : "Unequipped"}
              </button>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${item.name}`}
                className="px-1 leading-none text-gray-500 transition-colors hover:text-red-400 focus:outline-none"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Custom item input */}
      <div className="flex items-end gap-2 border-t border-gray-700/30 pt-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs tracking-wider text-gray-500 uppercase">
            Add custom item
          </span>
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCustom();
              }
            }}
            placeholder="e.g. Journal, Lucky coin..."
            className="w-full rounded border border-gray-700/40 bg-gray-800/60 px-2 py-1 text-sm text-gray-200 placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
          />
        </label>
        <label className="w-16">
          <span className="mb-1 block text-xs tracking-wider text-gray-500 uppercase">Qty</span>
          <input
            type="number"
            min={1}
            value={customQty}
            onChange={(e) => setCustomQty(parseInt(e.target.value || "1", 10))}
            className="w-full rounded border border-gray-700/40 bg-gray-800/60 px-2 py-1 text-sm text-gray-200 focus:border-amber-500/50 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={handleAddCustom}
          disabled={!customName.trim()}
          className="rounded border border-amber-500/40 bg-amber-900/20 px-3 py-1 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-900/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </div>
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
  // Default ON for starting mode — only show proficient items by default
  const [showOnlyProficient, setShowOnlyProficient] = useState(true);

  // Compute proficiency levels across all classes
  const classNames = useMemo(() => state.classes.map((c) => c.name), [state.classes]);
  const weaponProf = useMemo(() => weaponProficiencyLevelForClasses(classNames), [classNames]);
  const allowedArmorTypes = useMemo(() => classArmorTypesForClasses(classNames), [classNames]);
  const hasShieldProf = useMemo(() => classHasShieldProfForClasses(classNames), [classNames]);

  // All standard weapons, with proficiency flag
  const allWeapons = useMemo(() => {
    const q = tabSearch.toLowerCase();
    return weaponsArray
      .filter((w) => isWeapon(w) && isStandardWeapon(w) && w.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.weaponCategory !== b.weaponCategory) {
          return a.weaponCategory === "simple" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  }, [tabSearch]);

  // All armor items, with proficiency flag
  const allArmor = useMemo(() => {
    const q = tabSearch.toLowerCase();
    return armorArray
      .filter((a) => a.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const order = { LA: 0, MA: 1, HA: 2, S: 3 };
        const aOrder = order[typeCode(a.type) as keyof typeof order] ?? 9;
        const bOrder = order[typeCode(b.type) as keyof typeof order] ?? 9;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      });
  }, [tabSearch]);

  // Proficiency gate — filter if toggle is on
  const filteredWeapons = useMemo(() => {
    if (weaponProf === "none") return [];
    if (showOnlyProficient) {
      return allWeapons.filter((w) =>
        isItemProficient(w, weaponProf, allowedArmorTypes, hasShieldProf),
      );
    }
    return allWeapons;
  }, [allWeapons, weaponProf, allowedArmorTypes, hasShieldProf, showOnlyProficient]);

  const filteredArmor = useMemo(() => {
    if (showOnlyProficient) {
      return allArmor.filter((a) =>
        isItemProficient(a, weaponProf, allowedArmorTypes, hasShieldProf),
      );
    }
    return allArmor;
  }, [allArmor, weaponProf, allowedArmorTypes, hasShieldProf, showOnlyProficient]);

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
        item: baseItemToItem(item, equipOnAdd),
      });
    }
  }

  function togglePack(pack: PackDb) {
    if (selectedPack === pack.name) {
      dispatch({ type: "REMOVE_EQUIPMENT_BATCH", packName: pack.name });
      setSelectedPack(null);
    } else {
      if (selectedPack) {
        dispatch({ type: "REMOVE_EQUIPMENT_BATCH", packName: selectedPack });
      }
      dispatch({ type: "ADD_EQUIPMENT_BATCH", items: packToItems(pack) });
      setSelectedPack(pack.name);
    }
  }

  const hasNoClass = classNames.length === 0;
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
        onRemove={(i) => {
          const item = state.equipment[i];
          if (item?.fromPack && item.fromPack === selectedPack) {
            setSelectedPack(null);
          }
          dispatch({ type: "REMOVE_EQUIPMENT", index: i });
        }}
        onToggleEquipped={(i) => dispatch({ type: "TOGGLE_EQUIPPED", index: i })}
        onAddCustom={(item) => dispatch({ type: "ADD_EQUIPMENT", item })}
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

      {/* Search + proficiency filter row */}
      <div className="flex items-center gap-3">
        <input
          type="search"
          value={tabSearch}
          onChange={(e) => setTabSearch(e.target.value)}
          placeholder={`Search ${activeTab === "gear" ? "gear & packs" : activeTab}...`}
          aria-label={`Search ${activeTab}`}
          className="flex-1 rounded-lg border border-gray-700/40 bg-gray-800/60 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
        />
        {activeTab !== "gear" && (
          <label className="flex shrink-0 cursor-pointer items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={showOnlyProficient}
              onChange={(e) => setShowOnlyProficient(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded accent-amber-500"
            />
            <span className="text-xs text-gray-400">Proficient only</span>
          </label>
        )}
      </div>

      {/* Weapons tab */}
      {activeTab === "weapons" && (
        <div>
          {!hasWeapons ? (
            <p className="text-sm text-gray-600 italic">
              Your class does not grant weapon proficiencies. Select a class to unlock weapons.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-gray-500">
                {weaponProf === "martial"
                  ? "You are proficient with simple and martial weapons."
                  : "You are proficient with simple weapons."}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {filteredWeapons.map((w) => (
                  <WeaponCard
                    key={w.name}
                    item={w}
                    selected={selectedNames.has(w.name)}
                    onToggle={() => toggleItem(w, true)}
                    notProficient={
                      !showOnlyProficient &&
                      !isItemProficient(w, weaponProf, allowedArmorTypes, hasShieldProf)
                    }
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
          {!hasArmor && showOnlyProficient ? (
            <p className="text-sm text-gray-600 italic">
              Your class does not grant armor proficiencies. Select a class to unlock armor.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-gray-500">
                Select the armor and shield you start with.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {filteredArmor.map((a) => (
                  <ArmorCard
                    key={a.name}
                    item={a}
                    selected={selectedNames.has(a.name)}
                    onToggle={() => toggleItem(a, true)}
                    notProficient={
                      !showOnlyProficient &&
                      !isItemProficient(a, weaponProf, allowedArmorTypes, hasShieldProf)
                    }
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
              className="mb-2 text-xs font-medium tracking-wider text-gray-400 uppercase"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Adventuring Packs
            </h4>
            <p className="mb-3 text-xs text-gray-500">
              Choose one pack. Each contains a curated set of supplies.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {packsArray
                .filter((p) =>
                  tabSearch ? p.name.toLowerCase().includes(tabSearch.toLowerCase()) : true,
                )
                .map((pack) => (
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
// EquipmentStep (root)
// ---------------------------------------------------------------------------

export function EquipmentStep() {
  return (
    <section aria-labelledby="equipment-step-heading" className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div>
        <h1 id="equipment-step-heading" className="mb-1 font-cinzel text-xl text-amber-200/90">
          Choose Your Equipment
        </h1>
        <p className="text-sm text-gray-400">
          Equip your character with weapons, armor, and supplies before setting out on your
          adventure.
        </p>
      </div>

      <StartingEquipmentPanel />
    </section>
  );
}
