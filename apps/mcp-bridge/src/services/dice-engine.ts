/**
 * Dice engine — wraps @dice-roller/rpg-dice-roller to produce our RollResult type.
 *
 * Bridge-only: this module is not used in the browser or worker.
 */

import { DiceRoll } from "@dice-roller/rpg-dice-roller";
import type { DieRoll, DieSize, RollResult } from "@unseen-servant/shared/types";

declare const crypto: { randomUUID(): string };

// ─── Notation parsing helpers ───

/** Extract ordered die sizes from notation: "2d20kh1+1d8+3" → [20, 8] */
function parseDieGroups(notation: string): { count: number; sides: number }[] {
  const groups: { count: number; sides: number }[] = [];
  for (const m of notation.matchAll(/(\d*)d(\d+)/gi)) {
    groups.push({
      count: parseInt(m[1] || "1", 10),
      sides: parseInt(m[2], 10),
    });
  }
  return groups;
}

// ─── Core rolling ───

/**
 * Roll any dice notation string and return a structured RollResult + formatted output.
 *
 * @param notation  Dice notation: "1d20+5", "2d20kh1", "4d6dl1", "2d6+1d8+3"
 * @param label     Display label (e.g. "Perception", "Fireball damage")
 * @returns         { result: RollResult, output: string }
 */
export function rollNotation(
  notation: string,
  label?: string,
): { result: RollResult; output: string } {
  const roll = new DiceRoll(notation);

  // Extract individual die results from the library's roll tree
  const dieGroups = parseDieGroups(notation);
  const allDice: DieRoll[] = [];
  let diceGroupIndex = 0;

  for (const part of roll.rolls) {
    // RollResults objects have a .rolls sub-array of individual die results
    if (typeof part === "object" && part !== null && "rolls" in part) {
      const sides = dieGroups[diceGroupIndex]?.sides ?? 20;
      const rolls = (
        part as { rolls: { initialValue: number; value: number; useInTotal: boolean }[] }
      ).rolls;
      for (const r of rolls) {
        allDice.push({
          die: sides as DieSize,
          result: r.initialValue ?? r.value,
          dropped: r.useInTotal === false ? true : undefined,
        });
      }
      diceGroupIndex++;
    }
    // strings (operators) and numbers (constants) are skipped for die extraction
  }

  // Modifier = total minus sum of kept dice
  const keptSum = allDice.filter((d) => !d.dropped).reduce((s, d) => s + d.result, 0);
  const modifier = roll.total - keptSum;

  // Detect criticals on kept d20s
  const keptD20s = allDice.filter((d) => d.die === 20 && !d.dropped);
  const criticalHit = keptD20s.some((d) => d.result === 20) || undefined;
  const criticalFail = keptD20s.some((d) => d.result === 1) || undefined;

  const output = buildOutputString(notation, allDice, dieGroups, modifier, roll.total);

  const result: RollResult = {
    id: crypto.randomUUID(),
    rolls: allDice,
    modifier,
    total: roll.total,
    criticalHit,
    criticalFail,
    label: label || notation,
    notation,
  };

  return { result, output };
}

// ─── Output formatting ───

/**
 * Build the base output string: "2d20kh1+5: [14, ~~8~~]+5 = 19"
 */
function buildOutputString(
  notation: string,
  dice: DieRoll[],
  groups: { count: number; sides: number }[],
  modifier: number,
  total: number,
): string {
  let diceIdx = 0;
  const groupStrings: string[] = [];

  for (const g of groups) {
    const groupDice = dice.slice(diceIdx, diceIdx + g.count);
    diceIdx += g.count;
    const vals = groupDice.map((d) => (d.dropped ? `~~${d.result}~~` : `${d.result}`)).join(", ");
    groupStrings.push(`[${vals}]`);
  }

  const modStr = modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : "";

  return `${notation}: ${groupStrings.join("+")}${modStr} = ${total}`;
}

/**
 * Build a display-ready output from a RollResult (for interactive rolls
 * where the roll already happened in handleRollDice).
 */
export function buildOutputFromResult(roll: RollResult, originalNotation: string): string {
  const notation = roll.notation || originalNotation;
  const groups = parseDieGroups(notation);

  return buildOutputString(notation, roll.rolls, groups, roll.modifier, roll.total);
}

/**
 * Append D&D context (DC, success/failure, crits, character name) to a base output string.
 *
 * @param output  Base output from rollNotation or buildOutputFromResult
 * @param options D&D context to append
 */
export function formatRollOutput(
  output: string,
  options?: {
    dc?: number;
    success?: boolean;
    criticalHit?: boolean;
    criticalFail?: boolean;
    characterName?: string;
    checkLabel?: string;
  },
): string {
  let result = output;

  // Prepend character name
  if (options?.characterName) {
    result = `${options.characterName} rolled ${result}`;
  }

  // Append check label
  if (options?.checkLabel) {
    result += ` on ${options.checkLabel}`;
  }

  // Append crit or DC result (crit takes priority)
  if (options?.criticalHit) {
    result += " -- CRITICAL HIT!";
    if (options.dc !== undefined) {
      result += ` (DC ${options.dc})`;
    }
  } else if (options?.criticalFail) {
    result += " -- CRITICAL FAIL!";
    if (options.dc !== undefined) {
      result += ` (DC ${options.dc})`;
    }
  } else if (options?.dc !== undefined && options?.success !== undefined) {
    result += options.success ? ` -- SUCCESS (DC ${options.dc})` : ` -- FAILURE (DC ${options.dc})`;
  }

  return result;
}
