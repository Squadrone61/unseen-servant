/**
 * Tests for effect-summary.ts — EntityEffects → human-readable token string.
 *
 * Covers metamagic_grant (D.2) and natural_weapon (A.1) property tokens.
 */

import { describe, it, expect } from "vitest";
import { summarizeEffects } from "../builders/effect-summary.js";
import type { EntityEffects } from "../types/effects.js";

// ---------------------------------------------------------------------------
// metamagic_grant token formatting
// ---------------------------------------------------------------------------

describe("summarizeEffects — metamagic_grant property", () => {
  it("formats a single metamagic_grant as 'Metamagic: <name>'", () => {
    const effects: EntityEffects = {
      properties: [{ type: "metamagic_grant", metamagic: "Quickened Spell" }],
    };
    expect(summarizeEffects(effects)).toBe("Metamagic: Quickened Spell");
  });

  it("formats multiple metamagic_grant properties separated by commas", () => {
    const effects: EntityEffects = {
      properties: [
        { type: "metamagic_grant", metamagic: "Careful Spell" },
        { type: "metamagic_grant", metamagic: "Subtle Spell" },
      ],
    };
    expect(summarizeEffects(effects)).toBe("Metamagic: Careful Spell, Metamagic: Subtle Spell");
  });

  it("returns empty string for effects with no properties", () => {
    expect(summarizeEffects({})).toBe("");
    expect(summarizeEffects(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// natural_weapon token formatting
// ---------------------------------------------------------------------------

describe("summarizeEffects — natural_weapon property", () => {
  it("formats a natural_weapon as 'Name (damage DamageType)'", () => {
    const effects: EntityEffects = {
      properties: [
        { type: "natural_weapon", name: "Talons", damage: "1d6", damageType: "slashing" },
      ],
    };
    expect(summarizeEffects(effects)).toBe("Talons (1d6 Slashing)");
  });

  it("formats multiple natural_weapons separated by commas", () => {
    const effects: EntityEffects = {
      properties: [
        { type: "natural_weapon", name: "Bite", damage: "1d6", damageType: "slashing" },
        { type: "natural_weapon", name: "Claws", damage: "1d6", damageType: "slashing" },
      ],
    };
    expect(summarizeEffects(effects)).toBe("Bite (1d6 Slashing), Claws (1d6 Slashing)");
  });

  it("handles bludgeoning and piercing damage types", () => {
    const effects: EntityEffects = {
      properties: [
        { type: "natural_weapon", name: "Hooves", damage: "1d6", damageType: "bludgeoning" },
        { type: "natural_weapon", name: "Horns", damage: "1d6", damageType: "piercing" },
      ],
    };
    expect(summarizeEffects(effects)).toBe("Hooves (1d6 Bludgeoning), Horns (1d6 Piercing)");
  });
});
