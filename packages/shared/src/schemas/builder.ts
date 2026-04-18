import { z } from "zod";
import { abilitySchema } from "./effects";
import { abilityScoresSchema, characterTraitsSchema, characterAppearanceSchema } from "./character";

/**
 * Zod schema for BuilderState. Strips unknown keys by default (Zod's stripping
 * mode), which cleans up stale `equipment` / `currency` fields from older
 * snapshots automatically on parse.
 */

export const builderStepSchema = z.enum([
  "species",
  "background",
  "class",
  "abilities",
  "feats",
  "spells",
  "equipment",
  "details",
]);

export const featSelectionSchema = z.object({
  level: z.number(),
  classIndex: z.number().optional(),
  className: z.string().optional(),
  type: z.enum(["feat", "asi"]),
  featName: z.string().optional(),
  asiAbilities: z.partialRecord(abilitySchema, z.number()).optional(),
});

export const builderClassEntrySchema = z.object({
  name: z.string(),
  level: z.number(),
  subclass: z.string().nullable(),
  skills: z.array(z.string()),
  choices: z.record(z.string(), z.array(z.string())),
});

export const builderStateSchema = z.object({
  currentStep: builderStepSchema,
  completedSteps: z.array(builderStepSchema),

  // Step 1: Species
  species: z.string().nullable(),
  speciesChoices: z.record(z.string(), z.array(z.string())),

  // Step 2: Background
  background: z.string().nullable(),
  backgroundChoices: z.record(z.string(), z.array(z.string())),
  abilityScoreMode: z.enum(["two-one", "three-ones"]),
  abilityScoreAssignments: z.partialRecord(abilitySchema, z.number()),

  // Step 3: Class
  classes: z.array(builderClassEntrySchema),
  activeClassIndex: z.number(),

  // Step 4: Abilities
  abilityMethod: z.enum(["standard-array", "point-buy", "manual"]),
  baseAbilities: abilityScoresSchema,

  // Step 5: Feats & ASIs
  featSelections: z.array(featSelectionSchema),
  featChoices: z.record(z.string(), z.record(z.string(), z.array(z.string()))),

  // Step 6: Spells
  cantrips: z.record(z.string(), z.array(z.string())),
  preparedSpells: z.record(z.string(), z.array(z.string())),

  // Step 8: Details (Step 7 Equipment now lives in the dynamic inventory)
  name: z.string(),
  appearance: characterAppearanceSchema,
  backstory: z.string(),
  alignment: z.string(),
  traits: characterTraitsSchema,
});
