import { z } from "zod";

/**
 * Source-of-truth schemas for the small, closed-set parts of the effect system
 * that previously drifted between `types/effects.ts` and `schemas/messages.ts`.
 *
 * The convention for this repo: when a type is a closed set of string literals
 * (enums, discriminated-union tags), define the Zod schema here and derive the
 * TS type via `z.infer`. Never hand-write both sides.
 */

export const effectSourceTypeSchema = z.enum([
  "species",
  "class",
  "subclass",
  "feat",
  "background",
  "ability",
  "item",
  "spell",
  "condition",
  "environment",
]);

export const effectSourceSchema = z.object({
  type: effectSourceTypeSchema,
  name: z.string(),
  featureName: z.string().optional(),
  level: z.number().optional(),
});

export const effectLifetimeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("permanent") }),
  z.object({ type: z.literal("concentration") }),
  z.object({ type: z.literal("duration"), rounds: z.number() }),
  z.object({ type: z.literal("until_rest"), rest: z.enum(["short", "long"]) }),
  z.object({ type: z.literal("manual") }),
]);
