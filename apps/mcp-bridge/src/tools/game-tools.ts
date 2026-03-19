import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatGridPosition, parseGridPosition } from "@unseen-servant/shared/utils";
import type { MessageQueue } from "../message-queue.js";
import type { WSClient } from "../ws-client.js";

// Format positions in combat state for AI readability
function formatPositionsForOutput(state: any): any {
  // Deep clone to avoid mutating game state
  const output = JSON.parse(JSON.stringify(state));
  if (output.gameState?.encounter?.combat?.combatants) {
    for (const c of Object.values(output.gameState.encounter.combat.combatants) as any[]) {
      if (c.position) {
        c.position = formatGridPosition(c.position);
      }
    }
  }
  return output;
}

export function registerGameTools(
  server: McpServer,
  messageQueue: MessageQueue,
  wsClient: WSClient,
): void {
  // ─── Core Game Loop ───

  server.tool(
    "wait_for_message",
    "Block until a player message or DM request arrives via WebSocket. Returns the request with systemPrompt and conversation messages. This is the main loop driver — call this repeatedly to process game turns.",
    {},
    async (_args: Record<string, never>, extra: { signal: AbortSignal }) => {
      // Retry on disconnect — rejectAllWaiters throws when DM connection drops
      wsClient.sendTypingIndicator(false);
      let msg;
      while (true) {
        try {
          msg = await messageQueue.waitForNext(extra.signal);
          break;
        } catch (err) {
          if (err instanceof Error && err.message === "DM disconnected — reconnecting") {
            // Wait briefly for reconnection, then retry
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          throw err;
        }
      }

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
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "acknowledge",
    "Silently observe player messages without sending a visible response. Use when players are talking to each other, roleplaying between characters, or having conversations that don't need DM input.",
    {
      requestId: z.string().describe("The requestId from the dm_request to acknowledge"),
    },
    async ({ requestId }) => {
      return {
        content: [
          {
            type: "text" as const,
            text: `Acknowledged request ${requestId} — no response sent to players.`,
          },
        ],
      };
    },
  );

  server.tool(
    "send_response",
    "Send the DM narrative response back to all players. This broadcasts the AI message, stores it in conversation history, and updates game state.",
    {
      requestId: z.string().describe("The requestId from the dm_request to respond to"),
      text: z.string().describe("The DM narrative text to send back to the players"),
    },
    async ({ requestId, text }) => {
      wsClient.sendDMResponse(requestId, text);
      return {
        content: [
          {
            type: "text" as const,
            text: `Response sent for request ${requestId} (${text.length} chars)`,
          },
        ],
      };
    },
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
              2,
            ),
          },
        ],
      };
    },
  );

  // ─── State Query Tools ───

  server.tool(
    "get_game_state",
    "Get the full game state snapshot including combat, encounter, pending checks, event log, and all characters.",
    {},
    async () => {
      const state = wsClient.gameStateManager.getGameState();
      const output = formatPositionsForOutput(state);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    },
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
      // Format combatant position as A1 notation if in combat
      const output = JSON.parse(JSON.stringify(result));
      if (
        output.combatant?.position &&
        typeof output.combatant.position === "object" &&
        "x" in output.combatant.position
      ) {
        output.combatant.position = formatGridPosition(output.combatant.position);
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    },
  );

  // ─── HP & Conditions ───

  server.tool(
    "apply_damage",
    "Deal damage to a character or combatant. Handles temp HP absorption automatically. Use for monster attacks, traps, environmental damage.",
    {
      target: z.string().describe("Name of the character or combatant to damage"),
      amount: z.number().describe("Amount of damage to deal"),
      damage_type: z
        .string()
        .optional()
        .describe("Type of damage (e.g., 'fire', 'slashing', 'psychic')"),
    },
    async ({ target, amount, damage_type }) => {
      const result = wsClient.gameStateManager.applyDamage(target, amount, damage_type);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "heal",
    "Restore HP to a character or combatant. Cannot exceed max HP.",
    {
      target: z.string().describe("Name of the character or combatant to heal"),
      amount: z.number().describe("Amount of HP to restore"),
    },
    async ({ target, amount }) => {
      const result = wsClient.gameStateManager.heal(target, amount);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "set_hp",
    "Set a character or combatant's HP to an exact value. Useful for special effects or corrections.",
    {
      target: z.string().describe("Name of the character or combatant"),
      value: z.number().describe("HP value to set"),
    },
    async ({ target, value }) => {
      const result = wsClient.gameStateManager.setHP(target, value);
      return { content: [{ type: "text" as const, text: result }] };
    },
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
      const result = wsClient.gameStateManager.addCondition(target, condition, duration);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "remove_condition",
    "Remove a condition from a character or combatant.",
    {
      target: z.string().describe("Name of the character or combatant"),
      condition: z.string().describe("Condition name to remove"),
    },
    async ({ target, condition }) => {
      const result = wsClient.gameStateManager.removeCondition(target, condition);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  // ─── Combat Management ───

  server.tool(
    "start_combat",
    "Initialize combat with a list of combatants. Initiative is rolled automatically by the system for all combatants. Creates turn order and broadcasts combat state to all players.",
    {
      combatants: z
        .array(
          z.object({
            name: z.string().describe("Combatant name"),
            type: z.enum(["player", "npc", "enemy"]).describe("Combatant type"),
            initiativeModifier: z
              .number()
              .optional()
              .describe(
                "Initiative modifier (Dex mod). For players, auto-read from character sheet if omitted.",
              ),
            speed: z.number().optional().describe("Movement speed in feet (default 30)"),
            maxHP: z.number().optional().describe("Maximum HP (required for NPCs/enemies)"),
            currentHP: z.number().optional().describe("Current HP (defaults to maxHP)"),
            armorClass: z.number().optional().describe("Armor Class"),
            position: z
              .union([z.object({ x: z.number(), y: z.number() }), z.string()])
              .optional()
              .describe("Starting grid position as {x, y} or A1 notation (e.g., 'E5')"),
            size: z
              .enum(["tiny", "small", "medium", "large", "huge", "gargantuan"])
              .optional()
              .describe("Creature size (default medium)"),
            tokenColor: z.string().optional().describe("Token color for battle map"),
          }),
        )
        .describe("List of combatants to add to combat"),
    },
    async ({ combatants }) => {
      // Parse A1 notation positions to {x, y}
      const parsed = combatants.map((c) => {
        if (typeof c.position === "string") {
          const pos = parseGridPosition(c.position);
          return { ...c, position: pos ?? undefined };
        }
        return c as typeof c & { position?: { x: number; y: number } };
      });
      const result = wsClient.gameStateManager.startCombat(parsed);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "end_combat",
    "End the current combat encounter. Clears combat state and returns to exploration.",
    {},
    async () => {
      const result = wsClient.gameStateManager.endCombat();
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "advance_turn",
    "Move to the next combatant's turn in initiative order. Increments round counter on wrap-around.",
    {},
    async () => {
      const result = wsClient.gameStateManager.advanceTurnMCP();
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "add_combatant",
    "Add a new combatant to active combat mid-fight (reinforcements, summoned creatures, etc.). Initiative is rolled automatically.",
    {
      name: z.string().describe("Combatant name"),
      type: z.enum(["player", "npc", "enemy"]).describe("Combatant type"),
      initiativeModifier: z
        .number()
        .optional()
        .describe(
          "Initiative modifier (Dex mod). For players, auto-read from character sheet if omitted.",
        ),
      speed: z.number().optional().describe("Movement speed in feet"),
      maxHP: z.number().optional().describe("Maximum HP"),
      currentHP: z.number().optional().describe("Current HP"),
      armorClass: z.number().optional().describe("Armor Class"),
      position: z
        .union([z.object({ x: z.number(), y: z.number() }), z.string()])
        .optional()
        .describe("Grid position as {x, y} or A1 notation (e.g., 'C4')"),
      size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]).optional(),
      tokenColor: z.string().optional(),
    },
    async (params) => {
      // Parse A1 notation position to {x, y}
      let position = params.position;
      if (typeof position === "string") {
        position = parseGridPosition(position) ?? undefined;
      }
      const result = wsClient.gameStateManager.addCombatant({
        ...params,
        position: position as { x: number; y: number } | undefined,
      });
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "remove_combatant",
    "Remove a combatant from combat (dead, fled, dismissed, etc.).",
    {
      name: z.string().describe("Name of the combatant to remove"),
    },
    async ({ name }) => {
      const result = wsClient.gameStateManager.removeCombatant(name);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "move_combatant",
    "Move a combatant's token on the battle map to a new position. Accepts A1 notation (e.g., 'E5') or x/y coordinates.",
    {
      name: z.string().describe("Name of the combatant to move"),
      position: z
        .string()
        .optional()
        .describe("Target position in A1 notation (e.g., 'E5'). Preferred over x/y."),
      x: z
        .number()
        .optional()
        .describe("Target X grid position (use 'position' param instead for A1 notation)"),
      y: z
        .number()
        .optional()
        .describe("Target Y grid position (use 'position' param instead for A1 notation)"),
    },
    async ({ name, position, x, y }) => {
      let target: { x: number; y: number };
      if (position) {
        const parsed = parseGridPosition(position);
        if (!parsed) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Invalid position "${position}" — use A1 notation (e.g., 'E5')`,
              },
            ],
          };
        }
        target = parsed;
      } else if (x !== undefined && y !== undefined) {
        target = { x, y };
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: "Must provide either 'position' (A1 notation) or both 'x' and 'y'",
            },
          ],
        };
      }
      const result = wsClient.gameStateManager.moveCombatant(name, target);
      return { content: [{ type: "text" as const, text: result }] };
    },
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
      const result = wsClient.gameStateManager.useSpellSlot(character_name, level);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "restore_spell_slot",
    "Restore a spell slot at a given level (e.g., after short rest, Arcane Recovery).",
    {
      character_name: z.string().describe("Character name"),
      level: z.number().describe("Spell slot level (1-9)"),
    },
    async ({ character_name, level }) => {
      const result = wsClient.gameStateManager.restoreSpellSlot(character_name, level);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  // ─── Class Resources ───

  server.tool(
    "use_class_resource",
    "Expend a use of a class resource (e.g., Bardic Inspiration, Channel Divinity, Rage, Ki Points, Wild Shape, Lay on Hands).",
    {
      character_name: z.string().describe("Character name"),
      resource_name: z
        .string()
        .describe("Resource name (e.g., 'Channel Divinity', 'Rage', 'Bardic Inspiration')"),
    },
    async ({ character_name, resource_name }) => {
      const result = wsClient.gameStateManager.useClassResource(character_name, resource_name);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "restore_class_resource",
    "Restore uses of a class resource (e.g., after a rest). Use amount=999 to fully restore.",
    {
      character_name: z.string().describe("Character name"),
      resource_name: z.string().describe("Resource name (e.g., 'Channel Divinity', 'Rage')"),
      amount: z
        .number()
        .optional()
        .describe("Number of uses to restore (default 1, use 999 to fully restore)"),
    },
    async ({ character_name, resource_name, amount }) => {
      const result = wsClient.gameStateManager.restoreClassResource(
        character_name,
        resource_name,
        amount,
      );
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  // ─── Battle Map ───

  server.tool(
    "update_battle_map",
    "Set or update the battle map grid. Define the grid dimensions, terrain tiles, and optional name.",
    {
      width: z.number().describe("Grid width in tiles"),
      height: z.number().describe("Grid height in tiles"),
      name: z.string().optional().describe("Map name (e.g., 'Goblin Cave', 'Town Square')"),
      tiles: z
        .array(
          z.array(
            z.object({
              type: z.enum([
                "floor",
                "wall",
                "difficult_terrain",
                "water",
                "pit",
                "door",
                "stairs",
              ]),
              object: z
                .object({
                  name: z.string(),
                  category: z.enum(["furniture", "container", "hazard", "interactable", "weapon"]),
                  destructible: z.boolean().optional(),
                  hp: z.number().optional(),
                  height: z.number().optional(),
                  description: z.string().optional(),
                })
                .optional(),
              elevation: z.number().optional(),
              cover: z.enum(["half", "three-quarters", "full"]).optional(),
              label: z.string().optional(),
            }),
          ),
        )
        .optional()
        .describe("2D array of tiles [y][x]. If omitted, all floor."),
    },
    async ({ width, height, name, tiles }) => {
      const mapTiles =
        tiles ??
        Array.from({ length: height }, () =>
          Array.from({ length: width }, () => ({ type: "floor" as const })),
        );

      const result = wsClient.gameStateManager.updateBattleMap({
        id: crypto.randomUUID(),
        width,
        height,
        tiles: mapTiles,
        name,
      });
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "get_combat_summary",
    "Get a compact combat summary optimized for tactical decisions. Shows turn order, HP, conditions, positions, distances, and active AoE — much more concise than get_game_state.",
    {},
    async () => {
      const result = wsClient.gameStateManager.getCombatSummary();
      return { content: [{ type: "text" as const, text: result ?? "No active combat" }] };
    },
  );

  server.tool(
    "get_map_info",
    "Get a compact summary of the battle map showing all non-floor tiles with objects, cover, and elevation. Optionally query a specific area (e.g., 'C3:F6').",
    {
      area: z
        .string()
        .optional()
        .describe(
          "Optional area to query in 'A1:B2' format (e.g., 'C3:F6'). If omitted, returns all non-floor tiles.",
        ),
    },
    async ({ area }) => {
      const result = wsClient.gameStateManager.getMapInfo(area);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "show_aoe",
    "Display an Area of Effect overlay on the battle map. AI picks the center and color narratively. Returns a list of affected combatants so you can confirm with the player before applying effects.",
    {
      shape: z.enum(["sphere", "cone", "line", "cube"]).describe("AoE shape"),
      center: z.string().describe("Center position in A1 notation (e.g., 'E8')"),
      radius: z.number().optional().describe("Radius in feet (for sphere)"),
      length: z.number().optional().describe("Length in feet (for line/cone)"),
      width: z.number().optional().describe("Width in feet (for line/cube)"),
      direction: z
        .number()
        .optional()
        .describe("Direction in degrees (0=north, 90=east) for cone/line"),
      color: z.string().describe("RGB hex color (e.g., '#FF6B35' for fire, '#4FC3F7' for ice)"),
      label: z.string().describe("Spell/effect name (e.g., 'Fireball')"),
      persistent: z
        .boolean()
        .optional()
        .describe("Whether this AoE stays on the map until dismissed (default false)"),
      caster_name: z.string().optional().describe("Name of the caster"),
    },
    async ({
      shape,
      center,
      radius,
      length,
      width,
      direction,
      color,
      label,
      persistent,
      caster_name,
    }) => {
      const result = wsClient.gameStateManager.showAoE({
        shape,
        center,
        radius,
        length,
        width,
        direction,
        color,
        label,
        persistent: persistent ?? false,
        casterName: caster_name,
      });
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "apply_area_effect",
    "Apply damage to all combatants in an area. Each target makes a saving throw; damage is applied based on pass/fail. Use after show_aoe to confirm targeting.",
    {
      shape: z.enum(["sphere", "cone", "line", "cube"]).describe("AoE shape"),
      center: z.string().describe("Center position in A1 notation"),
      radius: z.number().optional().describe("Radius in feet"),
      length: z.number().optional().describe("Length in feet"),
      width: z.number().optional().describe("Width in feet"),
      direction: z.number().optional().describe("Direction in degrees"),
      damage: z.string().describe("Damage dice notation (e.g., '8d6')"),
      damage_type: z.string().describe("Damage type (e.g., 'fire', 'cold')"),
      save_ability: z.string().describe("Saving throw ability (e.g., 'dexterity')"),
      save_dc: z.number().describe("Save DC"),
      half_on_save: z
        .boolean()
        .optional()
        .describe("Whether targets take half damage on a successful save (default true)"),
    },
    async ({
      shape,
      center,
      radius,
      length,
      width,
      direction,
      damage,
      damage_type,
      save_ability,
      save_dc,
      half_on_save,
    }) => {
      const result = wsClient.gameStateManager.applyAreaEffect({
        shape,
        center,
        radius,
        length,
        width,
        direction,
        damage,
        damageType: damage_type,
        saveAbility: save_ability,
        saveDC: save_dc,
        halfOnSave: half_on_save ?? true,
      });
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "dismiss_aoe",
    "Remove a persistent AoE overlay from the battle map (e.g., when Wall of Fire or Fog Cloud ends).",
    {
      aoe_id: z.string().describe("The ID of the AoE overlay to dismiss"),
    },
    async ({ aoe_id }) => {
      const result = wsClient.gameStateManager.dismissAoE(aoe_id);
      return { content: [{ type: "text" as const, text: result }] };
    },
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
      rarity: z
        .string()
        .optional()
        .describe("Rarity (Common, Uncommon, Rare, Very Rare, Legendary)"),
      is_magic_item: z.boolean().optional().describe("Whether this is a magic item"),
      damage: z.string().optional().describe("Damage dice (e.g., '1d8', '2d6')"),
      damage_type: z.string().optional().describe("Damage type (e.g., 'slashing', 'fire')"),
      properties: z
        .array(z.string())
        .optional()
        .describe("Item properties (e.g., ['Versatile', 'Light'])"),
      weight: z.number().optional().describe("Item weight in pounds"),
    },
    async ({
      character_name,
      name,
      quantity,
      type,
      description,
      rarity,
      is_magic_item,
      damage,
      damage_type,
      properties,
      weight,
    }) => {
      const result = wsClient.gameStateManager.addItem(character_name, {
        name,
        quantity,
        type,
        description,
        rarity,
        isMagicItem: is_magic_item,
        damage,
        damageType: damage_type,
        properties,
        weight,
      });
      return { content: [{ type: "text" as const, text: result }] };
    },
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
      const result = wsClient.gameStateManager.removeItem(character_name, item_name, quantity);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "update_item",
    "Modify an existing item in a character's inventory — equip/unequip, toggle attunement, change quantity, update description, or set combat stats.",
    {
      character_name: z.string().describe("Character name"),
      item_name: z.string().describe("Item name to update (lookup key)"),
      equipped: z.boolean().optional().describe("Equip or unequip the item"),
      quantity: z.number().optional().describe("Set exact quantity"),
      is_attuned: z.boolean().optional().describe("Toggle attunement"),
      description: z.string().optional().describe("Update description"),
      damage: z.string().optional().describe("Update damage dice (e.g., '1d8', '2d6+1')"),
      damage_type: z.string().optional().describe("Update damage type (e.g., 'slashing', 'fire')"),
      properties: z
        .array(z.string())
        .optional()
        .describe("Update item properties (e.g., ['Versatile', 'Light'])"),
      armor_class: z.number().optional().describe("Update AC value"),
      attack_bonus: z.number().optional().describe("Update attack bonus"),
      range: z.string().optional().describe("Update range (e.g., '5 ft.', '20/60 ft.')"),
    },
    async ({
      character_name,
      item_name,
      equipped,
      quantity,
      is_attuned,
      description,
      damage,
      damage_type,
      properties,
      armor_class,
      attack_bonus,
      range,
    }) => {
      const updates: Record<string, unknown> = {};
      if (equipped !== undefined) updates.equipped = equipped;
      if (quantity !== undefined) updates.quantity = quantity;
      if (is_attuned !== undefined) updates.isAttuned = is_attuned;
      if (description !== undefined) updates.description = description;
      if (damage !== undefined) updates.damage = damage;
      if (damage_type !== undefined) updates.damageType = damage_type;
      if (properties !== undefined) updates.properties = properties;
      if (armor_class !== undefined) updates.armorClass = armor_class;
      if (attack_bonus !== undefined) updates.attackBonus = attack_bonus;
      if (range !== undefined) updates.range = range;
      const result = wsClient.gameStateManager.updateItem(character_name, item_name, updates);
      return { content: [{ type: "text" as const, text: result }] };
    },
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
      const changes: Partial<Record<"cp" | "sp" | "ep" | "gp" | "pp", number>> = {};
      if (cp !== undefined) changes.cp = cp;
      if (sp !== undefined) changes.sp = sp;
      if (ep !== undefined) changes.ep = ep;
      if (gp !== undefined) changes.gp = gp;
      if (pp !== undefined) changes.pp = pp;
      const result = wsClient.gameStateManager.updateCurrency(character_name, changes);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  // ─── Heroic Inspiration ───

  server.tool(
    "grant_inspiration",
    "Grant Heroic Inspiration to a character. The player can spend it for advantage on any d20 roll.",
    {
      character_name: z.string().describe("Character name"),
    },
    async ({ character_name }) => {
      const result = wsClient.gameStateManager.grantInspiration(character_name);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "use_inspiration",
    "Spend a character's Heroic Inspiration to gain advantage on a d20 roll.",
    {
      character_name: z.string().describe("Character name"),
    },
    async ({ character_name }) => {
      const result = wsClient.gameStateManager.useInspiration(character_name);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  // ─── Context Management ───

  server.tool(
    "compact_history",
    "Compact conversation history to free context space. Replaces older messages with your summary, keeping recent messages. Call during natural breaks when totalMessageCount is high.",
    {
      keep_recent: z
        .number()
        .default(30)
        .describe("Number of recent messages to keep (default 30)"),
      summary: z.string().describe("Your summary of the older events being compacted"),
    },
    async ({ keep_recent, summary }) => {
      const result = wsClient.gameStateManager.compactHistory(keep_recent, summary);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  // ─── Rest Tools ───

  server.tool(
    "short_rest",
    "Process a short rest for specified characters. Restores short-rest class resources and Warlock pact magic slots. Does NOT auto-heal — Hit Dice healing requires interactive player choice.",
    {
      character_names: z.array(z.string()).describe("Names of characters taking the short rest"),
    },
    async ({ character_names }) => {
      const result = wsClient.gameStateManager.shortRest(character_names);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "long_rest",
    "Process a long rest for specified characters. Restores full HP, all spell slots, all class resources, resets death saves, clears non-permanent conditions.",
    {
      character_names: z.array(z.string()).describe("Names of characters taking the long rest"),
    },
    async ({ character_names }) => {
      const result = wsClient.gameStateManager.longRest(character_names);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  // ─── Death Saves ───

  server.tool(
    "death_save",
    "Record a death saving throw for a character at 0 HP. Tracks successes/failures, auto-stabilizes at 3 successes, marks dead at 3 failures.",
    {
      character_name: z.string().describe("Character name"),
      success: z.boolean().describe("Whether the death save succeeded"),
    },
    async ({ character_name, success }) => {
      const result = wsClient.gameStateManager.recordDeathSave(character_name, success);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  // ─── Concentration ───

  server.tool(
    "set_concentration",
    "Set a character or combatant as concentrating on a spell. Auto-breaks any previous concentration.",
    {
      target: z.string().describe("Name of the character or combatant"),
      spell_name: z.string().describe("Name of the concentration spell"),
    },
    async ({ target, spell_name }) => {
      const result = wsClient.gameStateManager.setConcentration(target, spell_name);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.tool(
    "break_concentration",
    "Break a character or combatant's concentration, ending their concentration spell.",
    {
      target: z.string().describe("Name of the character or combatant"),
    },
    async ({ target }) => {
      const result = wsClient.gameStateManager.breakConcentration(target);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  // ─── Temp HP ───

  server.tool(
    "set_temp_hp",
    "Set temporary HP for a character or combatant. Non-stacking: takes the higher of current temp HP and new amount.",
    {
      target: z.string().describe("Name of the character or combatant"),
      amount: z.number().describe("Amount of temporary HP"),
    },
    async ({ target, amount }) => {
      const result = wsClient.gameStateManager.setTempHP(target, amount);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  // ─── Encounter Difficulty ───

  server.tool(
    "calculate_encounter_difficulty",
    "Calculate encounter difficulty given party levels and monster CRs. Uses 2024 encounter building rules.",
    {
      party_levels: z.array(z.number()).describe("Array of party member levels"),
      monster_crs: z
        .array(z.string())
        .describe("Array of monster CRs as strings (e.g., '1/4', '2', '5')"),
    },
    async ({ party_levels, monster_crs }) => {
      const { calculateEncounterDifficulty } = await import("@unseen-servant/shared/utils");
      const result = calculateEncounterDifficulty(party_levels, monster_crs);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
