/**
 * Shared dice rolling utilities.
 *
 * Low-level die rolling used by rollInitiative (GSM) and the bridge dice engine.
 * All randomness uses crypto.getRandomValues() for true randomness.
 * Both Node.js (>=19) and Cloudflare Workers expose globalThis.crypto.
 */

import type { DieSize, DieRoll } from "../types/game-state";

// Minimal type declarations for Web Crypto API (available in Node.js >=19 and CF Workers)
declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
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

/** Roll initiative (1d20 + modifier). */
export function rollInitiative(modifier: number): number {
  return rollDie(20) + modifier;
}
