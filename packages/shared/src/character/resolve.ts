/**
 * Character Resolver Accessors
 *
 * On-demand derivation of all character stats from effect bundles.
 *
 * Phase 7: every accessor derives its value from:
 *   1. char.static.effects  — permanent build-time bundles (species, class features,
 *      subclass features, feats, class proficiency grants, skill grants)
 *   2. char.dynamic.activeEffects — runtime bundles (conditions, spells, feature
 *      activations, item equip/attune events)
 *   3. Implicit bundles from currently-equipped magic items (getMagicItem effects)
 *   4. Implicit bundles from active conditions (getCondition effects)
 *   5. Implicit bundles from concentration target (getSpell effects)
 *
 * Do NOT read char.static.armorClass / .maxHP / .skills / .savingThrows / etc. —
 * those fields no longer exist (removed in Phase 7).
 */

import type { CharacterData, AbilityScores, CharacterClass } from "../types/character";
import type { EffectBundle, ResolveContext, ModifierTarget } from "../types/effects";
import type { Item } from "../types/item";
import {
  resolveStat,
  collectProperties,
  getProficiencies as getProficienciesFromBundles,
  getSenses as getSensesFromBundles,
  getResources,
  getExtraAttacks as getExtraAttacksFromBundles,
} from "../utils/effect-resolver";
import { evaluateExpression } from "../utils/expression-evaluator";
import {
  getClass,
  getSpecies,
  getBaseItem,
  getMagicItem,
  getCondition,
  getSpell,
} from "../data/index";
import { computeEquipmentAC } from "../builders/character-builder";

// ---------------------------------------------------------------------------
// Re-exported types for convenience
// ---------------------------------------------------------------------------

export type { AbilityScores, CharacterClass } from "../types/character";

// The shape types still exported for consumers that import them from here
export type {
  SkillProficiency,
  SavingThrowProficiency,
  CharacterSpeed,
  AdvantageEntry,
  CombatBonus,
  ClassResource,
} from "../types/character";

// ---------------------------------------------------------------------------
// Skill ability map
// ---------------------------------------------------------------------------

const SKILL_ABILITY_MAP: Record<string, keyof AbilityScores> = {
  acrobatics: "dexterity",
  animal_handling: "wisdom",
  arcana: "intelligence",
  athletics: "strength",
  deception: "charisma",
  history: "intelligence",
  insight: "wisdom",
  intimidation: "charisma",
  investigation: "intelligence",
  medicine: "wisdom",
  nature: "intelligence",
  perception: "wisdom",
  performance: "charisma",
  persuasion: "charisma",
  religion: "intelligence",
  sleight_of_hand: "dexterity",
  stealth: "dexterity",
  survival: "wisdom",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Derive proficiency bonus from total character level.
 * Formula: floor((totalLevel - 1) / 4) + 2
 * Level  1-4  → +2, Level  5-8  → +3, Level  9-12 → +4,
 * Level 13-16 → +5, Level 17-20 → +6.
 */
function deriveProficiencyBonus(classes: CharacterClass[]): number {
  const totalLevel = classes.reduce((sum, c) => sum + c.level, 0);
  return Math.floor((totalLevel - 1) / 4) + 2;
}

/**
 * Internal: base ResolveContext pieces (no abilities resolved).
 * Only used for pass-1 ability resolution, where exposing resolved abilities
 * would create a recursion loop.
 */
function buildBaseCtx(char: CharacterData): Omit<ResolveContext, "abilities"> {
  const totalLevel = char.static.classes.reduce((sum, c) => sum + c.level, 0);
  const proficiencyBonus = Math.floor((totalLevel - 1) / 4) + 2;
  return {
    totalLevel,
    classLevel: char.static.classes[0]?.level ?? 1,
    proficiencyBonus,
    stackCount: char.dynamic.exhaustionLevel ?? undefined,
  };
}

/**
 * Build a ResolveContext with fully resolved ability scores.
 *
 * Use for AC/HP/saves/skills/spell DC resolution — any modifier expression
 * referencing `str`/`dex`/`con`/… sees the resolved ability, not the pure base.
 *
 * Invariant: ability-target modifiers (e.g. Belt of Giant Strength) must not
 * reference other abilities in their `value` expressions. The pass-1 resolver
 * uses a base-abilities context to avoid recursion.
 */
export function buildCtx(char: CharacterData): ResolveContext {
  return { ...buildBaseCtx(char), abilities: getAbilities(char) };
}

/**
 * Resolve a single ability score.
 *
 * Base = char.static.abilities[ability] (pure point-buy/rolled score).
 * Bundles contribute background assignments, ASI, feats, equipped items,
 * conditions, and concentration spell modifiers.
 */
export function getAbilityScore(
  char: CharacterData,
  ability: keyof AbilityScores,
  bundles?: EffectBundle[],
): number {
  const bs = bundles ?? collectActiveBundles(char);
  const baseCtx: ResolveContext = { ...buildBaseCtx(char), abilities: char.static.abilities };
  return resolveStat(bs, ability as ModifierTarget, char.static.abilities[ability], baseCtx);
}

/**
 * Resolve all six ability scores in one pass. Prefer this over calling
 * getAbilityScore six times — it shares the bundle collection and context.
 */
export function getAbilities(char: CharacterData): AbilityScores {
  const bundles = collectActiveBundles(char);
  const baseCtx: ResolveContext = { ...buildBaseCtx(char), abilities: char.static.abilities };
  const base = char.static.abilities;
  return {
    strength: resolveStat(bundles, "strength", base.strength, baseCtx),
    dexterity: resolveStat(bundles, "dexterity", base.dexterity, baseCtx),
    constitution: resolveStat(bundles, "constitution", base.constitution, baseCtx),
    intelligence: resolveStat(bundles, "intelligence", base.intelligence, baseCtx),
    wisdom: resolveStat(bundles, "wisdom", base.wisdom, baseCtx),
    charisma: resolveStat(bundles, "charisma", base.charisma, baseCtx),
  };
}

/**
 * Per-ability score ceiling. Default cap is 20; features like Barbarian
 * Primal Champion and Monk Body and Mind raise it via `score_cap` properties.
 * Returns the resolved cap for every ability, taking the max across stacking
 * sources so effects compose without trampling each other.
 */
export function getScoreCaps(char: CharacterData): AbilityScores {
  const bundles = collectActiveBundles(char);
  const caps: AbilityScores = {
    strength: 20,
    dexterity: 20,
    constitution: 20,
    intelligence: 20,
    wisdom: 20,
    charisma: 20,
  };
  for (const prop of collectProperties(bundles, "score_cap")) {
    if (prop.max > caps[prop.ability]) caps[prop.ability] = prop.max;
  }
  return caps;
}

/**
 * D20-roll floors that apply when this character makes the named check
 * (Reliable Talent, Indomitable Might).
 *
 * Each entry's `min` expression is pre-evaluated against the character's
 * current ResolveContext, so callers receive concrete numbers and can
 * apply them without re-evaluating the language.
 */
/**
 * Weapons whose Mastery property the character can use this Long Rest.
 * Returned as a Set of lowercased weapon names for quick membership checks
 * (the ActionsTab weapon row uses this to badge the equipped weapon).
 */
export function getWeaponMasteries(char: CharacterData): Set<string> {
  const bundles = collectActiveBundles(char);
  const set = new Set<string>();
  for (const prop of collectProperties(bundles, "weapon_mastery_grant")) {
    set.add(prop.weapon.toLowerCase());
  }
  return set;
}

/**
 * Crit-triggered riders the character carries (Crusher / Slasher / Piercer).
 *
 * Each rider matches a weapon damage type. The game engine consumes them
 * inside the apply_damage path when a crit is recorded.
 */
export function getCritRiders(
  char: CharacterData,
): Array<Extract<import("../types/effects").Property, { type: "crit_rider" }>> {
  const bundles = collectActiveBundles(char);
  return collectProperties(bundles, "crit_rider");
}

export function getNaturalWeapons(
  char: CharacterData,
): Array<Extract<import("../types/effects").Property, { type: "natural_weapon" }>> {
  const bundles = collectActiveBundles(char);
  return collectProperties(bundles, "natural_weapon");
}

export function getIgnoreResistances(
  char: CharacterData,
): Array<Extract<import("../types/effects").Property, { type: "ignore_resistance" }>> {
  const bundles = collectActiveBundles(char);
  return collectProperties(bundles, "ignore_resistance");
}

export function getInspirationGrants(
  char: CharacterData,
): Array<Extract<import("../types/effects").Property, { type: "inspiration_grant" }>> {
  const bundles = collectActiveBundles(char);
  return collectProperties(bundles, "inspiration_grant");
}

export function getConcentrationImmunities(
  char: CharacterData,
): Array<Extract<import("../types/effects").Property, { type: "concentration_immunity" }>> {
  const bundles = collectActiveBundles(char);
  return collectProperties(bundles, "concentration_immunity");
}

export function getSuppressAdvantage(
  char: CharacterData,
): Array<Extract<import("../types/effects").Property, { type: "suppress_advantage" }>> {
  const bundles = collectActiveBundles(char);
  return collectProperties(bundles, "suppress_advantage");
}

export function getTeleportGrants(
  char: CharacterData,
): Array<Extract<import("../types/effects").Property, { type: "teleport_grant" }>> {
  const bundles = collectActiveBundles(char);
  return collectProperties(bundles, "teleport_grant");
}

export function getSpellcastingFoci(
  char: CharacterData,
): Array<Extract<import("../types/effects").Property, { type: "spellcasting_focus" }>> {
  const bundles = collectActiveBundles(char);
  return collectProperties(bundles, "spellcasting_focus");
}

export function getFeatGrants(
  char: CharacterData,
): Array<Extract<import("../types/effects").Property, { type: "feat_grant" }>> {
  const bundles = collectActiveBundles(char);
  return collectProperties(bundles, "feat_grant");
}

export function getShapechanges(
  char: CharacterData,
): Array<Extract<import("../types/effects").Property, { type: "shapechange" }>> {
  const bundles = collectActiveBundles(char);
  return collectProperties(bundles, "shapechange");
}

export function getRollMinimums(
  char: CharacterData,
): Array<{ on: string; min: number; mode: "d20" | "total"; proficientOnly: boolean }> {
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  return collectProperties(bundles, "roll_minimum").map((prop) => ({
    on: prop.on,
    min: typeof prop.min === "number" ? prop.min : Math.floor(evaluateExpression(prop.min, ctx)),
    mode: prop.mode ?? "d20",
    proficientOnly: prop.proficientOnly ?? false,
  }));
}

/**
 * Collect all active EffectBundles for a character.
 *
 * Combines:
 *   - char.static.effects (permanent build-time bundles)
 *   - char.dynamic.activeEffects (runtime bundles: conditions, spells, activations)
 *   - Implicit bundles from currently-equipped magic items (resolved from DB)
 *   - Implicit bundles from currently-active conditions (resolved from DB)
 *   - Implicit bundle from concentration target's spell (resolved from DB)
 */
export function collectActiveBundles(char: CharacterData): EffectBundle[] {
  const bundles: EffectBundle[] = [...(char.static.effects ?? [])];

  // Runtime bundles from dynamic data
  for (const b of char.dynamic.activeEffects ?? []) {
    bundles.push(b);
  }

  // Implicit bundles from equipped magic items
  for (const item of char.dynamic.inventory) {
    if (!item.equipped) continue;
    const magicDb = getMagicItem(item.name);
    if (!magicDb?.effects) continue;
    // Skip if already in activeEffects (item was explicitly added via update_item)
    const existingId = `item:${item.name.toLowerCase()}`;
    if (bundles.some((b) => b.id === existingId)) continue;
    bundles.push({
      id: existingId,
      source: { type: "item", name: item.name },
      lifetime: { type: "manual" },
      effects: magicDb.effects,
    });
  }

  // Implicit bundles from active conditions
  for (const cond of char.dynamic.conditions) {
    const condDb = getCondition(cond.name);
    if (!condDb?.effects) continue;
    const existingId = `condition:${cond.name.toLowerCase()}`;
    if (bundles.some((b) => b.id === existingId)) continue;
    bundles.push({
      id: existingId,
      source: { type: "condition", name: cond.name },
      lifetime: { type: "manual" },
      effects: condDb.effects,
    });
  }

  // Implicit bundle from concentration target
  if (char.dynamic.concentratingOn) {
    const spellDb = getSpell(char.dynamic.concentratingOn.spellName);
    if (spellDb?.effects) {
      const existingId = `spell:${char.dynamic.concentratingOn.spellName.toLowerCase()}`;
      if (!bundles.some((b) => b.id === existingId)) {
        bundles.push({
          id: existingId,
          source: { type: "spell", name: char.dynamic.concentratingOn.spellName },
          lifetime: { type: "concentration" },
          effects: spellDb.effects,
        });
      }
    }
  }

  return bundles;
}

// ---------------------------------------------------------------------------
// Accessors — Phase 7: derived from effects
// ---------------------------------------------------------------------------

/**
 * Armor class.
 *
 * Phase 7: derived from equipped-armor + shield (via computeEquipmentAC) as the
 * base, then applies "ac" modifiers from effect bundles (Unarmored Defense "set"
 * overrides the base; Shield spell "add" stacks on top).
 */
export function getAC(char: CharacterData): number {
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  const inventory = char.dynamic.inventory;
  const equipAC = computeEquipmentAC(inventory, ctx.abilities);
  return resolveStat(bundles, "ac", equipAC.base, ctx) + equipAC.shieldBonus;
}

/**
 * Maximum hit points.
 *
 * Phase 7: derived from class hit-dice totals + CON modifier per level + hp
 * modifier effects (Tough = "2 * lvl", Dwarf Toughness = "lvl").
 *
 * Note: this is MAX HP. Current HP is char.dynamic.currentHP.
 */
export function getHP(char: CharacterData): number {
  const { classes } = char.static;
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);

  // Compute base max HP from hit dice (resolved CON, so CON-boosting items raise max HP)
  const conMod = abilityMod(ctx.abilities.constitution);
  let baseHP = 0;
  let isFirst = true;
  for (const cls of classes) {
    const classDb = getClass(cls.name);
    if (!classDb) continue;
    const hitDie = classDb.hitDiceFaces;
    const avgPerLevel = Math.floor(hitDie / 2) + 1;
    if (isFirst) {
      baseHP += hitDie + conMod;
      if (cls.level > 1) {
        baseHP += (cls.level - 1) * (avgPerLevel + conMod);
      }
      isFirst = false;
    } else {
      baseHP += cls.level * (avgPerLevel + conMod);
    }
  }
  if (baseHP === 0) baseHP = 1;

  // Apply hp modifier effects on top (Tough feat, etc.)
  const hpBonus = resolveStat(bundles, "hp", 0, ctx);
  return Math.max(1, baseHP + hpBonus);
}

/**
 * Movement speeds (walk + optional fly/swim/climb/burrow).
 *
 * Phase 7: derived from species base speed + speed modifier effects.
 */
export function getSpeed(char: CharacterData): import("../types/character").CharacterSpeed {
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  const species = getSpecies(char.static.race);
  const baseWalk = species?.speed ?? 30;

  const walk = resolveStat(bundles, "speed", baseWalk, ctx);
  const ctxWithSpeed = { ...ctx, speed: walk };
  const fly = resolveStat(bundles, "speed_fly", 0, ctxWithSpeed);
  const swim = resolveStat(bundles, "speed_swim", 0, ctxWithSpeed);
  const climb = resolveStat(bundles, "speed_climb", 0, ctxWithSpeed);
  const burrow = resolveStat(bundles, "speed_burrow", 0, ctxWithSpeed);

  return {
    walk,
    ...(fly > 0 ? { fly } : {}),
    ...(swim > 0 ? { swim } : {}),
    ...(climb > 0 ? { climb } : {}),
    ...(burrow > 0 ? { burrow } : {}),
  };
}

/**
 * Skill proficiencies with bonuses.
 *
 * Phase 7: derived from proficiency/expertise properties in effect bundles
 * for all 18 D&D 2024 skills.
 */
export function getSkills(char: CharacterData): import("../types/character").SkillProficiency[] {
  const bundles = collectActiveBundles(char);

  // Gather all proficient skills from bundles
  const profSkills = new Set(
    getProficienciesFromBundles(bundles, "skill").map((s) => s.toLowerCase()),
  );
  // Gather expertise skills
  const expertiseSkills = new Set(
    collectProperties(bundles, "expertise").map((p) => p.skill.toLowerCase().replace(/ /g, "_")),
  );

  return Object.entries(SKILL_ABILITY_MAP).map(([slug, ability]) => ({
    name: slug,
    ability,
    proficient: profSkills.has(slug),
    expertise: expertiseSkills.has(slug),
    bonus: undefined,
  }));
}

/**
 * Saving throw proficiencies.
 *
 * Phase 7: derived from "proficiency" category "save" properties in effect bundles.
 */
export function getSavingThrows(
  char: CharacterData,
): import("../types/character").SavingThrowProficiency[] {
  const bundles = collectActiveBundles(char);
  const profSaves = new Set(
    getProficienciesFromBundles(bundles, "save").map((s) => s.toLowerCase()),
  );
  const abilities: (keyof AbilityScores)[] = [
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
  ];
  return abilities.map((ability) => ({
    ability,
    proficient: profSaves.has(ability),
  }));
}

/**
 * Sensory capabilities as display strings (e.g. "Darkvision 60 ft.", "Passive Perception 14").
 *
 * Phase 7: derived from sense-type properties in effect bundles.
 * Passive Perception computed from Perception skill.
 */
export function getSenses(char: CharacterData): string[] {
  const bundles = collectActiveBundles(char);
  const senses: string[] = [];

  // Senses from effects (darkvision, blindsight, etc.)
  for (const s of getSensesFromBundles(bundles)) {
    senses.push(`${s.sense.charAt(0).toUpperCase() + s.sense.slice(1)} ${s.range} ft.`);
  }

  // Passive Perception
  const pp = computePassiveValue(char, bundles, "wisdom", "perception", "passive_perception");
  senses.push(`Passive Perception ${pp}`);

  return senses;
}

/**
 * Spellcasting stats for a specific class (DC, attack bonus, ability).
 *
 * Phase 7: derived from class DB spellcasting ability + proficiency bonus + effects.
 */
export function getSpellcasting(
  char: CharacterData,
  className: string,
): { ability: keyof AbilityScores; dc: number; attackBonus: number } | undefined {
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  const profBonus = deriveProficiencyBonus(char.static.classes);
  const { classes } = char.static;
  const abilities = ctx.abilities;

  const cls = classes.find((c) => c.name.toLowerCase() === className.toLowerCase());
  if (!cls) return undefined;

  const classDb = getClass(cls.name);

  // Class-level spellcasting ability (full/half/pact casters)
  const classAbility = classDb?.spellcastingAbility as keyof AbilityScores | undefined;
  if (classAbility) {
    const mod = abilityMod(abilities[classAbility]);
    const baseDC = 8 + profBonus + mod;
    const baseAttack = profBonus + mod;
    return {
      ability: classAbility,
      dc: resolveStat(bundles, "spell_save_dc", baseDC, ctx),
      attackBonus: resolveStat(bundles, "spell_attack", baseAttack, ctx),
    };
  }

  // Subclass spellcasting ability (third-caster subclasses: Eldritch Knight, Arcane Trickster)
  if (cls.subclass && classDb) {
    const sub = classDb.subclasses.find(
      (s) =>
        s.name.toLowerCase() === cls.subclass!.toLowerCase() ||
        s.shortName.toLowerCase() === cls.subclass!.toLowerCase(),
    );
    const subAbility = sub?.spellcastingAbility as keyof AbilityScores | undefined;
    if (subAbility && sub?.casterProgression != null) {
      const mod = abilityMod(abilities[subAbility]);
      const baseDC = 8 + profBonus + mod;
      const baseAttack = profBonus + mod;
      return {
        ability: subAbility,
        dc: resolveStat(bundles, "spell_save_dc", baseDC, ctx),
        attackBonus: resolveStat(bundles, "spell_attack", baseAttack, ctx),
      };
    }
  }

  return undefined;
}

/**
 * Advantage/disadvantage entries from species, feats, and features.
 *
 * Phase 7: derived from advantage/disadvantage properties in effect bundles.
 */
export function getAdvantages(char: CharacterData): import("../types/character").AdvantageEntry[] {
  const bundles = collectActiveBundles(char);
  const result: import("../types/character").AdvantageEntry[] = [];

  for (const adv of collectProperties(bundles, "advantage")) {
    const source = bundles.find((b) =>
      b.effects.properties?.some((p) => p.type === "advantage" && p === adv),
    )?.source;
    result.push({
      type: "advantage",
      subType: adv.on,
      restriction: (adv as { condition?: string }).condition,
      source: source?.featureName ?? source?.name ?? "Unknown",
    });
  }

  for (const disadv of collectProperties(bundles, "disadvantage")) {
    const source = bundles.find((b) =>
      b.effects.properties?.some((p) => p.type === "disadvantage" && p === disadv),
    )?.source;
    result.push({
      type: "disadvantage",
      subType: disadv.on,
      restriction: (disadv as { condition?: string }).condition,
      source: source?.featureName ?? source?.name ?? "Unknown",
    });
  }

  return result;
}

/**
 * Proficiency strings for a given kind.
 *
 * Phase 7: derived from proficiency-type properties in effect bundles.
 */
export function getProficiencies(
  char: CharacterData,
  kind: "armor" | "weapons" | "tools" | "other",
): string[] {
  const bundles = collectActiveBundles(char);
  // Map the display kind to the effect property category
  const categoryMap: Record<string, string> = {
    armor: "armor",
    weapons: "weapon",
    tools: "tool",
    other: "other",
  };
  return getProficienciesFromBundles(bundles, categoryMap[kind] ?? kind);
}

/**
 * Class resources (Rage, Bardic Inspiration, Ki Points, etc.).
 *
 * Phase 7: derived from resource-type properties in effect bundles,
 * with maxUses expressions evaluated against the current ResolveContext.
 */
export function getClassResources(
  char: CharacterData,
): import("../types/character").ClassResource[] {
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  const resources: import("../types/character").ClassResource[] = [];
  const seen = new Set<string>();

  for (const res of getResources(bundles)) {
    if (seen.has(res.name)) continue;
    seen.add(res.name);

    const maxUses =
      typeof res.maxUses === "number" ? res.maxUses : evaluateExpression(res.maxUses, ctx);
    if (maxUses <= 0) continue;

    const bundleSource = bundles.find((b) =>
      b.effects.properties?.some((p) => p.type === "resource" && p.name === res.name),
    )?.source;

    let sourceFeature: import("../types/character").CharacterFeatureRef | undefined;
    if (bundleSource) {
      const sourceKind = bundleSource.type;
      const dbKind: import("../types/character").CharacterFeatureRef["dbKind"] | null =
        sourceKind === "class"
          ? "class"
          : sourceKind === "subclass"
            ? "subclass"
            : sourceKind === "feat"
              ? "feat"
              : sourceKind === "species"
                ? "species"
                : sourceKind === "background"
                  ? "background"
                  : null;
      if (dbKind) {
        sourceFeature = {
          dbKind,
          dbName: bundleSource.name,
          featureName: bundleSource.featureName,
          sourceLabel: bundleSource.featureName ?? bundleSource.name,
        };
      }
    }

    resources.push({
      name: res.name,
      maxUses: Math.floor(maxUses),
      longRest: res.longRest,
      shortRest: res.shortRest,
      source: bundleSource?.name ?? "Unknown",
      sourceFeature,
    });
  }

  return resources;
}

/**
 * Combat bonuses (flat attack/damage/initiative bonuses from feats, magic items, etc.).
 *
 * Phase 7: derived from modifier-type effects targeting attack/damage/initiative.
 */
export function getCombatBonus(char: CharacterData): import("../types/character").CombatBonus[] {
  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  const bonuses: import("../types/character").CombatBonus[] = [];

  const atkTargets = [
    { target: "attack_melee", attackType: "melee" },
    { target: "attack_ranged", attackType: "ranged" },
    { target: "attack_spell", attackType: "spell" },
  ] as const;

  for (const { target, attackType } of atkTargets) {
    const value = resolveStat(bundles, target, 0, ctx);
    if (value !== 0) {
      const src = bundles.find((b) =>
        b.effects.modifiers?.some((m) => m.target === target || m.target === "attack"),
      )?.source;
      bonuses.push({
        type: "attack",
        value,
        attackType,
        source: src?.featureName ?? src?.name ?? "Unknown",
      });
    }
  }

  const initBonus = resolveStat(bundles, "initiative", 0, ctx);
  if (initBonus !== 0) {
    const src = bundles.find((b) =>
      b.effects.modifiers?.some((m) => m.target === "initiative"),
    )?.source;
    bonuses.push({
      type: "initiative",
      value: initBonus,
      source: src?.featureName ?? src?.name ?? "Unknown",
    });
  }

  const dmgTargets = [
    { target: "damage_melee", attackType: "melee" },
    { target: "damage_ranged", attackType: "ranged" },
    { target: "damage_spell", attackType: "spell" },
  ] as const;

  for (const { target, attackType } of dmgTargets) {
    const value = resolveStat(bundles, target, 0, ctx);
    if (value !== 0) {
      const src = bundles.find((b) =>
        b.effects.modifiers?.some((m) => m.target === target || m.target === "damage"),
      )?.source;
      bonuses.push({
        type: "damage",
        value,
        attackType,
        source: src?.featureName ?? src?.name ?? "Unknown",
      });
    }
  }

  return bonuses;
}

// ---------------------------------------------------------------------------
// Passive scores
// ---------------------------------------------------------------------------

function computePassiveValue(
  char: CharacterData,
  bundles: EffectBundle[],
  ability: keyof AbilityScores,
  skillKey: string,
  bonusTarget: ModifierTarget,
): number {
  const profBonus = deriveProficiencyBonus(char.static.classes);
  const mod = abilityMod(getAbilityScore(char, ability, bundles));

  const profSkills = new Set(
    getProficienciesFromBundles(bundles, "skill").map((s) => s.toLowerCase()),
  );
  const expertiseSkills = new Set(
    collectProperties(bundles, "expertise").map((p) => p.skill.toLowerCase().replace(/ /g, "_")),
  );

  const proficient = profSkills.has(skillKey);
  const expertise = expertiseSkills.has(skillKey);

  let base = 10 + mod;
  if (expertise) {
    base += profBonus * 2;
  } else if (proficient) {
    base += profBonus;
  }

  // Layer bonuses from passive_perception / passive_investigation modifiers
  // (Observant feat, etc.) on top of the base value.
  const baseCtx: ResolveContext = {
    ...buildBaseCtx(char),
    abilities: char.static.abilities,
  };
  return resolveStat(bundles, bonusTarget, base, baseCtx);
}

/**
 * Passive Perception score.
 *
 * 10 + WIS mod + Perception proficiency/expertise + passive_perception modifiers.
 */
export function getPassivePerception(char: CharacterData): number {
  const bundles = collectActiveBundles(char);
  return computePassiveValue(char, bundles, "wisdom", "perception", "passive_perception");
}

/**
 * Passive Investigation score.
 *
 * 10 + INT mod + Investigation proficiency/expertise + passive_investigation modifiers.
 */
export function getPassiveInvestigation(char: CharacterData): number {
  const bundles = collectActiveBundles(char);
  return computePassiveValue(
    char,
    bundles,
    "intelligence",
    "investigation",
    "passive_investigation",
  );
}

/**
 * Attack bonus for a weapon item.
 *
 * Phase 7: computes from character ability scores + proficiency bonus + effect
 * resolver modifiers (fighting styles, magic weapon bonuses).
 *
 * Rules:
 *   - Ammunition property → ranged weapon → DEX modifier
 *   - Finesse property    → max(STR, DEX) modifier
 *   - Otherwise          → STR modifier (melee/thrown)
 *   - Add proficiency bonus if proficient with the weapon category
 *   - Overlay attack_melee / attack_ranged modifier from effects
 *
 * Returns undefined for non-weapon items (no weapon sub-object).
 */
export function getWeaponAttack(char: CharacterData, item: Item): number | undefined {
  if (!item.weapon) return undefined;

  const bundles = collectActiveBundles(char);
  const ctx = buildCtx(char);
  const profBonus = deriveProficiencyBonus(char.static.classes);
  const strMod = abilityMod(ctx.abilities.strength);
  const dexMod = abilityMod(ctx.abilities.dexterity);
  const props = item.weapon.properties ?? [];

  let abilityBonus: number;
  let isRanged = false;
  if (props.includes("Ammunition")) {
    abilityBonus = dexMod;
    isRanged = true;
  } else if (props.includes("Finesse")) {
    abilityBonus = Math.max(strMod, dexMod);
  } else {
    abilityBonus = strMod;
  }

  // Determine proficiency from DB weapon category
  const baseDb = getBaseItem(item.name);
  const category = baseDb?.weaponCategory; // "simple" | "martial" | undefined
  const weaponProfs = getProficiencies(char, "weapons");
  const profSet = new Set(weaponProfs.map((p) => p.toLowerCase()));
  const nameLower = item.name.toLowerCase();

  const proficient =
    category === "simple"
      ? profSet.has("simple weapons") || profSet.has("simple") || profSet.has(nameLower)
      : category === "martial"
        ? profSet.has("martial weapons") || profSet.has("martial") || profSet.has(nameLower)
        : profSet.has(nameLower);

  // Base attack bonus = ability + proficiency
  const base = abilityBonus + (proficient ? profBonus : 0);

  // Overlay effect modifiers (fighting style bonuses, magical weapon enchantments)
  const effectTarget = isRanged ? "attack_ranged" : "attack_melee";
  const effectBonus = resolveStat(bundles, effectTarget, 0, ctx);

  return base + effectBonus;
}

/**
 * Number of attacks the character can make with their Attack action.
 *
 * Phase 7: uses getExtraAttacks(bundles) from the effect resolver, which reads the
 * structured extra_attack property. Returns 1 (base) + extra attack count from effects.
 */
export function getExtraAttacks(char: CharacterData): number {
  const bundles = collectActiveBundles(char);
  return 1 + getExtraAttacksFromBundles(bundles);
}
