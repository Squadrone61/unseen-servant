#!/usr/bin/env tsx
/**
 * Converts a campaign character JSON (from D&D Beyond import snapshots)
 * into an .aidnd.json file with best-effort derived builderChoices.
 *
 * Usage: npx tsx scripts/derive-aidnd.ts .testing/shulakh.json
 * Output: .testing/shulakh.aidnd.json
 */

import { readFileSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";

const KNOWN_FIGHTING_STYLES = [
  "Archery",
  "Defense",
  "Dueling",
  "Great Weapon Fighting",
  "Protection",
  "Two-Weapon Fighting",
];

const EQUIPMENT_TYPE_MAP: Record<string, string> = {
  Weapon: "weapon",
  Armor: "armor",
  Shield: "armor",
  Tool: "tool",
};

function deriveAidnd(inputPath: string) {
  const raw = JSON.parse(readFileSync(inputPath, "utf-8"));
  const { static: s, dynamic: d } = raw;

  // Feature choices (best-effort)
  const featureChoices: Record<string, string[]> = {};

  // Detect fighting style from feat-sourced features
  const hasFightingStyleFeature = s.features?.some(
    (f: any) => f.name === "Fighting Style" && f.source === "class"
  );
  if (hasFightingStyleFeature) {
    const styleFeat = s.features?.find(
      (f: any) =>
        f.source === "feat" && KNOWN_FIGHTING_STYLES.includes(f.name)
    );
    if (styleFeat) {
      featureChoices["Fighting Style"] = [styleFeat.name];
    }
  }

  // Equipment mapping
  const equipment = (d.inventory ?? []).map((item: any) => ({
    name: item.name,
    quantity: item.quantity ?? 1,
    equipped: item.equipped ?? false,
    source: EQUIPMENT_TYPE_MAP[item.type] ?? "gear",
    description: item.description,
    ...(item.type === "Weapon" && {
      damage: item.damage,
      damageType: item.damageType,
      properties: item.properties,
    }),
    ...(item.type === "Armor" && {
      armorClass: item.armorClass,
    }),
  }));

  const builderChoices = {
    species: s.race ?? null,
    nameFromSpeciesStep: "",
    speciesChoices: {},
    background: null,
    className: s.classes?.[0]?.name ?? null,
    level: s.classes?.[0]?.level ?? 1,
    subclass: s.classes?.[0]?.subclass ?? null,
    featureChoices,
    weaponMasteries: [] as string[],
    abilityMethod: "manual",
    baseAbilities: s.abilities ?? {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    asiMode: "two-one",
    asiAssignments: {},
    asiSelections: [] as string[],
    originFeatOverrides: {},
    skillProficiencies: (s.skills ?? [])
      .filter((sk: any) => sk.proficient)
      .map((sk: any) => sk.name),
    skillExpertise: (s.skills ?? [])
      .filter((sk: any) => sk.expertise)
      .map((sk: any) => sk.name),
    selectedCantrips: (s.spells ?? [])
      .filter((sp: any) => sp.level === 0 && sp.spellSource === "class")
      .map((sp: any) => sp.name),
    selectedSpells: (s.spells ?? [])
      .filter(
        (sp: any) =>
          sp.level > 0 && sp.spellSource === "class" && !sp.alwaysPrepared
      )
      .map((sp: any) => sp.name),
    equipment,
    currency: d.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    name: s.name ?? "",
    alignment: "",
    backstory: "",
    appearance: s.appearance ?? {},
    traits: s.traits ?? {},
  };

  const output = {
    format: "aidnd",
    version: 1,
    exportedAt: new Date().toISOString(),
    character: { static: s, dynamic: d },
    builderChoices,
  };

  const inputBasename = basename(inputPath, ".json");
  const outputPath = join(dirname(inputPath), `${inputBasename}.aidnd.json`);
  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`Wrote ${outputPath}`);
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npx tsx scripts/derive-aidnd.ts <input.json>");
  process.exit(1);
}

deriveAidnd(inputPath);
