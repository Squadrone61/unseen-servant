/**
 * Tests for effect-summary.ts — EntityEffects → human-readable token string.
 *
 * Covers the metamagic_grant property token (D.2).
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
