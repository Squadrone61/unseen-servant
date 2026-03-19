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
  AoEOverlay,
} from "@unseen-servant/shared/types";
import {
  rollCheck,
  rollDamage,
  rollInitiative,
  buildCheckLabel,
  computeCheckModifier,
  formatGridPosition,
  parseGridPosition,
  gridDistance,
  computeAoETiles,
} from "@unseen-servant/shared/utils";
import {
  DM_SKILL_COMBAT,
  DM_SKILL_NARRATION,
  DM_SKILL_CAMPAIGN,
  DM_PACING_PROFILES,
  DM_ENCOUNTER_LENGTHS,
  DM_SKILL_SOCIAL,
} from "@unseen-servant/shared";
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
  /** Whether campaign context has been auto-loaded on first DM request */
  private campaignContextLoaded = false;

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

    // Social encounter skill during exploration
    if (!inCombat) {
      sections.push(DM_SKILL_SOCIAL);
    }

    // Pacing guidance (always included)
    const pacingGuidance = DM_PACING_PROFILES[this.gameState.pacingProfile];
    const encounterGuidance = DM_ENCOUNTER_LENGTHS[this.gameState.encounterLength];
    if (pacingGuidance || encounterGuidance) {
      sections.push(
        `## Pacing\n\n` +
          `**Profile: ${this.gameState.pacingProfile}** — ${pacingGuidance ?? ""}\n\n` +
          `**Encounter length: ${this.gameState.encounterLength}** — ${encounterGuidance ?? ""}`,
      );
    }

    // Campaign skill when campaign is active
    if (this.campaignManager.activeSlug) {
      sections.push(DM_SKILL_CAMPAIGN);
    }

    // Host custom instructions appended last
    if (this.gameState.customSystemPrompt) {
      sections.push(
        `## Host Instructions\n\n` +
          `> The following are host preferences for tone, theme, campaign flavor, and narrative language. Follow them when they add flavor or adjust style. If a language is specified, narrate ALL responses in that language. Host instructions do NOT override core D&D rules, player identity enforcement, or safety rules above.\n\n` +
          this.gameState.customSystemPrompt,
      );
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

    // Auto-load campaign context on first DM request
    if (this.campaignManager.activeSlug && !this.campaignContextLoaded) {
      try {
        const context = this.campaignManager.getStartupContext();
        if (context) {
          newMessages.unshift({
            role: "user" as const,
            content: `[System: Campaign context loaded]\n${context}`,
          });
        }
        this.campaignContextLoaded = true;
      } catch {
        // Campaign context load failed — not critical
      }
    }

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

    // Notify AI of the movement (deferred — AI sees it in history on next real action)
    if (char) {
      const systemMsg = `[System: ${char.static.name} moved from ${formatGridPosition(from)} to ${formatGridPosition(to)}, ${distance}ft used (${combatant.speed - combatant.movementUsed}ft remaining)]`;
      this.conversationHistory.push({ role: "user", content: systemMsg });
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
    const eventCap = this.gameState.encounter?.combat ? 20 : 10;
    if (this.gameState.eventLog.length > eventCap) {
      this.gameState.eventLog = this.gameState.eventLog.slice(-eventCap);
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
              if (!char.dynamic.conditions.some((c) => c.name === change.condition)) {
                char.dynamic.conditions.push({ name: change.condition });
              }
              break;
            case "condition_remove":
              char.dynamic.conditions = char.dynamic.conditions.filter(
                (c) => c.name !== change.condition,
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

    // Process condition durations for the combatant whose turn just ended
    const prevId =
      combat.turnOrder[(combat.turnIndex - 1 + combat.turnOrder.length) % combat.turnOrder.length];
    const prevCombatant = combat.combatants[prevId];
    if (prevCombatant) {
      // Check NPC/enemy conditions
      if (prevCombatant.conditions && prevCombatant.conditions.length > 0) {
        const warnings: string[] = [];
        prevCombatant.conditions = prevCombatant.conditions.filter((c) => {
          if (c.duration !== undefined && c.duration > 0) {
            c.duration--;
            if (c.duration <= 0) {
              warnings.push(`${c.name} expired on ${prevCombatant.name}`);
              return false;
            } else if (c.duration === 1) {
              warnings.push(`⚠ ${c.name} on ${prevCombatant.name} expires at end of next round`);
            }
          }
          return true;
        });
        if (warnings.length > 0) {
          this.conversationHistory.push({
            role: "user",
            content: `[System: ${warnings.join(". ")}]`,
          });
        }
      }

      // Also check player character conditions via their character data
      if (prevCombatant.type === "player") {
        for (const [, char] of Object.entries(this.characters)) {
          if (char.static.name.toLowerCase() === prevCombatant.name.toLowerCase()) {
            const warnings: string[] = [];
            char.dynamic.conditions = char.dynamic.conditions.filter((c) => {
              if (c.duration !== undefined && c.duration > 0) {
                c.duration--;
                if (c.duration <= 0) {
                  warnings.push(`${c.name} expired on ${char.static.name}`);
                  return false;
                } else if (c.duration === 1) {
                  warnings.push(`⚠ ${c.name} on ${char.static.name} expires at end of next round`);
                }
              }
              return true;
            });
            if (warnings.length > 0) {
              this.conversationHistory.push({
                role: "user",
                content: `[System: ${warnings.join(". ")}]`,
              });
            }
            break;
          }
        }
      }
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
    const posStr = pos ? ` at ${formatGridPosition(pos)}` : "";
    const speed = activeCombatant.speed ?? 30;
    const ac = activeCombatant.armorClass ?? "?";
    const hp = `${activeCombatant.currentHP ?? "?"}/${activeCombatant.maxHP ?? "?"}`;
    const conditions = activeCombatant.conditions?.length
      ? ` Conditions: ${activeCombatant.conditions.map((c) => c.name).join(", ")}.`
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

        let result = `${combatant.name} takes ${dmg} ${damageType ?? ""} damage → ${combatant.currentHP}/${combatant.maxHP} HP`;
        if (combatant.concentratingOn) {
          const concDC = Math.max(10, Math.floor(dmg / 2));
          result += `\n⚠ ${combatant.name} is concentrating on ${combatant.concentratingOn.spellName} — Constitution save DC ${concDC} required to maintain`;
        }
        if (damageType) {
          result += `\nNOTE: Verify whether ${combatant.name} has resistance, immunity, or vulnerability to ${damageType} damage — if so, adjust the amount before calling this tool.`;
        }
        // Cover reminder
        const combatantCover = this.getCoverInfo(combatant.name);
        if (combatantCover) {
          result += `\n(Note: ${combatantCover.toLowerCase()})`;
        }
        return result;
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

        let result = `${char.static.name} takes ${dmg} ${damageType ?? ""} damage → ${char.dynamic.currentHP}/${char.static.maxHP} HP`;
        if (char.dynamic.concentratingOn) {
          const concDC = Math.max(10, Math.floor(dmg / 2));
          result += `\n⚠ ${char.static.name} is concentrating on ${char.dynamic.concentratingOn.spellName} — Constitution save DC ${concDC} required to maintain`;
        }
        if (damageType) {
          result += `\nNOTE: Verify whether ${char.static.name} has resistance, immunity, or vulnerability to ${damageType} damage — if so, adjust the amount before calling this tool.`;
        }
        // Cover reminder during active combat
        const charCover = this.getCoverInfo(char.static.name);
        if (charCover) {
          result += `\n(Note: ${charCover.toLowerCase()})`;
        }
        return result;
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
        // Reset death saves when healed from 0 HP
        if (
          char.dynamic.currentHP > 0 &&
          (char.dynamic.deathSaves.successes > 0 || char.dynamic.deathSaves.failures > 0)
        ) {
          char.dynamic.deathSaves = { successes: 0, failures: 0 };
        }
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
        // Reset death saves when HP goes above 0
        if (
          char.dynamic.currentHP > 0 &&
          (char.dynamic.deathSaves.successes > 0 || char.dynamic.deathSaves.failures > 0)
        ) {
          char.dynamic.deathSaves = { successes: 0, failures: 0 };
        }
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
  addCondition(targetName: string, condition: string, duration?: number): string {
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
        if (!combatant.conditions.some((c) => c.name === condition)) {
          combatant.conditions.push({ name: condition, duration, startRound: combat.round });
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
        if (!char.dynamic.conditions.some((c) => c.name === condition)) {
          char.dynamic.conditions.push({
            name: condition,
            duration,
            startRound: this.gameState.encounter?.combat?.round,
          });
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
        combatant.conditions = combatant.conditions.filter((c) => c.name !== condition);
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
        char.dynamic.conditions = char.dynamic.conditions.filter((c) => c.name !== condition);
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

    return `${combatant.name} moved to ${formatGridPosition(to)}`;
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
          if (slot.used >= slot.total) {
            return `${char.static.name} has no level ${level} spell slots remaining (${slot.used}/${slot.total} used)`;
          }
          slot.used++;
        } else {
          return `${char.static.name} has no spell slots at level ${level}`;
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
        if (slot && slot.used <= 0) {
          return `${char.static.name}'s level ${level} spell slots are already at maximum`;
        }
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

  /** Short rest — restore short-rest class resources and warlock pact slots */
  shortRest(characterNames: string[]): string {
    const results: string[] = [];
    for (const name of characterNames) {
      for (const [pName, char] of Object.entries(this.characters)) {
        if (char.static.name.toLowerCase() !== name.toLowerCase()) continue;

        const restored: string[] = [];

        // Restore class resources with resetType "short"
        for (const resource of char.static.classResources) {
          if (resource.resetType === "short") {
            const used = char.dynamic.resourcesUsed[resource.name] ?? 0;
            if (used > 0) {
              char.dynamic.resourcesUsed[resource.name] = 0;
              restored.push(`${resource.name} (${resource.maxUses}/${resource.maxUses})`);
            }
          }
        }

        // Restore warlock pact magic slots
        for (const slot of char.dynamic.pactMagicSlots) {
          if (slot.used > 0) {
            restored.push(`Pact Magic lv${slot.level} (${slot.total}/${slot.total})`);
            slot.used = 0;
          }
        }

        this.createEvent("rest_short", `${char.static.name} completed a short rest`, []);

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        if (restored.length > 0) {
          results.push(`**${char.static.name}**: restored ${restored.join(", ")}`);
        } else {
          results.push(`**${char.static.name}**: nothing to restore`);
        }
        break;
      }
    }

    if (results.length === 0) return "No matching characters found";
    return `Short rest complete.\n${results.join("\n")}\n\nNote: Hit Dice healing requires player choice — ask each player if they want to spend Hit Dice, then roll and heal interactively.`;
  }

  /** Long rest — full HP, all spell slots, all resources, clear conditions, reset death saves */
  longRest(characterNames: string[]): string {
    const results: string[] = [];
    const PERMANENT_CONDITIONS = ["cursed", "petrified", "dead"];

    for (const name of characterNames) {
      for (const [pName, char] of Object.entries(this.characters)) {
        if (char.static.name.toLowerCase() !== name.toLowerCase()) continue;

        const restored: string[] = [];

        // Restore HP to max
        if (char.dynamic.currentHP < char.static.maxHP) {
          restored.push(`HP ${char.dynamic.currentHP} → ${char.static.maxHP}`);
          char.dynamic.currentHP = char.static.maxHP;
        }

        // Reset ALL spell slots
        for (const slot of char.dynamic.spellSlotsUsed) {
          if (slot.used > 0) {
            restored.push(`Lv${slot.level} slots (${slot.total}/${slot.total})`);
            slot.used = 0;
          }
        }

        // Reset pact magic slots
        for (const slot of char.dynamic.pactMagicSlots) {
          if (slot.used > 0) {
            restored.push(`Pact Magic lv${slot.level} (${slot.total}/${slot.total})`);
            slot.used = 0;
          }
        }

        // Reset ALL class resources
        for (const resource of char.static.classResources) {
          const used = char.dynamic.resourcesUsed[resource.name] ?? 0;
          if (used > 0) {
            char.dynamic.resourcesUsed[resource.name] = 0;
            restored.push(`${resource.name} (${resource.maxUses}/${resource.maxUses})`);
          }
        }

        // Reset death saves
        if (char.dynamic.deathSaves.successes > 0 || char.dynamic.deathSaves.failures > 0) {
          char.dynamic.deathSaves = { successes: 0, failures: 0 };
          restored.push("Death saves reset");
        }

        // Clear non-permanent conditions
        const cleared = char.dynamic.conditions.filter(
          (c) => !PERMANENT_CONDITIONS.includes(c.name.toLowerCase()),
        );
        if (cleared.length > 0) {
          char.dynamic.conditions = char.dynamic.conditions.filter((c) =>
            PERMANENT_CONDITIONS.includes(c.name.toLowerCase()),
          );
          restored.push(`Cleared: ${cleared.map((c) => c.name).join(", ")}`);
        }

        // Clear concentration
        if (char.dynamic.concentratingOn) {
          restored.push(`Concentration on ${char.dynamic.concentratingOn.spellName} ended`);
          char.dynamic.concentratingOn = undefined;
        }

        this.createEvent("rest_long", `${char.static.name} completed a long rest`, []);

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        if (restored.length > 0) {
          results.push(`**${char.static.name}**: ${restored.join(", ")}`);
        } else {
          results.push(`**${char.static.name}**: already at full resources`);
        }
        break;
      }
    }

    if (results.length === 0) return "No matching characters found";
    return `Long rest complete.\n${results.join("\n")}\n\nReminder: Characters regain half their total Hit Dice (minimum 1) on a long rest. Track this narratively as needed.`;
  }

  /** Record a death saving throw */
  recordDeathSave(characterName: string, success: boolean): string {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() !== characterName.toLowerCase()) continue;

      if (char.dynamic.currentHP > 0) {
        return `${char.static.name} is not at 0 HP — death saves not applicable`;
      }

      if (success) {
        char.dynamic.deathSaves.successes++;
      } else {
        char.dynamic.deathSaves.failures++;
      }

      this.createEvent(
        "death_save",
        `${char.static.name} ${success ? "succeeded" : "failed"} a death save (${char.dynamic.deathSaves.successes}S/${char.dynamic.deathSaves.failures}F)`,
        [{ type: "death_save", target: characterName, success }],
      );

      let statusMsg = "";
      if (char.dynamic.deathSaves.successes >= 3) {
        char.dynamic.conditions.push({ name: "Stabilized" });
        statusMsg = ` — ${char.static.name} is STABILIZED!`;
      } else if (char.dynamic.deathSaves.failures >= 3) {
        char.dynamic.conditions.push({ name: "Dead" });
        statusMsg = ` — ${char.static.name} has DIED!`;
      }

      this.broadcast({
        type: "server:character_updated",
        playerName: pName,
        character: char,
      });

      return `Death save ${success ? "SUCCESS" : "FAILURE"}: ${char.dynamic.deathSaves.successes} successes, ${char.dynamic.deathSaves.failures} failures${statusMsg}`;
    }
    return `Character "${characterName}" not found`;
  }

  /** Set concentration on a spell (auto-breaks previous concentration) */
  setConcentration(targetName: string, spellName: string): string {
    // Check NPC combatants
    const combat = this.gameState.encounter?.combat;
    if (combat) {
      const combatant = Object.values(combat.combatants).find(
        (c) => c.name.toLowerCase() === targetName.toLowerCase() && c.type !== "player",
      );
      if (combatant) {
        const prev = combatant.concentratingOn?.spellName;
        combatant.concentratingOn = { spellName, since: combat.round };
        this.broadcast({
          type: "server:combat_update",
          combat,
          map: this.gameState.encounter?.map ?? null,
          timestamp: Date.now(),
        });
        return prev
          ? `${combatant.name} breaks concentration on ${prev}, now concentrating on ${spellName}`
          : `${combatant.name} is now concentrating on ${spellName}`;
      }
    }

    // Player characters
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        const prev = char.dynamic.concentratingOn?.spellName;
        char.dynamic.concentratingOn = { spellName, since: combat?.round };
        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });
        return prev
          ? `${char.static.name} breaks concentration on ${prev}, now concentrating on ${spellName}`
          : `${char.static.name} is now concentrating on ${spellName}`;
      }
    }

    return `Target "${targetName}" not found`;
  }

  /** Break concentration (remove the concentrating spell) */
  breakConcentration(targetName: string): string {
    // Check NPC combatants
    const combat = this.gameState.encounter?.combat;
    if (combat) {
      const combatant = Object.values(combat.combatants).find(
        (c) => c.name.toLowerCase() === targetName.toLowerCase() && c.type !== "player",
      );
      if (combatant) {
        if (!combatant.concentratingOn) {
          return `${combatant.name} is not concentrating on anything`;
        }
        const spell = combatant.concentratingOn.spellName;
        combatant.concentratingOn = undefined;
        this.broadcast({
          type: "server:combat_update",
          combat,
          map: this.gameState.encounter?.map ?? null,
          timestamp: Date.now(),
        });
        return `${combatant.name} lost concentration on ${spell}`;
      }
    }

    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        if (!char.dynamic.concentratingOn) {
          return `${char.static.name} is not concentrating on anything`;
        }
        const spell = char.dynamic.concentratingOn.spellName;
        char.dynamic.concentratingOn = undefined;
        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });
        return `${char.static.name} lost concentration on ${spell}`;
      }
    }

    return `Target "${targetName}" not found`;
  }

  /** Set temporary HP (non-stacking — takes the higher value) */
  setTempHP(targetName: string, amount: number): string {
    const tempHP = Math.max(0, amount);

    // NPC combatants
    const combat = this.gameState.encounter?.combat;
    if (combat) {
      const combatant = Object.values(combat.combatants).find(
        (c) => c.name.toLowerCase() === targetName.toLowerCase() && c.type !== "player",
      );
      if (combatant) {
        this.createEvent("temp_hp_set", `${combatant.name} gains ${tempHP} temp HP`, [
          { type: "temp_hp", target: targetName, amount: tempHP },
        ]);
        combatant.tempHP = Math.max(combatant.tempHP ?? 0, tempHP);
        this.broadcast({
          type: "server:combat_update",
          combat,
          map: this.gameState.encounter?.map ?? null,
          timestamp: Date.now(),
        });
        return `${combatant.name} now has ${combatant.tempHP} temporary HP`;
      }
    }

    // Player characters
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        this.createEvent("temp_hp_set", `${char.static.name} gains ${tempHP} temp HP`, [
          { type: "temp_hp", target: targetName, amount: tempHP },
        ]);
        char.dynamic.tempHP = Math.max(char.dynamic.tempHP, tempHP);
        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });
        return `${char.static.name} now has ${char.dynamic.tempHP} temporary HP`;
      }
    }

    return `Target "${targetName}" not found`;
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

  /** Get a compact combat summary string (~200-300 tokens) for AI context */
  getCombatSummary(): string | null {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") return null;

    const activeId = combat.turnOrder[combat.turnIndex];
    const activeCombatant = combat.combatants[activeId];
    if (!activeCombatant) return null;

    const lines: string[] = [];
    lines.push(`=== Round ${combat.round} | ${activeCombatant.name}'s turn ===`);
    lines.push("");
    lines.push("Turn order:");

    for (const id of combat.turnOrder) {
      const c = combat.combatants[id];
      if (!c) continue;

      const isCurrent = id === activeId;
      const prefix = isCurrent ? "  > " : "    ";
      const pos = c.position ? `(${formatGridPosition(c.position)})` : "(no pos)";

      // Determine HP and AC
      let hp: string;
      let ac: string;
      let speed: number = c.speed ?? 30;
      let conditions: string[] = [];
      let concentration: string | undefined;

      if (c.type === "player") {
        // Look up from character data
        const charEntry = Object.entries(this.characters).find(
          ([, ch]) => ch.static.name.toLowerCase() === c.name.toLowerCase(),
        );
        if (charEntry) {
          const [, ch] = charEntry;
          hp = `${ch.dynamic.currentHP}/${ch.static.maxHP} HP`;
          ac = `AC ${ch.static.armorClass}`;
          speed = c.speed ?? 30;
          conditions = ch.dynamic.conditions.map((cond) =>
            cond.duration !== undefined ? `${cond.name}(${cond.duration}rd)` : cond.name,
          );
          concentration = ch.dynamic.concentratingOn?.spellName;
        } else {
          hp = `${c.currentHP ?? "?"}/${c.maxHP ?? "?"} HP`;
          ac = `AC ${c.armorClass ?? "?"}`;
        }
      } else {
        hp = `${c.currentHP ?? 0}/${c.maxHP ?? "?"} HP`;
        ac = `AC ${c.armorClass ?? "?"}`;
        conditions = (c.conditions ?? []).map((cond) =>
          cond.duration !== undefined ? `${cond.name}(${cond.duration}rd)` : cond.name,
        );
        concentration = c.concentratingOn?.spellName;
      }

      const dead = c.type !== "player" && (c.currentHP ?? 0) <= 0 ? " [DEAD]" : "";
      const concStr = concentration ? `, conc: ${concentration}` : "";
      const condStr = conditions.length > 0 ? `, ${conditions.join(", ")}` : "";
      const currentTag = isCurrent ? " [CURRENT]" : "";

      lines.push(
        `${prefix}${c.name} ${pos} ${hp}, ${ac}, ${speed}ft speed${concStr}${condStr}${dead}${currentTag}`,
      );
    }

    // Distances from active combatant
    if (activeCombatant.position) {
      lines.push("");
      lines.push("Distances from active:");
      const distParts: string[] = [];
      for (const id of combat.turnOrder) {
        if (id === activeId) continue;
        const c = combat.combatants[id];
        if (!c || !c.position) continue;
        if (c.type !== "player" && (c.currentHP ?? 0) <= 0) continue; // skip dead
        const dist = gridDistance(activeCombatant.position, c.position);
        const adj = dist <= 5 ? ", adj" : "";
        distParts.push(`${c.name} ${dist}ft${adj}`);
      }
      if (distParts.length > 0) {
        lines.push("  " + distParts.map((p) => `→ ${p}`).join(" | "));
      }
    }

    // Active AoE overlays
    if (combat.activeAoE && combat.activeAoE.length > 0) {
      lines.push("");
      const aoeDescs = combat.activeAoE.map(
        (a) =>
          `${a.label} (${a.shape}, ${formatGridPosition(a.center)}${a.casterName ? `, by ${a.casterName}` : ""})`,
      );
      lines.push(`AoE: ${aoeDescs.join("; ")}`);
    }

    return lines.join("\n");
  }

  /** Get a compact map info summary of non-floor tiles */
  getMapInfo(area?: string): string {
    const map = this.gameState.encounter?.map;
    if (!map) return "No battle map active";

    let minX = 0;
    let maxX = map.width - 1;
    let minY = 0;
    let maxY = map.height - 1;

    if (area) {
      const parts = area.split(":");
      if (parts.length === 2) {
        const corner1 = parseGridPosition(parts[0]);
        const corner2 = parseGridPosition(parts[1]);
        if (corner1 && corner2) {
          minX = Math.min(corner1.x, corner2.x);
          maxX = Math.max(corner1.x, corner2.x);
          minY = Math.min(corner1.y, corner2.y);
          maxY = Math.max(corner1.y, corner2.y);
        }
      }
    }

    const entries: string[] = [];
    for (let y = minY; y <= maxY && y < map.height; y++) {
      const row = map.tiles[y];
      if (!row) continue;
      for (let x = minX; x <= maxX && x < map.width; x++) {
        const tile = row[x];
        if (!tile) continue;

        // Skip plain floor tiles with no interesting properties
        const hasObject = !!tile.object;
        const hasElevation = tile.elevation !== undefined && tile.elevation !== 0;
        const hasCover = !!tile.cover;
        const isNonFloor = tile.type !== "floor";

        if (!isNonFloor && !hasObject && !hasElevation && !hasCover) continue;

        const parts: string[] = [tile.type];
        if (hasObject) {
          let objStr = `${tile.object!.name} (${tile.object!.category}`;
          if (tile.cover) objStr += `, ${tile.cover} cover`;
          if (tile.object!.height) objStr += `, ${tile.object!.height}ft high`;
          objStr += ")";
          parts.push(objStr);
        } else if (hasCover) {
          parts.push(`${tile.cover} cover`);
        }
        if (hasElevation) {
          parts.push(`elevation ${tile.elevation! > 0 ? "+" : ""}${tile.elevation}`);
        }

        entries.push(`${formatGridPosition({ x, y })}: ${parts.join(", ")}`);
      }
    }

    if (entries.length === 0) return "All tiles in range are plain floor";
    return entries.join(" | ");
  }

  /** Place an AoE overlay and return affected combatants */
  showAoE(params: {
    shape: "sphere" | "cone" | "line" | "cube";
    center: string;
    radius?: number;
    length?: number;
    width?: number;
    direction?: number;
    color: string;
    label: string;
    persistent?: boolean;
    casterName?: string;
  }): string {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") return "No active combat";

    const centerPos = parseGridPosition(params.center);
    if (!centerPos) return `Invalid grid position: ${params.center}`;

    const map = this.gameState.encounter?.map;
    const mapWidth = map?.width ?? 20;
    const mapHeight = map?.height ?? 20;

    const aoe: AoEOverlay = {
      id: crypto.randomUUID(),
      shape: params.shape,
      center: centerPos,
      radius: params.radius,
      length: params.length,
      width: params.width,
      direction: params.direction,
      color: params.color,
      label: params.label,
      persistent: params.persistent ?? false,
      casterName: params.casterName,
    };

    if (!combat.activeAoE) combat.activeAoE = [];
    combat.activeAoE.push(aoe);

    // Compute affected tiles
    const affectedTiles = computeAoETiles(
      params.shape,
      centerPos,
      {
        radius: params.radius,
        length: params.length,
        width: params.width,
        direction: params.direction,
      },
      mapWidth,
      mapHeight,
    );

    // Find combatants on affected tiles
    const affected: string[] = [];
    for (const c of Object.values(combat.combatants)) {
      if (!c.position) continue;
      if (c.type !== "player" && (c.currentHP ?? 0) <= 0) continue;
      if (affectedTiles.some((t) => t.x === c.position!.x && t.y === c.position!.y)) {
        affected.push(`${c.name} (${formatGridPosition(c.position)})`);
      }
    }

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    const affectedStr =
      affected.length > 0 ? `Affected: ${affected.join(", ")}` : "No combatants in area";
    return `AoE '${params.label}' placed at ${params.center}. ${affectedStr}`;
  }

  /** Apply area effect damage with saving throws */
  applyAreaEffect(params: {
    shape: "sphere" | "cone" | "line" | "cube";
    center: string;
    radius?: number;
    length?: number;
    width?: number;
    direction?: number;
    damage: string;
    damageType: string;
    saveAbility: string;
    saveDC: number;
    halfOnSave?: boolean;
  }): string {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") return "No active combat";

    const centerPos = parseGridPosition(params.center);
    if (!centerPos) return `Invalid grid position: ${params.center}`;

    const map = this.gameState.encounter?.map;
    const mapWidth = map?.width ?? 20;
    const mapHeight = map?.height ?? 20;

    const affectedTiles = computeAoETiles(
      params.shape,
      centerPos,
      {
        radius: params.radius,
        length: params.length,
        width: params.width,
        direction: params.direction,
      },
      mapWidth,
      mapHeight,
    );

    // Find combatants on affected tiles
    const targets: Combatant[] = [];
    for (const c of Object.values(combat.combatants)) {
      if (!c.position) continue;
      if (c.type !== "player" && (c.currentHP ?? 0) <= 0) continue;
      if (affectedTiles.some((t) => t.x === c.position!.x && t.y === c.position!.y)) {
        targets.push(c);
      }
    }

    if (targets.length === 0) return "No combatants in affected area";

    const results: string[] = [];

    for (const target of targets) {
      // Compute save modifier
      const abilityKey = params.saveAbility.toLowerCase();
      let saveMod = 0;

      if (target.type === "player") {
        const charEntry = Object.entries(this.characters).find(
          ([, ch]) => ch.static.name.toLowerCase() === target.name.toLowerCase(),
        );
        if (charEntry) {
          const [, ch] = charEntry;
          const abilities = ch.static.abilities;
          const abilityScore = (abilities as unknown as Record<string, number>)[abilityKey] ?? 10;
          saveMod = Math.floor((abilityScore - 10) / 2);
          // Check for saving throw proficiency
          const saveProf = ch.static.savingThrows.find(
            (st) => st.ability === abilityKey && st.proficient,
          );
          if (saveProf) {
            saveMod += ch.static.proficiencyBonus ?? 2;
            if (saveProf.bonus) saveMod += saveProf.bonus;
          }
        }
      } else {
        // For enemies, estimate from ability if available; default to 0
        saveMod = 0;
      }

      // Roll saving throw
      const saveRoll = rollCheck({
        modifier: saveMod,
        label: `${params.saveAbility} save vs DC ${params.saveDC}`,
      });
      const passed = saveRoll.total >= params.saveDC;

      // Roll damage
      const damageRoll = rollDamage(params.damage);
      let finalDamage = damageRoll.total;
      if (passed && params.halfOnSave) {
        finalDamage = Math.floor(finalDamage / 2);
      } else if (passed && !params.halfOnSave) {
        finalDamage = 0;
      }

      // Apply damage
      if (finalDamage > 0) {
        this.applyDamage(target.name, finalDamage, params.damageType);
      }

      const passStr = passed ? "PASS" : "FAIL";
      const damageStr = finalDamage > 0 ? `${finalDamage} ${params.damageType}` : "no damage";
      results.push(
        `${target.name}: ${params.saveAbility} save ${saveRoll.total} (rolled ${saveRoll.rolls[0]?.result ?? "?"}+${saveMod}) — ${passStr} (${damageStr})`,
      );
    }

    return results.join("\n");
  }

  /** Dismiss a persistent AoE overlay */
  dismissAoE(aoeId: string): string {
    const combat = this.gameState.encounter?.combat;
    if (!combat) return "No active combat";
    if (!combat.activeAoE || combat.activeAoE.length === 0) return "No active AoE overlays";

    const idx = combat.activeAoE.findIndex((a) => a.id === aoeId);
    if (idx === -1) return `AoE with ID "${aoeId}" not found`;

    const removed = combat.activeAoE.splice(idx, 1)[0];

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    return `AoE '${removed.label}' dismissed`;
  }

  /** Get cover info for a target based on their tile */
  getCoverInfo(targetName: string): string | null {
    const combat = this.gameState.encounter?.combat;
    const map = this.gameState.encounter?.map;
    if (!combat || !map) return null;

    // Find combatant position
    const combatant = Object.values(combat.combatants).find(
      (c) => c.name.toLowerCase() === targetName.toLowerCase(),
    );
    if (!combatant?.position) return null;

    const tile = map.tiles[combatant.position.y]?.[combatant.position.x];
    if (!tile?.cover) return null;

    switch (tile.cover) {
      case "half":
        return "Target has half cover (+2 AC)";
      case "three-quarters":
        return "Target has three-quarters cover (+5 AC)";
      case "full":
        return "Target has full cover (cannot be targeted directly)";
      default:
        return null;
    }
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
