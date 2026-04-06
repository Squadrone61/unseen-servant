import { describe, it, expect } from "vitest";
import { rollDie, rollDice, rollInitiative } from "../utils/dice.js";
import type { DieSize } from "../types/game-state.js";

// ---------------------------------------------------------------------------
// rollDie
// ---------------------------------------------------------------------------
describe("rollDie", () => {
  it("rollDie(20) always returns a number between 1 and 20 (100 rolls)", () => {
    for (let i = 0; i < 100; i++) {
      const result = rollDie(20 as DieSize);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(20);
    }
  });

  it("rollDie(6) always returns a number between 1 and 6 (100 rolls)", () => {
    for (let i = 0; i < 100; i++) {
      const result = rollDie(6 as DieSize);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(6);
    }
  });

  it("rollDie(4) always returns a number between 1 and 4 (100 rolls)", () => {
    for (let i = 0; i < 100; i++) {
      const result = rollDie(4 as DieSize);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(4);
    }
  });
});

// ---------------------------------------------------------------------------
// rollDice
// ---------------------------------------------------------------------------
describe("rollDice", () => {
  it("rollDice(3, 6) returns an array of length 3", () => {
    const results = rollDice(3, 6 as DieSize);
    expect(results).toHaveLength(3);
  });

  it("each element from rollDice(3, 6) has die:6 and result between 1 and 6", () => {
    const results = rollDice(3, 6 as DieSize);
    for (const roll of results) {
      expect(roll.die).toBe(6);
      expect(roll.result).toBeGreaterThanOrEqual(1);
      expect(roll.result).toBeLessThanOrEqual(6);
    }
  });

  it("rollDice(0, 20) returns an empty array", () => {
    const results = rollDice(0, 20 as DieSize);
    expect(results).toHaveLength(0);
    expect(results).toEqual([]);
  });

  it("rollDice(10, 12) returns 10 elements each with die:12 and result in range", () => {
    const results = rollDice(10, 12 as DieSize);
    expect(results).toHaveLength(10);
    for (const roll of results) {
      expect(roll.die).toBe(12);
      expect(roll.result).toBeGreaterThanOrEqual(1);
      expect(roll.result).toBeLessThanOrEqual(12);
    }
  });
});

// ---------------------------------------------------------------------------
// rollInitiative
// ---------------------------------------------------------------------------
describe("rollInitiative", () => {
  it("rollInitiative(0) returns between 1 and 20 (100 rolls)", () => {
    for (let i = 0; i < 100; i++) {
      const result = rollInitiative(0);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(20);
    }
  });

  it("rollInitiative(5) returns between 6 and 25 (100 rolls)", () => {
    for (let i = 0; i < 100; i++) {
      const result = rollInitiative(5);
      expect(result).toBeGreaterThanOrEqual(6);
      expect(result).toBeLessThanOrEqual(25);
    }
  });

  it("rollInitiative(-3) returns between -2 and 17 (100 rolls)", () => {
    for (let i = 0; i < 100; i++) {
      const result = rollInitiative(-3);
      expect(result).toBeGreaterThanOrEqual(-2);
      expect(result).toBeLessThanOrEqual(17);
    }
  });
});
