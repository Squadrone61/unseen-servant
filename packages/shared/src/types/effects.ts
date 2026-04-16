// === Universal Effect System Types ===
//
// Every mechanical source (species, class features, feats, items, conditions, spells)
// contributes structured effects using these shared types. Effects live in the database
// and are resolved at stat-computation time rather than hard-coded in builder logic.
//
// Key concepts:
//   - EntityEffects: pure mechanical payload with no identity or lifetime metadata
//   - EffectBundle: runtime wrapper that adds id, source, and lifetime to EntityEffects
//   - Modifier values can be plain numbers OR expression strings (see Value Notation below)
//   - Property is a discriminated union of categorical bonuses (resistance, sense, etc.)
//
// Value Notation Language:
//   Modifier values can be expressions evaluated against character context:
//     Atoms: str/dex/con/int/wis/cha (ability modifier), prof, half_prof, lvl, clvl, NdM dice, numbers
//     Operators: +, -, *
//     Functions:
//       min(a,b), max(a,b)
//       table(L:V, ...)     — class-level keyed lookup (uses clvl, falls back to totalLevel)
//       table_lvl(L:V, ...) — character-level keyed lookup (always uses totalLevel)
//       table_prof(P:V, ...) — proficiency-bonus keyed lookup (uses proficiencyBonus)
//   Examples:
//     "10 + dex + con"             — Unarmored Defense (Barbarian)
//     "table(1:2, 9:3, 16:4)"      — Rage damage bonus by class level
//     "table_lvl(1:2, 5:3, 11:4)"  — cantrip damage dice by character level
//     "table_prof(2:1, 4:2, 6:3)"  — uses per proficiency bonus tier
//     "max(cha, 1)"                — Bardic Inspiration uses (minimum 1)
//     "2 * lvl"                    — Tough feat HP bonus
//     "prof"                       — Alert initiative bonus
//     5                            — Shield spell AC bonus (plain number, always valid)
//
// The 80/20 boundary:
//   Common mechanics (resistance, sense, proficiency, advantage, spell grants, resources,
//   extra attacks) are typed as structured Properties. Mechanics too complex or rare to
//   type get a { type: "note"; text: string } — the AI DM reads the text instead.

import type { z } from "zod";
import type { effectSourceSchema, effectLifetimeSchema } from "../schemas/effects";
import type { AbilityScores } from "./character";

// ---------------------------------------------------------------------------
// Shared Enumerations
// ---------------------------------------------------------------------------

/** The six ability scores. Lowercase to match AbilityScores property keys. */
export type Ability =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

/** All D&D damage types. Used in weapon/spell data and effect properties. */
export type DamageType =
  | "acid"
  | "bludgeoning"
  | "cold"
  | "fire"
  | "force"
  | "lightning"
  | "necrotic"
  | "piercing"
  | "poison"
  | "psychic"
  | "radiant"
  | "slashing"
  | "thunder";

/** The 18 D&D 2024 skills (display names). */
export type Skill =
  | "Acrobatics"
  | "Animal Handling"
  | "Arcana"
  | "Athletics"
  | "Deception"
  | "History"
  | "Insight"
  | "Intimidation"
  | "Investigation"
  | "Medicine"
  | "Nature"
  | "Perception"
  | "Performance"
  | "Persuasion"
  | "Religion"
  | "Sleight of Hand"
  | "Stealth"
  | "Survival";

/** The 15 D&D 2024 conditions. */
export type ConditionName =
  | "Blinded"
  | "Charmed"
  | "Deafened"
  | "Exhaustion"
  | "Frightened"
  | "Grappled"
  | "Incapacitated"
  | "Invisible"
  | "Paralyzed"
  | "Petrified"
  | "Poisoned"
  | "Prone"
  | "Restrained"
  | "Stunned"
  | "Unconscious";

/** Sensory modes that can be granted by effects. */
export type SenseType = "darkvision" | "blindsight" | "tremorsense" | "truesight";

/**
 * Entity category — shared vocabulary for grant references and rich text links.
 * Matches the {category:name} syntax in description strings.
 */
export type EntityCategory =
  | "condition"
  | "spell"
  | "action"
  | "item"
  | "class"
  | "feat"
  | "species"
  | "background"
  | "disease"
  | "status"
  | "rule";

// ---------------------------------------------------------------------------
// ModifierTarget
// ---------------------------------------------------------------------------

/**
 * The stat that a Modifier applies to. Hierarchical targets ("attack") are
 * parents of specifics ("attack_melee") — resolvers should expand parents to
 * all children so that a broad modifier covers all subtypes.
 */
export type ModifierTarget =
  | "hp"
  | "ac"
  | "initiative"
  | "speed"
  | "speed_fly"
  | "speed_swim"
  | "speed_climb"
  | "speed_burrow"
  | "spell_save_dc"
  | "spell_attack"
  | "attack"
  | "attack_melee"
  | "attack_ranged"
  | "attack_spell"
  | "damage"
  | "damage_melee"
  | "damage_ranged"
  | "damage_spell"
  | "save"
  | "save_strength"
  | "save_dexterity"
  | "save_constitution"
  | "save_intelligence"
  | "save_wisdom"
  | "save_charisma"
  | "d20"
  // Ability scores (for items like Gauntlets of Ogre Power that set a score)
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma"
  // Ability checks (bonus to all checks using that ability)
  | "strength_check"
  | "dexterity_check"
  | "constitution_check"
  | "intelligence_check"
  | "wisdom_check"
  | "charisma_check"
  // Passive scores (additive bonuses from feats like Observant)
  | "passive_perception"
  | "passive_investigation";

// ---------------------------------------------------------------------------
// AdvantageTarget
// ---------------------------------------------------------------------------

/**
 * What an advantage or disadvantage applies to. Covers attacks, saves,
 * ability checks (by ability), individual skills, and special roll types.
 */
export type AdvantageTarget =
  // Attacks (same hierarchy as ModifierTarget)
  | "attack"
  | "attack_melee"
  | "attack_ranged"
  | "attack_spell"
  // Saving throws (same hierarchy as ModifierTarget)
  | "save"
  | "save_strength"
  | "save_dexterity"
  | "save_constitution"
  | "save_intelligence"
  | "save_wisdom"
  | "save_charisma"
  // Ability checks (by ability)
  | "ability_check"
  | "strength_check"
  | "dexterity_check"
  | "constitution_check"
  | "intelligence_check"
  | "wisdom_check"
  | "charisma_check"
  // Individual skills (all 18 D&D 2024 skills)
  | "acrobatics"
  | "animal_handling"
  | "arcana"
  | "athletics"
  | "deception"
  | "history"
  | "insight"
  | "intimidation"
  | "investigation"
  | "medicine"
  | "nature"
  | "perception"
  | "performance"
  | "persuasion"
  | "religion"
  | "sleight_of_hand"
  | "stealth"
  | "survival"
  // Special
  | "initiative"
  | "concentration"
  | "death_save";

// ---------------------------------------------------------------------------
// Prerequisite
// ---------------------------------------------------------------------------

/**
 * Structured prerequisite for feats and optional features.
 * Replaces the free-text `prerequisite?: string` field for machine-readable
 * enforcement. During Phase 1 both fields coexist — `prerequisiteText` for
 * display, `prerequisiteStructured` for future validation.
 */
export type Prerequisite =
  | { type: "level"; value: number }
  | { type: "ability"; ability: Ability; min: number }
  | { type: "species"; species: string }
  | { type: "feature"; featureName: string }
  | { type: "spellcasting" }
  | { type: "anyOf"; of: Prerequisite[] }
  | { type: "allOf"; of: Prerequisite[] };

// ---------------------------------------------------------------------------
// Modifier
// ---------------------------------------------------------------------------

/**
 * A numeric bonus or formula applied to a specific stat.
 *
 * Operations:
 *   "add" (default) — stacks with all other add modifiers.
 *   "set"           — provides a base value; highest "set" wins, then all "add"
 *                     modifiers stack on top. Used for AC formulas like Unarmored
 *                     Defense where the entire formula replaces the base.
 *
 * Value can be:
 *   - A plain number (e.g. 5 for the Shield spell's AC bonus)
 *   - An expression string evaluated at resolution time (e.g. "10 + dex + con")
 *
 * Condition is a human-readable string for display only — the resolver does not
 * parse or enforce it; activation must be tracked separately in game state.
 */
export interface Modifier {
  target: ModifierTarget;
  /** Constant number or expression string (see Value Notation Language above). */
  value: number | string;
  /** How this modifier combines with others. Defaults to "add". */
  operation?: "add" | "set";
  /** Human-readable activation condition: "while raging", "not wearing armor". */
  condition?: string;
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

/**
 * A categorical mechanical property from a source. Structured as a discriminated
 * union so resolvers can enumerate all resistance/immunity/proficiency/etc. sets
 * without parsing text.
 *
 * The shared `condition` field (human-readable) applies to every variant. Like
 * Modifier.condition, it is for display only — enforcement lives in game state.
 *
 * The `note` variant is the explicit escape hatch for mechanics too complex or
 * rare to capture in structured form. The AI DM reads the text.
 */
export type Property = {
  /** Human-readable activation condition shared across all variants. */
  condition?: string;
} & (
  | { type: "resistance"; damageType: DamageType | "all" }
  | { type: "immunity"; damageType: DamageType | "all" }
  | { type: "vulnerability"; damageType: DamageType | "all" }
  | { type: "condition_immunity"; conditionName: ConditionName }
  | {
      type: "proficiency";
      category: "armor" | "weapon" | "tool" | "skill" | "save" | "language";
      value: string;
    }
  | { type: "expertise"; skill: Skill }
  | { type: "sense"; sense: SenseType; range: number }
  | { type: "advantage"; on: AdvantageTarget }
  | { type: "disadvantage"; on: AdvantageTarget }
  | {
      type: "spell_grant";
      spell: string;
      /** How the spell can be used:
       *  "at_will"          — cantrip-style, unlimited
       *  "always_prepared"  — uses spell slots but always prepared (domain/oath spells)
       *  "${N}/${rest}_rest" — N uses, recharges on short or long rest (e.g. "1/long_rest", "2/short_rest")
       */
      usage: "at_will" | "always_prepared" | `${number}/${"short" | "long"}_rest`;
      /** Minimum character/class level to gain this spell. */
      minLevel?: number;
      /** Ability score key used for the spell's DC/attack. */
      castingAbility?: Ability;
    }
  | {
      type: "resource";
      name: string;
      /**
       * Maximum uses — constant number or expression string.
       * Expression example: "max(cha, 1)" for Bardic Inspiration.
       */
      maxUses: number | string;
      /** Amount recovered on long rest. "all" = full recovery, number = partial. */
      longRest: number | "all";
      /** Amount recovered on short rest. Omit if not recovered on short rest. */
      shortRest?: number | "all";
    }
  | { type: "extra_attack"; count: number }
  | {
      /**
       * Records that the character has unlocked a weapon's Mastery property
       * (Vex, Sap, Topple, etc.). Emitted by the `weapon_mastery` FeatureChoice
       * pool. The mastery rule itself lives on the weapon entry in the items
       * database — this Property only records the player's selection.
       */
      type: "weapon_mastery_grant";
      weapon: string;
    }
  | {
      /**
       * Raises the maximum value the named ability score can reach.
       * Currently descriptive (the resolver does not clamp scores), but consumed
       * by the ASI builder UI and the character sheet to surface the new ceiling
       * (e.g. Barbarian Primal Champion raises STR/CON max from 20 to 25).
       * Multiple sources stack via max() of all caps.
       */
      type: "score_cap";
      ability: Ability;
      max: number;
    }
  | {
      /**
       * Floors a d20 outcome on the named target. Two modes:
       *   "d20"   — treat the d20 die as no less than `min` (Reliable Talent).
       *   "total" — if the total is below `min`, use `min` instead (Indomitable
       *             Might: "use STR score in place of the total"). `min` accepts
       *             the expression language, so Indomitable Might encodes this
       *             as min: "strength".
       * Defaults to "d20". Optional `proficientOnly` gates the floor on the
       * character being proficient with the targeted skill (Reliable Talent
       * says "any ability check that uses one of your skill proficiencies").
       */
      type: "roll_minimum";
      on: AdvantageTarget;
      min: number | string;
      mode?: "d20" | "total";
      proficientOnly?: boolean;
    }
  | {
      /**
       * Rider that fires when this character lands a critical hit with a
       * weapon of the matching damage type (Crusher / Slasher / Piercer family).
       *
       *   extra_die                  — roll one extra weapon die on the crit (Piercer).
       *   advantage_next_attack      — next attack vs the target has advantage (Crusher).
       *   target_disadvantage_attacks — target has Disadvantage on attacks until
       *                                 the start of your next turn (Slasher).
       */
      type: "crit_rider";
      weaponDamageType: "bludgeoning" | "slashing" | "piercing";
      effect:
        | { kind: "extra_die" }
        | { kind: "advantage_next_attack" }
        | { kind: "target_disadvantage_attacks" };
    }
  | {
      /**
       * Applies another entity's effects by name and category. The resolver
       * looks up the entity in the specified DB category and includes its
       * effects. Creates an inheritance chain: Paralyzed → grant condition
       * Incapacitated → Incapacitated's effects apply automatically.
       */
      type: "grant";
      grant: string;
      grantType: EntityCategory;
    }
  | { type: "note"; text: string }
);

/**
 * A single selectable option within a feature choice.
 * Each option has a label and its own structured effects.
 */
export interface ChoiceOption {
  label: string;
  effects?: EntityEffects;
  /** Short description for UI tooltip. */
  description?: string;
  /** Nested choices within this option (e.g., ASI sub-choices on a feat option). */
  choices?: FeatureChoice[];
}

// ---------------------------------------------------------------------------
// FeatureChoice
// ---------------------------------------------------------------------------

/**
 * A player decision point on a database entity. Lives as a top-level field
 * on DbEntity (not inside EntityEffects) because choices are INPUTS that the
 * builder/game engine resolve, not OUTPUTS that the stat resolver applies.
 *
 * Resolution flow:
 *   Build-time (permanent): Builder reads choices → player picks → selected
 *     option's effects merge into the EffectBundle → resolver never sees the choice.
 *   Runtime (long_rest/activation): Game engine reads choices → player/DM picks →
 *     engine creates temporary EffectBundle → goes into activeEffects.
 *
 * Two forms:
 *   Options-based: { options: [...] } — pick `count` from named options with effects
 *   Pool-based:    { pool: "...", from?: [...] } — pick `count` items from a category
 */
export type FeatureChoice = {
  /** Storage key for selection lookup: "totem-spirit", "fighting-style" */
  id: string;
  /** Display label: "Totem Spirit", "Fighting Style" */
  label: string;
  count: number;
  /**
   * When the selection happens:
   *   "permanent"  — chosen once at level-up, stored in CharacterStaticData.buildChoices
   *   "long_rest"  — re-selected each long rest, stored in CharacterDynamicData.activeChoices
   *   "short_rest" — re-selected each short rest (e.g. some Warlock invocations)
   *   "activation" — chosen each time the feature is activated (per rage, etc.)
   */
  timing: "permanent" | "long_rest" | "short_rest" | "activation";
} & (
  | {
      options: ChoiceOption[];
      pool?: never;
    }
  | {
      pool:
        | "skill_proficiency"
        | "skill_expertise"
        | "skill_proficiency_or_expertise" // gain proficiency, or expertise if already proficient
        | "language"
        | "tool"
        | "ability_score" // pick an ability to increase (ASI feats, class features)
        | "fighting_style" // pick from Fighting Style feats
        | "spell_cantrip" // pick a cantrip (constrain class via `from`)
        | "weapon_mastery"; // pick weapons whose Mastery property the character can use
      /** Constrained list. Omit for "any from pool". */
      from?: string[];
      options?: never;
    }
);

// ---------------------------------------------------------------------------
// EntityEffects
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ActionEffect / ActionOutcome
// ---------------------------------------------------------------------------

/**
 * Describes what a DB entity DOES when actively used — cast (spell), attack
 * with (weapon), use (monster action), activate (feature). This is distinct
 * from the passive `modifiers`/`properties` on EntityEffects which describe
 * what the entity IS (e.g. Rage's damage_melee bonus, Poisoned's advantage-against).
 *
 * A single entity can have both: Rage has passive modifiers AND an optional
 * `action` for any triggered outcome. Breath Weapon is pure `action`.
 *
 * Resolution flow:
 *   - `spell_save_dc` / `weapon_melee` / etc. are substituted with actual values
 *     at resolution time via getAction(entity, context).
 *   - Upcast/cantrip scaling applies the delta to the base outcome.
 *   - `onHit`, `onMiss`, `onFailedSave`, `onSuccessfulSave` are independent outcome
 *     branches; callers pick the appropriate branch based on the roll result.
 */
export interface ActionEffect {
  /**
   * How the action resolves targeting.
   *   "attack" — uses an attack roll
   *   "save"   — targets make a saving throw
   *   "auto"   — automatically applies (Magic Missile, Healing Word)
   */
  kind: "attack" | "save" | "auto";

  /** Attack-roll actions (weapon swings, spell attack rolls). */
  attack?: {
    /** How the attack bonus is computed. */
    bonus: "spell_attack" | "weapon_melee" | "weapon_ranged" | "monster";
    range?: { normal: number; long?: number } | "touch" | "self";
    /** Reach in feet for melee attacks. */
    reach?: number;
  };

  /** Save-based actions (Fireball, Hold Person). */
  save?: {
    ability: Ability;
    /** "spell_save_dc" substituted at resolution time; fixed number for monsters. */
    dc: "spell_save_dc" | number;
    onSuccess: "half" | "none" | "negates";
  };

  /** Area-targeting descriptor. Resolved with show_aoe / apply_area_effect. */
  area?: {
    shape: "sphere" | "cone" | "line" | "cube" | "cylinder";
    /** Size in feet (radius for sphere/cylinder, length for cone/line, side for cube). */
    size: number;
  };

  /** Targeting (single-target spells, multi-creature, self, area). */
  targeting?: {
    type: "self" | "creature" | "creatures" | "point" | "area";
    /** Number of creatures targeted (for "creatures" type). */
    count?: number;
  };

  /** Outcome applied on a hit (attack actions). */
  onHit?: ActionOutcome;
  /** Outcome applied on a miss (usually empty; some effects trigger on miss). */
  onMiss?: ActionOutcome;
  /** Outcome applied when a target fails their saving throw. */
  onFailedSave?: ActionOutcome;
  /** Outcome applied when a target succeeds on their saving throw (e.g. half damage). */
  onSuccessfulSave?: ActionOutcome;

  /**
   * Upcast / cast-at-higher-level scaling.
   * `perLevel` is a partial ActionOutcome added PER extra spell level above the
   * base casting level (e.g. +1d6 damage per level for Fireball).
   */
  upcast?: {
    perLevel?: Partial<ActionOutcome>;
  };

  /**
   * Cantrip damage scaling by character level.
   * Array entries are additive replacements — when character level >= entry.level,
   * that entry's outcome replaces lower-level entries.
   */
  cantripScaling?: Array<{
    level: number;
    outcome: Partial<ActionOutcome>;
  }>;

  /**
   * Action-level metadata mirroring spell metadata so the action is self-contained.
   * Consumers that only have an EntityEffects handle can still read casting time,
   * components, etc. without a separate DB lookup.
   */
  meta?: {
    castingTime?: string;
    components?: string[];
    ritual?: boolean;
    concentration?: boolean;
  };
}

/**
 * The mechanical payload produced by one branch of an ActionEffect.
 * Multiple outcome fields can coexist (e.g. damage + applyConditions on a
 * Poison spray that deals poison damage AND applies Poisoned on a failed save).
 */
export interface ActionOutcome {
  /** Damage rolls to apply on this branch. Multiple entries add together. */
  damage?: Array<{ dice: string; type: DamageType }>;
  /** Healing to apply (Cure Wounds, Healing Word). */
  healing?: { dice: string };
  /** Temporary HP granted (False Life, Aid). */
  tempHp?: { dice: string };
  /**
   * Nested EntityEffects applied as an EffectBundle on the target.
   * Reuses the existing lifetime/condition machinery for duration-based effects.
   */
  applyEffects?: EntityEffects;
  /**
   * Shortcut for applying named conditions to the target.
   * Each entry creates a condition bundle on the target with the specified lifetime.
   * `repeatSave` triggers a repeat saving throw at the "start" or "end" of each turn.
   */
  applyConditions?: Array<{
    name: ConditionName;
    duration?: EffectLifetime;
    repeatSave?: "start" | "end";
  }>;
  /**
   * Forced movement applied to the target (Thunderwave, Repelling Blast).
   * push/pull are distances in feet; knockProne applies the Prone condition.
   */
  forcedMovement?: {
    push?: number;
    pull?: number;
    knockProne?: boolean;
  };
  /**
   * Free-form fallback for mechanics too rare or complex to type structurally.
   * The AI DM reads this text.
   */
  note?: string;
}

/**
 * Pure mechanical payload that lives on database entities (spells, conditions,
 * feats, class features, species traits, magic items). Has no identity, source,
 * or lifetime — those are added by EffectBundle at runtime.
 *
 * `modifiers` and `properties` describe passive traits of the bearer while active.
 * `action` describes what triggers an outcome when the entity is used actively
 * (spells, weapon attacks, monster actions, activated features). An entity can
 * have both passive effects and an action (e.g. a magic weapon with a +1 damage
 * modifier AND a special attack action).
 */
export interface EntityEffects {
  modifiers?: Modifier[];
  properties?: Property[];
  /** Active-use outcome descriptor. Present on spells, weapons, monster attacks, activated features. */
  action?: ActionEffect;
}

// ---------------------------------------------------------------------------
// EffectSource
// ---------------------------------------------------------------------------

/**
 * Where an EffectBundle came from. Used for display ("Shield [Spell]"),
 * targeted removal ("remove all spell effects"), and logging.
 *
 * featureName distinguishes sub-features within a source (e.g. "Unarmored Defense"
 * within the "Barbarian" class). level records the character level at the time the
 * effect was created, enabling level-scaling expressions to be re-evaluated.
 */
/**
 * Where an EffectBundle came from. Derived from `effectSourceSchema` so the
 * type and runtime validation can never drift. To add/change a source type,
 * edit `packages/shared/src/schemas/effects.ts`.
 *
 *   name        — Entity name: "Tiefling", "Barbarian", "Shield", "Poisoned", etc.
 *   featureName — Sub-feature within the entity: "Unarmored Defense", "Rage", etc.
 *   level       — Character level (totalLevel) when the bundle was created;
 *                 used as clvl when evaluating class feature expressions if
 *                 classLevel is unavailable from the bundle context.
 */
export type EffectSource = z.infer<typeof effectSourceSchema>;

// ---------------------------------------------------------------------------
// EffectLifetime
// ---------------------------------------------------------------------------

/**
 * How long an EffectBundle remains active.
 *
 *   permanent      — Lasts forever (build-time effects: species traits, class features, feats).
 *   concentration  — Active while the caster concentrates; removed by break_concentration.
 *   duration       — Expires after N rounds; decremented by advance_turn.
 *   until_rest     — Removed automatically on a rest.
 *                    rest: "short" — ends on a short rest OR a long rest (long implies short).
 *                    rest: "long"  — ends only on a long rest; persists through short rests.
 *   manual         — No automatic expiry; must be dismissed explicitly via dismiss/remove tools.
 */
export type EffectLifetime = z.infer<typeof effectLifetimeSchema>;

// ---------------------------------------------------------------------------
// EffectBundle
// ---------------------------------------------------------------------------

/**
 * Runtime wrapper that gives EntityEffects an identity, source, and lifetime.
 *
 * Build-time bundles (species, class, feat, background) are collected by
 * collectBuildEffects() and resolved into CharacterStaticData at build time.
 *
 * Runtime bundles (conditions, spells, item effects, feature activations)
 * live in CharacterDynamicData.activeEffects. They are created/removed by
 * the GSM when conditions are added, spells are concentrated on, items are
 * equipped/attuned, or features are activated.
 */
export interface EffectBundle {
  /** Unique identifier for targeted removal ("remove bundle with id X"). */
  id: string;
  source: EffectSource;
  lifetime: EffectLifetime;
  effects: EntityEffects;
  /**
   * If set, this bundle was applied to a target by another creature's
   * concentration spell (e.g. Bane disadvantage on a goblin saved against
   * the wizard's concentration). When the caster's concentration breaks (or
   * is replaced), every bundle in the room tagged with this caster+spell
   * pair is removed in one sweep — no manual `remove_condition` per target.
   */
  sourceConcentration?: { caster: string; spell: string };
}

// ---------------------------------------------------------------------------
// ResolveContext
// ---------------------------------------------------------------------------

/**
 * Character context required to evaluate expression-valued modifiers.
 * Passed to the expression evaluator for every Modifier/Property resolution.
 *
 *   abilities       — for ability modifier tokens (str, dex, con, int, wis, cha)
 *   totalLevel      — for the lvl token
 *   classLevel      — for the clvl token; set per-bundle from EffectSource.level
 *                     when evaluating class feature expressions
 *   proficiencyBonus — for the prof token
 *   stackCount      — for the stacks token; used by stackable effects like
 *                     Exhaustion where modifiers scale with stack count
 */
export interface ResolveContext {
  abilities: AbilityScores;
  totalLevel: number;
  classLevel?: number;
  proficiencyBonus: number;
  /** Stack count for stackable effects (Exhaustion). Defaults to 1. */
  stackCount?: number;
}
