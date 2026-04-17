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
import type {
  EffectBundle,
  EntityEffects,
  Property,
  ResolveContext,
  DamageType,
  ConditionName,
} from "../types/effects";
import { resolveStat, getResources } from "../utils/effect-resolver";
import { resolveSkillProfOrExpertise, collectChoiceEffectsPass1 } from "./choice-to-effects";
import type { ChoiceSource } from "./choice-to-effects";
import { evaluateExpression } from "../utils/expression-evaluator";
import {
  getClass,
  getSpecies,
  getSpell,
  getFeat,
  getBaseItem,
  getCondition,
  getMagicItem,
  getMonster,
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
 * Common is always granted; additional languages come from DB choices with pool:"language".
 * String-matching on choiceId is intentionally removed — the unified choice pipeline
 * handles language proficiency bundles; this function only needs the display list for
 * CharacterStaticData.languages (a human-readable field, not used for checks).
 */
function collectLanguagesFromState(state: BuilderState): string[] {
  const langs = new Set<string>(["Common"]);
  // Language choices are now properly typed with pool:"language" in the DB.
  // We still read the raw values here for the languages display field.
  // Species choices don't grant languages in 2024 data — handled via background/class/feat effects.
  void state.backgroundChoices; // not used for languages anymore — background effects carry them

  // Read language proficiencies from actual DB choices via pool:"language" selections.
  // Species language choices
  const speciesDb = state.species ? getSpecies(state.species) : null;
  if (speciesDb?.choices) {
    for (const choice of speciesDb.choices) {
      if (!("pool" in choice) || (choice as { pool: string }).pool !== "language") continue;
      const selected = state.speciesChoices[choice.id] ?? [];
      selected.forEach((v) => langs.add(v));
    }
  }
  // Background language choices
  const bgDb = state.background ? getBackground(state.background) : null;
  if (bgDb?.choices) {
    for (const choice of bgDb.choices) {
      if (!("pool" in choice) || (choice as { pool: string }).pool !== "language") continue;
      const selected = state.backgroundChoices[choice.id] ?? [];
      selected.forEach((v) => langs.add(v));
    }
  }
  // Class feature language choices (Rogue Thieves' Cant, etc.)
  for (const cls of state.classes) {
    const classDb = getClass(cls.name);
    if (!classDb) continue;
    for (const feature of classDb.features) {
      if (!feature.choices || feature.level > cls.level) continue;
      for (const choice of feature.choices) {
        if (!("pool" in choice) || (choice as { pool: string }).pool !== "language") continue;
        const selected = state.classes.find((c) => c.name === cls.name)?.choices[choice.id] ?? [];
        selected.forEach((v) => langs.add(v));
      }
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
  }

  return spells;
}

/**
 * Walk all effect bundles for `spell_grant` properties and convert them into
 * Spell entries on the character sheet. Skips spells already present (a class
 * pick or another grant of the same spell wins). Tags each granted spell with
 * a spellSource derived from the originating bundle (feat/species/item/etc).
 */
function assembleGrantedSpells(
  bundles: EffectBundle[],
  existing: Spell[],
  classes: CharacterClass[],
  totalLevel: number,
  warnings: string[],
): Spell[] {
  const out: Spell[] = [];
  const seen = new Set(existing.map((s) => s.name.toLowerCase()));

  for (const bundle of bundles) {
    const grants = (bundle.effects.properties ?? []).filter(
      (p): p is Extract<Property, { type: "spell_grant" }> => p.type === "spell_grant",
    );
    if (grants.length === 0) continue;

    const sourceKind = bundle.source.type;
    const spellSource: Spell["spellSource"] =
      sourceKind === "feat"
        ? "feat"
        : sourceKind === "species"
          ? "species"
          : sourceKind === "item"
            ? "item"
            : "class";

    for (const grant of grants) {
      // Filter by minLevel — use class level for class/subclass sources, total level otherwise
      if (grant.minLevel != null) {
        let effectiveLevel: number;
        if (bundle.source.type === "class") {
          const cls = classes.find(
            (c) => c.name.toLowerCase() === bundle.source.name.toLowerCase(),
          );
          effectiveLevel = cls?.level ?? totalLevel;
        } else if (bundle.source.type === "subclass") {
          const cls = classes.find(
            (c) => c.subclass?.toLowerCase() === bundle.source.name.toLowerCase(),
          );
          effectiveLevel = cls?.level ?? totalLevel;
        } else {
          effectiveLevel = totalLevel;
        }
        if (grant.minLevel > effectiveLevel) continue;
      }

      const key = grant.spell.toLowerCase();
      if (seen.has(key)) continue;
      const db = getSpell(grant.spell);
      if (!db) {
        warnings.push(`Unknown granted spell "${grant.spell}" — skipped (no DB entry)`);
        continue;
      }
      seen.add(key);
      out.push({
        name: grant.spell,
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
        spellSource,
        knownByClass: false,
        sourceClass: bundle.source.featureName ?? bundle.source.name,
        grantUsage: grant.usage,
        grantCondition: grant.condition,
      });
    }
  }

  return out;
}

// assembleSkillProficienciesFromState and assembleSkillExpertiseFromState have been
// replaced by the unified choiceToEffects pipeline in collectBuildEffects.

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
      const picks = state.featChoices[selection.featName];
      features.push({
        dbKind: "feat",
        dbName: selection.featName,
        sourceLabel: `Feat`,
        choices: picks && Object.keys(picks).length > 0 ? picks : undefined,
      });
    }
  }

  // Background origin feat (e.g. Skilled, Magic Initiate, Musician)
  if (state.background) {
    const bg = getBackground(state.background);
    if (bg?.feat) {
      const picks = state.featChoices[bg.feat];
      features.push({
        dbKind: "feat",
        dbName: bg.feat,
        sourceLabel: "Background",
        choices: picks && Object.keys(picks).length > 0 ? picks : undefined,
      });
    }
  }

  // Species feat choices (e.g. Human Versatile → Origin feat pick)
  if (state.species) {
    const speciesDb = getSpecies(state.species);
    for (const choice of speciesDb?.choices ?? []) {
      if (!("pool" in choice) || (choice as { pool: string }).pool !== "feat") continue;
      const picked = state.speciesChoices[choice.id] ?? [];
      for (const featName of picked) {
        if (!getFeat(featName)) continue;
        const picks = state.featChoices[featName];
        features.push({
          dbKind: "feat",
          dbName: featName,
          sourceLabel: "Species",
          choices: picks && Object.keys(picks).length > 0 ? picks : undefined,
        });
      }
    }
  }

  // Class-level choice picks that resolve to feats (Fighting Style picks, etc.)
  // so they appear as clickable entries on the Features tab with their own
  // description / mechanical effects rather than being silently absorbed into
  // the effect bundle list.
  for (const cls of state.classes) {
    const classDb = getClass(cls.name);
    if (!classDb) continue;
    for (const feature of classDb.features) {
      if (feature.level > cls.level || !feature.choices) continue;
      for (const choice of feature.choices) {
        if (!("pool" in choice)) continue;
        const pool = (choice as { pool: string }).pool;
        if (pool !== "fighting_style" && pool !== "feat") continue;
        const picked = cls.choices?.[choice.id] ?? [];
        for (const featName of picked) {
          if (!getFeat(featName)) continue;
          const picks = state.featChoices[featName];
          features.push({
            dbKind: "feat",
            dbName: featName,
            sourceLabel: pool === "fighting_style" ? "Fighting Style" : `${cls.name} Feat`,
            choices: picks && Object.keys(picks).length > 0 ? picks : undefined,
            fromClassFeatureChoice: true,
          });
        }
      }
    }
  }

  return features;
}

// ─── Effect Collection ───────────────────────────────────

/**
 * Collect all build-time EffectBundles from the character's sources using the
 * unified choice → effect pipeline.
 *
 * Four sources: species, classes + subclasses, background, feats.
 * Each source contributes:
 *   1. Its base `effects` (if any)
 *   2. Effects resolved from each `choices[]` entry via choiceToEffects()
 *
 * Two-pass emission for skill choices:
 *   Pass 1: everything except skill_proficiency_or_expertise; accumulate proficient skills.
 *   Pass 2: resolve skill_proficiency_or_expertise using the accumulated set.
 */
function collectBuildEffects(
  race: string,
  classes: CharacterClass[],
  additionalFeatures: CharacterFeatureRef[],
  state: BuilderState,
): EffectBundle[] {
  const bundles: EffectBundle[] = [];

  // Accumulated proficient skills for the two-pass skill_proficiency_or_expertise resolution.
  const resolvedSkills = new Set<string>();

  // Deferred skill_proficiency_or_expertise choices resolved in pass 2.
  type DeferredSkill = {
    choice: import("../types/effects").FeatureChoice;
    selected: string[];
    source: ChoiceSource;
  };
  const deferredSkillChoices: DeferredSkill[] = [];

  // ── 1. Species ────────────────────────────────────────────────────────────
  const speciesDb = getSpecies(race);
  if (speciesDb) {
    if (speciesDb.effects) {
      bundles.push({
        id: `species:${race}`,
        source: { type: "species", name: race },
        lifetime: { type: "permanent" },
        effects: speciesDb.effects,
      });
    }
    if (speciesDb.choices) {
      const src: ChoiceSource = { kind: "species", sourceName: race };
      const { bundles: choiceBundles, deferredChoices } = collectChoiceEffectsPass1(
        speciesDb.choices,
        state.speciesChoices,
        src,
        state,
        resolvedSkills,
      );
      bundles.push(...choiceBundles);
      deferredChoices.forEach((d) => deferredSkillChoices.push({ ...d, source: src }));
    }
  }

  // ── 2. Classes and subclasses ─────────────────────────────────────────────
  for (let ci = 0; ci < classes.length; ci++) {
    const cls = classes[ci];
    const classDb = getClass(cls.name);
    if (!classDb) continue;

    for (const feature of classDb.features) {
      if (feature.level > cls.level) continue;

      // Feature's own effects
      if (feature.effects) {
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

      // Feature's choices (Fighting Style, Expertise, etc.)
      if (feature.choices) {
        const classCls = state.classes.find((c) => c.name === cls.name);
        const classChoices = classCls?.choices ?? {};
        const src: ChoiceSource = {
          kind: "class-feature",
          sourceName: cls.name,
          featureName: feature.name,
          level: feature.level,
        };
        const { bundles: choiceBundles, deferredChoices } = collectChoiceEffectsPass1(
          feature.choices,
          classChoices,
          src,
          state,
          resolvedSkills,
        );
        bundles.push(...choiceBundles);
        deferredChoices.forEach((d) => deferredSkillChoices.push({ ...d, source: src }));
      }
    }

    // Class skill proficiencies (player-chosen from skillChoices pool)
    // These are stored in state.classes[i].skills and are not in DB choices yet.
    const classCls = state.classes.find((c) => c.name === cls.name);
    if (classCls?.skills?.length) {
      const skillProps: Property[] = classCls.skills.map((s) => ({
        type: "proficiency" as const,
        category: "skill" as const,
        value: s,
      }));
      bundles.push({
        id: `class-skills:${cls.name}:${ci}`,
        source: { type: "class", name: cls.name, featureName: "Skills" },
        lifetime: { type: "permanent" },
        effects: { properties: skillProps },
      });
      classCls.skills.forEach((s) => resolvedSkills.add(s.toLowerCase()));
    }

    // Subclass features
    if (cls.subclass) {
      const sub = classDb.subclasses.find(
        (s) =>
          s.name.toLowerCase() === cls.subclass!.toLowerCase() ||
          s.shortName.toLowerCase() === cls.subclass!.toLowerCase(),
      );
      if (sub) {
        for (const sf of sub.features) {
          if (sf.level > cls.level) continue;

          if (sf.effects) {
            bundles.push({
              id: `subclass:${sub.name}:${sf.name}`,
              source: { type: "subclass", name: sub.name, featureName: sf.name, level: sf.level },
              lifetime: { type: "permanent" },
              effects: sf.effects,
            });
          }

          if (sf.choices) {
            const classChoices = classCls?.choices ?? {};
            const src: ChoiceSource = {
              kind: "subclass-feature",
              sourceName: sub.name,
              featureName: sf.name,
              level: sf.level,
            };
            const { bundles: choiceBundles, deferredChoices } = collectChoiceEffectsPass1(
              sf.choices,
              classChoices,
              src,
              state,
              resolvedSkills,
            );
            bundles.push(...choiceBundles);
            deferredChoices.forEach((d) => deferredSkillChoices.push({ ...d, source: src }));
          }
        }
      }
    }

    // Multiclass proficiencies (limited subset per PHB 2024 multiclassing rules)
    // Only applies to classes[1+]; primary class proficiencies come from the L1 feature.
    if (ci > 0 && classDb.multiclassing?.proficienciesGained) {
      const mg = classDb.multiclassing.proficienciesGained;
      const multiProps: Property[] = [];
      for (const a of mg.armor ?? []) {
        multiProps.push({ type: "proficiency", category: "armor", value: a });
      }
      for (const w of mg.weapons ?? []) {
        multiProps.push({ type: "proficiency", category: "weapon", value: w });
      }
      for (const t of mg.tools ?? []) {
        multiProps.push({ type: "proficiency", category: "tool", value: t });
      }
      if (mg.skills) {
        // Skill selection for multiclassing is handled via state.classes[i].skills above
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
  }

  // ── 3. Background ─────────────────────────────────────────────────────────
  if (state.background) {
    const bg = getBackground(state.background);
    if (bg) {
      if (bg.effects) {
        bundles.push({
          id: `background:${state.background}`,
          source: { type: "background", name: state.background },
          lifetime: { type: "permanent" },
          effects: bg.effects,
        });
      }
      if (bg.choices) {
        const src: ChoiceSource = { kind: "background", sourceName: state.background };
        const { bundles: choiceBundles, deferredChoices } = collectChoiceEffectsPass1(
          bg.choices,
          state.backgroundChoices,
          src,
          state,
          resolvedSkills,
        );
        bundles.push(...choiceBundles);
        deferredChoices.forEach((d) => deferredSkillChoices.push({ ...d, source: src }));
      }
    }

    // Background ability-score assignment (e.g. +2 STR / +1 CON)
    if (Object.keys(state.abilityScoreAssignments).length > 0) {
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
  }

  // ── 4. Feats (from additional features / feat selections) ─────────────────
  // Skip entries that came from a class feature pool choice (e.g. Fighting Style,
  // feat-from-class-feature). Those entries are present in additionalFeatures for
  // display purposes only — their effect bundles were already emitted by the class
  // feature choice pipeline (section 2 above). Re-emitting them here would double
  // every modifier they carry (e.g. Defence +1 AC would become +2 AC).
  for (const feat of additionalFeatures) {
    if (feat.dbKind !== "feat") continue;
    if (feat.fromClassFeatureChoice) continue;
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

    if (dbFeat.choices) {
      const src: ChoiceSource = { kind: "feat", sourceName: feat.dbName };
      const featPicks = state.featChoices[feat.dbName] ?? {};
      const { bundles: choiceBundles, deferredChoices } = collectChoiceEffectsPass1(
        dbFeat.choices,
        featPicks,
        src,
        state,
        resolvedSkills,
      );
      bundles.push(...choiceBundles);
      deferredChoices.forEach((d) => deferredSkillChoices.push({ ...d, source: src }));
    }
  }

  // ── 5. ASI bundles (from feat selections of type "asi") ───────────────────
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

  // ── Pass 2: skill_proficiency_or_expertise ────────────────────────────────
  for (const deferred of deferredSkillChoices) {
    const pass2Bundles = resolveSkillProfOrExpertise(
      deferred.choice,
      deferred.selected,
      deferred.source,
      resolvedSkills,
    );
    bundles.push(...pass2Bundles);
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

  // ── Granted spells from effect bundles (feats/items/species spell_grant) ──
  const granted = assembleGrantedSpells(bundles, spells, classes, totalLevel, warnings);
  spells.push(...granted);

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

    // Map the EffectSource onto a CharacterFeatureRef so the Actions tab can
    // open the source feature's full description in a popover.
    let sourceFeature: CharacterFeatureRef | undefined;
    if (bundleSource) {
      const sourceKind = bundleSource.type;
      const dbKind: CharacterFeatureRef["dbKind"] | null =
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
      source: className,
      sourceFeature,
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
 * Build the EffectBundle that a spell applies to a target creature when its
 * outcome lands (save failed, attack hit, or auto-applied). Pulls EntityEffects
 * from the spell's ActionEffect outcome branches — `onFailedSave` for save-kind
 * spells, `onHit` for attack-kind, the first available outcome for auto-kind.
 *
 * The returned bundle is tagged with `sourceConcentration: { caster, spell }`
 * so the GSM can sweep all such bundles off every combatant when the caster's
 * concentration breaks. Returns null if the spell has no target-applied effects
 * (pure damage spells, etc. — caller should fall through to manual handling).
 */
export function createSpellTargetBundle(spellName: string, caster: string): EffectBundle | null {
  const spell = getSpell(spellName);
  const action = spell?.effects?.action;
  if (!action) return null;

  const outcome =
    action.kind === "save"
      ? action.onFailedSave
      : action.kind === "attack"
        ? action.onHit
        : (action.onFailedSave ?? action.onHit ?? action.onSuccessfulSave);
  if (!outcome) return null;

  const merged: EntityEffects = {
    modifiers: outcome.applyEffects?.modifiers,
    properties: outcome.applyEffects?.properties,
  };

  // Inline applyConditions as condition-grant properties so the resolver
  // surfaces their mechanical effects on the target.
  if (outcome.applyConditions && outcome.applyConditions.length > 0) {
    const conditionProps: Property[] = outcome.applyConditions.flatMap((c) => {
      const cond = getCondition(c.name);
      const inlined = cond?.effects ? resolveConditionGrants(cond.effects) : null;
      const out: Property[] = [];
      if (inlined?.properties) out.push(...inlined.properties);
      return out;
    });
    if (conditionProps.length > 0) {
      merged.properties = [...(merged.properties ?? []), ...conditionProps];
    }
    // Also fold inlined modifiers from the granted conditions
    const conditionMods = outcome.applyConditions.flatMap((c) => {
      const cond = getCondition(c.name);
      const inlined = cond?.effects ? resolveConditionGrants(cond.effects) : null;
      return inlined?.modifiers ?? [];
    });
    if (conditionMods.length > 0) {
      merged.modifiers = [...(merged.modifiers ?? []), ...conditionMods];
    }
  }

  if (!merged.modifiers && !merged.properties) return null;

  return {
    id: `spell-target:${spellName.toLowerCase()}:${caster.toLowerCase()}`,
    source: { type: "spell", name: spellName },
    lifetime: spell?.concentration ? { type: "concentration" } : { type: "manual" },
    effects: merged,
    sourceConcentration: { caster, spell: spellName },
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

/**
 * Create an EffectBundle carrying a monster's innate damage resistances,
 * immunities, vulnerabilities, and condition immunities. Returns null if the
 * monster has no such entries or isn't in the bestiary.
 *
 * Bestiary entries can be bare strings ("fire"), structured objects with a
 * nested array plus a `cond: true` flag ("from nonmagical attacks"), or
 * compound strings describing conditional resistances. Only unconditional,
 * canonical entries are translated — conditional/compound entries are dropped
 * because we can't enforce their preconditions automatically (the DM must
 * handle those with explicit `apply_damage` adjustments).
 */
const DAMAGE_TYPES = new Set<DamageType>([
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

const CONDITION_NAMES = new Set<ConditionName>([
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

/** Title-case the first letter of each word, matching ConditionName casing. */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function createMonsterBundle(monsterName: string): EffectBundle | null {
  const monster = getMonster(monsterName);
  if (!monster) return null;

  const properties: Property[] = [];

  /**
   * Flatten bestiary entries to a list of canonical strings, skipping any
   * object entry flagged as conditional (e.g., "from nonmagical attacks").
   */
  const flatten = (entries: unknown[] | undefined, key: string): string[] => {
    if (!entries) return [];
    const out: string[] = [];
    for (const e of entries) {
      if (typeof e === "string") out.push(e);
      else if (e && typeof e === "object") {
        const rec = e as Record<string, unknown>;
        if (rec.cond === true) continue; // conditional — skip (DM adjudicates)
        const arr = rec[key];
        if (Array.isArray(arr)) for (const v of arr) if (typeof v === "string") out.push(v);
      }
    }
    return out;
  };

  const pushDamage = (kind: "resistance" | "immunity" | "vulnerability", raw: string) => {
    const dt = raw.trim().toLowerCase();
    if (!DAMAGE_TYPES.has(dt as DamageType)) return; // compound or unknown — skip
    properties.push({ type: kind, damageType: dt as DamageType } as Property);
  };

  for (const dt of flatten(monster.resist as unknown[] | undefined, "resist")) {
    pushDamage("resistance", dt);
  }
  for (const dt of flatten(monster.immune as unknown[] | undefined, "immune")) {
    pushDamage("immunity", dt);
  }
  for (const dt of flatten(monster.vulnerable as unknown[] | undefined, "vulnerable")) {
    pushDamage("vulnerability", dt);
  }
  for (const cn of flatten(monster.conditionImmune as unknown[] | undefined, "conditionImmune")) {
    const name = titleCase(cn.trim()) as ConditionName;
    if (!CONDITION_NAMES.has(name)) continue;
    properties.push({ type: "condition_immunity", conditionName: name });
  }

  if (properties.length === 0) return null;

  return {
    id: `monster:${monsterName.toLowerCase()}`,
    source: { type: "monster", name: monsterName },
    lifetime: { type: "permanent" },
    effects: { properties },
  };
}
