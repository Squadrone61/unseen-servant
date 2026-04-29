/**
 * Tests for the effectBundleSchema's parse-time upgrader: legacy
 * `sourceConcentration` and `sourceActivation` shapes are mapped to the
 * unified `sourceTracked` field on parse. Old saved snapshots remain
 * readable; new saves emit only `sourceTracked`.
 */

import { describe, it, expect } from "vitest";
import { effectBundleSchema } from "../schemas/effects.js";

describe("effectBundleSchema legacy upgrader", () => {
  const baseShape = {
    id: "spell-target:bless:brynn",
    source: { type: "spell", name: "Bless" },
    lifetime: { type: "concentration" },
    effects: {},
  };

  it("maps legacy sourceConcentration → sourceTracked (kind: 'spell')", () => {
    const legacy = {
      ...baseShape,
      sourceConcentration: { caster: "Brynn", spell: "Bless" },
    };
    const parsed = effectBundleSchema.parse(legacy);
    expect(parsed.sourceTracked).toEqual({
      caster: "Brynn",
      identifier: { kind: "spell", name: "Bless" },
    });
    expect((parsed as Record<string, unknown>).sourceConcentration).toBeUndefined();
  });

  it("maps legacy sourceActivation → sourceTracked (kind: 'feature')", () => {
    const legacy = {
      ...baseShape,
      id: "feature-target:paladin:vow of enmity:aelar",
      sourceActivation: { caster: "Aelar", feature: "Vow of Enmity" },
    };
    const parsed = effectBundleSchema.parse(legacy);
    expect(parsed.sourceTracked).toEqual({
      caster: "Aelar",
      identifier: { kind: "feature", name: "Vow of Enmity" },
    });
    expect((parsed as Record<string, unknown>).sourceActivation).toBeUndefined();
  });

  it("passes new sourceTracked through unchanged", () => {
    const fresh = {
      ...baseShape,
      sourceTracked: {
        caster: "Brynn",
        identifier: { kind: "spell" as const, name: "Bless" },
      },
    };
    const parsed = effectBundleSchema.parse(fresh);
    expect(parsed.sourceTracked).toEqual({
      caster: "Brynn",
      identifier: { kind: "spell", name: "Bless" },
    });
  });

  it("strips lingering legacy fields when sourceTracked is already present", () => {
    const both = {
      ...baseShape,
      sourceTracked: {
        caster: "Brynn",
        identifier: { kind: "spell" as const, name: "Bless" },
      },
      sourceConcentration: { caster: "Brynn", spell: "Bless" },
    };
    const parsed = effectBundleSchema.parse(both);
    expect((parsed as Record<string, unknown>).sourceConcentration).toBeUndefined();
    expect(parsed.sourceTracked).toEqual({
      caster: "Brynn",
      identifier: { kind: "spell", name: "Bless" },
    });
  });

  it("leaves bundles with no tag tag-less", () => {
    const parsed = effectBundleSchema.parse(baseShape);
    expect(parsed.sourceTracked).toBeUndefined();
  });
});
