/**
 * Encounter difficulty calculator using 2024 D&D encounter building rules.
 * Based on XP budget thresholds from the 2024 DMG.
 */

// XP thresholds per character level for each difficulty
const XP_THRESHOLDS: Record<number, { low: number; moderate: number; high: number }> = {
  1: { low: 50, moderate: 75, high: 100 },
  2: { low: 100, moderate: 150, high: 200 },
  3: { low: 150, moderate: 225, high: 400 },
  4: { low: 250, moderate: 375, high: 500 },
  5: { low: 500, moderate: 750, high: 1100 },
  6: { low: 600, moderate: 1000, high: 1400 },
  7: { low: 750, moderate: 1300, high: 1700 },
  8: { low: 1000, moderate: 1700, high: 2100 },
  9: { low: 1300, moderate: 2000, high: 2600 },
  10: { low: 1600, moderate: 2300, high: 3100 },
  11: { low: 1900, moderate: 2900, high: 3600 },
  12: { low: 2200, moderate: 3700, high: 4500 },
  13: { low: 2600, moderate: 4200, high: 5100 },
  14: { low: 2900, moderate: 4900, high: 5700 },
  15: { low: 3300, moderate: 5400, high: 6400 },
  16: { low: 3800, moderate: 6100, high: 7200 },
  17: { low: 4500, moderate: 7200, high: 8800 },
  18: { low: 5000, moderate: 8700, high: 10000 },
  19: { low: 5500, moderate: 10000, high: 12000 },
  20: { low: 6300, moderate: 11500, high: 13500 },
};

// XP by CR (from 2024 DMG)
const CR_XP: Record<string, number> = {
  "0": 10,
  "1/8": 25,
  "1/4": 50,
  "1/2": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
  "21": 33000,
  "22": 41000,
  "23": 50000,
  "24": 62000,
  "25": 75000,
  "26": 90000,
  "27": 105000,
  "28": 120000,
  "29": 135000,
  "30": 155000,
};

export type EncounterDifficulty = "trivial" | "low" | "moderate" | "high" | "deadly";

export interface EncounterDifficultyResult {
  difficulty: EncounterDifficulty;
  totalMonsterXP: number;
  partyThresholds: { low: number; moderate: number; high: number };
  summary: string;
}

/**
 * Calculate encounter difficulty given party levels and monster CRs.
 */
export function calculateEncounterDifficulty(
  partyLevels: number[],
  monsterCRs: string[],
): EncounterDifficultyResult {
  // Calculate party XP thresholds
  const thresholds = { low: 0, moderate: 0, high: 0 };
  for (const level of partyLevels) {
    const capped = Math.max(1, Math.min(20, level));
    const t = XP_THRESHOLDS[capped];
    thresholds.low += t.low;
    thresholds.moderate += t.moderate;
    thresholds.high += t.high;
  }

  // Calculate total monster XP
  let totalXP = 0;
  for (const cr of monsterCRs) {
    totalXP += CR_XP[cr] ?? 0;
  }

  // Determine difficulty
  let difficulty: EncounterDifficulty;
  if (totalXP >= thresholds.high) {
    difficulty = "deadly";
  } else if (totalXP >= thresholds.moderate) {
    difficulty = "high";
  } else if (totalXP >= thresholds.low) {
    difficulty = "moderate";
  } else if (totalXP >= thresholds.low / 2) {
    difficulty = "low";
  } else {
    difficulty = "trivial";
  }

  const summary =
    `${monsterCRs.length} monster(s) (${totalXP} XP) vs ${partyLevels.length} PC(s) ` +
    `(levels ${partyLevels.join(", ")}). ` +
    `Difficulty: ${difficulty.toUpperCase()}. ` +
    `Thresholds — Low: ${thresholds.low}, Moderate: ${thresholds.moderate}, High: ${thresholds.high}`;

  return { difficulty, totalMonsterXP: totalXP, partyThresholds: thresholds, summary };
}
