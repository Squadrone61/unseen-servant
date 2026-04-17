/**
 * Stat breakdowns — per-source contribution lists for key derived stats
 * (AC, speed, initiative, proficiency bonus, spellcasting, ability scores).
 *
 * These mirror the computation inside `character/resolve.ts` but preserve
 * the source-by-source contribution list instead of collapsing to a total.
 * Used by the character sheet's stat-detail popovers.
 */

import type {
  CharacterData,
  AbilityScores,
  StatBreakdown,
  StatContribution,
  StatSubBreakdown,
  SpellcastingBreakdownEntry,
} from "../types/character";
import type { EffectBundle, EffectSource, ModifierTarget, ResolveContext } from "../types/effects";
import {
  collectModifiersWithSource,
  collectProperties,
  getProficiencies as getProficienciesFromBundles,
} from "../utils/effect-resolver";
import { evaluateExpression } from "../utils/expression-evaluator";
import { getClass, getSpecies } from "../data/index";
import { collectActiveBundles, buildCtx, getAbilities } from "./resolve";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Map an EffectSource.type to the popover EntityCategory, where a link exists. */
function sourceCategoryFor(source: EffectSource): StatContribution["sourceCategory"] | undefined {
  switch (source.type) {
    case "item":
      return "item";
    case "feat":
      return "feat";
    case "spell":
      return "spell";
    case "condition":
      return "condition";
    case "class":
      return "class";
    case "species":
      return "species";
    case "background":
      return "background";
    default:
      return undefined;
  }
}

function labelFor(source: EffectSource): string {
  return source.featureName ?? source.name;
}

/** Extract all modifier contributions for a target, already evaluated as numbers. */
function gatherContributions(
  bundles: EffectBundle[],
  target: ModifierTarget,
  ctx: ResolveContext,
): StatContribution[] {
  return collectModifiersWithSource(bundles, target).map(({ modifier, source }) => {
    const value = evaluateExpression(modifier.value, ctx);
    const op: "add" | "set" = modifier.operation === "set" ? "set" : "add";
    const cat = sourceCategoryFor(source);
    const contribution: StatContribution = {
      label: labelFor(source),
      value,
      operation: op,
      fromEffect: true,
    };
    if (cat) contribution.sourceCategory = cat;
    contribution.sourceName = source.name;
    return contribution;
  });
}

/**
 * Apply a list of contributions to a running base value, using the same
 * precedence rules as `resolveStat`:
 *   - Highest "set" wins and replaces the base entirely
 *   - All "add" contributions stack
 */
function applyContributions(base: number, contributions: StatContribution[]): number {
  const sets = contributions.filter((c) => c.operation === "set");
  const adds = contributions.filter((c) => c.operation === "add");
  let total = base;
  if (sets.length > 0) {
    total = Math.max(...sets.map((s) => s.value));
  }
  for (const a of adds) total += a.value;
  return total;
}

// ---------------------------------------------------------------------------
// AC
// ---------------------------------------------------------------------------

/**
 * AC breakdown.
 *
 * Build order:
 *   1. Determine the armor base from equipped items (unarmored default 10 + DEX,
 *      armored = armor AC ± DEX per type). Surface each component as its own row.
 *   2. Stack "ac" modifier effects (Unarmored Defense "set" overrides; Shield "add" stacks).
 *   3. Shield bonus (+2 if an equipped shield is in inventory).
 */
export function getACBreakdown(char: CharacterData): StatBreakdown {
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  const inventory = char.dynamic.inventory;
  const abilities = ctx.abilities;
  const dexMod = abilityMod(abilities.dexterity);

  const contributions: StatContribution[] = [];

  // Equipment-derived armor base
  let equippedArmor:
    | { name: string; type: "light" | "medium" | "heavy"; baseAc: number; dexCap?: number }
    | undefined;
  let equippedShield: { name: string } | undefined;
  for (const item of inventory) {
    if (!item.equipped) continue;
    if (item.armor?.type === "shield") {
      equippedShield = { name: item.name };
      continue;
    }
    if (item.armor) {
      const a = item.armor;
      if (a.type === "light" || a.type === "medium" || a.type === "heavy") {
        equippedArmor = {
          name: item.name,
          type: a.type,
          baseAc: a.baseAc,
          ...(a.dexCap != null ? { dexCap: a.dexCap } : {}),
        };
      }
    }
  }

  let equipBase: number;
  if (!equippedArmor) {
    contributions.push({ label: "Unarmored (10)", value: 10, operation: "base" });
    contributions.push({ label: "DEX mod", value: dexMod, operation: "add" });
    equipBase = 10 + dexMod;
  } else {
    contributions.push({
      label: `${equippedArmor.name} (base ${equippedArmor.baseAc})`,
      value: equippedArmor.baseAc,
      operation: "base",
      sourceCategory: "item",
      sourceName: equippedArmor.name,
    });
    if (equippedArmor.type === "light") {
      contributions.push({ label: "DEX mod", value: dexMod, operation: "add" });
      equipBase = equippedArmor.baseAc + dexMod;
    } else if (equippedArmor.type === "medium") {
      const cap = equippedArmor.dexCap ?? 2;
      const applied = Math.min(dexMod, cap);
      contributions.push({
        label: `DEX mod (cap +${cap})`,
        value: applied,
        operation: "add",
      });
      equipBase = equippedArmor.baseAc + applied;
    } else {
      equipBase = equippedArmor.baseAc;
    }
  }

  // Effect modifiers targeting "ac"
  const effectContribs = gatherContributions(bundles, "ac", ctx);
  contributions.push(...effectContribs);

  // "set" from effects (e.g. Unarmored Defense) overrides the equipment base entirely.
  // Compute running total applying set/add semantics to the equipment base.
  let total = applyContributions(equipBase, effectContribs);

  // Shield bonus (always +2 additive, on top of everything).
  if (equippedShield) {
    contributions.push({
      label: `${equippedShield.name} (+2)`,
      value: 2,
      operation: "add",
      sourceCategory: "item",
      sourceName: equippedShield.name,
    });
    total += 2;
  }

  return { total, contributions };
}

// ---------------------------------------------------------------------------
// Speed
// ---------------------------------------------------------------------------

function speedContributionsFor(
  bundles: EffectBundle[],
  target: ModifierTarget,
  base: number,
  baseLabel: string,
  ctx: ResolveContext,
): { total: number; contributions: StatContribution[] } {
  const contributions: StatContribution[] = [];
  if (base > 0 || target === "speed") {
    contributions.push({ label: baseLabel, value: base, operation: "base" });
  }
  const effectContribs = gatherContributions(bundles, target, ctx);
  contributions.push(...effectContribs);
  const total = applyContributions(base, effectContribs);
  return { total, contributions };
}

/**
 * Speed breakdown — walk as the primary, with optional sub-breakdowns for
 * fly / swim / climb / burrow (each only appears if its resolved value > 0).
 */
export function getSpeedBreakdown(char: CharacterData): StatBreakdown {
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  const species = getSpecies(char.static.race);
  const baseWalk = species?.speed ?? 30;
  const speciesLabel = species?.name ? `${species.name} base` : "Base walk";

  const walk = speedContributionsFor(bundles, "speed", baseWalk, speciesLabel, ctx);

  const ctxWithSpeed: ResolveContext = { ...ctx, speed: walk.total };
  const subBreakdowns: StatSubBreakdown[] = [];
  const sub = (target: ModifierTarget, label: string): StatSubBreakdown | undefined => {
    const r = speedContributionsFor(
      bundles,
      target,
      0,
      `Base ${label.toLowerCase()}`,
      ctxWithSpeed,
    );
    if (r.total <= 0) return undefined;
    return { label, total: r.total, contributions: r.contributions };
  };
  const fly = sub("speed_fly", "Fly");
  if (fly) subBreakdowns.push(fly);
  const swim = sub("speed_swim", "Swim");
  if (swim) subBreakdowns.push(swim);
  const climb = sub("speed_climb", "Climb");
  if (climb) subBreakdowns.push(climb);
  const burrow = sub("speed_burrow", "Burrow");
  if (burrow) subBreakdowns.push(burrow);

  return {
    total: walk.total,
    contributions: walk.contributions,
    ...(subBreakdowns.length > 0 ? { subBreakdowns } : {}),
  };
}

// ---------------------------------------------------------------------------
// Proficiency Bonus
// ---------------------------------------------------------------------------

export function getProficiencyBonusBreakdown(char: CharacterData): StatBreakdown {
  const totalLevel = char.static.classes.reduce((sum, c) => sum + c.level, 0);
  const profBonus = Math.floor((totalLevel - 1) / 4) + 2;
  return {
    total: profBonus,
    contributions: [
      {
        label: `Total level ${totalLevel}`,
        value: profBonus,
        operation: "base",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Initiative
// ---------------------------------------------------------------------------

/** Total initiative bonus — DEX mod + every "initiative" effect modifier. */
export function getInitiative(char: CharacterData): number {
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  const dexMod = abilityMod(ctx.abilities.dexterity);
  const effectContribs = gatherContributions(bundles, "initiative", ctx);
  return applyContributions(dexMod, effectContribs);
}

export function getInitiativeBreakdown(char: CharacterData): StatBreakdown {
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  const dexMod = abilityMod(ctx.abilities.dexterity);
  const contributions: StatContribution[] = [
    { label: "DEX mod", value: dexMod, operation: "base" },
  ];
  const effectContribs = gatherContributions(bundles, "initiative", ctx);
  contributions.push(...effectContribs);
  const total = applyContributions(dexMod, effectContribs);
  return { total, contributions };
}

// ---------------------------------------------------------------------------
// Spellcasting
// ---------------------------------------------------------------------------

function spellcastingEntryFor(
  bundles: EffectBundle[],
  ctx: ResolveContext,
  ability: keyof AbilityScores,
  className: string,
  profBonus: number,
): SpellcastingBreakdownEntry {
  const mod = abilityMod(ctx.abilities[ability]);
  const abilityLabel = `${ability.slice(0, 3).toUpperCase()} mod`;
  const baseDC = 8 + profBonus + mod;
  const baseAttack = profBonus + mod;

  const dcBase: StatContribution[] = [
    { label: "Base", value: 8, operation: "base" },
    { label: "Proficiency bonus", value: profBonus, operation: "add" },
    { label: abilityLabel, value: mod, operation: "add" },
  ];
  // Drop "set" modifiers that simply restate the base formula (every caster's
  // "Spellcasting" class feature emits `set: 8 + prof + ability`). They're
  // already decomposed as Base / Prof / Ability above, so showing them again
  // just duplicates the math.
  const dcEffects = gatherContributions(bundles, "spell_save_dc", ctx).filter(
    (c) => !(c.operation === "set" && c.value === baseDC),
  );
  const dcTotal = applyContributions(baseDC, dcEffects);

  const atkBase: StatContribution[] = [
    { label: "Proficiency bonus", value: profBonus, operation: "base" },
    { label: abilityLabel, value: mod, operation: "add" },
  ];
  const atkEffects = gatherContributions(bundles, "spell_attack", ctx).filter(
    (c) => !(c.operation === "set" && c.value === baseAttack),
  );
  const atkTotal = applyContributions(baseAttack, atkEffects);

  return {
    className,
    ability,
    dc: { total: dcTotal, contributions: [...dcBase, ...dcEffects] },
    attack: { total: atkTotal, contributions: [...atkBase, ...atkEffects] },
  };
}

/**
 * Per-spellcasting-class breakdowns. Covers full/half casters declaring a class
 * spellcasting ability, plus third-caster subclasses (Eldritch Knight, Arcane Trickster).
 */
export function getSpellcastingBreakdown(char: CharacterData): SpellcastingBreakdownEntry[] {
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  const profBonus = ctx.proficiencyBonus;
  const entries: SpellcastingBreakdownEntry[] = [];

  for (const cls of char.static.classes) {
    const classDb = getClass(cls.name);
    const classAbility = classDb?.spellcastingAbility as keyof AbilityScores | undefined;
    if (classAbility) {
      entries.push(spellcastingEntryFor(bundles, ctx, classAbility, cls.name, profBonus));
      continue;
    }
    if (cls.subclass && classDb) {
      const sub = classDb.subclasses.find(
        (s) =>
          s.name.toLowerCase() === cls.subclass!.toLowerCase() ||
          s.shortName.toLowerCase() === cls.subclass!.toLowerCase(),
      );
      const subAbility = sub?.spellcastingAbility as keyof AbilityScores | undefined;
      if (subAbility && sub?.casterProgression != null) {
        entries.push(
          spellcastingEntryFor(bundles, ctx, subAbility, `${cls.name} (${sub.name})`, profBonus),
        );
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Hit Dice
// ---------------------------------------------------------------------------

/**
 * Hit dice breakdown — one row per class showing `{level}d{faces}`.
 * Total = total character level (number of hit dice the character has).
 */
export function getHitDiceBreakdown(char: CharacterData): StatBreakdown {
  const contributions: StatContribution[] = [];
  let total = 0;
  for (const cls of char.static.classes) {
    const classDb = getClass(cls.name);
    const faces = classDb?.hitDiceFaces ?? 8;
    contributions.push({
      label: `${cls.name} (${cls.level}d${faces})`,
      value: cls.level,
      operation: "base",
      sourceCategory: "class",
      sourceName: cls.name,
    });
    total += cls.level;
  }
  return { total, contributions };
}

// ---------------------------------------------------------------------------
// Passive Perception
// ---------------------------------------------------------------------------

/**
 * Passive Perception breakdown.
 *
 * Formula: 10 + WIS mod + Perception proficiency (or expertise = 2× prof)
 *          + any "passive_perception" effect modifiers (Observant feat, etc.)
 */
export function getPassivePerceptionBreakdown(char: CharacterData): StatBreakdown {
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  const wisMod = abilityMod(ctx.abilities.wisdom);
  const profBonus = ctx.proficiencyBonus;

  const profSkills = new Set(
    getProficienciesFromBundles(bundles, "skill").map((s) => s.toLowerCase()),
  );
  const expertiseSkills = new Set(
    collectProperties(bundles, "expertise").map((p) => p.skill.toLowerCase().replace(/ /g, "_")),
  );
  const proficient = profSkills.has("perception");
  const expertise = expertiseSkills.has("perception");

  const contributions: StatContribution[] = [
    { label: "Base", value: 10, operation: "base" },
    { label: "WIS mod", value: wisMod, operation: "add" },
  ];
  let base = 10 + wisMod;

  if (expertise) {
    contributions.push({
      label: "Perception expertise (2× prof)",
      value: profBonus * 2,
      operation: "add",
    });
    base += profBonus * 2;
  } else if (proficient) {
    contributions.push({
      label: "Perception proficiency",
      value: profBonus,
      operation: "add",
    });
    base += profBonus;
  }

  const effectContribs = gatherContributions(bundles, "passive_perception", ctx);
  contributions.push(...effectContribs);
  const total = applyContributions(base, effectContribs);

  return { total, contributions };
}

// ---------------------------------------------------------------------------
// Ability Scores
// ---------------------------------------------------------------------------

/**
 * Ability-score breakdown: base score from `char.static.abilities[ability]` plus
 * every modifier targeting that ability (ASI, Belt of Giant Strength, Enhance Ability, etc.).
 */
export function getAbilityBreakdown(
  char: CharacterData,
  ability: keyof AbilityScores,
): StatBreakdown {
  const bundles = collectActiveBundles(char);
  // Use BASE abilities in context — ability-target modifiers must not reference other abilities.
  const base = char.static.abilities[ability];
  const baseCtx: ResolveContext = {
    totalLevel: char.static.classes.reduce((s, c) => s + c.level, 0),
    classLevel: char.static.classes[0]?.level ?? 1,
    proficiencyBonus:
      Math.floor((char.static.classes.reduce((s, c) => s + c.level, 0) - 1) / 4) + 2,
    stackCount: char.dynamic.exhaustionLevel ?? undefined,
    abilities: char.static.abilities,
  };

  const contributions: StatContribution[] = [
    { label: "Base score", value: base, operation: "base" },
  ];
  const effectContribs = gatherContributions(bundles, ability as ModifierTarget, baseCtx);
  contributions.push(...effectContribs);

  // Resolved ability score (uses the same getAbilities path to stay in sync with displayed value)
  const resolved = getAbilities(char)[ability];

  return { total: resolved, contributions };
}
