import type {
  EffectBundle,
  Modifier,
  ModifierTarget,
  Property,
  ResolveContext,
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

/** Get all proficiencies of a given category */
export function getProficiencies(bundles: EffectBundle[], category: string): string[] {
  return collectProperties(bundles, "proficiency")
    .filter((p) => p.category === category)
    .map((p) => p.value);
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
// Damage Application Helper
// ---------------------------------------------------------------------------

/**
 * Apply damage considering resistance/immunity/vulnerability from effects.
 * Returns the effective damage amount after applying modifiers.
 * Order: immunity (0) > resistance (halved) > vulnerability (doubled).
 * If both resistance and vulnerability apply, they cancel out (normal damage).
 */
export function applyDamageWithEffects(
  bundles: EffectBundle[],
  amount: number,
  damageType: string,
): {
  effectiveDamage: number;
  applied: "normal" | "resistant" | "immune" | "vulnerable";
} {
  const immune = hasImmunity(bundles, damageType);
  if (immune) {
    return { effectiveDamage: 0, applied: "immune" };
  }

  const resistant = hasResistance(bundles, damageType);
  const vulnerable = hasVulnerability(bundles, damageType);

  // Resistance and vulnerability cancel each other out
  if (resistant && vulnerable) {
    return { effectiveDamage: amount, applied: "normal" };
  }

  if (resistant) {
    return { effectiveDamage: Math.floor(amount / 2), applied: "resistant" };
  }

  if (vulnerable) {
    return { effectiveDamage: amount * 2, applied: "vulnerable" };
  }

  return { effectiveDamage: amount, applied: "normal" };
}
