import type {
  Ability,
  EffectBundle,
  EffectSource,
  Modifier,
  ModifierTarget,
  Property,
  ResolveContext,
  ActionEffect,
  ActionOutcome,
  EntityEffects,
} from "../types/effects";
import { evaluateExpression } from "./expression-evaluator";

// ---------------------------------------------------------------------------
// Target Hierarchy
// ---------------------------------------------------------------------------

// Parent targets expand to children. "attack" covers attack_melee, attack_ranged, attack_spell.
// "damage" covers damage_melee, damage_ranged, damage_spell. "save" covers all save_X.
// "speed" covers all speed_X.

const TARGET_CHILDREN: Partial<Record<ModifierTarget, ModifierTarget[]>> = {
  attack: ["attack_melee", "attack_ranged", "attack_spell"],
  damage: ["damage_melee", "damage_ranged", "damage_spell"],
  save: [
    "save_strength",
    "save_dexterity",
    "save_constitution",
    "save_intelligence",
    "save_wisdom",
    "save_charisma",
  ],
  speed: ["speed_fly", "speed_swim", "speed_climb", "speed_burrow"],
};

// Build reverse map: child → parents
function buildParentMap(): Map<ModifierTarget, ModifierTarget[]> {
  const map = new Map<ModifierTarget, ModifierTarget[]>();
  for (const [parent, children] of Object.entries(TARGET_CHILDREN) as [
    ModifierTarget,
    ModifierTarget[],
  ][]) {
    for (const child of children) {
      const existing = map.get(child);
      if (existing) {
        existing.push(parent);
      } else {
        map.set(child, [parent]);
      }
    }
  }
  return map;
}

const TARGET_PARENTS = buildParentMap();

// ---------------------------------------------------------------------------
// Modifier Collection
// ---------------------------------------------------------------------------

/**
 * Collect all modifiers from bundles that apply to the given target.
 * A modifier applies if its target matches directly OR if its target is a parent
 * of the query target. Example: a modifier on "attack" applies to "attack_melee".
 */
function collectModifiers(bundles: EffectBundle[], target: ModifierTarget): Modifier[] {
  // Build the set of targets that count as a match:
  // the queried target itself, plus all of its parents.
  const applicableTargets = new Set<ModifierTarget>([target]);
  const parents = TARGET_PARENTS.get(target);
  if (parents) {
    for (const p of parents) {
      applicableTargets.add(p);
    }
  }

  const result: Modifier[] = [];
  for (const bundle of bundles) {
    const modifiers = bundle.effects.modifiers;
    if (!modifiers) continue;
    for (const mod of modifiers) {
      if (applicableTargets.has(mod.target)) {
        result.push(mod);
      }
    }
  }
  return result;
}

/**
 * Like `collectModifiers` but pairs each modifier with its bundle's source.
 * Used by the breakdown resolvers to credit contributions to specific items/feats/spells.
 */
export function collectModifiersWithSource(
  bundles: EffectBundle[],
  target: ModifierTarget,
): Array<{ modifier: Modifier; source: EffectSource }> {
  const applicableTargets = new Set<ModifierTarget>([target]);
  const parents = TARGET_PARENTS.get(target);
  if (parents) {
    for (const p of parents) {
      applicableTargets.add(p);
    }
  }

  const result: Array<{ modifier: Modifier; source: EffectSource }> = [];
  for (const bundle of bundles) {
    const modifiers = bundle.effects.modifiers;
    if (!modifiers) continue;
    for (const mod of modifiers) {
      if (applicableTargets.has(mod.target)) {
        result.push({ modifier: mod, source: bundle.source });
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Stat Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a single stat from effect bundles.
 *
 * @param bundles  All active effect bundles
 * @param target   The stat to resolve (e.g. "ac", "hp", "speed")
 * @param base     The base value before any effects (e.g. 0 for HP bonus, 10 for base AC, 30 for base speed)
 * @param ctx      Character context for expression evaluation
 * @returns        The computed value after all effects
 *
 * Resolution:
 * 1. Collect all modifiers targeting this stat (direct + parent matches)
 * 2. Evaluate all "set" operations; highest value wins (replaces base)
 * 3. Evaluate all "add" operations; all stack on top
 */
export function resolveStat(
  bundles: EffectBundle[],
  target: ModifierTarget,
  base: number,
  ctx: ResolveContext,
): number {
  const modifiers = collectModifiers(bundles, target);

  // Separate into "set" and "add" groups
  const setMods = modifiers.filter((m) => m.operation === "set");
  const addMods = modifiers.filter((m) => !m.operation || m.operation === "add");

  // Evaluate set modifiers; highest "set" value replaces the base entirely.
  // No comparison against the original base — a "set" always overrides.
  // This is critical for debuffs: Restrained sets speed to 0, which must
  // override a base speed of 30.
  let resolved = base;
  if (setMods.length > 0) {
    let highestSet = -Infinity;
    for (const mod of setMods) {
      const val = evaluateExpression(mod.value, ctx);
      if (val > highestSet) {
        highestSet = val;
      }
    }
    resolved = highestSet;
  }

  // Evaluate and stack all add modifiers
  for (const mod of addMods) {
    resolved += evaluateExpression(mod.value, ctx);
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Property Queries
// ---------------------------------------------------------------------------

/** Collect all properties of a given type from bundles */
export function collectProperties<T extends Property["type"]>(
  bundles: EffectBundle[],
  type: T,
): Extract<Property, { type: T }>[] {
  const result: Extract<Property, { type: T }>[] = [];
  for (const bundle of bundles) {
    const properties = bundle.effects.properties;
    if (!properties) continue;
    for (const prop of properties) {
      if (prop.type === type) {
        result.push(prop as Extract<Property, { type: T }>);
      }
    }
  }
  return result;
}

/** Check if any bundle grants resistance to a damage type */
export function hasResistance(bundles: EffectBundle[], damageType: string): boolean {
  return collectProperties(bundles, "resistance").some(
    (p) => p.damageType.toLowerCase() === damageType.toLowerCase(),
  );
}

/** Check if any bundle grants immunity to a damage type */
export function hasImmunity(bundles: EffectBundle[], damageType: string): boolean {
  return collectProperties(bundles, "immunity").some(
    (p) => p.damageType.toLowerCase() === damageType.toLowerCase(),
  );
}

/** Check if any bundle grants vulnerability to a damage type */
export function hasVulnerability(bundles: EffectBundle[], damageType: string): boolean {
  return collectProperties(bundles, "vulnerability").some(
    (p) => p.damageType.toLowerCase() === damageType.toLowerCase(),
  );
}

/** Check if any bundle grants condition immunity */
export function hasConditionImmunity(bundles: EffectBundle[], conditionName: string): boolean {
  return collectProperties(bundles, "condition_immunity").some(
    (p) => p.conditionName.toLowerCase() === conditionName.toLowerCase(),
  );
}

/** Check if any bundle grants advantage on something */
export function hasAdvantage(bundles: EffectBundle[], on: string): boolean {
  return collectProperties(bundles, "advantage").some(
    (p) => p.on.toLowerCase() === on.toLowerCase(),
  );
}

/** Check if any bundle grants disadvantage on something */
export function hasDisadvantage(bundles: EffectBundle[], on: string): boolean {
  return collectProperties(bundles, "disadvantage").some(
    (p) => p.on.toLowerCase() === on.toLowerCase(),
  );
}

/** Get all proficiencies of a given category (case-insensitive dedup) */
export function getProficiencies(bundles: EffectBundle[], category: string): string[] {
  const seen = new Map<string, string>();
  for (const prop of collectProperties(bundles, "proficiency")) {
    if (prop.category !== category) continue;
    const key = prop.value.toLowerCase();
    if (!seen.has(key)) seen.set(key, prop.value);
  }
  return Array.from(seen.values());
}

/** Get all senses (returns array of {sense, range}). For duplicate senses, the larger range wins. */
export function getSenses(bundles: EffectBundle[]): Array<{ sense: string; range: number }> {
  const senseMap = new Map<string, number>();
  for (const prop of collectProperties(bundles, "sense")) {
    const key = prop.sense.toLowerCase();
    const existing = senseMap.get(key) ?? 0;
    if (prop.range > existing) {
      senseMap.set(key, prop.range);
    }
  }
  return Array.from(senseMap.entries()).map(([sense, range]) => ({
    sense,
    range,
  }));
}

/** Get all granted spells */
export function getGrantedSpells(
  bundles: EffectBundle[],
): Extract<Property, { type: "spell_grant" }>[] {
  return collectProperties(bundles, "spell_grant");
}

/** Get extra attack count (highest wins, not additive) */
export function getExtraAttacks(bundles: EffectBundle[]): number {
  const extraAttacks = collectProperties(bundles, "extra_attack");
  if (extraAttacks.length === 0) return 0;
  return Math.max(...extraAttacks.map((p) => p.count));
}

/** Get all resources (class resources, racial resources, etc.) */
export function getResources(bundles: EffectBundle[]): Extract<Property, { type: "resource" }>[] {
  return collectProperties(bundles, "resource");
}

/** Get all notes (escape-hatch text for AI DM) */
export function getNotes(bundles: EffectBundle[]): string[] {
  return collectProperties(bundles, "note").map((p) => p.text);
}

// ---------------------------------------------------------------------------
// Action Resolution
// ---------------------------------------------------------------------------

/**
 * Context for resolving an ActionEffect at use-time.
 *
 * - `spellSaveDC`     — caster's computed save DC; substitutes "spell_save_dc" placeholder.
 * - `upcastLevel`     — number of EXTRA spell levels above the base casting level.
 *                       e.g. Fireball (base 3) cast at slot 5 → upcastLevel: 2.
 *                       Magic Missile (base 1) cast at slot 3 → upcastLevel: 2.
 * - `characterLevel`  — total character level; used for cantrip damage scaling.
 */
export interface ActionContext {
  spellSaveDC?: number;
  upcastLevel?: number;
  characterLevel?: number;
}

/**
 * Merge two partial ActionOutcome objects by concatenating damage arrays and
 * taking the last defined value for scalar fields.
 * Does NOT mutate either argument.
 */
function mergeOutcome(
  base: ActionOutcome | undefined,
  delta: Partial<ActionOutcome> | undefined,
): ActionOutcome | undefined {
  if (!base && !delta) return undefined;
  if (!delta) return base;
  if (!base) return delta as ActionOutcome;

  return {
    ...base,
    ...delta,
    // Concatenate damage arrays rather than replace.
    damage:
      base.damage || delta.damage ? [...(base.damage ?? []), ...(delta.damage ?? [])] : undefined,
    // Concatenate applyConditions arrays.
    applyConditions:
      base.applyConditions || delta.applyConditions
        ? [...(base.applyConditions ?? []), ...(delta.applyConditions ?? [])]
        : undefined,
  };
}

/**
 * Resolve a fully-substituted ActionEffect from an entity and optional context.
 *
 * Substitutions applied:
 * 1. `save.dc === "spell_save_dc"` → replaced with `context.spellSaveDC` (number) when provided.
 * 2. Upcast scaling: if `context.upcastLevel` and the action has `upcast.perLevel`, append
 *    the delta outcome (damage, healing, etc.) for each extra spell level above base.
 *    `upcastLevel` is the count of extra levels (not the total slot level).
 *    Example: Fireball (base 3) cast at slot 5 → upcastLevel: 2 → +2 × perLevel damage.
 * 3. Cantrip scaling: if `context.characterLevel` and the action has `cantripScaling`, pick
 *    the highest entry where `entry.level <= characterLevel` and merge its outcome.
 *
 * Does NOT mutate the input entity or its effects. Returns a new ActionEffect or null.
 *
 * Phase 2 role: used by Phase 12 (MCP tool wiring) to resolve actions at cast/use time.
 */
export function getAction(
  entity: { effects?: EntityEffects },
  context: ActionContext = {},
): ActionEffect | null {
  const baseAction = entity.effects?.action;
  if (!baseAction) return null;

  // Start with a shallow copy so we don't mutate the original.
  let action: ActionEffect = { ...baseAction };

  // --- 1. Substitute spell_save_dc ---
  if (action.save && action.save.dc === "spell_save_dc" && context.spellSaveDC !== undefined) {
    action = {
      ...action,
      save: { ...action.save, dc: context.spellSaveDC },
    };
  }

  // --- 2. Upcast scaling ---
  // `upcastLevel` is the number of extra spell levels above the spell's base level.
  // Each extra level adds one copy of `perLevel` to the relevant outcome branches.
  if (context.upcastLevel !== undefined && context.upcastLevel > 0 && action.upcast?.perLevel) {
    const extraLevels = context.upcastLevel;
    const perLevel = action.upcast.perLevel;

    // Build a composite delta by repeating perLevel for each extra level.
    let cumulativeDelta: Partial<ActionOutcome> = {};
    for (let i = 0; i < extraLevels; i++) {
      cumulativeDelta = mergeOutcome(
        cumulativeDelta as ActionOutcome,
        perLevel,
      ) as Partial<ActionOutcome>;
    }

    action = {
      ...action,
      onHit: mergeOutcome(action.onHit, cumulativeDelta),
      onFailedSave: mergeOutcome(action.onFailedSave, cumulativeDelta),
      onSuccessfulSave: mergeOutcome(action.onSuccessfulSave, cumulativeDelta),
    };
  }

  // --- 3. Cantrip scaling ---
  if (context.characterLevel !== undefined && action.cantripScaling) {
    // Pick the highest entry whose level is <= characterLevel.
    const sorted = [...action.cantripScaling].sort((a, b) => b.level - a.level);
    const entry = sorted.find((e) => e.level <= context.characterLevel!);
    if (entry) {
      action = {
        ...action,
        onHit: mergeOutcome(action.onHit, entry.outcome),
        onFailedSave: mergeOutcome(action.onFailedSave, entry.outcome),
        onSuccessfulSave: mergeOutcome(action.onSuccessfulSave, entry.outcome),
      };
    }
  }

  return action;
}

// ---------------------------------------------------------------------------
// Damage Reduction Helpers
// ---------------------------------------------------------------------------

/** Internal shape for a resolved damage reduction entry. */
export interface DamageReduction {
  amount: number;
  kind: "flat" | "half";
}

/**
 * Collect all passive damage reductions from bundles that apply to a given
 * damage type. Skips `trigger: "reaction"` entries (DM-applied, not automatic).
 *
 * @param bundles     Active effect bundles to search.
 * @param damageType  The incoming damage type (case-insensitive).
 * @param context     Optional ResolveContext for evaluating expression-valued amounts.
 *                    If omitted, expression-valued amounts are skipped with a warning.
 * @returns           Array of resolved reductions to apply in sequence.
 */
export function getDamageReductions(
  bundles: EffectBundle[],
  damageType: string,
  context?: ResolveContext,
): DamageReduction[] {
  const props = collectProperties(bundles, "damage_reduction");
  const result: DamageReduction[] = [];

  for (const prop of props) {
    // Skip reaction-triggered reductions — those are DM-applied.
    if (prop.trigger === "reaction") continue;

    // Check damage type match: no damageTypes = all types; explicit list must include this type or "all".
    if (prop.damageTypes !== undefined && prop.damageTypes.length > 0) {
      const normalized = damageType.toLowerCase();
      const matches = prop.damageTypes.some(
        (dt) => dt === "all" || dt.toLowerCase() === normalized,
      );
      if (!matches) continue;
    }

    // Resolve the amount.
    if (prop.amount === "half") {
      result.push({ amount: 0, kind: "half" });
    } else if (typeof prop.amount === "number") {
      result.push({ amount: prop.amount, kind: "flat" });
    } else {
      // Expression string — requires a context.
      if (!context) {
        console.warn(
          `[effect-resolver] damage_reduction has expression amount "${prop.amount}" but no ResolveContext was provided; skipping.`,
        );
        continue;
      }
      const resolved = evaluateExpression(prop.amount, context);
      result.push({ amount: resolved, kind: "flat" });
    }
  }

  return result;
}

/**
 * Check whether any bundle grants Evasion for a specific saving throw ability.
 * Evasion inverts save-for-half: success = 0 damage, failure = half damage.
 */
export function hasEvasion(bundles: EffectBundle[], ability: Ability): boolean {
  return collectProperties(bundles, "save_outcome_override").some(
    (p) => p.ability === ability && p.saveEffect === "evasion",
  );
}

// ---------------------------------------------------------------------------
// Damage Application
// ---------------------------------------------------------------------------

/**
 * Apply damage considering resistance/immunity/vulnerability from effects,
 * followed by any passive damage reductions.
 *
 * Resolution order:
 *   1. Immunity          — returns 0, applied: "immune" (short-circuits all else).
 *   2. Resistance/vulnerability — halves or doubles; if both present, cancel out.
 *   3. Flat reductions   — summed and subtracted (clamped at 0).
 *   4. "half" reductions — if any present, divide by 2 (Math.floor), applied once.
 *
 * `applied` tag priority (most protective wins when multiple categories fire):
 *   immune > reduced > resistant > vulnerable > normal.
 *   If resistant AND a flat/half reduction both fire, the tag is "reduced" (more specific).
 *
 * @param bundles     Active effect bundles for the target.
 * @param amount      Raw incoming damage (before any effects).
 * @param damageType  The damage type string (e.g. "fire", "bludgeoning").
 * @param context     Optional ResolveContext for expression-valued damage_reduction amounts.
 */
export function applyDamageWithEffects(
  bundles: EffectBundle[],
  amount: number,
  damageType: string,
  context?: ResolveContext,
): {
  effectiveDamage: number;
  applied: "normal" | "resistant" | "immune" | "vulnerable" | "reduced";
} {
  const immune = hasImmunity(bundles, damageType);
  if (immune) {
    return { effectiveDamage: 0, applied: "immune" };
  }

  const resistant = hasResistance(bundles, damageType);
  const vulnerable = hasVulnerability(bundles, damageType);

  // Resistance and vulnerability cancel each other out.
  let dmg: number;
  let baseApplied: "normal" | "resistant" | "vulnerable";
  if (resistant && vulnerable) {
    dmg = amount;
    baseApplied = "normal";
  } else if (resistant) {
    dmg = Math.floor(amount / 2);
    baseApplied = "resistant";
  } else if (vulnerable) {
    dmg = amount * 2;
    baseApplied = "vulnerable";
  } else {
    dmg = amount;
    baseApplied = "normal";
  }

  // Apply passive damage reductions.
  const reductions = getDamageReductions(bundles, damageType, context);
  if (reductions.length === 0) {
    return { effectiveDamage: dmg, applied: baseApplied };
  }

  // 1. Sum flat reductions and subtract.
  const flatTotal = reductions
    .filter((r) => r.kind === "flat")
    .reduce((acc, r) => acc + r.amount, 0);
  const hasHalf = reductions.some((r) => r.kind === "half");

  let reduced = dmg - flatTotal;
  if (hasHalf) {
    reduced = Math.floor(reduced / 2);
  }
  // Clamp at 0.
  reduced = Math.max(0, reduced);

  // Determine applied tag: "reduced" is more specific than resistant/vulnerable/normal,
  // but never overrides "immune" (already returned above).
  const applied: "reduced" | "resistant" | "vulnerable" | "normal" =
    reduced !== dmg ? "reduced" : baseApplied;

  return { effectiveDamage: reduced, applied };
}
