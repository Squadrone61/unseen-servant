#!/usr/bin/env tsx
/**
 * audit-data.ts — Phase 1 baseline coverage report
 *
 * Checks how much of the D&D 2024 database has been migrated to structured
 * EntityEffects. Informational only (exit 0) except for two hard failures:
 *   - A condition lacks `effects`
 *   - Any entity with `effects` fails entityEffectsSchema.safeParse()
 *
 * Run via: pnpm audit:data
 */

import {
  featsArray,
  speciesArray,
  backgroundsArray,
  classesArray,
  spellsArray,
  monstersArray,
  conditionsArray,
  magicItemsArray,
  baseItemsArray,
} from "../src/data/index.js";
import { entityEffectsSchema } from "../src/schemas/effects.js";
import type { FeatDb } from "../src/types/data.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CategoryReport {
  category: string;
  total: number;
  rows: Array<{ label: string; count: number; pct: string }>;
  errors: string[];
}

function pct(count: number, total: number): string {
  if (total === 0) return "  0%";
  return `${Math.round((count / total) * 100)
    .toString()
    .padStart(3)}%`;
}

function validateEffects(
  entities: Array<{ name: string; effects?: unknown }>,
  category: string,
): string[] {
  const errors: string[] = [];
  for (const entity of entities) {
    if (entity.effects === undefined) continue;
    const result = entityEffectsSchema.safeParse(entity.effects);
    if (!result.success) {
      errors.push(
        `[${category}] "${entity.name}": schema parse failed — ${result.error.issues[0]?.message ?? "unknown"}`,
      );
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Per-category auditors
// ---------------------------------------------------------------------------

function auditFeats(): CategoryReport {
  const total = featsArray.length;
  const withEffects = featsArray.filter((f) => f.effects !== undefined).length;
  const withChoices = featsArray.filter(
    (f) => f.choices !== undefined && f.choices.length > 0,
  ).length;
  const effectsOrChoices = featsArray.filter(
    (f) => f.effects !== undefined || (f.choices !== undefined && f.choices.length > 0),
  ).length;
  const neither = total - effectsOrChoices;
  // prerequisite is now the structured form (Prerequisite object), prerequisiteText is for display
  const withStructuredPrereq = featsArray.filter(
    (f) => (f as FeatDb).prerequisite !== undefined,
  ).length;

  const errors = validateEffects(featsArray, "feat");

  // Hard error: any feat without effects or choices is a migration gap
  const neitherFeats = featsArray.filter(
    (f) => f.effects === undefined && (f.choices === undefined || f.choices.length === 0),
  );
  for (const f of neitherFeats) {
    errors.push(`[feat] "${f.name}": missing effects and choices — migration incomplete`);
  }

  return {
    category: "Feats",
    total,
    rows: [
      { label: "with effects", count: withEffects, pct: pct(withEffects, total) },
      { label: "with choices[]", count: withChoices, pct: pct(withChoices, total) },
      { label: "effects or choices", count: effectsOrChoices, pct: pct(effectsOrChoices, total) },
      { label: "neither (legacy)", count: neither, pct: pct(neither, total) },
      {
        label: "prerequisite (structured)",
        count: withStructuredPrereq,
        pct: pct(withStructuredPrereq, total),
      },
    ],
    errors,
  };
}

function auditSpecies(): CategoryReport {
  const total = speciesArray.length;
  const withEffects = speciesArray.filter((s) => s.effects !== undefined).length;
  const withoutEffects = total - withEffects;

  const errors = validateEffects(speciesArray, "species");

  // Hard error: any species without effects
  for (const s of speciesArray) {
    if (s.effects === undefined) {
      errors.push(`[species] "${s.name}": missing effects`);
    }
  }

  return {
    category: "Species",
    total,
    rows: [
      { label: "with effects", count: withEffects, pct: pct(withEffects, total) },
      { label: "without effects (ERROR)", count: withoutEffects, pct: pct(withoutEffects, total) },
    ],
    errors,
  };
}

function auditBackgrounds(): CategoryReport {
  const total = backgroundsArray.length;
  const withEffects = backgroundsArray.filter((b) => b.effects !== undefined).length;
  const withoutEffects = total - withEffects;

  const errors = validateEffects(backgroundsArray, "background");

  // Hard error: any background without effects
  for (const b of backgroundsArray) {
    if (b.effects === undefined) {
      errors.push(`[background] "${b.name}": missing effects`);
    }
  }

  return {
    category: "Backgrounds",
    total,
    rows: [
      { label: "with effects", count: withEffects, pct: pct(withEffects, total) },
      { label: "without effects (ERROR)", count: withoutEffects, pct: pct(withoutEffects, total) },
    ],
    errors,
  };
}

function auditClasses(): CategoryReport {
  // Collect all features across all classes + subclasses
  const allFeatures = classesArray.flatMap((c) => [
    ...c.features,
    ...c.subclasses.flatMap((s) => s.features),
  ]);
  const totalFeatures = allFeatures.length;
  const featuresWithEffects = allFeatures.filter((f) => f.effects !== undefined).length;
  const featuresWithChoices = allFeatures.filter(
    (f) => f.choices !== undefined && f.choices.length > 0,
  ).length;

  // Verify every class has a L1 "Proficiencies" feature with effects
  const classesWithL1ProfFeature = classesArray.filter((c) =>
    c.features.some((f) => f.name === "Proficiencies" && f.level === 1 && f.effects !== undefined),
  ).length;

  const errors: string[] = [];
  for (const cls of classesArray) {
    // Hard error: every class must have a L1 Proficiencies feature with effects
    const l1Prof = cls.features.find((f) => f.name === "Proficiencies" && f.level === 1);
    if (!l1Prof || !l1Prof.effects) {
      errors.push(`[class] "${cls.name}": missing L1 Proficiencies feature with effects`);
    }

    for (const feature of [...cls.features, ...cls.subclasses.flatMap((s) => s.features)]) {
      if (feature.effects !== undefined) {
        const result = entityEffectsSchema.safeParse(feature.effects);
        if (!result.success) {
          errors.push(
            `[class feature] "${cls.name} / ${feature.name}": schema parse failed — ${result.error.issues[0]?.message ?? "unknown"}`,
          );
        }
      }
    }
  }

  return {
    category: "Classes",
    total: classesArray.length,
    rows: [
      {
        label: "classes total",
        count: classesArray.length,
        pct: pct(classesArray.length, classesArray.length),
      },
      {
        label: "features total",
        count: totalFeatures,
        pct: pct(totalFeatures, totalFeatures),
      },
      {
        label: "features with effects",
        count: featuresWithEffects,
        pct: pct(featuresWithEffects, totalFeatures),
      },
      {
        label: "features with choices",
        count: featuresWithChoices,
        pct: pct(featuresWithChoices, totalFeatures),
      },
      {
        label: "classes with L1 Proficiencies feature",
        count: classesWithL1ProfFeature,
        pct: pct(classesWithL1ProfFeature, classesArray.length),
      },
    ],
    errors,
  };
}

function auditSpells(): CategoryReport {
  const total = spellsArray.length;
  const withEffects = spellsArray.filter((s) => s.effects !== undefined).length;
  const withActionEffect = spellsArray.filter((s) => s.effects?.action !== undefined).length;
  // Legacy fields still on spell entries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withLegacyDamage = spellsArray.filter((s) => (s as any).damage !== undefined).length;

  const errors = validateEffects(spellsArray, "spell");

  return {
    category: "Spells",
    total,
    rows: [
      { label: "with effects", count: withEffects, pct: pct(withEffects, total) },
      {
        label: "with effects.action (ActionEffect)",
        count: withActionEffect,
        pct: pct(withActionEffect, total),
      },
      { label: "legacy damage field", count: withLegacyDamage, pct: pct(withLegacyDamage, total) },
    ],
    errors,
  };
}

function auditMonsters(): CategoryReport {
  const total = monstersArray.length;
  // Count monsters where at least one action has a structured ActionEffect
  const withActionEffect = monstersArray.filter((m) =>
    [...(m.action ?? []), ...(m.trait ?? []), ...(m.reaction ?? [])].some(
      (a) => a.action !== undefined,
    ),
  ).length;
  const withoutActionEffect = total - withActionEffect;

  const errors: string[] = [];
  // Monsters don't carry top-level effects yet, so just validate any action-level effects
  for (const monster of monstersArray) {
    const allActions = [
      ...(monster.action ?? []),
      ...(monster.trait ?? []),
      ...(monster.reaction ?? []),
      ...(monster.legendary ?? []),
    ];
    for (const action of allActions) {
      if (action.action !== undefined) {
        const result = entityEffectsSchema.safeParse({ action: action.action });
        if (!result.success) {
          errors.push(
            `[monster action] "${monster.name} / ${action.name}": schema parse failed — ${result.error.issues[0]?.message ?? "unknown"}`,
          );
        }
      }
    }
  }

  return {
    category: "Monsters",
    total,
    rows: [
      {
        label: "with at least one ActionEffect",
        count: withActionEffect,
        pct: pct(withActionEffect, total),
      },
      {
        label: "no ActionEffect (legacy entries[])",
        count: withoutActionEffect,
        pct: pct(withoutActionEffect, total),
      },
    ],
    errors,
  };
}

function auditConditions(): CategoryReport {
  const total = conditionsArray.length;
  const withEffects = conditionsArray.filter((c) => c.effects !== undefined).length;
  const missing = total - withEffects;

  const errors = validateEffects(conditionsArray, "condition");

  // Hard error: every condition MUST have effects
  const hardErrors = conditionsArray
    .filter((c) => c.effects === undefined)
    .map((c) => `[condition] "${c.name}": missing required effects`);

  return {
    category: "Conditions",
    total,
    rows: [
      { label: "with effects", count: withEffects, pct: pct(withEffects, total) },
      { label: "missing effects (ERROR)", count: missing, pct: pct(missing, total) },
    ],
    errors: [...errors, ...hardErrors],
  };
}

function auditItems(): CategoryReport {
  const total = magicItemsArray.length;
  const withEffects = magicItemsArray.filter((i) => i.effects !== undefined).length;
  const descriptionOnly = total - withEffects;

  const errors = validateEffects(magicItemsArray, "magic_item");

  // Also check base items
  const baseTotal = baseItemsArray.length;
  const baseWithEffects = baseItemsArray.filter((i) => i.effects !== undefined).length;
  const baseErrors = validateEffects(baseItemsArray, "base_item");

  return {
    category: "Items",
    total: total + baseTotal,
    rows: [
      {
        label: "magic items total",
        count: total,
        pct: pct(total, total + baseTotal),
      },
      {
        label: "magic items with effects",
        count: withEffects,
        pct: pct(withEffects, total),
      },
      {
        label: "magic items description-only",
        count: descriptionOnly,
        pct: pct(descriptionOnly, total),
      },
      {
        label: "base items total",
        count: baseTotal,
        pct: pct(baseTotal, total + baseTotal),
      },
      {
        label: "base items with effects",
        count: baseWithEffects,
        pct: pct(baseWithEffects, baseTotal),
      },
    ],
    errors: [...errors, ...baseErrors],
  };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function printReport(report: CategoryReport): void {
  const colW = 40;
  const sep = "-".repeat(colW + 20);
  console.log(`\n${report.category.toUpperCase()} (${report.total} total)`);
  console.log(sep);
  for (const row of report.rows) {
    const label = row.label.padEnd(colW);
    const count = row.count.toString().padStart(5);
    console.log(`  ${label} ${count}  ${row.pct}`);
  }
  if (report.errors.length > 0) {
    console.log(`\n  ERRORS (${report.errors.length}):`);
    for (const err of report.errors) {
      console.log(`    ! ${err}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const reports = [
  auditFeats(),
  auditSpecies(),
  auditBackgrounds(),
  auditClasses(),
  auditSpells(),
  auditMonsters(),
  auditConditions(),
  auditItems(),
];

console.log("=".repeat(62));
console.log("  Unseen Servant — Database Effects Coverage (Phase 1)");
console.log("=".repeat(62));

let hardFail = false;
for (const report of reports) {
  printReport(report);
  if (report.errors.length > 0) {
    // Only conditions-missing and schema-parse failures are hard errors
    const fatal = report.errors.filter(
      (e) => e.includes("missing required effects") || e.includes("schema parse failed"),
    );
    if (fatal.length > 0) {
      hardFail = true;
    }
  }
}

// Summary row
const totalEntities =
  featsArray.length +
  speciesArray.length +
  backgroundsArray.length +
  classesArray.length +
  spellsArray.length +
  monstersArray.length +
  conditionsArray.length +
  magicItemsArray.length +
  baseItemsArray.length;

const totalWithEffects =
  featsArray.filter((f) => f.effects !== undefined).length +
  speciesArray.filter((s) => s.effects !== undefined).length +
  backgroundsArray.filter((b) => b.effects !== undefined).length +
  classesArray
    .flatMap((c) => [...c.features, ...c.subclasses.flatMap((s) => s.features)])
    .filter((f) => f.effects !== undefined).length +
  spellsArray.filter((s) => s.effects !== undefined).length +
  conditionsArray.filter((c) => c.effects !== undefined).length +
  magicItemsArray.filter((i) => i.effects !== undefined).length +
  baseItemsArray.filter((i) => i.effects !== undefined).length;

console.log("\n" + "=".repeat(62));
console.log(`  Total entities: ${totalEntities}`);
console.log(
  `  With effects:   ${totalWithEffects} (${Math.round((totalWithEffects / totalEntities) * 100)}%)`,
);
console.log("=".repeat(62));

if (hardFail) {
  console.log("\n  RESULT: FAIL (schema errors or missing condition effects)");
  process.exit(1);
} else {
  console.log("\n  RESULT: PASS (informational — Phase 1 baseline)");
  process.exit(0);
}
