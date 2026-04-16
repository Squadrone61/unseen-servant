/**
 * Tests for choice-to-effects.ts — pool-based EffectBundle emission.
 *
 * Covers the metamagic pool arm (D.2), mirroring the weapon_mastery precedent.
 */

import { describe, it, expect } from "vitest";
import { collectChoiceEffectsPass1 } from "../builders/choice-to-effects.js";
import type { FeatureChoice } from "../types/effects.js";
import { makeBuilderState } from "./helpers/makeBuilderState.js";

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

const source = {
  kind: "class-feature" as const,
  sourceName: "Sorcerer",
  featureName: "Metamagic",
  level: 2,
};

const state = makeBuilderState();

// ---------------------------------------------------------------------------
// metamagic pool emission
// ---------------------------------------------------------------------------

describe("choice-to-effects — metamagic pool", () => {
  it("picking 2 Metamagic options emits one bundle with 2 metamagic_grant properties", () => {
    const selectedValues = ["Careful Spell", "Quickened Spell"];
    const { bundles } = collectChoiceEffectsPass1(
      [metamagicChoice],
      { "metamagic-l2": selectedValues },
      source,
      state,
      new Set(),
    );

    expect(bundles).toHaveLength(1);
    const bundle = bundles[0];
    expect(bundle.effects.properties).toHaveLength(2);

    const props = bundle.effects.properties!;
    expect(props[0]).toEqual({ type: "metamagic_grant", metamagic: "Careful Spell" });
    expect(props[1]).toEqual({ type: "metamagic_grant", metamagic: "Quickened Spell" });
  });

  it("picking 0 options emits no bundles", () => {
    const { bundles } = collectChoiceEffectsPass1(
      [metamagicChoice],
      { "metamagic-l2": [] },
      source,
      state,
      new Set(),
    );

    expect(bundles).toHaveLength(0);
  });

  it("bundle id encodes source, choice id, and selected values", () => {
    const selectedValues = ["Subtle Spell", "Extended Spell"];
    const { bundles } = collectChoiceEffectsPass1(
      [metamagicChoice],
      { "metamagic-l2": selectedValues },
      source,
      state,
      new Set(),
    );

    expect(bundles[0].id).toContain("metamagic-l2");
    expect(bundles[0].id).toContain("Sorcerer");
  });
});
