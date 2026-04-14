import { z } from "zod";
import { effectBundleSchema } from "./effects";

/**
 * Character schemas that need to be importable from BOTH `messages.ts` and
 * `game-state.ts` without creating a cycle. Specifically, `game-state.ts`
 * needs `characterDynamicDataSchema` for `gameEventSchema.stateBefore`, and
 * `messages.ts` needs it (and its dep chain) for `characterDataSchema`.
 *
 * Placing these schemas in a separate leaf module (no deps on `messages.ts`
 * or `game-state.ts`) keeps the import graph acyclic. The types in
 * `types/character.ts` and `types/game-state.ts` are kept in sync via the
 * `schema-type-equivalence.test.ts` guard rail.
 */

// ─── Conditions (moved out of game-state.ts so character schemas can reuse) ───

export const conditionEntrySchema = z.object({
  name: z.string(),
  duration: z.number().optional(),
  startRound: z.number().optional(),
  endsOnLongRest: z.boolean().optional(),
  expiresAt: z.enum(["start-of-turn", "end-of-turn"]).optional(),
});

// ─── Item ───

const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;

export const itemWeaponSchema = z.object({
  damage: z.string(),
  damageType: z.enum(DAMAGE_TYPES),
  properties: z.array(z.string()).optional(),
  mastery: z.string().optional(),
  range: z.string().optional(),
  versatile: z.string().optional(),
});

export const itemArmorSchema = z.object({
  type: z.enum(["light", "medium", "heavy", "shield"]),
  baseAc: z.number(),
  dexCap: z.number().optional(),
  strReq: z.number().optional(),
  stealthDisadvantage: z.boolean().optional(),
});

export const itemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  equipped: z.boolean(),
  attuned: z.boolean().optional(),
  weight: z.number().optional(),
  rarity: z.string().optional(),
  attunement: z.boolean().optional(),
  description: z.string().optional(),
  fromPack: z.string().optional(),
  weapon: itemWeaponSchema.optional(),
  armor: itemArmorSchema.optional(),
});

// ─── Spell slot / death saves / currency ───

export const spellSlotLevelSchema = z.object({
  level: z.number(),
  total: z.number(),
  used: z.number(),
});

export const deathSavesSchema = z.object({
  successes: z.number(),
  failures: z.number(),
});

export const currencySchema = z.object({
  cp: z.number(),
  sp: z.number(),
  gp: z.number(),
  pp: z.number(),
});

// ─── CharacterDynamicData ───

export const characterDynamicDataSchema = z.object({
  currentHP: z.number(),
  tempHP: z.number(),
  spellSlotsUsed: z.array(spellSlotLevelSchema),
  pactMagicSlots: z.array(spellSlotLevelSchema).optional(),
  resourcesUsed: z.record(z.string(), z.number()).optional(),
  conditions: z.array(conditionEntrySchema),
  exhaustionLevel: z.number().optional(),
  deathSaves: deathSavesSchema,
  inventory: z.array(itemSchema),
  currency: currencySchema,
  heroicInspiration: z.boolean().optional(),
  concentratingOn: z.object({ spellName: z.string(), since: z.number().optional() }).optional(),
  activeEffects: z.array(effectBundleSchema).optional(),
});
