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
  DieRoll,
} from "@unseen-servant/shared/types";
import {
  rollInitiative,
  buildCheckLabel,
  computeCheckModifier,
  formatGridPosition,
  parseGridPosition,
  gridDistance,
  computeAoETiles,
} from "@unseen-servant/shared/utils";
import { rollNotation } from "./dice-engine.js";
import {
  DM_SKILL_COMBAT,
  DM_SKILL_NARRATION,
  DM_SKILL_CAMPAIGN,
  DM_PACING_PROFILES,
  DM_ENCOUNTER_LENGTHS,
  DM_SKILL_SOCIAL,
} from "@unseen-servant/shared";
import { getClass } from "@unseen-servant/shared/data";
import { log } from "../logger.js";
import type { MessageQueue } from "../message-queue.js";
import type { CampaignManager } from "./campaign-manager.js";
import type { GameLogger } from "./game-logger.js";

/** 2024 PHB feats relevant to short rest Hit Dice spending (keyed by lowercase feat name) */
const REST_FEAT_HINTS: Record<string, string> = {
  chef: "Chef (Replenishing Meal): creatures who spend Hit Dice regain extra 1d8 HP",
  durable: "Durable (Speedy Recovery): spend 1 Hit Die as Bonus Action, roll only (no CON mod)",
  healer:
    "Healer (Battle Medic): Utilize action + Healer's Kit — target spends their Hit Die, you add your PB",
};

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/** Structured tool response returned by GSM methods for MCP tools */
export interface ToolResponse {
  /** Human-readable summary (backwards-compatible with old string returns) */
  text: string;
  /** Machine-parseable structured data */
  data: Record<string, unknown>;
  /** Whether this represents an error */
  error?: boolean;
  /** Recovery hints shown to the AI on error */
  hints?: string[];
}

function toResponse(
  text: string,
  data: Record<string, unknown>,
  error?: boolean,
  hints?: string[],
): ToolResponse {
  return { text, data, ...(error ? { error } : {}), ...(hints ? { hints } : {}) };
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
  private gameLogger?: GameLogger;
  /** Host player name (for permission checks) */
  hostName = "";
  /** All known player names (for validation) */
  playerNames: string[] = [];
  /** Whether campaign context has been auto-loaded on first DM request */
  private campaignContextLoaded = false;
  /** Debounce timer for batching chat messages */
  private pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_DELAY_MS = 2000;
  /** Dirty flag — true when in-memory state differs from last persisted snapshot */
  private _dirty = false;
  /** True when conversationHistory differs from last persisted chat-history.json */
  private _chatDirty = false;
  /** Set of player names whose character snapshots need re-persisting */
  private _dirtyCharacters = new Set<string>();
  /** Debounce timer for coalescing rapid mutations into a single write */
  private _flushTimer: ReturnType<typeof setTimeout> | null = null;
  /** Debounce delay in ms — coalesces rapid mutations (e.g., applyBatchEffects) */
  private readonly FLUSH_DELAY_MS = 200;
  /** Last completed check result — consumed by sendCheckRequest resolver */
  lastCheckResult: {
    characterName: string;
    total: number;
    rolls: DieRoll[];
    modifier: number;
    label: string;
    success?: boolean;
    dc?: number;
    criticalHit?: boolean;
    criticalFail?: boolean;
    notation?: string;
  } | null = null;

  constructor(opts: {
    broadcast: BroadcastFn;
    messageQueue: MessageQueue;
    campaignManager: CampaignManager;
    gameLogger?: GameLogger;
  }) {
    this.broadcast = opts.broadcast;
    this.messageQueue = opts.messageQueue;
    this.campaignManager = opts.campaignManager;
    this.gameLogger = opts.gameLogger;
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
    // Mark chat dirty so it gets persisted on next flush
    this._chatDirty = true;
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
      // Clear dirty flags since we just wrote everything
      this._dirty = false;
      this._chatDirty = false;
      this._dirtyCharacters.clear();
      if (this._flushTimer) {
        clearTimeout(this._flushTimer);
        this._flushTimer = null;
      }
    } catch (e) {
      log(
        "game-state",
        `Failed to save session state: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Mark game state as dirty — schedules a debounced flush to campaign files */
  markDirty(): void {
    this._dirty = true;
    this.scheduleFlush();
  }

  /** Mark a character as needing snapshot update */
  markCharacterDirty(playerName: string): void {
    this._dirtyCharacters.add(playerName);
    this.markDirty();
  }

  /** Schedule a debounced flush (resets timer on each call) */
  private scheduleFlush(): void {
    if (!this.campaignManager.activeSlug) return;
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => {
      this.flushDirtyState();
    }, this.FLUSH_DELAY_MS);
  }

  /** Write dirty state to campaign files. Called by timer or explicitly on shutdown. */
  flushDirtyState(): void {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    if (!this._dirty || !this.campaignManager.activeSlug) {
      this._dirty = false;
      this._dirtyCharacters.clear();
      return;
    }

    try {
      // Write session state (game state, story flag, player list, etc.)
      const snapshot = this.serializeSessionState();
      this.campaignManager.writeFile("session-state.json", JSON.stringify(snapshot, null, 2));

      // Write chat history if dirty
      if (this._chatDirty) {
        this.campaignManager.writeFile(
          "chat-history.json",
          JSON.stringify(this.conversationHistory, null, 2),
        );
        this._chatDirty = false;
      }

      // Write dirty character snapshots
      const charCount = this._dirtyCharacters.size;
      for (const playerName of this._dirtyCharacters) {
        const char = this.characters[playerName];
        if (char) {
          this.campaignManager.writeFile(
            `characters/${playerName}.json`,
            JSON.stringify(char, null, 2),
          );
        }
      }

      this._dirty = false;
      this._dirtyCharacters.clear();
      log("game-state", `Flushed dirty state (${charCount} character snapshots)`);
    } catch (e) {
      log(
        "game-state",
        `Failed to flush dirty state: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Force synchronous flush — call before process exit */
  forceFlush(): void {
    this.flushDirtyState();
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

  /** Schedule a batched push — collects chat messages for BATCH_DELAY_MS before pushing.
   *  If a direct pushDMRequest() fires during the window, the timer is cancelled
   *  and all accumulated messages flush immediately. */
  private schedulePushDMRequest(): void {
    if (this.pushDebounceTimer) clearTimeout(this.pushDebounceTimer);
    this.pushDebounceTimer = setTimeout(() => {
      this.pushDebounceTimer = null;
      this.pushDMRequest();
    }, this.BATCH_DELAY_MS);
  }

  /** Push a DM request with only new messages since last send.
   *  Uses hash-based delta delivery — only sends the full dynamic prompt
   *  when it changes or every FULL_PROMPT_INTERVAL turns. */
  private pushDMRequest(): void {
    // Cancel any pending batch timer — direct pushes take priority
    if (this.pushDebounceTimer) {
      clearTimeout(this.pushDebounceTimer);
      this.pushDebounceTimer = null;
    }

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
    log(
      "game-state",
      `pushDMRequest: requestId=${requestId}, messages=${newMessages.length}, total=${this.conversationHistory.length}`,
    );
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
    this.gameLogger?.playerMessage(playerName, speakerName, content);

    // Batch chat messages — waits BATCH_DELAY_MS for more messages before pushing
    this.schedulePushDMRequest();
  }

  // ─── Start Story ───

  handleStartStory(playerName: string): void {
    log(
      "game-state",
      `handleStartStory: playerName="${playerName}", hostName="${this.hostName}", storyStarted=${this.storyStarted}`,
    );
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

    try {
      // Build greeting dm_request
      const partyDescriptions = Object.entries(this.characters).map(([pName, char]) => {
        const classes = char.static.classes?.map((c) => `${c.name} ${c.level}`).join("/");
        return `${pName} (${char.static.name}, ${char.static.species || char.static.race} ${classes || "Unknown"})`;
      });

      const userMsg = `The adventuring party has gathered: ${partyDescriptions.join(", ")}. Set the scene and introduce each character!`;

      this.conversationHistory.push({
        role: "user",
        content: userMsg,
      });

      this.pushDMRequest();
    } catch (e) {
      log(
        "game-state",
        `handleStartStory FAILED after broadcast: ${e instanceof Error ? e.message : String(e)}`,
      );
      // Still push a basic request so the game doesn't hang
      this.conversationHistory.push({
        role: "user",
        content: "The adventuring party has gathered. Set the scene and begin the adventure!",
      });
      this.pushDMRequest();
    }
    this.markDirty();
  }

  // ─── Send Response (called by MCP tool) ───

  sendResponse(requestId: string, text: string): void {
    // Store in conversation history
    this.conversationHistory.push({ role: "assistant", content: text });
    this.lastSentIndex = this.conversationHistory.length;
    this._chatDirty = true;
    this.gameLogger?.dmResponse(text);

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

    // ── Unified roll path ──
    // If checkType is set, compute modifier from character sheet and append to notation
    let finalNotation = pendingCheck.notation;
    const label = buildCheckLabel(pendingCheck);

    if (pendingCheck.checkType) {
      const modifier = computeCheckModifier(char, pendingCheck);
      if (modifier !== 0) {
        finalNotation = `${pendingCheck.notation}${modifier >= 0 ? "+" : ""}${modifier}`;
      }
    }

    const { result: roll } = rollNotation(finalNotation, label);

    const success = pendingCheck.dc !== undefined ? roll.total >= pendingCheck.dc : undefined;

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

    // Store result for sendCheckRequest resolver
    this.lastCheckResult = {
      characterName: char.static.name,
      total: roll.total,
      rolls: roll.rolls,
      modifier: roll.modifier,
      label: roll.label,
      success,
      dc: pendingCheck.dc,
      criticalHit: roll.criticalHit,
      criticalFail: roll.criticalFail,
      notation: finalNotation,
    };

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
    this.markDirty();
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
    this.markDirty();
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
    this.markDirty();
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

    // Restore encounter phase
    if (event.stateBefore.encounterPhase !== undefined && this.gameState.encounter) {
      this.gameState.encounter.phase = event.stateBefore.encounterPhase;
    }

    // Restore pending check
    this.gameState.pendingCheck = event.stateBefore.pendingCheck;

    // Restore battle map
    if (this.gameState.encounter) {
      this.gameState.encounter.map = event.stateBefore.map;
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
    this.markDirty();
  }

  // ─── Event Creation ───

  private createEvent(type: GameEventType, description: string, changes: StateChange[]): void {
    const characterSnapshots: Record<string, CharacterDynamicData> = {};
    for (const [pName, char] of Object.entries(this.characters)) {
      characterSnapshots[pName] = structuredClone(char.dynamic);
    }
    const combat = this.gameState.encounter?.combat;
    const combatantSnapshots = combat ? structuredClone(combat.combatants) : undefined;
    const encounterPhaseSnapshot = this.gameState.encounter?.phase;
    const pendingCheckSnapshot = this.gameState.pendingCheck
      ? structuredClone(this.gameState.pendingCheck)
      : undefined;
    const mapSnapshot = this.gameState.encounter?.map
      ? structuredClone(this.gameState.encounter.map)
      : undefined;

    const event: GameEvent = {
      id: crypto.randomUUID(),
      type,
      timestamp: Date.now(),
      description,
      stateBefore: {
        characters: characterSnapshots,
        combatants: combatantSnapshots,
        encounterPhase: encounterPhaseSnapshot,
        pendingCheck: pendingCheckSnapshot,
        map: mapSnapshot,
      },
      conversationIndex: this.conversationHistory.length,
      changes,
    };

    this.gameState.eventLog.push(event);
    const eventCap = this.gameState.encounter?.combat ? 20 : 10;
    if (this.gameState.eventLog.length > eventCap) {
      this.gameState.eventLog = this.gameState.eventLog.slice(-eventCap);
    }
    this.broadcast({ type: "server:event_log", event });
    this.gameLogger?.gameEvent(event.type, event.description);
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
    this.markCharacterDirty(playerName);

    // Snapshot to campaign
    const cm = this.campaignManager;
    if (cm.activeSlug) {
      try {
        cm.snapshotCharacters({ [playerName]: character });
      } catch {
        // ignore
      }
    }

    // Broadcast to all players — the bridge is the single authoritative sender of
    // character_updated. The worker caches the character on receipt of this broadcast
    // (via handleBroadcast) but must not send its own copy.
    this.broadcast({
      type: "server:character_updated",
      playerName,
      character,
      source: "player",
    });
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
      // Reset per-turn resources at the start of this combatant's turn
      active.movementUsed = 0;
      active.reactionUsed = false;
      active.bonusActionUsed = false;
    }

    // Process start-of-turn conditions on the combatant whose turn is starting
    if (active) {
      // NPC/enemy start-of-turn conditions
      if (active.conditions && active.conditions.length > 0) {
        const warnings: string[] = [];
        active.conditions = active.conditions.filter((c) => {
          if (c.expiresAt === "start-of-turn" && c.duration !== undefined && c.duration > 0) {
            c.duration--;
            if (c.duration <= 0) {
              warnings.push(`${c.name} expired on ${active.name}`);
              return false;
            } else if (c.duration === 1) {
              warnings.push(`⚠ ${c.name} on ${active.name} expires at start of next turn`);
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

      // Player character start-of-turn conditions
      if (active.type === "player") {
        for (const [, char] of Object.entries(this.characters)) {
          if (char.static.name.toLowerCase() === active.name.toLowerCase()) {
            const warnings: string[] = [];
            char.dynamic.conditions = char.dynamic.conditions.filter((c) => {
              if (c.expiresAt === "start-of-turn" && c.duration !== undefined && c.duration > 0) {
                c.duration--;
                if (c.duration <= 0) {
                  warnings.push(`${c.name} expired on ${char.static.name}`);
                  return false;
                } else if (c.duration === 1) {
                  warnings.push(`⚠ ${c.name} on ${char.static.name} expires at start of next turn`);
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

    // Process end-of-turn conditions for the combatant whose turn just ended
    const prevId =
      combat.turnOrder[(combat.turnIndex - 1 + combat.turnOrder.length) % combat.turnOrder.length];
    const prevCombatant = combat.combatants[prevId];
    if (prevCombatant) {
      // Check NPC/enemy end-of-turn conditions (expiresAt "end-of-turn" or undefined/default)
      if (prevCombatant.conditions && prevCombatant.conditions.length > 0) {
        const warnings: string[] = [];
        prevCombatant.conditions = prevCombatant.conditions.filter((c) => {
          if (c.expiresAt === "start-of-turn") return true; // handled above
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

      // Also check player character end-of-turn conditions via their character data
      if (prevCombatant.type === "player") {
        for (const [, char] of Object.entries(this.characters)) {
          if (char.static.name.toLowerCase() === prevCombatant.name.toLowerCase()) {
            const warnings: string[] = [];
            char.dynamic.conditions = char.dynamic.conditions.filter((c) => {
              if (c.expiresAt === "start-of-turn") return true; // handled above
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

  /** Get stratified game state: compact (~200 tokens), tactical (~500 tokens), or full (everything) */
  getGameStateStratified(detail: "compact" | "tactical" | "full"): ToolResponse {
    if (detail === "full") {
      const state = this.getGameState();
      return toResponse("Full game state", { ...state });
    }

    const combat = this.gameState.encounter?.combat;
    const inCombat = !!combat && combat.phase === "active";
    const mode = inCombat ? "combat" : "exploration";

    // Build character summaries
    const characters = Object.values(this.characters).map((char) => {
      const c: Record<string, unknown> = {
        name: char.static.name,
        hp: `${char.dynamic.currentHP}/${char.static.maxHP}`,
        ac: char.static.armorClass,
        classes: char.static.classes.map((cl) => `${cl.name} ${cl.level}`).join("/"),
      };
      if (char.dynamic.tempHP > 0) c.tempHP = char.dynamic.tempHP;
      if (char.dynamic.conditions.length > 0)
        c.conditions = char.dynamic.conditions.map((cd) => cd.name);
      if (char.dynamic.concentratingOn) c.concentrating = char.dynamic.concentratingOn.spellName;
      if (char.dynamic.heroicInspiration ?? false) c.inspiration = true;
      return c;
    });

    if (!inCombat) {
      // Exploration mode — characters only
      const text = `[${mode.toUpperCase()}] ${characters.length} characters`;
      return toResponse(text, { mode, characters });
    }

    // Combat mode — turn order + HP/conditions
    const activeId = combat!.turnOrder[combat!.turnIndex];
    const turnOrder = combat!.turnOrder
      .map((id) => {
        const cb = combat!.combatants[id];
        if (!cb) return null;
        const entry: Record<string, unknown> = {
          name: cb.name,
          type: cb.type,
          initiative: cb.initiative,
          hp:
            cb.type === "player"
              ? (() => {
                  const ch = Object.values(this.characters).find(
                    (c) => c.static.name.toLowerCase() === cb.name.toLowerCase(),
                  );
                  return ch
                    ? `${ch.dynamic.currentHP}/${ch.static.maxHP}`
                    : `${cb.currentHP ?? "?"}/${cb.maxHP ?? "?"}`;
                })()
              : `${cb.currentHP ?? 0}/${cb.maxHP ?? "?"}`,
          ac:
            cb.type === "player"
              ? (Object.values(this.characters).find(
                  (c) => c.static.name.toLowerCase() === cb.name.toLowerCase(),
                )?.static.armorClass ?? cb.armorClass)
              : cb.armorClass,
        };
        if (id === activeId) entry.current = true;
        const conditions =
          cb.type === "player"
            ? (Object.values(this.characters)
                .find((c) => c.static.name.toLowerCase() === cb.name.toLowerCase())
                ?.dynamic.conditions.map((cd) => cd.name) ?? [])
            : (cb.conditions ?? []).map((cd) => cd.name);
        if (conditions.length > 0) entry.conditions = conditions;
        const conc =
          cb.type === "player"
            ? Object.values(this.characters).find(
                (c) => c.static.name.toLowerCase() === cb.name.toLowerCase(),
              )?.dynamic.concentratingOn?.spellName
            : cb.concentratingOn?.spellName;
        if (conc) entry.concentrating = conc;
        if (cb.type !== "player" && (cb.currentHP ?? 0) <= 0) entry.dead = true;
        return entry;
      })
      .filter(Boolean);

    const activeName = combat!.combatants[activeId]?.name ?? "unknown";

    if (detail === "compact") {
      return toResponse(
        `[COMBAT] Round ${combat!.round} | ${activeName}'s turn | ${turnOrder.length} combatants`,
        { mode, round: combat!.round, currentTurn: activeName, turnOrder },
      );
    }

    // Tactical — add positions, distances, terrain, AoE
    const activeCombatant = combat!.combatants[activeId];
    for (const entry of turnOrder) {
      if (!entry) continue;
      const e = entry as Record<string, unknown>;
      const cb = Object.values(combat!.combatants).find((c) => c.name === e.name);
      if (cb?.position) {
        e.position = formatGridPosition(cb.position);
        if (activeCombatant?.position && cb.name !== activeCombatant.name) {
          e.distance = gridDistance(activeCombatant.position, cb.position) + "ft";
        }
      }
      e.speed = (cb?.speed ?? 30) + "ft";
    }

    const data: Record<string, unknown> = {
      mode,
      round: combat!.round,
      currentTurn: activeName,
      turnOrder,
    };

    // Map terrain near combatants
    const map = this.gameState.encounter?.map;
    if (map) {
      data.mapName = map.name;
      data.mapSize = `${map.width}x${map.height}`;
    }

    // Active AoE
    if (combat!.activeAoE && combat!.activeAoE.length > 0) {
      data.activeAoE = combat!.activeAoE.map((a) => ({
        id: a.id,
        label: a.label,
        shape: a.shape,
        center: formatGridPosition(a.center),
        caster: a.casterName,
      }));
    }

    return toResponse(
      `[COMBAT TACTICAL] Round ${combat!.round} | ${activeName}'s turn | ${turnOrder.length} combatants`,
      data,
    );
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
  applyDamage(
    targetName: string,
    amount: number,
    damageType?: string,
    isCriticalHit?: boolean,
  ): ToolResponse {
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
        let tempAbsorbed = 0;
        if ((combatant.tempHP ?? 0) > 0) {
          tempAbsorbed = Math.min(combatant.tempHP!, remaining);
          combatant.tempHP! -= tempAbsorbed;
          remaining -= tempAbsorbed;
        }
        combatant.currentHP = Math.max(0, (combatant.currentHP ?? 0) - remaining);

        this.broadcast({
          type: "server:combat_update",
          combat,
          map: this.gameState.encounter?.map ?? null,
          timestamp: Date.now(),
        });

        let text = `${combatant.name} takes ${dmg} ${damageType ?? ""} damage → ${combatant.currentHP}/${combatant.maxHP} HP`;
        const data: Record<string, unknown> = {
          target: combatant.name,
          damageDealt: dmg,
          tempHpAbsorbed: tempAbsorbed,
          currentHP: combatant.currentHP,
          maxHP: combatant.maxHP,
          damageType,
        };
        if (combatant.concentratingOn) {
          const concDC = Math.max(10, Math.floor(dmg / 2));
          text += `\n⚠ ${combatant.name} is concentrating on ${combatant.concentratingOn.spellName} — Constitution save DC ${concDC} required to maintain`;
          data.concentrating = combatant.concentratingOn.spellName;
          data.concentrationDC = concDC;
        }
        if (damageType) {
          text += `\nNOTE: Verify whether ${combatant.name} has resistance, immunity, or vulnerability to ${damageType} damage — if so, adjust the amount before calling this tool.`;
        }
        const combatantCover = this.getCoverInfo(combatant.name);
        if (combatantCover) {
          text += `\n(Note: ${combatantCover.toLowerCase()})`;
        }
        this.markDirty();
        return toResponse(text, data);
      }
    }

    // Check player characters
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        this.createEvent("damage", `${char.static.name} takes ${dmg} damage`, [
          { type: "damage", target: targetName, amount: dmg, damageType },
        ]);

        // Fix 1 (RULES-CRIT-3): Damage at 0 HP auto-fails death saves
        // PHB 2024 p.220: "If you take any damage while you have 0 HP, you suffer a Death
        // Saving Throw failure. If the damage is from a Critical Hit, you suffer two failures."
        if (char.dynamic.currentHP === 0) {
          const failuresAdded = isCriticalHit ? 2 : 1;
          char.dynamic.deathSaves.failures = Math.min(
            3,
            char.dynamic.deathSaves.failures + failuresAdded,
          );
          let deathText = `${char.static.name} takes damage while at 0 HP — ${failuresAdded} death save failure${failuresAdded > 1 ? "s" : ""} (${char.dynamic.deathSaves.successes}S/${char.dynamic.deathSaves.failures}F)`;
          const deathData: Record<string, unknown> = {
            target: char.static.name,
            damageDealt: dmg,
            damageType,
            deathSaves: { ...char.dynamic.deathSaves },
            failuresAdded,
          };
          if (char.dynamic.deathSaves.failures >= 3) {
            if (!char.dynamic.conditions.some((c) => c.name === "Dead")) {
              char.dynamic.conditions.push({ name: "Dead" });
            }
            deathText += ` — ${char.static.name} has DIED!`;
            deathData.status = "dead";
          } else {
            deathData.status = "saving";
          }
          this.syncPlayerCombatantHP(char.static.name);
          this.broadcast({ type: "server:character_updated", playerName: pName, character: char });
          this.markCharacterDirty(pName);
          return toResponse(deathText, deathData);
        }

        let remaining = dmg;
        let tempAbsorbed = 0;
        if (char.dynamic.tempHP > 0) {
          tempAbsorbed = Math.min(char.dynamic.tempHP, remaining);
          char.dynamic.tempHP -= tempAbsorbed;
          remaining -= tempAbsorbed;
        }

        // Fix 2 (RULES-CRIT-4): Massive damage / instant death
        // PHB 2024 p.219: "If damage reduces you to 0 HP and there is damage remaining, you
        // die if the remaining damage equals or exceeds your Hit Point Maximum."
        const overshoot = remaining - char.dynamic.currentHP;
        if (overshoot > 0 && overshoot >= char.static.maxHP) {
          char.dynamic.currentHP = 0;
          if (!char.dynamic.conditions.some((c) => c.name === "Dead")) {
            char.dynamic.conditions.push({ name: "Dead" });
          }
          this.syncPlayerCombatantHP(char.static.name);
          this.broadcast({ type: "server:character_updated", playerName: pName, character: char });
          this.markCharacterDirty(pName);
          return toResponse(
            `${char.static.name} takes ${dmg} ${damageType ?? ""} damage — MASSIVE DAMAGE, instant death! (overshoot ${overshoot} >= max HP ${char.static.maxHP})`,
            {
              target: char.static.name,
              damageDealt: dmg,
              tempHpAbsorbed: tempAbsorbed,
              currentHP: 0,
              maxHP: char.static.maxHP,
              damageType,
              status: "dead",
              massiveDamage: true,
            },
          );
        }

        char.dynamic.currentHP = Math.max(0, char.dynamic.currentHP - remaining);
        this.syncPlayerCombatantHP(char.static.name);

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        let text = `${char.static.name} takes ${dmg} ${damageType ?? ""} damage → ${char.dynamic.currentHP}/${char.static.maxHP} HP`;
        const data: Record<string, unknown> = {
          target: char.static.name,
          damageDealt: dmg,
          tempHpAbsorbed: tempAbsorbed,
          currentHP: char.dynamic.currentHP,
          maxHP: char.static.maxHP,
          damageType,
        };
        if (char.dynamic.concentratingOn) {
          const concDC = Math.max(10, Math.floor(dmg / 2));
          text += `\n⚠ ${char.static.name} is concentrating on ${char.dynamic.concentratingOn.spellName} — Constitution save DC ${concDC} required to maintain`;
          data.concentrating = char.dynamic.concentratingOn.spellName;
          data.concentrationDC = concDC;
        }
        if (damageType) {
          text += `\nNOTE: Verify whether ${char.static.name} has resistance, immunity, or vulnerability to ${damageType} damage — if so, adjust the amount before calling this tool.`;
        }
        const charCover = this.getCoverInfo(char.static.name);
        if (charCover) {
          text += `\n(Note: ${charCover.toLowerCase()})`;
        }
        this.markCharacterDirty(pName);
        return toResponse(text, data);
      }
    }

    return toResponse(`Target "${targetName}" not found`, { target: targetName }, true, [
      `Available targets: ${this.listTargetNames().join(", ")}`,
    ]);
  }

  /** Heal a character or combatant */
  heal(targetName: string, amount: number): ToolResponse {
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
        const prevHP = combatant.currentHP ?? 0;
        combatant.currentHP = Math.min(combatant.maxHP, prevHP + healing);
        const overheal = Math.max(0, prevHP + healing - combatant.maxHP);
        this.broadcast({
          type: "server:combat_update",
          combat,
          map: this.gameState.encounter?.map ?? null,
          timestamp: Date.now(),
        });
        this.markDirty();
        return toResponse(
          `${combatant.name} healed ${healing} → ${combatant.currentHP}/${combatant.maxHP} HP`,
          {
            target: combatant.name,
            healed: healing,
            currentHP: combatant.currentHP,
            maxHP: combatant.maxHP,
            overheal,
          },
        );
      }
    }

    // Check player characters
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        this.createEvent("healing", `${char.static.name} healed for ${healing}`, [
          { type: "healing", target: targetName, amount: healing },
        ]);
        const prevHP = char.dynamic.currentHP;
        char.dynamic.currentHP = Math.min(char.static.maxHP, char.dynamic.currentHP + healing);
        const overheal = Math.max(0, prevHP + healing - char.static.maxHP);
        // Reset death saves when healed from 0 HP
        if (
          char.dynamic.currentHP > 0 &&
          (char.dynamic.deathSaves.successes > 0 || char.dynamic.deathSaves.failures > 0)
        ) {
          char.dynamic.deathSaves = { successes: 0, failures: 0 };
        }
        this.syncPlayerCombatantHP(char.static.name);
        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });
        this.markCharacterDirty(pName);
        return toResponse(
          `${char.static.name} healed ${healing} → ${char.dynamic.currentHP}/${char.static.maxHP} HP`,
          {
            target: char.static.name,
            healed: healing,
            currentHP: char.dynamic.currentHP,
            maxHP: char.static.maxHP,
            overheal,
          },
        );
      }
    }

    return toResponse(`Target "${targetName}" not found`, { target: targetName }, true, [
      `Available targets: ${this.listTargetNames().join(", ")}`,
    ]);
  }

  /** Set HP to exact value */
  setHP(targetName: string, value: number): ToolResponse {
    // NPC combatants
    const combat = this.gameState.encounter?.combat;
    if (combat) {
      const combatant = Object.values(combat.combatants).find(
        (c) => c.name.toLowerCase() === targetName.toLowerCase() && c.type !== "player",
      );
      if (combatant && combatant.maxHP) {
        const prevHP = combatant.currentHP ?? 0;
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
        this.markDirty();
        return toResponse(`${combatant.name} HP set to ${combatant.currentHP}/${combatant.maxHP}`, {
          target: combatant.name,
          previousHP: prevHP,
          newHP: combatant.currentHP,
          maxHP: combatant.maxHP,
        });
      }
    }

    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        const prevHP = char.dynamic.currentHP;
        this.createEvent("hp_set", `${char.static.name} HP set to ${value}`, [
          { type: "hp_set", target: targetName, value },
        ]);
        char.dynamic.currentHP = Math.max(0, Math.min(char.static.maxHP, value));
        if (
          char.dynamic.currentHP > 0 &&
          (char.dynamic.deathSaves.successes > 0 || char.dynamic.deathSaves.failures > 0)
        ) {
          char.dynamic.deathSaves = { successes: 0, failures: 0 };
        }
        this.syncPlayerCombatantHP(char.static.name);
        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });
        this.markCharacterDirty(pName);
        return toResponse(
          `${char.static.name} HP set to ${char.dynamic.currentHP}/${char.static.maxHP}`,
          {
            target: char.static.name,
            previousHP: prevHP,
            newHP: char.dynamic.currentHP,
            maxHP: char.static.maxHP,
          },
        );
      }
    }

    return toResponse(`Target "${targetName}" not found`, { target: targetName }, true, [
      `Available targets: ${this.listTargetNames().join(", ")}`,
    ]);
  }

  /** Add a condition */
  addCondition(targetName: string, condition: string, duration?: number): ToolResponse {
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
        this.markDirty();
        return toResponse(`${combatant.name} is now ${condition}`, {
          target: combatant.name,
          condition,
          duration,
          conditions: combatant.conditions.map((c) => c.name),
        });
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
        this.markCharacterDirty(pName);
        return toResponse(`${char.static.name} is now ${condition}`, {
          target: char.static.name,
          condition,
          duration,
          conditions: char.dynamic.conditions.map((c) => c.name),
        });
      }
    }

    return toResponse(`Target "${targetName}" not found`, { target: targetName }, true, [
      `Available targets: ${this.listTargetNames().join(", ")}`,
    ]);
  }

  /** Remove a condition */
  removeCondition(targetName: string, condition: string): ToolResponse {
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
        this.markDirty();
        return toResponse(`${condition} removed from ${combatant.name}`, {
          target: combatant.name,
          removed: condition,
          conditions: combatant.conditions.map((c) => c.name),
        });
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
        this.markCharacterDirty(pName);
        return toResponse(`${condition} removed from ${char.static.name}`, {
          target: char.static.name,
          removed: condition,
          conditions: char.dynamic.conditions.map((c) => c.name),
        });
      }
    }

    return toResponse(`Target "${targetName}" not found`, { target: targetName }, true, [
      `Available targets: ${this.listTargetNames().join(", ")}`,
    ]);
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
    surprisedCombatants?: string[],
  ): ToolResponse {
    // Require a battle map before starting combat
    if (!this.gameState.encounter?.map) {
      return toResponse(
        "Cannot start combat: no battle map exists. Use update_battle_map first to create a tactical grid.",
        {},
        true,
        ["Call update_battle_map to create a map, then call start_combat again."],
      );
    }

    const combatantMap: Record<string, Combatant> = {};
    const initiativeOrder: Array<{ id: string; initiative: number; dexScore: number }> = [];

    for (const c of combatants) {
      const id = crypto.randomUUID();

      // For players, auto-read initiative modifier from character sheet (Dex mod)
      let initMod = c.initiativeModifier ?? 0;
      let linkedPlayerId: string | undefined;
      let dexScore = 10; // default for tiebreaking

      if (c.type === "player") {
        const charEntry = Object.entries(this.characters).find(
          ([, ch]) => ch.static.name.toLowerCase() === c.name.toLowerCase(),
        );
        if (charEntry) {
          linkedPlayerId = charEntry[0];
          dexScore = charEntry[1].static.abilities.dexterity;
          initMod = c.initiativeModifier ?? Math.floor((dexScore - 10) / 2);
          // Apply initiative bonuses from feats (e.g. Alert)
          const initBonuses =
            charEntry[1].static.combatBonuses?.filter(
              (b) => b.type === "initiative" && !b.condition,
            ) ?? [];
          for (const b of initBonuses) {
            initMod += b.value;
          }
        }
      }

      const initiative = rollInitiative(initMod);

      const isSurprised =
        surprisedCombatants !== undefined &&
        surprisedCombatants.some((n) => n.toLowerCase() === c.name.toLowerCase());

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
        ...(isSurprised ? { surprised: true } : {}),
        maxHP: c.maxHP,
        currentHP: c.currentHP ?? c.maxHP,
        tempHP: 0,
        armorClass: c.armorClass,
        conditions: [],
        playerId: linkedPlayerId,
      };

      initiativeOrder.push({ id, initiative, dexScore });
    }

    // Sort by initiative (highest first); tiebreak by Dex score (higher Dex goes first)
    initiativeOrder.sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return b.dexScore - a.dexScore;
    });

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

    const turnOrder = initiativeOrder.map((i) => ({
      name: combatantMap[i.id].name,
      initiative: i.initiative,
      type: combatantMap[i.id].type,
      surprised: combatantMap[i.id].surprised ?? false,
    }));
    const initSummary = turnOrder
      .map((t) => `${t.name}: ${t.initiative}${t.surprised ? " (surprised)" : ""}`)
      .join(", ");

    const surprisedNames = turnOrder.filter((t) => t.surprised).map((t) => t.name);
    const surpriseNote =
      surprisedNames.length > 0
        ? ` Surprised (cannot act on first turn): ${surprisedNames.join(", ")}.`
        : "";

    this.markDirty();
    return toResponse(
      `Combat started! Initiative order: ${initSummary}. Round 1, ${turnOrder[0].name}'s turn.${surpriseNote}`,
      {
        round: 1,
        currentTurn: turnOrder[0].name,
        turnOrder,
        combatantCount: combatants.length,
        surprisedCombatants: surprisedNames,
      },
    );
  }

  /** End combat */
  endCombat(): ToolResponse {
    if (!this.gameState.encounter?.combat) {
      return toResponse("No active combat to end", {}, true, ["Use start_combat to begin combat"]);
    }

    const totalRounds = this.gameState.encounter.combat.round;
    const survivors = Object.values(this.gameState.encounter.combat.combatants)
      .filter((c) => (c.currentHP ?? 0) > 0)
      .map((c) => c.name);

    this.createEvent("combat_end", "Combat ended", [{ type: "combat_phase", phase: "ended" }]);

    this.gameState.encounter.combat.phase = "ended";
    this.gameState.encounter.phase = "exploration";
    this.gameState.encounter.combat = undefined;
    this.gameState.encounter.map = undefined;

    this.broadcast({
      type: "server:combat_update",
      combat: null,
      map: null,
      timestamp: Date.now(),
    });

    this.markDirty();
    return toResponse("Combat ended.", { ended: true, totalRounds, survivors });
  }

  /** Advance to next turn */
  advanceTurnMCP(): ToolResponse {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      return toResponse("No active combat", {}, true, ["Use start_combat to begin combat"]);
    }

    // Guard: AI cannot end a player's turn — players click End Turn themselves
    const activeId = combat.turnOrder[combat.turnIndex];
    const activeCombatant = combat.combatants[activeId];
    if (activeCombatant?.type === "player") {
      return toResponse(
        `Cannot advance turn: it is ${activeCombatant.name}'s turn (a player character). Players end their own turns via the End Turn button.`,
        { currentTurn: activeCombatant.name, isPlayerTurn: true },
        true,
      );
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
    const nextIdx = (combat.turnIndex + 1) % combat.turnOrder.length;
    const nextUp = combat.combatants[combat.turnOrder[nextIdx]];
    this.markDirty();
    return toResponse(`Advanced to ${active?.name ?? "unknown"}'s turn (Round ${combat.round})`, {
      currentTurn: active?.name,
      round: combat.round,
      nextUp: nextUp?.name,
    });
  }

  /** Override a combatant's initiative and re-sort the turn order */
  setInitiative(name: string, initiative: number): ToolResponse {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      return toResponse("No active combat", {}, true, ["Use start_combat to begin combat"]);
    }

    const combatant = Object.values(combat.combatants).find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (!combatant) {
      const available = Object.values(combat.combatants)
        .map((c) => c.name)
        .join(", ");
      return toResponse(`Combatant "${name}" not found`, { name }, true, [
        `Available combatants: ${available}`,
      ]);
    }

    // Preserve the current active combatant's ID before reordering
    const currentActiveId = combat.turnOrder[combat.turnIndex];

    combatant.initiative = initiative;

    // Re-sort turn order: descending initiative, tiebreak by initiativeModifier
    combat.turnOrder.sort((aId, bId) => {
      const a = combat.combatants[aId];
      const b = combat.combatants[bId];
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return b.initiativeModifier - a.initiativeModifier;
    });

    // Restore turnIndex to track the same combatant that was active before
    const newIndex = combat.turnOrder.indexOf(currentActiveId);
    if (newIndex !== -1) {
      combat.turnIndex = newIndex;
    }

    this.createEvent("custom", `Initiative for ${combatant.name} set to ${initiative}`, []);

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    const turnOrder = combat.turnOrder.map((id) => ({
      name: combat.combatants[id].name,
      initiative: combat.combatants[id].initiative,
    }));

    this.markDirty();
    return toResponse(
      `Initiative for ${combatant.name} set to ${initiative}. Turn order updated.`,
      { name: combatant.name, initiative, turnOrder },
    );
  }

  /** Jump to a specific combatant's turn (DM override — does not trigger condition expiration) */
  setActiveTurn(name: string): ToolResponse {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      return toResponse("No active combat", {}, true, ["Use start_combat to begin combat"]);
    }

    const combatant = Object.values(combat.combatants).find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (!combatant) {
      const available = Object.values(combat.combatants)
        .map((c) => c.name)
        .join(", ");
      return toResponse(`Combatant "${name}" not found`, { name }, true, [
        `Available combatants: ${available}`,
      ]);
    }

    const targetIndex = combat.turnOrder.indexOf(combatant.id);
    if (targetIndex === -1) {
      return toResponse(
        `Combatant "${combatant.name}" is not in the turn order`,
        { name: combatant.name },
        true,
      );
    }

    combat.turnIndex = targetIndex;

    this.createEvent("custom", `Turn set to ${combatant.name}`, []);

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    const nextIdx = (combat.turnIndex + 1) % combat.turnOrder.length;
    const nextUp = combat.combatants[combat.turnOrder[nextIdx]];

    this.markDirty();
    return toResponse(`Turn set to ${combatant.name} (Round ${combat.round})`, {
      currentTurn: combatant.name,
      round: combat.round,
      nextUp: nextUp?.name,
    });
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
  }): ToolResponse {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      return toResponse("No active combat", {}, true, ["Use start_combat to begin combat"]);
    }

    const id = crypto.randomUUID();

    // For players, auto-read initiative modifier from character sheet (Dex mod)
    // Also apply initiative combat bonuses (e.g. Alert feat) — mirrors startCombat logic
    let initMod = c.initiativeModifier ?? 0;
    if (c.type === "player") {
      const charEntry = Object.entries(this.characters).find(
        ([, ch]) => ch.static.name.toLowerCase() === c.name.toLowerCase(),
      );
      if (charEntry) {
        const dex = charEntry[1].static.abilities.dexterity;
        initMod = c.initiativeModifier ?? Math.floor((dex - 10) / 2);
        // Apply initiative bonuses from feats (e.g. Alert)
        const initBonuses =
          charEntry[1].static.combatBonuses?.filter(
            (b) => b.type === "initiative" && !b.condition,
          ) ?? [];
        for (const b of initBonuses) {
          initMod += b.value;
        }
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

    const overlapWarning = c.position
      ? this.checkTokenOverlap(c.position, c.size ?? "medium", id)
      : null;

    const text = `${c.name} joined combat (initiative ${initiative})`;
    this.markDirty();
    return toResponse(overlapWarning ? `${text}. ${overlapWarning}` : text, {
      name: c.name,
      initiative,
      position: c.position ? formatGridPosition(c.position) : null,
    });
  }

  /** Remove combatant */
  removeCombatant(combatantName: string): ToolResponse {
    const combat = this.gameState.encounter?.combat;
    if (!combat) return toResponse("No active combat", {}, true);

    const entry = Object.entries(combat.combatants).find(
      ([, c]) => c.name.toLowerCase() === combatantName.toLowerCase(),
    );
    if (!entry) {
      const names = Object.values(combat.combatants).map((c) => c.name);
      return toResponse(`Combatant "${combatantName}" not found`, { target: combatantName }, true, [
        `Active combatants: ${names.join(", ")}`,
      ]);
    }

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

    this.markDirty();
    return toResponse(`${combatantName} removed from combat`, {
      name: combatantName,
      removed: true,
    });
  }

  /** Check if a position overlaps with any existing combatant's footprint */
  private checkTokenOverlap(
    position: GridPosition,
    size: CreatureSize,
    excludeId?: string,
  ): string | null {
    const combat = this.gameState.encounter?.combat;
    if (!combat) return null;

    const span = (s: CreatureSize) =>
      s === "large" ? 2 : s === "huge" ? 3 : s === "gargantuan" ? 4 : 1;

    const getCells = (pos: GridPosition, s: CreatureSize): string[] => {
      const cells: string[] = [];
      const n = span(s);
      for (let dx = 0; dx < n; dx++)
        for (let dy = 0; dy < n; dy++) cells.push(`${pos.x + dx},${pos.y + dy}`);
      return cells;
    };

    const myCells = new Set(getCells(position, size));
    const overlapping: string[] = [];

    for (const c of Object.values(combat.combatants)) {
      if (c.id === excludeId || !c.position) continue;
      for (const cell of getCells(c.position, c.size)) {
        if (myCells.has(cell)) {
          overlapping.push(c.name);
          break;
        }
      }
    }

    return overlapping.length > 0
      ? `Note: ${overlapping.join(", ")} already at this position`
      : null;
  }

  /** Move a combatant on the battle map */
  moveCombatant(combatantName: string, to: GridPosition): ToolResponse {
    const combat = this.gameState.encounter?.combat;
    if (!combat) return toResponse("No active combat", {}, true);

    const combatant = Object.values(combat.combatants).find(
      (c) => c.name.toLowerCase() === combatantName.toLowerCase(),
    );
    if (!combatant) {
      const names = Object.values(combat.combatants).map((c) => c.name);
      return toResponse(`Combatant "${combatantName}" not found`, { target: combatantName }, true, [
        `Active combatants: ${names.join(", ")}`,
      ]);
    }

    const from = combatant.position ? formatGridPosition(combatant.position) : null;
    const overlapWarning = this.checkTokenOverlap(to, combatant.size, combatant.id);
    combatant.position = to;

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    const text = `${combatant.name} moved to ${formatGridPosition(to)}`;
    this.markDirty();
    return toResponse(overlapWarning ? `${text}. ${overlapWarning}` : text, {
      name: combatant.name,
      from,
      to: formatGridPosition(to),
    });
  }

  /** Use a spell slot */
  useSpellSlot(characterName: string, level: number): ToolResponse {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        const slot = char.dynamic.spellSlotsUsed.find((s) => s.level === level);
        if (slot) {
          if (slot.used >= slot.total) {
            // Fix 4 (RULES-HIGH-3): Fall back to pact magic slots before reporting exhaustion
            const pactSlot = (char.dynamic.pactMagicSlots ?? []).find((s) => s.level === level);
            if (pactSlot && pactSlot.used < pactSlot.total) {
              this.createEvent(
                "spell_slot_used",
                `${char.static.name} used level ${level} pact magic slot`,
                [{ type: "spell_slot_use", target: characterName, level }],
              );
              pactSlot.used++;
              this.broadcast({
                type: "server:character_updated",
                playerName: pName,
                character: char,
              });
              const pactRemaining = pactSlot.total - pactSlot.used;
              this.markCharacterDirty(pName);
              return toResponse(
                `${char.static.name} used a level ${level} pact magic slot (Warlock — recovers on short rest)`,
                {
                  character: char.static.name,
                  level,
                  remaining: pactRemaining,
                  total: pactSlot.total,
                  slotType: "pactMagic",
                },
              );
            }
            const otherSlots = char.dynamic.spellSlotsUsed
              .filter((s) => s.used < s.total)
              .map((s) => `Level ${s.level}: ${s.total - s.used}/${s.total}`)
              .join(", ");
            const otherPactSlots = (char.dynamic.pactMagicSlots ?? [])
              .filter((s) => s.used < s.total)
              .map((s) => `Pact Level ${s.level}: ${s.total - s.used}/${s.total}`)
              .join(", ");
            const available = [otherSlots, otherPactSlots].filter(Boolean).join(", ");
            return toResponse(
              `${char.static.name} has no level ${level} spell slots remaining (${slot.used}/${slot.total} used)`,
              { character: char.static.name, level, remaining: 0, total: slot.total },
              true,
              [
                available ? `Available slots: ${available}` : "No spell slots available",
                "Regular slots recover on long rest; pact magic slots recover on short rest",
              ],
            );
          }
          this.createEvent("spell_slot_used", `${char.static.name} used level ${level} slot`, [
            { type: "spell_slot_use", target: characterName, level },
          ]);
          slot.used++;
        } else {
          // No regular slot at this level — try pact magic (Fix 4)
          const pactSlot = (char.dynamic.pactMagicSlots ?? []).find((s) => s.level === level);
          if (pactSlot) {
            if (pactSlot.used >= pactSlot.total) {
              return toResponse(
                `${char.static.name} has no level ${level} pact magic slots remaining (${pactSlot.used}/${pactSlot.total} used)`,
                { character: char.static.name, level, remaining: 0, total: pactSlot.total },
                true,
                [
                  `Pact magic slots recover on short rest`,
                  `Available pact levels: ${(char.dynamic.pactMagicSlots ?? []).map((s) => s.level).join(", ") || "none"}`,
                ],
              );
            }
            this.createEvent(
              "spell_slot_used",
              `${char.static.name} used level ${level} pact magic slot`,
              [{ type: "spell_slot_use", target: characterName, level }],
            );
            pactSlot.used++;
            this.broadcast({
              type: "server:character_updated",
              playerName: pName,
              character: char,
            });
            const pactRemaining = pactSlot.total - pactSlot.used;
            this.markCharacterDirty(pName);
            return toResponse(
              `${char.static.name} used a level ${level} pact magic slot (Warlock — recovers on short rest)`,
              {
                character: char.static.name,
                level,
                remaining: pactRemaining,
                total: pactSlot.total,
                slotType: "pactMagic",
              },
            );
          }
          return toResponse(
            `${char.static.name} has no spell slots at level ${level}`,
            { character: char.static.name, level },
            true,
            [
              `Available regular levels: ${char.dynamic.spellSlotsUsed.map((s) => s.level).join(", ") || "none"}`,
              `Available pact levels: ${(char.dynamic.pactMagicSlots ?? []).map((s) => s.level).join(", ") || "none"}`,
            ],
          );
        }

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        const remaining = slot.total - slot.used;
        this.markCharacterDirty(pName);
        return toResponse(`${char.static.name} used a level ${level} spell slot`, {
          character: char.static.name,
          level,
          remaining,
          total: slot.total,
        });
      }
    }
    return toResponse(
      `Character "${characterName}" not found`,
      { character: characterName },
      true,
      [`Available characters: ${this.listCharacterNames().join(", ")}`],
    );
  }

  /** Restore a spell slot */
  restoreSpellSlot(characterName: string, level: number): ToolResponse {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        // Check regular spell slots first
        const slot = char.dynamic.spellSlotsUsed.find((s) => s.level === level);
        if (slot) {
          if (slot.used <= 0) {
            return toResponse(
              `${char.static.name}'s level ${level} spell slots are already at maximum`,
              { character: char.static.name, level, remaining: slot.total, total: slot.total },
            );
          }
          this.createEvent(
            "spell_slot_restored",
            `${char.static.name} restored level ${level} slot`,
            [{ type: "spell_slot_restore", target: characterName, level }],
          );
          slot.used--;
          this.broadcast({
            type: "server:character_updated",
            playerName: pName,
            character: char,
          });
          this.markCharacterDirty(pName);
          return toResponse(`${char.static.name} restored a level ${level} spell slot`, {
            character: char.static.name,
            level,
            remaining: slot.total - slot.used,
            total: slot.total,
          });
        }

        // Check pact magic slots
        const pactSlot = (char.dynamic.pactMagicSlots ?? []).find((s) => s.level === level);
        if (pactSlot) {
          if (pactSlot.used <= 0) {
            return toResponse(
              `${char.static.name}'s level ${level} pact magic slots are already at maximum`,
              {
                character: char.static.name,
                level,
                remaining: pactSlot.total,
                total: pactSlot.total,
              },
            );
          }
          this.createEvent(
            "spell_slot_restored",
            `${char.static.name} restored level ${level} pact magic slot`,
            [{ type: "spell_slot_restore", target: characterName, level }],
          );
          pactSlot.used--;
          this.broadcast({
            type: "server:character_updated",
            playerName: pName,
            character: char,
          });
          this.markCharacterDirty(pName);
          return toResponse(`${char.static.name} restored a level ${level} pact magic slot`, {
            character: char.static.name,
            level,
            remaining: pactSlot.total - pactSlot.used,
            total: pactSlot.total,
            pactMagic: true,
          });
        }

        // No slot at this level in either pool
        return toResponse(
          `${char.static.name} has no spell slots or pact magic slots at level ${level}`,
          { character: char.static.name, level },
          true,
          [
            `Available spell slot levels: ${char.dynamic.spellSlotsUsed.map((s) => s.level).join(", ") || "none"}`,
            `Available pact magic levels: ${(char.dynamic.pactMagicSlots ?? []).map((s) => s.level).join(", ") || "none"}`,
          ],
        );
      }
    }
    return toResponse(
      `Character "${characterName}" not found`,
      { character: characterName },
      true,
      [`Available characters: ${this.listCharacterNames().join(", ")}`],
    );
  }

  /** Use a class resource (Bardic Inspiration, Channel Divinity, Rage, etc.) */
  useClassResource(characterName: string, resourceName: string): ToolResponse {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        const resource = (char.static.classResources ?? []).find(
          (r) => r.name.toLowerCase() === resourceName.toLowerCase(),
        );
        if (!resource) {
          return toResponse(
            `Resource "${resourceName}" not found on ${char.static.name}`,
            { character: char.static.name, resource: resourceName },
            true,
            [
              `Available resources: ${(char.static.classResources ?? []).map((r) => r.name).join(", ") || "none"}`,
            ],
          );
        }

        const canonicalName = resource.name;
        char.dynamic.resourcesUsed = char.dynamic.resourcesUsed ?? {};
        const used = char.dynamic.resourcesUsed[canonicalName] ?? 0;
        if (used >= resource.maxUses) {
          return toResponse(
            `${char.static.name} has no ${canonicalName} uses remaining (0/${resource.maxUses})`,
            {
              character: char.static.name,
              resource: canonicalName,
              remaining: 0,
              maxUses: resource.maxUses,
            },
            true,
            [`Resets on ${resource.resetType} rest`],
          );
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

        this.markCharacterDirty(pName);
        return toResponse(
          `${char.static.name} used ${canonicalName} (${remaining}/${resource.maxUses} remaining)`,
          {
            character: char.static.name,
            resource: canonicalName,
            remaining,
            maxUses: resource.maxUses,
          },
        );
      }
    }
    return toResponse(
      `Character "${characterName}" not found`,
      { character: characterName },
      true,
      [`Available characters: ${this.listCharacterNames().join(", ")}`],
    );
  }

  /** Restore a class resource. amount defaults to 1; use 999+ to fully restore. */
  restoreClassResource(characterName: string, resourceName: string, amount = 1): ToolResponse {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        const resource = (char.static.classResources ?? []).find(
          (r) => r.name.toLowerCase() === resourceName.toLowerCase(),
        );
        if (!resource) {
          return toResponse(
            `Resource "${resourceName}" not found on ${char.static.name}`,
            { character: char.static.name, resource: resourceName },
            true,
            [
              `Available resources: ${(char.static.classResources ?? []).map((r) => r.name).join(", ") || "none"}`,
            ],
          );
        }

        const canonicalName = resource.name;
        char.dynamic.resourcesUsed = char.dynamic.resourcesUsed ?? {};
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

        this.markCharacterDirty(pName);
        return toResponse(
          `${char.static.name} restored ${canonicalName} (${remaining}/${resource.maxUses} remaining)`,
          {
            character: char.static.name,
            resource: canonicalName,
            remaining,
            maxUses: resource.maxUses,
          },
        );
      }
    }
    return toResponse(
      `Character "${characterName}" not found`,
      { character: characterName },
      true,
      [`Available characters: ${this.listCharacterNames().join(", ")}`],
    );
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
  ): ToolResponse {
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
        this.markCharacterDirty(characterName);
        return toResponse(
          `Added ${item.name}${qty > 1 ? ` (x${qty})` : ""} to ${char.static.name}'s inventory`,
          {
            character: char.static.name,
            item: item.name,
            quantity: qty,
          },
        );
      }
    }
    return toResponse(
      `Character "${characterName}" not found`,
      { character: characterName },
      true,
      [`Available characters: ${this.listCharacterNames().join(", ")}`],
    );
  }

  /** Remove item from a character's inventory */
  removeItem(characterName: string, itemName: string, quantity?: number): ToolResponse {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        const idx = char.dynamic.inventory.findIndex(
          (i) => i.name.toLowerCase() === itemName.toLowerCase(),
        );
        if (idx === -1) {
          return toResponse(
            `Item "${itemName}" not found in ${char.static.name}'s inventory`,
            {
              character: char.static.name,
              item: itemName,
            },
            true,
            [`Inventory: ${char.dynamic.inventory.map((i) => i.name).join(", ") || "empty"}`],
          );
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

        this.markCharacterDirty(characterName);
        return toResponse(
          `Removed ${removeQty}x ${itemName} from ${char.static.name}'s inventory`,
          {
            character: char.static.name,
            item: itemName,
            removed: removeQty,
          },
        );
      }
    }
    return toResponse(
      `Character "${characterName}" not found`,
      { character: characterName },
      true,
      [`Available characters: ${this.listCharacterNames().join(", ")}`],
    );
  }

  /** Update properties of an existing inventory item */
  updateItem(
    characterName: string,
    itemName: string,
    updates: Partial<Omit<import("@unseen-servant/shared/types").InventoryItem, "name">>,
  ): ToolResponse {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        const item = char.dynamic.inventory.find(
          (i) => i.name.toLowerCase() === itemName.toLowerCase(),
        );
        if (!item) {
          return toResponse(
            `Item "${itemName}" not found in ${char.static.name}'s inventory`,
            { character: char.static.name, item: itemName },
            true,
            [`Available items: ${char.dynamic.inventory.map((i) => i.name).join(", ") || "none"}`],
          );
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
        this.markCharacterDirty(characterName);
        return toResponse(`Updated ${item.name} for ${char.static.name}: ${summary}`, {
          character: char.static.name,
          item: item.name,
          changes: updates,
        });
      }
    }
    return toResponse(
      `Character "${characterName}" not found`,
      { character: characterName },
      true,
      [`Available characters: ${this.listTargetNames().join(", ")}`],
    );
  }

  /** Update currency for a character (additive — positive adds, negative subtracts) */
  updateCurrency(
    characterName: string,
    changes: Partial<Record<"cp" | "sp" | "gp" | "pp", number>>,
    autoConvert = true,
  ): ToolResponse {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        this.createEvent("custom", `${char.static.name} currency updated`, []);
        const conversions: string[] = [];

        for (const [coin, delta] of Object.entries(changes) as Array<
          ["cp" | "sp" | "gp" | "pp", number]
        >) {
          const newVal = char.dynamic.currency[coin] + delta;
          if (newVal >= 0) {
            char.dynamic.currency[coin] = newVal;
          } else if (autoConvert) {
            // Try to borrow from higher denominations
            const borrowed = this.borrowCurrency(char.dynamic.currency, coin, -newVal);
            if (borrowed) {
              char.dynamic.currency[coin] = 0;
              conversions.push(...borrowed);
            } else {
              // Not enough total currency — floor at 0
              char.dynamic.currency[coin] = 0;
              conversions.push(`Insufficient funds: could not cover ${-newVal}${coin} shortfall`);
            }
          } else {
            char.dynamic.currency[coin] = 0;
          }
        }

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        const { cp, sp, gp, pp } = char.dynamic.currency;
        const conversionNote = conversions.length > 0 ? ` (${conversions.join("; ")})` : "";
        return toResponse(
          `${char.static.name}'s currency updated${conversionNote} → ${gp}gp, ${sp}sp, ${cp}cp, ${pp}pp`,
          {
            character: char.static.name,
            cp,
            sp,
            gp,
            pp,
            conversions: conversions.length > 0 ? conversions : undefined,
          },
        );
      }
    }
    return toResponse(
      `Character "${characterName}" not found`,
      { character: characterName },
      true,
      [`Available characters: ${this.listTargetNames().join(", ")}`],
    );
  }

  /**
   * Borrow from higher denominations to cover a shortfall.
   * D&D exchange rates: 1pp=10gp, 1gp=10sp, 1sp=10cp.
   * Returns conversion descriptions, or null if insufficient total funds.
   */
  private borrowCurrency(
    currency: Record<"cp" | "sp" | "gp" | "pp", number>,
    targetCoin: "cp" | "sp" | "gp" | "pp",
    shortfall: number,
  ): string[] | null {
    // Define conversion chains: for each coin, which higher coins can be broken down
    // and how many of the target coin each produces
    const conversionChains: Record<
      string,
      Array<{ from: "cp" | "sp" | "gp" | "pp"; rate: number }>
    > = {
      cp: [
        { from: "sp", rate: 10 }, // 1sp = 10cp
        { from: "gp", rate: 100 }, // 1gp = 100cp
        { from: "pp", rate: 1000 }, // 1pp = 1000cp
      ],
      sp: [
        { from: "gp", rate: 10 }, // 1gp = 10sp
        { from: "pp", rate: 100 }, // 1pp = 100sp
      ],
      gp: [
        { from: "pp", rate: 10 }, // 1pp = 10gp
      ],
      pp: [], // nothing higher
    };

    const chain = conversionChains[targetCoin];
    if (!chain) return null;

    let remaining = shortfall;
    const conversions: string[] = [];

    for (const { from, rate } of chain) {
      if (remaining <= 0) break;
      if (currency[from] <= 0) continue;

      // How many of the higher coin do we need to break?
      const coinsNeeded = Math.ceil(remaining / rate);
      const coinsUsed = Math.min(coinsNeeded, currency[from]);
      const produced = coinsUsed * rate;

      currency[from] -= coinsUsed;
      remaining -= produced;
      // Any excess goes back to the target coin
      if (remaining < 0) {
        currency[targetCoin] += -remaining; // add the change back
        remaining = 0;
      }
      conversions.push(`converted ${coinsUsed}${from} → ${produced}${targetCoin}`);
    }

    return remaining <= 0 ? conversions : null;
  }

  /** Grant heroic inspiration to a character */
  grantInspiration(characterName: string): ToolResponse {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        if (char.dynamic.heroicInspiration) {
          return toResponse(`${char.static.name} already has Heroic Inspiration`, {
            character: char.static.name,
            hasInspiration: true,
          });
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

        this.markCharacterDirty(pName);
        return toResponse(`Granted Heroic Inspiration to ${char.static.name}`, {
          character: char.static.name,
          hasInspiration: true,
        });
      }
    }
    return toResponse(
      `Character "${characterName}" not found`,
      { character: characterName },
      true,
      [`Available characters: ${this.listTargetNames().join(", ")}`],
    );
  }

  /** Use (spend) heroic inspiration for a character */
  useInspiration(characterName: string): ToolResponse {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === characterName.toLowerCase()) {
        if (!char.dynamic.heroicInspiration) {
          return toResponse(
            `${char.static.name} does not have Heroic Inspiration to spend`,
            { character: char.static.name, hasInspiration: false },
            true,
            ["Grant inspiration first with grant_inspiration before trying to use it."],
          );
        }
        this.createEvent("inspiration_used", `${char.static.name} spent Heroic Inspiration`, []);
        char.dynamic.heroicInspiration = false;

        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });

        this.markCharacterDirty(pName);
        return toResponse(`${char.static.name} spent Heroic Inspiration`, {
          character: char.static.name,
          hasInspiration: false,
        });
      }
    }
    return toResponse(
      `Character "${characterName}" not found`,
      { character: characterName },
      true,
      [`Available characters: ${this.listTargetNames().join(", ")}`],
    );
  }

  /** Short rest — restore short-rest class resources and warlock pact slots */
  shortRest(characterNames: string[]): ToolResponse {
    const results: string[] = [];
    const charactersData: Array<{
      character: string;
      restored: string[];
      hitDice?: string;
      healingPerDie?: string;
      currentHP?: number;
      maxHP?: number;
      restFeatures?: string[];
    }> = [];
    for (const name of characterNames) {
      for (const [pName, char] of Object.entries(this.characters)) {
        if (char.static.name.toLowerCase() !== name.toLowerCase()) continue;

        const restored: string[] = [];

        // Restore class resources with resetType "short"
        char.dynamic.resourcesUsed = char.dynamic.resourcesUsed ?? {};
        for (const resource of char.static.classResources ?? []) {
          if (resource.resetType === "short") {
            const used = char.dynamic.resourcesUsed[resource.name] ?? 0;
            if (used > 0) {
              char.dynamic.resourcesUsed[resource.name] = 0;
              restored.push(`${resource.name} (${resource.maxUses}/${resource.maxUses})`);
            }
          }
        }

        // Restore warlock pact magic slots
        for (const slot of char.dynamic.pactMagicSlots ?? []) {
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

        // Build per-character hit dice hint
        const hitDiceParts: string[] = [];
        for (const cls of char.static.classes) {
          const classData = getClass(cls.name);
          const faces = classData?.hd?.faces ?? 8;
          hitDiceParts.push(`${cls.level}d${faces}`);
        }
        const hitDice = hitDiceParts.join(" + ");
        const conMod = Math.floor((char.static.abilities.constitution - 10) / 2);
        const conSign = conMod >= 0 ? `+${conMod}` : `${conMod}`;
        // Use first class's die for the per-die label (multiclass players choose which to spend)
        const firstClassData = getClass(char.static.classes[0]?.name ?? "");
        const firstFaces = firstClassData?.hd?.faces ?? 8;
        const healingPerDie = `1d${firstFaces}${conSign}`;
        const { currentHP } = char.dynamic;
        const { maxHP } = char.static;
        const hpLabel =
          currentHP >= maxHP ? `${currentHP}/${maxHP} HP, full` : `${currentHP}/${maxHP} HP`;

        results.push(`  → Hit Dice: ${hitDice}, ${healingPerDie} per die (currently ${hpLabel})`);

        // Scan for rest-relevant feats (2024 PHB only)
        const restFeatures: string[] = [];
        for (const feat of char.static.features) {
          const hint = REST_FEAT_HINTS[feat.name.toLowerCase()];
          if (hint) restFeatures.push(hint);
        }
        for (const hint of restFeatures) {
          results.push(`  → ${hint}`);
        }

        charactersData.push({
          character: char.static.name,
          restored,
          hitDice,
          healingPerDie,
          currentHP,
          maxHP,
          restFeatures,
        });
        break;
      }
    }

    if (results.length === 0) {
      return toResponse("No matching characters found", { characters: [] }, true, [
        `Available characters: ${this.listTargetNames().join(", ")}`,
      ]);
    }
    for (const n of characterNames) this.markCharacterDirty(n);
    return toResponse(`Short rest complete.\n${results.join("\n")}`, {
      characters: charactersData,
    });
  }

  /** Long rest — full HP, all spell slots, all resources, clear conditions, reset death saves */
  longRest(characterNames: string[]): ToolResponse {
    const results: string[] = [];
    const charactersData: Array<{ character: string; restored: string[] }> = [];
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
        for (const slot of char.dynamic.pactMagicSlots ?? []) {
          if (slot.used > 0) {
            restored.push(`Pact Magic lv${slot.level} (${slot.total}/${slot.total})`);
            slot.used = 0;
          }
        }

        // Reset ALL class resources
        char.dynamic.resourcesUsed = char.dynamic.resourcesUsed ?? {};
        for (const resource of char.static.classResources ?? []) {
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

        // Clear only conditions that explicitly end on long rest (endsOnLongRest: true).
        // Permanent conditions (cursed, petrified, dead) are never cleared.
        // All other conditions persist — they end when their source ends, not on rest.
        const cleared = char.dynamic.conditions.filter((c) => {
          const name = c.name.toLowerCase();
          if (PERMANENT_CONDITIONS.includes(name)) return false; // never clear permanent
          return c.endsOnLongRest === true; // only clear if explicitly flagged
        });
        if (cleared.length > 0) {
          const clearedNames = new Set(cleared.map((c) => c.name));
          char.dynamic.conditions = char.dynamic.conditions.filter(
            (c) => !clearedNames.has(c.name),
          );
          restored.push(`Cleared: ${cleared.map((c) => c.name).join(", ")}`);
        }

        // Clear concentration
        if (char.dynamic.concentratingOn) {
          restored.push(`Concentration on ${char.dynamic.concentratingOn.spellName} ended`);
          char.dynamic.concentratingOn = undefined;
        }

        // Decrement exhaustion by 1 on long rest (PHB 2024 p.367)
        if (char.dynamic.exhaustionLevel && char.dynamic.exhaustionLevel > 0) {
          char.dynamic.exhaustionLevel--;
          if (char.dynamic.exhaustionLevel === 0) {
            char.dynamic.conditions = char.dynamic.conditions.filter(
              (c) => c.name.toLowerCase() !== "exhaustion",
            );
            restored.push("Exhaustion cleared");
          } else {
            restored.push(`Exhaustion reduced to level ${char.dynamic.exhaustionLevel}`);
          }
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
        charactersData.push({ character: char.static.name, restored });
        break;
      }
    }

    if (results.length === 0) {
      return toResponse("No matching characters found", { characters: [] }, true, [
        `Available characters: ${this.listTargetNames().join(", ")}`,
      ]);
    }
    for (const n of characterNames) this.markCharacterDirty(n);
    return toResponse(
      `Long rest complete.\n${results.join("\n")}\n\nReminder: Characters regain half their total Hit Dice (minimum 1) on a long rest. Track this narratively as needed.`,
      { characters: charactersData },
    );
  }

  /** Record a death saving throw */
  recordDeathSave(
    characterName: string,
    success: boolean,
    options?: { criticalFail?: boolean; criticalSuccess?: boolean },
  ): ToolResponse {
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() !== characterName.toLowerCase()) continue;

      if (char.dynamic.currentHP > 0) {
        return toResponse(
          `${char.static.name} is not at 0 HP — death saves not applicable`,
          { character: char.static.name, currentHP: char.dynamic.currentHP },
          true,
          ["Death saves only apply to characters at 0 HP."],
        );
      }

      // Fix 3 (RULES-CRIT-1+2): Nat 20 = regain 1 HP immediately; nat 1 = 2 failures
      // PHB 2024: Nat 20 on a death save → the character regains 1 HP (not just stabilize).
      // Nat 1 → 2 failures instead of 1.

      if (options?.criticalSuccess) {
        // Nat 20: regain 1 HP, reset death saves, wake up
        char.dynamic.currentHP = 1;
        char.dynamic.deathSaves = { successes: 0, failures: 0 };
        char.dynamic.conditions = char.dynamic.conditions.filter(
          (c) => c.name !== "Unconscious" && c.name !== "Stabilized",
        );
        this.syncPlayerCombatantHP(char.static.name);
        this.createEvent(
          "death_save",
          `${char.static.name} rolled a NAT 20 on a death save — REVIVED with 1 HP!`,
          [{ type: "death_save", target: characterName, success: true }],
        );
        this.broadcast({ type: "server:character_updated", playerName: pName, character: char });
        this.markCharacterDirty(pName);
        return toResponse(
          `Death save NAT 20! ${char.static.name} is REVIVED — regains 1 HP and wakes up!`,
          {
            character: char.static.name,
            success: true,
            criticalSuccess: true,
            successes: 0,
            failures: 0,
            currentHP: 1,
            status: "revived",
          },
        );
      }

      if (options?.criticalFail) {
        // Nat 1: 2 failures
        char.dynamic.deathSaves.failures = Math.min(3, char.dynamic.deathSaves.failures + 2);
      } else if (success) {
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
      let status: "alive" | "stable" | "dead" | "saving" | "revived" = "saving";
      if (char.dynamic.deathSaves.successes >= 3) {
        if (!char.dynamic.conditions.some((c) => c.name === "Stabilized")) {
          char.dynamic.conditions.push({ name: "Stabilized" });
        }
        statusMsg = ` — ${char.static.name} is STABILIZED!`;
        status = "stable";
      } else if (char.dynamic.deathSaves.failures >= 3) {
        if (!char.dynamic.conditions.some((c) => c.name === "Dead")) {
          char.dynamic.conditions.push({ name: "Dead" });
        }
        statusMsg = ` — ${char.static.name} has DIED!`;
        status = "dead";
      }

      this.broadcast({
        type: "server:character_updated",
        playerName: pName,
        character: char,
      });

      const critNote = options?.criticalFail ? " (NAT 1 — 2 failures!)" : "";
      this.markCharacterDirty(pName);
      return toResponse(
        `Death save ${success ? "SUCCESS" : "FAILURE"}${critNote}: ${char.dynamic.deathSaves.successes} successes, ${char.dynamic.deathSaves.failures} failures${statusMsg}`,
        {
          character: char.static.name,
          success,
          criticalFail: options?.criticalFail ?? false,
          successes: char.dynamic.deathSaves.successes,
          failures: char.dynamic.deathSaves.failures,
          status,
        },
      );
    }
    return toResponse(
      `Character "${characterName}" not found`,
      { character: characterName },
      true,
      [`Available characters: ${this.listTargetNames().join(", ")}`],
    );
  }

  /** Set concentration on a spell (auto-breaks previous concentration) */
  setConcentration(targetName: string, spellName: string): ToolResponse {
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
        const text = prev
          ? `${combatant.name} breaks concentration on ${prev}, now concentrating on ${spellName}`
          : `${combatant.name} is now concentrating on ${spellName}`;
        this.markDirty();
        return toResponse(text, {
          target: combatant.name,
          spell: spellName,
          previousSpell: prev ?? null,
        });
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
        const text = prev
          ? `${char.static.name} breaks concentration on ${prev}, now concentrating on ${spellName}`
          : `${char.static.name} is now concentrating on ${spellName}`;
        this.markCharacterDirty(pName);
        return toResponse(text, {
          target: char.static.name,
          spell: spellName,
          previousSpell: prev ?? null,
        });
      }
    }

    return toResponse(`Target "${targetName}" not found`, { target: targetName }, true, [
      `Available targets: ${this.listTargetNames().join(", ")}`,
    ]);
  }

  /** Break concentration (remove the concentrating spell) */
  breakConcentration(targetName: string): ToolResponse {
    // Check NPC combatants
    const combat = this.gameState.encounter?.combat;
    if (combat) {
      const combatant = Object.values(combat.combatants).find(
        (c) => c.name.toLowerCase() === targetName.toLowerCase() && c.type !== "player",
      );
      if (combatant) {
        if (!combatant.concentratingOn) {
          return toResponse(`${combatant.name} is not concentrating on anything`, {
            target: combatant.name,
            spell: null,
          });
        }
        const spell = combatant.concentratingOn.spellName;
        combatant.concentratingOn = undefined;
        this.broadcast({
          type: "server:combat_update",
          combat,
          map: this.gameState.encounter?.map ?? null,
          timestamp: Date.now(),
        });
        this.markDirty();
        return toResponse(`${combatant.name} lost concentration on ${spell}`, {
          target: combatant.name,
          spell,
        });
      }
    }

    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        if (!char.dynamic.concentratingOn) {
          return toResponse(`${char.static.name} is not concentrating on anything`, {
            target: char.static.name,
            spell: null,
          });
        }
        const spell = char.dynamic.concentratingOn.spellName;
        char.dynamic.concentratingOn = undefined;
        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });
        this.markCharacterDirty(pName);
        return toResponse(`${char.static.name} lost concentration on ${spell}`, {
          target: char.static.name,
          spell,
        });
      }
    }

    return toResponse(`Target "${targetName}" not found`, { target: targetName }, true, [
      `Available targets: ${this.listTargetNames().join(", ")}`,
    ]);
  }

  /** Set temporary HP (non-stacking — takes the higher value) */
  setTempHP(targetName: string, amount: number): ToolResponse {
    const tempHP = Math.max(0, amount);

    // NPC combatants
    const combat = this.gameState.encounter?.combat;
    if (combat) {
      const combatant = Object.values(combat.combatants).find(
        (c) => c.name.toLowerCase() === targetName.toLowerCase() && c.type !== "player",
      );
      if (combatant) {
        const prev = combatant.tempHP ?? 0;
        this.createEvent("temp_hp_set", `${combatant.name} gains ${tempHP} temp HP`, [
          { type: "temp_hp", target: targetName, amount: tempHP },
        ]);
        combatant.tempHP = Math.max(prev, tempHP);
        this.broadcast({
          type: "server:combat_update",
          combat,
          map: this.gameState.encounter?.map ?? null,
          timestamp: Date.now(),
        });
        this.markDirty();
        return toResponse(`${combatant.name} now has ${combatant.tempHP} temporary HP`, {
          target: combatant.name,
          tempHP: combatant.tempHP,
          previousTempHP: prev,
        });
      }
    }

    // Player characters
    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() === targetName.toLowerCase()) {
        const prev = char.dynamic.tempHP;
        this.createEvent("temp_hp_set", `${char.static.name} gains ${tempHP} temp HP`, [
          { type: "temp_hp", target: targetName, amount: tempHP },
        ]);
        char.dynamic.tempHP = Math.max(prev, tempHP);
        this.syncPlayerCombatantHP(char.static.name);
        this.broadcast({
          type: "server:character_updated",
          playerName: pName,
          character: char,
        });
        this.markCharacterDirty(pName);
        return toResponse(`${char.static.name} now has ${char.dynamic.tempHP} temporary HP`, {
          target: char.static.name,
          tempHP: char.dynamic.tempHP,
          previousTempHP: prev,
        });
      }
    }

    return toResponse(`Target "${targetName}" not found`, { target: targetName }, true, [
      `Available targets: ${this.listTargetNames().join(", ")}`,
    ]);
  }

  /** Set a character's exhaustion level (0 = none, 1–9 = penalties, 10 = dead).
   *  PHB 2024: each level applies -2 to all d20 rolls and spell save DC, speed -5ft × level.
   *  Long rest removes 1 level. Level 10 = instant death. */
  setExhaustion(characterName: string, level: number): ToolResponse {
    const clampedLevel = Math.max(0, Math.min(10, Math.round(level)));

    for (const [pName, char] of Object.entries(this.characters)) {
      if (char.static.name.toLowerCase() !== characterName.toLowerCase()) continue;

      const prevLevel = char.dynamic.exhaustionLevel ?? 0;
      char.dynamic.exhaustionLevel = clampedLevel === 0 ? undefined : clampedLevel;

      // Sync the "Exhaustion" condition to match the level
      if (clampedLevel > 0) {
        if (!char.dynamic.conditions.some((c) => c.name.toLowerCase() === "exhaustion")) {
          char.dynamic.conditions.push({ name: "Exhaustion" });
        }
      } else {
        char.dynamic.conditions = char.dynamic.conditions.filter(
          (c) => c.name.toLowerCase() !== "exhaustion",
        );
      }

      // Level 10 = death
      if (clampedLevel >= 10) {
        if (!char.dynamic.conditions.some((c) => c.name === "Dead")) {
          char.dynamic.conditions.push({ name: "Dead" });
        }
      }

      this.createEvent(
        "condition_added",
        `${char.static.name} exhaustion set to level ${clampedLevel}`,
        [],
      );
      this.broadcast({
        type: "server:character_updated",
        playerName: pName,
        character: char,
      });

      const penalty =
        clampedLevel > 0
          ? `-${clampedLevel * 2} to all d20 rolls and spell save DC; speed -${clampedLevel * 5}ft`
          : "none";
      this.markCharacterDirty(pName);
      return toResponse(
        `${char.static.name} exhaustion level set to ${clampedLevel}${clampedLevel >= 10 ? " — DEAD" : ""}`,
        {
          target: char.static.name,
          previousLevel: prevLevel,
          exhaustionLevel: clampedLevel,
          penalty,
        },
        false,
        clampedLevel > 0
          ? [
              `Exhaustion level ${clampedLevel}: ${penalty}. Long rest reduces by 1. Level 10 = death.`,
            ]
          : undefined,
      );
    }

    return toResponse(
      `Character "${characterName}" not found`,
      { character: characterName },
      true,
      [
        `Available characters: ${Object.values(this.characters)
          .map((c) => c.static.name)
          .join(", ")}`,
      ],
    );
  }

  /** Compact conversation history — replace older messages with a summary */
  compactHistory(keepRecent: number, summary: string): ToolResponse {
    const totalBefore = this.conversationHistory.length;
    if (totalBefore <= keepRecent) {
      return toResponse(
        `History only has ${totalBefore} messages — no compaction needed (threshold: ${keepRecent})`,
        { compacted: 0, remaining: totalBefore, totalBefore },
      );
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

    const compacted = totalBefore - keepRecent;
    return toResponse(
      `Compacted history: ${totalBefore} → ${this.conversationHistory.length} messages (1 summary + ${keepRecent} recent)`,
      { compacted, remaining: this.conversationHistory.length, totalBefore },
    );
  }

  /** Update/set the battle map */
  updateBattleMap(map: BattleMapState): ToolResponse {
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

    this.markDirty();
    return toResponse(`Battle map "${map.name ?? "unnamed"}" set (${map.width}x${map.height})`, {
      width: map.width,
      height: map.height,
      name: map.name ?? "unnamed",
    });
  }

  /** Apply multiple effects in a single call (damage, heal, conditions, movement) */
  applyBatchEffects(
    effects: Array<
      | { type: "damage"; name: string; amount: number; damage_type?: string }
      | { type: "heal"; name: string; amount: number }
      | { type: "set_hp"; name: string; value: number }
      | { type: "condition_add"; name: string; condition: string; duration?: number }
      | { type: "condition_remove"; name: string; condition: string }
      | { type: "move"; name: string; position: string }
    >,
  ): ToolResponse {
    if (effects.length > 10) {
      return toResponse("Too many effects (max 10)", { count: effects.length }, true);
    }

    const results: Array<{
      index: number;
      type: string;
      target: string;
      result: string;
      error?: boolean;
    }> = [];
    let applied = 0;
    let failed = 0;

    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i];
      let r: ToolResponse;
      switch (effect.type) {
        case "damage":
          r = this.applyDamage(effect.name, effect.amount, effect.damage_type);
          break;
        case "heal":
          r = this.heal(effect.name, effect.amount);
          break;
        case "set_hp":
          r = this.setHP(effect.name, effect.value);
          break;
        case "condition_add":
          r = this.addCondition(effect.name, effect.condition, effect.duration);
          break;
        case "condition_remove":
          r = this.removeCondition(effect.name, effect.condition);
          break;
        case "move": {
          const pos = parseGridPosition(effect.position);
          if (!pos) {
            r = toResponse(`Invalid position "${effect.position}"`, { name: effect.name }, true);
          } else {
            r = this.moveCombatant(effect.name, pos);
          }
          break;
        }
      }
      if (r!.error) {
        failed++;
        results.push({
          index: i,
          type: effect.type,
          target: effect.name,
          result: r!.text,
          error: true,
        });
      } else {
        applied++;
        results.push({ index: i, type: effect.type, target: effect.name, result: r!.text });
      }
    }

    const summary = results
      .map((r) => `${r.error ? "✗" : "✓"} [${r.type}] ${r.target}: ${r.result}`)
      .join("\n");
    this.markDirty();
    return toResponse(`Batch: ${applied} applied, ${failed} failed\n${summary}`, {
      applied,
      failed,
      results,
    });
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
    shape: "sphere" | "cone" | "rectangle";
    center?: string;
    size?: number;
    direction?: number;
    from?: string;
    to?: string;
    color: string;
    label: string;
    persistent?: boolean;
    casterName?: string;
  }): ToolResponse {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      return toResponse("No active combat", {}, true, [
        "Start combat first with start_combat before placing AoE.",
      ]);
    }

    // Validate shape-specific args
    if (params.shape === "rectangle") {
      if (!params.from || !params.to) {
        return toResponse("Rectangle requires 'from' and 'to' corners in A1 notation", {}, true, [
          "Example: from='A3', to='A14'",
        ]);
      }
    } else if (!params.center) {
      return toResponse(`${params.shape} requires 'center' in A1 notation`, {}, true, [
        "Example: center='E8'",
      ]);
    }

    // Parse positions
    const centerPos = params.shape === "rectangle" ? null : parseGridPosition(params.center!);
    const fromPos = params.from ? parseGridPosition(params.from) : null;
    const toPos = params.to ? parseGridPosition(params.to) : null;

    if (params.shape !== "rectangle" && !centerPos) {
      return toResponse(
        `Invalid grid position: ${params.center}`,
        { center: params.center },
        true,
        ["Use A1 notation (e.g., 'A1', 'E5', 'J10')."],
      );
    }
    if (params.shape === "rectangle" && (!fromPos || !toPos)) {
      return toResponse(`Invalid grid position: from=${params.from}, to=${params.to}`, {}, true, [
        "Use A1 notation (e.g., 'A1', 'E5', 'J10').",
      ]);
    }

    // For rectangle, compute center as midpoint for label placement
    const effectiveCenter =
      centerPos ??
      (fromPos && toPos
        ? { x: Math.floor((fromPos.x + toPos.x) / 2), y: Math.floor((fromPos.y + toPos.y) / 2) }
        : { x: 0, y: 0 });

    const map = this.gameState.encounter?.map;
    const mapWidth = map?.width ?? 20;
    const mapHeight = map?.height ?? 20;

    const aoe: AoEOverlay = {
      id: crypto.randomUUID(),
      shape: params.shape,
      center: effectiveCenter,
      size: params.size,
      direction: params.direction,
      from: fromPos ?? undefined,
      to: toPos ?? undefined,
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
      effectiveCenter,
      {
        size: params.size,
        direction: params.direction,
        from: fromPos ?? undefined,
        to: toPos ?? undefined,
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
        affected.push(c.name);
      }
    }

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    const posLabel =
      params.shape === "rectangle" ? `${params.from}→${params.to}` : (params.center ?? "?");
    const affectedDisplay =
      affected.length > 0
        ? affected
            .map((name) => {
              const c = Object.values(combat.combatants).find((cb) => cb.name === name);
              return `${name} (${c?.position ? formatGridPosition(c.position) : "?"})`;
            })
            .join(", ")
        : "none";
    const affectedStr =
      affected.length > 0 ? `Affected: ${affectedDisplay}` : "No combatants in area";
    this.markDirty();
    return toResponse(`AoE '${params.label}' placed at ${posLabel}. ${affectedStr}`, {
      aoeId: aoe.id,
      label: params.label,
      affected,
    });
  }

  /** Apply area effect damage with saving throws */
  applyAreaEffect(params: {
    shape: "sphere" | "cone" | "rectangle";
    center?: string;
    size?: number;
    direction?: number;
    from?: string;
    to?: string;
    damage: string;
    damageType: string;
    saveAbility: string;
    saveDC: number;
    halfOnSave?: boolean;
  }): ToolResponse {
    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      return toResponse("No active combat", {}, true, [
        "Start combat first with start_combat before applying area effects.",
      ]);
    }

    // Parse positions based on shape
    const centerPos = params.center ? parseGridPosition(params.center) : null;
    const fromPos = params.from ? parseGridPosition(params.from) : null;
    const toPos = params.to ? parseGridPosition(params.to) : null;

    if (params.shape === "rectangle" && (!fromPos || !toPos)) {
      return toResponse(`Rectangle requires valid 'from' and 'to' in A1 notation`, {}, true, [
        "Example: from='A3', to='A14'",
      ]);
    }
    if (params.shape !== "rectangle" && !centerPos) {
      return toResponse(
        `Invalid grid position: ${params.center}`,
        { center: params.center },
        true,
        ["Use A1 notation (e.g., 'A1', 'E5', 'J10')."],
      );
    }

    const effectiveCenter =
      centerPos ??
      (fromPos && toPos
        ? { x: Math.floor((fromPos.x + toPos.x) / 2), y: Math.floor((fromPos.y + toPos.y) / 2) }
        : { x: 0, y: 0 });

    const map = this.gameState.encounter?.map;
    const mapWidth = map?.width ?? 20;
    const mapHeight = map?.height ?? 20;

    const affectedTiles = computeAoETiles(
      params.shape,
      effectiveCenter,
      {
        size: params.size,
        direction: params.direction,
        from: fromPos ?? undefined,
        to: toPos ?? undefined,
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

    if (targets.length === 0) {
      return toResponse("No combatants in affected area", { results: [] });
    }

    const textResults: string[] = [];
    const dataResults: Array<{
      target: string;
      saveRoll: number;
      saveMod: number;
      passed: boolean;
      damage: number;
      damageType: string;
    }> = [];

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
      const saveNotation = `1d20${saveMod >= 0 ? "+" : ""}${saveMod}`;
      const { result: saveRoll } = rollNotation(
        saveNotation,
        `${params.saveAbility} save vs DC ${params.saveDC}`,
      );
      const passed = saveRoll.total >= params.saveDC;

      // Roll damage
      const { result: damageRoll } = rollNotation(params.damage);
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
      textResults.push(
        `${target.name}: ${params.saveAbility} save ${saveRoll.total} (rolled ${saveRoll.rolls[0]?.result ?? "?"}+${saveMod}) — ${passStr} (${damageStr})`,
      );
      dataResults.push({
        target: target.name,
        saveRoll: saveRoll.total,
        saveMod,
        passed,
        damage: finalDamage,
        damageType: params.damageType,
      });
    }

    this.markDirty();
    return toResponse(textResults.join("\n"), { results: dataResults });
  }

  /** Dismiss a persistent AoE overlay */
  dismissAoE(aoeId: string): ToolResponse {
    const combat = this.gameState.encounter?.combat;
    if (!combat) {
      return toResponse("No active combat", {}, true, [
        "There is no active combat session to dismiss AoE from.",
      ]);
    }
    if (!combat.activeAoE || combat.activeAoE.length === 0) {
      return toResponse("No active AoE overlays", {}, true, ["Place an AoE first with show_aoe."]);
    }

    const idx = combat.activeAoE.findIndex((a) => a.id === aoeId);
    if (idx === -1) {
      return toResponse(`AoE with ID "${aoeId}" not found`, { aoeId }, true, [
        `Active AoE IDs: ${combat.activeAoE.map((a) => `${a.id} (${a.label})`).join(", ")}`,
      ]);
    }

    const removed = combat.activeAoE.splice(idx, 1)[0];

    this.broadcast({
      type: "server:combat_update",
      combat,
      map: this.gameState.encounter?.map ?? null,
      timestamp: Date.now(),
    });

    this.markDirty();
    return toResponse(`AoE '${removed.label}' dismissed`, {
      aoeId: removed.id,
      label: removed.label,
    });
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
    notation: string;
    checkType?: string;
    targetCharacter: string;
    dc?: number;
    reason: string;
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
      checkType: params.checkType,
      targetCharacter: params.targetCharacter,
      dc: params.dc,
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
        characters: this.characters,
      },
      [playerName],
    );
  }

  /** Broadcast game state sync to all players (on session restore) */
  broadcastGameStateSync(): void {
    this.broadcast({
      type: "server:game_state_sync",
      gameState: this.gameState,
      characters: this.characters,
    });
  }

  // ─── Internal Helpers ───

  private findCharacterByPlayerName(playerName: string): CharacterData | null {
    return this.characters[playerName] ?? null;
  }

  /** List all valid target names (for error hints) */
  private listTargetNames(): string[] {
    const names: string[] = [];
    const combat = this.gameState.encounter?.combat;
    if (combat) {
      for (const c of Object.values(combat.combatants)) {
        if (c.type !== "player") names.push(c.name);
      }
    }
    for (const char of Object.values(this.characters)) {
      names.push(char.static.name);
    }
    return names;
  }

  /** List all valid character names (players only, for error hints) */
  private listCharacterNames(): string[] {
    return Object.values(this.characters).map((c) => c.static.name);
  }

  /**
   * Sync a player character's current HP and temp HP back to their combatant entry.
   * Called after any HP mutation so that combat_update broadcasts carry consistent data.
   */
  private syncPlayerCombatantHP(characterName: string): void {
    const combat = this.gameState.encounter?.combat;
    if (!combat) return;

    const combatant = Object.values(combat.combatants).find(
      (c) => c.type === "player" && c.name.toLowerCase() === characterName.toLowerCase(),
    );
    if (!combatant) return;

    const char = Object.values(this.characters).find(
      (c) => c.static.name.toLowerCase() === characterName.toLowerCase(),
    );
    if (!char) return;

    combatant.currentHP = char.dynamic.currentHP;
    combatant.tempHP = char.dynamic.tempHP;
  }
}
