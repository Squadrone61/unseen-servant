import type { CharacterData, AbilityScores } from "../types/character";
import type {
  SpellDb,
  ConditionDb,
  FeatDb,
  BaseItemDb,
  MagicItemDb,
  ActionDb,
  DiseaseDb,
  StatusDb,
  OptionalFeatureDb,
} from "../types/data";
import { getAbilities, getSkills, getSavingThrows } from "../character/resolve";
import {
  ABILITY_FULL_NAMES,
  SKILL_DISPLAY_NAMES,
  getModifier,
  formatModifier,
  formatBonus,
  getSkillModifier,
  getSavingThrowModifier,
  getProficiencyBonus,
  getTotalLevel,
} from "../utils/character-helpers";
import { resolveFeatureDescription, resolveFeatureActivationTrigger } from "../data/index";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type BadgeTone = "amber" | "blue" | "green" | "red" | "violet" | "gray" | "yellow";

export interface EntityDetailBadge {
  label: string;
  tone?: BadgeTone;
}

export interface EntityDetailProperty {
  label: string;
  value: string;
  tone?: BadgeTone;
}

export interface EntityDetailSection {
  heading: string;
  body: string;
}

export interface EntityDetailAction {
  label: string;
  hint?: string;
}

export interface EntityDetailData {
  title: string;
  subtitle?: string;
  badges?: EntityDetailBadge[];
  properties?: EntityDetailProperty[];
  description?: string;
  effectSummary?: string;
  sections?: EntityDetailSection[];
  actions?: EntityDetailAction[];
}

// ---------------------------------------------------------------------------
// Payload types for character-contextual categories
// ---------------------------------------------------------------------------

export interface AbilityScoreDetailPayload {
  character: CharacterData;
  ability: keyof AbilityScores;
}

export interface ClassFeatureDetailPayload {
  character: CharacterData;
  featureId: string;
}

export interface InventoryItemDetailPayload {
  character: CharacterData;
  inventoryId: string;
}

export interface ChoiceOptionDetailPayload {
  description?: string;
  effectSummary?: string;
}

export interface EntityDetailPayload {
  "ability-score": AbilityScoreDetailPayload;
  "class-feature": ClassFeatureDetailPayload;
  "inventory-item": InventoryItemDetailPayload;
  "choice-option": ChoiceOptionDetailPayload;
  condition: never;
  spell: never;
  action: never;
  item: never;
  class: never;
  feat: never;
  species: never;
  background: never;
  disease: never;
  status: never;
  rule: never;
  optional_feature: never;
}

// ---------------------------------------------------------------------------
// DB-record resolvers (no character context needed)
// ---------------------------------------------------------------------------

export function entityDetailFromSpell(spell: SpellDb): EntityDetailData {
  const badges: EntityDetailBadge[] = [];
  const levelStr =
    spell.level === 0 ? "Cantrip" : `Level ${spell.level}${spell.school ? ` ${spell.school}` : ""}`;
  badges.push({ label: levelStr, tone: "amber" });
  if (spell.concentration) badges.push({ label: "Concentration", tone: "yellow" as BadgeTone });
  if (spell.ritual) badges.push({ label: "Ritual", tone: "blue" });

  const properties: EntityDetailProperty[] = [];
  if (spell.castingTime) properties.push({ label: "Cast", value: spell.castingTime });
  if (spell.range) properties.push({ label: "Range", value: spell.range });
  if (spell.components) properties.push({ label: "Components", value: spell.components });
  if (spell.duration) properties.push({ label: "Duration", value: spell.duration });

  // Include "Place on Map" action hint for AoE spells so the frontend can render a CTA.
  const area = spell.effects?.action?.area;
  const actions: EntityDetailAction[] = area
    ? [{ label: "Place on Map", hint: `${area.size}ft ${area.shape}` }]
    : [];

  return {
    title: spell.name,
    badges,
    properties,
    description: spell.description,
    actions: actions.length > 0 ? actions : undefined,
  };
}

export function entityDetailFromCondition(c: ConditionDb): EntityDetailData {
  return {
    title: c.name,
    description: c.description,
  };
}

export function entityDetailFromFeat(feat: FeatDb): EntityDetailData {
  const badges: EntityDetailBadge[] = feat.category
    ? [{ label: feat.category, tone: "amber" }]
    : [];

  return {
    title: feat.name,
    subtitle: feat.prerequisiteText ? `Prerequisite: ${feat.prerequisiteText}` : undefined,
    badges: badges.length > 0 ? badges : undefined,
    description: feat.description,
  };
}

export function entityDetailFromBaseItem(item: BaseItemDb): EntityDetailData {
  const badges: EntityDetailBadge[] = [];
  const properties: EntityDetailProperty[] = [];

  let typeLabel: string | undefined;
  if (item.weapon) typeLabel = "Weapon";
  else if (item.armor) typeLabel = item.type === "S" ? "Shield" : "Armor";
  if (typeLabel) badges.push({ label: typeLabel, tone: "gray" });

  if (item.weapon && item.damage) {
    const dmg = item.versatileDamage ? `${item.damage}/${item.versatileDamage}` : item.damage;
    properties.push({
      label: "Damage",
      value: item.damageType ? `${dmg} ${item.damageType}` : dmg,
    });
  }
  if (item.armor && item.ac != null) {
    properties.push({ label: "Base AC", value: String(item.ac) });
  }
  if (item.mastery?.[0]) {
    properties.push({ label: "Mastery", value: item.mastery[0] });
  }
  if (item.properties && item.properties.length > 0) {
    properties.push({ label: "Properties", value: item.properties.join(", ") });
  }
  if (item.range) {
    properties.push({ label: "Range", value: item.range });
  }
  if (item.weight != null && item.weight > 0) {
    properties.push({ label: "Weight", value: `${item.weight} lb` });
  }

  return {
    title: item.name,
    badges,
    properties: properties.length > 0 ? properties : undefined,
    description: item.description,
  };
}

export function entityDetailFromMagicItem(item: MagicItemDb): EntityDetailData {
  const badges: EntityDetailBadge[] = [];
  if (item.rarity) badges.push({ label: item.rarity, tone: "amber" });
  if (item.attunement) badges.push({ label: "Requires Attunement", tone: "blue" });

  return {
    title: item.name,
    badges,
    description: item.description,
  };
}

export function entityDetailFromAction(action: ActionDb): EntityDetailData {
  const badges: EntityDetailBadge[] = [];
  if (action.time) badges.push({ label: action.time, tone: "blue" });

  return {
    title: action.name,
    badges,
    description: action.description,
  };
}

export function entityDetailFromDisease(d: DiseaseDb): EntityDetailData {
  return {
    title: d.name,
    description: d.description,
  };
}

export function entityDetailFromStatus(s: StatusDb): EntityDetailData {
  return {
    title: s.name,
    description: s.description,
  };
}

// ---------------------------------------------------------------------------
// Character-contextual resolvers
// ---------------------------------------------------------------------------

export function entityDetailFromAbilityScore(
  character: CharacterData,
  ability: keyof AbilityScores,
): EntityDetailData {
  const abilities = getAbilities(character);
  const score = abilities[ability];
  const modStr = formatModifier(score);
  const fullName = ABILITY_FULL_NAMES[ability];
  const totalLevel = getTotalLevel(character.static.classes);
  const profBonus = getProficiencyBonus(totalLevel);

  const save = getSavingThrows(character).find((sv) => sv.ability === ability);
  const saveMod = save ? getSavingThrowModifier(save, abilities, profBonus) : getModifier(score);
  const saveProficient = save?.proficient ?? false;

  const properties: EntityDetailProperty[] = [
    {
      label: "Save",
      value: formatBonus(saveMod),
      tone: saveProficient ? "amber" : undefined,
    },
  ];
  for (const sk of getSkills(character).filter((s) => s.ability === ability)) {
    const mod = getSkillModifier(sk, abilities, profBonus);
    const tone: BadgeTone | undefined = sk.expertise
      ? "green"
      : sk.proficient
        ? "amber"
        : undefined;
    properties.push({
      label: SKILL_DISPLAY_NAMES[sk.name] ?? sk.name,
      value: formatBonus(mod),
      tone,
    });
  }

  return {
    title: fullName,
    subtitle: `${modStr} (${score})`,
    properties,
  };
}

export function entityDetailFromClassFeature(
  character: CharacterData,
  featureId: string,
): EntityDetailData {
  const feature = character.static.features.find(
    (f) => (f.featureName ?? f.dbName) === featureId || f.dbName === featureId,
  );

  if (!feature) {
    return { title: featureId, description: "No description available." };
  }

  const SOURCE_LABELS: Record<typeof feature.dbKind, string> = {
    class: "Class",
    subclass: "Subclass",
    species: "Species",
    feat: "Feat",
    background: "Background",
  };

  const displayName = feature.featureName ?? feature.dbName;
  const sourceTag = feature.sourceLabel ?? SOURCE_LABELS[feature.dbKind];
  const description = resolveFeatureDescription(feature);

  const badges: EntityDetailBadge[] = [{ label: sourceTag, tone: "amber" }];
  if (
    feature.requiredLevel != null &&
    !new RegExp(`\\b${feature.requiredLevel}\\b`).test(sourceTag)
  ) {
    badges.push({ label: `Level ${feature.requiredLevel}`, tone: "gray" });
  }
  if (resolveFeatureActivationTrigger(feature) === "attack") {
    badges.push({ label: "Part of Attack", tone: "red" });
  }

  const sections: EntityDetailSection[] = [];
  if (feature.choices && Object.keys(feature.choices).length > 0) {
    const chosenLines = Object.entries(feature.choices)
      .map(([key, val]) => {
        const display = Array.isArray(val) ? val.join(", ") : val;
        return display ? `${key.replace(/[-_]/g, " ")}: ${display}` : null;
      })
      .filter((l): l is string => l !== null);
    if (chosenLines.length > 0) {
      sections.push({ heading: "Chosen", body: chosenLines.join("\n") });
    }
  }

  return {
    title: displayName,
    badges,
    description: description || "No description available.",
    sections: sections.length > 0 ? sections : undefined,
  };
}

export function entityDetailFromInventoryItem(
  character: CharacterData,
  inventoryId: string,
): EntityDetailData {
  const item = character.dynamic.inventory.find((it) => it.name === inventoryId);

  if (!item) {
    return { title: inventoryId, description: "Item not found in inventory." };
  }

  const badges: EntityDetailBadge[] = [];
  const properties: EntityDetailProperty[] = [];

  let typeLabel: string | undefined;
  if (item.weapon) typeLabel = "Weapon";
  else if (item.armor) {
    const t = item.armor.type;
    typeLabel = t === "shield" ? "Shield" : `${t.charAt(0).toUpperCase() + t.slice(1)} Armor`;
  }
  if (typeLabel) badges.push({ label: typeLabel, tone: "gray" });

  const isMagic = !!item.rarity && item.rarity !== "Common";
  if (item.rarity) badges.push({ label: item.rarity, tone: "amber" });
  if (isMagic) badges.push({ label: "Magic", tone: "amber" });
  if (item.attunement) {
    badges.push({
      label: item.attuned ? "Attuned" : "Requires Attunement",
      tone: item.attuned ? "blue" : "gray",
    });
  }
  if (item.equipped) badges.push({ label: "Equipped", tone: "green" });

  if (item.weapon?.damage) {
    const dmg = item.weapon.versatile
      ? `${item.weapon.damage}/${item.weapon.versatile}`
      : item.weapon.damage;
    properties.push({
      label: "Damage",
      value: item.weapon.damageType ? `${dmg} ${item.weapon.damageType}` : dmg,
    });
  }
  if (item.armor && item.armor.type !== "shield" && item.armor.baseAc != null) {
    properties.push({ label: "Base AC", value: String(item.armor.baseAc) });
  }
  if (item.weight != null && item.weight > 0) {
    properties.push({ label: "Weight", value: `${item.weight} lb` });
  }
  if (item.quantity > 1) {
    properties.push({ label: "Qty", value: String(item.quantity) });
  }
  if (item.weapon?.range) {
    properties.push({ label: "Range", value: item.weapon.range });
  }

  const sections: EntityDetailSection[] = [];
  if (item.weapon?.properties && item.weapon.properties.length > 0) {
    sections.push({ heading: "Properties", body: item.weapon.properties.join(", ") });
  }
  if (item.weapon?.mastery) {
    sections.push({ heading: "Mastery", body: item.weapon.mastery });
  }
  if (item.armor?.strReq != null || item.armor?.stealthDisadvantage) {
    const notes: string[] = [];
    if (item.armor?.strReq != null) notes.push(`Str ${item.armor.strReq}+`);
    if (item.armor?.stealthDisadvantage) notes.push("Stealth Disadvantage");
    sections.push({ heading: "Requirements", body: notes.join(", ") });
  }

  return {
    title: item.name,
    badges,
    properties: properties.length > 0 ? properties : undefined,
    description: item.description,
    sections: sections.length > 0 ? sections : undefined,
  };
}

export function entityDetailFromChoiceOption(data: ChoiceOptionDetailPayload): EntityDetailData {
  return {
    title: "",
    description: data.description,
    effectSummary: data.effectSummary,
  };
}

export function entityDetailFromOptionalFeature(opt: OptionalFeatureDb): EntityDetailData {
  const badges: EntityDetailBadge[] = [];
  if (opt.prerequisite) {
    badges.push({ label: opt.prerequisite, tone: "gray" });
  }
  return {
    title: opt.name,
    badges: badges.length > 0 ? badges : undefined,
    description: opt.description,
  };
}
