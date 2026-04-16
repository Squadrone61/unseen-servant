import type { FeatureChoice } from "../types/effects";
import type { EntityCategory } from "../types/effects";
import type { EntityDetailPayload } from "../detail/index";
import {
  featsArray,
  spellsArray,
  baseItemsArray,
  getFeat,
  getBaseItem,
  getOptionalFeaturesByType,
} from "../data/index";
import { getEligibleMasteryWeapons } from "../utils/weapon-mastery";
import { summarizeEffects } from "./effect-summary";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedOption {
  id: string;
  name: string;
  detail: {
    category: EntityCategory;
    name: string;
    payload?: EntityDetailPayload[EntityCategory];
  };
  subChoices?: FeatureChoice[];
  disabled?: boolean;
  disabledReason?: string;
}

export interface ResolveChoiceContext {
  className?: string;
  level?: number;
}

// ---------------------------------------------------------------------------
// Static pool data (mirrors ChoicePicker.tsx static lists)
// ---------------------------------------------------------------------------

const ALL_SKILLS: string[] = [
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival",
];

const ALL_ABILITIES: string[] = [
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma",
];

const COMMON_LANGUAGES: string[] = [
  "Common",
  "Dwarvish",
  "Elvish",
  "Giant",
  "Gnomish",
  "Goblin",
  "Halfling",
  "Orc",
  "Abyssal",
  "Celestial",
  "Deep Speech",
  "Draconic",
  "Infernal",
  "Primordial",
  "Sylvan",
  "Undercommon",
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeChoiceOption(name: string, description?: string): ResolvedOption {
  return {
    id: name,
    name,
    detail: {
      category: "choice-option",
      name,
      payload: { description, effectSummary: undefined } as EntityDetailPayload["choice-option"],
    },
  };
}

// ---------------------------------------------------------------------------
// resolveChoice
// ---------------------------------------------------------------------------

/**
 * Resolves a FeatureChoice into a flat list of ResolvedOption entries.
 *
 * Options-based choices: one option per entry in `choice.options`.
 * Pool-based choices: one option per item in the derived pool (constrained by
 * `choice.from` when supplied, or derived from `ctx.className` for weapon_mastery).
 *
 * Each option carries a typed `detail` that routes to the appropriate
 * EntityDetailPopover category (spell, feat, item, or choice-option for
 * skills/languages/tools/ability scores).
 */
export function resolveChoice(choice: FeatureChoice, ctx?: ResolveChoiceContext): ResolvedOption[] {
  if ("options" in choice && choice.options) {
    return choice.options.map((opt) => {
      const effectSummary = summarizeEffects(opt.effects);
      return {
        id: opt.label,
        name: opt.label,
        detail: {
          category: "choice-option" as EntityCategory,
          name: opt.label,
          payload: {
            description: opt.description,
            effectSummary: effectSummary || undefined,
          } as EntityDetailPayload["choice-option"],
        },
        subChoices: opt.choices && opt.choices.length > 0 ? opt.choices : undefined,
      };
    });
  }

  const pool = (choice as Extract<FeatureChoice, { pool: string }>).pool;
  const from = (choice as Extract<FeatureChoice, { pool: string }>).from;

  switch (pool) {
    case "skill_proficiency":
    case "skill_expertise":
    case "skill_proficiency_or_expertise": {
      const names = from && from.length > 0 ? from : ALL_SKILLS;
      const description =
        pool === "skill_proficiency"
          ? "Gain proficiency in this skill."
          : pool === "skill_expertise"
            ? "Gain expertise (double proficiency) in this skill."
            : "Gain proficiency, or expertise if already proficient.";
      return names.map((name) => makeChoiceOption(name, description));
    }

    case "language": {
      const names = from && from.length > 0 ? from : COMMON_LANGUAGES;
      return names.map((name) => makeChoiceOption(name, "Learn this language."));
    }

    case "tool": {
      if (!from || from.length === 0) return [];
      return from.map((name) => {
        const item = getBaseItem(name);
        return {
          id: name,
          name,
          detail: {
            category: "choice-option" as EntityCategory,
            name,
            payload: {
              description: item?.description ?? "Gain proficiency with this tool.",
            } as EntityDetailPayload["choice-option"],
          },
        };
      });
    }

    case "ability_score": {
      const names = from && from.length > 0 ? from : ALL_ABILITIES;
      return names.map((name) => makeChoiceOption(name, "Increase this ability score by +1."));
    }

    case "fighting_style": {
      const candidates =
        from && from.length > 0
          ? from
          : featsArray.filter((f) => f.category === "Fighting Style").map((f) => f.name);
      return candidates.map((name) => {
        const feat = getFeat(name);
        const subChoices = feat?.choices?.filter((c) => c.timing === "permanent") ?? [];
        return {
          id: name,
          name,
          detail: {
            category: "feat" as EntityCategory,
            name,
          },
          subChoices: subChoices.length > 0 ? subChoices : undefined,
        };
      });
    }

    case "spell_cantrip": {
      let cantrips = spellsArray.filter((s) => s.level === 0);
      if (from && from.length > 0) {
        cantrips = cantrips.filter((s) => s.classes.some((c) => from.includes(c)));
      }
      return cantrips.map((s) => ({
        id: s.name,
        name: s.name,
        detail: {
          category: "spell" as EntityCategory,
          name: s.name,
        },
      }));
    }

    case "weapon_mastery": {
      let weaponNames: string[];
      if (from && from.length > 0) {
        weaponNames = from;
      } else if (ctx?.className) {
        weaponNames = getEligibleMasteryWeapons(ctx.className);
      } else {
        weaponNames = baseItemsArray
          .filter((w) => w.weapon && w.mastery && w.mastery.length > 0)
          .sort((a, b) => {
            if (a.weaponCategory !== b.weaponCategory) {
              return a.weaponCategory === "simple" ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          })
          .map((w) => w.name);
      }
      return weaponNames.map((name) => ({
        id: name,
        name,
        detail: {
          category: "item" as EntityCategory,
          name,
        },
      }));
    }

    case "metamagic": {
      const options = getOptionalFeaturesByType("MM");
      return options.map((opt) => ({
        id: opt.name,
        name: opt.name,
        detail: {
          category: "optional_feature" as EntityCategory,
          name: opt.name,
        },
      }));
    }

    default:
      return [];
  }
}
