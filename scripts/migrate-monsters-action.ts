/**
 * migrate-monsters-action.ts
 *
 * One-shot migration: populates an `action` field on each action/legendary/reaction entry
 * in packages/shared/src/data/bestiary.json. The field is placed inside each action-array
 * entry object alongside the existing `name` / `entries` fields.
 *
 * Data format observed in bestiary.json:
 *   - Monster objects have arrays: `action[]`, `legendary[]`, `reaction[]`, `bonus[]`, `trait[]`
 *   - Each array entry has: { name: string, entries: string[] }
 *   - The primary entry text (entries[0]) contains 5e.tools shortcodes:
 *     Attack patterns:
 *       {@atkr m}  = melee attack
 *       {@atkr r}  = ranged attack
 *       {@atkr m,r} = melee or ranged attack
 *       {@hit N}   = attack bonus
 *       reach X ft. = melee reach (default 5)
 *       range X/Y ft. = ranged range
 *       {@h}       = "on a hit" marker (damage follows)
 *     Save patterns:
 *       {@actSave ability} = saving throw ability
 *       {@dc N}    = DC value
 *       {@actSaveFail}     = fail branch
 *       {@actSaveSuccess}  = success branch
 *       {@actSaveSuccessOrFail} = both branches (special effect)
 *     Damage:
 *       {@damage NdM+K} = damage dice expression
 *     Area shapes (all in the description text):
 *       X-foot Cone
 *       X-foot-radius Sphere
 *       X-foot-long, Y-foot-wide Line
 *       X-foot-radius, Y-foot-tall Cylinder
 *       X-foot Cube
 *     Conditions:
 *       {@condition Name|XPHB}
 *
 * Strategy:
 *   1. Parse attack-roll entries (contain {@atkr ...}) → kind: "attack"
 *   2. Parse save entries (contain {@actSave ...}) → kind: "save"
 *   3. Multiattack → kind: "auto", note = description text
 *   4. Entries with only descriptive text (traits etc.) → kind: "auto", note = text (or undefined if no hit/save)
 *   5. Unparseable → left undefined with a warning
 *
 * Run: npx tsx scripts/migrate-monsters-action.ts
 * Report: .testing/migration-report-monsters.md (gitignored)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BESTIARY_PATH = join(__dirname, "..", "packages", "shared", "src", "data", "bestiary.json");
const REPORT_PATH = join(__dirname, "..", ".testing", "migration-report-monsters.md");

// ---------------------------------------------------------------------------
// Inline type declarations (mirrors packages/shared/src/types/effects.ts)
// ---------------------------------------------------------------------------

type Ability = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";

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

type ConditionName =
  | "Blinded"
  | "Charmed"
  | "Deafened"
  | "Exhaustion"
  | "Frightened"
  | "Grappled"
  | "Incapacitated"
  | "Invisible"
  | "Paralyzed"
  | "Petrified"
  | "Poisoned"
  | "Prone"
  | "Restrained"
  | "Stunned"
  | "Unconscious";

interface DamageEntry {
  dice: string;
  type: DamageType;
}

interface ApplyConditionEntry {
  name: ConditionName;
  duration?: { type: "duration"; rounds: number } | { type: "manual" };
  repeatSave?: "start" | "end";
}

interface ActionOutcome {
  damage?: DamageEntry[];
  applyConditions?: ApplyConditionEntry[];
  note?: string;
}

interface ActionEffect {
  kind: "attack" | "save" | "auto";
  attack?: {
    bonus: "monster";
    range?: { normal: number; long?: number };
    reach?: number;
  };
  save?: {
    ability: Ability;
    dc: number | "spell_save_dc";
    onSuccess: "half" | "none" | "negates";
  };
  area?: {
    shape: "sphere" | "cone" | "line" | "cube" | "cylinder";
    size: number;
  };
  onHit?: ActionOutcome;
  onFailedSave?: ActionOutcome;
  onSuccessfulSave?: ActionOutcome;
}

// ---------------------------------------------------------------------------
// Monster JSON shape (the arrays we care about)
// ---------------------------------------------------------------------------

interface MonsterActionEntry {
  name: string;
  entries: string[];
  // Populated by this script:
  action?: ActionEffect;
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

const ABILITY_MAP: Record<string, Ability> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};

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

const CONDITIONS = new Set<ConditionName>([
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
]);

function isDamageType(s: string): s is DamageType {
  return DAMAGE_TYPES.has(s.toLowerCase() as DamageType);
}

function isConditionName(s: string): s is ConditionName {
  const normalized = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return CONDITIONS.has(normalized as ConditionName);
}

function toConditionName(s: string): ConditionName {
  return (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()) as ConditionName;
}

/** Extract all {@damage NdM+K} dice expressions from text. Returns an array. */
function extractDamageEntries(text: string): DamageEntry[] {
  const entries: DamageEntry[] = [];
  // Pattern: {@damage dice} followed eventually by DamageType e.g. "Slashing damage"
  // We need to find each damage token and match it with its type.
  // Format: (number) ({@damage 1d8 + 3}) Slashing damage
  // Or: {@damage 2d6} Fire damage
  const damageRegex = /\{@damage ([^}]+)\}\s+([A-Z][a-z]+)\s+damage/g;
  let m: RegExpExecArray | null;
  while ((m = damageRegex.exec(text)) !== null) {
    const dice = m[1].replace(/\s+/g, "").trim();
    const typeStr = m[2].toLowerCase();
    if (isDamageType(typeStr)) {
      entries.push({ dice, type: typeStr as DamageType });
    }
  }
  return entries;
}

/** Extract conditions from {@condition Name|XPHB} references in text. */
function extractConditions(text: string): ConditionName[] {
  const conditions: ConditionName[] = [];
  const condRegex = /\{@condition ([^|}\s]+)(?:\|[^}]*)?\}/g;
  let m: RegExpExecArray | null;
  while ((m = condRegex.exec(text)) !== null) {
    const name = m[1];
    if (isConditionName(name)) {
      conditions.push(toConditionName(name));
    }
  }
  // Deduplicate
  return [...new Set(conditions)];
}

/** Extract area of effect from text. Returns area descriptor or undefined. */
function extractArea(
  text: string,
): { shape: "sphere" | "cone" | "line" | "cube" | "cylinder"; size: number } | undefined {
  // Cone: "60-foot Cone", "30-foot Cone", "15-foot Cone"
  const coneMatch = text.match(/(\d+)-foot(?:-radius)?\s+Cone/i);
  if (coneMatch) {
    return { shape: "cone", size: parseInt(coneMatch[1], 10) };
  }

  // Sphere: "20-foot-radius Sphere" or "30-foot Sphere"
  const sphereMatch = text.match(/(\d+)-foot(?:-radius)?\s+Sphere/i);
  if (sphereMatch) {
    return { shape: "sphere", size: parseInt(sphereMatch[1], 10) };
  }

  // Line: "60-foot-long, 5-foot-wide Line" — use the length (first number)
  const lineMatch = text.match(/(\d+)-foot(?:-long)?,?\s+\d+-foot(?:-wide)?\s+Line/i);
  if (lineMatch) {
    return { shape: "line", size: parseInt(lineMatch[1], 10) };
  }

  // Cylinder: "20-foot-radius, 40-foot-tall Cylinder"
  const cylinderMatch = text.match(/(\d+)-foot(?:-radius)?,?\s+\d+-foot(?:-tall)?\s+Cylinder/i);
  if (cylinderMatch) {
    return { shape: "cylinder", size: parseInt(cylinderMatch[1], 10) };
  }

  // Cube: "15-foot Cube"
  const cubeMatch = text.match(/(\d+)-foot\s+Cube/i);
  if (cubeMatch) {
    return { shape: "cube", size: parseInt(cubeMatch[1], 10) };
  }

  // Emanation: "5-foot Emanation" — treat as sphere
  const emanationMatch = text.match(/(\d+)-foot\s+Emanation/i);
  if (emanationMatch) {
    return { shape: "sphere", size: parseInt(emanationMatch[1], 10) };
  }

  return undefined;
}

/** Determine onSuccess behavior from save text. */
function determineOnSuccess(failText: string, successText: string): "half" | "none" | "negates" {
  const successLower = successText.toLowerCase();
  const failLower = failText.toLowerCase();

  if (
    successLower.includes("half damage") ||
    successLower.includes("half the damage") ||
    failLower.includes("half") // sometimes the fail block mentions half on success
  ) {
    return "half";
  }

  // If success block mentions "no damage" or "not affected" → none
  if (successLower.includes("no damage") || successLower.includes("not affected")) {
    return "none";
  }

  // If there is no save success text but save fail exists → condition applied → negates
  // If damage + condition, and success says "half damage" → "half" (already covered)
  // Default for condition-only saves: negates
  const hasConditionInFail = /\{@condition/.test(failText) && !failLower.includes("damage");
  if (hasConditionInFail) {
    return "negates";
  }

  // Default: if there's damage in the fail block and no success info → "none" (common for status effects)
  if (failLower.includes("damage")) {
    return "half"; // conservative default for damage saves
  }

  return "negates";
}

/** Parse a melee or ranged attack entry. Returns ActionEffect or null if unparseable. */
function parseAttackEntry(text: string): ActionEffect | null {
  // Detect attack type
  const isRanged = /\{@atkr r\}/i.test(text);
  const isMelee = /\{@atkr m\}/i.test(text); // also catches m,r

  if (!isMelee && !isRanged) return null;

  // Extract reach for melee
  let reach: number | undefined;
  const reachMatch = text.match(/reach (\d+) ft/i);
  if (reachMatch) {
    const r = parseInt(reachMatch[1], 10);
    // Only set reach if non-standard (not 5 for pure melee, or if ranged-only)
    // We always store reach for melee attacks; 5 is the default but explicit is fine
    reach = r;
  }

  // Extract range
  let range: { normal: number; long?: number } | undefined;
  const rangeMatch = text.match(/range (\d+)\/(\d+) ft/i);
  if (rangeMatch) {
    range = {
      normal: parseInt(rangeMatch[1], 10),
      long: parseInt(rangeMatch[2], 10),
    };
  } else {
    const singleRangeMatch = text.match(/range (\d+) ft/i);
    if (singleRangeMatch) {
      range = { normal: parseInt(singleRangeMatch[1], 10) };
    }
  }

  // Extract hit damage: text after {@h} up to the end (or next logical split)
  // Some entries have {@h} then "X ({@damage NdM+K}) Type damage plus Y ({@damage ...}) Type2 damage"
  const hitIndex = text.indexOf("{@h}");
  const hitText = hitIndex >= 0 ? text.slice(hitIndex) : text;

  const hitDamage = extractDamageEntries(hitText);

  // Extract conditions applied on hit (from text after {@h})
  const hitConditions = extractConditions(hitText);
  // Filter to only those clearly applied on hit (before any save requirement)
  // If there's a grapple/restrain mentioned in the hit portion
  const hitApplyConditions: ApplyConditionEntry[] =
    hitConditions.length > 0 ? hitConditions.map((name) => ({ name })) : [];

  const onHit: ActionOutcome = {};
  if (hitDamage.length > 0) onHit.damage = hitDamage;
  if (hitApplyConditions.length > 0) onHit.applyConditions = hitApplyConditions;
  if (Object.keys(onHit).length === 0) {
    // No structured data found — add a note for the DM
    onHit.note = stripTags(hitText).trim().slice(0, 200);
  }

  const attackDescriptor: ActionEffect["attack"] = {
    bonus: "monster",
    ...(reach !== undefined ? { reach } : {}),
    ...(range !== undefined ? { range } : {}),
  };

  return {
    kind: "attack",
    attack: attackDescriptor,
    onHit,
  };
}

/** Strip 5e.tools shortcodes from text for note fields. */
function stripTags(text: string): string {
  return text.replace(/\{@\w+\s+([^|}]+)(?:\|[^}]*)?\}/g, "$1").replace(/\{@\w+\}/g, "");
}

/** Parse a saving throw entry. Returns ActionEffect or null if unparseable. */
function parseSaveEntry(text: string): ActionEffect | null {
  // Extract save ability
  const saveMatch = text.match(/\{@actSave (\w+)\}/i);
  if (!saveMatch) return null;

  const abilityShort = saveMatch[1].toLowerCase();
  const ability = ABILITY_MAP[abilityShort];
  if (!ability) return null;

  // Extract DC
  let dc: number | "spell_save_dc" = "spell_save_dc";
  const dcMatch = text.match(/\{@dc (\d+)\}/);
  if (dcMatch) {
    dc = parseInt(dcMatch[1], 10);
  } else if (/dc equals your spell save dc/i.test(text)) {
    dc = "spell_save_dc";
  } else {
    // Cannot determine DC — skip
    return null;
  }

  // Split text into fail and success sections
  const failIdx = text.indexOf("{@actSaveFail}");
  const successIdx = text.indexOf("{@actSaveSuccess}");

  const failText = failIdx >= 0 ? text.slice(failIdx) : "";
  const successText = successIdx >= 0 ? text.slice(successIdx) : "";

  // Extract area
  const area = extractArea(text);

  // Extract fail outcomes
  const failDamage = extractDamageEntries(failText);
  const failConditions = extractConditions(failText);

  // Extract success outcomes (typically "Half damage" text)
  const successDamage = extractDamageEntries(successText);

  // Determine onSuccess behavior
  const onSuccess = determineOnSuccess(failText, successText);

  const onFailedSave: ActionOutcome = {};
  if (failDamage.length > 0) onFailedSave.damage = failDamage;
  if (failConditions.length > 0) {
    onFailedSave.applyConditions = failConditions.map((name) => ({
      name,
      ...(text.includes("repeats the save") || text.includes("repeat the save")
        ? { repeatSave: "end" as const }
        : {}),
    }));
  }
  if (Object.keys(onFailedSave).length === 0 && failText) {
    onFailedSave.note = stripTags(failText).trim().slice(0, 200);
  }

  const onSuccessfulSave: ActionOutcome = {};
  if (successDamage.length > 0) {
    onSuccessfulSave.damage = successDamage;
  } else if (onSuccess === "half" && failDamage.length > 0) {
    // half damage = same dice, no entry needed (the onSuccess: "half" on save covers it)
    onSuccessfulSave.note = "Half damage";
  }

  const effect: ActionEffect = {
    kind: "save",
    save: { ability, dc, onSuccess },
    ...(area !== undefined ? { area } : {}),
    ...(Object.keys(onFailedSave).length > 0 ? { onFailedSave } : {}),
    ...(Object.keys(onSuccessfulSave).length > 0 ? { onSuccessfulSave } : {}),
  };

  return effect;
}

/** Is this entry a Multiattack? */
function isMultiattack(name: string): boolean {
  return /multiattack/i.test(name);
}

/** Has a "spell_save_dc" DC (summoned spirits with variable DC). */
function hasVariableDc(text: string): boolean {
  return /dc equals your spell save dc/i.test(text) || /\{@hitYourSpellAttack/i.test(text);
}

/** Main per-entry parse function. Returns the ActionEffect to store, or undefined. */
function parseActionEntry(
  monsterName: string,
  arrayName: string,
  entry: MonsterActionEntry,
): { effect: ActionEffect | undefined; warning: string | undefined } {
  const name = entry.name;
  const text = entry.entries?.join(" ") ?? "";

  // 1. Multiattack → auto with note
  if (isMultiattack(name)) {
    const note = stripTags(text).trim().slice(0, 300);
    return {
      effect: { kind: "auto", onHit: { note } },
      warning: undefined,
    };
  }

  // 2. Attack roll entry
  if (/\{@atkr/.test(text)) {
    // If it also has a spell attack (variable), note it
    if (hasVariableDc(text)) {
      const note = stripTags(text).trim().slice(0, 300);
      return {
        effect: { kind: "attack", attack: { bonus: "monster" }, onHit: { note } },
        warning: undefined,
      };
    }
    const effect = parseAttackEntry(text);
    if (effect) return { effect, warning: undefined };
    return {
      effect: undefined,
      warning: `[${monsterName}] ${arrayName}:"${name}" — @atkr present but parse failed`,
    };
  }

  // 3. Save entry
  if (/\{@actSave/.test(text)) {
    const effect = parseSaveEntry(text);
    if (effect) return { effect, warning: undefined };
    return {
      effect: undefined,
      warning: `[${monsterName}] ${arrayName}:"${name}" — @actSave present but parse failed`,
    };
  }

  // 4. Spellcasting entries — skip (they're usually in the spellcasting array, not action entries)
  // But some spellcasting entries appear in action arrays with name "Spellcasting"
  if (/spellcasting/i.test(name) || /casts one of/i.test(text)) {
    return {
      effect: { kind: "auto", onHit: { note: stripTags(text).trim().slice(0, 200) } },
      warning: undefined,
    };
  }

  // 5. Entries with no attack or save signals — this is a descriptive/passive entry.
  // Don't force an action onto it — leave undefined. These will be excluded from audit.
  return { effect: undefined, warning: undefined };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const raw = readFileSync(BESTIARY_PATH, "utf-8");
  const bestiary = JSON.parse(raw) as MonsterEntry[];

  let monstersProcessed = 0;
  let actionEntriesTotal = 0;
  let actionEntriesPopulated = 0;
  let actionEntriesUndefined = 0;
  const warnings: string[] = [];

  // All arrays to migrate
  const arrayNames: (keyof MonsterEntry)[] = ["action", "legendary", "reaction", "bonus", "trait"];

  for (const monster of bestiary) {
    monstersProcessed++;

    for (const arrayName of arrayNames) {
      const arr = monster[arrayName] as MonsterActionEntry[] | undefined;
      if (!arr) continue;

      for (const entry of arr) {
        actionEntriesTotal++;

        const { effect, warning } = parseActionEntry(monster.name, arrayName, entry);
        if (warning) warnings.push(warning);

        if (effect !== undefined) {
          entry.action = effect;
          actionEntriesPopulated++;
        } else {
          actionEntriesUndefined++;
        }
      }
    }
  }

  // Write back
  const output = JSON.stringify(bestiary, null, 2) + "\n";
  writeFileSync(BESTIARY_PATH, output, "utf-8");

  // Write report
  mkdirSync(join(__dirname, "..", ".testing"), { recursive: true });
  const report = [
    "# Monster Action Migration Report",
    "",
    `**Monsters processed:** ${monstersProcessed}`,
    `**Action entries total:** ${actionEntriesTotal}`,
    `**Entries populated:** ${actionEntriesPopulated}`,
    `**Entries left undefined:** ${actionEntriesUndefined}`,
    `**Coverage:** ${((actionEntriesPopulated / actionEntriesTotal) * 100).toFixed(1)}%`,
    `**Warnings:** ${warnings.length}`,
    "",
    "## Warnings",
    "",
    ...warnings.map((w) => `- ${w}`),
  ].join("\n");
  writeFileSync(REPORT_PATH, report, "utf-8");

  console.log("\nMonster Action Migration");
  console.log("========================");
  console.log(`Monsters processed:    ${monstersProcessed}`);
  console.log(`Action entries total:  ${actionEntriesTotal}`);
  console.log(`Entries populated:     ${actionEntriesPopulated}`);
  console.log(`Entries undefined:     ${actionEntriesUndefined}`);
  console.log(
    `Coverage:              ${((actionEntriesPopulated / actionEntriesTotal) * 100).toFixed(1)}%`,
  );
  console.log(`Warnings:              ${warnings.length}`);
  console.log(`\nReport: .testing/migration-report-monsters.md`);
}

main();
