import { z } from "zod";
import type {
  EntityEffects,
  ActionEffect,
  ActionOutcome,
  Property,
  Prerequisite,
  EffectPredicate,
} from "../types/effects";

/**
 * Source-of-truth schemas for the effect system.
 *
 * Convention for this repo: when a type is a closed set of string literals
 * (enums, discriminated-union tags), define the Zod schema here and derive
 * the TS type via `z.infer` — never hand-write both sides. The
 * `schema-type-equivalence.test.ts` file enforces this at compile time.
 *
 * Exception: the recursive trio `EntityEffects` / `ActionEffect` /
 * `ActionOutcome` stays hand-written in `types/effects.ts` because Zod
 * recursive schemas need a `z.ZodType<T>` annotation pointing at a
 * pre-existing type. The schemas below reference those hand-written types
 * as annotation targets.
 */

// ---------------------------------------------------------------------------
// Closed-set enums (leaves)
// ---------------------------------------------------------------------------

export const abilitySchema = z.enum([
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
]);

export const damageTypeSchema = z.enum([
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
]);

export const skillSchema = z.enum([
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival",
]);

export const conditionNameSchema = z.enum([
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
]);

export const senseTypeSchema = z.enum(["darkvision", "blindsight", "tremorsense", "truesight"]);

export const entityCategorySchema = z.enum([
  "condition",
  "spell",
  "action",
  "item",
  "class",
  "feat",
  "species",
  "background",
  "disease",
  "status",
  "rule",
]);

export const modifierTargetSchema = z.enum([
  "hp",
  "ac",
  "initiative",
  "speed",
  "speed_fly",
  "speed_swim",
  "speed_climb",
  "speed_burrow",
  "spell_save_dc",
  "spell_attack",
  "attack",
  "attack_melee",
  "attack_ranged",
  "attack_spell",
  "damage",
  "damage_melee",
  "damage_ranged",
  "damage_spell",
  "save",
  "save_strength",
  "save_dexterity",
  "save_constitution",
  "save_intelligence",
  "save_wisdom",
  "save_charisma",
  "d20",
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
  "strength_check",
  "dexterity_check",
  "constitution_check",
  "intelligence_check",
  "wisdom_check",
  "charisma_check",
  "passive_perception",
  "passive_investigation",
]);

export const advantageTargetSchema = z.enum([
  "attack",
  "attack_melee",
  "attack_ranged",
  "attack_spell",
  "save",
  "save_strength",
  "save_dexterity",
  "save_constitution",
  "save_intelligence",
  "save_wisdom",
  "save_charisma",
  "ability_check",
  "strength_check",
  "dexterity_check",
  "constitution_check",
  "intelligence_check",
  "wisdom_check",
  "charisma_check",
  "acrobatics",
  "animal_handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight_of_hand",
  "stealth",
  "survival",
  "initiative",
  "concentration",
  "death_save",
]);

// ---------------------------------------------------------------------------
// Prerequisite (recursive — anyOf/allOf can nest Prerequisite[])
// ---------------------------------------------------------------------------

/**
 * Structured prerequisite for feats and optional features.
 * Uses z.lazy for the recursive anyOf/allOf branches following the
 * same pattern as actionOutcomeSchema above.
 */
export const prerequisiteSchema: z.ZodType<Prerequisite> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("level"), value: z.number() }),
    z.object({
      type: z.literal("ability"),
      ability: abilitySchema,
      min: z.number(),
    }),
    z.object({ type: z.literal("species"), species: z.string() }),
    z.object({ type: z.literal("feature"), featureName: z.string() }),
    z.object({ type: z.literal("spellcasting") }),
    z.object({ type: z.literal("anyOf"), of: z.array(prerequisiteSchema) }),
    z.object({ type: z.literal("allOf"), of: z.array(prerequisiteSchema) }),
  ]),
);

// ---------------------------------------------------------------------------
// EffectSource / EffectLifetime (the originals from v0.41.0)
// ---------------------------------------------------------------------------

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
  "monster",
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

// ---------------------------------------------------------------------------
// EffectPredicate
// ---------------------------------------------------------------------------

/**
 * Structured predicate the resolver evaluates against an EffectContext
 * (target bundles, caster names). See `EffectPredicate` in types/effects.ts.
 */
export const effectPredicateSchema: z.ZodType<EffectPredicate> = z.object({
  targetHasEffect: z
    .object({
      feature: z.string(),
      caster: z.string().optional(),
    })
    .optional(),
  exceptTargetIs: z
    .object({
      caster: z.string(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Modifier
// ---------------------------------------------------------------------------

export const modifierSchema = z.object({
  target: modifierTargetSchema,
  value: z.union([z.number(), z.string()]),
  operation: z.enum(["add", "set"]).optional(),
  condition: z.string().optional(),
  when: effectPredicateSchema.optional(),
});

// ---------------------------------------------------------------------------
// Property (discriminated union, with shared optional `condition`)
// ---------------------------------------------------------------------------

const damageTypeOrAllSchema = z.union([damageTypeSchema, z.literal("all")]);

/**
 * Zod 4's `z.discriminatedUnion` requires each branch to be a `z.ZodObject`.
 * The shared `condition?: string` field is replicated on every branch so the
 * inferred type matches the hand-written `{ condition?: string } & (...)`
 * intersection. This is verbose but keeps narrowing working at parse time.
 */
export const propertySchema: z.ZodType<Property> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("resistance"),
    damageType: damageTypeOrAllSchema,
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("immunity"),
    damageType: damageTypeOrAllSchema,
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("vulnerability"),
    damageType: damageTypeOrAllSchema,
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("condition_immunity"),
    conditionName: conditionNameSchema,
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("proficiency"),
    category: z.enum(["armor", "weapon", "tool", "skill", "save", "language"]),
    value: z.string(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("expertise"),
    skill: skillSchema,
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("sense"),
    sense: senseTypeSchema,
    range: z.number(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("advantage"),
    on: advantageTargetSchema,
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("disadvantage"),
    on: advantageTargetSchema,
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("spell_grant"),
    spell: z.string(),
    // Template-literal `${number}/${"short"|"long"}_rest` isn't expressible
    // as a plain Zod schema; `z.custom` lets us validate with a regex while
    // keeping the narrow TS type from the hand-written `Property` union.
    usage: z.custom<"at_will" | "always_prepared" | `${number}/${"short" | "long"}_rest`>(
      (v) =>
        typeof v === "string" &&
        (v === "at_will" || v === "always_prepared" || /^\d+\/(short|long)_rest$/.test(v)),
      { message: "expected 'at_will' | 'always_prepared' | '<N>/<short|long>_rest'" },
    ),
    minLevel: z.number().optional(),
    castingAbility: abilitySchema.optional(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("resource"),
    name: z.string(),
    maxUses: z.union([z.number(), z.string()]),
    longRest: z.union([z.number(), z.literal("all")]),
    shortRest: z.union([z.number(), z.literal("all")]).optional(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("extra_attack"),
    count: z.number(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("weapon_mastery_grant"),
    weapon: z.string(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("metamagic_grant"),
    metamagic: z.string(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("natural_weapon"),
    name: z.string(),
    damage: z.string(),
    damageType: damageTypeSchema,
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("score_cap"),
    ability: abilitySchema,
    max: z.number(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("roll_minimum"),
    on: advantageTargetSchema,
    min: z.union([z.number(), z.string()]),
    mode: z.enum(["d20", "total"]).optional(),
    proficientOnly: z.boolean().optional(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("crit_rider"),
    weaponDamageType: z.enum(["bludgeoning", "slashing", "piercing"]),
    effect: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("extra_die") }),
      z.object({ kind: z.literal("advantage_next_attack") }),
      z.object({ kind: z.literal("target_disadvantage_attacks") }),
    ]),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("grant"),
    grant: z.string(),
    grantType: entityCategorySchema,
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("note"),
    text: z.string(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("damage_reduction"),
    damageTypes: z.array(damageTypeOrAllSchema).optional(),
    amount: z.union([z.number(), z.string()]),
    trigger: z.enum(["passive", "reaction"]).optional(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("save_outcome_override"),
    ability: abilitySchema,
    saveEffect: z.literal("evasion"),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("bonus_action_grant"),
    actions: z.array(z.string()),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("ignore_resistance"),
    damageTypes: z.array(damageTypeSchema),
    scope: z.literal("spells").optional(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("inspiration_grant"),
    targets: z.enum(["self", "allies"]),
    count: z.string().optional(),
    timing: z.enum(["long_rest", "short_rest", "rest", "combat_start_of_turn"]),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("concentration_immunity"),
    spell: z.string(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("suppress_advantage"),
    against: z.literal("attacks"),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("teleport_grant"),
    distance: z.number(),
    timing: z.string(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("spellcasting_focus"),
    item: z.string(),
    ability: abilitySchema.optional(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("feat_grant"),
    category: z.enum(["Origin", "General", "Fighting Style"]),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("shapechange"),
    action: z.enum(["action", "bonus_action"]),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
  z.object({
    type: z.literal("tracked_by"),
    feature: z.string(),
    caster: z.string(),
    condition: z.string().optional(),
    when: effectPredicateSchema.optional(),
  }),
]);

// ---------------------------------------------------------------------------
// ActionOutcome / ActionEffect / EntityEffects — recursive trio
//
// These three refer to each other (`ActionOutcome.applyEffects: EntityEffects`,
// `EntityEffects.action: ActionEffect`, `ActionEffect.onHit: ActionOutcome`).
// Zod's `z.lazy` resolves the cycle; the `z.ZodType<T>` annotation gives TS
// the final type immediately so downstream `z.infer` sees the structural
// shape (not `unknown`). The hand-written interfaces in `types/effects.ts`
// serve as the annotation targets — they are the single source of the type.
// ---------------------------------------------------------------------------

const damageEntrySchema = z.object({
  dice: z.string(),
  type: damageTypeSchema,
});

const diceOnlySchema = z.object({ dice: z.string() });

const applyConditionEntrySchema = z.object({
  name: conditionNameSchema,
  duration: effectLifetimeSchema.optional(),
  repeatSave: z.enum(["start", "end"]).optional(),
});

const forcedMovementSchema = z.object({
  push: z.number().optional(),
  pull: z.number().optional(),
  knockProne: z.boolean().optional(),
});

export const actionOutcomeSchema: z.ZodType<ActionOutcome> = z.lazy(() =>
  z.object({
    damage: z.array(damageEntrySchema).optional(),
    healing: diceOnlySchema.optional(),
    tempHp: diceOnlySchema.optional(),
    applyEffects: entityEffectsSchema.optional(),
    applyConditions: z.array(applyConditionEntrySchema).optional(),
    forcedMovement: forcedMovementSchema.optional(),
    note: z.string().optional(),
  }),
);

/**
 * `Partial<ActionOutcome>` equivalent for `upcast.perLevel` and
 * `cantripScaling[].outcome`. We duplicate the shape rather than calling
 * `.partial()` so it stays annotatable against the hand-written
 * `Partial<ActionOutcome>` type. `z.infer` of this object type is equal to
 * `Partial<ActionOutcome>` since every field is already `.optional()`.
 */
const partialActionOutcomeSchema: z.ZodType<Partial<ActionOutcome>> = z.lazy(() =>
  z.object({
    damage: z.array(damageEntrySchema).optional(),
    healing: diceOnlySchema.optional(),
    tempHp: diceOnlySchema.optional(),
    applyEffects: entityEffectsSchema.optional(),
    applyConditions: z.array(applyConditionEntrySchema).optional(),
    forcedMovement: forcedMovementSchema.optional(),
    note: z.string().optional(),
  }),
);

export const actionEffectSchema: z.ZodType<ActionEffect> = z.lazy(() =>
  z.object({
    kind: z.enum(["attack", "save", "auto"]),
    attack: z
      .object({
        bonus: z.enum(["spell_attack", "weapon_melee", "weapon_ranged", "monster"]),
        range: z
          .union([
            z.object({ normal: z.number(), long: z.number().optional() }),
            z.literal("touch"),
            z.literal("self"),
          ])
          .optional(),
        reach: z.number().optional(),
      })
      .optional(),
    save: z
      .object({
        ability: abilitySchema,
        dc: z.union([z.literal("spell_save_dc"), z.number()]),
        onSuccess: z.enum(["half", "none", "negates"]),
      })
      .optional(),
    area: z
      .object({
        shape: z.enum(["sphere", "cone", "line", "cube", "cylinder"]),
        size: z.number(),
      })
      .optional(),
    targeting: z
      .object({
        type: z.enum(["self", "creature", "creatures", "point", "area"]),
        count: z.number().optional(),
      })
      .optional(),
    onHit: actionOutcomeSchema.optional(),
    onMiss: actionOutcomeSchema.optional(),
    onFailedSave: actionOutcomeSchema.optional(),
    onSuccessfulSave: actionOutcomeSchema.optional(),
    upcast: z
      .object({
        perLevel: partialActionOutcomeSchema.optional(),
      })
      .optional(),
    cantripScaling: z
      .array(
        z.object({
          level: z.number(),
          outcome: partialActionOutcomeSchema,
        }),
      )
      .optional(),
    meta: z
      .object({
        castingTime: z.string().optional(),
        components: z.array(z.string()).optional(),
        ritual: z.boolean().optional(),
        concentration: z.boolean().optional(),
      })
      .optional(),
    cost: z
      .object({
        resource: z.string(),
        amount: z.union([z.number(), z.string()]),
      })
      .optional(),
  }),
);

export const entityEffectsSchema: z.ZodType<EntityEffects> = z.lazy(() =>
  z.object({
    modifiers: z.array(modifierSchema).optional(),
    properties: z.array(propertySchema).optional(),
    action: actionEffectSchema.optional(),
  }),
);

// ---------------------------------------------------------------------------
// EffectBundle (now structural — effects is the full EntityEffects)
// ---------------------------------------------------------------------------

/**
 * Schema for the unified target-bundle tracking tag. Replaces v0.x
 * `sourceConcentration` (kind: "spell") and `sourceActivation` (kind: "feature")
 * fields. Old snapshots are upgraded on parse via `effectBundleSchema`'s
 * preprocess step.
 */
export const sourceTrackedSchema = z.object({
  caster: z.string(),
  identifier: z.object({
    kind: z.enum(["spell", "feature"]),
    name: z.string(),
  }),
});

/**
 * Parse-time upgrader for legacy `sourceConcentration` / `sourceActivation`
 * shapes. Maps:
 *   { sourceConcentration: { caster, spell } }
 *   → { sourceTracked: { caster, identifier: { kind: "spell", name: spell } } }
 *   { sourceActivation: { caster, feature } }
 *   → { sourceTracked: { caster, identifier: { kind: "feature", name: feature } } }
 * If `sourceTracked` is already present, the legacy fields are dropped.
 * Returns the input unchanged for non-objects (Zod will surface the type error).
 */
function upgradeLegacyBundleTags(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const obj = input as Record<string, unknown>;
  if (obj.sourceTracked !== undefined) {
    // New shape already present — strip any leftover legacy fields.
    if ("sourceConcentration" in obj || "sourceActivation" in obj) {
      const { sourceConcentration: _sc, sourceActivation: _sa, ...rest } = obj;
      return rest;
    }
    return obj;
  }
  const sc = obj.sourceConcentration as { caster?: string; spell?: string } | undefined;
  if (sc && typeof sc.caster === "string" && typeof sc.spell === "string") {
    const { sourceConcentration: _sc, sourceActivation: _sa, ...rest } = obj;
    return {
      ...rest,
      sourceTracked: {
        caster: sc.caster,
        identifier: { kind: "spell", name: sc.spell },
      },
    };
  }
  const sa = obj.sourceActivation as { caster?: string; feature?: string } | undefined;
  if (sa && typeof sa.caster === "string" && typeof sa.feature === "string") {
    const { sourceConcentration: _sc, sourceActivation: _sa, ...rest } = obj;
    return {
      ...rest,
      sourceTracked: {
        caster: sa.caster,
        identifier: { kind: "feature", name: sa.feature },
      },
    };
  }
  return obj;
}

export const effectBundleSchema = z.preprocess(
  upgradeLegacyBundleTags,
  z.object({
    id: z.string(),
    source: effectSourceSchema,
    lifetime: effectLifetimeSchema,
    effects: entityEffectsSchema,
    sourceTracked: sourceTrackedSchema.optional(),
  }),
);
