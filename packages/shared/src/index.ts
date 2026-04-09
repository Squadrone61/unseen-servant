export * from "./types/index";
export * from "./schemas/index";
export * from "./constants";
export * from "./skills";
export * from "./data/index";
export * from "./builders/index";
export { evaluateExpression } from "./utils/expression-evaluator";
export {
  resolveStat,
  collectProperties,
  hasResistance,
  hasImmunity,
  hasVulnerability,
  hasConditionImmunity,
  hasAdvantage,
  hasDisadvantage,
  getProficiencies,
  getSenses,
  getGrantedSpells,
  getExtraAttacks,
  getResources,
  getNotes,
  applyDamageWithEffects,
} from "./utils/effect-resolver";
// Re-export 5etools utils (avoid conflicts with data/index getCasterMultiplier)
export {
  SCHOOL_MAP,
  SIZE_MAP,
  DMG_TYPE_MAP,
  FEAT_CAT_MAP,
  ITEM_TYPE_MAP,
  OPT_FEAT_TYPE_MAP,
  CR_XP_MAP,
  ABILITY_MAP,
  ABILITY_ABBR,
  PROPERTY_MAP,
  formatSchool,
  formatMonsterSize,
  formatMonsterType,
  formatMonsterAc,
  formatMonsterHp,
  formatMonsterSpeed,
  formatMonsterCr,
  crToNumber,
  crToXp,
  getAbilityScores,
  formatAbilityMod,
  formatSaves,
  formatSkills,
  flattenResistances,
  flattenImmunities,
  flattenConditionImmunities,
  formatFeatCategory,
  formatSpeciesSize,
  SKILL_ABILITY_MAP,
  formatItemCost,
  formatDamageType,
  decodeProperty,
  decodeMastery,
  decodeItemType,
  formatOptionalFeatureType,
  parseTags,
  stripTags,
  entriesToText,
} from "./utils/5etools";
export type { ParsedTag } from "./utils/5etools";
