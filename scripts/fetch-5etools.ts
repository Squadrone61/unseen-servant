/**
 * Fetch D&D data from the 5e.tools GitHub mirror.
 *
 * 5e.tools itself returns 403 for non-browser requests (Cloudflare protection).
 * The data is available from the GitHub source repo at raw.githubusercontent.com.
 *
 * Usage: npx tsx scripts/fetch-5etools.ts
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(__dirname, "5etools-raw");
const BASE_URL =
  "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

// Indexed categories: fetched per-source
const INDEXED_SPELLS = ["spells-xphb", "spells-tce", "spells-xge"];
const INDEXED_BESTIARY = [
  "bestiary-xmm",
  "bestiary-xphb",
  "bestiary-xdmg",
  "bestiary-tce",
  "bestiary-xge",
];

// Class files are indexed by class name, not source
const CLASS_FILES = [
  "class-barbarian",
  "class-bard",
  "class-cleric",
  "class-druid",
  "class-fighter",
  "class-monk",
  "class-paladin",
  "class-ranger",
  "class-rogue",
  "class-sorcerer",
  "class-warlock",
  "class-wizard",
];

// Non-indexed: single files
const SINGLE_FILES = [
  "feats",
  "backgrounds",
  "races",
  "items",
  "items-base",
  "optionalfeatures",
  "conditionsdiseases",
  "languages",
  "actions",
];

// Generated data files (spell-class lookup, etc.)
const GENERATED_FILES = ["generated/gendata-spell-source-lookup"];

mkdirSync(RAW_DIR, { recursive: true });

function outPath(name: string): string {
  return join(RAW_DIR, `${name}.json`);
}

function alreadyCached(name: string): boolean {
  return existsSync(outPath(name));
}

async function fetchAndSave(name: string, urlPath: string) {
  if (alreadyCached(name)) return;
  const url = `${BASE_URL}/${urlPath}.json`;
  console.log(`  Fetching ${urlPath}...`);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    const data = await resp.json();
    writeFileSync(outPath(name), JSON.stringify(data, null, 2));
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}: ${err}`);
  }
}

async function main() {
  const allFiles = [
    ...INDEXED_SPELLS,
    ...INDEXED_BESTIARY,
    ...CLASS_FILES,
    ...SINGLE_FILES,
    ...GENERATED_FILES.map((f) => f.replace("generated/", "")),
  ];
  const needed = allFiles.filter((f) => !alreadyCached(f));

  if (needed.length === 0) {
    console.log(
      "All files already cached in 5etools-raw/. Delete the directory to re-fetch."
    );
    return;
  }

  console.log(
    `Fetching ${needed.length} files (${allFiles.length - needed.length} already cached)...`
  );

  // Fetch indexed spell files
  for (const name of INDEXED_SPELLS) {
    await fetchAndSave(name, `spells/${name}`);
  }

  // Fetch indexed bestiary files
  for (const name of INDEXED_BESTIARY) {
    await fetchAndSave(name, `bestiary/${name}`);
  }

  // Fetch indexed class files
  for (const name of CLASS_FILES) {
    await fetchAndSave(name, `class/${name}`);
  }

  // Fetch single files
  for (const name of SINGLE_FILES) {
    await fetchAndSave(name, name);
  }

  // Fetch generated data files
  for (const name of GENERATED_FILES) {
    const saveName = name.replace("generated/", "");
    await fetchAndSave(saveName, name);
  }

  console.log("\nDone! Raw data saved to scripts/5etools-raw/");
}

main().catch(console.error);
