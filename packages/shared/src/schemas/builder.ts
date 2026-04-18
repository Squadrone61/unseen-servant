import { z } from "zod";
import { abilitySchema } from "./effects";
import { abilityScoresSchema, characterAppearanceSchema } from "./character";

/**
 * Zod schema for BuilderState. Strips unknown keys by default (Zod's stripping
 * mode), which cleans up stale `equipment` / `currency` / `currentStep` /
 * `completedSteps` / `activeClassIndex` / `traits` fields from older snapshots
 * automatically on parse. Those fields were transient UI state or duplicated
 * with `static.traits` — `buildCharacter(state, { traits, inventory, currency })`
 * is the single entry for their runtime values.
 */

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

  // Step 4: Abilities
  abilityMethod: z.enum(["standard-array", "point-buy", "manual"]),
  baseAbilities: abilityScoresSchema,

  // Step 5: Feats & ASIs
  featSelections: z.array(featSelectionSchema),
  featChoices: z.record(z.string(), z.record(z.string(), z.array(z.string()))),

  // Step 6: Spells
  cantrips: z.record(z.string(), z.array(z.string())),
  preparedSpells: z.record(z.string(), z.array(z.string())),

  // Step 8: Details (Step 7 Equipment lives in the dynamic inventory; traits
  // lives in static.traits — both handled by sibling stores during building.)
  name: z.string(),
  appearance: characterAppearanceSchema,
  backstory: z.string(),
  alignment: z.string(),
});
