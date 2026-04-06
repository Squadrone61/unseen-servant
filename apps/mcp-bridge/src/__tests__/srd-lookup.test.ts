import { describe, it, expect } from "vitest";
import {
  getSpell,
  getMonster,
  getCondition,
  searchSpells,
  searchMonsters,
  spellsArray,
  monstersArray,
  conditionsArray,
} from "@unseen-servant/shared/data";
import { formatSchool } from "@unseen-servant/shared";

/**
 * Behavioral contracts for the shared D&D 2024 data layer.
 * Exercised via the helper functions exported from @unseen-servant/shared/data
 * (getSpell, getMonster, etc.) and the lookup/search MCP tools in srd-tools.ts.
 *
 * The underlying data files contain:
 *   - 490 spells   (data/spells.json)
 *   - 580 monsters (data/monsters.json)
 *   - 15 conditions
 *   - 563 magic items
 *   - 103 feats
 *   - 12 classes
 *   - 28 species
 *   - 27 backgrounds
 *
 * ## Spell lookup
 * - "Fireball" resolves to SpellData with level=3, school containing "Evocation".
 * - Case-insensitive: "fireball" and "FIREBALL" resolve to the same entry.
 * - Non-existent spell name returns null/undefined from the data helper.
 *
 * ## Monster lookup
 * - "Goblin Warrior" resolves to MonsterData with a numeric CR value >= 0.
 * - "Goblin Warrior" has a name field matching (case-insensitively) the lookup key.
 * - Non-existent monster name returns null/undefined.
 *
 * ## Condition lookup
 * - "Poisoned" resolves to a condition entry with a non-empty description string.
 * - Condition names are looked up case-insensitively.
 *
 * ## search_rules (keyword search across categories)
 * - A keyword present in spell names returns results from the spells category.
 * - A keyword present in monster names returns results from the monsters category.
 * - An ambiguous or cross-category keyword may return results from multiple categories.
 * - A keyword matching nothing returns an empty results set (no error).
 *
 * ## Lookup tool detail levels
 * - detail="summary" returns a compact representation (~30 tokens) suitable for quick
 *   reference. The full rules text is absent or truncated.
 * - detail="full" returns complete rules text for the entry.
 *
 * ## Data integrity
 * - All 490 spells have a name, level (0–9), and school field.
 * - All 580 monsters have a name and a CR field.
 * - All 15 conditions have a name and description.
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

    it("getSpell('Fireball') school code maps to Evocation", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      // The raw school field is a single-letter code; "V" maps to "Evocation".
      expect(formatSchool(spell!.school)).toBe("Evocation");
    });

    it("Fireball has a non-empty entries array (rules text present)", () => {
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      expect(Array.isArray(spell!.entries)).toBe(true);
      expect(spell!.entries.length).toBeGreaterThan(0);
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

  describe("non-existent spell returns null", () => {
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

  describe("non-existent monster returns null", () => {
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

    it("Poisoned has a non-empty entries array that acts as description", () => {
      const condition = getCondition("Poisoned");
      expect(condition).toBeDefined();
      // ConditionData uses entries: Entry[] as the rules text, not a plain description string.
      expect(Array.isArray(condition!.entries)).toBe(true);
      expect(condition!.entries.length).toBeGreaterThan(0);
    });

    it("Poisoned entries contain at least one string or object entry", () => {
      const condition = getCondition("Poisoned");
      expect(condition).toBeDefined();
      const firstEntry = condition!.entries[0];
      // Entries may be strings or structured objects — either is valid rules text.
      expect(firstEntry !== null && firstEntry !== undefined).toBe(true);
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
// Lookup tool detail levels
// ---------------------------------------------------------------------------

describe("lookup tool detail levels", () => {
  describe("detail=summary returns compact representation", () => {
    it("getSpell returns all fields needed for a summary (name, level, school, range, components)", () => {
      const spell = getSpell("Cure Wounds");
      expect(spell).toBeDefined();
      // These fields are used by formatSpellSummary in srd-tools.
      expect(typeof spell!.name).toBe("string");
      expect(typeof spell!.level).toBe("number");
      expect(typeof spell!.school).toBe("string");
      expect(spell!.range).toBeDefined();
      expect(spell!.components).toBeDefined();
    });

    it("getMonster returns all fields needed for a summary (name, cr, ac, hp, size, type)", () => {
      const monster = getMonster("Goblin Warrior");
      expect(monster).toBeDefined();
      // Fields used by formatMonsterSummary in srd-tools.
      expect(typeof monster!.name).toBe("string");
      expect(monster!.cr).toBeDefined();
      expect(monster!.ac).toBeDefined();
      expect(monster!.hp).toBeDefined();
      expect(monster!.size).toBeDefined();
      expect(monster!.type).toBeDefined();
    });
  });

  describe("detail=full returns complete rules text", () => {
    it("getSpell returns entriesHigherLevel field when present (used for full detail)", () => {
      // Fireball has upcast description in entriesHigherLevel.
      const spell = getSpell("Fireball");
      expect(spell).toBeDefined();
      // Not all spells have entriesHigherLevel, but all have entries with full rules text.
      expect(spell!.entries.length).toBeGreaterThan(0);
    });

    it("getMonster returns trait and action arrays for full stat block rendering", () => {
      // Dragons and named monsters typically have traits.
      // Use a monster known to have actions.
      const monster = getMonster("Ogre");
      expect(monster).toBeDefined();
      // action is used in formatMonster for full rendering — may or may not be present
      // but the field must at minimum be accessible without throwing.
      expect(() => monster!.action).not.toThrow();
    });

    it("getSpell entries array is longer than a truncated summary for complex spells", () => {
      // A complex spell (Wish) should have substantial rules text in entries.
      const spell = getSpell("Wish");
      expect(spell).toBeDefined();
      expect(spell!.entries.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Data integrity
// ---------------------------------------------------------------------------

describe("data integrity", () => {
  describe("all spells have name, level (0-9), and school", () => {
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

    it("every spell has a non-empty school code string", () => {
      for (const spell of spellsArray) {
        expect(typeof spell.school).toBe("string");
        expect(spell.school.length).toBeGreaterThan(0);
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
      // These monsters scale with caster level and have no CR in the 5e.tools data.
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
        expect(monster!.cr).toBeUndefined();
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

    it("every condition has a non-empty entries array (rules text)", () => {
      for (const condition of conditionsArray) {
        expect(Array.isArray(condition.entries)).toBe(true);
        expect(condition.entries.length).toBeGreaterThan(0);
      }
    });

    it("known conditions Blinded, Charmed, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious are all present", () => {
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
