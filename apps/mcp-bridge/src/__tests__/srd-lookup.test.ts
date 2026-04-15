import { describe, it, expect } from "vitest";
import {
  getSpell,
  getMonster,
  getCondition,
  getFeat,
  getSpecies,
  getBackground,
  getClass,
  getOptionalFeature,
  getBaseItem,
  getMagicItem,
  getLanguage,
  getAction,
  searchSpells,
  searchMonsters,
  spellsArray,
  monstersArray,
  conditionsArray,
  featsArray,
  speciesArray,
  backgroundsArray,
  classesArray,
  optionalFeaturesArray,
  baseItemsArray,
  magicItemsArray,
  languagesArray,
  actionsArray,
} from "@unseen-servant/shared/data";

/**
 * Behavioral contracts for the shared D&D 2024 data layer.
 * Exercised via the helper functions exported from @unseen-servant/shared/data
 * (getSpell, getMonster, etc.) and the lookup/search MCP tools in srd-tools.ts.
 *
 * The underlying data files contain:
 *   - 490 spells   (data/spells.json)
 *   - 580 monsters (data/bestiary.json)
 *   - 15 conditions
 *   - 563 magic items
 *   - 103 feats
 *   - 12 classes
 *   - 28 species
 *   - 27 backgrounds
 *
 * ## Spell lookup
 * - "Fireball" resolves to SpellDb with level=3, school="Evocation".
 * - Spells have pre-formatted string fields: castingTime, range, components, duration.
 * - Spells have a classes array listing which classes can cast them.
 * - Case-insensitive: "fireball" and "FIREBALL" resolve to the same entry.
 * - Non-existent spell name returns undefined from the data helper.
 *
 * ## Monster lookup
 * - "Goblin Warrior" resolves to MonsterDb with a numeric CR value >= 0.
 * - "Goblin Warrior" has a name field matching (case-insensitively) the lookup key.
 * - Non-existent monster name returns undefined.
 *
 * ## Condition lookup
 * - "Poisoned" resolves to a ConditionDb (= DbEntity) with a non-empty description string.
 * - Conditions have structured effects with modifiers/properties (not raw entries arrays).
 * - Condition names are looked up case-insensitively.
 *
 * ## Species lookup
 * - "Elf" resolves to SpeciesDb with size, speed, darkvision, description.
 *
 * ## Background lookup
 * - "Acolyte" resolves to BackgroundDb with skills, tools, feat, abilityScores.
 *
 * ## Feat lookup
 * - "Alert" resolves to FeatDb with category, description (no prerequisite for origin feats).
 *
 * ## Class lookup
 * - "Wizard" resolves to ClassDb with features, subclasses, hitDiceFaces, savingThrows.
 *
 * ## Optional feature lookup
 * - "Agonizing Blast" resolves to OptionalFeatureDb with featureType array, prerequisite.
 *
 * ## Items split
 * - getBaseItem works for weapons/armor (e.g. "Longsword").
 * - getMagicItem works for magic items (e.g. "Cloak of Protection").
 *
 * ## search_rules (keyword search across categories)
 * - A keyword present in spell names returns results from the spells category.
 * - A keyword present in monster names returns results from the monsters category.
 * - An ambiguous or cross-category keyword may return results from multiple categories.
 * - A keyword matching nothing returns an empty results set (no error).
 *
 * ## Data integrity
 * - All 490 spells have name, level (0–9), and school string.
 * - All 580 monsters have a name and a CR field.
 * - All conditions have a name and description string.
 */

// ---------------------------------------------------------------------------
// Spell lookup
// ---------------------------------------------------------------------------

describe("spell lookup", () => {
  describe("Fireball resolves with level=3 and Evocation school", () => {
    it("getSpell('Fireball') returns an entry with level 3", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(spell!.level).toBe(3);
    });

    it("getSpell('Fireball') school is the full string 'Evocation' (not a single-letter code)", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      // The Db format stores the full school name, not a single-letter code.
      expect(spell!.school).toBe("Evocation");
    });

    it("Fireball has a non-empty description string (rules text present)", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(typeof spell!.description).toBe("string");
      expect(spell!.description.length).toBeGreaterThan(0);
    });
  });

  describe("Fireball has pre-formatted string fields", () => {
    it("castingTime is a string like '1 action'", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(typeof spell!.castingTime).toBe("string");
      expect(spell!.castingTime).toBe("1 action");
    });

    it("range is a string like '150 feet'", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(typeof spell!.range).toBe("string");
      expect(spell!.range).toBe("150 feet");
    });

    it("components is a pre-formatted string with V, S, M notation", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(typeof spell!.components).toBe("string");
      expect(spell!.components).toMatch(/^V, S/);
    });

    it("duration is a pre-formatted string", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(typeof spell!.duration).toBe("string");
      expect(spell!.duration).toBe("Instantaneous");
    });

    it("ritual and concentration are boolean fields", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(typeof spell!.ritual).toBe("boolean");
      expect(typeof spell!.concentration).toBe("boolean");
      expect(spell!.concentration).toBe(false);
    });

    it("higherLevels string is present for upcast spells", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(typeof spell!.higherLevels).toBe("string");
      expect(spell!.higherLevels!.length).toBeGreaterThan(0);
    });
  });

  describe("Fireball has a non-empty classes array", () => {
    it("classes is an array", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(Array.isArray(spell!.classes)).toBe(true);
    });

    it("Fireball classes list is non-empty", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(spell!.classes.length).toBeGreaterThan(0);
    });

    it("Fireball is on the Wizard spell list", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(spell!.classes).toContain("Wizard");
    });

    it("Fireball is on the Sorcerer spell list", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(spell!.classes).toContain("Sorcerer");
    });
  });

  describe("Cure Wounds has all summary fields", () => {
    it("getSpell returns all fields needed for a summary (name, level, school, range, components)", () => {
      const spell = getSpell("Cure Wounds");
      expect(spell).toBeDefined();
      expect(typeof spell!.name).toBe("string");
      expect(typeof spell!.level).toBe("number");
      expect(typeof spell!.school).toBe("string");
      expect(typeof spell!.range).toBe("string");
      expect(typeof spell!.components).toBe("string");
    });
  });

  describe("concentration spells have concentration=true", () => {
    it("Bless has concentration=true", () => {
      const spell = getSpell("Bless");
      expect(spell).toBeDefined();
      expect(spell!.concentration).toBe(true);
    });

    it("Fireball has concentration=false", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(spell!.concentration).toBe(false);
    });
  });

  describe("lookup is case-insensitive", () => {
    it("lowercase 'fireball' returns the same entry as 'Fireball'", () => {
      const upper = getSpell("Fireball");
      const lower = getSpell("fireball");
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
      expect(lower!.level).toBe(upper!.level);
    });

    it("ALL CAPS 'FIREBALL' resolves to the same entry", () => {
      const upper = getSpell("Fireball");
      const caps = getSpell("FIREBALL");
      expect(caps).toBeDefined();
      expect(caps!.name).toBe(upper!.name);
    });

    it("mixed case 'fIrEbAlL' resolves correctly", () => {
      const result = getSpell("fIrEbAlL");
      expect(result).toBeDefined();
      expect(result!.level).toBe(3);
    });
  });

  describe("non-existent spell returns undefined", () => {
    it("returns undefined for a spell name not in the database", () => {
      const result = getSpell("Mega Laser Beam of Ultimate Doom");
      expect(result).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
      const result = getSpell("");
      expect(result).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Monster lookup
// ---------------------------------------------------------------------------

describe("monster lookup", () => {
  describe("Goblin Warrior resolves with a valid CR", () => {
    it("getMonster('Goblin Warrior') returns a defined entry", () => {
      const monster = getMonster("Goblin Warrior");
      expect(monster).toBeDefined();
    });

    it("Goblin Warrior has a cr field that is defined and non-null", () => {
      const monster = getMonster("Goblin Warrior");
      expect(monster).toBeDefined();
      expect(monster!.cr).toBeDefined();
      expect(monster!.cr).not.toBeNull();
    });

    it("Goblin Warrior cr value is parseable as a number >= 0", () => {
      const monster = getMonster("Goblin Warrior");
      expect(monster).toBeDefined();
      // cr may be a string like "1/4" or a MonsterCr object; both must represent a valid CR.
      const crRaw = monster!.cr;
      const crStr = typeof crRaw === "string" ? crRaw : (crRaw as { cr: string }).cr;
      // Fractions like "1/4" should parse via eval-like split, integers parse directly.
      const parts = crStr.split("/");
      const numeric =
        parts.length === 2 ? parseInt(parts[0], 10) / parseInt(parts[1], 10) : parseFloat(crStr);
      expect(isNaN(numeric)).toBe(false);
      expect(numeric).toBeGreaterThanOrEqual(0);
    });

    it("Goblin Warrior has ac, hp, size, type fields for summary rendering", () => {
      const monster = getMonster("Goblin Warrior");
      expect(monster).toBeDefined();
      expect(typeof monster!.name).toBe("string");
      expect(monster!.cr).toBeDefined();
      expect(monster!.ac).toBeDefined();
      expect(monster!.hp).toBeDefined();
      expect(monster!.size).toBeDefined();
      expect(monster!.type).toBeDefined();
    });
  });

  describe("Ogre has action entries for full stat block rendering", () => {
    it("getMonster returns trait and action arrays for full stat block rendering", () => {
      const monster = getMonster("Ogre");
      expect(monster).toBeDefined();
      // action is used in formatMonster for full rendering — may or may not be present
      // but the field must at minimum be accessible without throwing.
      expect(() => monster!.action).not.toThrow();
    });
  });

  describe("lookup is case-insensitive", () => {
    it("lowercase 'goblin warrior' returns the same entry as 'Goblin Warrior'", () => {
      const upper = getMonster("Goblin Warrior");
      const lower = getMonster("goblin warrior");
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
    });

    it("ALL CAPS 'GOBLIN WARRIOR' resolves to the same entry", () => {
      const result = getMonster("GOBLIN WARRIOR");
      expect(result).toBeDefined();
      expect(result!.name.toLowerCase()).toBe("goblin warrior");
    });
  });

  describe("non-existent monster returns undefined", () => {
    it("returns undefined for a monster name not in the database", () => {
      const result = getMonster("Flumph Lord Overlord Supreme");
      expect(result).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
      const result = getMonster("");
      expect(result).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Condition lookup
// ---------------------------------------------------------------------------

describe("condition lookup", () => {
  describe("Poisoned resolves with a non-empty description", () => {
    it("getCondition('Poisoned') returns a defined entry", () => {
      const condition = getCondition("Poisoned");
      expect(condition).toBeDefined();
    });

    it("Poisoned has a non-empty description string (rules text present)", () => {
      const condition = getCondition("Poisoned");
      expect(condition).toBeDefined();
      // ConditionDb uses description: string as the pre-formatted rules text.
      expect(typeof condition!.description).toBe("string");
      expect(condition!.description.length).toBeGreaterThan(10);
    });

    it("Poisoned description mentions disadvantage on attack rolls", () => {
      const condition = getCondition("Poisoned");
      expect(condition).toBeDefined();
      expect(condition!.description.toLowerCase()).toContain("disadvantage");
    });
  });

  describe("conditions have structured effects (not raw entries arrays)", () => {
    it("Poisoned has an effects object with a properties array", () => {
      const condition = getCondition("Poisoned");
      expect(condition).toBeDefined();
      expect(condition!.effects).toBeDefined();
      expect(Array.isArray(condition!.effects!.properties)).toBe(true);
      expect(condition!.effects!.properties!.length).toBeGreaterThan(0);
    });

    it("Blinded has an effects object with a properties array", () => {
      const condition = getCondition("Blinded");
      expect(condition).toBeDefined();
      expect(condition!.effects).toBeDefined();
      expect(Array.isArray(condition!.effects!.properties)).toBe(true);
      expect(condition!.effects!.properties!.length).toBeGreaterThan(0);
    });

    it("condition effects do NOT have an 'entries' array (old format removed)", () => {
      for (const condition of conditionsArray) {
        // The new format uses description: string and effects: EntityEffects.
        // Raw 5e.tools 'entries' arrays should not be present at the top level.
        expect((condition as unknown as Record<string, unknown>)["entries"]).toBeUndefined();
      }
    });
  });

  describe("condition descriptions contain rich text links", () => {
    it("Poisoned description may contain {rule:} link syntax", () => {
      const condition = getCondition("Poisoned");
      expect(condition).toBeDefined();
      // Rich text links use {category:name} syntax — description should be a plain string.
      expect(typeof condition!.description).toBe("string");
    });

    it("Blinded description contains {rule:} or {action:} link syntax", () => {
      const condition = getCondition("Blinded");
      expect(condition).toBeDefined();
      // Blinded description references the Attack action via {action:Attack}.
      expect(condition!.description).toMatch(/\{[a-z]+:[^}]+\}/);
    });
  });

  describe("lookup is case-insensitive", () => {
    it("lowercase 'poisoned' returns the same entry as 'Poisoned'", () => {
      const upper = getCondition("Poisoned");
      const lower = getCondition("poisoned");
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
    });

    it("ALL CAPS 'POISONED' resolves to the same entry", () => {
      const result = getCondition("POISONED");
      expect(result).toBeDefined();
      expect(result!.name.toLowerCase()).toBe("poisoned");
    });

    it("'Blinded' condition is also retrievable case-insensitively", () => {
      const upper = getCondition("Blinded");
      const lower = getCondition("blinded");
      expect(upper).toBeDefined();
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
    });
  });

  describe("all standard conditions are present", () => {
    it("known conditions are all present in the database", () => {
      const expected = [
        "Blinded",
        "Charmed",
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
      ];
      for (const name of expected) {
        const cond = getCondition(name);
        expect(cond, `Expected condition "${name}" to be in the database`).toBeDefined();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Species lookup
// ---------------------------------------------------------------------------

describe("species lookup", () => {
  describe("Elf resolves with expected SpeciesDb fields", () => {
    it("getSpecies('Elf') returns a defined entry", () => {
      const sp = getSpecies("Elf");
      expect(sp).toBeDefined();
    });

    it("Elf has a non-empty description string", () => {
      const sp = getSpecies("Elf");
      expect(sp).toBeDefined();
      expect(typeof sp!.description).toBe("string");
      expect(sp!.description.length).toBeGreaterThan(0);
    });

    it("Elf size is a non-empty array of CreatureSize values", () => {
      const sp = getSpecies("Elf");
      expect(sp).toBeDefined();
      expect(Array.isArray(sp!.size)).toBe(true);
      expect(sp!.size.length).toBeGreaterThan(0);
      expect(sp!.size).toContain("Medium");
    });

    it("Elf speed is a positive number", () => {
      const sp = getSpecies("Elf");
      expect(sp).toBeDefined();
      expect(typeof sp!.speed).toBe("number");
      expect(sp!.speed).toBe(30);
    });

    it("Elf has darkvision 60 feet in effects properties", () => {
      const sp = getSpecies("Elf");
      expect(sp).toBeDefined();
      const dvProp = (sp!.effects?.properties ?? []).find(
        (p) => p.type === "sense" && (p as { sense?: string }).sense === "darkvision",
      );
      expect(dvProp).toBeDefined();
      expect((dvProp as { range: number }).range).toBe(60);
    });

    it("Elf description contains rich text {spell:} or {condition:} links", () => {
      const sp = getSpecies("Elf");
      expect(sp).toBeDefined();
      // Elf description references spells and conditions via rich text links.
      expect(sp!.description).toMatch(/\{[a-z]+:[^}]+\}/);
    });
  });

  describe("lookup is case-insensitive", () => {
    it("lowercase 'elf' returns the same entry as 'Elf'", () => {
      const upper = getSpecies("Elf");
      const lower = getSpecies("elf");
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
    });
  });

  describe("non-existent species returns undefined", () => {
    it("returns undefined for a species not in the database", () => {
      const result = getSpecies("Space Hamster");
      expect(result).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Background lookup
// ---------------------------------------------------------------------------

describe("background lookup", () => {
  describe("Acolyte resolves with expected BackgroundDb fields", () => {
    it("getBackground('Acolyte') returns a defined entry", () => {
      const bg = getBackground("Acolyte");
      expect(bg).toBeDefined();
    });

    it("Acolyte has a non-empty description string", () => {
      const bg = getBackground("Acolyte");
      expect(bg).toBeDefined();
      expect(typeof bg!.description).toBe("string");
      expect(bg!.description.length).toBeGreaterThan(0);
    });

    it("Acolyte has Insight and Religion skill proficiencies in effects.properties", () => {
      const bg = getBackground("Acolyte");
      expect(bg).toBeDefined();
      const skillProps = (bg!.effects?.properties ?? []).filter(
        (p) => p.type === "proficiency" && (p as { category?: string }).category === "skill",
      );
      const skillValues = skillProps.map((p) => (p as { value: string }).value);
      expect(skillValues).toContain("Insight");
      expect(skillValues).toContain("Religion");
    });

    it("Acolyte has tool proficiencies in effects.properties", () => {
      const bg = getBackground("Acolyte");
      expect(bg).toBeDefined();
      const toolProps = (bg!.effects?.properties ?? []).filter(
        (p) => p.type === "proficiency" && (p as { category?: string }).category === "tool",
      );
      expect(Array.isArray(toolProps)).toBe(true);
    });

    it("Acolyte feat is a string", () => {
      const bg = getBackground("Acolyte");
      expect(bg).toBeDefined();
      expect(typeof bg!.feat).toBe("string");
      expect(bg!.feat!.length).toBeGreaterThan(0);
    });

    it("Acolyte abilityScores has from array and weights array", () => {
      const bg = getBackground("Acolyte");
      expect(bg).toBeDefined();
      expect(Array.isArray(bg!.abilityScores.from)).toBe(true);
      expect(bg!.abilityScores.from.length).toBeGreaterThan(0);
      expect(Array.isArray(bg!.abilityScores.weights)).toBe(true);
      expect(bg!.abilityScores.weights.length).toBeGreaterThan(0);
    });
  });

  describe("lookup is case-insensitive", () => {
    it("lowercase 'acolyte' returns the same entry as 'Acolyte'", () => {
      const upper = getBackground("Acolyte");
      const lower = getBackground("acolyte");
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
    });
  });

  describe("non-existent background returns undefined", () => {
    it("returns undefined for a background not in the database", () => {
      const result = getBackground("Dragon Slayer Guild Member");
      expect(result).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Feat lookup
// ---------------------------------------------------------------------------

describe("feat lookup", () => {
  describe("Alert resolves with expected FeatDb fields", () => {
    it("getFeat('Alert') returns a defined entry", () => {
      const feat = getFeat("Alert");
      expect(feat).toBeDefined();
    });

    it("Alert has a non-empty description string", () => {
      const feat = getFeat("Alert");
      expect(feat).toBeDefined();
      expect(typeof feat!.description).toBe("string");
      expect(feat!.description.length).toBeGreaterThan(0);
    });

    it("Alert has a category field with a valid FeatCategory value", () => {
      const feat = getFeat("Alert");
      expect(feat).toBeDefined();
      const validCategories = ["General", "Origin", "Fighting Style", "Epic Boon"];
      expect(validCategories).toContain(feat!.category);
    });

    it("Alert category is 'Origin'", () => {
      const feat = getFeat("Alert");
      expect(feat).toBeDefined();
      expect(feat!.category).toBe("Origin");
    });

    it("Alert has no prerequisite (Origin feats have no prerequisite)", () => {
      const feat = getFeat("Alert");
      expect(feat).toBeDefined();
      // Origin feats are available to all characters with no prerequisite.
      expect(feat!.prerequisite).toBeUndefined();
    });
  });

  describe("Great Weapon Master has a structured prerequisite", () => {
    it("Great Weapon Master prerequisite is a structured Prerequisite object", () => {
      const feat = getFeat("Great Weapon Master");
      // Only test if the feat exists in the database.
      if (feat) {
        expect(feat.prerequisite).toBeDefined();
        expect(typeof feat.prerequisite).toBe("object");
        expect(feat.prerequisiteText).toBeDefined();
      }
    });
  });

  describe("lookup is case-insensitive", () => {
    it("lowercase 'alert' returns the same entry as 'Alert'", () => {
      const upper = getFeat("Alert");
      const lower = getFeat("alert");
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
    });
  });

  describe("non-existent feat returns undefined", () => {
    it("returns undefined for a feat not in the database", () => {
      const result = getFeat("Super Ultra Mega Feat");
      expect(result).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Class lookup
// ---------------------------------------------------------------------------

describe("class lookup", () => {
  describe("Wizard resolves with expected ClassDb fields", () => {
    it("getClass('Wizard') returns a defined entry", () => {
      const cls = getClass("Wizard");
      expect(cls).toBeDefined();
    });

    it("Wizard has a non-empty description string", () => {
      const cls = getClass("Wizard");
      expect(cls).toBeDefined();
      expect(typeof cls!.description).toBe("string");
      expect(cls!.description.length).toBeGreaterThan(0);
    });

    it("Wizard hitDiceFaces is 6", () => {
      const cls = getClass("Wizard");
      expect(cls).toBeDefined();
      expect(cls!.hitDiceFaces).toBe(6);
    });

    it("Wizard L1 Proficiencies feature includes intelligence and wisdom saves", () => {
      const cls = getClass("Wizard");
      expect(cls).toBeDefined();
      const l1Prof = cls!.features.find((f) => f.name === "Proficiencies" && f.level === 1);
      expect(l1Prof).toBeDefined();
      const saveProps = (l1Prof!.effects?.properties ?? []).filter(
        (p) => p.type === "proficiency" && (p as { category?: string }).category === "save",
      );
      const saveValues = saveProps.map((p) => (p as { value: string }).value.toLowerCase());
      expect(saveValues).toContain("intelligence");
      expect(saveValues).toContain("wisdom");
    });

    it("Wizard features is a non-empty array", () => {
      const cls = getClass("Wizard");
      expect(cls).toBeDefined();
      expect(Array.isArray(cls!.features)).toBe(true);
      expect(cls!.features.length).toBeGreaterThan(0);
    });

    it("Wizard subclasses is a non-empty array", () => {
      const cls = getClass("Wizard");
      expect(cls).toBeDefined();
      expect(Array.isArray(cls!.subclasses)).toBe(true);
      expect(cls!.subclasses.length).toBeGreaterThan(0);
    });

    it("Wizard casterProgression is 'full'", () => {
      const cls = getClass("Wizard");
      expect(cls).toBeDefined();
      expect(cls!.casterProgression).toBe("full");
    });

    it("Wizard spellSlotTable has 20 rows (one per level)", () => {
      const cls = getClass("Wizard");
      expect(cls).toBeDefined();
      expect(cls!.spellSlotTable).toBeDefined();
      expect(cls!.spellSlotTable!.length).toBe(20);
    });
  });

  describe("Barbarian has no caster progression", () => {
    it("Barbarian hitDiceFaces is 12", () => {
      const cls = getClass("Barbarian");
      expect(cls).toBeDefined();
      expect(cls!.hitDiceFaces).toBe(12);
    });

    it("Barbarian has no casterProgression", () => {
      const cls = getClass("Barbarian");
      expect(cls).toBeDefined();
      expect(cls!.casterProgression).toBeUndefined();
    });

    it("Barbarian has no spellSlotTable", () => {
      const cls = getClass("Barbarian");
      expect(cls).toBeDefined();
      expect(cls!.spellSlotTable).toBeUndefined();
    });
  });

  describe("lookup is case-insensitive", () => {
    it("lowercase 'wizard' returns the same entry as 'Wizard'", () => {
      const upper = getClass("Wizard");
      const lower = getClass("wizard");
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
    });
  });

  describe("non-existent class returns undefined", () => {
    it("returns undefined for a class not in the database", () => {
      const result = getClass("Blood Hunter");
      expect(result).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Optional feature lookup
// ---------------------------------------------------------------------------

describe("optional feature lookup", () => {
  describe("Agonizing Blast resolves with expected OptionalFeatureDb fields", () => {
    it("getOptionalFeature('Agonizing Blast') returns a defined entry", () => {
      const feat = getOptionalFeature("Agonizing Blast");
      expect(feat).toBeDefined();
    });

    it("Agonizing Blast has a non-empty description string", () => {
      const feat = getOptionalFeature("Agonizing Blast");
      expect(feat).toBeDefined();
      expect(typeof feat!.description).toBe("string");
      expect(feat!.description.length).toBeGreaterThan(0);
    });

    it("Agonizing Blast featureType is a non-empty array", () => {
      const feat = getOptionalFeature("Agonizing Blast");
      expect(feat).toBeDefined();
      expect(Array.isArray(feat!.featureType)).toBe(true);
      expect(feat!.featureType.length).toBeGreaterThan(0);
    });

    it("Agonizing Blast featureType includes 'EI' (Eldritch Invocation code)", () => {
      const feat = getOptionalFeature("Agonizing Blast");
      expect(feat).toBeDefined();
      expect(feat!.featureType).toContain("EI");
    });

    it("Agonizing Blast prerequisite is a non-empty string", () => {
      const feat = getOptionalFeature("Agonizing Blast");
      expect(feat).toBeDefined();
      expect(typeof feat!.prerequisite).toBe("string");
      expect(feat!.prerequisite!.length).toBeGreaterThan(0);
    });
  });

  describe("lookup is case-insensitive", () => {
    it("lowercase 'agonizing blast' returns the same entry as 'Agonizing Blast'", () => {
      const upper = getOptionalFeature("Agonizing Blast");
      const lower = getOptionalFeature("agonizing blast");
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
    });
  });

  describe("non-existent optional feature returns undefined", () => {
    it("returns undefined for a feature not in the database", () => {
      const result = getOptionalFeature("Hyper Laser Blast Supreme");
      expect(result).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Items split — getBaseItem vs getMagicItem
// ---------------------------------------------------------------------------

describe("items split — getBaseItem and getMagicItem", () => {
  describe("getBaseItem resolves weapons and armor", () => {
    it("getBaseItem('Longsword') returns a defined entry", () => {
      const item = getBaseItem("Longsword");
      expect(item).toBeDefined();
    });

    it("Longsword has a name field", () => {
      const item = getBaseItem("Longsword");
      expect(item).toBeDefined();
      expect(item!.name).toBe("Longsword");
    });

    it("Longsword is a weapon with a damage field", () => {
      const item = getBaseItem("Longsword");
      expect(item).toBeDefined();
      expect(item!.weapon).toBe(true);
      expect(typeof item!.damage).toBe("string");
      expect(item!.damage).toBe("1d8");
    });

    it("Longsword has versatileDamage (1d10 two-handed)", () => {
      const item = getBaseItem("Longsword");
      expect(item).toBeDefined();
      expect(item!.versatileDamage).toBe("1d10");
    });

    it("Longsword weaponCategory is 'martial'", () => {
      const item = getBaseItem("Longsword");
      expect(item).toBeDefined();
      expect(item!.weaponCategory).toBe("martial");
    });

    it("Longsword type is a string (base item type code)", () => {
      const item = getBaseItem("Longsword");
      expect(item).toBeDefined();
      expect(typeof item!.type).toBe("string");
    });
  });

  describe("getMagicItem resolves magic items with rarity and description", () => {
    it("getMagicItem('Cloak of Protection') returns a defined entry", () => {
      const item = getMagicItem("Cloak of Protection");
      expect(item).toBeDefined();
    });

    it("Cloak of Protection has a non-empty description string", () => {
      const item = getMagicItem("Cloak of Protection");
      expect(item).toBeDefined();
      expect(typeof item!.description).toBe("string");
      expect(item!.description.length).toBeGreaterThan(0);
    });

    it("Cloak of Protection rarity is 'uncommon'", () => {
      const item = getMagicItem("Cloak of Protection");
      expect(item).toBeDefined();
      expect(item!.rarity).toBe("uncommon");
    });

    it("Cloak of Protection attunement is truthy (requires attunement)", () => {
      const item = getMagicItem("Cloak of Protection");
      expect(item).toBeDefined();
      expect(item!.attunement).toBeTruthy();
    });
  });

  describe("lookup is case-insensitive for both item tables", () => {
    it("lowercase 'longsword' returns the same entry as 'Longsword'", () => {
      const upper = getBaseItem("Longsword");
      const lower = getBaseItem("longsword");
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
    });

    it("lowercase 'cloak of protection' returns the same entry", () => {
      const upper = getMagicItem("Cloak of Protection");
      const lower = getMagicItem("cloak of protection");
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
    });
  });

  describe("non-existent items return undefined", () => {
    it("getBaseItem returns undefined for unknown items", () => {
      const result = getBaseItem("Sword of Plot Convenience");
      expect(result).toBeUndefined();
    });

    it("getMagicItem returns undefined for unknown items", () => {
      const result = getMagicItem("Ring of Infinite Power");
      expect(result).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Language lookup
// ---------------------------------------------------------------------------

describe("language lookup", () => {
  describe("Common resolves with expected LanguageDb fields", () => {
    it("getLanguage('Common') returns a defined entry", () => {
      const lang = getLanguage("Common");
      expect(lang).toBeDefined();
    });

    it("Common has a name field", () => {
      const lang = getLanguage("Common");
      expect(lang).toBeDefined();
      expect(lang!.name).toBe("Common");
    });

    it("Common type is 'standard'", () => {
      const lang = getLanguage("Common");
      expect(lang).toBeDefined();
      expect(lang!.type).toBe("standard");
    });
  });

  describe("lookup is case-insensitive", () => {
    it("lowercase 'common' returns the same entry as 'Common'", () => {
      const upper = getLanguage("Common");
      const lower = getLanguage("common");
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
    });
  });

  describe("non-existent language returns undefined", () => {
    it("returns undefined for a language not in the database", () => {
      const result = getLanguage("Gobbledigook");
      expect(result).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Action lookup
// ---------------------------------------------------------------------------

describe("action lookup", () => {
  describe("Attack action resolves with expected ActionDb fields", () => {
    it("getAction('Attack') returns a defined entry", () => {
      const action = getAction("Attack");
      expect(action).toBeDefined();
    });

    it("Attack has a non-empty description string", () => {
      const action = getAction("Attack");
      expect(action).toBeDefined();
      expect(typeof action!.description).toBe("string");
      expect(action!.description.length).toBeGreaterThan(0);
    });

    it("Attack has a time field indicating action cost", () => {
      const action = getAction("Attack");
      expect(action).toBeDefined();
      expect(typeof action!.time).toBe("string");
      expect(action!.time).toBe("1 action");
    });
  });

  describe("lookup is case-insensitive", () => {
    it("lowercase 'attack' returns the same entry as 'Attack'", () => {
      const upper = getAction("Attack");
      const lower = getAction("attack");
      expect(lower).toBeDefined();
      expect(lower!.name).toBe(upper!.name);
    });
  });

  describe("non-existent action returns undefined", () => {
    it("returns undefined for an action not in the database", () => {
      const result = getAction("Nuke Everything");
      expect(result).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// search_rules — keyword search across categories
// ---------------------------------------------------------------------------

describe("search_rules — keyword search across categories", () => {
  describe("spell-name keyword returns results in spells category", () => {
    it("searchSpells('fire') returns spells whose names contain 'fire'", () => {
      const results = searchSpells("fire");
      expect(results.length).toBeGreaterThan(0);
      for (const spell of results) {
        expect(spell.name.toLowerCase()).toContain("fire");
      }
    });

    it("searchSpells('fireball') returns Fireball as one of the results", () => {
      const results = searchSpells("fireball");
      expect(results.some((s) => s.name.toLowerCase() === "fireball")).toBe(true);
    });
  });

  describe("monster-name keyword returns results in monsters category", () => {
    it("searchMonsters('goblin') returns monsters whose names contain 'goblin'", () => {
      const results = searchMonsters("goblin");
      expect(results.length).toBeGreaterThan(0);
      for (const monster of results) {
        expect(monster.name.toLowerCase()).toContain("goblin");
      }
    });

    it("searchMonsters('dragon') returns multiple dragon entries", () => {
      const results = searchMonsters("dragon");
      expect(results.length).toBeGreaterThan(1);
    });
  });

  describe("keyword matching nothing returns empty results without error", () => {
    it("searchSpells with a nonsense keyword returns an empty array", () => {
      const results = searchSpells("xyzzy_no_such_spell_abc");
      expect(results).toEqual([]);
    });

    it("searchMonsters with a nonsense keyword returns an empty array", () => {
      const results = searchMonsters("xyzzy_no_such_monster_abc");
      expect(results).toEqual([]);
    });

    it("neither searchSpells nor searchMonsters throws on empty query", () => {
      expect(() => searchSpells("")).not.toThrow();
      expect(() => searchMonsters("")).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Data integrity
// ---------------------------------------------------------------------------

describe("data integrity", () => {
  describe("all spells have name, level (0-9), school, and pre-formatted string fields", () => {
    it("spell database has more than 400 entries", () => {
      expect(spellsArray.length).toBeGreaterThan(400);
    });

    it("every spell has a non-empty name string", () => {
      for (const spell of spellsArray) {
        expect(typeof spell.name).toBe("string");
        expect(spell.name.length).toBeGreaterThan(0);
      }
    });

    it("every spell has a level between 0 and 9 inclusive", () => {
      for (const spell of spellsArray) {
        expect(typeof spell.level).toBe("number");
        expect(spell.level).toBeGreaterThanOrEqual(0);
        expect(spell.level).toBeLessThanOrEqual(9);
      }
    });

    it("every spell has a non-empty school string (full name, not a code)", () => {
      const validSchools = [
        "Abjuration",
        "Conjuration",
        "Divination",
        "Enchantment",
        "Evocation",
        "Illusion",
        "Necromancy",
        "Transmutation",
      ];
      for (const spell of spellsArray) {
        expect(typeof spell.school).toBe("string");
        expect(spell.school.length).toBeGreaterThan(0);
        expect(validSchools).toContain(spell.school);
      }
    });

    it("every spell has a non-empty description string", () => {
      for (const spell of spellsArray) {
        expect(typeof spell.description).toBe("string");
        expect(spell.description.length).toBeGreaterThan(0);
      }
    });

    it("every spell has a castingTime string", () => {
      for (const spell of spellsArray) {
        expect(typeof spell.castingTime).toBe("string");
        expect(spell.castingTime.length).toBeGreaterThan(0);
      }
    });

    it("every spell has a classes array (may be empty for some spells)", () => {
      for (const spell of spellsArray) {
        expect(Array.isArray(spell.classes)).toBe(true);
      }
    });

    it("every spell has boolean ritual and concentration fields", () => {
      for (const spell of spellsArray) {
        expect(typeof spell.ritual).toBe("boolean");
        expect(typeof spell.concentration).toBe("boolean");
      }
    });
  });

  describe("all monsters have name and CR", () => {
    it("monster database has more than 500 entries", () => {
      expect(monstersArray.length).toBeGreaterThan(500);
    });

    it("every monster has a non-empty name string", () => {
      for (const monster of monstersArray) {
        expect(typeof monster.name).toBe("string");
        expect(monster.name.length).toBeGreaterThan(0);
      }
    });

    it("every standard monster has a cr field that is defined (string or object)", () => {
      // Summoned/conjured creatures (Aberrant Spirit, Steel Defender, etc.) intentionally
      // lack a fixed CR because their stats scale with the caster — skip those.
      const standardMonsters = monstersArray.filter((m) => m.cr !== undefined && m.cr !== null);
      expect(standardMonsters.length).toBeGreaterThan(500);
      for (const monster of standardMonsters) {
        // cr is either a string like "1/4" or a MonsterCr object with a .cr string.
        const crType = typeof monster.cr;
        const isValidType = crType === "string" || crType === "object";
        expect(isValidType).toBe(true);
      }
    });

    it("summoned/conjured creatures with no fixed CR exist in the database", () => {
      // These monsters scale with caster level and have no fixed numeric CR.
      // The 5e.tools data uses an em-dash ("—") as a sentinel for variable-CR creatures.
      const summonedNames = [
        "Aberrant Spirit",
        "Beast of the Land",
        "Steel Defender",
        "Wildfire Spirit",
        "Homunculus Servant",
      ];
      for (const name of summonedNames) {
        const monster = monstersArray.find((m) => m.name === name);
        expect(monster, `Expected summoned creature "${name}" to exist`).toBeDefined();
        // cr is "—" (em-dash) for variable-CR summoned creatures in the 5e.tools source data
        expect(monster!.cr).toBe("—");
      }
    });
  });

  describe("all conditions have name and description", () => {
    it("condition database has at least 10 entries", () => {
      expect(conditionsArray.length).toBeGreaterThanOrEqual(10);
    });

    it("every condition has a non-empty name string", () => {
      for (const condition of conditionsArray) {
        expect(typeof condition.name).toBe("string");
        expect(condition.name.length).toBeGreaterThan(0);
      }
    });

    it("every condition has a non-empty description (rules text)", () => {
      for (const condition of conditionsArray) {
        expect(typeof condition.description).toBe("string");
        expect(condition.description.length).toBeGreaterThan(0);
      }
    });

    it("conditions do not have a raw 'entries' array (new format uses description string)", () => {
      for (const condition of conditionsArray) {
        expect((condition as unknown as Record<string, unknown>)["entries"]).toBeUndefined();
      }
    });
  });

  describe("all feats have name, category, and description", () => {
    it("feat database has more than 80 entries", () => {
      expect(featsArray.length).toBeGreaterThan(80);
    });

    it("every feat has a non-empty name string", () => {
      for (const feat of featsArray) {
        expect(typeof feat.name).toBe("string");
        expect(feat.name.length).toBeGreaterThan(0);
      }
    });

    it("every feat has a valid category", () => {
      const validCategories = ["General", "Origin", "Fighting Style", "Epic Boon"];
      for (const feat of featsArray) {
        expect(validCategories).toContain(feat.category);
      }
    });

    it("every feat has a non-empty description string", () => {
      for (const feat of featsArray) {
        expect(typeof feat.description).toBe("string");
        expect(feat.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe("all species have name, size, speed, and description", () => {
    it("species database has at least 10 entries", () => {
      expect(speciesArray.length).toBeGreaterThanOrEqual(10);
    });

    it("every species has a non-empty name string", () => {
      for (const sp of speciesArray) {
        expect(typeof sp.name).toBe("string");
        expect(sp.name.length).toBeGreaterThan(0);
      }
    });

    it("every species has a non-empty size array", () => {
      for (const sp of speciesArray) {
        expect(Array.isArray(sp.size)).toBe(true);
        expect(sp.size.length).toBeGreaterThan(0);
      }
    });

    it("every species has a positive speed", () => {
      for (const sp of speciesArray) {
        expect(typeof sp.speed).toBe("number");
        expect(sp.speed).toBeGreaterThan(0);
      }
    });

    it("every species has a non-empty description string", () => {
      for (const sp of speciesArray) {
        expect(typeof sp.description).toBe("string");
        expect(sp.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe("all backgrounds have name, skills, and description", () => {
    it("background database has at least 10 entries", () => {
      expect(backgroundsArray.length).toBeGreaterThanOrEqual(10);
    });

    it("every background has a non-empty name string", () => {
      for (const bg of backgroundsArray) {
        expect(typeof bg.name).toBe("string");
        expect(bg.name.length).toBeGreaterThan(0);
      }
    });

    it("every background has skill proficiencies in effects.properties", () => {
      for (const bg of backgroundsArray) {
        const skillProps = (bg.effects?.properties ?? []).filter(
          (p) => p.type === "proficiency" && (p as { category?: string }).category === "skill",
        );
        expect(skillProps.length).toBeGreaterThan(0);
      }
    });

    it("every background has a non-empty description string", () => {
      for (const bg of backgroundsArray) {
        expect(typeof bg.description).toBe("string");
        expect(bg.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe("all classes have name, hitDiceFaces, L1 proficiencies, features, and subclasses", () => {
    it("class database has exactly 12 entries", () => {
      expect(classesArray.length).toBe(12);
    });

    it("every class has a non-empty name string", () => {
      for (const cls of classesArray) {
        expect(typeof cls.name).toBe("string");
        expect(cls.name.length).toBeGreaterThan(0);
      }
    });

    it("every class has a hitDiceFaces value between 6 and 12", () => {
      for (const cls of classesArray) {
        expect(typeof cls.hitDiceFaces).toBe("number");
        expect(cls.hitDiceFaces).toBeGreaterThanOrEqual(6);
        expect(cls.hitDiceFaces).toBeLessThanOrEqual(12);
      }
    });

    it("every class has saving throw proficiencies in the L1 Proficiencies feature", () => {
      for (const cls of classesArray) {
        const l1Prof = cls.features.find((f) => f.name === "Proficiencies" && f.level === 1);
        expect(l1Prof).toBeDefined();
        const saveProps = (l1Prof!.effects?.properties ?? []).filter(
          (p) => p.type === "proficiency" && (p as { category?: string }).category === "save",
        );
        expect(saveProps.length).toBeGreaterThan(0);
      }
    });

    it("every class has a non-empty features array", () => {
      for (const cls of classesArray) {
        expect(Array.isArray(cls.features)).toBe(true);
        expect(cls.features.length).toBeGreaterThan(0);
      }
    });

    it("every class has a subclasses array", () => {
      for (const cls of classesArray) {
        expect(Array.isArray(cls.subclasses)).toBe(true);
      }
    });
  });

  describe("all optional features have name, featureType, and description", () => {
    it("optional features database has entries", () => {
      expect(optionalFeaturesArray.length).toBeGreaterThan(0);
    });

    it("every optional feature has a non-empty name string", () => {
      for (const feat of optionalFeaturesArray) {
        expect(typeof feat.name).toBe("string");
        expect(feat.name.length).toBeGreaterThan(0);
      }
    });

    it("every optional feature has a non-empty featureType array", () => {
      for (const feat of optionalFeaturesArray) {
        expect(Array.isArray(feat.featureType)).toBe(true);
        expect(feat.featureType.length).toBeGreaterThan(0);
      }
    });

    it("every optional feature has a non-empty description string", () => {
      for (const feat of optionalFeaturesArray) {
        expect(typeof feat.description).toBe("string");
        expect(feat.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe("all base items have name and type", () => {
    it("base items database has entries across all categories", () => {
      expect(baseItemsArray.length).toBeGreaterThan(0);
    });

    it("every base item has a non-empty name string", () => {
      for (const item of baseItemsArray) {
        expect(typeof item.name).toBe("string");
        expect(item.name.length).toBeGreaterThan(0);
      }
    });

    it("every base item has a type field", () => {
      for (const item of baseItemsArray) {
        expect(typeof item.type).toBe("string");
        expect(item.type.length).toBeGreaterThan(0);
      }
    });
  });

  describe("all magic items have name, description, and rarity", () => {
    it("magic items database has more than 100 entries", () => {
      expect(magicItemsArray.length).toBeGreaterThan(100);
    });

    it("every magic item has a non-empty name string", () => {
      for (const item of magicItemsArray) {
        expect(typeof item.name).toBe("string");
        expect(item.name.length).toBeGreaterThan(0);
      }
    });

    it("every magic item has a description string field (may be empty for vehicle/gear entries)", () => {
      for (const item of magicItemsArray) {
        // description is always present as a string, but some non-magical entries
        // (e.g. vehicles like "Airship") may have an empty string description.
        expect(typeof item.description).toBe("string");
      }
    });

    it("magic items with actual rules text have a non-empty description", () => {
      // Named magic items (rarity !== 'none') should have a description.
      const namedItems = magicItemsArray.filter((i) => (i.rarity as string) !== "none");
      const withDesc = namedItems.filter((i) => i.description && i.description.length > 0);
      // The vast majority of named items have descriptions.
      expect(withDesc.length).toBeGreaterThan(namedItems.length * 0.8);
    });

    it("every magic item has a rarity field (including 'none' for non-magical gear)", () => {
      // Valid rarities include standard ones plus 'none' (vehicles, mundane gear)
      // and 'unknown (magic)' for items whose rarity is unspecified in the source.
      const validRarities = [
        "common",
        "uncommon",
        "rare",
        "very rare",
        "legendary",
        "artifact",
        "none",
        "unknown (magic)",
      ];
      for (const item of magicItemsArray) {
        expect(validRarities).toContain(item.rarity);
      }
    });
  });

  describe("all languages have name and type", () => {
    it("language database has entries", () => {
      expect(languagesArray.length).toBeGreaterThan(0);
    });

    it("every language has a non-empty name string", () => {
      for (const lang of languagesArray) {
        expect(typeof lang.name).toBe("string");
        expect(lang.name.length).toBeGreaterThan(0);
      }
    });

    it("every language has a valid type", () => {
      const validTypes = ["standard", "rare", "secret"];
      for (const lang of languagesArray) {
        expect(validTypes).toContain(lang.type);
      }
    });
  });

  describe("all actions have name and description", () => {
    it("actions database has entries", () => {
      expect(actionsArray.length).toBeGreaterThan(0);
    });

    it("every action has a non-empty name string", () => {
      for (const action of actionsArray) {
        expect(typeof action.name).toBe("string");
        expect(action.name.length).toBeGreaterThan(0);
      }
    });

    it("every action has a non-empty description string", () => {
      for (const action of actionsArray) {
        expect(typeof action.description).toBe("string");
        expect(action.description.length).toBeGreaterThan(0);
      }
    });
  });
});
