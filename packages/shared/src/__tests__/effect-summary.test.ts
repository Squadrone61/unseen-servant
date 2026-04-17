/**
 * Tests for effect-summary.ts — EntityEffects → human-readable token string.
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

// ---------------------------------------------------------------------------
// ignore_resistance token formatting
// ---------------------------------------------------------------------------

describe("summarizeEffects — ignore_resistance property", () => {
  it("formats a single damage type", () => {
    const effects: EntityEffects = {
      properties: [{ type: "ignore_resistance", damageTypes: ["poison"] }],
    };
    expect(summarizeEffects(effects)).toBe("Ignore Resist: Poison");
  });

  it("formats multiple damage types joined by slash", () => {
    const effects: EntityEffects = {
      properties: [
        { type: "ignore_resistance", damageTypes: ["bludgeoning", "piercing", "slashing"] },
      ],
    };
    expect(summarizeEffects(effects)).toBe("Ignore Resist: Bludgeoning/Piercing/Slashing");
  });

  it("appends scope when present", () => {
    const effects: EntityEffects = {
      properties: [{ type: "ignore_resistance", damageTypes: ["fire"], scope: "spells" }],
    };
    expect(summarizeEffects(effects)).toBe("Ignore Resist: Fire (spells)");
  });
});

// ---------------------------------------------------------------------------
// inspiration_grant token formatting
// ---------------------------------------------------------------------------

describe("summarizeEffects — inspiration_grant property", () => {
  it("formats self long rest grant", () => {
    const effects: EntityEffects = {
      properties: [{ type: "inspiration_grant", targets: "self", timing: "long_rest" }],
    };
    expect(summarizeEffects(effects)).toBe("Inspiration (self, LR)");
  });

  it("formats allies with count on rest", () => {
    const effects: EntityEffects = {
      properties: [{ type: "inspiration_grant", targets: "allies", count: "prof", timing: "rest" }],
    };
    expect(summarizeEffects(effects)).toBe("Inspiration (prof allies, Rest)");
  });

  it("formats combat start of turn", () => {
    const effects: EntityEffects = {
      properties: [{ type: "inspiration_grant", targets: "self", timing: "combat_start_of_turn" }],
    };
    expect(summarizeEffects(effects)).toBe("Inspiration (self, combat)");
  });
});

// ---------------------------------------------------------------------------
// concentration_immunity token formatting
// ---------------------------------------------------------------------------

describe("summarizeEffects — concentration_immunity property", () => {
  it("formats spell name", () => {
    const effects: EntityEffects = {
      properties: [{ type: "concentration_immunity", spell: "Hunter's Mark" }],
    };
    expect(summarizeEffects(effects)).toBe("Conc. Immune: Hunter's Mark");
  });
});

// ---------------------------------------------------------------------------
// suppress_advantage token formatting
// ---------------------------------------------------------------------------

describe("summarizeEffects — suppress_advantage property", () => {
  it("formats attacks against you", () => {
    const effects: EntityEffects = {
      properties: [{ type: "suppress_advantage", against: "attacks" }],
    };
    expect(summarizeEffects(effects)).toBe("No Advantage: Attacks Against You");
  });
});

// ---------------------------------------------------------------------------
// teleport_grant token formatting
// ---------------------------------------------------------------------------

describe("summarizeEffects — teleport_grant property", () => {
  it("formats distance and timing", () => {
    const effects: EntityEffects = {
      properties: [
        { type: "teleport_grant", distance: 30, timing: "after Attack or Magic action" },
      ],
    };
    expect(summarizeEffects(effects)).toBe("Teleport 30ft (after Attack or Magic action)");
  });

  it("formats bonus action teleport", () => {
    const effects: EntityEffects = {
      properties: [{ type: "teleport_grant", distance: 30, timing: "bonus_action" }],
    };
    expect(summarizeEffects(effects)).toBe("Teleport 30ft (bonus_action)");
  });
});

// ---------------------------------------------------------------------------
// spellcasting_focus token formatting
// ---------------------------------------------------------------------------

describe("summarizeEffects — spellcasting_focus property", () => {
  it("formats item with ability", () => {
    const effects: EntityEffects = {
      properties: [
        { type: "spellcasting_focus", item: "chosen artisan's tool", ability: "intelligence" },
      ],
    };
    expect(summarizeEffects(effects)).toBe("Focus: chosen artisan's tool (INT)");
  });

  it("formats item without ability", () => {
    const effects: EntityEffects = {
      properties: [{ type: "spellcasting_focus", item: "pact weapon" }],
    };
    expect(summarizeEffects(effects)).toBe("Focus: pact weapon");
  });
});

// ---------------------------------------------------------------------------
// feat_grant token formatting
// ---------------------------------------------------------------------------

describe("summarizeEffects — feat_grant property", () => {
  it("formats category", () => {
    const effects: EntityEffects = {
      properties: [{ type: "feat_grant", category: "Origin" }],
    };
    expect(summarizeEffects(effects)).toBe("Feat: Origin");
  });
});

// ---------------------------------------------------------------------------
// shapechange token formatting
// ---------------------------------------------------------------------------

describe("summarizeEffects — shapechange property", () => {
  it("formats action type", () => {
    const effects: EntityEffects = {
      properties: [{ type: "shapechange", action: "action" }],
    };
    expect(summarizeEffects(effects)).toBe("Shapechange (Action)");
  });

  it("formats bonus action type", () => {
    const effects: EntityEffects = {
      properties: [{ type: "shapechange", action: "bonus_action" }],
    };
    expect(summarizeEffects(effects)).toBe("Shapechange (Bonus Action)");
  });
});
