/**
 * GameStateManager — owns all game state, previously in the worker's GameRoom.
 *
 * Receives player actions from ws-client (forwarded by worker via server:player_action),
 * processes game logic, and broadcasts results back to clients via client:broadcast.
 */

import type {
  CharacterData,
  CharacterDynamicData,
  CheckRequest,
  ClientMessage,
  CombatState,
  Combatant,
  GameState,
  GameEvent,
  GameEventType,
  GridPosition,
  BattleMapState,
  PacingProfile,
  EncounterLength,
  ServerMessage,
  StateChange,
  CreatureSize,
} from "@unseen-servant/shared/types";
import {
  rollCheck,
  rollDamage,
  rollInitiative,
  buildCheckLabel,
  computeCheckModifier,
} from "@unseen-servant/shared/utils";
import { DM_SKILL_COMBAT, DM_SKILL_NARRATION, DM_SKILL_CAMPAIGN } from "@unseen-servant/shared";
import type { MessageQueue } from "../message-queue.js";
import type { CampaignManager } from "./campaign-manager.js";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SessionStateSnapshot {
  /** @deprecated Chat history now stored separately in chat-history.json */
  conversationHistory?: ConversationMessage[];
  gameState: GameState;
  storyStarted: boolean;
  hostName: string;
  playerNames: string[];
  lastSentIndex: number;
  savedAt: string;
}

type BroadcastFn = (msg: ServerMessage, targets?: string[]) => void;

export class GameStateManager {
  gameState: GameState = {
    encounter: null,
    eventLog: [],
    pacingProfile: "balanced",
    encounterLength: "standard",
  };

  characters: Record<string, CharacterData> = {};
  conversationHistory: ConversationMessage[] = [];
  storyStarted = false;

  private broadcast: BroadcastFn;
  private messageQueue: MessageQueue;
  private lastSentIndex = 0;
  private lastPromptHash = "";
  private turnsSinceFullPrompt = 0;
  private readonly FULL_PROMPT_INTERVAL = 10;
  private campaignManager: CampaignManager;
  /** Host player name (for permission checks) */
  hostName = "";
  /** All known player names (for validation) */
  playerNames: string[] = [];

  constructor(opts: {
    broadcast: BroadcastFn;
    messageQueue: MessageQueue;
    campaignManager: CampaignManager;
  }) {
    this.broadcast = opts.broadcast;
    this.messageQueue = opts.messageQueue;
    this.campaignManager = opts.campaignManager;
  }

  // ─── Session State Persistence ───

  serializeSessionState(): SessionStateSnapshot {
    return {
      gameState: this.gameState,
      storyStarted: this.storyStarted,
      hostName: this.hostName,
      playerNames: this.playerNames,
      lastSentIndex: this.lastSentIndex,
      savedAt: new Date().toISOString(),
    };
  }

  restoreSessionState(snapshot: SessionStateSnapshot, chatHistory?: ConversationMessage[]): void {
    // Chat history from separate file, or fall back to old format embedded in snapshot
    this.conversationHistory = chatHistory ?? snapshot.conversationHistory ?? [];
    this.gameState = snapshot.gameState;
    this.storyStarted = snapshot.storyStarted;
    this.hostName = snapshot.hostName;
    this.playerNames = snapshot.playerNames;
    // Set lastSentIndex to end so pushDMRequest only sends new messages
    this.lastSentIndex = this.conversationHistory.length;
  }

  saveSessionStateToCampaign(): void {
    if (!this.campaignManager.activeSlug) return;
    try {
      const snapshot = this.serializeSessionState();
      this.campaignManager.writeFile("session-state.json", JSON.stringify(snapshot, null, 2));
      this.campaignManager.writeFile(
        "chat-history.json",
        JSON.stringify(this.conversationHistory, null, 2),
      );
    } catch (e) {
      console.error(
        `[game-state] Failed to save session state: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Compose the system prompt dynamically based on current game state */
  private composeContextualPrompt(): string {
    const sections: string[] = [];

    // Mode header
    const inCombat = !!this.gameState.encounter?.combat;
    sections.push(inCombat ? "[MODE: COMBAT]" : "[MODE: EXPLORATION]");

    // Mode-specific skill (mutually exclusive — static skills are in CLAUDE.md)
    sections.push(inCombat ? DM_SKILL_COMBAT : DM_SKILL_NARRATION);

    // Campaign skill when campaign is active
    if (this.campaignManager.activeSlug) {
      sections.push(DM_SKILL_CAMPAIGN);
    }

    // Host custom instructions appended last
    if (this.gameState.customSystemPrompt) {
      sections.push(`## Host Instructions\n\n${this.gameState.customSystemPrompt}`);
    }

    return sections.join("\n\n");
  }

  /** Push a DM request with only new messages since last send.
   *  Uses hash-based delta delivery — only sends the full dynamic prompt
   *  when it changes or every FULL_PROMPT_INTERVAL turns. */
  private pushDMRequest(): void {
    const requestId = crypto.randomUUID();
    const fullPrompt = this.composeContextualPrompt();
    const promptHash = this.simpleHash(fullPrompt);

    let systemPrompt: string;
    if (
      promptHash !== this.lastPromptHash ||
      this.turnsSinceFullPrompt >= this.FULL_PROMPT_INTERVAL
    ) {
      systemPrompt = fullPrompt;
      this.lastPromptHash = promptHash;
      this.turnsSinceFullPrompt = 0;
    } else {
      systemPrompt = "[No changes to DM instructions.]";
      this.turnsSinceFullPrompt++;
    }

    const newMessages = this.conversationHistory.slice(this.lastSentIndex);
    this.lastSentIndex = this.conversationHistory.length;
    this.messageQueue.push({
      requestId,
      systemPrompt,
      messages: newMessages,
      totalMessageCount: this.conversationHistory.length,
    });
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  // ─── Player Action Dispatch ───

  handlePlayerAction(playerName: string, action: ClientMessage, _requestId: string): void {
    switch (action.type) {
      case "client:chat":
        this.handleChat(playerName, action.content);
        break;
      case "client:start_story":
        this.handleStartStory(playerName);
        break;
      case "client:roll_dice":
        this.handleRollDice(playerName, action.checkRequestId);
        break;
      case "client:combat_action":
        this.handleCombatAction(playerName, action.action);
        break;
      case "client:move_token":
        this.handleMoveToken(playerName, action.to);
        break;
      case "client:end_turn":
        this.handleEndTurn(playerName);
        break;
      case "client:rollback":
        this.handleRollback(playerName, action.eventId);
        break;
      case "client:set_system_prompt":
        this.handleSetSystemPrompt(playerName, action.prompt);
        break;
      case "client:set_pacing":
        this.handleSetPacing(playerName, action.profile, action.encounterLength);
        break;
      case "client:dm_override":
        this.handleDMOverride(playerName, action.characterName, action.changes);
        break;
      case "client:set_character":
        this.handleSetCharacter(playerName, action.character);
        break;
      case "client:set_campaign":
        // Handled by ws-client directly (campaign manager)
        break;
      case "client:configure_campaign":
        // Handled by ws-client directly (campaign manager)
        break;
      default:
        break;
    }
  }

  // ─── Chat ───

  handleChat(playerName: string, content: string): void {
    // Chat is already broadcast by the worker — no need to re-broadcast here.

    // Build dm_request for AI
    const character = this.findCharacterByPlayerName(playerName);
    const speakerName = character?.static.name || playerName;

    const sanitizedContent = content.replace(/\[([^\]]+)\]\s*:/g, "($1):");
    const userMessage = `[${speakerName}]: ${sanitizedContent}`;
    this.conversationHistory.push({ role: "user", content: userMessage });

    // Push to message queue for Claude Code to pick up
    this.pushDMRequest();
  }

  // ─── Start Story ───

  handleStartStory(playerName: string): void {
    if (playerName !== this.hostName) {
      this.broadcast(
        {
          type: "server:error",
          message: "Only the host can start the story",
          code: "NOT_HOST",
        },
        [playerName],
      );
      return;
    }

    if (this.storyStarted) {
      this.broadcast(
        {
          type: "server:error",
          message: "Story has already started",
          code: "ALREADY_STARTED",
        },
        [playerName],
      );
      return;
    }

    this.storyStarted = true;

    // Snapshot all characters to campaign
    const cm = this.campaignManager;
    if (cm.activeSlug && Object.keys(this.characters).length > 0) {
      try {
        cm.snapshotCharacters(this.characters);
      } catch {
        // ignore
      }
    }

    this.broadcast({
      type: "server:system",
      content: "The adventure begins...",
      timestamp: Date.now(),
    });

    // Build greeting dm_request
    const partyDescriptions = Object.entries(this.characters).map(([pName, char]) => {
      const classes = char.static.classes.map((c) => `${c.name} ${c.level}`).join("/");
      return `${pName} (${char.static.name}, ${char.static.species || char.static.race} ${classes})`;
    });

    const userMsg = `The adventuring party has gathered: ${partyDescriptions.join(", ")}. Set the scene and introduce each character!`;

    this.conversationHistory.push({
      role: "user",
      content: userMsg,
    });

    this.pushDMRequest();
  }

  // ─── Send Response (called by MCP tool) ───

  sendResponse(requestId: string, text: string): void {
    // Store in conversation history
    this.conversationHistory.push({ role: "assistant", content: text });
    this.lastSentIndex = this.conversationHistory.length;

    // Broadcast AI narrative to all players
    this.broadcast({
      type: "server:ai",
      content: text,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });

    // Persist session state after every DM response
    this.saveSessionStateToCampaign();
  }

  // ─── Roll Dice ───

  handleRollDice(playerName: string, checkRequestId: string): void {
    const combat = this.gameState.encounter?.combat;
    const pendingCheck = combat?.pendingCheck ?? this.gameState.pendingCheck;

    if (!pendingCheck || pendingCheck.id !== checkRequestId) {
      this.broadcast(
        {
          type: "server:error",
          message: "No matching pending check",
          code: "NO_PENDING_CHECK",
        },
        [playerName],
      );
      return;
    }

    // Find character for this player
    const char = this.findCharacterByPlayerName(playerName);
    if (!char || char.static.name.toLowerCase() !== pendingCheck.targetCharacter.toLowerCase()) {
      this.broadcast(
        {
          type: "server:error",
          message: "This check is not for your character",
          code: "WRONG_CHARACTER",
        },
        [playerName],
      );
      return;
    }

    // Damage rolls use the provided notation directly (no d20, no modifier computation)
    if (pendingCheck.type === "damage" && pendingCheck.notation) {
      const roll = rollDamage(pendingCheck.notation);

      // Broadcast dice roll
      this.broadcast({
        type: "server:dice_roll",
        roll,
        playerName,
        timestamp: Date.now(),
        id: crypto.randomUUID(),
        checkRequestId: pendingCheck.id,
      });

      // Broadcast check result (success is always true for damage — it's just a roll)
      this.broadcast({
        type: "server:check_result",
        result: {
          requestId: pendingCheck.id,
          roll,
          success: true,
          characterName: char.static.name,
        },
        timestamp: Date.now(),
        id: crypto.randomUUID(),
      });

      // Clear pending check
      if (combat?.pendingCheck?.id === pendingCheck.id) {
        combat.pendingCheck = undefined;
      }
      if (this.gameState.pendingCheck?.id === pendingCheck.id) {
        this.gameState.pendingCheck = undefined;
      }

      this.createEvent(
        "check_resolved",
        `${char.static.name} rolled ${roll.total} damage (${pendingCheck.notation}) for ${pendingCheck.reason}`,
        [],
      );

      const systemMsg = `[System: ${char.static.name} rolled ${roll.total} damage (${pendingCheck.notation}) for ${pendingCheck.reason}]`;
      this.conversationHistory.push({ role: "user", content: systemMsg });
      this.pushDMRequest();
      return;
    }

    // Compute modifier and roll
    const modifier = computeCheckModifier(char, pendingCheck);
    const roll = rollCheck({
      modifier,
      advantage: pendingCheck.advantage,
      disadvantage: pendingCheck.disadvantage,
      label: buildCheckLabel(pendingCheck),
    });

    const success = pendingCheck.dc !== undefined ? roll.total >= pendingCheck.dc : undefined;

    // Broadcast dice roll
    this.broadcast({
      type: "server:dice_roll",
      roll,
      playerName,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
      checkRequestId: pendingCheck.id,
    });

    // Broadcast check result
    this.broadcast({
      type: "server:check_result",
      result: {
        requestId: pendingCheck.id,
        roll,
        dc: pendingCheck.dc,
        success,
        characterName: char.static.name,
      },
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });

    // Clear pending check
    if (combat?.pendingCheck?.id === pendingCheck.id) {
      combat.pendingCheck = undefined;
    }
    if (this.gameState.pendingCheck?.id === pendingCheck.id) {
      this.gameState.pendingCheck = undefined;
    }

    // Log event for the event log
    const resultLabel = success === true ? "Success" : success === false ? "Failure" : "Result";
    const dcStr = pendingCheck.dc !== undefined ? ` (DC ${pendingCheck.dc})` : "";
    const critStr = roll.criticalHit
      ? " (Critical!)"
      : roll.criticalFail
        ? " (Critical Fail!)"
        : "";
    this.createEvent(
      "check_resolved",
      `${char.static.name} rolled ${roll.total}${dcStr} — ${resultLabel}${critStr} (${pendingCheck.reason})`,
      [],
    );

    // Inject result into conversation and trigger AI follow-up
    const systemMsg = `[System: ${char.static.name} rolled ${roll.total} on ${pendingCheck.reason}${dcStr} — ${resultLabel}${critStr}]`;

    this.conversationHistory.push({ role: "user", content: systemMsg });
    this.pushDMRequest();
  }

  // ─── Combat Action ───

  handleCombatAction(playerName: string, action: string): void {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      this.broadcast(
        {
          type: "server:error",
          message: "Not in active combat",
          code: "NOT_IN_COMBAT",
        },
        [playerName],
      );
      return;
    }

    // Enforce turn order
    const activeId = combat.turnOrder[combat.turnIndex];
    const activeCombatant = combat.combatants[activeId];
    if (activeCombatant?.type === "player") {
      const char = this.findCharacterByPlayerName(playerName);
      if (!char || char.static.name.toLowerCase() !== activeCombatant.name.toLowerCase()) {
        this.broadcast(
          {
            type: "server:error",
            message: "It's not your turn",
            code: "NOT_YOUR_TURN",
          },
          [playerName],
        );
        return;
      }
    }

    // Treat as a chat message that triggers AI response
    this.broadcast({
      type: "server:chat",
      content: action,
      playerName,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });

    // Build dm_request
    const character = this.findCharacterByPlayerName(playerName);
    const speakerName = character?.static.name || playerName;
    const sanitized = action.replace(/\[([^\]]+)\]\s*:/g, "($1):");
    const userMessage = `[${speakerName}]: ${sanitized}`;
    this.conversationHistory.push({ role: "user", content: userMessage });

    this.pushDMRequest();
  }

  // ─── End Turn ───

  handleEndTurn(playerName: string): void {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      this.broadcast(
        {
          type: "server:error",
          message: "Not in active combat",
          code: "NOT_IN_COMBAT",
        },
        [playerName],
      );
      return;
    }

    // Find the player's combatant
    const char = this.findCharacterByPlayerName(playerName);
    const combatant = char
      ? Object.values(combat.combatants).find(
          (c) => c.type === "player" && c.name.toLowerCase() === char.static.name.toLowerCase(),
        )
      : null;

    if (!combatant) {
      this.broadcast(
        {
          type: "server:error",
          message: "No combatant found for your character",
          code: "NO_COMBATANT",
        },
        [playerName],
      );
      return;
    }

    const activeId = combat.turnOrder[combat.turnIndex];
    if (activeId !== combatant.id) {
      this.broadcast(
        {
          type: "server:error",
          message: "It's not your turn",
          code: "NOT_YOUR_TURN",
        },
        [playerName],
      );
      return;
    }

    this.advanceTurn(combat);

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    // Auto-resolve NPC turns
    this.triggerNPCTurns(combat);
  }

  // ─── Move Token ───

  handleMoveToken(playerName: string, to: GridPosition): void {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      this.broadcast(
        {
          type: "server:error",
          message: "Not in active combat",
          code: "NOT_IN_COMBAT",
        },
        [playerName],
      );
      return;
    }

    const char = this.findCharacterByPlayerName(playerName);
    const combatant = char
      ? Object.values(combat.combatants).find(
          (c) => c.type === "player" && c.name.toLowerCase() === char.static.name.toLowerCase(),
        )
      : null;

    if (!combatant) {
      this.broadcast(
        {
          type: "server:error",
          message: "No combatant found for your character",
          code: "NO_COMBATANT",
        },
        [playerName],
      );
      return;
    }

    const activeId = combat.turnOrder[combat.turnIndex];
    if (activeId !== combatant.id) {
      this.broadcast(
        {
          type: "server:error",
          message: "It's not your turn",
          code: "NOT_YOUR_TURN",
        },
        [playerName],
      );
      return;
    }

    const from = combatant.position || { x: 0, y: 0 };
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const distance = Math.max(dx, dy) * 5;

    if (combatant.movementUsed + distance > combatant.speed) {
      this.broadcast(
        {
          type: "server:error",
          message: "Not enough movement remaining",
          code: "NO_MOVEMENT",
        },
        [playerName],
      );
      return;
    }

    combatant.position = to;
    combatant.movementUsed += distance;

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    // Notify AI of the movement
    if (char) {
      const systemMsg = `[System: ${char.static.name} moved from (${from.x},${from.y}) to (${to.x},${to.y}), ${distance}ft used (${combatant.speed - combatant.movementUsed}ft remaining)]`;
      this.conversationHistory.push({ role: "user", content: systemMsg });
      this.pushDMRequest();
    }
  }

  // ─── Rollback ───

  handleRollback(playerName: string, eventId: string): void {
    if (playerName !== this.hostName) {
      this.broadcast(
        {
          type: "server:error",
          message: "Only the host can rollback",
          code: "NOT_HOST",
        },
        [playerName],
      );
      return;
    }

    const eventIdx = this.gameState.eventLog.findIndex((e) => e.id === eventId);
    if (eventIdx === -1) {
      this.broadcast(
        {
          type: "server:error",
          message: "Event not found",
          code: "EVENT_NOT_FOUND",
        },
        [playerName],
      );
      return;
    }

    const event = this.gameState.eventLog[eventIdx];

    // Restore character dynamic data from snapshot
    for (const [pName, snapshot] of Object.entries(event.stateBefore.characters)) {
      const char = this.characters[pName];
      if (char) {
        char.dynamic = snapshot as CharacterDynamicData;
      }
    }

    // Restore combatant state
    if (event.stateBefore.combatants && this.gameState.encounter?.combat) {
      this.gameState.encounter.combat.combatants = event.stateBefore.combatants;
    }

    // Truncate conversation history
    this.conversationHistory = this.conversationHistory.slice(0, event.conversationIndex);
    this.lastSentIndex = Math.min(this.lastSentIndex, this.conversationHistory.length);

    // Truncate event log
    this.gameState.eventLog = this.gameState.eventLog.slice(0, eventIdx);

    // Broadcast rollback
    this.broadcast({
      type: "server:rollback",
      toEventId: eventId,
      gameState: this.gameState,
      characterUpdates: { ...this.characters },
      timestamp: Date.now(),
    });
  }

  // ─── Event Creation ───

  private createEvent(type: GameEventType, description: string, changes: StateChange[]): void {
    const characterSnapshots: Record<string, CharacterDynamicData> = {};
    for (const [pName, char] of Object.entries(this.characters)) {
      characterSnapshots[pName] = structuredClone(char.dynamic);
    }
    const combat = this.gameState.encounter?.combat;
    const combatantSnapshots = combat ? structuredClone(combat.combatants) : undefined;

    const event: GameEvent = {
      id: crypto.randomUUID(),
      type,
      timestamp: Date.now(),
      description,
      stateBefore: { characters: characterSnapshots, combatants: combatantSnapshots },
      conversationIndex: this.conversationHistory.length,
      changes,
    };

    this.gameState.eventLog.push(event);
    if (this.gameState.eventLog.length > 50) {
      this.gameState.eventLog = this.gameState.eventLog.slice(-50);
    }
    this.broadcast({ type: "server:event_log", event });
  }

  // ─── Settings ───

  handleSetSystemPrompt(playerName: string, prompt?: string): void {
    if (playerName !== this.hostName) {
      this.broadcast(
        {
          type: "server:error",
          message: "Only the host can change the system prompt",
          code: "NOT_HOST",
        },
        [playerName],
      );
      return;
    }

    this.gameState.customSystemPrompt = prompt;

    // Save to campaign
    const cm = this.campaignManager;
    if (cm.activeSlug && prompt) {
      try {
        cm.saveSystemPrompt(prompt);
      } catch {
        // ignore
      }
    }

    this.broadcast({
      type: "server:system",
      content: prompt ? "System prompt updated." : "System prompt reset to default.",
      timestamp: Date.now(),
    });
  }

  handleSetPacing(
    playerName: string,
    profile: PacingProfile,
    encounterLength: EncounterLength,
  ): void {
    if (playerName !== this.hostName) {
      this.broadcast(
        {
          type: "server:error",
          message: "Only the host can change pacing",
          code: "NOT_HOST",
        },
        [playerName],
      );
      return;
    }

    this.gameState.pacingProfile = profile;
    this.gameState.encounterLength = encounterLength;

    this.broadcast({
      type: "server:system",
      content: `Pacing set to ${profile}, encounter length: ${encounterLength}.`,
      timestamp: Date.now(),
    });
  }

  handleDMOverride(playerName: string, characterName: string, changes: StateChange[]): void {
    if (playerName !== this.hostName) {
      this.broadcast(
        {
          type: "server:error",
          message: "Only the host can use DM overrides",
          code: "NOT_HOST",
        },
        [playerName],
      );
      return;
    }

    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        this.createEvent("custom", `DM override on ${char.static.name}`, changes);
        for (const change of changes) {
          switch (change.type) {
            case "damage": {
              const amount = Math.max(0, change.amount);
              let remaining = amount;
              if (char.dynamic.tempHP > 0) {
                const absorbed = Math.min(char.dynamic.tempHP, remaining);
                char.dynamic.tempHP -= absorbed;
                remaining -= absorbed;
              }
              char.dynamic.currentHP = Math.max(0, char.dynamic.currentHP - remaining);
              break;
            }
            case "healing":
              char.dynamic.currentHP = Math.min(
                char.static.maxHP,
                char.dynamic.currentHP + Math.max(0, change.amount),
              );
              break;
            case "hp_set":
              char.dynamic.currentHP = Math.max(0, Math.min(char.static.maxHP, change.value));
              break;
            case "temp_hp":
              char.dynamic.tempHP = Math.max(char.dynamic.tempHP, change.amount);
              break;
            case "condition_add":
              if (!char.dynamic.conditions.includes(change.condition)) {
                char.dynamic.conditions.push(change.condition);
              }
              break;
            case "condition_remove":
              char.dynamic.conditions = char.dynamic.conditions.filter(
                (c) => c !== change.condition,
              );
              break;
          }
        }

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });
        break;
      }
    }
  }

  // ─── Character Management ───

  handleSetCharacter(playerName: string, character: CharacterData): void {
    this.characters[playerName] = character;

    // Snapshot to campaign
    const cm = this.campaignManager;
    if (cm.activeSlug) {
      try {
        cm.snapshotCharacters({ [playerName]: character });
      } catch {
        // ignore
      }
    }
  }

  // ─── Combat Helpers ───

  private advanceTurn(combat: CombatState): void {
    combat.turnIndex = (combat.turnIndex + 1) % combat.turnOrder.length;
    if (combat.turnIndex === 0) {
      combat.round++;
    }
    const activeId = combat.turnOrder[combat.turnIndex];
    const active = combat.combatants[activeId];
    if (active) {
      active.movementUsed = 0;
    }
  }

  private triggerNPCTurns(combat: CombatState, depth = 0): void {
    if (depth >= 10) return;
    if (combat.phase !== "active") return;

    const activeId = combat.turnOrder[combat.turnIndex];
    const activeCombatant = combat.combatants[activeId];
    if (!activeCombatant || activeCombatant.type === "player") return;

    // Build NPC turn context and push to message queue
    const pos = activeCombatant.position;
    const posStr = pos ? ` at position (${pos.x},${pos.y})` : "";
    const speed = activeCombatant.speed ?? 30;
    const ac = activeCombatant.armorClass ?? "?";
    const hp = `${activeCombatant.currentHP ?? "?"}/${activeCombatant.maxHP ?? "?"}`;
    const conditions = activeCombatant.conditions?.length
      ? ` Conditions: ${activeCombatant.conditions.join(", ")}.`
      : "";

    const turnMsg = `[System: It is now ${activeCombatant.name}'s turn${posStr}. HP: ${hp}, AC: ${ac}, Speed: ${speed}ft.${conditions}\nResolve this combatant's turn.]`;
    this.conversationHistory.push({ role: "user", content: turnMsg });

    this.pushDMRequest();

    // NPC turns are resolved by the AI responding via send_response,
    // which calls sendResponse() → advance_turn tool → etc.
    // The recursive NPC turn loop is now driven by the AI calling advance_turn.
  }

  // ─── MCP Tool Methods (called by game-tools.ts) ───

  /** Get full game state for the AI */
  getGameState(): {
    gameState: GameState;
    characters: Record<string, CharacterData>;
    storyStarted: boolean;
    conversationLength: number;
  } {
    return {
      gameState: this.gameState,
      characters: this.characters,
      storyStarted: this.storyStarted,
      conversationLength: this.conversationHistory.length,
    };
  }

  /** Get a specific character */
  getCharacter(characterName: string): { playerName: string; character: CharacterData } | null {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        return { playerName: pName, character: char };
      }
    }
    return null;
  }

  /** Apply damage to a character or combatant */
  applyDamage(targetName: string, amount: number, damageType?: string): string {
    const dmg = Math.max(0, amount);

    // Check combatants first (NPCs/enemies)
    const combat = this.gameState.encounter?.combat;
    if (combat) {
      const combatant = Object.values(combat.combatants).find(
        (c) => c.name.toLowerCase() === targetName.toLowerCase() && c.type !== "player",
      );
      if (combatant) {
        this.createEvent("damage", `${combatant.name} takes ${dmg} damage`, [
          { type: "damage", target: targetName, amount: dmg, damageType },
        ]);
        let remaining = dmg;
        if ((combatant.tempHP ?? 0) > 0) {
          const absorbed = Math.min(combatant.tempHP!, remaining);
          combatant.tempHP! -= absorbed;
          remaining -= absorbed;
        }
        combatant.currentHP = Math.max(0, (combatant.currentHP ?? 0) - remaining);

        this.broadcast({
          type: "server:combat_update",
          combat,
          map: this.gameState.encounter?.map ?? null,
          timestamp: Date.now(),
        });

        return `${combatant.name} takes ${dmg} ${damageType ?? ""} damage → ${combatant.currentHP}/${combatant.maxHP} HP`;
      }
    }

    // Check player characters
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        this.createEvent("damage", `${char.static.name} takes ${dmg} damage`, [
          { type: "damage", target: targetName, amount: dmg, damageType },
        ]);
        let remaining = dmg;
        if (char.dynamic.tempHP > 0) {
          const absorbed = Math.min(char.dynamic.tempHP, remaining);
          char.dynamic.tempHP -= absorbed;
          remaining -= absorbed;
        }
        char.dynamic.currentHP = Math.max(0, char.dynamic.currentHP - remaining);

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        return `${char.static.name} takes ${dmg} ${damageType ?? ""} damage → ${char.dynamic.currentHP}/${char.static.maxHP} HP`;
      }
    }

    return `Target "${targetName}" not found`;
  }

  /** Heal a character or combatant */
  heal(targetName: string, amount: number): string {
    const healing = Math.max(0, amount);

    // Check NPC combatants
    const combat = this.gameState.encounter?.combat;
    if (combat) {
      const combatant = Object.values(combat.combatants).find(
        (c) => c.name.toLowerCase() === targetName.toLowerCase() && c.type !== "player",
      );
      if (combatant && combatant.maxHP) {
        this.createEvent("healing", `${combatant.name} healed for ${healing}`, [
          { type: "healing", target: targetName, amount: healing },
        ]);
        combatant.currentHP = Math.min(combatant.maxHP, (combatant.currentHP ?? 0) + healing);
        this.broadcast({
          type: "server:combat_update",
          combat,
          map: this.gameState.encounter?.map ?? null,
          timestamp: Date.now(),
        });
        return `${combatant.name} healed ${healing} → ${combatant.currentHP}/${combatant.maxHP} HP`;
      }
    }

    // Check player characters
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        this.createEvent("healing", `${char.static.name} healed for ${healing}`, [
          { type: "healing", target: targetName, amount: healing },
        ]);
        char.dynamic.currentHP = Math.min(char.static.maxHP, char.dynamic.currentHP + healing);
        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });
        return `${char.static.name} healed ${healing} → ${char.dynamic.currentHP}/${char.static.maxHP} HP`;
      }
    }

    return `Target "${targetName}" not found`;
  }

  /** Set HP to exact value */
  setHP(targetName: string, value: number): string {
    // NPC combatants
    const combat = this.gameState.encounter?.combat;
    if (combat) {
      const combatant = Object.values(combat.combatants).find(
        (c) => c.name.toLowerCase() === targetName.toLowerCase() && c.type !== "player",
      );
      if (combatant && combatant.maxHP) {
        this.createEvent("hp_set", `${combatant.name} HP set to ${value}`, [
          { type: "hp_set", target: targetName, value },
        ]);
        combatant.currentHP = Math.max(0, Math.min(combatant.maxHP, value));
        this.broadcast({
          type: "server:combat_update",
          combat,
          map: this.gameState.encounter?.map ?? null,
          timestamp: Date.now(),
        });
        return `${combatant.name} HP set to ${combatant.currentHP}/${combatant.maxHP}`;
      }
    }

    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        this.createEvent("hp_set", `${char.static.name} HP set to ${value}`, [
          { type: "hp_set", target: targetName, value },
        ]);
        char.dynamic.currentHP = Math.max(0, Math.min(char.static.maxHP, value));
        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });
        return `${char.static.name} HP set to ${char.dynamic.currentHP}/${char.static.maxHP}`;
      }
    }

    return `Target "${targetName}" not found`;
  }

  /** Add a condition */
  addCondition(targetName: string, condition: string, _duration?: number): string {
    // NPC combatants
    const combat = this.gameState.encounter?.combat;
    if (combat) {
      const combatant = Object.values(combat.combatants).find(
        (c) => c.name.toLowerCase() === targetName.toLowerCase() && c.type !== "player",
      );
      if (combatant) {
        this.createEvent("condition_added", `${combatant.name} is now ${condition}`, [
          { type: "condition_add", target: targetName, condition },
        ]);
        if (!combatant.conditions) combatant.conditions = [];
        if (!combatant.conditions.includes(condition)) {
          combatant.conditions.push(condition);
        }
        this.broadcast({
          type: "server:combat_update",
          combat,
          map: this.gameState.encounter?.map ?? null,
          timestamp: Date.now(),
        });
        return `${combatant.name} is now ${condition}`;
      }
    }

    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        this.createEvent("condition_added", `${char.static.name} is now ${condition}`, [
          { type: "condition_add", target: targetName, condition },
        ]);
        if (!char.dynamic.conditions.includes(condition)) {
          char.dynamic.conditions.push(condition);
        }
        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });
        return `${char.static.name} is now ${condition}`;
      }
    }

    return `Target "${targetName}" not found`;
  }

  /** Remove a condition */
  removeCondition(targetName: string, condition: string): string {
    const combat = this.gameState.encounter?.combat;
    if (combat) {
      const combatant = Object.values(combat.combatants).find(
        (c) => c.name.toLowerCase() === targetName.toLowerCase() && c.type !== "player",
      );
      if (combatant && combatant.conditions) {
        this.createEvent("condition_removed", `${condition} removed from ${combatant.name}`, [
          { type: "condition_remove", target: targetName, condition },
        ]);
        combatant.conditions = combatant.conditions.filter((c) => c !== condition);
        this.broadcast({
          type: "server:combat_update",
          combat,
          map: this.gameState.encounter?.map ?? null,
          timestamp: Date.now(),
        });
        return `${condition} removed from ${combatant.name}`;
      }
    }

    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        this.createEvent("condition_removed", `${condition} removed from ${char.static.name}`, [
          { type: "condition_remove", target: targetName, condition },
        ]);
        char.dynamic.conditions = char.dynamic.conditions.filter((c) => c !== condition);
        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });
        return `${condition} removed from ${char.static.name}`;
      }
    }

    return `Target "${targetName}" not found`;
  }

  /** Start combat */
  startCombat(
    combatants: Array<{
      name: string;
      type: "player" | "npc" | "enemy";
      initiativeModifier?: number;
      speed?: number;
      maxHP?: number;
      currentHP?: number;
      armorClass?: number;
      position?: GridPosition;
      size?: CreatureSize;
      tokenColor?: string;
    }>,
  ): string {
    const combatantMap: Record<string, Combatant> = {};
    const initiativeOrder: Array<{ id: string; initiative: number }> = [];

    for (const c of combatants) {
      const id = crypto.randomUUID();

      // For players, auto-read initiative modifier from character sheet (Dex mod)
      let initMod = c.initiativeModifier ?? 0;
      let linkedPlayerId: string | undefined;

      if (c.type === "player") {
        const charEntry = Object.entries(this.characters).find(
          ([, ch]) => ch.static.name.toLowerCase() === c.name.toLowerCase(),
        );
        if (charEntry) {
          linkedPlayerId = charEntry[0];
          const dex = charEntry[1].static.abilities.dexterity;
          initMod = c.initiativeModifier ?? Math.floor((dex - 10) / 2);
        }
      }

      const initiative = rollInitiative(initMod);

      combatantMap[id] = {
        id,
        name: c.name,
        type: c.type,
        initiative,
        initiativeModifier: initMod,
        speed: c.speed ?? 30,
        movementUsed: 0,
        position: c.position,
        size: c.size ?? "medium",
        tokenColor: c.tokenColor,
        maxHP: c.maxHP,
        currentHP: c.currentHP ?? c.maxHP,
        tempHP: 0,
        armorClass: c.armorClass,
        conditions: [],
        playerId: linkedPlayerId,
      };

      initiativeOrder.push({ id, initiative });
    }

    // Sort by initiative (highest first)
    initiativeOrder.sort((a, b) => b.initiative - a.initiative);

    this.createEvent("combat_start", "Combat started", [{ type: "combat_phase", phase: "active" }]);

    const combat: CombatState = {
      phase: "active",
      round: 1,
      turnIndex: 0,
      turnOrder: initiativeOrder.map((i) => i.id),
      combatants: combatantMap,
    };

    if (!this.gameState.encounter) {
      this.gameState.encounter = {
        id: crypto.randomUUID(),
        phase: "combat",
        combat,
      };
    } else {
      this.gameState.encounter.phase = "combat";
      this.gameState.encounter.combat = combat;
    }

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter.map ?? null,
      timestamp: Date.now(),
    });

    const initSummary = initiativeOrder
      .map((i) => `${combatantMap[i.id].name}: ${i.initiative}`)
      .join(", ");

    return `Combat started! Initiative order: ${initSummary}. Round 1, ${combatantMap[initiativeOrder[0].id].name}'s turn.`;
  }

  /** End combat */
  endCombat(): string {
    if (!this.gameState.encounter?.combat) {
      return "No active combat to end";
    }

    this.createEvent("combat_end", "Combat ended", [{ type: "combat_phase", phase: "ended" }]);

    this.gameState.encounter.combat.phase = "ended";
    this.gameState.encounter.phase = "exploration";
    const _combat = this.gameState.encounter.combat;
    this.gameState.encounter.combat = undefined;
    this.gameState.encounter.map = undefined;

    this.broadcast({
      type: "server:combat_update",
      combat: null,
      map: null,
      timestamp: Date.now(),
    });

    return "Combat ended.";
  }

  /** Advance to next turn */
  advanceTurnMCP(): string {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      return "No active combat";
    }

    // Guard: AI cannot end a player's turn — players click End Turn themselves
    const activeId = combat.turnOrder[combat.turnIndex];
    const activeCombatant = combat.combatants[activeId];
    if (activeCombatant?.type === "player") {
      return `Cannot advance turn: it is ${activeCombatant.name}'s turn (a player character). Players end their own turns via the End Turn button.`;
    }

    this.advanceTurn(combat);

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    const newActiveId = combat.turnOrder[combat.turnIndex];
    const active = combat.combatants[newActiveId];
    return `Advanced to ${active?.name ?? "unknown"}'s turn (Round ${combat.round})`;
  }

  /** Add combatant mid-fight */
  addCombatant(c: {
    name: string;
    type: "player" | "npc" | "enemy";
    initiativeModifier?: number;
    speed?: number;
    maxHP?: number;
    currentHP?: number;
    armorClass?: number;
    position?: GridPosition;
    size?: CreatureSize;
    tokenColor?: string;
  }): string {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      return "No active combat";
    }

    const id = crypto.randomUUID();

    // For players, auto-read initiative modifier from character sheet (Dex mod)
    let initMod = c.initiativeModifier ?? 0;
    if (c.type === "player") {
      const charEntry = Object.entries(this.characters).find(
        ([, ch]) => ch.static.name.toLowerCase() === c.name.toLowerCase(),
      );
      if (charEntry) {
        const dex = charEntry[1].static.abilities.dexterity;
        initMod = c.initiativeModifier ?? Math.floor((dex - 10) / 2);
      }
    }

    const initiative = rollInitiative(initMod);

    this.createEvent("custom", `${c.name} joined combat`, []);

    combat.combatants[id] = {
      id,
      name: c.name,
      type: c.type,
      initiative,
      initiativeModifier: initMod,
      speed: c.speed ?? 30,
      movementUsed: 0,
      position: c.position,
      size: c.size ?? "medium",
      tokenColor: c.tokenColor,
      maxHP: c.maxHP,
      currentHP: c.currentHP ?? c.maxHP,
      tempHP: 0,
      armorClass: c.armorClass,
      conditions: [],
    };

    // Insert into turn order by initiative
    const insertIdx = combat.turnOrder.findIndex(
      (tid) => combat.combatants[tid].initiative < initiative,
    );
    if (insertIdx === -1) {
      combat.turnOrder.push(id);
    } else {
      // Adjust turnIndex if inserting before current turn
      if (insertIdx <= combat.turnIndex) {
        combat.turnIndex++;
      }
      combat.turnOrder.splice(insertIdx, 0, id);
    }

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    return `${c.name} joined combat (initiative ${initiative})`;
  }

  /** Remove combatant */
  removeCombatant(combatantName: string): string {
    const combat = this.gameState.encounter?.combat;
    if (!combat) return "No active combat";

    const entry = Object.entries(combat.combatants).find(
      ([, c]) => c.name.toLowerCase() === combatantName.toLowerCase(),
    );
    if (!entry) return `Combatant "${combatantName}" not found`;

    const [id] = entry;

    this.createEvent("custom", `${combatantName} removed from combat`, [
      { type: "combatant_remove", combatantId: id },
    ]);

    const idx = combat.turnOrder.indexOf(id);

    delete combat.combatants[id];

    if (idx !== -1) {
      combat.turnOrder.splice(idx, 1);
      if (combat.turnOrder.length === 0) {
        return this.endCombat();
      }
      if (idx < combat.turnIndex) {
        combat.turnIndex--;
      } else if (idx === combat.turnIndex) {
        combat.turnIndex = combat.turnIndex % combat.turnOrder.length;
      }
    }

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    return `${combatantName} removed from combat`;
  }

  /** Move a combatant on the battle map */
  moveCombatant(combatantName: string, to: GridPosition): string {
    const combat = this.gameState.encounter?.combat;
    if (!combat) return "No active combat";

    const combatant = Object.values(combat.combatants).find(
      (c) => c.name.toLowerCase() === combatantName.toLowerCase(),
    );
    if (!combatant) return `Combatant "${combatantName}" not found`;

    combatant.position = to;

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    return `${combatant.name} moved to (${to.x}, ${to.y})`;
  }

  /** Use a spell slot */
  useSpellSlot(characterName: string, level: number): string {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        this.createEvent("spell_slot_used", `${char.static.name} used level ${level} slot`, [
          { type: "spell_slot_use", target: characterName, level },
        ]);
        const slot = char.dynamic.spellSlotsUsed.find((s) => s.level === level);
        if (slot) {
          slot.used++;
        } else {
          char.dynamic.spellSlotsUsed.push({ level, total: 0, used: 1 });
        }

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        return `${char.static.name} used a level ${level} spell slot`;
      }
    }
    return `Character "${characterName}" not found`;
  }

  /** Restore a spell slot */
  restoreSpellSlot(characterName: string, level: number): string {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        this.createEvent(
          "spell_slot_restored",
          `${char.static.name} restored level ${level} slot`,
          [{ type: "spell_slot_restore", target: characterName, level }],
        );
        const slot = char.dynamic.spellSlotsUsed.find((s) => s.level === level);
        if (slot && slot.used > 0) {
          slot.used--;
        }

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        return `${char.static.name} restored a level ${level} spell slot`;
      }
    }
    return `Character "${characterName}" not found`;
  }

  /** Use a class resource (Bardic Inspiration, Channel Divinity, Rage, etc.) */
  useClassResource(characterName: string, resourceName: string): string {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        const resource = char.static.classResources.find(
          (r) => r.name.toLowerCase() === resourceName.toLowerCase(),
        );
        if (!resource) {
          return `Resource "${resourceName}" not found on ${char.static.name}. Available: ${char.static.classResources.map((r) => r.name).join(", ") || "none"}`;
        }

        const canonicalName = resource.name;
        const used = char.dynamic.resourcesUsed[canonicalName] ?? 0;
        if (used >= resource.maxUses) {
          return `${char.static.name} has no ${canonicalName} uses remaining (0/${resource.maxUses})`;
        }

        this.createEvent("resource_used", `${char.static.name} used ${canonicalName}`, [
          { type: "resource_use", target: characterName, resource: canonicalName },
        ]);
        char.dynamic.resourcesUsed[canonicalName] = used + 1;
        const remaining = resource.maxUses - (used + 1);

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        return `${char.static.name} used ${canonicalName} (${remaining}/${resource.maxUses} remaining)`;
      }
    }
    return `Character "${characterName}" not found`;
  }

  /** Restore a class resource. amount defaults to 1; use 999+ to fully restore. */
  restoreClassResource(characterName: string, resourceName: string, amount = 1): string {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        const resource = char.static.classResources.find(
          (r) => r.name.toLowerCase() === resourceName.toLowerCase(),
        );
        if (!resource) {
          return `Resource "${resourceName}" not found on ${char.static.name}. Available: ${char.static.classResources.map((r) => r.name).join(", ") || "none"}`;
        }

        const canonicalName = resource.name;
        const used = char.dynamic.resourcesUsed[canonicalName] ?? 0;

        this.createEvent("resource_restored", `${char.static.name} restored ${canonicalName}`, [
          { type: "resource_restore", target: characterName, resource: canonicalName, amount },
        ]);

        if (amount >= 999) {
          char.dynamic.resourcesUsed[canonicalName] = 0;
        } else {
          char.dynamic.resourcesUsed[canonicalName] = Math.max(0, used - amount);
        }

        const newUsed = char.dynamic.resourcesUsed[canonicalName];
        const remaining = resource.maxUses - newUsed;

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        return `${char.static.name} restored ${canonicalName} (${remaining}/${resource.maxUses} remaining)`;
      }
    }
    return `Character "${characterName}" not found`;
  }

  /** Add item to a character's inventory */
  addItem(
    characterName: string,
    item: {
      name: string;
      quantity?: number;
      type?: string;
      description?: string;
      rarity?: string;
      isMagicItem?: boolean;
      damage?: string;
      damageType?: string;
      properties?: string[];
      weight?: number;
    },
  ): string {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        this.createEvent("item_added", `Added ${item.name} to ${char.static.name}`, [
          {
            type: "item_add",
            target: characterName,
            item: item.name,
            quantity: item.quantity ?? 1,
          },
        ]);
        const existing = char.dynamic.inventory.find(
          (i) => i.name.toLowerCase() === item.name.toLowerCase(),
        );
        if (existing) {
          existing.quantity += item.quantity ?? 1;
        } else {
          char.dynamic.inventory.push({
            name: item.name,
            equipped: false,
            quantity: item.quantity ?? 1,
            type: item.type,
            description: item.description,
            rarity: item.rarity,
            isMagicItem: item.isMagicItem,
            damage: item.damage,
            damageType: item.damageType,
            properties: item.properties,
            weight: item.weight,
          });
        }

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        const qty = existing ? existing.quantity : (item.quantity ?? 1);
        return `Added ${item.name}${qty > 1 ? ` (x${qty})` : ""} to ${char.static.name}'s inventory`;
      }
    }
    return `Character "${characterName}" not found`;
  }

  /** Remove item from a character's inventory */
  removeItem(characterName: string, itemName: string, quantity?: number): string {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        const idx = char.dynamic.inventory.findIndex(
          (i) => i.name.toLowerCase() === itemName.toLowerCase(),
        );
        if (idx === -1) {
          return `Item "${itemName}" not found in ${char.static.name}'s inventory`;
        }

        const existing = char.dynamic.inventory[idx];
        const removeQty = quantity ?? existing.quantity;

        this.createEvent("item_removed", `Removed ${itemName} from ${char.static.name}`, [
          { type: "item_remove", target: characterName, item: itemName, quantity: removeQty },
        ]);

        if (removeQty >= existing.quantity) {
          char.dynamic.inventory.splice(idx, 1);
        } else {
          existing.quantity -= removeQty;
        }

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        return `Removed ${removeQty}x ${itemName} from ${char.static.name}'s inventory`;
      }
    }
    return `Character "${characterName}" not found`;
  }

  /** Update properties of an existing inventory item */
  updateItem(
    characterName: string,
    itemName: string,
    updates: Partial<Omit<import("@unseen-servant/shared/types").InventoryItem, "name">>,
  ): string {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        const item = char.dynamic.inventory.find(
          (i) => i.name.toLowerCase() === itemName.toLowerCase(),
        );
        if (!item) {
          return `Item "${itemName}" not found in ${char.static.name}'s inventory`;
        }

        this.createEvent("item_updated", `Updated ${itemName} for ${char.static.name}`, [
          {
            type: "item_update",
            target: characterName,
            item: itemName,
            changes: JSON.stringify(updates),
          },
        ]);

        // Build human-readable changes summary
        const changesList: string[] = [];
        if (updates.equipped !== undefined)
          changesList.push(updates.equipped ? "equipped" : "unequipped");
        if (updates.isAttuned !== undefined)
          changesList.push(updates.isAttuned ? "attuned" : "unattuned");
        if (updates.quantity !== undefined) changesList.push(`quantity → ${updates.quantity}`);
        if (updates.description !== undefined) changesList.push("description updated");
        if (updates.damage !== undefined) changesList.push(`damage → ${updates.damage}`);
        if (updates.damageType !== undefined)
          changesList.push(`damage type → ${updates.damageType}`);
        if (updates.properties !== undefined)
          changesList.push(`properties → [${updates.properties.join(", ")}]`);
        if (updates.armorClass !== undefined) changesList.push(`AC → ${updates.armorClass}`);
        if (updates.attackBonus !== undefined)
          changesList.push(`attack bonus → +${updates.attackBonus}`);
        if (updates.range !== undefined) changesList.push(`range → ${updates.range}`);
        if (updates.type !== undefined) changesList.push(`type → ${updates.type}`);
        if (updates.rarity !== undefined) changesList.push(`rarity → ${updates.rarity}`);
        if (updates.weight !== undefined) changesList.push(`weight → ${updates.weight} lb`);
        if (updates.isMagicItem !== undefined)
          changesList.push(updates.isMagicItem ? "marked as magic item" : "unmarked as magic item");
        if (updates.attunement !== undefined)
          changesList.push(updates.attunement ? "requires attunement" : "no attunement required");

        Object.assign(item, updates);

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        const summary = changesList.length > 0 ? changesList.join(", ") : "no changes";
        return `Updated ${item.name} for ${char.static.name}: ${summary}`;
      }
    }
    return `Character "${characterName}" not found`;
  }

  /** Update currency for a character (additive — positive adds, negative subtracts) */
  updateCurrency(
    characterName: string,
    changes: Partial<Record<"cp" | "sp" | "ep" | "gp" | "pp", number>>,
  ): string {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        this.createEvent("custom", `${char.static.name} currency updated`, []);
        for (const [coin, delta] of Object.entries(changes) as Array<
          ["cp" | "sp" | "ep" | "gp" | "pp", number]
        >) {
          char.dynamic.currency[coin] = Math.max(0, char.dynamic.currency[coin] + delta);
        }

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        const { cp, sp, ep, gp, pp } = char.dynamic.currency;
        return `${char.static.name}'s currency updated → ${gp}gp, ${sp}sp, ${cp}cp, ${ep}ep, ${pp}pp`;
      }
    }
    return `Character "${characterName}" not found`;
  }

  /** Grant heroic inspiration to a character */
  grantInspiration(characterName: string): string {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        if (char.dynamic.heroicInspiration) {
          return `${char.static.name} already has Heroic Inspiration`;
        }
        this.createEvent(
          "inspiration_granted",
          `${char.static.name} granted Heroic Inspiration`,
          [],
        );
        char.dynamic.heroicInspiration = true;

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        return `Granted Heroic Inspiration to ${char.static.name}`;
      }
    }
    return `Character "${characterName}" not found`;
  }

  /** Use (spend) heroic inspiration for a character */
  useInspiration(characterName: string): string {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        if (!char.dynamic.heroicInspiration) {
          return `${char.static.name} does not have Heroic Inspiration to spend`;
        }
        this.createEvent("inspiration_used", `${char.static.name} spent Heroic Inspiration`, []);
        char.dynamic.heroicInspiration = false;

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        return `${char.static.name} spent Heroic Inspiration`;
      }
    }
    return `Character "${characterName}" not found`;
  }

  /** Compact conversation history — replace older messages with a summary */
  compactHistory(keepRecent: number, summary: string): string {
    const totalBefore = this.conversationHistory.length;
    if (totalBefore <= keepRecent) {
      return `History only has ${totalBefore} messages — no compaction needed (threshold: ${keepRecent})`;
    }

    const recentMessages = this.conversationHistory.slice(-keepRecent);
    const summaryMessage: ConversationMessage = {
      role: "user",
      content: `[System — Story Summary (compacted from ${totalBefore - keepRecent} messages)]: ${summary}`,
    };

    this.conversationHistory = [summaryMessage, ...recentMessages];
    this.lastSentIndex = 0; // Reset so next pushDMRequest sends full compacted history

    // Persist immediately
    this.saveSessionStateToCampaign();

    // Broadcast system message so players see the recap
    this.broadcast({
      type: "server:system",
      content: `📜 The DM has compacted the story so far. Summary: ${summary}`,
      timestamp: Date.now(),
    });

    return `Compacted history: ${totalBefore} → ${this.conversationHistory.length} messages (1 summary + ${keepRecent} recent)`;
  }

  /** Update/set the battle map */
  updateBattleMap(map: BattleMapState): string {
    if (!this.gameState.encounter) {
      this.gameState.encounter = {
        id: crypto.randomUUID(),
        phase: "exploration",
      };
    }

    this.gameState.encounter.map = map;

    this.broadcast({
      type: "server:combat_update",
      combat: this.gameState.encounter.combat ?? null,
      map,
      timestamp: Date.now(),
    });

    return `Battle map "${map.name ?? "unnamed"}" set (${map.width}x${map.height})`;
  }

  /** Request a check from a player (DM-initiated) */
  requestCheck(params: {
    checkType: CheckRequest["type"];
    targetCharacter: string;
    ability?: string;
    skill?: string;
    dc?: number;
    advantage?: boolean;
    disadvantage?: boolean;
    reason: string;
    notation?: string;
  }): string {
    // Verify target character exists
    const charEntry = Object.entries(this.characters).find(
      ([, c]) => c.static.name.toLowerCase() === params.targetCharacter.toLowerCase(),
    );
    if (!charEntry) {
      return `Character "${params.targetCharacter}" not found`;
    }

    const checkRequest: CheckRequest = {
      id: crypto.randomUUID(),
      type: params.checkType,
      targetCharacter: params.targetCharacter,
      ability: params.ability,
      skill: params.skill,
      dc: params.dc,
      advantage: params.advantage,
      disadvantage: params.disadvantage,
      reason: params.reason,
      notation: params.notation,
      dmInitiated: true,
    };

    // Store as pending check
    const combat = this.gameState.encounter?.combat;
    if (combat && combat.phase === "active") {
      combat.pendingCheck = checkRequest;
    } else {
      this.gameState.pendingCheck = checkRequest;
    }

    // Broadcast check request
    this.broadcast({
      type: "server:check_request",
      check: checkRequest,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });

    return `Check requested: ${params.reason} for ${params.targetCharacter}`;
  }

  /** Send game state sync to a specific player (on join/reconnect) */
  sendStateSyncTo(playerName: string): void {
    this.broadcast(
      {
        type: "server:game_state_sync",
        gameState: this.gameState,
      },
      [playerName],
    );
  }

  /** Broadcast game state sync to all players (on session restore) */
  broadcastGameStateSync(): void {
    this.broadcast({
      type: "server:game_state_sync",
      gameState: this.gameState,
    });
  }

  // ─── Internal Helpers ───

  private findCharacterByPlayerName(playerName: string): CharacterData | null {
    return this.characters[playerName] ?? null;
  }
}
