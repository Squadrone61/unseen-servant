/**
 * migrate-weapons-action.ts
 *
 * One-shot migration: populates EntityEffects.action on every weapon entry in
 * packages/shared/src/data/items/weapons.json, and adds effects.modifiers for
 * magic weapon entries with a +N bonus in packages/shared/src/data/items/magic.json.
 *
 * Armor entries (armor.json) carry no action — all intrinsics (baseAc, dexCap,
 * strReq, stealthDisadvantage) are already computable by enrichItem() from the
 * existing `type`, `ac`, `stealth`, and `strength` fields on BaseItemDb. No JSON
 * change is made to armor entries.
 *
 * Weapon classification:
 *   - Type prefix "M" (from "M|XPHB") → melee weapon, attack.bonus = "weapon_melee"
 *   - Type prefix "R" (from "R|XPHB") → ranged weapon, attack.bonus = "weapon_ranged"
 *   - Reach (property "R") → adds reach: 10 to attack descriptor (standard 5ft otherwise)
 *   - Versatile (property "V") → base onHit uses primary damage dice; note added for two-handed damage
 *   - Thrown (property "T") → range populated even for melee weapons (thrown range)
 *   - The `damage` and `damageType` on the JSON entry remain untouched; onHit.damage mirrors them.
 *
 * Magic items:
 *   - Entries whose name matches /\+(\d) .+/ and whose type is "M|XPHB", "Melee Weapon",
 *     "Ranged Weapon", or "R|XPHB" receive effects.modifiers for attack_melee/ranged + damage.
 *   - Entries with "Ranged" in name or type get "attack_ranged" modifier; otherwise "attack_melee".
 *   - Existing effects (e.g. Amulet of Health modifier) are never disturbed.
 *   - Named special weapons (type "M|XPHB" without a +N pattern) are NOT modified — their
 *     mechanics are complex, bespoke, and covered by their description text.
 *
 * Run: npx tsx scripts/migrate-weapons-action.ts
 * Report: .testing/migration-report-weapons.md (gitignored)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEAPONS_PATH = join(
  __dirname,
  "..",
  "packages",
  "shared",
  "src",
  "data",
  "items",
  "weapons.json",
);
const MAGIC_PATH = join(
  __dirname,
  "..",
  "packages",
  "shared",
  "src",
  "data",
  "items",
  "magic.json",
);
const REPORT_PATH = join(__dirname, "..", ".testing", "migration-report-weapons.md");

// ---------------------------------------------------------------------------
// Inline type declarations (mirrors packages/shared/src/types/effects.ts)
// Re-declared to avoid tsconfig path resolution complexity in scripts.
// ---------------------------------------------------------------------------

type DamageType =
  | "acid"
  | "bludgeoning"
  | "cold"
  | "fire"
  | "force"
  | "lightning"
  | "necrotic"
  | "piercing"
  | "poison"
  | "psychic"
  | "radiant"
  | "slashing"
  | "thunder";

interface ActionOutcome {
  damage?: Array<{ dice: string; type: DamageType }>;
  note?: string;
}

interface ActionEffect {
  kind: "attack" | "save" | "auto";
  attack?: {
    bonus: "weapon_melee" | "weapon_ranged";
    range?: { normal: number; long?: number };
    reach?: number;
  };
  onHit?: ActionOutcome;
}

interface Modifier {
  target: string;
  value: number | string;
  operation?: "add" | "set";
  condition?: string;
}

interface EntityEffects {
  modifiers?: Modifier[];
  properties?: unknown[];
  action?: ActionEffect;
}

// ---------------------------------------------------------------------------
// Weapon JSON entry shape (subset)
// ---------------------------------------------------------------------------

interface WeaponEntry {
  name: string;
  type: string;
  weapon?: boolean;
  weaponCategory?: string;
  damage?: string;
  damageType?: DamageType;
  versatileDamage?: string;
  properties?: string[];
  range?: string;
  weight?: number;
  mastery?: string[];
  effects?: EntityEffects;
}

interface MagicItemEntry {
  name: string;
  type: string;
  description?: string;
  rarity?: string;
  attunement?: boolean | string;
  charges?: number;
  recharge?: string;
  attachedSpells?: string[];
  effects?: EntityEffects;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "normal/long" range string into { normal, long? }. Returns undefined for non-numeric. */
function parseRange(rangeStr: string | undefined): { normal: number; long?: number } | undefined {
  if (!rangeStr) return undefined;
  const parts = rangeStr.split("/");
  if (parts.length < 1) return undefined;
  const normal = parseInt(parts[0], 10);
  if (isNaN(normal)) return undefined;
  if (parts.length === 2) {
    const long = parseInt(parts[1], 10);
    return { normal, long: isNaN(long) ? undefined : long };
  }
  return { normal };
}

/** Get the type prefix (strip source tag like "|XPHB"). */
function typePrefix(typeStr: string): string {
  return typeStr.split("|")[0];
}

/** Extract +N bonus from a magic item name like "+1 Moon Sickle" → 1. Returns null if not found. */
function extractBonus(name: string): number | null {
  const m = name.match(/^\+(\d)/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

/** Check if a magic item type indicates a ranged weapon. */
function isMagicRangedWeapon(entry: MagicItemEntry): boolean {
  const tp = typePrefix(entry.type);
  if (tp === "R") return true;
  if (entry.type === "Ranged Weapon") return true;
  return false;
}

/** Check if a magic item type indicates a melee or generic weapon (M|XPHB, Melee Weapon). */
function isMagicMeleeWeapon(entry: MagicItemEntry): boolean {
  const tp = typePrefix(entry.type);
  if (tp === "M") return true;
  if (entry.type === "Melee Weapon") return true;
  return false;
}

/** Validate that a string is a known DamageType. */
const DAMAGE_TYPES = new Set<DamageType>([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);

function isDamageType(s: string): s is DamageType {
  return DAMAGE_TYPES.has(s as DamageType);
}

// ---------------------------------------------------------------------------
// Weapon migration
// ---------------------------------------------------------------------------

function migrateWeapon(entry: WeaponEntry): {
  action: ActionEffect | null;
  skipped: boolean;
  reason?: string;
} {
  if (!entry.weapon) {
    return { action: null, skipped: true, reason: "not a weapon entry" };
  }

  if (!entry.damage || !entry.damageType) {
    return { action: null, skipped: true, reason: "missing damage or damageType" };
  }

  if (!isDamageType(entry.damageType)) {
    return { action: null, skipped: true, reason: `unrecognized damageType: ${entry.damageType}` };
  }

  const tp = typePrefix(entry.type);
  const isRanged = tp === "R";
  const isMelee = tp === "M";

  if (!isRanged && !isMelee) {
    return { action: null, skipped: true, reason: `unrecognized type prefix: ${tp}` };
  }

  const props = entry.properties ?? [];
  const hasReach = props.includes("R");
  const hasThrown = props.includes("T");
  const hasVersatile = props.includes("V");

  // Determine attack bonus type
  // - Ranged weapons (type "R|XPHB") use "weapon_ranged" regardless of Thrown property.
  //   (Dart is R|XPHB with Thrown — still ranged.)
  // - Melee weapons (type "M|XPHB") with Thrown property (Dagger, Handaxe, Javelin, etc.)
  //   use "weapon_melee" — their primary attack mode is melee. The thrown range is also
  //   populated so the DM can resolve thrown attacks against the melee modifier.
  const attackBonus: "weapon_melee" | "weapon_ranged" = isRanged ? "weapon_ranged" : "weapon_melee";

  // Range: present on all ranged weapons AND melee weapons with Thrown property
  const attackRange = isRanged || (isMelee && hasThrown) ? parseRange(entry.range) : undefined;

  // Reach: 10 ft for weapons with the Reach property
  const reach = hasReach ? 10 : undefined;

  const attackDescriptor: ActionEffect["attack"] = {
    bonus: attackBonus,
    ...(attackRange !== undefined ? { range: attackRange } : {}),
    ...(reach !== undefined ? { reach } : {}),
  };

  // Build onHit outcome
  const damageEntries: Array<{ dice: string; type: DamageType }> = [
    { dice: entry.damage, type: entry.damageType as DamageType },
  ];

  // Blowgun has damage "1" (not a die expression) — treat as "1" flat
  // Keep as-is: the dice field accepts any notation the dice engine understands.

  const onHit: ActionOutcome = { damage: damageEntries };

  // Versatile note
  if (hasVersatile && entry.versatileDamage) {
    onHit.note = `Versatile: ${entry.versatileDamage} two-handed`;
  }

  const action: ActionEffect = {
    kind: "attack",
    attack: attackDescriptor,
    onHit,
  };

  return { action, skipped: false };
}

// ---------------------------------------------------------------------------
// Magic item migration — +N weapon modifiers
// ---------------------------------------------------------------------------

function migrateMagicWeapon(entry: MagicItemEntry): {
  modifiers: Modifier[] | null;
  skipped: boolean;
  reason?: string;
} {
  const bonus = extractBonus(entry.name);
  if (bonus === null) {
    return { modifiers: null, skipped: true, reason: "no +N bonus in name" };
  }

  const ranged = isMagicRangedWeapon(entry);
  const melee = isMagicMeleeWeapon(entry);

  if (!melee && !ranged) {
    return { modifiers: null, skipped: true, reason: "type is not a weapon" };
  }

  const attackTarget = ranged ? "attack_ranged" : "attack_melee";
  const damageTarget = ranged ? "damage_ranged" : "damage_melee";
  const condition = "while wielding";

  const modifiers: Modifier[] = [
    { target: attackTarget, value: bonus, condition },
    { target: damageTarget, value: bonus, condition },
  ];

  return { modifiers, skipped: false };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  // ── weapons.json ──────────────────────────────────────────────────────────

  const weaponsRaw = readFileSync(WEAPONS_PATH, "utf-8");
  const weapons = JSON.parse(weaponsRaw) as WeaponEntry[];

  let weaponsMigrated = 0;
  let weaponsSkipped = 0;
  let weaponsAlreadyDone = 0;
  const weaponSkipLog: string[] = [];
  const weaponErrorLog: string[] = [];

  for (const entry of weapons) {
    // Skip if already migrated (idempotent)
    if (entry.effects?.action) {
      weaponsAlreadyDone++;
      continue;
    }

    const result = migrateWeapon(entry);
    if (result.skipped) {
      weaponsSkipped++;
      weaponSkipLog.push(`  SKIP  ${entry.name}: ${result.reason ?? "unknown"}`);
      continue;
    }

    if (!result.action) {
      weaponErrorLog.push(`  ERROR ${entry.name}: migration returned null action`);
      continue;
    }

    if (!entry.effects) {
      (entry as WeaponEntry & { effects: EntityEffects }).effects = { action: result.action };
    } else {
      entry.effects.action = result.action;
    }
    weaponsMigrated++;
  }

  writeFileSync(WEAPONS_PATH, JSON.stringify(weapons, null, 2) + "\n", "utf-8");

  // ── magic.json ────────────────────────────────────────────────────────────

  const magicRaw = readFileSync(MAGIC_PATH, "utf-8");
  const magicItems = JSON.parse(magicRaw) as MagicItemEntry[];

  let magicMigrated = 0;
  let magicSkipped = 0;
  let magicAlreadyDone = 0;
  const magicSkipLog: string[] = [];

  for (const entry of magicItems) {
    // Only process weapon-type entries with +N bonus
    const bonus = extractBonus(entry.name);
    if (bonus === null) {
      // Not a +N weapon — skip silently (vast majority of magic items)
      continue;
    }

    const ranged = isMagicRangedWeapon(entry);
    const melee = isMagicMeleeWeapon(entry);

    if (!melee && !ranged) {
      // +N item that is not a weapon (spellcasting focuses, etc.) — skip silently
      continue;
    }

    // Check if already has matching modifiers
    const existingModifiers = entry.effects?.modifiers ?? [];
    const hasAttackModifier = existingModifiers.some(
      (m) => m.target === "attack_melee" || m.target === "attack_ranged",
    );
    if (hasAttackModifier) {
      magicAlreadyDone++;
      continue;
    }

    const result = migrateMagicWeapon(entry);
    if (result.skipped) {
      magicSkipped++;
      magicSkipLog.push(`  SKIP  ${entry.name}: ${result.reason ?? "unknown"}`);
      continue;
    }

    if (!result.modifiers) {
      continue;
    }

    if (!entry.effects) {
      (entry as MagicItemEntry & { effects: EntityEffects }).effects = {
        modifiers: result.modifiers,
      };
    } else if (!entry.effects.modifiers) {
      entry.effects.modifiers = result.modifiers;
    } else {
      // Prepend new modifiers (existing ones might be for spell attacks etc.)
      entry.effects.modifiers = [...result.modifiers, ...entry.effects.modifiers];
    }
    magicMigrated++;
  }

  writeFileSync(MAGIC_PATH, JSON.stringify(magicItems, null, 2) + "\n", "utf-8");

  // ── Report ────────────────────────────────────────────────────────────────

  mkdirSync(join(__dirname, "..", ".testing"), { recursive: true });

  const lines: string[] = [
    "# Weapon/Magic Migration Report",
    "",
    "## weapons.json",
    `- Total entries:       ${weapons.length}`,
    `- Newly migrated:      ${weaponsMigrated}`,
    `- Already done:        ${weaponsAlreadyDone}`,
    `- Skipped:             ${weaponsSkipped}`,
    "",
  ];

  if (weaponSkipLog.length > 0) {
    lines.push("### Skipped weapons");
    lines.push(...weaponSkipLog);
    lines.push("");
  }
  if (weaponErrorLog.length > 0) {
    lines.push("### Errors");
    lines.push(...weaponErrorLog);
    lines.push("");
  }

  lines.push(
    "## magic.json (+N weapon entries only)",
    `- Newly migrated:      ${magicMigrated}`,
    `- Already done:        ${magicAlreadyDone}`,
    `- Skipped:             ${magicSkipped}`,
    "",
  );

  if (magicSkipLog.length > 0) {
    lines.push("### Skipped magic items");
    lines.push(...magicSkipLog);
    lines.push("");
  }

  lines.push(
    "## Notes",
    "- Armor entries (armor.json) carry no action. All intrinsics (baseAc, dexCap,",
    "  strReq, stealthDisadvantage) are already computed dynamically by enrichItem()",
    "  from existing `type`, `ac`, `stealth`, and `strength` fields.",
    "- Named magic weapons without +N (Sun Blade, Flame Tongue, etc.) are not",
    "  modified here — their mechanics are complex and described in prose text.",
    "- Magic items with +N bonus but non-weapon types (focuses, drums, etc.) are",
    "  skipped — their modifiers are on spell_attack/spell_save_dc, not attack/damage.",
  );

  writeFileSync(REPORT_PATH, lines.join("\n") + "\n", "utf-8");

  console.log("\nWeapon/Magic Migration Complete");
  console.log("================================");
  console.log(
    `weapons.json: ${weaponsMigrated} migrated, ${weaponsSkipped} skipped, ${weaponsAlreadyDone} already done`,
  );
  console.log(
    `magic.json:   ${magicMigrated} migrated, ${magicSkipped} skipped, ${magicAlreadyDone} already done`,
  );
  console.log(`Report:       .testing/migration-report-weapons.md`);

  if (weaponErrorLog.length > 0) {
    console.error(`\nERRORS (${weaponErrorLog.length}):`);
    for (const e of weaponErrorLog) console.error(e);
    process.exit(1);
  }
}

main();
