/**
 * One-shot migration: walk every class/subclass feature and every feat in the
 * D&D 2024 database and set `activationType` from `{rule:...}` markers in the
 * description. Run once, review the diff, hand-correct outliers.
 *
 *   tsx scripts/annotate-feature-activations.ts
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "packages", "shared", "src", "data");
const CLASS_DIR = join(DATA_DIR, "classes");
const FEATS_FILE = join(DATA_DIR, "feats.json");

type Activation = "action" | "bonus" | "reaction";

function classify(description: string): Activation | undefined {
  if (!description) return undefined;
  // Scan only the first ~400 chars so late incidental mentions don't mislabel.
  const head = description.slice(0, 400);
  // Find the earliest {rule:...} activation marker.
  // Also treats "As a {rule:Magic} action" as an Action (2024 phrasing).
  const re = /\{rule:(Bonus Action|Reaction|Magic Action|Magic|Action)\}(\s+action)?/gi;
  let earliest: { idx: number; kind: Activation } | null = null;
  for (const m of head.matchAll(re)) {
    const raw = m[1].toLowerCase();
    // {rule:Magic} only counts when immediately followed by " action".
    if (raw === "magic" && !m[2]) continue;
    const kind: Activation =
      raw === "bonus action" ? "bonus" : raw === "reaction" ? "reaction" : "action";
    if (!earliest || m.index! < earliest.idx) earliest = { idx: m.index!, kind };
  }
  return earliest?.kind;
}

interface Feature {
  name: string;
  description: string;
  activationType?: Activation;
}

function annotateFeatures(features: Feature[], label: string): number {
  let changed = 0;
  for (const f of features) {
    const tag = classify(f.description);
    const existing = f.activationType;
    if (tag && existing !== tag) {
      f.activationType = tag;
      changed++;
      console.log(`  ${label}: ${f.name} -> ${tag}`);
    } else if (!tag && existing) {
      // leave existing manual annotations alone
    }
  }
  return changed;
}

function processClassFile(path: string): number {
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw);
  let changed = 0;

  if (Array.isArray(data.features)) {
    changed += annotateFeatures(data.features, `class:${data.name}`);
  }
  if (Array.isArray(data.subclasses)) {
    for (const sub of data.subclasses) {
      if (Array.isArray(sub.features)) {
        changed += annotateFeatures(
          sub.features,
          `subclass:${data.name}/${sub.shortName ?? sub.name}`,
        );
      }
    }
  }

  if (changed > 0) writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
  return changed;
}

function processFeatsFile(path: string): number {
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw) as Feature[];
  const changed = annotateFeatures(data, "feat");
  if (changed > 0) writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
  return changed;
}

let total = 0;
for (const file of readdirSync(CLASS_DIR)) {
  if (!file.endsWith(".json")) continue;
  total += processClassFile(join(CLASS_DIR, file));
}
total += processFeatsFile(FEATS_FILE);

console.log(`\nAnnotated ${total} features.`);
