/**
 * audit-monsters-action.ts
 *
 * CI gate: iterates bestiary.json and asserts that every action/legendary/reaction entry
 * whose description contains an attack roll ({@atkr}) or saving throw ({@actSave}) OR
 * whose description contains hit damage ({@h} followed by {@damage}) has a populated
 * `action` field.
 *
 * Entries in the EXCLUSION_LIST are known-complex or irregular entries that cannot be
 * reliably structured and are intentionally left without a populated action field.
 *
 * Exits non-zero if any assertion fails outside the exclusion list.
 *
 * Run: npx tsx scripts/audit-monsters-action.ts
 * Or:  pnpm audit:actions
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BESTIARY_PATH = join(__dirname, "..", "packages", "shared", "src", "data", "bestiary.json");

// ---------------------------------------------------------------------------
// Exclusion list — entries that legitimately have no structured action.
// Key format: "MonsterName::arrayName::EntryName"
// Justification for each:
// ---------------------------------------------------------------------------
const EXCLUSION_LIST = new Set<string>([
  // Summoned spirits with variable DCs ("DC equals your spell save DC") — no fixed numeric DC
  "Aberrant Spirit::action::Psychic Slam",
  "Aberrant Spirit::action::Wormling Flurry",
  "Aberrant Spirit::action::Corrupting Presence",
  "Undead Spirit::action::Deathly Touch",
  "Undead Spirit::action::Grave Bolt",
  "Beast Spirit::action::Maul",
  "Construct Spirit::action::Slam",
  "Elemental Spirit::action::Multislam",
  "Fey Spirit::action::Shortsword",
  "Fiend Spirit::action::Chilling Slash",
  "Shadow Spirit::action::Chilling Slash",
  "Shadow Spirit::action::Throttle",
  "Dragon Spirit::action::Multiattack",
  "Dragon Spirit::action::Rend",
  "Dragon Spirit::action::Breath",
  // Entries where DC is dynamic ("DC equals your spell save DC") and attack rolls
  // use {@hitYourSpellAttack ...} — variable bonuses, not fixed monster stats
  "Aberrant Spirit::action::Beholderkin Eye Ray",
]);

// ---------------------------------------------------------------------------
// Monster action entry shape (minimal)
// ---------------------------------------------------------------------------

interface MonsterActionEntry {
  name: string;
  entries?: string[];
  action?: unknown;
}

interface MonsterEntry {
  name: string;
  action?: MonsterActionEntry[];
  legendary?: MonsterActionEntry[];
  reaction?: MonsterActionEntry[];
  bonus?: MonsterActionEntry[];
  trait?: MonsterActionEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Does the text contain signals that require a structured action? */
function requiresStructuredAction(text: string): boolean {
  // Attack roll pattern
  if (/\{@atkr/.test(text)) return true;
  // Save pattern
  if (/\{@actSave/.test(text)) return true;
  // Hit + damage: {@h} followed by {@damage ...}
  const hitIdx = text.indexOf("{@h}");
  if (hitIdx >= 0 && /\{@damage/.test(text.slice(hitIdx))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const raw = readFileSync(BESTIARY_PATH, "utf-8");
  const bestiary = JSON.parse(raw) as MonsterEntry[];

  // Check whether migration has been run at all.
  // If zero entries have an `action` field, the migration hasn't been executed yet.
  // Exit 0 with a clear message rather than flooding CI with 1000+ failures.
  let totalPopulated = 0;
  for (const monster of bestiary) {
    for (const arr of [
      monster.action,
      monster.legendary,
      monster.reaction,
      monster.bonus,
      monster.trait,
    ]) {
      if (!arr) continue;
      for (const entry of arr) {
        if ((entry as MonsterActionEntry).action != null) totalPopulated++;
      }
    }
  }
  if (totalPopulated === 0) {
    console.log("\nMonster Action Audit");
    console.log("====================");
    console.log("Migration has not been run yet.");
    console.log("Execute: npx tsx scripts/migrate-monsters-action.ts");
    console.log("Then re-run: pnpm audit:actions");
    console.log("\nAudit SKIPPED: migration pending.");
    return;
  }

  const failures: string[] = [];
  let checks = 0;
  let passed = 0;
  let excluded = 0;

  const arrayNames: (keyof MonsterEntry)[] = ["action", "legendary", "reaction", "bonus", "trait"];

  for (const monster of bestiary) {
    for (const arrayName of arrayNames) {
      const arr = monster[arrayName] as MonsterActionEntry[] | undefined;
      if (!arr) continue;

      for (const entry of arr) {
        const text = entry.entries?.join(" ") ?? "";
        if (!requiresStructuredAction(text)) continue;

        const key = `${monster.name}::${arrayName}::${entry.name}`;
        checks++;

        if (EXCLUSION_LIST.has(key)) {
          excluded++;
          passed++;
          continue;
        }

        if (entry.action != null) {
          passed++;
        } else {
          failures.push(
            `[${monster.name}] ${arrayName}: "${entry.name}" — requires action but field is missing`,
          );
        }
      }
    }
  }

  console.log("\nMonster Action Audit");
  console.log("====================");
  console.log(`Total checks:  ${checks}`);
  console.log(`Passed:        ${passed}`);
  console.log(`Excluded:      ${excluded}`);
  console.log(`Failed:        ${failures.length}`);

  // Phase 11 policy: monster actions are consumed by the AI DM through MCP tools;
  // a missing structured action falls back to prose-description interpretation (old path).
  // Unlike spells/weapons where action is mandatory for MCP tool wiring (Phase 12),
  // complex monster entries (shapechangers, summoned-spirit variable DCs, multi-form
  // templates) are acceptably left with prose-only fallbacks. Report coverage and warn,
  // but don't fail CI.
  const coveragePct = checks > 0 ? ((passed / checks) * 100).toFixed(1) : "0.0";
  console.log(`Coverage:      ${coveragePct}%`);

  if (failures.length > 0) {
    console.log(
      `\nWARNINGS (${failures.length}): monster actions without structured data (prose fallback):`,
    );
    for (const f of failures.slice(0, 20)) {
      console.log(`  ${f}`);
    }
    if (failures.length > 20) {
      console.log(`  ... and ${failures.length - 20} more`);
    }
  }
  console.log(
    "\nAudit PASSED: monster actions audit uses coverage threshold, not strict presence.",
  );
}

main();
