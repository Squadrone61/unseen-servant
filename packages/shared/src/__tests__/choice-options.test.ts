/**
 * Tests for choice-options.ts — pool resolver.
 *
 * Covers the metamagic pool arm: all 10 canonical 2024 PHB Metamagic options
 * must be returned from the DB.
 */

import { describe, it, expect } from "vitest";
import { resolveChoice } from "../builders/choice-options.js";
import type { FeatureChoice } from "../types/effects.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const metamagicChoice: FeatureChoice = {
  id: "metamagic-l2",
  label: "Metamagic Options",
  count: 2,
  timing: "permanent",
  pool: "metamagic",
};

// Canonical 2024 PHB Metamagic option names
const EXPECTED_METAMAGIC_OPTIONS = [
  "Careful Spell",
  "Distant Spell",
  "Empowered Spell",
  "Extended Spell",
  "Heightened Spell",
  "Quickened Spell",
  "Seeking Spell",
  "Subtle Spell",
  "Transmuted Spell",
  "Twinned Spell",
];

// ---------------------------------------------------------------------------
// metamagic pool resolver
// ---------------------------------------------------------------------------

describe("choice-options — metamagic pool", () => {
  it("returns exactly 10 options", () => {
    const options = resolveChoice(metamagicChoice);
    expect(options).toHaveLength(10);
  });

  it("contains all 10 canonical Metamagic option names", () => {
    const options = resolveChoice(metamagicChoice);
    const names = options.map((o) => o.name);
    for (const expected of EXPECTED_METAMAGIC_OPTIONS) {
      expect(names).toContain(expected);
    }
  });

  it("each option has category 'optional_feature'", () => {
    const options = resolveChoice(metamagicChoice);
    for (const option of options) {
      expect(option.detail.category).toBe("optional_feature");
    }
  });

  it("each option id matches its name", () => {
    const options = resolveChoice(metamagicChoice);
    for (const option of options) {
      expect(option.id).toBe(option.name);
    }
  });
});
