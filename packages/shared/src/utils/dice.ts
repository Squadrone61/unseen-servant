/**
 * Shared dice rolling utilities.
 *
 * Used by both the worker (server-side) and the MCP bridge.
 * All randomness uses crypto.getRandomValues() for true randomness.
 * Both Node.js (>=19) and Cloudflare Workers expose globalThis.crypto.
 */

import type { DieSize, DieRoll, RollResult } from "../types/game-state";

// Minimal type declarations for Web Crypto API (available in Node.js >=19 and CF Workers)
declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  randomUUID(): string;
};

/** Roll a single die. */
export function rollDie(sides: DieSize): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return (array[0] % sides) + 1;
}

/** Roll multiple dice of the same size. */
export function rollDice(count: number, sides: DieSize): DieRoll[] {
  return Array.from({ length: count }, () => ({
    die: sides,
    result: rollDie(sides),
  }));
}

/** Roll a d20 check with modifier and optional advantage/disadvantage. */
export function rollCheck(params: {
  modifier: number;
  advantage?: boolean;
  disadvantage?: boolean;
  label: string;
}): RollResult {
  const { modifier, advantage, disadvantage, label } = params;

  // Advantage and disadvantage cancel each other out
  const hasAdvantage = advantage && !disadvantage;
  const hasDisadvantage = disadvantage && !advantage;

  let rolls: DieRoll[];
  let chosenRoll: number;

  if (hasAdvantage || hasDisadvantage) {
    // Roll 2d20
    rolls = rollDice(2, 20);
    chosenRoll = hasAdvantage
      ? Math.max(rolls[0].result, rolls[1].result)
      : Math.min(rolls[0].result, rolls[1].result);
  } else {
    // Roll 1d20
    rolls = rollDice(1, 20);
    chosenRoll = rolls[0].result;
  }

  const total = chosenRoll + modifier;

  return {
    id: crypto.randomUUID(),
    rolls,
    modifier,
    total,
    advantage: hasAdvantage || undefined,
    disadvantage: hasDisadvantage || undefined,
    criticalHit: chosenRoll === 20 || undefined,
    criticalFail: chosenRoll === 1 || undefined,
    label,
  };
}

/** Roll initiative (1d20 + modifier). */
export function rollInitiative(modifier: number): number {
  return rollDie(20) + modifier;
}

/**
 * Parse a dice string like "2d6", "1d8+3", "4d6-1", or compound "2d10+4d6" and roll it.
 * Returns a RollResult with individual dice and total.
 */
export function rollDamage(diceStr: string, extraModifier = 0): RollResult {
  const allRolls: DieRoll[] = [];
  let total = 0;

  // Split on +/- while keeping the sign: "2d10+4d6-2" → ["2d10", "+4d6", "-2"]
  const terms = diceStr.match(/[+-]?[^+-]+/g) || [];

  for (const rawTerm of terms) {
    const term = rawTerm.trim();
    const diceMatch = term.match(/^([+-]?\d*)d(\d+)$/i);
    if (diceMatch) {
      const countStr = diceMatch[1];
      const sign = countStr.startsWith("-") ? -1 : 1;
      const abs = Math.abs(countStr ? parseInt(countStr, 10) || 1 : 1);
      const sides = parseInt(diceMatch[2], 10) as DieSize;
      const rolls = rollDice(abs, sides);
      allRolls.push(...rolls);
      total += sign * rolls.reduce((s, r) => s + r.result, 0);
    } else {
      const num = parseInt(term, 10);
      if (!isNaN(num)) total += num;
    }
  }

  total += extraModifier;

  if (allRolls.length === 0 && total === extraModifier) {
    return {
      id: crypto.randomUUID(),
      rolls: [],
      modifier: extraModifier,
      total: extraModifier,
      label: diceStr,
    };
  }

  return {
    id: crypto.randomUUID(),
    rolls: allRolls,
    modifier: extraModifier,
    total,
    label: diceStr,
  };
}
