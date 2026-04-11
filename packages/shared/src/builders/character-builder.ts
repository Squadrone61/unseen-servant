/**
 * Character Builder — Effect-System Powered
 *
 * Collects EffectBundles from species, class features, subclass features,
 * and feats, then resolves stats through the Universal Effect System.
 * No hardcoded class-specific logic — everything comes from the database.
 *
 * Flow: CharacterIdentifiers → collectBuildEffects() → resolveStat/collectProperties → CharacterData
 */

import type {
  CharacterData,
  CharacterStaticData,
  CharacterDynamicData,
  CharacterFeature,
  ClassResource,
  ProficiencyGroup,
  SkillProficiency,
  SavingThrowProficiency,
  SpellSlotLevel,
  AbilityScores,
  CombatBonus,
  AdvantageEntry,
} from "../types/character";
import type { CharacterIdentifiers } from "./types";
import type {
  EffectBundle,
  EffectSource,
  EntityEffects,
  Property,
  ResolveContext,
} from "../types/effects";
import {
  resolveStat,
  collectProperties,
  getProficiencies,
  getSenses,
  getResources,
} from "../utils/effect-resolver";
import { evaluateExpression } from "../utils/expression-evaluator";
import {
  getClass,
  getSpecies,
  getSpell,
  getFeat,
  getBaseItem,
  getCondition,
  getCasterMultiplier,
  THIRD_CASTER_SLOTS,
} from "../data/index";
import { SKILL_ABILITY_MAP } from "../utils/5etools";

// ─── Helpers ─────────────────────────────────────────────

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Third-caster subclasses that grant spellcasting */
const THIRD_CASTER_SUBCLASSES = new Set(["eldritch knight", "arcane trickster"]);

/** Spellcasting ability by class name */
const SPELLCASTING_ABILITY: Record<string, keyof AbilityScores> = {
  bard: "charisma",
  cleric: "wisdom",
  druid: "wisdom",
  paladin: "charisma",
  ranger: "wisdom",
  sorcerer: "charisma",
  warlock: "charisma",
  wizard: "intelligence",
};

/** Multiclass spell slot table (caster levels 1-20) */
const MULTICLASS_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

// ─── Effect Collection ───────────────────────────────────

/**
 * Collect all build-time EffectBundles from the character's sources:
 * species, class features, subclass features, and feats.
 */
function collectBuildEffects(ids: CharacterIdentifiers): EffectBundle[] {
  const bundles: EffectBundle[] = [];

  // Species effects
  const species = getSpecies(ids.race);
  if (species?.effects) {
    bundles.push({
      id: `species:${ids.race}`,
      source: { type: "species", name: ids.race },
      lifetime: { type: "permanent" },
      effects: species.effects,
    });
  }

  // Class and subclass feature effects
  for (const cls of ids.classes) {
    const classDb = getClass(cls.name);
    if (!classDb) continue;

    for (const feature of classDb.features) {
      if (feature.level <= cls.level && feature.effects) {
        bundles.push({
          id: `class:${cls.name}:${feature.name}`,
          source: {
            type: "class",
            name: cls.name,
            featureName: feature.name,
            level: feature.level,
          },
          lifetime: { type: "permanent" },
          effects: feature.effects,
        });
      }
    }

    if (cls.subclass) {
      const sub = classDb.subclasses.find(
        (s) =>
          s.name.toLowerCase() === cls.subclass!.toLowerCase() ||
          s.shortName.toLowerCase() === cls.subclass!.toLowerCase(),
      );
      if (sub) {
        for (const sf of sub.features) {
          if (sf.level <= cls.level && sf.effects) {
            bundles.push({
              id: `subclass:${sub.name}:${sf.name}`,
              source: { type: "subclass", name: sub.name, featureName: sf.name, level: sf.level },
              lifetime: { type: "permanent" },
              effects: sf.effects,
            });
          }
        }
      }
    }
  }

  // Feat effects (from additional features)
  if (ids.additionalFeatures) {
    for (const feat of ids.additionalFeatures) {
      if (feat.source === "feat") {
        const dbFeat = getFeat(feat.name);
        if (dbFeat?.effects) {
          bundles.push({
            id: `feat:${feat.name}`,
            source: { type: "feat", name: feat.name },
            lifetime: { type: "permanent" },
            effects: dbFeat.effects,
          });
        }
      }
    }
  }

  return bundles;
}

// ─── Main Builder ────────────────────────────────────────

export function buildCharacter(ids: CharacterIdentifiers): {
  character: CharacterData;
  warnings: string[];
} {
  const warnings: string[] = [];
  const totalLevel = ids.classes.reduce((sum, c) => sum + c.level, 0);
  const proficiencyBonus = Math.floor((totalLevel - 1) / 4) + 2;
  const species = getSpecies(ids.race);

  // Collect all effects from species, class features, subclass features, feats
  const bundles = collectBuildEffects(ids);

  // Build resolve context for expression evaluation
  const ctx: ResolveContext = {
    abilities: ids.abilities,
    totalLevel,
    classLevel: ids.classes[0]?.level ?? 1,
    proficiencyBonus,
  };

  // ── HP ──────────────────────────────────────────────────
  // Base HP from identifiers + bonus from effects (Tough = "2 * lvl", Dwarf Toughness = "lvl")
  const hpBonus = resolveStat(bundles, "hp", 0, ctx);
  const maxHP = Math.max(1, ids.maxHP + hpBonus);

  // ── AC ──────────────────────────────────────────────────
  // Start with equipment AC, then apply effects
  const equipmentAC = computeEquipmentAC(ids);
  const ac =
    ids.armorClass ?? resolveStat(bundles, "ac", equipmentAC.base, ctx) + equipmentAC.shieldBonus;

  // ── Speed ───────────────────────────────────────────────
  const baseSpeed = species?.speed ?? 30;
  const speed = ids.speed ?? resolveStat(bundles, "speed", baseSpeed, ctx);

  // ── Skills ──────────────────────────────────────────────
  const effectSkillProfs = getProficiencies(bundles, "skill");
  const allSkillProfs = [...new Set([...ids.skillProficiencies, ...effectSkillProfs])];
  const skills = computeSkills(
    allSkillProfs,
    ids.skillExpertise,
    ids.abilities,
    proficiencyBonus,
    ids.skillBonuses,
  );

  // ── Saving Throws ───────────────────────────────────────
  const savingThrows = computeSavingThrows(ids);

  // ── Spellcasting ────────────────────────────────────────
  const spellcasting = computeSpellcasting(ids, proficiencyBonus);

  // ── Spell Slots ─────────────────────────────────────────
  const { regularSlots, pactSlots } = computeSpellSlots(ids);

  // ── Spells (enriched from DB) ───────────────────────────
  const spells = ids.spells.map((spell) => {
    const db = getSpell(spell.name);
    if (!db) return spell;
    return {
      ...spell,
      description: spell.description || db.description,
      school: spell.school || db.school,
      castingTime: spell.castingTime || db.castingTime,
      range: spell.range || db.range,
      components: spell.components || db.components,
      duration: spell.duration || db.duration,
      concentration: spell.concentration ?? db.concentration,
      ritual: spell.ritual ?? db.ritual,
    };
  });

  // ── Features (from DB) ──────────────────────────────────
  const features = computeFeatures(ids);

  // ── Class Resources (from effects) ──────────────────────
  const classResources = computeResources(bundles, ctx);

  // ── Proficiencies (class flat arrays + effects) ─────────
  const proficiencies = computeProficiencies(ids, bundles);

  // ── Senses (from effects + species.darkvision) ──────────
  const senses = computeSenses(bundles, species, ids, proficiencyBonus, skills);

  // ── Combat Bonuses (from effects) ───────────────────────
  const combatBonuses = computeCombatBonuses(bundles, ctx);

  // ── Advantages (from effects) ───────────────────────────
  const advantages = computeAdvantages(bundles, ids);

  // ── Assemble ────────────────────────────────────────────

  const staticData: CharacterStaticData = {
    name: ids.name,
    species: ids.race,
    race: ids.race,
    classes: ids.classes,
    abilities: ids.abilities,
    maxHP,
    armorClass: ac,
    proficiencyBonus,
    speed,
    features,
    classResources,
    proficiencies,
    skills,
    savingThrows,
    senses,
    languages: ids.languages,
    spells,
    spellcastingAbility: spellcasting.ability,
    spellSaveDC: spellcasting.dc,
    spellAttackBonus: spellcasting.attackBonus,
    combatBonuses,
    advantages,
    traits: ids.traits ?? {},
    appearance: ids.appearance,
    backstory: ids.backstory || undefined,
    importedAt: Date.now(),
    source: ids.source,
  };

  const dynamicData: CharacterDynamicData = {
    currentHP: maxHP,
    tempHP: 0,
    spellSlotsUsed: regularSlots,
    pactMagicSlots: pactSlots.length > 0 ? pactSlots : undefined,
    resourcesUsed: {},
    conditions: [],
    deathSaves: { successes: 0, failures: 0 },
    inventory: ids.equipment,
    currency: ids.currency ?? { cp: 0, sp: 0, gp: 0, pp: 0 },
    heroicInspiration: false,
    activeEffects: [],
  };

  return { character: { static: staticData, dynamic: dynamicData }, warnings };
}

// ─── Equipment AC ────────────────────────────────────────
// Equipment AC is separate from effects — it reads actual inventory items.
// Effects provide unarmored defense formulas and other AC modifiers.
// The resolver picks the highest "set" value (equipment base vs unarmored defense)
// and then stacks all "add" modifiers on top.

function computeEquipmentAC(ids: CharacterIdentifiers): { base: number; shieldBonus: number } {
  const dexMod = abilityMod(ids.abilities.dexterity);
  let base = 10 + dexMod; // unarmored default
  let shieldBonus = 0;

  for (const item of ids.equipment) {
    if (!item.equipped) continue;

    if (item.type === "Shield") {
      shieldBonus = 2;
      continue;
    }

    if (item.type === "Armor" && item.name) {
      const baseItem = getBaseItem(item.name);
      if (baseItem?.armor && baseItem.ac != null) {
        const typeCode = baseItem.type;
        if (typeCode === "LA") base = baseItem.ac + dexMod;
        else if (typeCode === "MA") base = baseItem.ac + Math.min(dexMod, 2);
        else if (typeCode === "HA") base = baseItem.ac;
      } else if (item.armorClass) {
        base = item.armorClass + dexMod;
      }
    }
  }

  return { base, shieldBonus };
}

// ─── Skills ──────────────────────────────────────────────

function computeSkills(
  proficiencies: string[],
  expertise: string[],
  abilities: AbilityScores,
  profBonus: number,
  bonuses?: Map<string, number>,
): SkillProficiency[] {
  const profSet = new Set(proficiencies);
  const expertiseSet = new Set(expertise);

  return Object.entries(SKILL_ABILITY_MAP).map(([slug, ability]) => ({
    name: slug,
    ability,
    proficient: profSet.has(slug),
    expertise: expertiseSet.has(slug),
    bonus: bonuses?.get(slug) || undefined,
  }));
}

// ─── Saving Throws ───────────────────────────────────────

function computeSavingThrows(ids: CharacterIdentifiers): SavingThrowProficiency[] {
  const profSet = new Set(ids.saveProficiencies);
  const allAbilities: (keyof AbilityScores)[] = [
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
  ];
  return allAbilities.map((ability) => ({
    ability,
    proficient: profSet.has(ability),
    bonus: ids.saveBonuses?.get(ability) || undefined,
  }));
}

// ─── Spellcasting ────────────────────────────────────────

function computeSpellcasting(
  ids: CharacterIdentifiers,
  profBonus: number,
): { ability?: keyof AbilityScores; dc?: number; attackBonus?: number } {
  let bestAbility: keyof AbilityScores | undefined;
  let bestLevel = 0;

  for (const cls of ids.classes) {
    const clsLower = cls.name.toLowerCase();
    const subLower = (cls.subclass ?? "").toLowerCase();

    // Standard caster
    const scAbility = SPELLCASTING_ABILITY[clsLower];
    if (scAbility) {
      if (cls.level > bestLevel) {
        bestAbility = scAbility;
        bestLevel = cls.level;
      }
      continue;
    }

    // Third-caster subclasses
    if (THIRD_CASTER_SUBCLASSES.has(subLower) && cls.level > bestLevel) {
      bestAbility = "intelligence";
      bestLevel = cls.level;
    }
  }

  if (!bestAbility) return {};

  const mod = abilityMod(ids.abilities[bestAbility]);
  return {
    ability: bestAbility,
    dc: 8 + profBonus + mod,
    attackBonus: profBonus + mod,
  };
}

// ─── Spell Slots ─────────────────────────────────────────

function computeSpellSlots(ids: CharacterIdentifiers): {
  regularSlots: SpellSlotLevel[];
  pactSlots: SpellSlotLevel[];
} {
  const regularSlots: SpellSlotLevel[] = [];
  const pactSlots: SpellSlotLevel[] = [];

  const casterClasses: { name: string; level: number; subclass?: string }[] = [];
  let warlockLevel = 0;

  for (const cls of ids.classes) {
    if (cls.name.toLowerCase() === "warlock") {
      warlockLevel = cls.level;
      continue;
    }
    const classDb = getClass(cls.name);
    const subLower = (cls.subclass ?? "").toLowerCase();
    if (classDb?.casterProgression || THIRD_CASTER_SUBCLASSES.has(subLower)) {
      casterClasses.push(cls);
    }
  }

  // Warlock pact slots
  if (warlockLevel > 0) {
    const classDb = getClass("Warlock");
    const table = classDb?.spellSlotTable;
    if (table && warlockLevel <= table.length) {
      const row = table[warlockLevel - 1];
      // Warlock table: find highest non-zero slot level
      for (let i = row.length - 1; i >= 0; i--) {
        if (row[i] > 0) {
          pactSlots.push({ level: i + 1, total: row[i], used: 0 });
          break;
        }
      }
    }
  }

  if (casterClasses.length === 0) return { regularSlots, pactSlots };

  let slotRow: number[] | undefined;

  if (casterClasses.length === 1) {
    const cls = casterClasses[0];
    const subLower = (cls.subclass ?? "").toLowerCase();

    if (THIRD_CASTER_SUBCLASSES.has(subLower)) {
      slotRow = THIRD_CASTER_SLOTS[cls.level] ?? [];
    } else {
      const classDb = getClass(cls.name);
      const table = classDb?.spellSlotTable;
      slotRow = table && cls.level <= table.length ? table[cls.level - 1] : [];
    }
  } else {
    // Multiclass: compute weighted caster level
    let combinedCasterLevel = 0;
    for (const cls of casterClasses) {
      const multiplier = getCasterMultiplier(cls.name.toLowerCase());
      const subLower = (cls.subclass ?? "").toLowerCase();
      const thirdMult = THIRD_CASTER_SUBCLASSES.has(subLower) ? 1 / 3 : 0;
      combinedCasterLevel += cls.level * (multiplier || thirdMult);
    }
    const effectiveLevel = Math.min(Math.max(Math.floor(combinedCasterLevel), 1), 20);
    slotRow = MULTICLASS_SLOTS[effectiveLevel - 1];
  }

  if (slotRow) {
    for (let i = 0; i < slotRow.length; i++) {
      if (slotRow[i] > 0) {
        regularSlots.push({ level: i + 1, total: slotRow[i], used: 0 });
      }
    }
  }

  return { regularSlots, pactSlots };
}

// ─── Features ────────────────────────────────────────────

function computeFeatures(ids: CharacterIdentifiers): CharacterFeature[] {
  const features: CharacterFeature[] = [];
  const seen = new Set<string>();

  const add = (f: CharacterFeature) => {
    if (!seen.has(f.name)) {
      seen.add(f.name);
      features.push(f);
    }
  };

  // Caller-provided features first (may have richer data)
  for (const f of ids.additionalFeatures ?? []) add(f);

  // Class features from DB
  for (const cls of ids.classes) {
    const classDb = getClass(cls.name);
    if (!classDb) continue;

    for (const feature of classDb.features) {
      if (feature.level <= cls.level) {
        add({
          name: feature.name,
          description: feature.description,
          source: "class",
          sourceLabel: cls.name,
          requiredLevel: feature.level,
        });
      }
    }

    // Subclass features
    if (cls.subclass) {
      const sub = classDb.subclasses.find(
        (s) =>
          s.name.toLowerCase() === cls.subclass!.toLowerCase() ||
          s.shortName.toLowerCase() === cls.subclass!.toLowerCase(),
      );
      if (sub) {
        if (!seen.has(sub.name)) {
          add({
            name: sub.name,
            description: sub.description,
            source: "class",
            sourceLabel: cls.name,
            requiredLevel: 3,
          });
        }
        for (const sf of sub.features) {
          if (sf.level <= cls.level) {
            add({
              name: sf.name,
              description: sf.description,
              source: "class",
              sourceLabel: `${cls.name} (${sub.name})`,
              requiredLevel: sf.level,
            });
          }
        }
      }
    }
  }

  // Species description as a feature
  const species = getSpecies(ids.race);
  if (species) {
    add({
      name: ids.race,
      description: species.description,
      source: "race",
      sourceLabel: ids.race,
    });
  }

  // Enrich feat descriptions
  for (const feat of ids.additionalFeatures?.filter((f) => f.source === "feat") ?? []) {
    const dbFeat = getFeat(feat.name);
    if (dbFeat) {
      const idx = features.findIndex((f) => f.name === feat.name);
      if (idx >= 0 && (!features[idx].description || features[idx].description === feat.name)) {
        features[idx] = { ...features[idx], description: dbFeat.description };
      }
    }
  }

  return features;
}

// ─── Class Resources (from effects) ──────────────────────

function computeResources(bundles: EffectBundle[], ctx: ResolveContext): ClassResource[] {
  const resources: ClassResource[] = [];
  const seen = new Set<string>();

  for (const res of getResources(bundles)) {
    if (seen.has(res.name)) continue;
    seen.add(res.name);

    // Evaluate maxUses expression
    const maxUses =
      typeof res.maxUses === "number" ? res.maxUses : evaluateExpression(res.maxUses, ctx);

    if (maxUses <= 0) continue;

    // Find the bundle source
    const bundleSource = bundles.find((b) =>
      b.effects.properties?.some((p) => p.type === "resource" && p.name === res.name),
    )?.source;

    const className = bundleSource?.name ?? "Unknown";

    resources.push({
      name: res.name,
      maxUses: Math.floor(maxUses),
      resetType: res.resetOn === "short" ? "short" : "long",
      source: className,
    });
  }

  return resources;
}

// ─── Proficiencies ───────────────────────────────────────

function computeProficiencies(
  ids: CharacterIdentifiers,
  bundles: EffectBundle[],
): ProficiencyGroup {
  // Start with explicit overrides from identifiers
  if (ids.armorProficiencies || ids.weaponProficiencies) {
    return {
      armor: ids.armorProficiencies ?? [],
      weapons: ids.weaponProficiencies ?? [],
      tools: ids.toolProficiencies ?? [],
      other: ids.otherProficiencies ?? [],
    };
  }

  // Combine class DB fields + effect properties
  const armorSet = new Set<string>();
  const weaponSet = new Set<string>();
  const toolSet = new Set<string>(ids.toolProficiencies ?? []);

  for (const cls of ids.classes) {
    const classDb = getClass(cls.name);
    if (!classDb) continue;
    for (const a of classDb.armorProficiencies) armorSet.add(a);
    for (const w of classDb.weaponProficiencies) weaponSet.add(w);
    for (const t of classDb.toolProficiencies) toolSet.add(t);
  }

  // Effect-granted proficiencies
  for (const p of getProficiencies(bundles, "armor")) armorSet.add(p);
  for (const p of getProficiencies(bundles, "weapon")) weaponSet.add(p);
  for (const p of getProficiencies(bundles, "tool")) toolSet.add(p);

  return {
    armor: [...armorSet],
    weapons: [...weaponSet],
    tools: [...toolSet],
    other: ids.otherProficiencies ?? [],
  };
}

// ─── Senses ──────────────────────────────────────────────

function computeSenses(
  bundles: EffectBundle[],
  species: { darkvision?: number } | undefined,
  ids: CharacterIdentifiers,
  profBonus: number,
  skills: SkillProficiency[],
): string[] {
  if (ids.senses) return ids.senses;

  const senses: string[] = [];

  // Senses from effects (darkvision, blindsight, etc.)
  for (const s of getSenses(bundles)) {
    senses.push(`${s.sense.charAt(0).toUpperCase() + s.sense.slice(1)} ${s.range} ft.`);
  }

  // Species darkvision (if not already from effects)
  if (species?.darkvision && !senses.some((s) => s.toLowerCase().includes("darkvision"))) {
    senses.push(`Darkvision ${species.darkvision} ft.`);
  }

  // Passive Perception
  const wisMod = abilityMod(ids.abilities.wisdom);
  const perception = skills.find((s) => s.name === "perception");
  let passive = 10 + wisMod;
  if (perception?.proficient) passive += profBonus;
  if (perception?.expertise) passive += profBonus;
  if (perception?.bonus) passive += perception.bonus;
  senses.push(`Passive Perception ${passive}`);

  return senses;
}

// ─── Source Display Helper ───────────────────────────

function sourceLabel(src: EffectSource | undefined): string {
  if (!src) return "Unknown";
  return src.featureName ?? src.name;
}

// ─── Combat Bonuses (from effects) ───────────────────────

function computeCombatBonuses(bundles: EffectBundle[], ctx: ResolveContext): CombatBonus[] {
  const bonuses: CombatBonus[] = [];

  // Check each combat modifier target
  const targets: {
    target: "attack_melee" | "attack_ranged" | "attack_spell";
    attackType: "melee" | "ranged" | "spell";
  }[] = [
    { target: "attack_melee", attackType: "melee" },
    { target: "attack_ranged", attackType: "ranged" },
    { target: "attack_spell", attackType: "spell" },
  ];

  for (const { target, attackType } of targets) {
    const value = resolveStat(bundles, target, 0, ctx);
    if (value !== 0) {
      const source = bundles.find((b) =>
        b.effects.modifiers?.some((m) => m.target === target || m.target === "attack"),
      )?.source;
      bonuses.push({ type: "attack", value, attackType, source: sourceLabel(source) });
    }
  }

  // Initiative bonus
  const initBonus = resolveStat(bundles, "initiative", 0, ctx);
  if (initBonus !== 0) {
    const initSrc = bundles.find((b) =>
      b.effects.modifiers?.some((m) => m.target === "initiative"),
    )?.source;
    bonuses.push({ type: "initiative", value: initBonus, source: sourceLabel(initSrc) });
  }

  // Damage bonuses
  const dmgTargets: {
    target: "damage_melee" | "damage_ranged" | "damage_spell";
    attackType: "melee" | "ranged" | "spell";
  }[] = [
    { target: "damage_melee", attackType: "melee" },
    { target: "damage_ranged", attackType: "ranged" },
    { target: "damage_spell", attackType: "spell" },
  ];

  for (const { target, attackType } of dmgTargets) {
    const value = resolveStat(bundles, target, 0, ctx);
    if (value !== 0) {
      const dmgSrc = bundles.find((b) =>
        b.effects.modifiers?.some((m) => m.target === target || m.target === "damage"),
      )?.source;
      bonuses.push({ type: "damage", value, attackType, source: sourceLabel(dmgSrc) });
    }
  }

  return bonuses;
}

// ─── Advantages (from effects) ───────────────────────────

function computeAdvantages(bundles: EffectBundle[], ids: CharacterIdentifiers): AdvantageEntry[] {
  const advantages: AdvantageEntry[] = [...(ids.advantages ?? [])];

  for (const adv of collectProperties(bundles, "advantage")) {
    const advSrc = bundles.find((b) =>
      b.effects.properties?.some((p) => p.type === "advantage" && p === adv),
    )?.source;
    advantages.push({
      type: "advantage",
      subType: adv.on,
      restriction: (adv as { condition?: string }).condition,
      source: sourceLabel(advSrc),
    });
  }

  for (const disadv of collectProperties(bundles, "disadvantage")) {
    const disadvSrc = bundles.find((b) =>
      b.effects.properties?.some((p) => p.type === "disadvantage" && p === disadv),
    )?.source;
    advantages.push({
      type: "disadvantage",
      subType: disadv.on,
      restriction: (disadv as { condition?: string }).condition,
      source: sourceLabel(disadvSrc),
    });
  }

  return advantages;
}

// ─── Runtime Effect Bundle Factories ────────────────────────────────────────

/**
 * Create an EffectBundle from a condition name using the DB.
 * Used at runtime by the game engine when conditions are applied to a character.
 *
 * Returns null if the condition has no structured mechanical effects in the DB
 * (e.g., conditions only described via prose notes).
 *
 * Lifetime is "manual" because conditions are always removed explicitly by the
 * game engine via remove_condition — there is no automatic expiry at the bundle
 * level (duration tracking lives in the game state layer).
 */
export function createConditionBundle(conditionName: string): EffectBundle | null {
  const condition = getCondition(conditionName);
  if (!condition?.effects) return null;

  // Resolve grant properties: inline granted condition effects (e.g., Paralyzed → Incapacitated)
  const mergedEffects = resolveConditionGrants(condition.effects);

  return {
    id: `condition:${conditionName.toLowerCase()}`,
    source: { type: "condition", name: conditionName },
    lifetime: { type: "manual" },
    effects: mergedEffects,
  };
}

/**
 * Recursively resolve "grant" properties that reference other conditions.
 * Inlines the granted condition's effects (modifiers + properties) into the
 * parent, so a single bundle carries all transitive mechanical effects.
 * Capped at depth 3 to prevent cycles.
 */
function resolveConditionGrants(effects: EntityEffects, depth: number = 0): EntityEffects {
  if (depth > 3) return effects;

  const grants = (effects.properties ?? []).filter(
    (p): p is Extract<Property, { type: "grant" }> =>
      p.type === "grant" && p.grantType === "condition",
  );
  if (grants.length === 0) return effects;

  const mergedModifiers = [...(effects.modifiers ?? [])];
  // Keep non-grant properties, drop the grant references (they're being inlined)
  const mergedProperties = (effects.properties ?? []).filter(
    (p) => p.type !== "grant" || p.grantType !== "condition",
  );

  for (const grant of grants) {
    const grantedCondition = getCondition(grant.grant);
    if (!grantedCondition?.effects) continue;
    const resolved = resolveConditionGrants(grantedCondition.effects, depth + 1);
    mergedModifiers.push(...(resolved.modifiers ?? []));
    mergedProperties.push(...(resolved.properties ?? []));
  }

  return {
    modifiers: mergedModifiers.length > 0 ? mergedModifiers : undefined,
    properties: mergedProperties.length > 0 ? mergedProperties : undefined,
  };
}

/**
 * Create an EffectBundle for a concentration spell.
 * SpellDb does not yet carry structured effects, so this is a forward-looking
 * hook — returns null until spell effects are added to the database.
 */
export function createSpellBundle(spellName: string): EffectBundle | null {
  const spell = getSpell(spellName);
  if (!spell?.effects) return null;
  return {
    id: `spell:${spellName.toLowerCase()}`,
    source: { type: "spell", name: spellName },
    lifetime: spell.concentration ? { type: "concentration" } : { type: "manual" },
    effects: spell.effects,
  };
}

/**
 * Create an EffectBundle for an activated class/subclass feature (Rage, Wild Shape, etc.).
 *
 * Searches class features, then subclass features, for a feature matching `featureName`
 * that has an `activation` field. Returns null if not found or no activation effects.
 *
 * The bundle uses `lifetime: { type: "manual" }` — the AI DM explicitly deactivates it.
 *
 * @param className     Class name (e.g. "Barbarian")
 * @param featureName   Feature name (e.g. "Rage")
 * @param classLevel    Class level for expression context (clvl token)
 * @param subclassName  Optional subclass to search subclass features
 */
export function createActivationBundle(
  className: string,
  featureName: string,
  classLevel: number,
  subclassName?: string,
): EffectBundle | null {
  const cls = getClass(className);
  if (!cls) return null;

  // Search class features first
  const classFeature = cls.features.find(
    (f) => f.name.toLowerCase() === featureName.toLowerCase() && f.activation,
  );
  if (classFeature?.activation) {
    return {
      id: `activation:${className.toLowerCase()}:${featureName.toLowerCase()}`,
      source: { type: "class", name: className, featureName, level: classLevel },
      lifetime: { type: "manual" },
      effects: classFeature.activation,
    };
  }

  // Search subclass features if subclassName provided
  if (subclassName) {
    const subclass = cls.subclasses.find(
      (sc) => sc.name.toLowerCase() === subclassName.toLowerCase(),
    );
    if (subclass) {
      const subFeature = subclass.features.find(
        (f) => f.name.toLowerCase() === featureName.toLowerCase() && f.activation,
      );
      if (subFeature?.activation) {
        return {
          id: `activation:${className.toLowerCase()}:${featureName.toLowerCase()}`,
          source: { type: "subclass", name: subclassName, featureName, level: classLevel },
          lifetime: { type: "manual" },
          effects: subFeature.activation,
        };
      }
    }
  }

  // Search ALL subclass features if no subclassName given (fuzzy lookup)
  if (!subclassName) {
    for (const sc of cls.subclasses) {
      const subFeature = sc.features.find(
        (f) => f.name.toLowerCase() === featureName.toLowerCase() && f.activation,
      );
      if (subFeature?.activation) {
        return {
          id: `activation:${className.toLowerCase()}:${featureName.toLowerCase()}`,
          source: { type: "subclass", name: sc.name, featureName, level: classLevel },
          lifetime: { type: "manual" },
          effects: subFeature.activation,
        };
      }
    }
  }

  return null;
}
