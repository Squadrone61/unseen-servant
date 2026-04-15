import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatGridPosition, parseGridPosition } from "@unseen-servant/shared/utils";
import { resolveActionRef, getBaseItem } from "@unseen-servant/shared/data";
import type { ActionRef } from "@unseen-servant/shared/data";
import { getWeaponAttack } from "@unseen-servant/shared/character";
import { getAction } from "@unseen-servant/shared";
import { rollNotation } from "../services/dice-engine.js";
import { log } from "../logger.js";
import type { MessageQueue } from "../message-queue.js";
import type { WSClient } from "../ws-client.js";
import { buildResult, buildError } from "./tool-result.js";
import type { ToolResponse } from "../services/game-state-manager.js";
import type { GameLogger } from "../services/game-logger.js";

// Format positions in combat state for AI readability
function formatPositionsForOutput(state: unknown): unknown {
  // Deep clone to avoid mutating game state
  const output = JSON.parse(JSON.stringify(state)) as {
    gameState?: {
      encounter?: {
        combat?: { combatants?: Record<string, { position?: { x: number; y: number } }> };
      };
    };
  };
  const combatants = output.gameState?.encounter?.combat?.combatants;
  if (combatants) {
    for (const c of Object.values(combatants)) {
      if (c.position) {
        (c as { position: string | { x: number; y: number } }).position = formatGridPosition(
          c.position,
        );
      }
    }
  }
  return output;
}

/**
 * Zod schema for an ActionRef — used by apply_damage, apply_area_effect, show_aoe, roll_dice.
 * Callers provide either explicit damage/save/area args OR actionRef; actionRef auto-resolves
 * damage dice, save ability, DC, and area shape from the DB entity's ActionEffect.
 */
const actionRefSchema = z
  .object({
    source: z
      .enum(["spell", "weapon", "item", "monster"])
      .describe("Which DB category the entity belongs to"),
    name: z.string().describe("Entity name (e.g., 'Fireball', 'Longsword', 'Adult Red Dragon')"),
    monsterActionName: z
      .string()
      .optional()
      .describe(
        "Required when source='monster': the specific action entry name within the monster stat block",
      ),
  })
  .describe(
    "Reference to a DB entity whose ActionEffect provides damage dice, save DC/ability, and area shape automatically",
  );

export function registerGameTools(
  server: McpServer,
  messageQueue: MessageQueue,
  wsClient: WSClient,
  gameLogger: GameLogger,
): void {
  // Rate-limited player-facing activity pings so long tool chains don't look silent.
  // Rotates through generic atmospheric lines per tool category; at most one per 2.5s.
  const TOOL_ACTIVITY_LABEL: Record<string, string> = {
    apply_damage: "The DM tallies the wound…",
    heal: "Healing magic weaves through the scene…",
    start_combat: "Initiative is called…",
    advance_turn: "Turn ticks forward…",
    add_combatant: "A new combatant enters the fray…",
    move_combatant: "Tokens shift on the map…",
    show_aoe: "The DM prepares an area effect…",
    apply_area_effect: "The DM resolves the area effect…",
    update_battle_map: "The battlefield takes shape…",
    use_spell_slot: "Arcane power is spent…",
    use_class_resource: "A hero draws on their reserves…",
    set_concentration: "A spell takes hold…",
    break_concentration: "Concentration falters…",
    add_condition: "A condition takes hold…",
    remove_condition: "A condition fades…",
    long_rest: "The party settles in for a long rest…",
    short_rest: "The party takes a short rest…",
  };
  function maybePingActivity(toolName: string): void {
    const label = TOOL_ACTIVITY_LABEL[toolName];
    if (!label) return;
    wsClient.pingActivity(label);
  }

  /** Convert a ToolResponse from GSM into an MCP CallToolResult, logging the call. */
  function fromToolResponse(r: ToolResponse, toolName: string, args?: Record<string, unknown>) {
    gameLogger.toolCall(toolName, args ?? {}, r.text);
    if (!r.error) maybePingActivity(toolName);
    if (r.error) {
      gameLogger.error(toolName, r.text);
      return buildError(r.text, r.hints);
    }
    return buildResult({ text: r.text, data: r.data });
  }

  // ─── Response Guard ───
  // Tracks whether send_response/acknowledge was called for the current request.
  // wait_for_message refuses to return the next message until the previous one is handled.
  let pendingRequestId: string | null = null;

  // ─── Core Game Loop ───

  server.registerTool(
    "wait_for_message",
    {
      description:
        "Block until a player message or DM request arrives. Returns { requestId, messages, totalMessageCount }. Must call send_response or acknowledge before calling again.",
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
        message: z.string().describe("The DM narrative message to send back to the players"),
      },
    },
    async ({ requestId, message }) => {
      wsClient.sendDMResponse(requestId, message);
      wsClient.sendTypingIndicator(false);
      pendingRequestId = null;
      log("game-tools", `send_response: requestId=${requestId}, ${message.length} chars`);
      return {
        content: [
          {
            type: "text" as const,
            text: `Response sent for request ${requestId} (${message.length} chars)`,
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
      return fromToolResponse(
        wsClient.gameStateManager.getGameStateStratified(detail),
        "get_game_state",
        { detail },
      );
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
        gameLogger.toolCall("get_character", { name }, `Character "${name}" not found`);
        return {
          content: [{ type: "text" as const, text: `Character "${name}" not found` }],
        };
      }
      // Strip builder state (not needed by DM) and format for output
      const output = JSON.parse(JSON.stringify(result));
      if (output.character?.builder) {
        delete output.character.builder;
      }
      if (
        output.combatant?.position &&
        typeof output.combatant.position === "object" &&
        "x" in output.combatant.position
      ) {
        output.combatant.position = formatGridPosition(output.combatant.position);
      }

      // Enrich weapon inventory items with resolvedAction from the DB
      const char = result.character;
      const inventory: unknown[] = output.character?.dynamic?.inventory ?? [];
      for (const rawItem of inventory) {
        const item = rawItem as Record<string, unknown>;
        if (item.weapon) {
          // item.name is the weapon name — look up its DB action
          const itemName = typeof item.name === "string" ? item.name : "";
          const baseItem = getBaseItem(itemName);
          if (baseItem?.effects?.action) {
            const attackBonus = getWeaponAttack(
              char,
              item as unknown as import("@unseen-servant/shared/types").Item,
            );
            item.resolvedAction = {
              attackBonus,
              action: baseItem.effects.action,
            };
          }
        }
      }

      const text = JSON.stringify(output, null, 2);
      gameLogger.toolCall("get_character", { name }, text);
      return {
        content: [
          {
            type: "text" as const,
            text,
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
        "Deal damage to a character or combatant. Handles temp HP absorption automatically. When damage_type is provided, resistance (half), immunity (zero), and vulnerability (double) are applied automatically from active effects. If the target was already at 0 HP, records a death save failure instead (2 failures if is_critical_hit is true).\n\nAlternative: provide actionRef instead of explicit amount/damage_type to auto-resolve damage dice and type from the DB entity's ActionEffect. Use outcomeBranch to pick which outcome (default: onHit for attack/auto, onFailedSave for save). For spells, provide upcast_level (extra levels above base) and caster_spell_save_dc if needed.",
      inputSchema: {
        name: z.string().describe("Character or combatant name"),
        amount: z.coerce
          .number()
          .optional()
          .describe("Amount of damage to deal (required unless actionRef is provided)"),
        damage_type: z
          .string()
          .optional()
          .describe("Type of damage (e.g., 'fire', 'slashing', 'psychic')"),
        is_critical_hit: z
          .boolean()
          .optional()
          .describe(
            "Whether this is a critical hit — causes 2 death save failures if target is already at 0 HP",
          ),
        action_ref: actionRefSchema
          .optional()
          .describe(
            "Auto-resolve damage from a DB entity's ActionEffect instead of specifying explicit amount/type",
          ),
        outcome_branch: z
          .enum(["onHit", "onMiss", "onFailedSave", "onSuccessfulSave"])
          .optional()
          .describe(
            "Which outcome branch to use when resolving from actionRef. Defaults to onHit for attack/auto, onFailedSave for save.",
          ),
        upcast_level: z.coerce
          .number()
          .optional()
          .describe(
            "Number of spell levels above the base level (for upcast scaling via actionRef)",
          ),
        caster_spell_save_dc: z.coerce
          .number()
          .optional()
          .describe(
            "Caster's spell save DC (substituted for 'spell_save_dc' when using actionRef with spells)",
          ),
      },
    },
    async ({
      name,
      amount,
      damage_type,
      is_critical_hit,
      action_ref,
      outcome_branch,
      upcast_level,
      caster_spell_save_dc,
    }) => {
      // ── actionRef path ──
      if (action_ref !== undefined && amount === undefined) {
        const ref: ActionRef = action_ref;
        const resolved = resolveActionRef(ref);
        if (!resolved.action) {
          return buildError(
            `No structured ActionEffect found for ${resolved.displayName}. Use explicit amount/damage_type instead.`,
          );
        }
        const contextualAction = getAction(
          { effects: { action: resolved.action } },
          {
            spellSaveDC: caster_spell_save_dc,
            upcastLevel: upcast_level,
          },
        );
        if (!contextualAction) {
          return buildError(`Failed to resolve action for ${resolved.displayName}.`);
        }

        // Pick the outcome branch
        const branch =
          outcome_branch ?? (contextualAction.kind === "save" ? "onFailedSave" : "onHit");
        const outcome = contextualAction[branch];
        if (!outcome?.damage || outcome.damage.length === 0) {
          return buildError(
            `No damage in branch "${branch}" for ${resolved.displayName}. Available note: ${outcome?.note ?? "(none)"}`,
          );
        }

        // Roll and sum all damage entries
        let totalDamage = 0;
        let resolvedType = damage_type;
        const rollDetails: string[] = [];
        for (const dmgEntry of outcome.damage) {
          const { result } = rollNotation(dmgEntry.dice, dmgEntry.dice);
          totalDamage += result.total;
          rollDetails.push(`${dmgEntry.dice} (${dmgEntry.type}) = ${result.total}`);
          if (!resolvedType) resolvedType = dmgEntry.type;
        }

        const r = wsClient.gameStateManager.applyDamage(
          name,
          totalDamage,
          resolvedType,
          is_critical_hit,
        );
        // Prepend roll details to the response text
        r.text = `${resolved.displayName} [${rollDetails.join(" + ")}] → ${r.text}`;
        return fromToolResponse(r, "apply_damage", {
          name,
          actionRef: ref,
          outcomeBranch: branch,
          totalDamage,
          damageType: resolvedType,
          is_critical_hit,
        });
      }

      // ── Explicit amount path (original) ──
      const finalAmount = amount ?? 0;
      return fromToolResponse(
        wsClient.gameStateManager.applyDamage(name, finalAmount, damage_type, is_critical_hit),
        "apply_damage",
        { name, amount: finalAmount, damage_type, is_critical_hit },
      );
    },
  );

  server.registerTool(
    "heal",
    {
      description: "Restore HP to a character or combatant. Cannot exceed max HP.",
      inputSchema: {
        name: z.string().describe("Character or combatant name"),
        amount: z.coerce.number().describe("Amount of HP to restore"),
      },
    },
    async ({ name, amount }) => {
      return fromToolResponse(wsClient.gameStateManager.heal(name, amount), "heal", {
        name,
        amount,
      });
    },
  );

  server.registerTool(
    "set_hp",
    {
      description: "Set a character or combatant's HP to an exact value.",
      inputSchema: {
        name: z.string().describe("Character or combatant name"),
        value: z.coerce.number().describe("HP value to set"),
      },
    },
    async ({ name, value }) => {
      return fromToolResponse(wsClient.gameStateManager.setHP(name, value), "set_hp", {
        name,
        value,
      });
    },
  );

  server.registerTool(
    "add_condition",
    {
      description:
        "Add a condition to a character or combatant. Creates an effect bundle with mechanical effects (e.g., speed 0, disadvantage). Checks condition immunity first.",
      inputSchema: {
        name: z.string().describe("Character or combatant name"),
        condition: z.string().describe("Condition name (e.g., 'poisoned', 'stunned', 'prone')"),
        duration: z.coerce.number().optional().describe("Duration in rounds (optional)"),
      },
    },
    async ({ name, condition, duration }) => {
      return fromToolResponse(
        wsClient.gameStateManager.addCondition(name, condition, duration),
        "add_condition",
        { name, condition, duration },
      );
    },
  );

  server.registerTool(
    "remove_condition",
    {
      description: "Remove a condition and its effect bundle from a character or combatant.",
      inputSchema: {
        name: z.string().describe("Character or combatant name"),
        condition: z.string().describe("Condition name to remove"),
      },
    },
    async ({ name, condition }) => {
      return fromToolResponse(
        wsClient.gameStateManager.removeCondition(name, condition),
        "remove_condition",
        { name, condition },
      );
    },
  );

  // ─── Feature Activation ───

  server.registerTool(
    "activate_feature",
    {
      description:
        "Activate a class or subclass feature's mechanical effects (e.g., Rage, Wild Shape, Bladesong). Creates an effect bundle with bonuses/resistances that apply until deactivated. Use alongside use_class_resource when the feature costs a resource.",
      inputSchema: {
        name: z.string().describe("Character name"),
        feature: z.string().describe("Feature name (e.g., 'Rage', 'Wild Shape', 'Bladesong')"),
      },
    },
    async ({ name, feature }) => {
      return fromToolResponse(
        wsClient.gameStateManager.activateFeature(name, feature),
        "activate_feature",
        { name, feature },
      );
    },
  );

  server.registerTool(
    "deactivate_feature",
    {
      description:
        "Deactivate a class or subclass feature's mechanical effects. Removes the effect bundle so bonuses/resistances no longer apply.",
      inputSchema: {
        name: z.string().describe("Character name"),
        feature: z.string().describe("Feature name to deactivate"),
      },
    },
    async ({ name, feature }) => {
      return fromToolResponse(
        wsClient.gameStateManager.deactivateFeature(name, feature),
        "deactivate_feature",
        { name, feature },
      );
    },
  );

  // ─── Combat Management ───

  server.registerTool(
    "start_combat",
    {
      description:
        "Initialize combat with a list of combatants. Initiative is rolled automatically. Creates turn order and broadcasts combat state. Use your combat skill for turn-by-turn rules.",
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
                .string()
                .optional()
                .describe("Starting grid position in A1 notation (e.g. 'E5')"),
              size: z
                .enum(["tiny", "small", "medium", "large", "huge", "gargantuan"])
                .optional()
                .describe("Creature size (default medium)"),
              tokenColor: z.string().optional().describe("Token color for battle map"),
              saveBonuses: z
                .record(z.string(), z.number())
                .optional()
                .describe(
                  "Per-ability saving throw bonuses (e.g., {dexterity: 5, wisdom: 3}). From monster stat block.",
                ),
            }),
          )
          .describe("List of combatants to add to combat"),
      },
    },
    async ({ combatants }) => {
      // Parse A1 notation positions to {x, y}
      const parsed = combatants.map((c) => {
        const pos = c.position ? parseGridPosition(c.position) : undefined;
        return { ...c, position: pos ?? undefined };
      });
      const result = wsClient.gameStateManager.startCombat(parsed);
      return fromToolResponse(result, "start_combat", { combatants });
    },
  );

  server.registerTool(
    "end_combat",
    {
      description:
        "End the current combat encounter. Clears combat state and returns to exploration. Use your narration skill for exploration.",
    },
    async () => {
      return fromToolResponse(wsClient.gameStateManager.endCombat(), "end_combat", {});
    },
  );

  server.registerTool(
    "advance_turn",
    {
      description:
        "Move to the next combatant's turn in initiative order. Increments round counter on wrap-around. Expires duration-based effects and processes start/end-of-turn condition effects.",
    },
    async () => {
      return fromToolResponse(wsClient.gameStateManager.advanceTurnMCP(), "advance_turn", {});
    },
  );

  server.registerTool(
    "set_initiative",
    {
      description:
        "Override a combatant's initiative value and re-sort the turn order. Use for readied actions, initiative swaps, or DM adjustments.",
      inputSchema: {
        name: z.string().describe("Name of the combatant"),
        initiative: z.number().describe("New initiative value"),
      },
    },
    async ({ name, initiative }) => {
      return fromToolResponse(
        wsClient.gameStateManager.setInitiative(name, initiative),
        "set_initiative",
        { name, initiative },
      );
    },
  );

  server.registerTool(
    "set_active_turn",
    {
      description:
        "Jump to a specific combatant's turn without advancing through the order. DM override — does not trigger condition expiration for skipped turns.",
      inputSchema: {
        name: z.string().describe("Name of the combatant whose turn it should become"),
      },
    },
    async ({ name }) => {
      return fromToolResponse(wsClient.gameStateManager.setActiveTurn(name), "set_active_turn", {
        name,
      });
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
        position: z.string().optional().describe("Grid position in A1 notation (e.g., 'C4')"),
        size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]).optional(),
        tokenColor: z.string().optional(),
        saveBonuses: z
          .record(z.string(), z.number())
          .optional()
          .describe(
            "Per-ability saving throw bonuses (e.g., {dexterity: 5, wisdom: 3}). From monster stat block.",
          ),
        monster_ref: z
          .string()
          .optional()
          .describe(
            "Bestiary name (e.g., 'Skeleton', 'Fire Elemental') to auto-load innate damage resistances, immunities, vulnerabilities, and condition immunities. Defaults to `name` for non-player combatants if omitted.",
          ),
      },
    },
    async (params) => {
      // Parse A1 notation position to {x, y}
      const position = params.position
        ? (parseGridPosition(params.position) ?? undefined)
        : undefined;
      const result = wsClient.gameStateManager.addCombatant({
        ...params,
        position,
      });
      return fromToolResponse(result, "add_combatant", params);
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
      return fromToolResponse(wsClient.gameStateManager.removeCombatant(name), "remove_combatant", {
        name,
      });
    },
  );

  server.registerTool(
    "move_combatant",
    {
      description:
        "Move a combatant's token on the battle map to a new position. Use A1 notation (e.g., 'E5').",
      inputSchema: {
        name: z.string().describe("Name of the combatant to move"),
        position: z.string().describe("Grid position in A1 notation (e.g. 'E5')"),
      },
    },
    async ({ name, position }) => {
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
      const result = wsClient.gameStateManager.moveCombatant(name, parsed);
      return fromToolResponse(result, "move_combatant", { name, position });
    },
  );

  // ─── Spell Slots ───

  server.registerTool(
    "use_spell_slot",
    {
      description: "Expend a spell slot at a given level for a character.",
      inputSchema: {
        name: z.string().describe("Character name"),
        level: z.coerce.number().describe("Spell slot level (1-9)"),
      },
    },
    async ({ name, level }) => {
      const result = wsClient.gameStateManager.useSpellSlot(name, level);
      return fromToolResponse(result, "use_spell_slot", { name, level });
    },
  );

  server.registerTool(
    "restore_spell_slot",
    {
      description:
        "Restore a spell slot at a given level (e.g., after short rest, Arcane Recovery).",
      inputSchema: {
        name: z.string().describe("Character name"),
        level: z.coerce.number().describe("Spell slot level (1-9)"),
      },
    },
    async ({ name, level }) => {
      const result = wsClient.gameStateManager.restoreSpellSlot(name, level);
      return fromToolResponse(result, "restore_spell_slot", { name, level });
    },
  );

  // ─── Class Resources ───

  server.registerTool(
    "use_class_resource",
    {
      description:
        "Expend one or more uses of a class resource (e.g., Bardic Inspiration, Channel Divinity, Rage, Ki Points, Wild Shape, Lay on Hands). Use `amount` > 1 for pool-style resources spent in a single action (e.g., Lay on Hands 15 HP).",
      inputSchema: {
        name: z.string().describe("Character name"),
        resource_name: z
          .string()
          .describe("Resource name (e.g., 'Channel Divinity', 'Rage', 'Bardic Inspiration')"),
        amount: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Number of uses/points to spend (default 1). For Lay on Hands, pass the HP amount.",
          ),
      },
    },
    async ({ name, resource_name, amount }) => {
      const result = wsClient.gameStateManager.useClassResource(name, resource_name, amount);
      return fromToolResponse(result, "use_class_resource", { name, resource_name, amount });
    },
  );

  server.registerTool(
    "restore_class_resource",
    {
      description:
        "Restore uses of a class resource (e.g., after a rest). Use amount=999 to fully restore.",
      inputSchema: {
        name: z.string().describe("Character name"),
        resource_name: z.string().describe("Resource name (e.g., 'Channel Divinity', 'Rage')"),
        amount: z
          .number()
          .optional()
          .describe("Number of uses to restore (default 1, use 999 to fully restore)"),
      },
    },
    async ({ name, resource_name, amount }) => {
      const result = wsClient.gameStateManager.restoreClassResource(name, resource_name, amount);
      return fromToolResponse(result, "restore_class_resource", { name, resource_name, amount });
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
      return fromToolResponse(result, "update_battle_map", { width, height, name });
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
        "Display an AoE overlay on the battle map. Returns affected combatants. Sphere: center + size (radius). Cone: center (caster) + size (length) + direction. Rectangle: from + to (two corners in A1).\n\nAlternative: provide action_ref to auto-resolve shape and size from a DB entity's ActionEffect (e.g., Fireball → sphere 20ft). Explicit shape/size always override actionRef values.",
      inputSchema: {
        shape: z
          .enum(["sphere", "cone", "rectangle"])
          .optional()
          .describe("AoE shape (overrides actionRef if provided)"),
        center: z
          .string()
          .optional()
          .describe(
            "Center/origin in A1 notation. Required for sphere (center of circle) and cone (caster position)",
          ),
        size: z.coerce
          .number()
          .optional()
          .describe(
            "Size in feet: radius for sphere, length for cone (overrides actionRef if provided)",
          ),
        direction: z.coerce
          .number()
          .optional()
          .describe("Direction in degrees (0=north, 90=east). Required for cone"),
        from: z.string().optional().describe("Starting corner in A1 notation (for rectangle)"),
        to: z.string().optional().describe("Opposite corner in A1 notation (for rectangle)"),
        color: z.string().describe("RGB hex color (e.g., '#FF6B35' for fire, '#4FC3F7' for ice)"),
        label: z.string().describe("Spell/effect name (e.g., 'Fireball')"),
        persistent: z
          .boolean()
          .optional()
          .describe("Whether this AoE stays on the map until dismissed (default false)"),
        name: z.string().optional().describe("Caster name"),
        action_ref: actionRefSchema
          .optional()
          .describe("Auto-resolve area shape and size from DB entity's ActionEffect"),
      },
    },
    async ({
      shape,
      center,
      size,
      direction,
      from,
      to,
      color,
      label,
      persistent,
      name,
      action_ref,
    }) => {
      let resolvedShape = shape;
      let resolvedSize = size;

      // Auto-resolve area from actionRef if not explicitly provided
      if (action_ref) {
        const resolved = resolveActionRef(action_ref);
        const contextualAction = resolved.action
          ? getAction({ effects: { action: resolved.action } }, {})
          : null;
        if (contextualAction?.area) {
          const areaShape = contextualAction.area.shape;
          // Map ActionEffect area shapes to supported show_aoe shapes
          if (!resolvedShape && (areaShape === "sphere" || areaShape === "cone")) {
            resolvedShape = areaShape;
          }
          if (!resolvedSize) {
            resolvedSize = contextualAction.area.size;
          }
        }
      }

      if (!resolvedShape) {
        return buildError(
          "show_aoe requires either an explicit shape or an action_ref with an area field.",
          [
            "Provide shape='sphere'/'cone'/'rectangle' or action_ref pointing to a spell/weapon with an area.",
          ],
        );
      }

      const result = wsClient.gameStateManager.showAoE({
        shape: resolvedShape,
        center,
        size: resolvedSize,
        direction,
        from,
        to,
        color,
        label,
        persistent: persistent ?? false,
        casterName: name,
      });
      return fromToolResponse(result, "show_aoe", {
        shape: resolvedShape,
        center,
        size: resolvedSize,
        direction,
        from,
        to,
        color,
        label,
        persistent,
        name,
        action_ref,
      });
    },
  );

  server.registerTool(
    "apply_area_effect",
    {
      description:
        "Apply damage to all combatants in an area with saving throws. Sphere: center + size (radius). Cone: center (caster) + size (length) + direction. Rectangle: from + to (two corners in A1).\n\nAlternative: provide action_ref to auto-resolve area shape, size, damage dice, damage type, save ability, and DC from a DB entity's ActionEffect (e.g., Fireball: sphere 20ft, 8d6 fire, DEX save). Explicit args override actionRef values. For spells, provide caster_spell_save_dc to substitute 'spell_save_dc'. For upcast spells, provide upcast_level (extra levels above base).\n\nProvide aoe_id to reuse the geometry of a committed player AoE overlay (shape, center, size, direction, from, to) without re-specifying position args.",
      inputSchema: {
        aoe_id: z
          .string()
          .optional()
          .describe(
            "ID of an existing AoE overlay — reuses its geometry (shape, center, size, direction, from/to). Explicit shape/center/size/etc. args still override the stored values.",
          ),
        shape: z
          .enum(["sphere", "cone", "rectangle"])
          .optional()
          .describe("AoE shape (overrides actionRef if provided)"),
        center: z
          .string()
          .optional()
          .describe("Center/origin in A1 notation. Required for sphere and cone"),
        size: z.coerce
          .number()
          .optional()
          .describe(
            "Size in feet: radius for sphere, length for cone (overrides actionRef if provided)",
          ),
        direction: z.coerce
          .number()
          .optional()
          .describe("Direction in degrees (0=north, 90=east). Required for cone"),
        from: z.string().optional().describe("Starting corner in A1 notation (for rectangle)"),
        to: z.string().optional().describe("Opposite corner in A1 notation (for rectangle)"),
        damage: z
          .string()
          .optional()
          .describe("Damage dice notation (e.g., '8d6') — required unless action_ref is provided"),
        damage_type: z
          .string()
          .optional()
          .describe("Damage type (e.g., 'fire', 'cold') — required unless action_ref is provided"),
        save_ability: z
          .string()
          .optional()
          .describe(
            "Saving throw ability (e.g., 'dexterity') — required unless action_ref is provided",
          ),
        save_dc: z.coerce
          .number()
          .optional()
          .describe("Save DC — required unless action_ref is provided"),
        half_on_save: z
          .boolean()
          .optional()
          .describe("Whether targets take half damage on a successful save (default true)"),
        action_ref: actionRefSchema
          .optional()
          .describe(
            "Auto-resolve area, damage, save from DB entity's ActionEffect. Explicit args take precedence.",
          ),
        upcast_level: z.coerce
          .number()
          .optional()
          .describe("Extra spell levels above base (for upcast scaling when using action_ref)"),
        caster_spell_save_dc: z.coerce
          .number()
          .optional()
          .describe(
            "Caster's spell save DC (substituted for 'spell_save_dc' when using action_ref)",
          ),
      },
    },
    async ({
      aoe_id,
      shape,
      center,
      size,
      direction,
      from,
      to,
      damage,
      damage_type,
      save_ability,
      save_dc,
      half_on_save,
      action_ref,
      upcast_level,
      caster_spell_save_dc,
    }) => {
      let resolvedShape = shape;
      let resolvedCenter = center;
      let resolvedSize = size;
      let resolvedDirection = direction;
      let resolvedFrom = from;
      let resolvedTo = to;
      let resolvedDamage = damage;
      let resolvedDamageType = damage_type;
      let resolvedSaveAbility = save_ability;
      let resolvedSaveDC = save_dc;
      let resolvedHalfOnSave = half_on_save ?? true;

      // Resolve geometry from a stored AoE overlay if aoe_id provided
      if (aoe_id) {
        const combat = wsClient.gameStateManager.gameState.encounter?.combat;
        const stored = combat?.activeAoE?.find((a) => a.id === aoe_id);
        if (stored) {
          if (!resolvedShape) resolvedShape = stored.shape;
          if (!resolvedCenter && stored.shape !== "rectangle")
            resolvedCenter = formatGridPosition(stored.center);
          if (resolvedSize === undefined && stored.size !== undefined) resolvedSize = stored.size;
          if (resolvedDirection === undefined && stored.direction !== undefined)
            resolvedDirection = stored.direction;
          if (!resolvedFrom && stored.from) resolvedFrom = formatGridPosition(stored.from);
          if (!resolvedTo && stored.to) resolvedTo = formatGridPosition(stored.to);
        }
      }

      // Auto-resolve from actionRef if provided
      if (action_ref) {
        const resolved = resolveActionRef(action_ref);
        const contextualAction = resolved.action
          ? getAction(
              { effects: { action: resolved.action } },
              {
                spellSaveDC: caster_spell_save_dc,
                upcastLevel: upcast_level,
              },
            )
          : null;

        if (contextualAction) {
          // Area shape
          if (!resolvedShape && contextualAction.area) {
            const areaShape = contextualAction.area.shape;
            if (areaShape === "sphere" || areaShape === "cone") {
              resolvedShape = areaShape;
            }
          }
          if (!resolvedSize && contextualAction.area) {
            resolvedSize = contextualAction.area.size;
          }

          // Save
          if (!resolvedSaveAbility && contextualAction.save) {
            resolvedSaveAbility = contextualAction.save.ability;
          }
          if (resolvedSaveDC === undefined && contextualAction.save) {
            const dc = contextualAction.save.dc;
            if (typeof dc === "number") {
              resolvedSaveDC = dc;
            }
            // If dc is still "spell_save_dc" (no caster_spell_save_dc provided), leave undefined
          }
          // onSuccess: "half" is the D&D default; override only if explicitly false
          if (half_on_save === undefined && contextualAction.save) {
            resolvedHalfOnSave = contextualAction.save.onSuccess !== "none";
          }

          // Damage: prefer onFailedSave branch for save-kind, onHit for attack/auto
          const damageBranch =
            contextualAction.kind === "save"
              ? contextualAction.onFailedSave
              : contextualAction.onHit;
          if (!resolvedDamage && damageBranch?.damage && damageBranch.damage.length > 0) {
            // Combine multiple damage dice entries into a single notation for applyAreaEffect
            resolvedDamage = damageBranch.damage.map((d) => d.dice).join("+");
            if (!resolvedDamageType) {
              resolvedDamageType = damageBranch.damage[0].type;
            }
          }
        }
      }

      if (!resolvedShape) {
        return buildError(
          "apply_area_effect requires either an explicit shape or an action_ref with an area field.",
        );
      }
      if (!resolvedDamage) {
        return buildError(
          "apply_area_effect requires either explicit damage notation or an action_ref with damage in onFailedSave/onHit.",
        );
      }
      if (!resolvedDamageType) {
        return buildError(
          "apply_area_effect requires either explicit damage_type or an action_ref with damage type.",
        );
      }
      if (!resolvedSaveAbility) {
        return buildError(
          "apply_area_effect requires either explicit save_ability or an action_ref with a save block.",
        );
      }
      if (resolvedSaveDC === undefined) {
        return buildError(
          "apply_area_effect requires either explicit save_dc or an action_ref with a numeric DC (provide caster_spell_save_dc if the action uses 'spell_save_dc').",
        );
      }

      const interactiveSaveForPC = async (
        targetName: string,
        ability: string,
        dc: number,
      ): Promise<{ total: number; passed: boolean; mod: number; rolled: number } | null> => {
        try {
          const res = await wsClient.sendCheckRequest({
            notation: "1d20",
            checkType: `${ability}_save`,
            targetCharacter: targetName,
            dc,
            reason: `${ability} save vs DC ${dc}`,
          });
          const rolled = res.roll.rolls[0]?.result ?? 0;
          return {
            total: res.roll.total,
            passed: res.success ?? res.roll.total >= dc,
            mod: res.roll.modifier,
            rolled,
          };
        } catch {
          // Character-not-found or similar — fall through to server-side roll
          return null;
        }
      };

      const result = await wsClient.gameStateManager.applyAreaEffect(
        {
          shape: resolvedShape,
          center: resolvedCenter,
          size: resolvedSize,
          direction: resolvedDirection,
          from: resolvedFrom,
          to: resolvedTo,
          damage: resolvedDamage,
          damageType: resolvedDamageType,
          saveAbility: resolvedSaveAbility,
          saveDC: resolvedSaveDC,
          halfOnSave: resolvedHalfOnSave,
        },
        interactiveSaveForPC,
      );

      // Auto-dismiss non-persistent AoEs after damage resolution
      if (aoe_id && !result.error) {
        const combat = wsClient.gameStateManager.gameState.encounter?.combat;
        const overlay = combat?.activeAoE?.find((a) => a.id === aoe_id);
        if (overlay && !overlay.persistent) {
          wsClient.gameStateManager.dismissAoE(aoe_id);
        }
      }

      return fromToolResponse(result, "apply_area_effect", {
        aoe_id,
        shape: resolvedShape,
        center: resolvedCenter,
        size: resolvedSize,
        direction: resolvedDirection,
        from: resolvedFrom,
        to: resolvedTo,
        damage: resolvedDamage,
        damage_type: resolvedDamageType,
        save_ability: resolvedSaveAbility,
        save_dc: resolvedSaveDC,
        half_on_save: resolvedHalfOnSave,
        action_ref,
      });
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
      return fromToolResponse(result, "dismiss_aoe", { aoe_id });
    },
  );

  server.registerTool(
    "update_aoe",
    {
      description:
        "Update an existing AoE overlay — reposition, relabel, resize, or change color. Use after a player moves their AoE (you receive aoe_placed/aoe_moved events in wait_for_message) to adjudicate: revert, confirm, or relocate. Also broadcasts the updated overlay to all clients.",
      inputSchema: {
        aoe_id: z.string().describe("The ID of the AoE overlay to update"),
        center: z
          .object({ x: z.coerce.number(), y: z.coerce.number() })
          .optional()
          .describe("New center/origin as {x, y} grid coordinates"),
        direction: z.coerce
          .number()
          .optional()
          .describe("New direction in degrees (0=north, 90=east) — cone only"),
        size: z.coerce.number().optional().describe("New size in feet"),
        shape: z
          .enum(["sphere", "cone", "rectangle"])
          .optional()
          .describe("Change the shape of the overlay"),
        from: z
          .object({ x: z.coerce.number(), y: z.coerce.number() })
          .optional()
          .describe("New starting corner {x, y} — rectangle only"),
        to: z
          .object({ x: z.coerce.number(), y: z.coerce.number() })
          .optional()
          .describe("New opposite corner {x, y} — rectangle only"),
        color: z.string().optional().describe("New color hex string (e.g. '#FF6B35')"),
        label: z.string().optional().describe("New label text"),
        persistent: z
          .boolean()
          .optional()
          .describe("Whether the overlay stays until explicitly dismissed"),
      },
    },
    async ({ aoe_id, center, direction, size, shape, from, to, color, label, persistent }) => {
      const result = wsClient.gameStateManager.updateAoE(aoe_id, {
        ...(center !== undefined ? { center } : {}),
        ...(direction !== undefined ? { direction } : {}),
        ...(size !== undefined ? { size } : {}),
        ...(shape !== undefined ? { shape } : {}),
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(label !== undefined ? { label } : {}),
        ...(persistent !== undefined ? { persistent } : {}),
      });
      return fromToolResponse(result, "update_aoe", { aoe_id });
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
                name: z.string().describe("Character or combatant name"),
                amount: z.coerce.number().describe("Damage amount"),
                damage_type: z.string().optional().describe("Damage type"),
              }),
              z.object({
                type: z.literal("heal"),
                name: z.string().describe("Character or combatant name"),
                amount: z.coerce.number().describe("Heal amount"),
              }),
              z.object({
                type: z.literal("set_hp"),
                name: z.string().describe("Character or combatant name"),
                value: z.coerce.number().describe("HP value"),
              }),
              z.object({
                type: z.literal("condition_add"),
                name: z.string().describe("Character or combatant name"),
                condition: z.string().describe("Condition name"),
                duration: z.coerce.number().optional().describe("Duration in rounds"),
              }),
              z.object({
                type: z.literal("condition_remove"),
                name: z.string().describe("Character or combatant name"),
                condition: z.string().describe("Condition name"),
              }),
              z.object({
                type: z.literal("move"),
                name: z.string().describe("Character or combatant name"),
                position: z.string().describe("Target position in A1 notation"),
              }),
            ]),
          )
          .max(10)
          .describe("Array of effects to apply (max 10)"),
      },
    },
    async ({ effects }) => {
      return fromToolResponse(
        wsClient.gameStateManager.applyBatchEffects(effects),
        "apply_batch_effects",
        { effects },
      );
    },
  );

  // ─── Inventory & Currency ───

  server.registerTool(
    "add_item",
    {
      description:
        "Add an item to a character's inventory. Weapon and armor stats (damage, AC, properties) are automatically populated from the D&D 2024 database by item name — do not supply them manually. Stacks by name if the item already exists.",
      inputSchema: {
        name: z.string().describe("Character name"),
        item: z.string().describe("Item name (must match DB name exactly for weapons/armor)"),
        quantity: z.coerce.number().optional().describe("Quantity (default 1)"),
        description: z.string().optional().describe("Description override (optional)"),
        rarity: z
          .string()
          .optional()
          .describe("Rarity override — normally read from DB (Common, Uncommon, Rare, etc.)"),
        weight: z.coerce.number().optional().describe("Weight override in pounds"),
      },
    },
    async ({ name, item, quantity, description, rarity, weight }) => {
      const result = wsClient.gameStateManager.addItem(name, {
        name: item,
        quantity,
        description,
        rarity,
        weight,
      });
      return fromToolResponse(result, "add_item", {
        name,
        item,
        quantity,
        description,
        rarity,
        weight,
      });
    },
  );

  server.registerTool(
    "remove_item",
    {
      description:
        "Remove an item from a character's inventory. Decrements quantity or removes entirely.",
      inputSchema: {
        name: z.string().describe("Character name"),
        item: z.string().describe("Item name to remove"),
        quantity: z.coerce.number().optional().describe("Quantity to remove (default: all)"),
      },
    },
    async ({ name, item, quantity }) => {
      const result = wsClient.gameStateManager.removeItem(name, item, quantity);
      return fromToolResponse(result, "remove_item", { name, item, quantity });
    },
  );

  server.registerTool(
    "update_item",
    {
      description:
        "Modify an existing item's instance flags. Toggling equipped/attuned on magic items creates or removes effect bundles (AC, resistance, etc.). Weapon/armor intrinsics (damage dice, AC, properties) are DB-sourced and cannot be changed here — use add_item to replace the item. Specify only the fields you want to change.",
      inputSchema: {
        name: z.string().describe("Character name"),
        item: z.string().describe("Item name to update (lookup key)"),
        equipped: z.boolean().optional().describe("Equip or unequip the item"),
        quantity: z.coerce.number().optional().describe("Set exact quantity"),
        attuned: z.boolean().optional().describe("Toggle attunement (for magic items)"),
        description: z.string().optional().describe("Update description text"),
      },
    },
    async ({ name, item, equipped, quantity, attuned, description }) => {
      const updates: {
        equipped?: boolean;
        attuned?: boolean;
        quantity?: number;
        description?: string;
      } = {};
      if (equipped !== undefined) updates.equipped = equipped;
      if (quantity !== undefined) updates.quantity = quantity;
      if (attuned !== undefined) updates.attuned = attuned;
      if (description !== undefined) updates.description = description;
      const result = wsClient.gameStateManager.updateItem(name, item, updates);
      return fromToolResponse(result, "update_item", {
        name,
        item,
        equipped,
        quantity,
        attuned,
        description,
      });
    },
  );

  server.registerTool(
    "update_currency",
    {
      description:
        "Add or subtract currency for a character. Use positive numbers to add, negative to subtract. Auto-converts from higher denominations when spending more than available.",
      inputSchema: {
        name: z.string().describe("Character name"),
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
    async ({ name, copper, silver, gold, platinum, auto_convert }) => {
      const changes: Partial<Record<"cp" | "sp" | "gp" | "pp", number>> = {};
      if (copper) changes.cp = copper;
      if (silver) changes.sp = silver;
      if (gold) changes.gp = gold;
      if (platinum) changes.pp = platinum;
      const result = wsClient.gameStateManager.updateCurrency(name, changes, auto_convert ?? true);
      return fromToolResponse(result, "update_currency", {
        name,
        copper,
        silver,
        gold,
        platinum,
        auto_convert,
      });
    },
  );

  // ─── Heroic Inspiration ───

  server.registerTool(
    "grant_inspiration",
    {
      description:
        "Grant Heroic Inspiration to a character. The player can spend it for advantage on any d20 roll.",
      inputSchema: {
        name: z.string().describe("Character name"),
      },
    },
    async ({ name }) => {
      const result = wsClient.gameStateManager.grantInspiration(name);
      return fromToolResponse(result, "grant_inspiration", { name });
    },
  );

  server.registerTool(
    "use_inspiration",
    {
      description: "Spend a character's Heroic Inspiration to gain advantage on a d20 roll.",
      inputSchema: {
        name: z.string().describe("Character name"),
      },
    },
    async ({ name }) => {
      const result = wsClient.gameStateManager.useInspiration(name);
      return fromToolResponse(result, "use_inspiration", { name });
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
      return fromToolResponse(result, "compact_history", { keep_recent, summary });
    },
  );

  // ─── Rest Tools ───

  server.registerTool(
    "short_rest",
    {
      description:
        "Process a short rest for specified characters. Restores short-rest class resources and Warlock pact magic slots. Clears temporary effect bundles (until-rest). Does NOT auto-heal — Hit Dice healing requires interactive player choice.",
      inputSchema: {
        names: z.array(z.string()).describe("Names of characters taking the short rest"),
      },
    },
    async ({ names }) => {
      const result = wsClient.gameStateManager.shortRest(names);
      return fromToolResponse(result, "short_rest", { names });
    },
  );

  server.registerTool(
    "long_rest",
    {
      description:
        "Process a long rest for specified characters. Restores full HP, all spell slots, all class resources, resets death saves, clears non-permanent conditions and temporary effect bundles.",
      inputSchema: {
        names: z.array(z.string()).describe("Names of characters taking the long rest"),
      },
    },
    async ({ names }) => {
      const result = wsClient.gameStateManager.longRest(names);
      return fromToolResponse(result, "long_rest", { names });
    },
  );

  // ─── Death Saves ───

  server.registerTool(
    "death_save",
    {
      description:
        "Record a death saving throw for a character at 0 HP. Tracks successes/failures, auto-stabilizes at 3 successes, marks dead at 3 failures. Nat 1 = 2 failures (pass critical_fail: true). Nat 20 = regain 1 HP immediately, reset saves (pass success: true AND critical_success: true).",
      inputSchema: {
        name: z.string().describe("Character name"),
        success: z.boolean().describe("Whether the death save succeeded"),
        critical_fail: z
          .boolean()
          .optional()
          .describe("True if the d20 roll was a natural 1 — causes 2 failures instead of 1"),
        critical_success: z
          .boolean()
          .optional()
          .describe(
            "True if the d20 roll was a natural 20 — character regains 1 HP immediately and wakes up",
          ),
      },
    },
    async ({ name, success, critical_fail, critical_success }) => {
      const result = wsClient.gameStateManager.recordDeathSave(name, success, {
        criticalFail: critical_fail,
        criticalSuccess: critical_success,
      });
      return fromToolResponse(result, "death_save", {
        name,
        success,
        critical_fail,
        critical_success,
      });
    },
  );

  // ─── Concentration ───

  server.registerTool(
    "set_concentration",
    {
      description:
        "Set a character or combatant as concentrating on a spell. Auto-breaks any previous concentration.",
      inputSchema: {
        name: z.string().describe("Character or combatant name"),
        spell_name: z.string().describe("Name of the concentration spell"),
      },
    },
    async ({ name, spell_name }) => {
      const result = wsClient.gameStateManager.setConcentration(name, spell_name);
      return fromToolResponse(result, "set_concentration", { name, spell_name });
    },
  );

  server.registerTool(
    "break_concentration",
    {
      description:
        "Break a character or combatant's concentration, ending their concentration spell.",
      inputSchema: {
        name: z.string().describe("Character or combatant name"),
      },
    },
    async ({ name }) => {
      const result = wsClient.gameStateManager.breakConcentration(name);
      return fromToolResponse(result, "break_concentration", { name });
    },
  );

  // ─── Exhaustion ───

  server.registerTool(
    "set_exhaustion",
    {
      description:
        "Set a character's exhaustion level (0–10). PHB 2024: each level applies -2 to all D20 Tests (attack rolls, ability checks, saving throws), speed reduced by 5ft per level. Level 0 removes exhaustion. Level 10 = death. Long rest reduces exhaustion by 1.",
      inputSchema: {
        name: z.string().describe("Character name"),
        level: z.coerce
          .number()
          .int()
          .min(0)
          .max(10)
          .describe("Exhaustion level to set (0 = no exhaustion, 10 = dead)"),
      },
    },
    async ({ name, level }) => {
      return fromToolResponse(
        wsClient.gameStateManager.setExhaustion(name, level),
        "set_exhaustion",
        { name, level },
      );
    },
  );

  // ─── Temp HP ───

  server.registerTool(
    "set_temp_hp",
    {
      description:
        "Set temporary HP for a character or combatant. Non-stacking: takes the higher of current temp HP and new amount.",
      inputSchema: {
        name: z.string().describe("Character or combatant name"),
        amount: z.coerce.number().describe("Amount of temporary HP"),
      },
    },
    async ({ name, amount }) => {
      return fromToolResponse(wsClient.gameStateManager.setTempHP(name, amount), "set_temp_hp", {
        name,
        amount,
      });
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
