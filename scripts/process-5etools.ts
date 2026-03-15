/**
 * Process raw 5e.tools data: filter by allowed sources, output to packages/shared/src/data/
 *
 * Usage: npx tsx scripts/process-5etools.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(__dirname, "5etools-raw");
const OUT_DIR = join(__dirname, "..", "packages", "shared", "src", "data");

const ALLOWED_SOURCES = new Set(["XPHB", "XDMG", "XMM", "TCE", "XGE", "MPMM"]);

// Also allow features/subclasses whose parent class comes from our sources
const ALLOWED_CLASS_SOURCES = new Set(["XPHB", "XDMG", "XMM", "TCE", "XGE"]);

function readRaw(name: string): any {
  const path = join(RAW_DIR, `${name}.json`);
  if (!existsSync(path)) {
    console.warn(`  ⚠ Missing raw file: ${name}.json`);
    return null;
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

// Priority sources: when duplicates exist, prefer 2024 (XPHB/XDMG/XMM) over older (TCE/XGE)
const PREFERRED_SOURCES = ["XPHB", "XDMG", "XMM"];

/** Deduplicate by name, preferring XPHB/XDMG/XMM over older sources */
function deduplicateByName(items: any[]): any[] {
  const byName = new Map<string, any[]>();
  for (const item of items) {
    const key = item.name;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(item);
  }
  const result: any[] = [];
  for (const [, group] of byName) {
    if (group.length === 1) {
      result.push(group[0]);
    } else {
      const preferred = group.find((item) => PREFERRED_SOURCES.includes(item.source));
      result.push(preferred ?? group[0]);
    }
  }
  return result;
}

function filterBySource(items: any[]): any[] {
  const filtered = items.filter((item) => ALLOWED_SOURCES.has(item.source));
  return deduplicateByName(filtered);
}

function writeOut(name: string, data: any) {
  const path = join(OUT_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2));
  const count = Array.isArray(data) ? data.length : "object";
  console.log(`  ✓ ${name}.json (${count} entries)`);
}

mkdirSync(OUT_DIR, { recursive: true });

// ─── Spells ────────────────────────────────────────────────
function processSpells() {
  console.log("Processing spells...");
  const allSpells: any[] = [];
  for (const src of ["xphb", "tce", "xge"]) {
    const data = readRaw(`spells-${src}`);
    if (data?.spell) {
      allSpells.push(...data.spell.filter((s: any) => ALLOWED_SOURCES.has(s.source)));
    }
  }

  // Inject class lists from the spell-source-lookup generated file
  const lookup = readRaw("gendata-spell-source-lookup");
  if (lookup) {
    for (const spell of allSpells) {
      const src = spell.source.toLowerCase();
      const srcLookup = lookup[src];
      if (!srcLookup) continue;
      const entry = srcLookup[spell.name.toLowerCase()];
      if (!entry) continue;

      // Get class names from XPHB source (2024 rules), falling back to PHB
      // Entry may have "class" (direct) and/or "classVariant" (expanded spell lists from TCE/XGE)
      const classMap = entry.class?.XPHB ?? entry.class?.PHB ?? {};
      const variantMap = entry.classVariant?.XPHB ?? entry.classVariant?.PHB ?? {};

      // Merge both maps
      const allClasses = new Set([...Object.keys(classMap), ...Object.keys(variantMap)]);
      if (allClasses.size > 0) {
        spell.classes = {
          fromClassList: Array.from(allClasses).map((name) => ({
            name,
            source: "XPHB",
          })),
        };
      }
    }
  }

  writeOut("spells", deduplicateByName(allSpells));
}

// ─── Bestiary ──────────────────────────────────────────────
function processBestiary() {
  console.log("Processing bestiary...");
  const allMonsters: any[] = [];
  for (const src of ["xmm", "xphb", "xdmg", "tce", "xge"]) {
    const data = readRaw(`bestiary-${src}`);
    if (data?.monster) {
      allMonsters.push(...data.monster.filter((m: any) => ALLOWED_SOURCES.has(m.source)));
    }
  }
  writeOut("bestiary", deduplicateByName(allMonsters));
}

// ─── Classes ───────────────────────────────────────────────
function processClasses() {
  console.log("Processing classes...");
  const allClasses: any[] = [];
  const allSubclasses: any[] = [];
  const allClassFeatures: any[] = [];
  const allSubclassFeatures: any[] = [];

  const classNames = [
    "barbarian",
    "bard",
    "cleric",
    "druid",
    "fighter",
    "monk",
    "paladin",
    "ranger",
    "rogue",
    "sorcerer",
    "warlock",
    "wizard",
  ];

  for (const name of classNames) {
    const data = readRaw(`class-${name}`);
    if (!data) continue;

    // Filter classes by source
    if (data.class) {
      allClasses.push(...filterBySource(data.class));
    }

    // Subclasses: include if source OR classSource is in our allowed set
    if (data.subclass) {
      const filtered = data.subclass.filter(
        (sc: any) => ALLOWED_SOURCES.has(sc.source) || ALLOWED_CLASS_SOURCES.has(sc.classSource),
      );
      // But we only want subclasses whose own source is allowed
      allSubclasses.push(...filtered.filter((sc: any) => ALLOWED_SOURCES.has(sc.source)));
    }

    // Class features: include if source is allowed OR classSource is allowed
    if (data.classFeature) {
      allClassFeatures.push(
        ...data.classFeature.filter(
          (f: any) => ALLOWED_SOURCES.has(f.source) && ALLOWED_CLASS_SOURCES.has(f.classSource),
        ),
      );
    }

    // Subclass features: include if source is allowed AND classSource is allowed
    if (data.subclassFeature) {
      allSubclassFeatures.push(
        ...data.subclassFeature.filter(
          (f: any) => ALLOWED_SOURCES.has(f.source) && ALLOWED_CLASS_SOURCES.has(f.classSource),
        ),
      );
    }
  }

  writeOut("classes", {
    class: allClasses,
    subclass: allSubclasses,
    classFeature: allClassFeatures,
    subclassFeature: allSubclassFeatures,
  });
  console.log(
    `    (${allClasses.length} classes, ${allSubclasses.length} subclasses, ${allClassFeatures.length} class features, ${allSubclassFeatures.length} subclass features)`,
  );
}

// ─── Feats ─────────────────────────────────────────────────
function processFeats() {
  console.log("Processing feats...");
  const data = readRaw("feats");
  if (data?.feat) {
    writeOut("feats", filterBySource(data.feat));
  }
}

// ─── Backgrounds ───────────────────────────────────────────
function processBackgrounds() {
  console.log("Processing backgrounds...");
  const data = readRaw("backgrounds");
  if (data?.background) {
    writeOut("backgrounds", filterBySource(data.background));
  }
}

// ─── Species (races) ──────────────────────────────────────
function processSpecies() {
  console.log("Processing species...");
  const data = readRaw("races");
  const result: any = {};
  if (data?.race) {
    result.race = filterBySource(data.race);
  }
  if (data?.subrace) {
    result.subrace = filterBySource(data.subrace);
  }
  writeOut("species", result);
  console.log(`    (${result.race?.length ?? 0} races, ${result.subrace?.length ?? 0} subraces)`);
}

// ─── Items (magic) ─────────────────────────────────────────
function processItems() {
  console.log("Processing items...");
  const data = readRaw("items");
  const result: any = {};
  if (data?.item) {
    result.item = filterBySource(data.item);
  }
  if (data?.itemGroup) {
    result.itemGroup = filterBySource(data.itemGroup);
  }
  writeOut("items", result);
  console.log(
    `    (${result.item?.length ?? 0} items, ${result.itemGroup?.length ?? 0} item groups)`,
  );
}

// ─── Items (base) ──────────────────────────────────────────
function processBaseItems() {
  console.log("Processing base items...");
  const data = readRaw("items-base");
  const result: any = {};
  if (data?.baseitem) {
    result.baseitem = filterBySource(data.baseitem);
  }
  // Include item properties, types, mastery (these may not have source field)
  if (data?.itemProperty) {
    result.itemProperty = data.itemProperty;
  }
  if (data?.itemType) {
    result.itemType = data.itemType;
  }
  if (data?.itemMastery) {
    result.itemMastery = data.itemMastery;
  }
  if (data?.itemTypeAdditionalEntries) {
    result.itemTypeAdditionalEntries = data.itemTypeAdditionalEntries;
  }
  // Preserve itemEntry (weapon/armor description templates)
  if (data?.itemEntry) {
    result.itemEntry = data.itemEntry;
  }
  writeOut("items-base", result);
  console.log(`    (${result.baseitem?.length ?? 0} base items)`);
}

// ─── Optional Features ────────────────────────────────────
function processOptionalFeatures() {
  console.log("Processing optional features...");
  const data = readRaw("optionalfeatures");
  if (data?.optionalfeature) {
    writeOut("optional-features", filterBySource(data.optionalfeature));
  }
}

// ─── Conditions & Diseases ────────────────────────────────
function processConditionsDiseases() {
  console.log("Processing conditions & diseases...");
  const data = readRaw("conditionsdiseases");
  const result: any = {};
  if (data?.condition) {
    result.condition = filterBySource(data.condition);
  }
  if (data?.disease) {
    result.disease = filterBySource(data.disease);
  }
  if (data?.status) {
    // Statuses may not have source — keep all
    result.status = Array.isArray(data.status) ? data.status : [];
  }
  writeOut("conditions-diseases", result);
  console.log(
    `    (${result.condition?.length ?? 0} conditions, ${result.disease?.length ?? 0} diseases, ${result.status?.length ?? 0} statuses)`,
  );
}

// ─── Languages ─────────────────────────────────────────────
function processLanguages() {
  console.log("Processing languages...");
  const data = readRaw("languages");
  const result: any = {};
  if (data?.language) {
    result.language = filterBySource(data.language);
  }
  if (data?.languageScript) {
    result.languageScript = data.languageScript; // Scripts typically don't have source
  }
  writeOut("languages", result);
  console.log(`    (${result.language?.length ?? 0} languages)`);
}

// ─── Actions ───────────────────────────────────────────────
function processActions() {
  console.log("Processing actions...");
  const data = readRaw("actions");
  if (data?.action) {
    writeOut("actions", filterBySource(data.action));
  }
}

// ─── Run all ───────────────────────────────────────────────
function main() {
  console.log("Processing 5e.tools raw data...\n");

  if (!existsSync(RAW_DIR)) {
    console.error(
      "Raw data directory not found. Run fetch-5etools.ts first:\n  npx tsx scripts/fetch-5etools.ts",
    );
    process.exit(1);
  }

  processSpells();
  processBestiary();
  processClasses();
  processFeats();
  processBackgrounds();
  processSpecies();
  processItems();
  processBaseItems();
  processOptionalFeatures();
  processConditionsDiseases();
  processLanguages();
  processActions();

  console.log("\nDone! Output written to packages/shared/src/data/");
}

main();
