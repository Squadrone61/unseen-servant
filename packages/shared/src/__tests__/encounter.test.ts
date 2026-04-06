import { describe, it, expect } from "vitest";
import { calculateEncounterDifficulty } from "../utils/encounter.js";

// ---------------------------------------------------------------------------
// Test fixture: 4 level-5 PCs
// Level-5 per-PC thresholds: { low: 500, moderate: 750, high: 1100 }
// Party totals: low=2000, moderate=3000, high=4400
// Trivial threshold: totalXP < low/2 = 1000
// ---------------------------------------------------------------------------
const PARTY_4_LVL5 = [5, 5, 5, 5];

describe("calculateEncounterDifficulty — difficulty brackets (4 level-5 PCs)", () => {
  it("1 CR 1 goblin (200 XP) → trivial (below 1000)", () => {
    const result = calculateEncounterDifficulty(PARTY_4_LVL5, ["1"]);
    expect(result.difficulty).toBe("trivial");
    expect(result.totalMonsterXP).toBe(200);
  });

  it("4 CR 1 goblins (800 XP) → trivial (below 1000)", () => {
    const result = calculateEncounterDifficulty(PARTY_4_LVL5, ["1", "1", "1", "1"]);
    expect(result.difficulty).toBe("trivial");
    expect(result.totalMonsterXP).toBe(800);
  });

  it("4 CR 2 ogres (1800 XP) → low (≥ 1000, < 2000)", () => {
    const result = calculateEncounterDifficulty(PARTY_4_LVL5, ["2", "2", "2", "2"]);
    expect(result.difficulty).toBe("low");
    expect(result.totalMonsterXP).toBe(1800);
  });

  it("2 CR 5 monsters (3600 XP) → high (≥ 3000, < 4400)", () => {
    const result = calculateEncounterDifficulty(PARTY_4_LVL5, ["5", "5"]);
    expect(result.difficulty).toBe("high");
    expect(result.totalMonsterXP).toBe(3600);
  });

  it("1 CR 10 monster (5900 XP) → deadly (≥ 4400)", () => {
    const result = calculateEncounterDifficulty(PARTY_4_LVL5, ["10"]);
    expect(result.difficulty).toBe("deadly");
    expect(result.totalMonsterXP).toBe(5900);
  });

  it("empty monster list → trivial (0 XP)", () => {
    const result = calculateEncounterDifficulty(PARTY_4_LVL5, []);
    expect(result.difficulty).toBe("trivial");
    expect(result.totalMonsterXP).toBe(0);
  });

  it("unknown CR string → 0 XP for that monster (does not throw)", () => {
    const result = calculateEncounterDifficulty(PARTY_4_LVL5, ["unknown-cr"]);
    expect(result.totalMonsterXP).toBe(0);
    expect(result.difficulty).toBe("trivial");
  });
});

describe("calculateEncounterDifficulty — moderate bracket", () => {
  it("encounter at exactly the low threshold (2000 XP) → moderate", () => {
    // 4 × CR 2 (450 each) + 1 × CR 1 (200) = 2000 XP exactly
    const result = calculateEncounterDifficulty(PARTY_4_LVL5, ["2", "2", "2", "2", "1"]);
    expect(result.totalMonsterXP).toBe(2000);
    expect(result.difficulty).toBe("moderate");
  });
});

describe("calculateEncounterDifficulty — returned object shape", () => {
  it("returns correct partyThresholds for 4 level-5 PCs", () => {
    const result = calculateEncounterDifficulty(PARTY_4_LVL5, ["1"]);
    expect(result.partyThresholds).toEqual({ low: 2000, moderate: 3000, high: 4400 });
  });

  it("returns a summary string containing monster count, XP, difficulty, and thresholds", () => {
    const result = calculateEncounterDifficulty(PARTY_4_LVL5, ["1"]);
    // Summary format: "N monster(s) (XP XP) vs N PC(s) (levels ...). Difficulty: LEVEL. Thresholds — Low: N, ..."
    expect(result.summary).toContain("monster(s)");
    expect(result.summary).toContain("200 XP");
    expect(result.summary).toContain("TRIVIAL");
    expect(result.summary).toContain("Low: 2000");
    expect(result.summary).toContain("Moderate: 3000");
    expect(result.summary).toContain("High: 4400");
  });

  it("result has totalMonsterXP, partyThresholds, difficulty, and summary keys", () => {
    const result = calculateEncounterDifficulty(PARTY_4_LVL5, ["3"]);
    expect(result).toHaveProperty("totalMonsterXP");
    expect(result).toHaveProperty("partyThresholds");
    expect(result).toHaveProperty("difficulty");
    expect(result).toHaveProperty("summary");
  });
});

describe("calculateEncounterDifficulty — party level capping and mixed parties", () => {
  it("single level-1 PC: a CR 1/4 monster (50 XP) vs threshold low=50 → moderate", () => {
    // Level 1 thresholds: low=50, moderate=75, high=100
    // 50 XP >= low(50) → moderate
    const result = calculateEncounterDifficulty([1], ["1/4"]);
    expect(result.totalMonsterXP).toBe(50);
    expect(result.difficulty).toBe("moderate");
    expect(result.partyThresholds).toEqual({ low: 50, moderate: 75, high: 100 });
  });

  it("mixed level party: thresholds are the sum of each PC's thresholds", () => {
    // Level 1: low=50, moderate=75, high=100
    // Level 5: low=500, moderate=750, high=1100
    // Total: low=550, moderate=825, high=1200
    const result = calculateEncounterDifficulty([1, 5], []);
    expect(result.partyThresholds).toEqual({ low: 550, moderate: 825, high: 1200 });
  });
});
