// Zod schemas for EncounterBundle (mirrors types/encounter-bundle.ts).

import { z } from "zod";

export const encounterDifficultySchema = z.enum(["low", "moderate", "high", "deadly"]);

export const bundleAbilityKindSchema = z.enum(["attack", "spell", "trait", "reaction", "lair"]);

export const characterSpeedSchema = z.object({
  walk: z.number(),
  fly: z.number().optional(),
  swim: z.number().optional(),
  climb: z.number().optional(),
  burrow: z.number().optional(),
});

export const bundleAbilitySchema = z.object({
  name: z.string(),
  actionRef: z.string().optional(),
  kind: bundleAbilityKindSchema,
  summary: z.string(),
  trigger: z.string().optional(),
  uses: z
    .object({
      perRound: z.number().optional(),
      perEncounter: z.number().optional(),
      recharge: z.string().optional(),
    })
    .optional(),
});

export const bundleCombatantSchema = z.object({
  name: z.string(),
  monsterRef: z.string(),
  hp: z.number(),
  ac: z.number(),
  speed: characterSpeedSchema,
  intelligence: z.number(),
  tacticsNote: z.string().optional(),
  abilities: z.array(bundleAbilitySchema),
});

export const bundleOpeningPositionSchema = z.object({
  name: z.string(),
  pos: z.string(),
});

export const encounterBundleSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be kebab-case alphanumeric"),
  createdSession: z.number().int().nonnegative(),
  createdAt: z.string(),
  difficulty: encounterDifficultySchema,
  partySnapshot: z.array(z.object({ name: z.string(), level: z.number().int().positive() })),
  combatants: z.array(bundleCombatantSchema),
  mapName: z.string(),
  openingPositions: z.array(bundleOpeningPositionSchema),
  tacticsHint: z.string().optional(),
  citations: z.array(z.string()),
});
