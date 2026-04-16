#!/usr/bin/env tsx
/**
 * find-migration-queue.ts — note/empty enumeration diagnostic
 *
 * Enumerates player-build DB entities whose mechanical payload is either
 *   - "note_only": has `effects` but every property is a `note` placeholder
 *                  (no modifiers, no action, no activation, no structured properties)
 *   - "empty":     has no effects / no activation / no choices at all
 *
 * Categories covered: feats, optional features, species, backgrounds,
 * class features, subclass features.
 *
 * Output:
 *   .testing/migration-queue.json           — structured queue (per-entry rows)
 *   .testing/migration-queue-summary.md     — human-readable summary for triage
 *
 * Complementary to audit-data.ts (which checks schema validity). This one
 * surfaces *which* entries are still relying on note placeholders so a future
 * migration pass can target them when new effect types are added.
 */

import fs from "node:fs";
import path from "node:path";
import {
  featsArray,
  speciesArray,
  backgroundsArray,
  classesArray,
  optionalFeaturesArray,
} from "../src/data/index.js";
import type { EntityEffects } from "../src/types/effects.js";

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

type MigrationStatus =
  | "empty"
  | "note_only"
  | "notes_plus_structure"
  | "choices_only"
  | "structured"
  /** Architectural placeholders for class features (ASI, Subclass pick, etc.) —
   * intentionally carry no effects; the mechanic comes from builder choices. */
  | "architectural_placeholder";

const CLASS_NAMES = [
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
];

function isArchitecturalPlaceholder(category: string, name: string): boolean {
  if (category !== "class_feature") return false;
  if (name === "Ability Score Improvement") return true;
  if (name === "Epic Boon") return true;
  if (name === "Subclass Feature") return true;
  if (CLASS_NAMES.some((c) => name === `${c} Subclass`)) return true;
  return false;
}

interface PayloadCounts {
  modifiers: number;
  nonNoteProperties: number;
  notes: number;
  hasAction: boolean;
}

function countPayload(effects?: EntityEffects): PayloadCounts {
  const counts: PayloadCounts = {
    modifiers: 0,
    nonNoteProperties: 0,
    notes: 0,
    hasAction: false,
  };
  if (!effects) return counts;
  counts.modifiers += effects.modifiers?.length ?? 0;
  counts.hasAction = counts.hasAction || effects.action !== undefined;
  for (const prop of effects.properties ?? []) {
    if (prop.type === "note") counts.notes += 1;
    else counts.nonNoteProperties += 1;
  }
  return counts;
}

function classify(
  entity: {
    effects?: EntityEffects;
    activation?: EntityEffects;
    choices?: unknown[];
  },
  category: string,
  name: string,
): MigrationStatus {
  if (isArchitecturalPlaceholder(category, name)) return "architectural_placeholder";

  const baseline = countPayload(entity.effects);
  const activation = countPayload(entity.activation);
  const structuredMods = baseline.modifiers + activation.modifiers;
  const structuredProps = baseline.nonNoteProperties + activation.nonNoteProperties;
  const hasAction = baseline.hasAction || activation.hasAction;
  const totalNotes = baseline.notes + activation.notes;
  const hasChoices = (entity.choices?.length ?? 0) > 0;

  const hasStructured = structuredMods > 0 || structuredProps > 0 || hasAction;

  if (hasStructured && totalNotes > 0) return "notes_plus_structure";
  if (hasStructured) return "structured";
  if (totalNotes > 0) return "note_only";
  if (hasChoices) return "choices_only";
  return "empty";
}

function extractNotes(entity: { effects?: EntityEffects; activation?: EntityEffects }): string[] {
  const notes: string[] = [];
  for (const source of [entity.effects, entity.activation]) {
    for (const prop of source?.properties ?? []) {
      if (prop.type === "note") notes.push(prop.text);
    }
  }
  return notes;
}

// ---------------------------------------------------------------------------
// Queue rows
// ---------------------------------------------------------------------------

interface QueueRow {
  id: string;
  name: string;
  category:
    | "feat"
    | "optional_feature"
    | "species"
    | "background"
    | "class_feature"
    | "subclass_feature";
  status: MigrationStatus;
  sourceFile: string;
  level?: number;
  className?: string;
  subclassName?: string;
  featureType?: string[];
  featCategory?: string;
  /** First ~400 chars of description, for quick triage. */
  descriptionPreview: string;
  /** Length of the full description. */
  descriptionLength: number;
  /** Extracted note texts (already in the entity). */
  notes: string[];
  /** Current effects (raw, for the agent to edit). */
  effects?: EntityEffects;
  activation?: EntityEffects;
  hasChoices: boolean;
}

function preview(text: string, max = 400): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max) + "…" : one;
}

function collectQueue(): QueueRow[] {
  const rows: QueueRow[] = [];

  // Feats
  for (const feat of featsArray) {
    const status = classify(feat, "feat", feat.name);
    rows.push({
      id: `feat:${feat.name}`,
      name: feat.name,
      category: "feat",
      status,
      sourceFile: "packages/shared/src/data/feats.json",
      featCategory: feat.category,
      descriptionPreview: preview(feat.description),
      descriptionLength: feat.description.length,
      notes: extractNotes(feat),
      effects: feat.effects,
      activation: feat.activation,
      hasChoices: (feat.choices?.length ?? 0) > 0,
    });
  }

  // Optional features
  for (const feature of optionalFeaturesArray) {
    const status = classify(feature, "optional_feature", feature.name);
    rows.push({
      id: `optional_feature:${feature.name}`,
      name: feature.name,
      category: "optional_feature",
      status,
      sourceFile: "packages/shared/src/data/optional-features.json",
      featureType: feature.featureType,
      descriptionPreview: preview(feature.description),
      descriptionLength: feature.description.length,
      notes: extractNotes(feature),
      effects: feature.effects,
      activation: feature.activation,
      hasChoices: (feature.choices?.length ?? 0) > 0,
    });
  }

  // Species
  for (const sp of speciesArray) {
    const status = classify(sp, "species", sp.name);
    rows.push({
      id: `species:${sp.name}`,
      name: sp.name,
      category: "species",
      status,
      sourceFile: "packages/shared/src/data/species.json",
      descriptionPreview: preview(sp.description),
      descriptionLength: sp.description.length,
      notes: extractNotes(sp),
      effects: sp.effects,
      activation: sp.activation,
      hasChoices: (sp.choices?.length ?? 0) > 0,
    });
  }

  // Backgrounds
  for (const bg of backgroundsArray) {
    const status = classify(bg, "background", bg.name);
    rows.push({
      id: `background:${bg.name}`,
      name: bg.name,
      category: "background",
      status,
      sourceFile: "packages/shared/src/data/backgrounds.json",
      descriptionPreview: preview(bg.description),
      descriptionLength: bg.description.length,
      notes: extractNotes(bg),
      effects: bg.effects,
      activation: bg.activation,
      hasChoices: (bg.choices?.length ?? 0) > 0,
    });
  }

  // Class & subclass features
  for (const cls of classesArray) {
    const classFile = `packages/shared/src/data/classes/${cls.name.toLowerCase()}.json`;
    for (const feature of cls.features) {
      const status = classify(feature, "class_feature", feature.name);
      rows.push({
        id: `class_feature:${cls.name}:${feature.name}:${feature.level}`,
        name: feature.name,
        category: "class_feature",
        status,
        sourceFile: classFile,
        level: feature.level,
        className: cls.name,
        descriptionPreview: preview(feature.description),
        descriptionLength: feature.description.length,
        notes: extractNotes(feature),
        effects: feature.effects,
        activation: feature.activation,
        hasChoices: (feature.choices?.length ?? 0) > 0,
      });
    }
    for (const sub of cls.subclasses) {
      for (const feature of sub.features) {
        const status = classify(feature, "subclass_feature", feature.name);
        rows.push({
          id: `subclass_feature:${cls.name}:${sub.name}:${feature.name}:${feature.level}`,
          name: feature.name,
          category: "subclass_feature",
          status,
          sourceFile: classFile,
          level: feature.level,
          className: cls.name,
          subclassName: sub.name,
          descriptionPreview: preview(feature.description),
          descriptionLength: feature.description.length,
          notes: extractNotes(feature),
          effects: feature.effects,
          activation: feature.activation,
          hasChoices: (feature.choices?.length ?? 0) > 0,
        });
      }
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Summary rendering
// ---------------------------------------------------------------------------

function summary(rows: QueueRow[]): string {
  const out: string[] = [];
  out.push("# Migration Queue — Player-Build Surface");
  out.push("");
  out.push(`Generated: ${new Date().toISOString()}`);
  out.push("");
  out.push(
    "`note_only` and `empty` rows are the migration targets. `notes_plus_structure` is partial (optional follow-up). `structured` / `choices_only` are skipped this pass.",
  );
  out.push("");

  const byCat = new Map<string, QueueRow[]>();
  for (const row of rows) {
    if (!byCat.has(row.category)) byCat.set(row.category, []);
    byCat.get(row.category)!.push(row);
  }

  out.push("## Coverage by category");
  out.push("");
  out.push(
    "| Category | Total | note_only | empty | notes+structure | structured | choices_only | placeholder |",
  );
  out.push(
    "|----------|-------|-----------|-------|-----------------|------------|--------------|-------------|",
  );
  for (const [cat, list] of byCat) {
    const c = (s: MigrationStatus) => list.filter((r) => r.status === s).length;
    out.push(
      `| ${cat} | ${list.length} | ${c("note_only")} | ${c("empty")} | ${c("notes_plus_structure")} | ${c("structured")} | ${c("choices_only")} | ${c("architectural_placeholder")} |`,
    );
  }
  out.push("");

  // Per-category targets list
  const targets: MigrationStatus[] = ["note_only", "empty"];

  for (const cat of byCat.keys()) {
    const list = byCat.get(cat)!.filter((r) => targets.includes(r.status));
    if (list.length === 0) continue;
    out.push(`## ${cat} (${list.length} targets)`);
    out.push("");
    // Group by secondary key
    if (cat === "class_feature" || cat === "subclass_feature") {
      const byClass = new Map<string, QueueRow[]>();
      for (const row of list) {
        const k = row.className ?? "?";
        if (!byClass.has(k)) byClass.set(k, []);
        byClass.get(k)!.push(row);
      }
      for (const [clsName, group] of byClass) {
        out.push(`### ${clsName} (${group.length})`);
        out.push("");
        group.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
        for (const row of group) {
          const qualifier = cat === "subclass_feature" ? ` — ${row.subclassName}` : "";
          out.push(`- **L${row.level} ${row.name}${qualifier}** [${row.status}]`);
        }
        out.push("");
      }
    } else if (cat === "optional_feature") {
      const byType = new Map<string, QueueRow[]>();
      for (const row of list) {
        const k = row.featureType?.[0] ?? "?";
        if (!byType.has(k)) byType.set(k, []);
        byType.get(k)!.push(row);
      }
      for (const [ft, group] of byType) {
        out.push(`### featureType = ${ft} (${group.length})`);
        out.push("");
        for (const row of group) {
          out.push(`- **${row.name}** [${row.status}]`);
        }
        out.push("");
      }
    } else {
      for (const row of list) {
        out.push(`- **${row.name}** [${row.status}]`);
      }
      out.push("");
    }
  }

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const rows = collectQueue();

// Compute repo root (3 levels up from packages/shared/scripts/)
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const outDir = path.join(repoRoot, ".testing");
fs.mkdirSync(outDir, { recursive: true });

const jsonPath = path.join(outDir, "migration-queue.json");
const mdPath = path.join(outDir, "migration-queue-summary.md");

fs.writeFileSync(
  jsonPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2),
);
fs.writeFileSync(mdPath, summary(rows));

// Console summary
const statusTotals: Record<MigrationStatus, number> = {
  empty: 0,
  note_only: 0,
  notes_plus_structure: 0,
  choices_only: 0,
  structured: 0,
  architectural_placeholder: 0,
};
for (const row of rows) statusTotals[row.status] += 1;

console.log("=".repeat(62));
console.log("  Migration Queue — Player-Build Surface");
console.log("=".repeat(62));
console.log(`  Total entities:           ${rows.length}`);
console.log(`  note_only:                ${statusTotals.note_only}`);
console.log(`  empty:                    ${statusTotals.empty}`);
console.log(`  notes_plus_structure:     ${statusTotals.notes_plus_structure}`);
console.log(`  choices_only:             ${statusTotals.choices_only}`);
console.log(`  structured:               ${statusTotals.structured}`);
console.log(`  architectural_placeholder:${statusTotals.architectural_placeholder}`);
console.log("=".repeat(62));
console.log(`  JSON:    ${path.relative(repoRoot, jsonPath)}`);
console.log(`  Summary: ${path.relative(repoRoot, mdPath)}`);
