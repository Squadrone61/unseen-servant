import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatGridPosition, parseGridPosition } from "@unseen-servant/shared/utils";
import { log } from "../logger.js";
import type { MessageQueue } from "../message-queue.js";
import type { WSClient } from "../ws-client.js";
import { buildResult, buildError } from "./tool-result.js";
import type { ToolResponse } from "../services/game-state-manager.js";

/** Convert a ToolResponse from GSM into an MCP CallToolResult */
function fromToolResponse(r: ToolResponse) {
  if (r.error) return buildError(r.text, r.hints);
  return buildResult({ text: r.text, data: r.data });
}

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
  // ─── Response Guard ───
  // Tracks whether send_response/acknowledge was called for the current request.
  // wait_for_message refuses to return the next message until the previous one is handled.
  let pendingRequestId: string | null = null;

  // ─── Core Game Loop ───

  server.registerTool(
    "wait_for_message",
    {
      description:
        "Block until a player message or DM request arrives. Returns { requestId, systemPrompt, messages, totalMessageCount }. Must call send_response or acknowledge before calling again.",
    },
    async (extra: { signal: AbortSignal }) => {
      log("game-tools", `wait_for_message CALLED, pendingRequestId=${pendingRequestId}`);
      // Guard: block if previous request wasn't responded to
      if (pendingRequestId) {
        log("game-tools", `wait_for_message BLOCKED: pending requestId=${pendingRequestId}`);
        return {
          content: [
            {
              type: "text" as const,
              text: `ERROR: You must call send_response(requestId: "${pendingRequestId}") or acknowledge(requestId: "${pendingRequestId}") before calling wait_for_message again. Players CANNOT see text you output to the terminal — you MUST use send_response to deliver your narrative.`,
            },
          ],
          isError: true,
        };
      }

      // If WS disconnects, rejectAllWaiters throws — let it surface to Claude Code
      // so it can re-call wait_for_message after reconnect (instead of silently retrying)
      let msg;
      try {
        msg = await messageQueue.waitForNext(extra.signal);
      } catch (err) {
        if (err instanceof Error && err.message === "DM disconnected — reconnecting") {
          // Clear pending guard — the old request is void after disconnect
          pendingRequestId = null;
          return {
            content: [
              {
                type: "text" as const,
                text: "WebSocket disconnected — the bridge is reconnecting automatically. Call wait_for_message again in a moment to resume.",
              },
            ],
            isError: true,
          };
        }
        throw err;
      }

      // DM is now processing — show typing indicator to players
      wsClient.sendTypingIndicator(true);

      // Track this request — must be responded to before next wait_for_message
      pendingRequestId = msg.requestId;
      log(
        "game-tools",
        `wait_for_message resolved: requestId=${msg.requestId}, messages=${msg.messages.length}`,
      );

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

  server.registerTool(
    "acknowledge",
    {
      description:
        "Silently observe a player message without responding. Clears the pending requestId.",
      inputSchema: {
        requestId: z.string().describe("The requestId from the dm_request to acknowledge"),
      },
    },
    async ({ requestId }) => {
      wsClient.sendTypingIndicator(false);
      pendingRequestId = null;
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

  server.registerTool(
    "send_response",
    {
      description:
        "Send the DM narrative response back to all players. Broadcasts the message and stores it in conversation history.",
      inputSchema: {
        requestId: z.string().describe("The requestId from the dm_request to respond to"),
        message: z
          .string()
          .optional()
          .describe("The DM narrative message to send back to the players"),
        text: z.string().optional().describe("Alias for message (backwards-compatible)"),
      },
    },
    async ({ requestId, message, text }) => {
      const narrative = message || text;
      if (!narrative) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ERROR: send_response requires a "message" parameter with the DM narrative.`,
            },
          ],
          isError: true,
        };
      }
      wsClient.sendDMResponse(requestId, narrative);
      wsClient.sendTypingIndicator(false);
      pendingRequestId = null;
      log("game-tools", `send_response: requestId=${requestId}, ${narrative.length} chars`);
      return {
        content: [
          {
            type: "text" as const,
            text: `Response sent for request ${requestId} (${narrative.length} chars)`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_players",
    { description: "Get the current player list with character summaries." },
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

  server.registerTool(
    "get_game_state",
    {
      description:
        "Game state snapshot. 'compact' (default): HP/conditions/turn order. 'tactical': +positions/distances/terrain. 'full': complete JSON dump.",
      inputSchema: {
        detail: z
          .enum(["compact", "tactical", "full"])
          .optional()
          .default("compact")
          .describe(
            "Level of detail (default: compact). 'compact' (~200 tokens), 'tactical' (~500 tokens with combat focus), 'full' (everything).",
          ),
      },
    },
    async ({ detail }) => {
      if (detail === "full") {
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
      }
      return fromToolResponse(wsClient.gameStateManager.getGameStateStratified(detail));
    },
  );

  server.registerTool(
    "get_character",
    {
      description:
        "Get a specific player's full character data including stats, HP, spell slots, conditions, inventory.",
      inputSchema: {
        name: z.string().describe("The character name to look up"),
      },
    },
    async ({ name }) => {
      const result = wsClient.gameStateManager.getCharacter(name);
      if (!result) {
        return {
          content: [{ type: "text" as const, text: `Character "${name}" not found` }],
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

  server.registerTool(
    "apply_damage",
    {
      description:
        "Deal damage to a character or combatant. Handles temp HP absorption automatically.",
      inputSchema: {
        target: z.string().describe("Name of the character or combatant to damage"),
        amount: z.coerce.number().describe("Amount of damage to deal"),
        damage_type: z
          .string()
          .optional()
          .describe("Type of damage (e.g., 'fire', 'slashing', 'psychic')"),
      },
    },
    async ({ target, amount, damage_type }) => {
      return fromToolResponse(wsClient.gameStateManager.applyDamage(target, amount, damage_type));
    },
  );

  server.registerTool(
    "heal",
    {
      description: "Restore HP to a character or combatant. Cannot exceed max HP.",
      inputSchema: {
        target: z.string().describe("Name of the character or combatant to heal"),
        amount: z.coerce.number().describe("Amount of HP to restore"),
      },
    },
    async ({ target, amount }) => {
      return fromToolResponse(wsClient.gameStateManager.heal(target, amount));
    },
  );

  server.registerTool(
    "set_hp",
    {
      description: "Set a character or combatant's HP to an exact value.",
      inputSchema: {
        target: z.string().describe("Name of the character or combatant"),
        value: z.coerce.number().describe("HP value to set"),
      },
    },
    async ({ target, value }) => {
      return fromToolResponse(wsClient.gameStateManager.setHP(target, value));
    },
  );

  server.registerTool(
    "add_condition",
    {
      description:
        "Add a condition to a character or combatant (e.g., poisoned, stunned, prone, frightened).",
      inputSchema: {
        target: z.string().describe("Name of the character or combatant"),
        condition: z.string().describe("Condition name (e.g., 'poisoned', 'stunned', 'prone')"),
        duration: z.coerce.number().optional().describe("Duration in rounds (optional)"),
      },
    },
    async ({ target, condition, duration }) => {
      return fromToolResponse(wsClient.gameStateManager.addCondition(target, condition, duration));
    },
  );

  server.registerTool(
    "remove_condition",
    {
      description: "Remove a condition from a character or combatant.",
      inputSchema: {
        target: z.string().describe("Name of the character or combatant"),
        condition: z.string().describe("Condition name to remove"),
      },
    },
    async ({ target, condition }) => {
      return fromToolResponse(wsClient.gameStateManager.removeCondition(target, condition));
    },
  );

  // ─── Combat Management ───

  server.registerTool(
    "start_combat",
    {
      description:
        "Initialize combat with a list of combatants. Initiative is rolled automatically. Creates turn order and broadcasts combat state.",
      inputSchema: {
        combatants: z
          .array(
            z.object({
              name: z.string().describe("Combatant name"),
              type: z.enum(["player", "npc", "enemy"]).describe("Combatant type"),
              initiativeModifier: z
                .number()
                .optional()
                .describe(
                  "Initiative modifier (Dex mod). Required for NPCs/enemies — look up the monster first. For players, auto-read from character sheet if omitted.",
                ),
              speed: z.coerce.number().optional().describe("Movement speed in feet (default 30)"),
              maxHP: z.coerce
                .number()
                .optional()
                .describe("Maximum HP (required for NPCs/enemies)"),
              currentHP: z.coerce.number().optional().describe("Current HP (defaults to maxHP)"),
              armorClass: z.coerce.number().optional().describe("Armor Class"),
              position: z
                .union([z.object({ x: z.coerce.number(), y: z.coerce.number() }), z.string()])
                .optional()
                .describe(
                  "Starting grid position in A1 notation (e.g. 'E5'). Also accepts {x, y} object but A1 is preferred.",
                ),
              size: z
                .enum(["tiny", "small", "medium", "large", "huge", "gargantuan"])
                .optional()
                .describe("Creature size (default medium)"),
              tokenColor: z.string().optional().describe("Token color for battle map"),
            }),
          )
          .describe("List of combatants to add to combat"),
      },
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
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "end_combat",
    {
      description:
        "End the current combat encounter. Clears combat state and returns to exploration.",
    },
    async () => {
      return fromToolResponse(wsClient.gameStateManager.endCombat());
    },
  );

  server.registerTool(
    "advance_turn",
    {
      description:
        "Move to the next combatant's turn in initiative order. Increments round counter on wrap-around.",
    },
    async () => {
      return fromToolResponse(wsClient.gameStateManager.advanceTurnMCP());
    },
  );

  server.registerTool(
    "add_combatant",
    {
      description:
        "Add a new combatant to active combat mid-fight (reinforcements, summoned creatures, etc.). Initiative is rolled automatically.",
      inputSchema: {
        name: z.string().describe("Combatant name"),
        type: z.enum(["player", "npc", "enemy"]).describe("Combatant type"),
        initiativeModifier: z
          .number()
          .optional()
          .describe(
            "Initiative modifier (Dex mod). Required for NPCs/enemies — look up the monster first. For players, auto-read from character sheet if omitted.",
          ),
        speed: z.coerce.number().optional().describe("Movement speed in feet"),
        maxHP: z.coerce.number().optional().describe("Maximum HP"),
        currentHP: z.coerce.number().optional().describe("Current HP"),
        armorClass: z.coerce.number().optional().describe("Armor Class"),
        position: z
          .union([z.object({ x: z.coerce.number(), y: z.coerce.number() }), z.string()])
          .optional()
          .describe("Grid position as {x, y} or A1 notation (e.g., 'C4')"),
        size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]).optional(),
        tokenColor: z.string().optional(),
      },
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
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "remove_combatant",
    {
      description: "Remove a combatant from combat (dead, fled, dismissed, etc.).",
      inputSchema: {
        name: z.string().describe("Name of the combatant to remove"),
      },
    },
    async ({ name }) => {
      return fromToolResponse(wsClient.gameStateManager.removeCombatant(name));
    },
  );

  server.registerTool(
    "move_combatant",
    {
      description:
        "Move a combatant's token on the battle map to a new position. Accepts A1 notation (e.g., 'E5') or x/y coordinates.",
      inputSchema: {
        name: z.string().describe("Name of the combatant to move"),
        position: z
          .string()
          .optional()
          .describe(
            "Grid position in A1 notation (e.g. 'E5'). Use this OR x/y, not both. Preferred over x/y.",
          ),
        x: z
          .number()
          .optional()
          .describe("Target X grid position (use 'position' param instead for A1 notation)"),
        y: z
          .number()
          .optional()
          .describe("Target Y grid position (use 'position' param instead for A1 notation)"),
      },
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
      return fromToolResponse(result);
    },
  );

  // ─── Spell Slots ───

  server.registerTool(
    "use_spell_slot",
    {
      description: "Expend a spell slot at a given level for a character.",
      inputSchema: {
        character_name: z.string().describe("Character name"),
        level: z.coerce.number().describe("Spell slot level (1-9)"),
      },
    },
    async ({ character_name, level }) => {
      const result = wsClient.gameStateManager.useSpellSlot(character_name, level);
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "restore_spell_slot",
    {
      description:
        "Restore a spell slot at a given level (e.g., after short rest, Arcane Recovery).",
      inputSchema: {
        character_name: z.string().describe("Character name"),
        level: z.coerce.number().describe("Spell slot level (1-9)"),
      },
    },
    async ({ character_name, level }) => {
      const result = wsClient.gameStateManager.restoreSpellSlot(character_name, level);
      return fromToolResponse(result);
    },
  );

  // ─── Class Resources ───

  server.registerTool(
    "use_class_resource",
    {
      description:
        "Expend a use of a class resource (e.g., Bardic Inspiration, Channel Divinity, Rage, Ki Points, Wild Shape, Lay on Hands).",
      inputSchema: {
        character_name: z.string().describe("Character name"),
        resource_name: z
          .string()
          .describe("Resource name (e.g., 'Channel Divinity', 'Rage', 'Bardic Inspiration')"),
      },
    },
    async ({ character_name, resource_name }) => {
      const result = wsClient.gameStateManager.useClassResource(character_name, resource_name);
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "restore_class_resource",
    {
      description:
        "Restore uses of a class resource (e.g., after a rest). Use amount=999 to fully restore.",
      inputSchema: {
        character_name: z.string().describe("Character name"),
        resource_name: z.string().describe("Resource name (e.g., 'Channel Divinity', 'Rage')"),
        amount: z
          .number()
          .optional()
          .describe("Number of uses to restore (default 1, use 999 to fully restore)"),
      },
    },
    async ({ character_name, resource_name, amount }) => {
      const result = wsClient.gameStateManager.restoreClassResource(
        character_name,
        resource_name,
        amount,
      );
      return fromToolResponse(result);
    },
  );

  // ─── Battle Map ───

  server.registerTool(
    "update_battle_map",
    {
      description:
        "Set or update the battle map grid. Define the grid dimensions, terrain tiles, and optional name.",
      inputSchema: {
        width: z.coerce.number().describe("Grid width in tiles"),
        height: z.coerce.number().describe("Grid height in tiles"),
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
                    category: z.enum([
                      "furniture",
                      "container",
                      "hazard",
                      "interactable",
                      "weapon",
                    ]),
                    destructible: z.boolean().optional(),
                    hp: z.coerce.number().optional(),
                    height: z.coerce.number().optional(),
                    description: z.string().optional(),
                  })
                  .optional(),
                elevation: z.coerce.number().optional(),
                cover: z.enum(["half", "three-quarters", "full"]).optional(),
                label: z.string().optional(),
              }),
            ),
          )
          .optional()
          .describe(
            "2D array of tiles [row][col] where [0][0] is top-left (A1). Each tile: { type, object?, cover?, elevation? }. Omitted tiles default to floor.",
          ),
      },
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
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "get_combat_summary",
    {
      description:
        "Get a compact combat summary: turn order, HP, conditions, positions, distances, active AoE.",
    },
    async () => {
      const result = wsClient.gameStateManager.getCombatSummary();
      return { content: [{ type: "text" as const, text: result ?? "No active combat" }] };
    },
  );

  server.registerTool(
    "get_map_info",
    {
      description:
        "Get a compact summary of the battle map showing all non-floor tiles with objects, cover, and elevation. Optionally query a specific area (e.g., 'C3:F6').",
      inputSchema: {
        area: z
          .string()
          .optional()
          .describe(
            "Optional area to query in 'A1:B2' format (e.g., 'C3:F6'). If omitted, returns all non-floor tiles.",
          ),
      },
    },
    async ({ area }) => {
      const result = wsClient.gameStateManager.getMapInfo(area);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "show_aoe",
    {
      description:
        "Display an AoE overlay on the battle map. Returns affected combatants. Shape params: sphere needs radius, cone/line need length + direction, cube needs length.",
      inputSchema: {
        shape: z.enum(["sphere", "cone", "line", "cube"]).describe("AoE shape"),
        center: z.string().describe("Center position in A1 notation (e.g., 'E8')"),
        radius: z.coerce.number().optional().describe("Radius in feet (for sphere)"),
        length: z.coerce.number().optional().describe("Length in feet (for line/cone)"),
        width: z.coerce.number().optional().describe("Width in feet (for line/cube)"),
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
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "apply_area_effect",
    {
      description:
        "Apply damage to all combatants in an area with saving throws. Shape params: sphere needs radius, cone/line need length + direction, cube needs length.",
      inputSchema: {
        shape: z.enum(["sphere", "cone", "line", "cube"]).describe("AoE shape"),
        center: z.string().describe("Center position in A1 notation"),
        radius: z.coerce.number().optional().describe("Radius in feet"),
        length: z.coerce.number().optional().describe("Length in feet"),
        width: z.coerce.number().optional().describe("Width in feet"),
        direction: z.coerce.number().optional().describe("Direction in degrees"),
        damage: z.string().describe("Damage dice notation (e.g., '8d6')"),
        damage_type: z.string().describe("Damage type (e.g., 'fire', 'cold')"),
        save_ability: z.string().describe("Saving throw ability (e.g., 'dexterity')"),
        save_dc: z.coerce.number().describe("Save DC"),
        half_on_save: z
          .boolean()
          .optional()
          .describe("Whether targets take half damage on a successful save (default true)"),
      },
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
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "dismiss_aoe",
    {
      description:
        "Remove a persistent AoE overlay from the battle map (e.g., when Wall of Fire or Fog Cloud ends).",
      inputSchema: {
        aoe_id: z.string().describe("The ID of the AoE overlay to dismiss"),
      },
    },
    async ({ aoe_id }) => {
      const result = wsClient.gameStateManager.dismissAoE(aoe_id);
      return fromToolResponse(result);
    },
  );

  // ─── Batch Effects ───

  server.registerTool(
    "apply_batch_effects",
    {
      description:
        "Apply multiple effects in a single call — damage, heal, conditions, movement. Max 10 effects.",
      inputSchema: {
        effects: z
          .array(
            z.discriminatedUnion("type", [
              z.object({
                type: z.literal("damage"),
                target: z.string().describe("Target name"),
                amount: z.coerce.number().describe("Damage amount"),
                damage_type: z.string().optional().describe("Damage type"),
              }),
              z.object({
                type: z.literal("heal"),
                target: z.string().describe("Target name"),
                amount: z.coerce.number().describe("Heal amount"),
              }),
              z.object({
                type: z.literal("set_hp"),
                target: z.string().describe("Target name"),
                value: z.coerce.number().describe("HP value"),
              }),
              z.object({
                type: z.literal("condition_add"),
                target: z.string().describe("Target name"),
                condition: z.string().describe("Condition name"),
                duration: z.coerce.number().optional().describe("Duration in rounds"),
              }),
              z.object({
                type: z.literal("condition_remove"),
                target: z.string().describe("Target name"),
                condition: z.string().describe("Condition name"),
              }),
              z.object({
                type: z.literal("move"),
                target: z.string().describe("Target name"),
                position: z.string().describe("Target position in A1 notation"),
              }),
            ]),
          )
          .max(10)
          .describe("Array of effects to apply (max 10)"),
      },
    },
    async ({ effects }) => {
      return fromToolResponse(wsClient.gameStateManager.applyBatchEffects(effects));
    },
  );

  // ─── Inventory & Currency ───

  server.registerTool(
    "add_item",
    {
      description:
        "Add an item to a character's inventory. Stacks by name if the item already exists.",
      inputSchema: {
        character_name: z.string().describe("Character name"),
        name: z.string().describe("Item name"),
        quantity: z.coerce.number().optional().describe("Quantity (default 1)"),
        type: z
          .string()
          .optional()
          .describe("Item type (e.g., 'Weapon', 'Armor', 'Gear', 'Potion')"),
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
        weight: z.coerce.number().optional().describe("Item weight in pounds"),
      },
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
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "remove_item",
    {
      description:
        "Remove an item from a character's inventory. Decrements quantity or removes entirely.",
      inputSchema: {
        character_name: z.string().describe("Character name"),
        item_name: z.string().describe("Item name to remove"),
        quantity: z.coerce.number().optional().describe("Quantity to remove (default: all)"),
      },
    },
    async ({ character_name, item_name, quantity }) => {
      const result = wsClient.gameStateManager.removeItem(character_name, item_name, quantity);
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "update_item",
    {
      description:
        "Modify an existing item in a character's inventory. Specify only the fields you want to change.",
      inputSchema: {
        character_name: z.string().describe("Character name"),
        item_name: z.string().describe("Item name to update (lookup key)"),
        equipped: z.boolean().optional().describe("Equip or unequip the item"),
        quantity: z.coerce.number().optional().describe("Set exact quantity"),
        is_attuned: z.boolean().optional().describe("Toggle attunement"),
        description: z.string().optional().describe("Update description"),
        damage: z.string().optional().describe("Update damage dice (e.g., '1d8', '2d6+1')"),
        damage_type: z
          .string()
          .optional()
          .describe("Update damage type (e.g., 'slashing', 'fire')"),
        properties: z
          .array(z.string())
          .optional()
          .describe("Update item properties (e.g., ['Versatile', 'Light'])"),
        armor_class: z.coerce.number().optional().describe("Update AC value"),
        attack_bonus: z.coerce.number().optional().describe("Update attack bonus"),
        range: z.string().optional().describe("Update range (e.g., '5 ft.', '20/60 ft.')"),
      },
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
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "update_currency",
    {
      description:
        "Add or subtract currency for a character. Use positive numbers to add, negative to subtract. Auto-converts from higher denominations when spending more than available.",
      inputSchema: {
        character_name: z.string().describe("Character name"),
        copper: z.coerce
          .number()
          .describe("Copper pieces delta (+add / -subtract). Pass 0 for no change."),
        silver: z.coerce
          .number()
          .describe("Silver pieces delta (+add / -subtract). Pass 0 for no change."),
        gold: z.coerce
          .number()
          .describe("Gold pieces delta (+add / -subtract). Pass 0 for no change."),
        platinum: z.coerce
          .number()
          .describe("Platinum pieces delta (+add / -subtract). Pass 0 for no change."),
        auto_convert: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Auto-convert from higher denominations when spending more than available (default: true)",
          ),
      },
    },
    async ({ character_name, copper, silver, gold, platinum, auto_convert }) => {
      const changes: Partial<Record<"cp" | "sp" | "gp" | "pp", number>> = {};
      if (copper) changes.cp = copper;
      if (silver) changes.sp = silver;
      if (gold) changes.gp = gold;
      if (platinum) changes.pp = platinum;
      const result = wsClient.gameStateManager.updateCurrency(
        character_name,
        changes,
        auto_convert ?? true,
      );
      return fromToolResponse(result);
    },
  );

  // ─── Heroic Inspiration ───

  server.registerTool(
    "grant_inspiration",
    {
      description:
        "Grant Heroic Inspiration to a character. The player can spend it for advantage on any d20 roll.",
      inputSchema: {
        character_name: z.string().describe("Character name"),
      },
    },
    async ({ character_name }) => {
      const result = wsClient.gameStateManager.grantInspiration(character_name);
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "use_inspiration",
    {
      description: "Spend a character's Heroic Inspiration to gain advantage on a d20 roll.",
      inputSchema: {
        character_name: z.string().describe("Character name"),
      },
    },
    async ({ character_name }) => {
      const result = wsClient.gameStateManager.useInspiration(character_name);
      return fromToolResponse(result);
    },
  );

  // ─── Context Management ───

  server.registerTool(
    "compact_history",
    {
      description:
        "Compact conversation history by replacing older messages with a summary, keeping recent ones.",
      inputSchema: {
        keep_recent: z
          .number()
          .default(30)
          .describe("Number of recent messages to keep (default 30)"),
        summary: z
          .string()
          .describe(
            "Prose summary of older events to preserve (2-4 sentences, e.g. 'The party fought goblins, looted a cave, and rested at the inn.')",
          ),
      },
    },
    async ({ keep_recent, summary }) => {
      const result = wsClient.gameStateManager.compactHistory(keep_recent, summary);
      return fromToolResponse(result);
    },
  );

  // ─── Rest Tools ───

  server.registerTool(
    "short_rest",
    {
      description:
        "Process a short rest for specified characters. Restores short-rest class resources and Warlock pact magic slots. Does NOT auto-heal — Hit Dice healing requires interactive player choice.",
      inputSchema: {
        character_names: z.array(z.string()).describe("Names of characters taking the short rest"),
      },
    },
    async ({ character_names }) => {
      const result = wsClient.gameStateManager.shortRest(character_names);
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "long_rest",
    {
      description:
        "Process a long rest for specified characters. Restores full HP, all spell slots, all class resources, resets death saves, clears non-permanent conditions.",
      inputSchema: {
        character_names: z.array(z.string()).describe("Names of characters taking the long rest"),
      },
    },
    async ({ character_names }) => {
      const result = wsClient.gameStateManager.longRest(character_names);
      return fromToolResponse(result);
    },
  );

  // ─── Death Saves ───

  server.registerTool(
    "death_save",
    {
      description:
        "Record a death saving throw for a character at 0 HP. Tracks successes/failures, auto-stabilizes at 3 successes, marks dead at 3 failures.",
      inputSchema: {
        character_name: z.string().describe("Character name"),
        success: z.boolean().describe("Whether the death save succeeded"),
      },
    },
    async ({ character_name, success }) => {
      const result = wsClient.gameStateManager.recordDeathSave(character_name, success);
      return fromToolResponse(result);
    },
  );

  // ─── Concentration ───

  server.registerTool(
    "set_concentration",
    {
      description:
        "Set a character or combatant as concentrating on a spell. Auto-breaks any previous concentration.",
      inputSchema: {
        target: z.string().describe("Name of the character or combatant"),
        spell_name: z.string().describe("Name of the concentration spell"),
      },
    },
    async ({ target, spell_name }) => {
      const result = wsClient.gameStateManager.setConcentration(target, spell_name);
      return fromToolResponse(result);
    },
  );

  server.registerTool(
    "break_concentration",
    {
      description:
        "Break a character or combatant's concentration, ending their concentration spell.",
      inputSchema: {
        target: z.string().describe("Name of the character or combatant"),
      },
    },
    async ({ target }) => {
      const result = wsClient.gameStateManager.breakConcentration(target);
      return fromToolResponse(result);
    },
  );

  // ─── Temp HP ───

  server.registerTool(
    "set_temp_hp",
    {
      description:
        "Set temporary HP for a character or combatant. Non-stacking: takes the higher of current temp HP and new amount.",
      inputSchema: {
        target: z.string().describe("Name of the character or combatant"),
        amount: z.coerce.number().describe("Amount of temporary HP"),
      },
    },
    async ({ target, amount }) => {
      return fromToolResponse(wsClient.gameStateManager.setTempHP(target, amount));
    },
  );

  // ─── Encounter Difficulty ───

  server.registerTool(
    "calculate_encounter_difficulty",
    {
      description:
        "Calculate encounter difficulty given party levels and monster CRs. Uses 2024 encounter building rules.",
      inputSchema: {
        party_levels: z.array(z.coerce.number()).describe("Array of party member levels"),
        monster_crs: z
          .array(z.string())
          .describe("Array of monster CRs as strings (e.g., '1/4', '2', '5')"),
      },
    },
    async ({ party_levels, monster_crs }) => {
      const { calculateEncounterDifficulty } = await import("@unseen-servant/shared/utils");
      const result = calculateEncounterDifficulty(party_levels, monster_crs);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
