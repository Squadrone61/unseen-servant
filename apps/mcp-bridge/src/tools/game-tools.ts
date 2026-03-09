import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MessageQueue } from "../message-queue.js";
import type { WSClient } from "../ws-client.js";

export function registerGameTools(
  server: McpServer,
  messageQueue: MessageQueue,
  wsClient: WSClient
): void {
  // ─── Core Game Loop ───

  server.tool(
    "wait_for_message",
    "Block until a player message or DM request arrives via WebSocket. Returns the request with systemPrompt and conversation messages. This is the main loop driver — call this repeatedly to process game turns.",
    {},
    async () => {
      const msg = await messageQueue.waitForNext();
      wsClient.sendTypingIndicator(true);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                requestId: msg.requestId,
                systemPrompt: msg.systemPrompt,
                messages: msg.messages,
                totalMessageCount: msg.totalMessageCount,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "acknowledge",
    "Silently observe player messages without sending a visible response. Use when players are talking to each other, roleplaying between characters, or having conversations that don't need DM input.",
    {
      requestId: z
        .string()
        .describe("The requestId from the dm_request to acknowledge"),
    },
    async ({ requestId }) => {
      wsClient.sendTypingIndicator(false);
      return {
        content: [
          {
            type: "text" as const,
            text: `Acknowledged request ${requestId} — no response sent to players.`,
          },
        ],
      };
    }
  );

  server.tool(
    "send_response",
    "Send the DM narrative response back to all players. This broadcasts the AI message, stores it in conversation history, and updates game state.",
    {
      requestId: z
        .string()
        .describe("The requestId from the dm_request to respond to"),
      text: z
        .string()
        .describe("The DM narrative text to send back to the players"),
    },
    async ({ requestId, text }) => {
      wsClient.sendTypingIndicator(false);
      wsClient.sendDMResponse(requestId, text);
      return {
        content: [
          {
            type: "text" as const,
            text: `Response sent for request ${requestId} (${text.length} chars)`,
          },
        ],
      };
    }
  );

  server.tool(
    "get_players",
    "Get the current player list with character summaries. Useful for understanding who is in the party and their current state.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                connected: wsClient.connected,
                storyStarted: wsClient.storyStarted,
                players: wsClient.players,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ─── State Query Tools ───

  server.tool(
    "get_game_state",
    "Get the full game state snapshot including combat, encounter, pending checks, event log, and all characters.",
    {},
    async () => {
      const state = wsClient.gameStateManager.getGameState();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(state, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "get_character",
    "Get a specific player's full character data including stats, HP, spell slots, conditions, inventory.",
    {
      character_name: z.string().describe("The character name to look up"),
    },
    async ({ character_name }) => {
      const result = wsClient.gameStateManager.getCharacter(character_name);
      if (!result) {
        return {
          content: [{ type: "text" as const, text: `Character "${character_name}" not found` }],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // ─── HP & Conditions ───

  server.tool(
    "apply_damage",
    "Deal damage to a character or combatant. Handles temp HP absorption automatically. Use for monster attacks, traps, environmental damage.",
    {
      target: z.string().describe("Name of the character or combatant to damage"),
      amount: z.number().describe("Amount of damage to deal"),
      damage_type: z.string().optional().describe("Type of damage (e.g., 'fire', 'slashing', 'psychic')"),
    },
    async ({ target, amount, damage_type }) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.applyDamage(target, amount, damage_type);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "heal",
    "Restore HP to a character or combatant. Cannot exceed max HP.",
    {
      target: z.string().describe("Name of the character or combatant to heal"),
      amount: z.number().describe("Amount of HP to restore"),
    },
    async ({ target, amount }) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.heal(target, amount);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "set_hp",
    "Set a character or combatant's HP to an exact value. Useful for special effects or corrections.",
    {
      target: z.string().describe("Name of the character or combatant"),
      value: z.number().describe("HP value to set"),
    },
    async ({ target, value }) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.setHP(target, value);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "add_condition",
    "Add a condition to a character or combatant (e.g., poisoned, stunned, prone, frightened).",
    {
      target: z.string().describe("Name of the character or combatant"),
      condition: z.string().describe("Condition name (e.g., 'poisoned', 'stunned', 'prone')"),
      duration: z.number().optional().describe("Duration in rounds (optional)"),
    },
    async ({ target, condition, duration }) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.addCondition(target, condition, duration);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "remove_condition",
    "Remove a condition from a character or combatant.",
    {
      target: z.string().describe("Name of the character or combatant"),
      condition: z.string().describe("Condition name to remove"),
    },
    async ({ target, condition }) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.removeCondition(target, condition);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  // ─── Combat Management ───

  server.tool(
    "start_combat",
    "Initialize combat with a list of combatants. Initiative is rolled automatically by the system for all combatants. Creates turn order and broadcasts combat state to all players.",
    {
      combatants: z.array(z.object({
        name: z.string().describe("Combatant name"),
        type: z.enum(["player", "npc", "enemy"]).describe("Combatant type"),
        initiativeModifier: z.number().optional().describe("Initiative modifier (Dex mod). For players, auto-read from character sheet if omitted."),
        speed: z.number().optional().describe("Movement speed in feet (default 30)"),
        maxHP: z.number().optional().describe("Maximum HP (required for NPCs/enemies)"),
        currentHP: z.number().optional().describe("Current HP (defaults to maxHP)"),
        armorClass: z.number().optional().describe("Armor Class"),
        position: z.object({ x: z.number(), y: z.number() }).optional().describe("Starting grid position"),
        size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]).optional().describe("Creature size (default medium)"),
        tokenColor: z.string().optional().describe("Token color for battle map"),
      })).describe("List of combatants to add to combat"),
    },
    async ({ combatants }) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.startCombat(combatants);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "end_combat",
    "End the current combat encounter. Clears combat state and returns to exploration.",
    {},
    async () => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.endCombat();
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "advance_turn",
    "Move to the next combatant's turn in initiative order. Increments round counter on wrap-around.",
    {},
    async () => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.advanceTurnMCP();
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "add_combatant",
    "Add a new combatant to active combat mid-fight (reinforcements, summoned creatures, etc.). Initiative is rolled automatically.",
    {
      name: z.string().describe("Combatant name"),
      type: z.enum(["player", "npc", "enemy"]).describe("Combatant type"),
      initiativeModifier: z.number().optional().describe("Initiative modifier (Dex mod). For players, auto-read from character sheet if omitted."),
      speed: z.number().optional().describe("Movement speed in feet"),
      maxHP: z.number().optional().describe("Maximum HP"),
      currentHP: z.number().optional().describe("Current HP"),
      armorClass: z.number().optional().describe("Armor Class"),
      position: z.object({ x: z.number(), y: z.number() }).optional().describe("Grid position"),
      size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]).optional(),
      tokenColor: z.string().optional(),
    },
    async (params) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.addCombatant(params);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "remove_combatant",
    "Remove a combatant from combat (dead, fled, dismissed, etc.).",
    {
      name: z.string().describe("Name of the combatant to remove"),
    },
    async ({ name }) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.removeCombatant(name);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "move_combatant",
    "Move a combatant's token on the battle map to a new position.",
    {
      name: z.string().describe("Name of the combatant to move"),
      x: z.number().describe("Target X grid position"),
      y: z.number().describe("Target Y grid position"),
    },
    async ({ name, x, y }) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.moveCombatant(name, { x, y });
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  // ─── Spell Slots ───

  server.tool(
    "use_spell_slot",
    "Expend a spell slot at a given level for a character.",
    {
      character_name: z.string().describe("Character name"),
      level: z.number().describe("Spell slot level (1-9)"),
    },
    async ({ character_name, level }) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.useSpellSlot(character_name, level);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "restore_spell_slot",
    "Restore a spell slot at a given level (e.g., after short rest, Arcane Recovery).",
    {
      character_name: z.string().describe("Character name"),
      level: z.number().describe("Spell slot level (1-9)"),
    },
    async ({ character_name, level }) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.restoreSpellSlot(character_name, level);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  // ─── Battle Map ───

  server.tool(
    "update_battle_map",
    "Set or update the battle map grid. Define the grid dimensions, terrain tiles, and optional name.",
    {
      width: z.number().describe("Grid width in tiles"),
      height: z.number().describe("Grid height in tiles"),
      name: z.string().optional().describe("Map name (e.g., 'Goblin Cave', 'Town Square')"),
      tiles: z.array(z.array(z.object({
        type: z.enum(["floor", "wall", "difficult_terrain", "water", "pit", "door", "stairs"]),
      }))).optional().describe("2D array of tiles [y][x]. If omitted, all floor."),
    },
    async ({ width, height, name, tiles }) => {
      wsClient.sendTypingIndicator(true);
      const mapTiles = tiles ?? Array.from({ length: height }, () =>
        Array.from({ length: width }, () => ({ type: "floor" as const }))
      );

      const result = wsClient.gameStateManager.updateBattleMap({
        id: crypto.randomUUID(),
        width,
        height,
        tiles: mapTiles,
        name,
      });
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  // ─── Inventory & Currency ───

  server.tool(
    "add_item",
    "Add an item to a character's inventory. Stacks by name if the item already exists.",
    {
      character_name: z.string().describe("Character name"),
      name: z.string().describe("Item name"),
      quantity: z.number().optional().describe("Quantity (default 1)"),
      type: z.string().optional().describe("Item type (e.g., 'Weapon', 'Armor', 'Gear', 'Potion')"),
      description: z.string().optional().describe("Item description"),
      rarity: z.string().optional().describe("Rarity (Common, Uncommon, Rare, Very Rare, Legendary)"),
      is_magic_item: z.boolean().optional().describe("Whether this is a magic item"),
      damage: z.string().optional().describe("Damage dice (e.g., '1d8', '2d6')"),
      damage_type: z.string().optional().describe("Damage type (e.g., 'slashing', 'fire')"),
      properties: z.array(z.string()).optional().describe("Item properties (e.g., ['Versatile', 'Light'])"),
      weight: z.number().optional().describe("Item weight in pounds"),
    },
    async ({ character_name, name, quantity, type, description, rarity, is_magic_item, damage, damage_type, properties, weight }) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.addItem(character_name, {
        name, quantity, type, description, rarity,
        isMagicItem: is_magic_item, damage, damageType: damage_type,
        properties, weight,
      });
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "remove_item",
    "Remove an item from a character's inventory. Decrements quantity or removes entirely.",
    {
      character_name: z.string().describe("Character name"),
      item_name: z.string().describe("Item name to remove"),
      quantity: z.number().optional().describe("Quantity to remove (default: all)"),
    },
    async ({ character_name, item_name, quantity }) => {
      wsClient.sendTypingIndicator(true);
      const result = wsClient.gameStateManager.removeItem(character_name, item_name, quantity);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.tool(
    "update_currency",
    "Add or subtract currency for a character. Positive values add, negative values subtract. Floors at 0.",
    {
      character_name: z.string().describe("Character name"),
      cp: z.number().optional().describe("Copper pieces to add/subtract"),
      sp: z.number().optional().describe("Silver pieces to add/subtract"),
      ep: z.number().optional().describe("Electrum pieces to add/subtract"),
      gp: z.number().optional().describe("Gold pieces to add/subtract"),
      pp: z.number().optional().describe("Platinum pieces to add/subtract"),
    },
    async ({ character_name, cp, sp, ep, gp, pp }) => {
      wsClient.sendTypingIndicator(true);
      const changes: Partial<Record<"cp" | "sp" | "ep" | "gp" | "pp", number>> = {};
      if (cp !== undefined) changes.cp = cp;
      if (sp !== undefined) changes.sp = sp;
      if (ep !== undefined) changes.ep = ep;
      if (gp !== undefined) changes.gp = gp;
      if (pp !== undefined) changes.pp = pp;
      const result = wsClient.gameStateManager.updateCurrency(character_name, changes);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  // ─── Context Management ───

  server.tool(
    "compact_history",
    "Compact conversation history to free context space. Replaces older messages with your summary, keeping recent messages. Call during natural breaks when totalMessageCount is high.",
    {
      keep_recent: z.number().default(30).describe("Number of recent messages to keep (default 30)"),
      summary: z.string().describe("Your summary of the older events being compacted"),
    },
    async ({ keep_recent, summary }) => {
      const result = wsClient.gameStateManager.compactHistory(keep_recent, summary);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );
}
