import { describe, it, expect } from "vitest";
import { encounterBundleSchema } from "../schemas/encounter-bundle.js";
import type { EncounterBundle } from "../types/encounter-bundle.js";

const SAMPLE_BUNDLE: EncounterBundle = {
  slug: "goblin-ambush-river-a3f",
  createdSession: 4,
  createdAt: "2026-04-26T12:00:00.000Z",
  difficulty: "moderate",
  partySnapshot: [
    { name: "Zara", level: 5 },
    { name: "Theron", level: 5 },
  ],
  combatants: [
    {
      name: "Grixx",
      monsterRef: "goblin-boss",
      hp: 21,
      ac: 17,
      speed: { walk: 30 },
      intelligence: 10,
      tacticsNote: "Snipes spellcasters; redirects damage with Redirect Attack",
      abilities: [
        {
          name: "Multiattack",
          kind: "attack",
          actionRef: "monster:goblin-boss/multiattack",
          summary: "Two scimitar attacks, +4 to hit, 1d6+2 slashing each.",
        },
        {
          name: "Redirect Attack",
          kind: "reaction",
          actionRef: "monster:goblin-boss/redirect-attack",
          summary: "When hit, swap an adjacent goblin to take the hit instead.",
          trigger: "when hit by an attack",
          uses: { perRound: 1 },
        },
      ],
    },
    {
      name: "Sneak",
      monsterRef: "goblin",
      hp: 7,
      ac: 15,
      speed: { walk: 30 },
      intelligence: 10,
      abilities: [
        {
          name: "Shortbow",
          kind: "attack",
          actionRef: "monster:goblin/shortbow",
          summary: "+4 to hit, 1d6+2 piercing, range 80/320.",
        },
      ],
    },
  ],
  mapName: "River Crossing",
  openingPositions: [
    { name: "Grixx", pos: "D5" },
    { name: "Sneak", pos: "F8" },
  ],
  tacticsHint: "Goblins flank from cover; Grixx hangs back, redirects fatal hits to Sneak.",
  citations: [
    "lookup_rule(goblin-boss, monster) → MM 2024 p.166",
    "lookup_rule(goblin, monster) → MM 2024 p.165",
    "calculate_encounter_difficulty([5,5], ['3','1/4']) → moderate",
  ],
};

describe("encounterBundleSchema", () => {
  it("round-trips a valid bundle", () => {
    const parsed = encounterBundleSchema.parse(SAMPLE_BUNDLE);
    expect(parsed).toEqual(SAMPLE_BUNDLE);
  });

  it("rejects non-kebab slug", () => {
    const bad = { ...SAMPLE_BUNDLE, slug: "Goblin Ambush!" };
    expect(() => encounterBundleSchema.parse(bad)).toThrow();
  });

  it("rejects invalid difficulty", () => {
    const bad = { ...SAMPLE_BUNDLE, difficulty: "trivial" };
    expect(() => encounterBundleSchema.parse(bad)).toThrow();
  });

  it("rejects ability with unknown kind", () => {
    const bad = {
      ...SAMPLE_BUNDLE,
      combatants: [
        {
          ...SAMPLE_BUNDLE.combatants[0],
          abilities: [
            {
              name: "Mystery",
              kind: "mystery-action",
              summary: "???",
            },
          ],
        },
        SAMPLE_BUNDLE.combatants[1],
      ],
    };
    expect(() => encounterBundleSchema.parse(bad)).toThrow();
  });

  it("accepts a bundle with no abilities (e.g. wave-1 grunts)", () => {
    const minimal: EncounterBundle = {
      ...SAMPLE_BUNDLE,
      combatants: [
        {
          name: "Mook",
          monsterRef: "thug",
          hp: 32,
          ac: 11,
          speed: { walk: 30 },
          intelligence: 10,
          abilities: [],
        },
      ],
    };
    expect(() => encounterBundleSchema.parse(minimal)).not.toThrow();
  });

  it("accepts speed with multiple movement types", () => {
    const flying: EncounterBundle = {
      ...SAMPLE_BUNDLE,
      combatants: [
        {
          name: "Wyvern",
          monsterRef: "wyvern",
          hp: 110,
          ac: 13,
          speed: { walk: 20, fly: 80 },
          intelligence: 5,
          abilities: [
            {
              name: "Bite",
              kind: "attack",
              actionRef: "monster:wyvern/bite",
              summary: "+7 to hit, 2d6+4 piercing.",
            },
          ],
        },
      ],
    };
    expect(() => encounterBundleSchema.parse(flying)).not.toThrow();
  });
});
