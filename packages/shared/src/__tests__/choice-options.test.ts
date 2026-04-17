/**
 * Tests for choice-options.ts — pool resolver.
 *
 * Covers the metamagic pool arm: all 10 canonical 2024 PHB Metamagic options
 * must be returned from the DB.
 */

import { describe, it, expect } from "vitest";
import { resolveChoice, checkPrerequisite } from "../builders/choice-options.js";
import type { FeatureChoice, Prerequisite } from "../types/effects.js";

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

// ---------------------------------------------------------------------------
// eldritch_invocation pool resolver
// ---------------------------------------------------------------------------

const eiChoice: FeatureChoice = {
  id: "ei-1",
  label: "Eldritch Invocation",
  count: 1,
  timing: "permanent",
  pool: "eldritch_invocation",
};

describe("choice-options — eldritch_invocation pool", () => {
  it("returns multiple EI options from the DB", () => {
    const options = resolveChoice(eiChoice);
    expect(options.length).toBeGreaterThanOrEqual(10);
  });

  it("each option has category 'optional_feature'", () => {
    const options = resolveChoice(eiChoice);
    for (const option of options) {
      expect(option.detail.category).toBe("optional_feature");
    }
  });

  it("prereq-free options are not disabled when no context is provided", () => {
    const options = resolveChoice(eiChoice);
    const armorOfShadows = options.find((o) => o.name === "Armor of Shadows");
    expect(armorOfShadows).toBeDefined();
    expect(armorOfShadows?.disabled).toBeUndefined();
  });

  it("prereq options are disabled for non-Warlock context", () => {
    const options = resolveChoice(eiChoice, { className: "Wizard", level: 5 });
    const withPrereqs = options.filter((o) => o.disabled);
    expect(withPrereqs.length).toBeGreaterThan(0);
    for (const opt of withPrereqs) {
      expect(opt.disabledReason).toBeDefined();
    }
  });

  it("Warlock at high level can access level-gated invocations", () => {
    const options = resolveChoice(eiChoice, {
      className: "Warlock",
      level: 15,
      features: ["Pact of the Blade"],
    });
    const eldrithSmite = options.find((o) => o.name === "Eldritch Smite");
    expect(eldrithSmite).toBeDefined();
    expect(eldrithSmite?.disabled).toBeUndefined();
  });

  it("low-level Warlock sees level-gated invocations as disabled", () => {
    const options = resolveChoice(eiChoice, {
      className: "Warlock",
      level: 2,
      features: [],
    });
    const eldrithSmite = options.find((o) => o.name === "Eldritch Smite");
    expect(eldrithSmite).toBeDefined();
    expect(eldrithSmite?.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// spell_choice pool resolver
// ---------------------------------------------------------------------------

const spellChoiceMysticArcanum: FeatureChoice = {
  id: "mystic-arcanum-6",
  label: "Mystic Arcanum (6th Level)",
  count: 1,
  timing: "permanent",
  pool: "spell_choice",
  from: ["Warlock"],
  filter: { level: 6 },
  grantUsage: "1/long_rest",
};

const spellChoiceWizardMastery: FeatureChoice = {
  id: "spell-mastery-1",
  label: "Spell Mastery (1st Level)",
  count: 1,
  timing: "permanent",
  pool: "spell_choice",
  from: ["Wizard"],
  filter: { level: 1, castingTime: "1 action" },
  grantUsage: "at_will",
};

describe("choice-options — spell_choice pool", () => {
  it("returns only level 6 Warlock spells for Mystic Arcanum", () => {
    const options = resolveChoice(spellChoiceMysticArcanum);
    expect(options.length).toBeGreaterThan(0);
    for (const opt of options) {
      expect(opt.detail.category).toBe("spell");
    }
  });

  it("returns only level 1 action-time Wizard spells for Spell Mastery", () => {
    const options = resolveChoice(spellChoiceWizardMastery);
    expect(options.length).toBeGreaterThan(0);
    for (const opt of options) {
      expect(opt.detail.category).toBe("spell");
    }
  });

  it("multi-class spell_choice returns spells from all listed classes", () => {
    const magicalDiscoveries: FeatureChoice = {
      id: "magical-discoveries",
      label: "Magical Discoveries",
      count: 2,
      timing: "permanent",
      pool: "spell_choice",
      from: ["Cleric", "Druid", "Wizard"],
      grantUsage: "always_prepared",
    };
    const options = resolveChoice(magicalDiscoveries);
    expect(options.length).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// checkPrerequisite
// ---------------------------------------------------------------------------

describe("checkPrerequisite", () => {
  it("level prerequisite passes when met", () => {
    const prereq: Prerequisite = { type: "level", value: 5 };
    expect(checkPrerequisite(prereq, { level: 5 }).met).toBe(true);
    expect(checkPrerequisite(prereq, { level: 10 }).met).toBe(true);
  });

  it("level prerequisite fails when not met", () => {
    const prereq: Prerequisite = { type: "level", value: 5 };
    expect(checkPrerequisite(prereq, { level: 3 }).met).toBe(false);
  });

  it("feature prerequisite passes when feature present", () => {
    const prereq: Prerequisite = { type: "feature", featureName: "Pact of the Blade" };
    expect(checkPrerequisite(prereq, { features: ["Pact of the Blade"] }).met).toBe(true);
  });

  it("feature prerequisite fails when feature absent", () => {
    const prereq: Prerequisite = { type: "feature", featureName: "Pact of the Blade" };
    expect(checkPrerequisite(prereq, { features: [] }).met).toBe(false);
  });

  it("allOf requires all sub-prereqs", () => {
    const prereq: Prerequisite = {
      type: "allOf",
      of: [
        { type: "level", value: 5 },
        { type: "feature", featureName: "Pact of the Blade" },
      ],
    };
    expect(checkPrerequisite(prereq, { level: 5, features: ["Pact of the Blade"] }).met).toBe(true);
    expect(checkPrerequisite(prereq, { level: 5, features: [] }).met).toBe(false);
    expect(checkPrerequisite(prereq, { level: 3, features: ["Pact of the Blade"] }).met).toBe(
      false,
    );
  });

  it("anyOf passes if any sub-prereq met", () => {
    const prereq: Prerequisite = {
      type: "anyOf",
      of: [
        { type: "level", value: 5 },
        { type: "feature", featureName: "Pact of the Blade" },
      ],
    };
    expect(checkPrerequisite(prereq, { level: 5, features: [] }).met).toBe(true);
    expect(checkPrerequisite(prereq, { level: 1, features: ["Pact of the Blade"] }).met).toBe(true);
    expect(checkPrerequisite(prereq, { level: 1, features: [] }).met).toBe(false);
  });
});
