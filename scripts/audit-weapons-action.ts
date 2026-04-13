/**
 * audit-weapons-action.ts
 *
 * CI gate: iterates weapons.json, armor.json, and magic.json and asserts
 * that structured data is present where required.
 *
 * Rules:
 *   1. Every entry in weapons.json with `weapon: true` AND both `damage` +
 *      `damageType` fields must have `effects.action.kind === "attack"`.
 *   2. Every entry in armor.json with `armor: true` OR type prefix ∈
 *      {"LA","MA","HA","S"} must have `ac` populated (armor intrinsics are
 *      computed dynamically by enrichItem() from existing fields — no
 *      separate JSON `armorIntrinsics` object is required).
 *   3. Magic weapon entries (type "M|XPHB", "Melee Weapon", "R|XPHB",
 *      "Ranged Weapon") whose name starts with "+N " must have
 *      `effects.modifiers` containing an attack modifier (attack_melee or
 *      attack_ranged).
 *
 * Exits non-zero if any assertion fails.
 *
 * Run: npx tsx scripts/audit-weapons-action.ts
 * Or:  pnpm audit:actions   (runs both spell + weapon audits)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = join(__dirname, "..", "packages", "shared", "src", "data", "items");
const WEAPONS_PATH = join(BASE, "weapons.json");
const ARMOR_PATH = join(BASE, "armor.json");
const MAGIC_PATH = join(BASE, "magic.json");

// ---------------------------------------------------------------------------
// Entry interfaces (subset)
// ---------------------------------------------------------------------------

interface WeaponEntry {
  name: string;
  type: string;
  weapon?: boolean;
  damage?: string;
  damageType?: string;
  effects?: {
    action?: { kind?: string };
    modifiers?: unknown[];
    properties?: unknown[];
  };
}

interface ArmorEntry {
  name: string;
  type: string;
  armor?: boolean;
  ac?: number;
  effects?: unknown;
}

interface MagicItemEntry {
  name: string;
  type: string;
  effects?: {
    modifiers?: Array<{ target: string; value: unknown; condition?: string }>;
    properties?: unknown[];
    action?: unknown;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typePrefix(t: string): string {
  return t.split("|")[0];
}

function isMagicWeaponType(entry: MagicItemEntry): boolean {
  const tp = typePrefix(entry.type);
  return (
    tp === "M" || tp === "R" || entry.type === "Melee Weapon" || entry.type === "Ranged Weapon"
  );
}

function startsWithBonus(name: string): boolean {
  return /^\+\d /.test(name);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const failures: string[] = [];
  let checks = 0;
  let passed = 0;

  // ── 1. weapons.json ───────────────────────────────────────────────────────

  const weaponsRaw = readFileSync(WEAPONS_PATH, "utf-8");
  const weapons = JSON.parse(weaponsRaw) as WeaponEntry[];

  let weaponChecked = 0;
  let weaponPassed = 0;

  for (const w of weapons) {
    if (!w.weapon || !w.damage || !w.damageType) {
      // No weapon or no damage fields — not required to have action
      continue;
    }
    checks++;
    weaponChecked++;

    if (w.effects?.action?.kind === "attack") {
      passed++;
      weaponPassed++;
    } else {
      failures.push(`[weapons.json] ${w.name} — missing effects.action with kind:"attack"`);
    }
  }

  // ── 2. armor.json ─────────────────────────────────────────────────────────
  // Requirement: every armor/shield entry must have `ac` set (intrinsics computed
  // at runtime from `type`, `ac`, `stealth`, `strength` by enrichItem()).

  const armorRaw = readFileSync(ARMOR_PATH, "utf-8");
  const armorEntries = JSON.parse(armorRaw) as ArmorEntry[];
  const ARMOR_PREFIXES = new Set(["LA", "MA", "HA", "S"]);

  let armorChecked = 0;
  let armorPassed = 0;

  for (const a of armorEntries) {
    const tp = typePrefix(a.type);
    const isArmorEntry = a.armor === true || ARMOR_PREFIXES.has(tp);
    if (!isArmorEntry) continue;

    checks++;
    armorChecked++;

    if (typeof a.ac === "number") {
      passed++;
      armorPassed++;
    } else {
      failures.push(`[armor.json] ${a.name} — missing ac value`);
    }
  }

  // ── 3. magic.json — +N weapon modifiers ───────────────────────────────────

  const magicRaw = readFileSync(MAGIC_PATH, "utf-8");
  const magicItems = JSON.parse(magicRaw) as MagicItemEntry[];

  let magicChecked = 0;
  let magicPassed = 0;

  for (const m of magicItems) {
    if (!startsWithBonus(m.name) || !isMagicWeaponType(m)) continue;

    checks++;
    magicChecked++;

    const modifiers = m.effects?.modifiers ?? [];
    const hasAttackModifier = modifiers.some(
      (mod) => mod.target === "attack_melee" || mod.target === "attack_ranged",
    );

    if (hasAttackModifier) {
      passed++;
      magicPassed++;
    } else {
      failures.push(
        `[magic.json] ${m.name} (${m.type}) — missing attack modifier in effects.modifiers`,
      );
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\nWeapon/Armor Action Audit");
  console.log("=========================");
  console.log(`weapons.json:  ${weaponChecked} checked, ${weaponPassed} passed`);
  console.log(`armor.json:    ${armorChecked} checked, ${armorPassed} passed`);
  console.log(`magic.json:    ${magicChecked} checked, ${magicPassed} passed`);
  console.log(`Total:         ${checks} checks, ${passed} passed, ${failures.length} failed`);

  if (failures.length > 0) {
    console.log("\nFAILURES:");
    for (const f of failures) {
      console.log(`  ${f}`);
    }
    console.error(`\nAudit FAILED: ${failures.length} item(s) missing required structured data`);
    process.exit(1);
  } else {
    console.log("\nAudit PASSED: all checked items have required structured data.");
  }
}

main();
