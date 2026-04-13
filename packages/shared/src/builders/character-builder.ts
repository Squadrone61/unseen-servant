/**
 * Character Builder — Effect-System Powered
 *
 * Collects EffectBundles from species, class features, subclass features,
 * and feats, then resolves stats through the Universal Effect System.
 * No hardcoded class-specific logic — everything comes from the database.
 *
 * Flow: BuilderState → derive fields → collectBuildEffects() → resolveStat/collectProperties → CharacterData
 */

import type {
  CharacterData,
  CharacterStaticData,
  CharacterDynamicData,
  CharacterFeatureRef,
  ClassResource,
  SpellSlotLevel,
  AbilityScores,
  CharacterClass,
} from "../types/character";
import type { Spell } from "../types/spell";
import type { Item } from "../types/item";
import type { BuilderState } from "../types/builder";
import type { EffectBundle, EntityEffects, Property, ResolveContext } from "../types/effects";
import { resolveStat, getResources } from "../utils/effect-resolver";
import { evaluateExpression } from "../utils/expression-evaluator";
import {
  getClass,
  getSpecies,
  getSpell,
  getFeat,
  getBaseItem,
  getCondition,
  getMagicItem,
  getCasterMultiplier,
  getBackground,
} from "../data/index";
import multiclassSlots from "../data/multiclass-slots.json";

// ─── Helpers ─────────────────────────────────────────────

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

// ─── BuilderState Derivation ─────────────────────────────
// These functions replicate (and now own) what used to live in
// apps/web/.../useComputedCharacter.ts — deriving the "identifiers"
// directly from a BuilderState.

/**
 * The pure base ability scores: what the player rolled/bought.
 * Background, ASI, and feat bonuses are NOT applied here — they flow through
 * the effect system as EffectBundles (see collectBuildEffects).
 */
export function computeBaseAbilities(state: BuilderState): AbilityScores {
  return { ...state.baseAbilities };
}

/**
 * Compute average HP across all class entries.
 * The primary class (index 0) contributes its full hit die at level 1; all
 * other levels (including multiclass levels) use the average roll (half+1).
 * CON modifier applies once per total level.
 */
function computeMaxHPFromState(
  classes: Array<{ name: string; level: number }>,
  conScore: number,
): number {
  if (classes.length === 0) return 1;
  const conMod = abilityMod(conScore);
  let hp = 0;
  let isFirst = true;
  for (const entry of classes) {
    const cls = getClass(entry.name);
    if (!cls) continue;
    const hitDie = cls.hitDiceFaces;
    const averagePerLevel = Math.floor(hitDie / 2) + 1;
    if (isFirst) {
      hp += hitDie + conMod;
      if (entry.level > 1) {
        hp += (entry.level - 1) * (averagePerLevel + conMod);
      }
      isFirst = false;
    } else {
      hp += entry.level * (averagePerLevel + conMod);
    }
  }
  return Math.max(1, hp);
}

/**
 * Collect languages granted by species and background from the DB.
 * Common is always granted; language choice IDs add additional languages.
 */
function collectLanguagesFromState(state: BuilderState): string[] {
  const langs = new Set<string>(["Common"]);
  for (const [choiceId, values] of Object.entries(state.speciesChoices)) {
    if (choiceId.toLowerCase().includes("language")) {
      values.forEach((v) => langs.add(v));
    }
  }
  for (const [choiceId, values] of Object.entries(state.backgroundChoices)) {
    if (choiceId.toLowerCase().includes("language")) {
      values.forEach((v) => langs.add(v));
    }
  }
  return [...langs];
}

/**
 * Map builder cantrips + preparedSpells to Spell objects using the
 * D&D database to fill in spell metadata. Returns both the enriched spells
 * and any warnings for spells that could not be found in the DB.
 */
function assembleSpellsFromState(state: BuilderState, warnings: string[]): Spell[] {
  const spells: Spell[] = [];
  const allCantrips = new Set(Object.values(state.cantrips).flat());
  const allPrepared = new Set(Object.values(state.preparedSpells).flat());

  for (const cls of state.classes) {
    const classCantrips = state.cantrips[cls.name] ?? [];
    const classPrepared = state.preparedSpells[cls.name] ?? [];

    for (const name of classCantrips) {
      const db = getSpell(name);
      if (!db) {
        warnings.push(`Unknown spell "${name}" — skipped (no DB entry)`);
        continue;
      }
      spells.push({
        name,
        level: 0,
        school: db.school,
        castingTime: db.castingTime,
        range: db.range,
        components: db.components,
        duration: db.duration,
        description: db.description,
        ritual: db.ritual ?? false,
        concentration: db.concentration ?? false,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: cls.name,
      });
    }

    for (const name of classPrepared) {
      const db = getSpell(name);
      if (!db) {
        warnings.push(`Unknown spell "${name}" — skipped (no DB entry)`);
        continue;
      }
      spells.push({
        name,
        level: db.level,
        school: db.school,
        castingTime: db.castingTime,
        range: db.range,
        components: db.components,
        duration: db.duration,
        description: db.description,
        ritual: db.ritual ?? false,
        concentration: db.concentration ?? false,
        prepared: true,
        alwaysPrepared: false,
        spellSource: "class",
        knownByClass: true,
        sourceClass: cls.name,
      });
    }

    // Always-prepared subclass spells
    if (cls.subclass) {
      const classDb = getClass(cls.name);
      const sub = classDb?.subclasses.find(
        (s) => s.name.toLowerCase() === cls.subclass!.toLowerCase(),
      );
      if (sub?.additionalSpells) {
        for (const entry of sub.additionalSpells) {
          if (entry.minLevel > cls.level) continue;
          const name = entry.spell;
          if (allPrepared.has(name) || allCantrips.has(name)) continue;
          const db = getSpell(name);
          if (!db) {
            warnings.push(`Unknown spell "${name}" — skipped (no DB entry)`);
            continue;
          }
          spells.push({
            name,
            level: db.level,
            school: db.school,
            castingTime: db.castingTime,
            range: db.range,
            components: db.components,
            duration: db.duration,
            description: db.description,
            ritual: db.ritual ?? false,
            concentration: db.concentration ?? false,
            prepared: true,
            alwaysPrepared: true,
            spellSource: "class",
            knownByClass: false,
            sourceClass: cls.name,
          });
        }
      }
    }
  }

  return spells;
}

/**
 * Collect skill proficiencies from class selections + background DB skills.
 */
function assembleSkillProficienciesFromState(state: BuilderState): string[] {
  const skills = new Set<string>();
  for (const cls of state.classes) {
    for (const s of cls.skills) skills.add(s);
  }
  if (state.background) {
    const bg = getBackground(state.background);
    if (bg) bg.skills.forEach((s) => skills.add(s.toLowerCase()));
  }
  for (const [choiceId, values] of Object.entries(state.speciesChoices)) {
    if (choiceId.toLowerCase().includes("skill")) {
      values.forEach((v) => skills.add(v.toLowerCase()));
    }
  }
  for (const [_featName, choices] of Object.entries(state.featChoices)) {
    for (const [choiceId, values] of Object.entries(choices)) {
      if (
        choiceId.toLowerCase().includes("skill") ||
        choiceId.toLowerCase().includes("proficiency")
      ) {
        values.forEach((v) => skills.add(v.toLowerCase()));
      }
    }
  }
  return [...skills];
}

/**
 * Collect skill expertise from class choices (Bard/Rogue Expertise) and feat choices.
 */
function assembleSkillExpertiseFromState(state: BuilderState): string[] {
  const expertise = new Set<string>();
  for (const cls of state.classes) {
    for (const [choiceId, values] of Object.entries(cls.choices)) {
      if (choiceId.toLowerCase().includes("expertise")) {
        (values as string[]).forEach((v) => expertise.add(v));
      }
    }
  }
  for (const [_featName, choices] of Object.entries(state.featChoices)) {
    for (const [choiceId, values] of Object.entries(choices)) {
      if (choiceId.toLowerCase().includes("expertise")) {
        values.forEach((v) => expertise.add(v));
      }
    }
  }
  return [...expertise];
}

/**
 * Map BuilderState.classes to CharacterClass[] (dropping builder-only fields).
 */
function assembleCharacterClasses(state: BuilderState): CharacterClass[] {
  return state.classes.map((c) => ({
    name: c.name,
    level: c.level,
    subclass: c.subclass ?? undefined,
  }));
}

/**
 * Collect additional features (feat grants) from feat selections.
 */
function assembleAdditionalFeatures(state: BuilderState): CharacterFeatureRef[] {
  const features: CharacterFeatureRef[] = [];
  for (const selection of state.featSelections) {
    if (selection.type === "feat" && selection.featName) {
      features.push({
        dbKind: "feat",
        dbName: selection.featName,
        sourceLabel: `Feat`,
      });
    }
  }
  return features;
}

// ─── Effect Collection ───────────────────────────────────

/**
 * Collect all build-time EffectBundles from the character's sources:
 * species, class features, subclass features, feats, and synthetic bundles
 * for class-level proficiency grants (saves, armor, weapons, tools) and
 * skill proficiencies/expertise from class/background/feat selections.
 *
 * The synthetic bundles are needed because the resolver derives proficiencies,
 * saves, and skills entirely from effect properties — not from stored flat arrays.
 */
function collectBuildEffects(
  race: string,
  classes: CharacterClass[],
  additionalFeatures: CharacterFeatureRef[],
  state: BuilderState,
): EffectBundle[] {
  const bundles: EffectBundle[] = [];

  // Species effects
  const species = getSpecies(race);
  if (species?.effects) {
    bundles.push({
      id: `species:${race}`,
      source: { type: "species", name: race },
      lifetime: { type: "permanent" },
      effects: species.effects,
    });
  }

  // Class and subclass feature effects
  for (const cls of classes) {
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

  // Feat effects (from additional features) — top-level + selected sub-choice options
  for (const feat of additionalFeatures) {
    if (feat.dbKind !== "feat") continue;
    const dbFeat = getFeat(feat.dbName);
    if (!dbFeat) continue;
    if (dbFeat.effects) {
      bundles.push({
        id: `feat:${feat.dbName}`,
        source: { type: "feat", name: feat.dbName },
        lifetime: { type: "permanent" },
        effects: dbFeat.effects,
      });
    }
    // Sub-choice option effects (Athlete's "Strength +1", Resilient's chosen save, etc.)
    const picks = state.featChoices[feat.dbName] ?? {};
    for (const choice of dbFeat.choices ?? []) {
      if (!("options" in choice) || !choice.options) continue;
      const selectedLabels = picks[choice.id] ?? [];
      for (const label of selectedLabels) {
        const option = choice.options.find((o) => o.label === label);
        if (!option?.effects) continue;
        bundles.push({
          id: `feat-choice:${feat.dbName}:${choice.id}:${label}`,
          source: { type: "feat", name: feat.dbName, featureName: choice.label },
          lifetime: { type: "permanent" },
          effects: option.effects,
        });
      }
    }
  }

  // Background ability-score assignment (e.g. +2 STR / +1 CON)
  if (state.background && Object.keys(state.abilityScoreAssignments).length > 0) {
    const bgMods = Object.entries(state.abilityScoreAssignments).map(([ability, value]) => ({
      target: ability as import("../types/effects").ModifierTarget,
      value: value as number,
      operation: "add" as const,
    }));
    if (bgMods.length > 0) {
      bundles.push({
        id: `background-abilities:${state.background}`,
        source: {
          type: "background",
          name: state.background,
          featureName: "Ability Score Assignment",
        },
        lifetime: { type: "permanent" },
        effects: { modifiers: bgMods },
      });
    }
  }

  // ASI bundles (from feat selections of type "asi")
  for (const selection of state.featSelections) {
    if (selection.type !== "asi" || !selection.asiAbilities) continue;
    const asiMods = Object.entries(selection.asiAbilities).map(([ability, value]) => ({
      target: ability as import("../types/effects").ModifierTarget,
      value: value as number,
      operation: "add" as const,
    }));
    if (asiMods.length > 0) {
      const classLabel = selection.className ?? state.classes[selection.classIndex ?? 0]?.name;
      const scope = classLabel
        ? `${classLabel.toLowerCase()}-${selection.level}`
        : `level-${selection.level}`;
      const sourceName = classLabel
        ? `${classLabel} level ${selection.level} ASI`
        : `Level ${selection.level} ASI`;
      bundles.push({
        id: `asi:${scope}`,
        source: {
          type: "ability",
          name: sourceName,
          level: selection.level,
        },
        lifetime: { type: "permanent" },
        effects: { modifiers: asiMods },
      });
    }
  }

  // ── Synthetic proficiency bundles ─────────────────────────────────────────
  // Class-level proficiencies (saves, armor, weapons, tools) come from the
  // class DB but are NOT in the feature effect bundles above. Emit a synthetic
  // bundle per primary class so the resolver can derive them via effect properties.
  // Only the primary class (index 0) grants save proficiencies in D&D 5e/2024.
  const primaryClass = classes[0];
  if (primaryClass) {
    const primaryDb = getClass(primaryClass.name);
    if (primaryDb) {
      const profProps: Property[] = [];

      // Saving throw proficiencies (primary class only)
      for (const ab of primaryDb.savingThrows) {
        profProps.push({ type: "proficiency", category: "save", value: ab });
      }

      // Armor proficiencies
      for (const a of primaryDb.armorProficiencies) {
        profProps.push({ type: "proficiency", category: "armor", value: a });
      }

      // Weapon proficiencies
      for (const w of primaryDb.weaponProficiencies) {
        profProps.push({ type: "proficiency", category: "weapon", value: w });
      }

      // Tool proficiencies (class-level only)
      for (const t of primaryDb.toolProficiencies) {
        profProps.push({ type: "proficiency", category: "tool", value: t });
      }

      if (profProps.length > 0) {
        bundles.push({
          id: `class-profs:${primaryClass.name}`,
          source: { type: "class", name: primaryClass.name, featureName: "Proficiencies" },
          lifetime: { type: "permanent" },
          effects: { properties: profProps },
        });
      }
    }
  }

  // Multiclass additional armor/weapon proficiencies (limited per PHB multiclassing rules)
  for (let i = 1; i < classes.length; i++) {
    const cls = classes[i];
    const classDb = getClass(cls.name);
    if (!classDb) continue;

    const multiProps: Property[] = [];
    for (const a of classDb.armorProficiencies) {
      multiProps.push({ type: "proficiency", category: "armor", value: a });
    }
    for (const w of classDb.weaponProficiencies) {
      multiProps.push({ type: "proficiency", category: "weapon", value: w });
    }

    if (multiProps.length > 0) {
      bundles.push({
        id: `class-profs:${cls.name}:multiclass`,
        source: { type: "class", name: cls.name, featureName: "Multiclass Proficiencies" },
        lifetime: { type: "permanent" },
        effects: { properties: multiProps },
      });
    }
  }

  // Background tool proficiencies
  if (state.background) {
    const bg = getBackground(state.background);
    if (bg) {
      const bgProps: Property[] = [];
      for (const t of bg.tools) {
        bgProps.push({ type: "proficiency", category: "tool", value: t });
      }
      if (bgProps.length > 0) {
        bundles.push({
          id: `background-tools:${state.background}`,
          source: { type: "background", name: state.background, featureName: "Tool Proficiencies" },
          lifetime: { type: "permanent" },
          effects: { properties: bgProps },
        });
      }
    }
  }

  // ── Skill proficiency bundles ─────────────────────────────────────────────
  // Skill proficiencies and expertise from class selections, background, species
  // choices, and feat choices. Emitted as proficiency/expertise effect properties.
  const skillProfs = assembleSkillProficienciesFromState(state);
  const skillExpertise = assembleSkillExpertiseFromState(state);
  const skillProps: Property[] = [];

  for (const sk of skillProfs) {
    skillProps.push({ type: "proficiency", category: "skill", value: sk });
  }

  // Expertise entries (skill slugs like "perception", "stealth")
  const SKILL_DISPLAY_NAMES: Record<string, string> = {
    acrobatics: "Acrobatics",
    animal_handling: "Animal Handling",
    arcana: "Arcana",
    athletics: "Athletics",
    deception: "Deception",
    history: "History",
    insight: "Insight",
    intimidation: "Intimidation",
    investigation: "Investigation",
    medicine: "Medicine",
    nature: "Nature",
    perception: "Perception",
    performance: "Performance",
    persuasion: "Persuasion",
    religion: "Religion",
    sleight_of_hand: "Sleight of Hand",
    stealth: "Stealth",
    survival: "Survival",
  };
  for (const sk of skillExpertise) {
    const display = SKILL_DISPLAY_NAMES[sk.toLowerCase()] as
      | import("../types/effects").Skill
      | undefined;
    if (display) {
      skillProps.push({ type: "expertise", skill: display });
    }
  }

  if (skillProps.length > 0) {
    bundles.push({
      id: "skill-profs:character",
      source: { type: "class", name: primaryClass?.name ?? "Character", featureName: "Skills" },
      lifetime: { type: "permanent" },
      effects: { properties: skillProps },
    });
  }

  return bundles;
}

// ─── Item Enrichment ─────────────────────────────────────

/**
 * Convert a raw equipment entry (from BuilderState.equipment or an ad-hoc
 * addition) into the unified Item shape by pulling weapon/armor intrinsics
 * from BaseItemDb at construction time.
 *
 * Attack bonus is NOT stored on Item — call getWeaponAttack(char, item) at
 * display time. Damage dice and range ARE stored as a DB snapshot so renderers
 * don't need a live DB lookup.
 *
 * Phase 10: when EntityEffects.action is populated on all weapons, this
 * snapshot may be superseded by action-driven derivation.
 */
export function enrichItem(raw: {
  name: string;
  quantity?: number;
  equipped?: boolean;
  attuned?: boolean;
  rarity?: string;
  description?: string;
  weight?: number;
  attunement?: boolean;
  fromPack?: string;
}): Item {
  const baseDb = getBaseItem(raw.name);
  const magicDb = getMagicItem(raw.name);

  const base: Item = {
    name: raw.name,
    quantity: raw.quantity ?? 1,
    equipped: raw.equipped ?? false,
    ...(raw.attuned !== undefined ? { attuned: raw.attuned } : {}),
    ...(raw.fromPack !== undefined ? { fromPack: raw.fromPack } : {}),
  };

  // Weight: prefer explicit override, then DB
  const weight = raw.weight ?? baseDb?.weight;
  if (weight !== undefined) base.weight = weight;

  // Rarity: prefer explicit override, then DB (magic items carry rarity)
  const rarity = raw.rarity ?? (magicDb?.rarity as string | undefined);
  if (rarity !== undefined) base.rarity = rarity;

  // Description: prefer explicit override, then DB
  const description = raw.description ?? baseDb?.description ?? magicDb?.description;
  if (description !== undefined) base.description = description;

  // Attunement flag (whether the item type requires attunement)
  if (raw.attunement !== undefined) {
    base.attunement = raw.attunement;
  } else if (magicDb?.attunement) {
    base.attunement = true;
  }

  // Weapon intrinsics from DB
  if (baseDb?.weapon && baseDb.damage && baseDb.damageType) {
    base.weapon = {
      damage: baseDb.damage,
      damageType: baseDb.damageType,
      ...(baseDb.properties?.length ? { properties: baseDb.properties } : {}),
      ...(baseDb.mastery?.length ? { mastery: baseDb.mastery[0] } : {}),
      ...(baseDb.range !== undefined ? { range: baseDb.range } : {}),
      ...(baseDb.versatileDamage !== undefined ? { versatile: baseDb.versatileDamage } : {}),
    };
  }

  // Armor/shield intrinsics from DB
  if (baseDb?.armor && baseDb.ac != null) {
    const typePrefix = baseDb.type.split("|")[0];
    let armorType: "light" | "medium" | "heavy" | "shield";
    switch (typePrefix) {
      case "LA":
        armorType = "light";
        break;
      case "MA":
        armorType = "medium";
        break;
      case "HA":
        armorType = "heavy";
        break;
      case "S":
        armorType = "shield";
        break;
      default:
        armorType = "light"; // fallback — shouldn't happen for armor
    }
    base.armor = {
      type: armorType,
      baseAc: baseDb.ac,
      ...(typePrefix === "MA" ? { dexCap: 2 } : {}),
      ...(baseDb.strength ? { strReq: parseInt(baseDb.strength, 10) || undefined } : {}),
      ...(baseDb.stealth ? { stealthDisadvantage: true } : {}),
    };
  } else if (baseDb && baseDb.type.split("|")[0] === "S" && baseDb.ac != null) {
    // Shield
    base.armor = {
      type: "shield",
      baseAc: baseDb.ac,
    };
  }

  return base;
}

// ─── Main Builder ────────────────────────────────────────

export function buildCharacter(state: BuilderState): {
  character: CharacterData;
  warnings: string[];
} {
  const warnings: string[] = [];

  // ── Derive fields from BuilderState ───────────────────
  // static.abilities holds the PURE base (point-buy/standard-array/rolled scores).
  // Background, ASI, and feat bonuses flow through bundles (see collectBuildEffects).
  const abilities = computeBaseAbilities(state);
  const classes = assembleCharacterClasses(state);
  const race = state.species ?? "";
  const spellsRaw = assembleSpellsFromState(state, warnings);
  const languages = collectLanguagesFromState(state);
  const additionalFeatures = assembleAdditionalFeatures(state);

  const totalLevel = classes.reduce((sum, c) => sum + c.level, 0);
  const proficiencyBonus = Math.floor((totalLevel - 1) / 4) + 2;

  // Collect all effects from species, class features, subclass features, feats,
  // synthetic background/ASI ability bundles, and proficiency/skill bundles so the
  // resolver has all the info needed.
  const bundles = collectBuildEffects(race, classes, additionalFeatures, state);

  // Two-pass context: resolve abilities first using base-ctx (no recursion),
  // then build the full ctx with resolved abilities for all other stats.
  const baseCtx: ResolveContext = {
    abilities,
    totalLevel,
    classLevel: classes[0]?.level ?? 1,
    proficiencyBonus,
  };
  const resolvedAbilities: AbilityScores = {
    strength: resolveStat(bundles, "strength", abilities.strength, baseCtx),
    dexterity: resolveStat(bundles, "dexterity", abilities.dexterity, baseCtx),
    constitution: resolveStat(bundles, "constitution", abilities.constitution, baseCtx),
    intelligence: resolveStat(bundles, "intelligence", abilities.intelligence, baseCtx),
    wisdom: resolveStat(bundles, "wisdom", abilities.wisdom, baseCtx),
    charisma: resolveStat(bundles, "charisma", abilities.charisma, baseCtx),
  };
  const ctx: ResolveContext = { ...baseCtx, abilities: resolvedAbilities };

  // ── HP (needed for dynamic.currentHP seed) ──────────────
  // Base HP from derived CON + bonus from effects (Tough = "2 * lvl", Dwarf Toughness = "lvl")
  const baseMaxHP = computeMaxHPFromState(classes, resolvedAbilities.constitution);
  const hpBonus = resolveStat(bundles, "hp", 0, ctx);
  const maxHP = Math.max(1, baseMaxHP + hpBonus);

  // ── Spell Slots ─────────────────────────────────────────
  const { regularSlots, pactSlots } = computeSpellSlots(classes);

  // ── Spells (enriched from DB) ───────────────────────────
  const spells = spellsRaw.map((spell) => {
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
  const features = computeFeatures(race, classes, additionalFeatures);

  // ── Class Resources (from effects — needed for dynamic.resourcesUsed seed) ──
  const classResources = computeResources(bundles, ctx);

  // ── Assemble ────────────────────────────────────────────

  const staticData: CharacterStaticData = {
    name: state.name.trim() || "Unnamed",
    species: race,
    race,
    classes,
    abilities,
    languages,
    spells,
    features,
    traits: state.traits ?? {},
    appearance:
      Object.keys(state.appearance).length > 0
        ? (state.appearance as NonNullable<CharacterStaticData["appearance"]>)
        : undefined,
    backstory: state.backstory || undefined,
    alignment: state.alignment || undefined,
    importedAt: Date.now(),
    source: "builder",
    // Phase 7: all permanent effect bundles (species + class features + subclass
    // features + feats + class save/skill/weapon/armor proficiency grants).
    // Resolver accessors derive all stats from these at call time.
    effects: bundles,
  };

  // ── Inventory (enriched from DB — weapon/armor intrinsics populated) ──
  // Each item in BuilderState.equipment is already an Item (set by EquipmentStep).
  // Pass through as-is; enrichItem is used by add_item at runtime and by
  // EquipmentStep when constructing the initial item from BaseItemDb.
  const inventory: Item[] = state.equipment.map((item) => {
    // If the item already has weapon/armor sub-objects (built by EquipmentStep via
    // enrichItem), pass it through. If it's a legacy plain item with no sub-objects,
    // re-enrich it from the DB.
    if (item.weapon !== undefined || item.armor !== undefined) return item;
    return enrichItem(item);
  });

  const dynamicData: CharacterDynamicData = {
    currentHP: maxHP,
    tempHP: 0,
    spellSlotsUsed: regularSlots,
    pactMagicSlots: pactSlots.length > 0 ? pactSlots : undefined,
    resourcesUsed: Object.fromEntries((classResources ?? []).map((r) => [r.name, 0])),
    conditions: [],
    deathSaves: { successes: 0, failures: 0 },
    inventory,
    currency: state.currency ?? { cp: 0, sp: 0, gp: 0, pp: 0 },
    heroicInspiration: false,
    activeEffects: [],
  };

  return {
    character: { builder: state, static: staticData, dynamic: dynamicData },
    warnings,
  };
}

// ─── Equipment AC ────────────────────────────────────────
// Equipment AC is separate from effects — it reads actual inventory items.
// Effects provide unarmored defense formulas and other AC modifiers.
// The resolver picks the highest "set" value (equipment base vs unarmored defense)
// and then stacks all "add" modifiers on top.
// Exported for use by the character resolver (character/resolve.ts getAC).

export function computeEquipmentAC(
  equipment: Item[],
  abilities: AbilityScores,
): { base: number; shieldBonus: number } {
  const dexMod = abilityMod(abilities.dexterity);
  let base = 10 + dexMod; // unarmored default
  let shieldBonus = 0;

  for (const item of equipment) {
    if (!item.equipped) continue;

    if (item.armor?.type === "shield") {
      shieldBonus = 2;
      continue;
    }

    if (item.armor) {
      const { type: armorType, baseAc, dexCap } = item.armor;
      if (armorType === "light") {
        base = baseAc + dexMod;
      } else if (armorType === "medium") {
        base = baseAc + Math.min(dexMod, dexCap ?? 2);
      } else if (armorType === "heavy") {
        base = baseAc;
      }
    }
  }

  return { base, shieldBonus };
}

// ─── Spell Slots ─────────────────────────────────────────

function computeSpellSlots(classes: CharacterClass[]): {
  regularSlots: SpellSlotLevel[];
  pactSlots: SpellSlotLevel[];
} {
  const regularSlots: SpellSlotLevel[] = [];
  const pactSlots: SpellSlotLevel[] = [];

  const casterClasses: CharacterClass[] = [];
  let warlockLevel = 0;

  for (const cls of classes) {
    if (cls.name.toLowerCase() === "warlock") {
      warlockLevel = cls.level;
      continue;
    }
    const classDb = getClass(cls.name);
    // A class is a caster if it has a casterProgression, OR if its active subclass has one
    const sub =
      cls.subclass && classDb
        ? classDb.subclasses.find(
            (s) =>
              s.name.toLowerCase() === cls.subclass!.toLowerCase() ||
              s.shortName.toLowerCase() === cls.subclass!.toLowerCase(),
          )
        : undefined;
    if (classDb?.casterProgression || sub?.casterProgression != null) {
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
    const classDb = getClass(cls.name);
    const sub =
      cls.subclass && classDb
        ? classDb.subclasses.find(
            (s) =>
              s.name.toLowerCase() === cls.subclass!.toLowerCase() ||
              s.shortName.toLowerCase() === cls.subclass!.toLowerCase(),
          )
        : undefined;

    // Subclass-only casters (Eldritch Knight, Arcane Trickster) use their own spellSlotTable
    if (!classDb?.casterProgression && sub?.casterProgression != null) {
      slotRow = sub.spellSlotTable?.[cls.level - 1] ?? [];
    } else {
      const table = classDb?.spellSlotTable;
      slotRow = table && cls.level <= table.length ? table[cls.level - 1] : [];
    }
  } else {
    // Multiclass: compute weighted caster level
    let combinedCasterLevel = 0;
    for (const cls of casterClasses) {
      const classDb = getClass(cls.name);
      const sub =
        cls.subclass && classDb
          ? classDb.subclasses.find(
              (s) =>
                s.name.toLowerCase() === cls.subclass!.toLowerCase() ||
                s.shortName.toLowerCase() === cls.subclass!.toLowerCase(),
            )
          : undefined;
      // Use class-level multiplier; if no class progression, check subclass (third-caster)
      const multiplier = getCasterMultiplier(cls.name.toLowerCase());
      const subThirdMult =
        !classDb?.casterProgression && sub?.casterProgression != null ? 1 / 3 : 0;
      combinedCasterLevel += cls.level * (multiplier || subThirdMult);
    }
    const effectiveLevel = Math.min(Math.max(Math.floor(combinedCasterLevel), 1), 20);
    slotRow = (multiclassSlots as number[][])[effectiveLevel - 1];
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

function computeFeatures(
  race: string,
  classes: CharacterClass[],
  additionalFeatures: CharacterFeatureRef[],
): CharacterFeatureRef[] {
  const features: CharacterFeatureRef[] = [];
  // Dedup key: dbKind+dbName+featureName
  const seen = new Set<string>();

  const dedupeKey = (f: CharacterFeatureRef) => `${f.dbKind}:${f.dbName}:${f.featureName ?? ""}`;

  const add = (f: CharacterFeatureRef) => {
    const key = dedupeKey(f);
    if (!seen.has(key)) {
      seen.add(key);
      features.push(f);
    }
  };

  // Caller-provided feat features first
  for (const f of additionalFeatures) add(f);

  // Class features from DB
  for (const cls of classes) {
    const classDb = getClass(cls.name);
    if (!classDb) continue;

    for (const feature of classDb.features) {
      if (feature.level <= cls.level) {
        add({
          dbKind: "class",
          dbName: classDb.name,
          featureName: feature.name,
          sourceLabel: `${cls.name} ${feature.level}`,
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
        // Subclass itself as an entry
        add({
          dbKind: "subclass",
          dbName: sub.name,
          sourceLabel: sub.name,
          requiredLevel: 3,
        });
        for (const sf of sub.features) {
          if (sf.level <= cls.level) {
            add({
              dbKind: "subclass",
              dbName: sub.name,
              featureName: sf.name,
              sourceLabel: `${sub.name} ${sf.level}`,
              requiredLevel: sf.level,
            });
          }
        }
      }
    }
  }

  // Species as a feature
  const speciesEntity = getSpecies(race);
  if (speciesEntity) {
    add({
      dbKind: "species",
      dbName: race,
      sourceLabel: race,
    });
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
      longRest: res.longRest,
      shortRest: res.shortRest,
      source: className,
    });
  }

  return resources;
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

/**
 * Create an EffectBundle for a magic item when it is equipped and attuned.
 * Looks up the item in the magic item database. Returns null if the item
 * has no structured effects or is not found in the database.
 */
export function createItemBundle(itemName: string): EffectBundle | null {
  const item = getMagicItem(itemName);
  if (!item?.effects) return null;
  return {
    id: `item:${itemName.toLowerCase()}`,
    source: { type: "item", name: itemName },
    lifetime: { type: "manual" },
    effects: item.effects,
  };
}
