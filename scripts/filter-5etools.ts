/**
 * Filter ALL raw 5e.tools data to allowed sources with deduplication.
 * Merges multi-file categories (bestiary-*, spells-*, class-*) into single files.
 * Output goes to scripts/5etools-filtered/, replacing any previous filtered data.
 *
 * Allowed sources (priority order, highest first):
 *   XPHB > XDMG > XMM > TCE > XGE > MPMM
 *
 * Usage: npx tsx scripts/filter-5etools.ts
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(__dirname, "..", "scripts", "5etools-raw");
const OUT_DIR = join(__dirname, "..", "scripts", "5etools-filtered");

// Clean and recreate output dir
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// Priority order: lower index = higher priority
const ALLOWED_SOURCES = ["XPHB", "XDMG", "XMM", "TCE", "XGE", "MPMM"];
const sourceSet = new Set(ALLOWED_SOURCES);

function sourcePriority(source: string): number {
  const idx = ALLOWED_SOURCES.indexOf(source);
  return idx === -1 ? 999 : idx;
}

interface Entry {
  name: string;
  source: string;
  classSource?: string;
  className?: string;
  subclassShortName?: string;
  level?: number;
  [key: string]: unknown;
}

/**
 * Filter entries to allowed sources.
 * For class features, also checks classSource.
 */
function filterAllowed(entries: Entry[], checkClassSource = false): Entry[] {
  return entries.filter((e) => {
    if (!sourceSet.has(e.source)) return false;
    if (checkClassSource && !sourceSet.has(e.classSource ?? "")) return false;
    return true;
  });
}

/**
 * Dedup entries by key, keeping highest-priority source.
 */
function dedup(entries: Entry[], keyFn: (e: Entry) => string): Entry[] {
  const best = new Map<string, Entry>();
  for (const entry of entries) {
    const key = keyFn(entry);
    const existing = best.get(key);
    if (!existing || sourcePriority(entry.source) < sourcePriority(existing.source)) {
      best.set(key, entry);
    }
  }
  return Array.from(best.values());
}

// ── Helpers ────────────────────────────────────────────────

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(name: string, data: unknown): void {
  const path = join(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function getFiles(pattern: string): string[] {
  return readdirSync(RAW_DIR)
    .filter((f) => f.match(new RegExp(pattern)))
    .map((f) => join(RAW_DIR, f));
}

// ── Generic single-file processor ──────────────────────────

interface ArrayConfig {
  key: string;
  checkClassSource?: boolean;
  dedupKey?: (e: Entry) => string;
}

function processFile(inputFiles: string[], outputName: string, arrays: ArrayConfig[]): void {
  const merged: Record<string, Entry[]> = {};

  // Merge all input files
  for (const file of inputFiles) {
    const data = readJson(file);
    for (const cfg of arrays) {
      const arr = data[cfg.key] as Entry[] | undefined;
      if (arr) {
        merged[cfg.key] = (merged[cfg.key] ?? []).concat(arr);
      }
    }
  }

  // Filter and dedup each array
  const output: Record<string, Entry[]> = {};
  const stats: string[] = [];

  for (const cfg of arrays) {
    const raw = merged[cfg.key] ?? [];
    const filtered = filterAllowed(raw, cfg.checkClassSource);
    const deduped = cfg.dedupKey ? dedup(filtered, cfg.dedupKey) : filtered;
    if (deduped.length > 0) {
      output[cfg.key] = deduped;
    }
    stats.push(`${cfg.key}: ${deduped.length}`);
  }

  writeJson(outputName, output);
  console.log(`${outputName}: ${stats.join(", ")}`);
}

// ── Process each category ──────────────────────────────────

// Classes (multi-file: class-*.json)
const classFiles = getFiles("^class-.*\\.json$");
for (const file of classFiles) {
  const name = file.split(/[/\\]/).pop()!;
  processFile([file], name, [
    { key: "class", dedupKey: (e) => e.name },
    { key: "subclass", checkClassSource: true, dedupKey: (e) => `${e.name}|${e.className}` },
    {
      key: "classFeature",
      checkClassSource: true,
      dedupKey: (e) => `${e.name}|${e.className}|${e.level ?? 0}`,
    },
    {
      key: "subclassFeature",
      checkClassSource: true,
      dedupKey: (e) => `${e.name}|${e.className}|${e.subclassShortName ?? ""}|${e.level ?? 0}`,
    },
  ]);
}

// Bestiary (multi-file: bestiary-*.json → bestiary.json)
processFile(getFiles("^bestiary-.*\\.json$"), "bestiary.json", [
  { key: "monster", dedupKey: (e) => e.name },
]);

// Spells (multi-file: spells-*.json → spells.json)
processFile(getFiles("^spells-.*\\.json$"), "spells.json", [
  { key: "spell", dedupKey: (e) => e.name },
]);

// Feats
processFile(getFiles("^feats\\.json$"), "feats.json", [{ key: "feat", dedupKey: (e) => e.name }]);

// Backgrounds
processFile(getFiles("^backgrounds\\.json$"), "backgrounds.json", [
  { key: "background", dedupKey: (e) => e.name },
]);

// Races (species)
processFile(getFiles("^races\\.json$"), "races.json", [
  { key: "race", dedupKey: (e) => e.name },
  { key: "subrace", dedupKey: (e) => `${e.name}|${(e as any).raceName ?? ""}` },
]);

// Items
processFile(getFiles("^items\\.json$"), "items.json", [
  { key: "item", dedupKey: (e) => e.name },
  { key: "itemGroup", dedupKey: (e) => e.name },
]);

// Base Items
processFile(getFiles("^items-base\\.json$"), "items-base.json", [
  { key: "baseitem", dedupKey: (e) => e.name },
  { key: "itemProperty" },
  { key: "itemType" },
  { key: "itemTypeAdditionalEntries" },
  { key: "itemEntry" },
]);

// Optional Features
processFile(getFiles("^optionalfeatures\\.json$"), "optionalfeatures.json", [
  { key: "optionalfeature", dedupKey: (e) => e.name },
]);

// Conditions, Diseases, Statuses
processFile(getFiles("^conditionsdiseases\\.json$"), "conditionsdiseases.json", [
  { key: "condition", dedupKey: (e) => e.name },
  { key: "disease", dedupKey: (e) => e.name },
  { key: "status", dedupKey: (e) => e.name },
]);

// Actions
processFile(getFiles("^actions\\.json$"), "actions.json", [
  { key: "action", dedupKey: (e) => e.name },
]);

// Languages
processFile(getFiles("^languages\\.json$"), "languages.json", [
  { key: "language", dedupKey: (e) => e.name },
  { key: "languageScript" },
]);

console.log("\nDone. Filtered data written to scripts/5etools-filtered/");
