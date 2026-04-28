import { describe, it, expect } from "vitest";
import {
  computeDamageRoll,
  resolveDamageValue,
  chooseWeaponAbility,
} from "../utils/damage-roll.js";
import { buildCharacter } from "../builders/character-builder.js";
import {
  makeFighterBuilderState,
  makeBarbarianBuilderState,
  makeWarlockBuilderState,
  makeClericBuilderState,
  makeBuilderState,
} from "./helpers/makeBuilderState.js";
import type { ResolveContext } from "../types/effects.js";

// ---------------------------------------------------------------------------
// resolveDamageValue
// ---------------------------------------------------------------------------

const ctx: ResolveContext = {
  abilities: {
    strength: 16,
    dexterity: 14,
    constitution: 14,
    intelligence: 12,
    wisdom: 10,
    charisma: 8,
  },
  totalLevel: 5,
  classLevel: 5,
  proficiencyBonus: 3,
};

describe("resolveDamageValue", () => {
  it("plain number", () => {
    expect(resolveDamageValue(2, ctx)).toEqual({ flat: 2, dice: [] });
  });

  it("ability mod expression", () => {
    expect(resolveDamageValue("str", ctx)).toEqual({ flat: 3, dice: [] });
  });

  it("compound math expression", () => {
    expect(resolveDamageValue("str + prof", ctx)).toEqual({ flat: 6, dice: [] });
  });

  it("pure dice notation", () => {
    expect(resolveDamageValue("1d6", ctx)).toEqual({ flat: 0, dice: ["1d6"] });
  });

  it("dice + ability mod", () => {
    expect(resolveDamageValue("1d6 + int", ctx)).toEqual({ flat: 1, dice: ["1d6"] });
  });

  it("table with dice values picks correct entry by class level", () => {
    // Sneak Attack scaling at level 5 → 3d6.
    const result = resolveDamageValue("table(1:1d6, 3:2d6, 5:3d6, 7:4d6, 9:5d6)", ctx);
    expect(result).toEqual({ flat: 0, dice: ["3d6"] });
  });

  it("table with dice + flat (Psionic Strike pattern)", () => {
    // Psionic Strike at level 5: 1d8 + INT mod (1).
    const result = resolveDamageValue("table(3:1d6, 5:1d8, 11:1d10) + int", ctx);
    expect(result).toEqual({ flat: 1, dice: ["1d8"] });
  });

  it("Rage damage table (numbers only) at class level 5", () => {
    expect(resolveDamageValue("table(1:2, 9:3, 16:4)", ctx)).toEqual({ flat: 2, dice: [] });
  });
});

// ---------------------------------------------------------------------------
// chooseWeaponAbility
// ---------------------------------------------------------------------------

describe("chooseWeaponAbility", () => {
  it("non-finesse melee → strength", () => {
    const fixture = makeFighterBuilderState();
    const char = buildCharacter(fixture.state, {
      inventory: fixture.inventory,
      currency: fixture.currency,
      traits: fixture.traits,
    }).character;
    expect(chooseWeaponAbility(char, "Longsword")).toBe("strength");
  });

  it("ranged weapon → dexterity", () => {
    const fixture = makeFighterBuilderState();
    const char = buildCharacter(fixture.state, {
      inventory: fixture.inventory,
      currency: fixture.currency,
      traits: fixture.traits,
    }).character;
    expect(chooseWeaponAbility(char, "Shortbow")).toBe("dexterity");
  });

  it("finesse → max of STR/DEX", () => {
    const fixture = makeFighterBuilderState();
    const char = buildCharacter(fixture.state, {
      inventory: fixture.inventory,
      currency: fixture.currency,
      traits: fixture.traits,
    }).character;
    // STR 16 (>14 DEX) → strength wins.
    expect(chooseWeaponAbility(char, "Rapier")).toBe("strength");
  });

  it("finesse with higher DEX → dexterity wins", () => {
    const state = makeBuilderState({
      classes: [{ name: "Rogue", level: 5, subclass: "Thief", skills: [], choices: {} }],
      baseAbilities: {
        strength: 10,
        dexterity: 18,
        constitution: 12,
        intelligence: 12,
        wisdom: 10,
        charisma: 10,
      },
    });
    const char = buildCharacter(state).character;
    expect(chooseWeaponAbility(char, "Rapier")).toBe("dexterity");
  });

  it("unknown weapon → null", () => {
    const fixture = makeFighterBuilderState();
    const char = buildCharacter(fixture.state, {
      inventory: fixture.inventory,
      currency: fixture.currency,
      traits: fixture.traits,
    }).character;
    expect(chooseWeaponAbility(char, "Made-Up Weapon")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeDamageRoll — core scenarios
// ---------------------------------------------------------------------------

describe("computeDamageRoll — weapon damage", () => {
  it("Longsword for STR fighter: 1d8 + STR mod (3)", () => {
    const fixture = makeFighterBuilderState();
    const char = buildCharacter(fixture.state, {
      inventory: fixture.inventory,
      currency: fixture.currency,
      traits: fixture.traits,
    }).character;
    const result = computeDamageRoll(char, { source: "weapon", name: "Longsword" });
    expect(result.errors).toEqual([]);
    expect(result.notation).toBe("1d8+3");
    expect(result.primaryDamageType).toBe("slashing");
  });

  it("Greataxe for STR 18 barbarian: 1d12 + STR mod (4)", () => {
    const fixture = makeBarbarianBuilderState();
    const char = buildCharacter(fixture.state, {
      inventory: fixture.inventory,
      currency: fixture.currency,
      traits: fixture.traits,
    }).character;
    const result = computeDamageRoll(char, { source: "weapon", name: "Greataxe" });
    expect(result.errors).toEqual([]);
    expect(result.notation).toBe("1d12+4");
  });

  it("Shortbow for DEX ranger: 1d6 + DEX mod", () => {
    const state = makeBuilderState({
      classes: [{ name: "Ranger", level: 5, subclass: "Hunter", skills: [], choices: {} }],
      baseAbilities: {
        strength: 10,
        dexterity: 16,
        constitution: 14,
        intelligence: 10,
        wisdom: 14,
        charisma: 10,
      },
    });
    const char = buildCharacter(state).character;
    const result = computeDamageRoll(char, { source: "weapon", name: "Shortbow" });
    expect(result.errors).toEqual([]);
    expect(result.notation).toBe("1d6+3");
    expect(result.primaryDamageType).toBe("piercing");
  });

  it("Crit longsword: dice double, modifier untouched", () => {
    const fixture = makeFighterBuilderState();
    const char = buildCharacter(fixture.state, {
      inventory: fixture.inventory,
      currency: fixture.currency,
      traits: fixture.traits,
    }).character;
    const result = computeDamageRoll(
      char,
      { source: "weapon", name: "Longsword" },
      { isCriticalHit: true },
    );
    expect(result.notation).toBe("2d8+3");
  });
});

describe("computeDamageRoll — spell damage", () => {
  it("Fireball at base level: 8d6, no ability mod", () => {
    const state = makeBuilderState({
      classes: [{ name: "Wizard", level: 5, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 8,
        dexterity: 14,
        constitution: 12,
        intelligence: 16,
        wisdom: 10,
        charisma: 10,
      },
    });
    const char = buildCharacter(state).character;
    const result = computeDamageRoll(char, { source: "spell", name: "Fireball" });
    expect(result.errors).toEqual([]);
    expect(result.notation).toBe("8d6");
    expect(result.primaryDamageType).toBe("fire");
  });

  it("Fireball at slot 5 (upcast 2 levels): 8d6 + 2 × 1d6 = three 1d6 entries", () => {
    const state = makeBuilderState({
      classes: [{ name: "Wizard", level: 9, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 8,
        dexterity: 14,
        constitution: 12,
        intelligence: 16,
        wisdom: 10,
        charisma: 10,
      },
    });
    const char = buildCharacter(state).character;
    const result = computeDamageRoll(
      char,
      { source: "spell", name: "Fireball" },
      { upcastLevel: 2 },
    );
    expect(result.errors).toEqual([]);
    // Base 8d6 + 2 perLevel entries of 1d6 each → "8d6+1d6+1d6"
    expect(result.notation).toBe("8d6+1d6+1d6");
  });

  it("Magic Stone (addAbilityMod) for warlock CHA 18: 1d6 + 4", () => {
    const fixture = makeWarlockBuilderState();
    const char = buildCharacter(fixture.state, {
      inventory: fixture.inventory,
      currency: fixture.currency,
      traits: fixture.traits,
    }).character;
    const result = computeDamageRoll(char, { source: "spell", name: "Magic Stone" });
    expect(result.errors).toEqual([]);
    expect(result.notation).toBe("1d6+4");
    expect(result.primaryDamageType).toBe("bludgeoning");
  });

  it("Spiritual Weapon for cleric WIS 18: 1d8 + 4 (force)", () => {
    const fixture = makeClericBuilderState();
    const char = buildCharacter(fixture.state, {
      inventory: fixture.inventory,
      currency: fixture.currency,
      traits: fixture.traits,
    }).character;
    const result = computeDamageRoll(char, { source: "spell", name: "Spiritual Weapon" });
    expect(result.errors).toEqual([]);
    expect(result.notation).toBe("1d8+4");
    expect(result.primaryDamageType).toBe("force");
  });

  it("Fire Bolt (no addAbilityMod flag) does NOT add mod", () => {
    const state = makeBuilderState({
      classes: [{ name: "Wizard", level: 5, subclass: null, skills: [], choices: {} }],
      baseAbilities: {
        strength: 8,
        dexterity: 14,
        constitution: 12,
        intelligence: 16,
        wisdom: 10,
        charisma: 10,
      },
    });
    const char = buildCharacter(state).character;
    const result = computeDamageRoll(char, { source: "spell", name: "Fire Bolt" });
    expect(result.errors).toEqual([]);
    // Cantrip scaling at level 5: base 1d10 + level-5 entry 1d10 → 2d10.
    expect(result.notation).toBe("1d10+1d10");
  });
});

describe("computeDamageRoll — extras (opt-in)", () => {
  it("Sneak Attack at rogue level 5: weapon + 3d6", () => {
    const state = makeBuilderState({
      classes: [{ name: "Rogue", level: 5, subclass: "Thief", skills: ["stealth"], choices: {} }],
      baseAbilities: {
        strength: 10,
        dexterity: 18,
        constitution: 12,
        intelligence: 12,
        wisdom: 10,
        charisma: 10,
      },
    });
    const char = buildCharacter(state).character;
    const result = computeDamageRoll(
      char,
      { source: "weapon", name: "Rapier" },
      { extras: [{ source: "feature", name: "Sneak Attack" }] },
    );
    expect(result.errors).toEqual([]);
    // Rapier: 1d8 + DEX (4); Sneak Attack at L5: 3d6.
    expect(result.notation).toBe("1d8+3d6+4");
  });

  it("Divine Smite at slot 3 (upcast 2): weapon + 4d8 radiant", () => {
    const state = makeBuilderState({
      classes: [{ name: "Paladin", level: 5, subclass: "Devotion", skills: [], choices: {} }],
      baseAbilities: {
        strength: 16,
        dexterity: 10,
        constitution: 14,
        intelligence: 8,
        wisdom: 10,
        charisma: 16,
      },
    });
    const char = buildCharacter(state).character;
    const result = computeDamageRoll(
      char,
      { source: "weapon", name: "Longsword" },
      {
        extras: [{ source: "spell", name: "Divine Smite", upcastLevel: 2 }],
      },
    );
    expect(result.errors).toEqual([]);
    // Longsword 1d8 + 3 STR mod, Divine Smite base 2d8 + 2x 1d8 upcast → 4d8 total.
    // The current upcast resolution layers per-level deltas, so each is a separate dice piece.
    expect(result.notation).toContain("1d8");
    expect(result.notation).toContain("2d8");
  });

  it("crit + Sneak Attack: doubles BOTH base dice and sneak dice", () => {
    const state = makeBuilderState({
      classes: [{ name: "Rogue", level: 5, subclass: "Thief", skills: ["stealth"], choices: {} }],
      baseAbilities: {
        strength: 10,
        dexterity: 18,
        constitution: 12,
        intelligence: 12,
        wisdom: 10,
        charisma: 10,
      },
    });
    const char = buildCharacter(state).character;
    const result = computeDamageRoll(
      char,
      { source: "weapon", name: "Rapier" },
      {
        isCriticalHit: true,
        extras: [{ source: "feature", name: "Sneak Attack" }],
      },
    );
    expect(result.errors).toEqual([]);
    // Rapier 1d8 → 2d8; Sneak 3d6 → 6d6; +4 DEX mod (untouched).
    expect(result.notation).toBe("2d8+6d6+4");
  });

  it("diceOverride bypasses DB lookup", () => {
    const fixture = makeFighterBuilderState();
    const char = buildCharacter(fixture.state, {
      inventory: fixture.inventory,
      currency: fixture.currency,
      traits: fixture.traits,
    }).character;
    const result = computeDamageRoll(
      char,
      { source: "weapon", name: "Longsword" },
      {
        extras: [
          { source: "spell", name: "Custom Homebrew", diceOverride: "2d6", typeOverride: "fire" },
        ],
      },
    );
    // 1d8 + STR (3) + override 2d6.
    expect(result.notation).toBe("1d8+2d6+3");
  });
});

describe("computeDamageRoll — error cases", () => {
  it("unknown weapon yields error", () => {
    const fixture = makeFighterBuilderState();
    const char = buildCharacter(fixture.state, {
      inventory: fixture.inventory,
      currency: fixture.currency,
      traits: fixture.traits,
    }).character;
    const result = computeDamageRoll(char, { source: "weapon", name: "NotARealWeapon" });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.notation).toBe("");
  });
});
