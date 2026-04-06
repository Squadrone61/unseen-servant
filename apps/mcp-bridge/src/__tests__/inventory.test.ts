import { describe, it, expect, beforeEach } from "vitest";
import {
  createTestGSM,
  createFighterCharacter,
  registerCharacter,
  assertToolSuccess,
  assertToolError,
} from "./setup.js";
import type { TestGSM } from "./setup.js";

/**
 * Behavioral contracts for inventory and currency methods on GameStateManager.
 *
 * ## addItem(characterName, itemData)
 * - Searches characters by name (case-insensitive).
 * - If an item with the same name (case-insensitive) already exists in inventory:
 *   increments existing.quantity by itemData.quantity ?? 1. No new entry is created.
 * - If item not found: pushes a new InventoryItem with equipped=false, quantity defaults
 *   to 1 if not provided.
 * - Creates an "item_added" GameEvent.
 * - Broadcasts server:character_updated.
 * - Returns data: { character, item, quantity } where quantity reflects the post-add total.
 * - Returns error ToolResponse when characterName is not found.
 *
 * ## removeItem(characterName, itemName, quantity?)
 * - Returns error ToolResponse if item is not found in inventory (by name,
 *   case-insensitive), with hint listing current inventory.
 * - removeQty = quantity ?? existing.quantity (removes all if quantity not specified).
 * - If removeQty >= existing.quantity: splices the item entirely from inventory.
 * - If removeQty < existing.quantity: decrements existing.quantity by removeQty.
 * - Creates an "item_removed" GameEvent.
 * - Broadcasts server:character_updated.
 * - Returns data: { character, item, removed (quantity actually removed) }.
 *
 * ## updateItem(characterName, itemName, updates)
 * - Returns error ToolResponse if item not found (case-insensitive name match).
 * - Applies updates via Object.assign(item, updates) — all provided fields are merged.
 * - Accepted update fields include: equipped, isAttuned, quantity, description, damage,
 *   damageType, properties, armorClass, attackBonus, range, type, rarity, weight,
 *   isMagicItem, attunement.
 * - Creates an "item_updated" GameEvent.
 * - Broadcasts server:character_updated.
 * - Returns a human-readable summary of changes.
 *
 * ## updateCurrency(characterName, changes, autoConvert?)
 * - Applies delta values (positive adds, negative subtracts) for each coin denomination
 *   (cp, sp, gp, pp).
 * - If the resulting value is >= 0: sets currency[coin] = newVal directly.
 * - If the resulting value < 0 and autoConvert=true (default): calls borrowCurrency to
 *   break down higher denominations. Exchange rates: 1pp=10gp, 1gp=10sp, 1sp=10cp.
 *   Excess change after breaking a coin is returned to the target denomination.
 *   If insufficient total funds, floors the coin at 0 and notes the shortfall.
 * - If autoConvert=false and result < 0: floors coin at 0 silently.
 * - Creates a "custom" GameEvent.
 * - Broadcasts server:character_updated.
 * - Returns data: { character, cp, sp, gp, pp, conversions? } where conversions lists
 *   the auto-conversion descriptions when they occurred.
 * - Returns error ToolResponse when characterName is not found.
 */

describe("addItem", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createFighterCharacter());
  });

  describe("adds new item entry when name is unique", () => {
    it("adds a new item and inventory grows by one entry with correct quantity", () => {
      const { gsm } = env;
      const startCount = gsm.characters["Player1"].dynamic.inventory.length;
      const result = gsm.addItem("Theron", { name: "Healing Potion", quantity: 2, type: "Gear" });

      assertToolSuccess(result);

      const char = gsm.characters["Player1"];
      expect(char.dynamic.inventory).toHaveLength(startCount + 1);

      const potion = char.dynamic.inventory.find((i) => i.name === "Healing Potion");
      expect(potion).toBeDefined();
      expect(potion!.quantity).toBe(2);
    });
  });

  describe("stacks quantity when item name already exists", () => {
    it("stacks into a single entry when the same item is added twice", () => {
      const { gsm } = env;

      gsm.addItem("Theron", { name: "Healing Potion", quantity: 2, type: "Gear" });
      const result = gsm.addItem("Theron", { name: "Healing Potion", quantity: 1, type: "Gear" });

      assertToolSuccess(result);

      const char = gsm.characters["Player1"];
      const potions = char.dynamic.inventory.filter(
        (i) => i.name.toLowerCase() === "healing potion",
      );
      expect(potions).toHaveLength(1);
      expect(potions[0].quantity).toBe(3);
    });
  });

  describe("character not found", () => {
    it("returns an error when the character name does not exist", () => {
      const { gsm } = env;
      const result = gsm.addItem("NoSuchHero", { name: "Healing Potion", quantity: 1 });
      assertToolError(result);
    });
  });
});

describe("removeItem", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createFighterCharacter());
  });

  describe("removes all when quantity not specified", () => {
    it("splices the item from inventory entirely when no quantity given", () => {
      const { gsm } = env;
      const result = gsm.removeItem("Theron", "Longsword");

      assertToolSuccess(result);

      const char = gsm.characters["Player1"];
      const found = char.dynamic.inventory.find((i) => i.name.toLowerCase() === "longsword");
      expect(found).toBeUndefined();
    });
  });

  describe("decrements quantity when partial removal", () => {
    it("subtracts removeQty and leaves the item in inventory", () => {
      const { gsm } = env;
      // Add an item with qty 3 first
      gsm.addItem("Theron", { name: "Arrow", quantity: 3, type: "Gear" });
      const result = gsm.removeItem("Theron", "Arrow", 1);

      assertToolSuccess(result);

      const char = gsm.characters["Player1"];
      const arrow = char.dynamic.inventory.find((i) => i.name === "Arrow");
      expect(arrow).toBeDefined();
      expect(arrow!.quantity).toBe(2);
    });
  });

  describe("item not found — error with inventory hint", () => {
    it("returns an error when the item is not in the character's inventory", () => {
      const { gsm } = env;
      const result = gsm.removeItem("Theron", "Nonexistent Dagger");
      assertToolError(result);
    });
  });
});

describe("updateItem", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createFighterCharacter());
  });

  describe("merges all provided update fields via Object.assign", () => {
    it("sets equipped=false on the Longsword", () => {
      const { gsm } = env;
      const result = gsm.updateItem("Theron", "Longsword", { equipped: false });

      assertToolSuccess(result);

      const char = gsm.characters["Player1"];
      const sword = char.dynamic.inventory.find((i) => i.name === "Longsword");
      expect(sword).toBeDefined();
      expect(sword!.equipped).toBe(false);
    });
  });

  describe("item not found — error", () => {
    it("returns an error when the item name is not in inventory", () => {
      const { gsm } = env;
      const result = gsm.updateItem("Theron", "Phantom Blade", { equipped: true });
      assertToolError(result);
    });
  });
});

describe("updateCurrency", () => {
  let env: TestGSM;

  beforeEach(() => {
    env = createTestGSM();
    registerCharacter(env.gsm, "Player1", createFighterCharacter());
  });

  describe("positive delta adds to denomination", () => {
    it("adds 25 gp to Theron who starts with 50 gp, resulting in 75 gp", () => {
      const { gsm } = env;
      const result = gsm.updateCurrency("Theron", { gp: 25 });

      assertToolSuccess(result);

      const char = gsm.characters["Player1"];
      expect(char.dynamic.currency.gp).toBe(75);
    });
  });

  describe("negative delta within available balance subtracts", () => {
    it("subtracts 10 gp from 50 gp, leaving 40 gp", () => {
      const { gsm } = env;
      const result = gsm.updateCurrency("Theron", { gp: -10 });

      assertToolSuccess(result);

      const char = gsm.characters["Player1"];
      expect(char.dynamic.currency.gp).toBe(40);
    });
  });

  describe("autoConvert=true — insufficient funds floors at 0 with shortfall note", () => {
    it("floors gp at 0 and records the shortfall in conversions when total funds are too low", () => {
      const { gsm } = env;
      // Theron has 50 gp and 0 pp — subtracting 100 gp exceeds all holdings
      const result = gsm.updateCurrency("Theron", { gp: -100 });

      // The implementation floors at 0 and records the shortfall in a success response,
      // not an error — the conversions field describes what happened.
      assertToolSuccess(result);

      const char = gsm.characters["Player1"];
      expect(char.dynamic.currency.gp).toBe(0);

      // conversions array should mention the shortfall
      expect(result.data).toBeDefined();
      const data = result.data as { conversions?: string[] };
      expect(data.conversions).toBeDefined();
      expect(data.conversions!.some((c) => /insufficient/i.test(c))).toBe(true);
    });
  });

  describe("character not found", () => {
    it("returns an error when the character name does not exist", () => {
      const { gsm } = env;
      const result = gsm.updateCurrency("GhostCharacter", { gp: 10 });
      assertToolError(result);
    });
  });
});
