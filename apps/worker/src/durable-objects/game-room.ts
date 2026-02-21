import { DurableObject } from "cloudflare:workers";
import { clientMessageSchema } from "@aidnd/shared/schemas";
import type {
  AIConfig,
  AuthUser,
  CharacterData,
  CharacterDynamicData,
  CheckRequest,
  ClientMessage,
  GameState,
  PlayerInfo,
  ServerMessage,
} from "@aidnd/shared/types";
import {
  getModifier,
  getSkillModifier,
  getSavingThrowModifier,
} from "@aidnd/shared/utils";
import { getProvider, MAX_PLAYERS_PER_ROOM } from "@aidnd/shared";
import { callAI } from "../services/ai-service";
import { callAIWithTools, providerSupportsTools } from "../services/ai-tool-loop";
import { detectReferences, buildInjectedContext } from "../services/context-detector";
import { runDMPrep } from "../services/dm-prep";
import { verifyJWT } from "../auth/jwt";
import { buildDMSystemPrompt } from "../prompts/dm-system";
import { parseAIResponse } from "../services/ai-parser";
import { resolveActions } from "../services/state-resolver";
import { rollCheck } from "../services/dice";
import type { Env, RoomMeta } from "../types";

type PlayerStatus = "host" | "player";

interface SessionData {
  playerName: string;
  userId: string;
  avatarUrl?: string;
  status: PlayerStatus;
  joinedAt: number;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface PlayerRecord {
  name: string;
  isHost: boolean;
}

const DEFAULT_GAME_STATE: GameState = {
  encounter: null,
  eventLog: [],
  pacingProfile: "balanced",
  encounterLength: "standard",
};

export class GameRoom extends DurableObject<Env> {
  private sessions: Map<WebSocket, SessionData> = new Map();
  private aiConfig: AIConfig | null = null;
  private conversationHistory: ConversationMessage[] = [];
  private hostUserId: string | null = null;
  private hostPlayerName: string = "";
  private approvedUserIds: Set<string> = new Set();
  private chatLog: ServerMessage[] = [];
  private roomCode: string = "";
  private storageLoaded = false;
  private characters: Map<string, CharacterData> = new Map(); // keyed by userId
  private allPlayerRecords: Map<string, PlayerRecord> = new Map(); // keyed by userId
  private storyStarted: boolean = false;
  private gameState: GameState = { ...DEFAULT_GAME_STATE, eventLog: [] };
  private password: string | null = null;
  /** Whether this room was explicitly created via /api/rooms/create */
  private created: boolean = false;
  private createdAt: number = 0;
  /** DM Prep summary — cached from story start, injected into system prompt */
  private dmPrepSummary: string = "";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as
        | SessionData
        | undefined;
      if (attachment) {
        this.sessions.set(ws, attachment);
        // Restore host state
        if (attachment.status === "host") {
          this.hostUserId = attachment.userId;
        }
        if (attachment.status === "host" || attachment.status === "player") {
          this.approvedUserIds.add(attachment.userId);
        }
      }
    }

    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );

    // Load persisted state from storage
    this.ctx.blockConcurrencyWhile(async () => {
      const [
        chatLog, conversationHistory, aiConfig, roomCode,
        hostPlayerName, characters, allPlayerRecords, storyStarted,
        gameState, created, password, createdAt, dmPrepSummary,
      ] = await Promise.all([
        this.ctx.storage.get<ServerMessage[]>("chatLog"),
        this.ctx.storage.get<ConversationMessage[]>("conversationHistory"),
        this.ctx.storage.get<AIConfig>("aiConfig"),
        this.ctx.storage.get<string>("roomCode"),
        this.ctx.storage.get<string>("hostPlayerName"),
        this.ctx.storage.get<Record<string, CharacterData>>("characters"),
        this.ctx.storage.get<Record<string, PlayerRecord>>("allPlayerRecords"),
        this.ctx.storage.get<boolean>("storyStarted"),
        this.ctx.storage.get<GameState>("gameState"),
        this.ctx.storage.get<boolean>("created"),
        this.ctx.storage.get<string>("password"),
        this.ctx.storage.get<number>("createdAt"),
        this.ctx.storage.get<string>("dmPrepSummary"),
      ]);
      if (chatLog) this.chatLog = chatLog;
      if (conversationHistory) this.conversationHistory = conversationHistory;
      if (aiConfig) this.aiConfig = aiConfig;
      if (roomCode) this.roomCode = roomCode;
      if (hostPlayerName) this.hostPlayerName = hostPlayerName;
      if (characters) this.characters = new Map(Object.entries(characters));
      if (allPlayerRecords) this.allPlayerRecords = new Map(Object.entries(allPlayerRecords));
      if (storyStarted) this.storyStarted = storyStarted;
      if (gameState) this.gameState = gameState;
      if (created) this.created = created;
      if (password) this.password = password;
      if (createdAt) this.createdAt = createdAt;
      if (dmPrepSummary) this.dmPrepSummary = dmPrepSummary;
      this.storageLoaded = true;
    });
  }

  /** Update room metadata in KV for the room list */
  private async updateRoomMeta(): Promise<void> {
    if (!this.roomCode) return;
    const meta: RoomMeta = {
      roomCode: this.roomCode,
      hostName: this.hostPlayerName,
      playerCount: this.getPlayerNames().length,
      hasPassword: this.password !== null,
      createdAt: this.createdAt,
    };
    try {
      await this.env.ROOMS.put(`room:${this.roomCode}`, JSON.stringify(meta), {
        expirationTtl: 86400 * 7,
      });
    } catch (e) {
      console.error("Failed to update room meta:", e);
    }
  }

  /** Append a message to the chat log and persist it */
  private async appendToChatLog(message: ServerMessage): Promise<void> {
    this.chatLog.push(message);
    await this.ctx.storage.put("chatLog", this.chatLog);
  }

  /** Append to AI conversation history and persist it */
  private async appendToConversation(
    ...messages: ConversationMessage[]
  ): Promise<void> {
    this.conversationHistory.push(...messages);
    await this.ctx.storage.put("conversationHistory", this.conversationHistory);
  }

  // ─── Conversation Compaction ───

  private static readonly COMPACTION_THRESHOLD = 40;
  private static readonly KEEP_RECENT = 14;

  /**
   * Compact conversation history if it exceeds the threshold.
   * Replaces old messages with a server-side summary, keeping recent messages verbatim.
   * The campaign journal provides structured continuity that compaction might lose.
   */
  private async compactConversationIfNeeded(): Promise<void> {
    if (this.conversationHistory.length < GameRoom.COMPACTION_THRESHOLD) return;

    const oldMessages = this.conversationHistory.slice(0, -GameRoom.KEEP_RECENT);
    const recentMessages = this.conversationHistory.slice(-GameRoom.KEEP_RECENT);

    const summary = this.buildConversationSummary(oldMessages);

    // Replace history: [summary] + recent messages
    this.conversationHistory = [
      { role: "user", content: `[Session recap: ${summary}]` },
      {
        role: "assistant",
        content:
          "Understood. I have the session context and will continue the adventure seamlessly.",
      },
      ...recentMessages,
    ];

    await this.ctx.storage.put("conversationHistory", this.conversationHistory);
  }

  /**
   * Build a heuristic summary from old conversation messages (no AI call).
   * Extracts system messages (check results, combat events), player actions,
   * and key narrative beats.
   */
  private buildConversationSummary(messages: ConversationMessage[]): string {
    const systemEvents: string[] = [];
    const playerActions: Map<string, string> = new Map(); // last action per player
    const narrativeBeats: string[] = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        // System messages like "[System: Thorin rolled 18...]"
        const sysMatch = msg.content.match(/^\[System:\s*(.+)\]$/);
        if (sysMatch) {
          systemEvents.push(sysMatch[1]);
          continue;
        }
        // Player messages like "[PlayerName]: action"
        const playerMatch = msg.content.match(/^\[(.+?)\]:\s*(.+)$/);
        if (playerMatch) {
          playerActions.set(playerMatch[1], playerMatch[2]);
        }
      } else {
        // AI responses — extract first sentence as narrative beat
        const text = msg.content
          .replace(/```json:actions[\s\S]*?```/g, "") // strip action blocks
          .trim();
        if (text.length > 0) {
          const firstSentence = text.split(/[.!?]\s/)[0];
          if (firstSentence && firstSentence.length > 10 && firstSentence.length < 200) {
            narrativeBeats.push(firstSentence.replace(/^\*+|\*+$/g, "").trim());
          }
        }
      }
    }

    const parts: string[] = [];

    // Keep last ~5 narrative beats for story context
    if (narrativeBeats.length > 0) {
      const recent = narrativeBeats.slice(-5);
      parts.push("Story beats: " + recent.join(". ") + ".");
    }

    // Include notable system events (combat results, checks)
    if (systemEvents.length > 0) {
      const recent = systemEvents.slice(-8);
      parts.push("Events: " + recent.join("; "));
    }

    // Last player actions
    if (playerActions.size > 0) {
      const actions = Array.from(playerActions.entries())
        .map(([name, action]) => `${name}: "${action}"`)
        .join(", ");
      parts.push("Recent player actions: " + actions);
    }

    return parts.join(" | ") || "The adventure continues...";
  }

  async fetch(request: Request): Promise<Response> {
    // Internal init request from /api/rooms/create — marks room as explicitly created
    const url = new URL(request.url);
    if (url.pathname === "/init" && request.method === "POST") {
      this.created = true;
      this.createdAt = Date.now();
      await this.ctx.storage.put("created", true);
      await this.ctx.storage.put("createdAt", this.createdAt);
      return new Response("OK");
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    const tempSession: SessionData = {
      playerName: "",
      userId: "",
      status: "player",
      joinedAt: Date.now(),
    };
    server.serializeAttachment(tempSession);
    this.sessions.set(server, tempSession);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    if (typeof message !== "string") {
      this.sendTo(ws, {
        type: "server:error",
        message: "Binary messages not supported",
        code: "BINARY_NOT_SUPPORTED",
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      this.sendTo(ws, {
        type: "server:error",
        message: "Invalid JSON",
        code: "INVALID_JSON",
      });
      return;
    }

    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Invalid message format",
        code: "VALIDATION_FAILED",
      });
      return;
    }

    const msg: ClientMessage = result.data;

    switch (msg.type) {
      case "client:join":
        await this.handleJoin(ws, msg);
        break;
      case "client:chat":
        await this.handleChat(ws, msg);
        break;
      case "client:set_ai_config":
        await this.handleSetAIConfig(ws, msg);
        break;
      case "client:set_password":
        await this.handleSetPassword(ws, msg);
        break;
      case "client:kick_player":
        await this.handleKickPlayer(ws, msg);
        break;
      case "client:set_character":
        await this.handleSetCharacter(ws, msg);
        break;
      case "client:start_story":
        await this.handleStartStory(ws);
        break;
      case "client:roll_dice":
        await this.handleRollDice(ws, msg);
        break;
      case "client:combat_action":
        await this.handleCombatAction(ws, msg);
        break;
      case "client:move_token":
        await this.handleMoveToken(ws, msg);
        break;
      case "client:rollback":
        await this.handleRollback(ws, msg);
        break;
      case "client:set_system_prompt":
        await this.handleSetSystemPrompt(ws, msg);
        break;
      case "client:set_pacing":
        await this.handleSetPacing(ws, msg);
        break;
      case "client:dm_override":
        await this.handleDMOverride(ws, msg);
        break;
      case "client:destroy_room":
        await this.handleDestroyRoom(ws);
        break;
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    _reason: string
  ): Promise<void> {
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);
    ws.close(code, "Connection closed");

    if (session?.playerName) {
      // Player stays in allPlayerRecords (visible as offline)
      this.broadcast({
        type: "server:player_left",
        playerName: session.playerName,
        players: this.getPlayerNames(),
        hostName: this.getHostName(),
        allPlayers: this.getAllPlayersWithStatus(),
      });
      this.broadcast({
        type: "server:system",
        content: `${session.playerName} has disconnected.`,
        timestamp: Date.now(),
      });
      this.updateRoomMeta();
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);
    console.error("WebSocket error:", error, "Player:", session?.playerName);
  }

  // --- Handlers ---

  private async handleJoin(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:join" }>
  ): Promise<void> {
    // Reject if room was never explicitly created via /api/rooms/create
    if (!this.created) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Room does not exist",
        code: "ROOM_NOT_FOUND",
      });
      ws.close(4004, "Room not found");
      return;
    }

    // Store room code for later use (e.g., approve/reject)
    if (!this.roomCode) {
      this.roomCode = msg.roomCode;
      this.ctx.storage.put("roomCode", this.roomCode);
    }

    // Resolve user identity from auth token or generate guest ID
    let userId: string;
    let avatarUrl: string | undefined;
    let authUser: AuthUser | undefined;

    if (msg.authToken) {
      const payload = await verifyJWT(msg.authToken, this.env.JWT_SECRET);
      if (payload) {
        userId = payload.sub;
        avatarUrl = payload.picture;
        authUser = {
          userId: payload.sub,
          displayName: payload.name,
          email: payload.email,
          avatarUrl: payload.picture,
        };
      } else {
        // Token invalid — treat as guest
        userId = msg.guestId || `guest_${crypto.randomUUID().slice(0, 8)}`;
      }
    } else {
      userId = msg.guestId || `guest_${crypto.randomUUID().slice(0, 8)}`;
    }

    // Check room capacity
    if (this.getPlayerNames().length >= MAX_PLAYERS_PER_ROOM) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Room is full",
        code: "ROOM_FULL",
      });
      return;
    }

    // Check room password (skip for reconnecting players)
    const isReturning = this.approvedUserIds.has(userId) || this.hostUserId === userId;
    if (this.password !== null && !isReturning) {
      if (!msg.password) {
        this.sendTo(ws, {
          type: "server:error",
          message: "This room requires a password",
          code: "PASSWORD_REQUIRED",
        });
        return;
      }
      if (msg.password !== this.password) {
        this.sendTo(ws, {
          type: "server:error",
          message: "Incorrect password",
          code: "WRONG_PASSWORD",
        });
        return;
      }
    }

    // Clean up stale sessions for the same player name
    // (e.g., the previous WebSocket was lost but session entry remains)
    for (const [existingWs, existingSession] of this.sessions.entries()) {
      if (existingWs === ws) continue;
      if (existingSession.playerName === msg.playerName) {
        this.sessions.delete(existingWs);
        try {
          existingWs.close(1000, "Replaced by new connection");
        } catch {
          // Already closed
        }
      }
    }

    // Check for duplicate names among active players
    if (this.getPlayerNames().includes(msg.playerName)) {
      // If reconnecting with same userId, allow it (close old socket)
      const existingEntry = this.findSessionByUserId(userId);
      if (existingEntry) {
        const [oldWs] = existingEntry;
        this.sessions.delete(oldWs);
        try {
          oldWs.close(1000, "Reconnected from another session");
        } catch {
          // Already closed
        }
      } else {
        this.sendTo(ws, {
          type: "server:error",
          message: "Name already taken in this room",
          code: "NAME_TAKEN",
        });
        return;
      }
    }

    // Accept aiConfig (new) or legacy apiKey (backwards compat)
    if (msg.aiConfig) {
      this.aiConfig = msg.aiConfig;
      this.ctx.storage.put("aiConfig", this.aiConfig);
    } else if (msg.apiKey) {
      this.aiConfig = { provider: "anthropic", apiKey: msg.apiKey };
      this.ctx.storage.put("aiConfig", this.aiConfig);
    }

    // Determine player status — no pending state, all valid joins are immediate
    let status: PlayerStatus;
    const isReconnect =
      this.approvedUserIds.has(userId) || this.hostUserId === userId;

    if (!this.hostUserId) {
      // First player to join is the host
      status = "host";
      this.hostUserId = userId;
      this.hostPlayerName = msg.playerName;
      this.approvedUserIds.add(userId);
      this.ctx.storage.put("hostPlayerName", this.hostPlayerName);
    } else if (this.hostUserId === userId) {
      // Host reconnecting
      status = "host";
      this.hostPlayerName = msg.playerName;
      this.ctx.storage.put("hostPlayerName", this.hostPlayerName);
    } else {
      // Regular player (new or reconnecting)
      status = "player";
      this.approvedUserIds.add(userId);
    }

    const session: SessionData = {
      playerName: msg.playerName,
      userId,
      avatarUrl,
      status,
      joinedAt: Date.now(),
    };
    ws.serializeAttachment(session);
    this.sessions.set(ws, session);

    this.completeJoin(ws, session, msg.roomCode, isReconnect, authUser);
  }

  private completeJoin(
    ws: WebSocket,
    session: SessionData,
    roomCode: string,
    isReconnect: boolean,
    authUser?: AuthUser
  ): void {
    // Track in allPlayerRecords (persists across disconnects)
    if (!this.allPlayerRecords.has(session.userId)) {
      this.allPlayerRecords.set(session.userId, {
        name: session.playerName,
        isHost: session.status === "host",
      });
      this.persistAllPlayerRecords();
    }

    const provider = this.aiConfig
      ? getProvider(this.aiConfig.provider)
      : undefined;

    this.sendTo(ws, {
      type: "server:room_joined",
      roomCode,
      players: this.getPlayerNames(),
      hostName: this.getHostName(),
      hasApiKey: this.aiConfig !== null,
      aiProvider: provider?.name,
      aiModel: this.aiConfig?.model || "default",
      isHost: session.status === "host",
      isReconnect,
      user: authUser,
      characters: this.getCharactersByPlayerName(),
      allPlayers: this.getAllPlayersWithStatus(),
      storyStarted: this.storyStarted,
    });

    // Replay full chat log so joining/reconnecting players see all history
    if (this.chatLog.length > 0) {
      for (const msg of this.chatLog) {
        this.sendTo(ws, msg);
      }
    }

    // Send game state sync (event log, pacing, custom prompt, combat)
    this.sendTo(ws, {
      type: "server:game_state_sync",
      gameState: this.gameState,
    });

    this.broadcastToApproved(
      {
        type: "server:player_joined",
        playerName: session.playerName,
        players: this.getPlayerNames(),
        hostName: this.getHostName(),
        allPlayers: this.getAllPlayersWithStatus(),
      },
      ws
    );

    if (!isReconnect) {
      this.broadcast({
        type: "server:system",
        content: `${session.playerName} has joined the room.`,
        timestamp: Date.now(),
      });
    } else {
      this.broadcast({
        type: "server:system",
        content: `${session.playerName} has reconnected.`,
        timestamp: Date.now(),
      });
    }

    // Story greeting is now host-triggered via client:start_story
    // (no auto-greeting on join)

    // Update room metadata in KV (player count, host name)
    this.updateRoomMeta();
  }

  private async handleSetPassword(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:set_password" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || session.status !== "host") {
      this.sendTo(ws, {
        type: "server:error",
        message: "Only the host can set a password",
        code: "NOT_HOST",
      });
      return;
    }

    this.password = msg.password || null;
    await this.ctx.storage.put("password", this.password);

    this.updateRoomMeta();

    this.broadcast({
      type: "server:system",
      content: this.password
        ? "Room password has been set."
        : "Room password has been removed.",
      timestamp: Date.now(),
    });
  }

  private async handleKickPlayer(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:kick_player" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || session.status !== "host") {
      this.sendTo(ws, {
        type: "server:error",
        message: "Only the host can kick players",
        code: "NOT_HOST",
      });
      return;
    }

    const targetEntry = this.findSessionByName(msg.playerName);
    if (!targetEntry) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Player not found",
        code: "PLAYER_NOT_FOUND",
      });
      return;
    }

    const [targetWs, targetSession] = targetEntry;

    if (targetSession.status === "host") {
      this.sendTo(ws, {
        type: "server:error",
        message: "Cannot kick the host",
        code: "CANNOT_KICK_HOST",
      });
      return;
    }

    // Remove from approved list so they can't auto-rejoin
    this.approvedUserIds.delete(targetSession.userId);

    this.sendTo(targetWs, {
      type: "server:kicked",
      reason: "You were kicked by the host",
    });

    this.sessions.delete(targetWs);

    // Remove from allPlayerRecords on kick (they are removed from the story)
    this.allPlayerRecords.delete(targetSession.userId);
    this.persistAllPlayerRecords();

    // Remove their character too
    if (this.characters.has(targetSession.userId)) {
      this.characters.delete(targetSession.userId);
      this.persistCharacters();
    }

    try {
      targetWs.close(4002, "Kicked by host");
    } catch {
      // Already closed
    }

    this.broadcast({
      type: "server:player_left",
      playerName: msg.playerName,
      players: this.getPlayerNames(),
      hostName: this.getHostName(),
      allPlayers: this.getAllPlayersWithStatus(),
    });

    this.broadcast({
      type: "server:system",
      content: `${msg.playerName} was kicked from the room.`,
      timestamp: Date.now(),
    });

    this.updateRoomMeta();
  }

  private async handleDestroyRoom(ws: WebSocket): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || session.status !== "host") {
      this.sendTo(ws, {
        type: "server:error",
        message: "Only the host can destroy the room",
        code: "NOT_HOST",
      });
      return;
    }

    // Broadcast room_destroyed to all connected clients
    this.broadcast({ type: "server:room_destroyed" });

    // Close all WebSocket connections
    for (const [clientWs] of this.sessions) {
      try {
        clientWs.close(1000, "Room destroyed");
      } catch {
        // Already closed
      }
    }

    // Delete room from KV registry
    try {
      await this.env.ROOMS.delete(`room:${this.roomCode}`);
    } catch {
      // ignore
    }

    // Wipe all DO storage
    await this.ctx.storage.deleteAll();

    // Reset in-memory state
    this.sessions.clear();
    this.aiConfig = null;
    this.conversationHistory = [];
    this.hostUserId = null;
    this.hostPlayerName = "";
    this.approvedUserIds.clear();
    this.chatLog = [];
    this.roomCode = "";
    this.characters.clear();
    this.allPlayerRecords.clear();
    this.storyStarted = false;
    this.gameState = { ...DEFAULT_GAME_STATE, eventLog: [] };
    this.created = false;
    this.password = null;
    this.createdAt = 0;
    this.dmPrepSummary = "";
  }

  private async handleChat(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:chat" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session?.playerName) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Must join room first",
        code: "NOT_JOINED",
      });
      return;
    }

    this.broadcast({
      type: "server:chat",
      content: msg.content,
      playerName: session.playerName,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });

    if (this.aiConfig) {
      // Use character name for AI context so the DM addresses the character, not the player
      const character = this.characters.get(session.userId);
      const speakerName = character?.static.name || session.playerName;
      await this.getAIResponse(speakerName, msg.content);
    }
  }

  private async handleSetAIConfig(
    _ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:set_ai_config" }>
  ): Promise<void> {
    const provider = getProvider(msg.aiConfig.provider);
    if (!provider) {
      this.broadcast({
        type: "server:error",
        message: `Unknown AI provider: ${msg.aiConfig.provider}`,
        code: "UNKNOWN_PROVIDER",
      });
      return;
    }

    this.aiConfig = msg.aiConfig;
    this.ctx.storage.put("aiConfig", this.aiConfig);
    const modelName = msg.aiConfig.model || "default";

    this.broadcast({
      type: "server:system",
      content: `AI provider configured: ${provider.name} (${modelName}). The AI Dungeon Master is ready!`,
      timestamp: Date.now(),
    });

    // Story greeting is now host-triggered via client:start_story
  }

  // --- AI ---

  /**
   * Unified AI call that uses tool-use for capable providers (Anthropic, OpenAI)
   * and falls back to plain callAI() for others.
   */
  private async makeAICall(
    systemPrompt: string,
    messages: ConversationMessage[],
  ): Promise<{ text: string }> {
    if (!this.aiConfig) {
      throw new Error("No AI config");
    }

    if (providerSupportsTools(this.aiConfig.provider)) {
      return callAIWithTools({
        aiConfig: this.aiConfig,
        systemPrompt,
        messages,
        kvCache: this.env.DND_CACHE,
      });
    }

    return callAI({
      aiConfig: this.aiConfig,
      systemPrompt,
      messages,
    });
  }

  /** Get all unique prepared spell names from the party (for context injection). */
  private getAllPartySpellNames(): string[] {
    const spells = new Set<string>();
    for (const char of this.characters.values()) {
      for (const spell of char.static.spells) {
        if (spell.prepared || spell.alwaysPrepared) {
          spells.add(spell.name);
        }
      }
    }
    return [...spells];
  }

  private async sendAIGreeting(): Promise<void> {
    if (!this.aiConfig) return;

    const provider = getProvider(this.aiConfig.provider);
    const providerName = provider?.name ?? this.aiConfig.provider;
    const characterMap = this.getCharactersByPlayerName();
    const systemPrompt = this.buildSystemPrompt(characterMap);

    try {
      const playerNames = this.getPlayerNames();
      const partyDescriptions = playerNames.map((name) => {
        const char = characterMap[name];
        if (char) {
          const classes = char.static.classes
            .map((c) => `${c.name} ${c.level}`)
            .join("/");
          return `${name} (${char.static.name}, ${char.static.race} ${classes})`;
        }
        return name;
      });

      const userMsg = `The adventuring party has gathered: ${partyDescriptions.join(", ")}. Set the scene and introduce each character!`;

      const result = await this.makeAICall(
        systemPrompt,
        [{ role: "user", content: userMsg }],
      );

      // Parse AI response for actions
      const parsed = parseAIResponse(result.text);

      await this.appendToConversation(
        { role: "user", content: `[Party gathered: ${playerNames.join(", ")}]` },
        { role: "assistant", content: result.text }
      );

      // Resolve any actions from the greeting
      await this.processAIActions(parsed.narrative, parsed.actions);
    } catch (error) {
      this.broadcast({
        type: "server:error",
        message:
          error instanceof Error
            ? error.message
            : `${providerName} request failed`,
        code: "AI_ERROR",
      });
    }
  }

  private async getAIResponse(
    playerName: string,
    content: string
  ): Promise<void> {
    if (!this.aiConfig) {
      this.broadcast({
        type: "server:system",
        content:
          "No AI provider configured. Someone needs to set up an AI provider.",
        timestamp: Date.now(),
      });
      return;
    }

    const provider = getProvider(this.aiConfig.provider);
    const providerName = provider?.name ?? this.aiConfig.provider;

    // Sanitize: replace any [Name]: patterns in content to prevent speaker injection
    const sanitizedContent = content.replace(/\[([^\]]+)\]\s*:/g, "($1):");
    const userMessage = `[${playerName}]: ${sanitizedContent}`;
    await this.appendToConversation({ role: "user", content: userMessage });

    try {
      const systemPrompt = this.buildSystemPrompt(this.getCharactersByPlayerName());

      // For non-tool providers, inject D&D reference context into the last user message
      let messagesForAI = this.conversationHistory;
      if (!providerSupportsTools(this.aiConfig.provider)) {
        const refs = detectReferences(content, this.getAllPartySpellNames());
        const ctx = await buildInjectedContext(refs, this.env.DND_CACHE);
        if (ctx) {
          // Clone conversation and prepend context to last user message
          messagesForAI = [...this.conversationHistory];
          const lastIdx = messagesForAI.length - 1;
          messagesForAI[lastIdx] = {
            ...messagesForAI[lastIdx],
            content: `${ctx}\n${messagesForAI[lastIdx].content}`,
          };
        }
      }

      const result = await this.makeAICall(systemPrompt, messagesForAI);

      // Parse AI response for structured actions
      const parsed = parseAIResponse(result.text);

      // Store the raw text in conversation history (including JSON blocks)
      await this.appendToConversation({
        role: "assistant",
        content: result.text,
      });

      // Compact conversation if it's grown too long
      await this.compactConversationIfNeeded();

      // Process narrative + actions
      await this.processAIActions(parsed.narrative, parsed.actions);
    } catch (error) {
      this.broadcast({
        type: "server:error",
        message:
          error instanceof Error
            ? error.message
            : `${providerName} request failed`,
        code: "AI_ERROR",
      });
    }
  }

  /** Build system prompt with current game state context. */
  private buildSystemPrompt(characters: Record<string, CharacterData>): string {
    const hasToolAccess = this.aiConfig
      ? providerSupportsTools(this.aiConfig.provider)
      : false;
    return buildDMSystemPrompt({
      characters,
      customPrompt: this.gameState.customSystemPrompt,
      pacingProfile: this.gameState.pacingProfile,
      encounterLength: this.gameState.encounterLength,
      combatState: this.gameState.encounter?.combat ?? undefined,
      journal: this.gameState.journal,
      dmPrepSummary: this.dmPrepSummary || undefined,
      hasToolAccess,
    });
  }

  /**
   * Process parsed AI response: broadcast narrative, resolve actions,
   * apply state changes, and broadcast updates.
   */
  private async processAIActions(
    narrative: string,
    actions: import("@aidnd/shared/types").AIAction[],
    npcTurnDepth: number = 0
  ): Promise<void> {
    // Broadcast the AI narrative message (with actions metadata)
    this.broadcast({
      type: "server:ai",
      content: narrative,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
      actions: actions.length > 0 ? actions : undefined,
    });

    if (actions.length === 0) return;

    // Resolve actions against game state
    const result = resolveActions(
      actions,
      this.gameState,
      this.characters,
      this.conversationHistory.length
    );

    // Apply character updates
    for (const [userId, dynamicData] of result.characterUpdates) {
      const char = this.characters.get(userId);
      if (char) {
        char.dynamic = dynamicData;
        // Broadcast character update to all players
        const playerName = this.getPlayerNameByUserId(userId);
        if (playerName) {
          this.broadcast({
            type: "server:character_updated",
            playerName,
            character: char,
          });
        }
      }
    }

    // Apply combat update (null = combat ended, CombatState = updated)
    if (result.combatUpdate !== undefined) {
      if (this.gameState.encounter) {
        this.gameState.encounter.combat = result.combatUpdate ?? undefined;
      }
      this.broadcast({
        type: "server:combat_update",
        combat: result.combatUpdate ?? null,
        map: this.gameState.encounter?.map ?? null,
        timestamp: Date.now(),
      });
    }

    // Process check requests — auto-roll for NPCs, broadcast to players
    for (const check of result.checkRequests) {
      const combat = this.gameState.encounter?.combat;
      const isNPC = combat && Object.values(combat.combatants).some(
        (c) =>
          c.name.toLowerCase() === check.targetCharacter.toLowerCase() &&
          c.type !== "player"
      );

      if (isNPC) {
        await this.autoRollForNPC(check);
      } else {
        this.broadcast({
          type: "server:check_request",
          check,
          timestamp: Date.now(),
          id: crypto.randomUUID(),
        });
      }
    }

    // Append events to log, broadcast to host
    for (const event of result.events) {
      this.gameState.eventLog.push(event);
      // Trim to last 100 events
      if (this.gameState.eventLog.length > 100) {
        this.gameState.eventLog = this.gameState.eventLog.slice(-100);
      }
      // Broadcast event to host for rollback UI
      const hostWs = this.findHostWebSocket();
      if (hostWs) {
        this.sendTo(hostWs, {
          type: "server:event_log",
          event,
        });
      }
    }

    // Log warnings
    for (const w of result.warnings) {
      console.warn("[StateResolver]", w);
    }

    // Persist updated state
    await this.persistGameState();
    if (result.characterUpdates.size > 0) {
      this.persistCharacters();
    }

    // Auto-continue for NPC/enemy turns (up to 10 to prevent infinite loops)
    if (
      result.combatUpdate &&
      result.combatUpdate.phase === "active" &&
      npcTurnDepth < 10 &&
      this.aiConfig
    ) {
      const nextId =
        result.combatUpdate.turnOrder[result.combatUpdate.turnIndex];
      const nextCombatant = result.combatUpdate.combatants[nextId];
      if (nextCombatant && nextCombatant.type !== "player") {
        const turnMsg = `[System: It is now ${nextCombatant.name}'s turn. Resolve their actions immediately.]`;
        await this.appendToConversation({ role: "user", content: turnMsg });
        try {
          const systemPrompt = this.buildSystemPrompt(
            this.getCharactersByPlayerName()
          );
          const aiResult = await this.makeAICall(
            systemPrompt,
            this.conversationHistory,
          );
          const parsed = parseAIResponse(aiResult.text);
          await this.appendToConversation({
            role: "assistant",
            content: aiResult.text,
          });
          await this.compactConversationIfNeeded();
          await this.processAIActions(
            parsed.narrative,
            parsed.actions,
            npcTurnDepth + 1
          );
        } catch (error) {
          console.error("[NPC Turn]", error);
          this.broadcast({
            type: "server:error",
            message: "Failed to resolve NPC turn",
            code: "AI_ERROR",
          });
        }
      }
    }
  }

  /**
   * Auto-roll a check for an NPC/enemy combatant.
   * Uses the same server-side rollCheck() as player rolls (crypto-random).
   */
  private async autoRollForNPC(check: CheckRequest): Promise<void> {
    // Default modifier +0 for NPCs (they don't have full CharacterData)
    const modifier = 0;

    const roll = rollCheck({
      modifier,
      advantage: check.advantage,
      disadvantage: check.disadvantage,
      label: check.reason,
    });

    const success = check.dc !== undefined ? roll.total >= check.dc : true;

    // Broadcast dice roll (NPC name as playerName)
    this.broadcast({
      type: "server:dice_roll",
      roll,
      playerName: check.targetCharacter,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });

    // Broadcast check result
    this.broadcast({
      type: "server:check_result",
      result: {
        requestId: check.id,
        roll,
        dc: check.dc,
        success,
        characterName: check.targetCharacter,
      },
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });

    // Inject result into AI conversation
    const resultLabel = success ? "Success" : "Failure";
    const dcStr = check.dc !== undefined ? ` (DC ${check.dc})` : "";
    const systemMsg = `[System: ${check.targetCharacter} rolled ${roll.total} on ${check.reason}${dcStr} — ${resultLabel}${roll.criticalHit ? " (Critical!)" : ""}${roll.criticalFail ? " (Critical Fail!)" : ""}]`;
    await this.appendToConversation({ role: "user", content: systemMsg });

    // Trigger AI to narrate the outcome
    if (this.aiConfig) {
      try {
        const systemPrompt = this.buildSystemPrompt(
          this.getCharactersByPlayerName()
        );
        const aiResult = await this.makeAICall(
          systemPrompt,
          this.conversationHistory,
        );
        const parsed = parseAIResponse(aiResult.text);
        await this.appendToConversation({
          role: "assistant",
          content: aiResult.text,
        });
        await this.compactConversationIfNeeded();
        await this.processAIActions(parsed.narrative, parsed.actions);
      } catch (error) {
        this.broadcast({
          type: "server:error",
          message:
            error instanceof Error
              ? error.message
              : "AI follow-up failed after NPC roll",
          code: "AI_ERROR",
        });
      }
    }
  }

  /** Persist game state to Durable Object storage. */
  private async persistGameState(): Promise<void> {
    await this.ctx.storage.put("gameState", this.gameState);
  }

  // --- Character & Story Handlers ---

  private async handleSetCharacter(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:set_character" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session?.playerName) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Must join room first",
        code: "NOT_JOINED",
      });
      return;
    }

    this.characters.set(session.userId, msg.character);
    this.persistCharacters();

    // Broadcast character update to all approved players
    this.broadcast({
      type: "server:character_updated",
      playerName: session.playerName,
      character: msg.character,
    });
  }

  private async handleStartStory(ws: WebSocket): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || session.status !== "host") {
      this.sendTo(ws, {
        type: "server:error",
        message: "Only the host can start the story",
        code: "NOT_HOST",
      });
      return;
    }

    if (this.storyStarted) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Story has already started",
        code: "ALREADY_STARTED",
      });
      return;
    }

    if (!this.aiConfig) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Configure an AI provider first",
        code: "NO_AI_CONFIG",
      });
      return;
    }

    this.storyStarted = true;
    this.ctx.storage.put("storyStarted", true);

    this.broadcast({
      type: "server:system",
      content: "The adventure begins...",
      timestamp: Date.now(),
    });

    // Run DM Prep phase — pre-fetch party spells and build capabilities summary
    try {
      const prep = await runDMPrep(
        this.getCharactersByPlayerName(),
        this.env.DND_CACHE,
      );
      this.dmPrepSummary = prep.prepSummary;
      await this.ctx.storage.put("dmPrepSummary", this.dmPrepSummary);
    } catch (error) {
      console.error("[DM Prep] Non-fatal error:", error);
      // Non-fatal — continue without prep data
    }

    await this.sendAIGreeting();
  }

  // --- Game Mechanic Handlers ---

  private async handleRollDice(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:roll_dice" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session?.playerName) {
      this.sendTo(ws, { type: "server:error", message: "Must join room first", code: "NOT_JOINED" });
      return;
    }

    // Find the pending check
    const combat = this.gameState.encounter?.combat;
    const pendingCheck = combat?.pendingCheck ?? this.gameState.pendingCheck;
    if (!pendingCheck || pendingCheck.id !== msg.checkRequestId) {
      this.sendTo(ws, { type: "server:error", message: "No matching pending check", code: "NO_PENDING_CHECK" });
      return;
    }

    // Verify the rolling player owns the target character
    const char = this.characters.get(session.userId);
    if (!char || char.static.name.toLowerCase() !== pendingCheck.targetCharacter.toLowerCase()) {
      this.sendTo(ws, { type: "server:error", message: "This check is not for your character", code: "WRONG_CHARACTER" });
      return;
    }

    // Compute modifier from character data
    const modifier = this.computeCheckModifier(char, pendingCheck);

    // Roll the check
    const roll = rollCheck({
      modifier,
      advantage: pendingCheck.advantage,
      disadvantage: pendingCheck.disadvantage,
      label: pendingCheck.reason,
    });

    // Determine success
    const success = pendingCheck.dc !== undefined ? roll.total >= pendingCheck.dc : true;

    // Broadcast dice roll (inline in chat)
    this.broadcast({
      type: "server:dice_roll",
      roll,
      playerName: session.playerName,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
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

    await this.persistGameState();

    // Inject result into AI conversation and trigger follow-up
    const resultLabel = success ? "Success" : "Failure";
    const dcStr = pendingCheck.dc !== undefined ? ` (DC ${pendingCheck.dc})` : "";
    const systemMsg = `[System: ${char.static.name} rolled ${roll.total} on ${pendingCheck.reason}${dcStr} — ${resultLabel}${roll.criticalHit ? " (Critical!)" : ""}${roll.criticalFail ? " (Critical Fail!)" : ""}]`;

    await this.appendToConversation({ role: "user", content: systemMsg });

    // Trigger AI to narrate the outcome
    if (this.aiConfig) {
      try {
        const systemPrompt = this.buildSystemPrompt(this.getCharactersByPlayerName());
        const result = await this.makeAICall(
          systemPrompt,
          this.conversationHistory,
        );

        const parsed = parseAIResponse(result.text);
        await this.appendToConversation({ role: "assistant", content: result.text });
        await this.compactConversationIfNeeded();
        await this.processAIActions(parsed.narrative, parsed.actions);
      } catch (error) {
        this.broadcast({
          type: "server:error",
          message: error instanceof Error ? error.message : "AI follow-up failed",
          code: "AI_ERROR",
        });
      }
    }
  }

  private async handleCombatAction(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:combat_action" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session?.playerName) {
      this.sendTo(ws, { type: "server:error", message: "Must join room first", code: "NOT_JOINED" });
      return;
    }

    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      this.sendTo(ws, { type: "server:error", message: "Not in active combat", code: "NOT_IN_COMBAT" });
      return;
    }

    // Enforce turn order — only the active combatant's player can act
    const activeId = combat.turnOrder[combat.turnIndex];
    const activeCombatant = combat.combatants[activeId];
    if (activeCombatant?.type === "player" && activeCombatant.playerId !== session.userId) {
      this.sendTo(ws, { type: "server:error", message: "It's not your turn", code: "NOT_YOUR_TURN" });
      return;
    }

    // Treat as a chat message that triggers AI response
    this.broadcast({
      type: "server:chat",
      content: msg.action,
      playerName: session.playerName,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });

    if (this.aiConfig) {
      await this.getAIResponse(session.playerName, msg.action);
    }
  }

  private async handleMoveToken(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:move_token" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session?.playerName) {
      this.sendTo(ws, { type: "server:error", message: "Must join room first", code: "NOT_JOINED" });
      return;
    }

    const combat = this.gameState.encounter?.combat;
    if (!combat || combat.phase !== "active") {
      this.sendTo(ws, { type: "server:error", message: "Not in active combat", code: "NOT_IN_COMBAT" });
      return;
    }

    // Find the player's combatant
    const combatant = Object.values(combat.combatants).find(
      (c) => c.type === "player" && c.playerId === session.userId
    );
    if (!combatant) {
      this.sendTo(ws, { type: "server:error", message: "No combatant found for your character", code: "NO_COMBATANT" });
      return;
    }

    // Verify it's their turn
    const activeId = combat.turnOrder[combat.turnIndex];
    if (activeId !== combatant.id) {
      this.sendTo(ws, { type: "server:error", message: "It's not your turn", code: "NOT_YOUR_TURN" });
      return;
    }

    // Calculate movement distance (simple Manhattan for now)
    const from = combatant.position || { x: 0, y: 0 };
    const dx = Math.abs(msg.to.x - from.x);
    const dy = Math.abs(msg.to.y - from.y);
    const distance = Math.max(dx, dy) * 5; // 5ft per tile

    if (combatant.movementUsed + distance > combatant.speed) {
      this.sendTo(ws, { type: "server:error", message: "Not enough movement remaining", code: "NO_MOVEMENT" });
      return;
    }

    combatant.position = msg.to;
    combatant.movementUsed += distance;

    this.broadcast({
      type: "server:combat_update",
      combat,
      timestamp: Date.now(),
    });

    await this.persistGameState();
  }

  private async handleRollback(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:rollback" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || session.status !== "host") {
      this.sendTo(ws, { type: "server:error", message: "Only the host can rollback", code: "NOT_HOST" });
      return;
    }

    const eventIdx = this.gameState.eventLog.findIndex((e) => e.id === msg.eventId);
    if (eventIdx === -1) {
      this.sendTo(ws, { type: "server:error", message: "Event not found", code: "EVENT_NOT_FOUND" });
      return;
    }

    const event = this.gameState.eventLog[eventIdx];

    // Restore character dynamic data from snapshot
    for (const [userId, snapshot] of Object.entries(event.stateBefore.characters)) {
      const char = this.characters.get(userId);
      if (char) {
        char.dynamic = snapshot as CharacterDynamicData;
      }
    }

    // Restore combatant state if available
    if (event.stateBefore.combatants && this.gameState.encounter?.combat) {
      this.gameState.encounter.combat.combatants = event.stateBefore.combatants;
    }

    // Truncate conversation history
    this.conversationHistory = this.conversationHistory.slice(0, event.conversationIndex);
    await this.ctx.storage.put("conversationHistory", this.conversationHistory);

    // Truncate event log (remove target event + everything after)
    this.gameState.eventLog = this.gameState.eventLog.slice(0, eventIdx);

    // Truncate chat log to messages before event timestamp
    this.chatLog = this.chatLog.filter((msg) => {
      if ("timestamp" in msg) {
        return (msg as { timestamp: number }).timestamp < event.timestamp;
      }
      return true;
    });
    await this.ctx.storage.put("chatLog", this.chatLog);

    // Persist everything
    this.persistCharacters();
    await this.persistGameState();

    // Broadcast rollback with full restored state
    const characterUpdates: Record<string, CharacterData> = {};
    for (const [userId, char] of this.characters) {
      const playerName = this.getPlayerNameByUserId(userId);
      if (playerName) {
        characterUpdates[playerName] = char;
      }
    }

    this.broadcast({
      type: "server:rollback",
      toEventId: msg.eventId,
      gameState: this.gameState,
      characterUpdates,
      timestamp: Date.now(),
    });
  }

  private async handleSetSystemPrompt(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:set_system_prompt" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || session.status !== "host") {
      this.sendTo(ws, { type: "server:error", message: "Only the host can change the system prompt", code: "NOT_HOST" });
      return;
    }

    this.gameState.customSystemPrompt = msg.prompt;
    await this.persistGameState();

    this.broadcast({
      type: "server:system",
      content: msg.prompt ? "System prompt updated." : "System prompt reset to default.",
      timestamp: Date.now(),
    });
  }

  private async handleSetPacing(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:set_pacing" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || session.status !== "host") {
      this.sendTo(ws, { type: "server:error", message: "Only the host can change pacing", code: "NOT_HOST" });
      return;
    }

    this.gameState.pacingProfile = msg.profile;
    this.gameState.encounterLength = msg.encounterLength;
    await this.persistGameState();

    this.broadcast({
      type: "server:system",
      content: `Pacing set to ${msg.profile}, encounter length: ${msg.encounterLength}.`,
      timestamp: Date.now(),
    });
  }

  private async handleDMOverride(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:dm_override" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || session.status !== "host") {
      this.sendTo(ws, { type: "server:error", message: "Only the host can use DM overrides", code: "NOT_HOST" });
      return;
    }

    // Find the character by name
    for (const [userId, char] of this.characters) {
      if (char.static.name.toLowerCase() === msg.characterName.toLowerCase()) {
        // Apply changes manually (trusted from host)
        for (const change of msg.changes) {
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
              char.dynamic.currentHP = Math.min(char.static.maxHP, char.dynamic.currentHP + Math.max(0, change.amount));
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
              char.dynamic.conditions = char.dynamic.conditions.filter((c) => c !== change.condition);
              break;
          }
        }

        this.persistCharacters();

        const playerName = this.getPlayerNameByUserId(userId);
        if (playerName) {
          this.broadcast({
            type: "server:character_updated",
            playerName,
            character: char,
          });
        }
        break;
      }
    }
  }

  /** Compute the modifier for a check based on character data. */
  private computeCheckModifier(
    char: CharacterData,
    check: import("@aidnd/shared/types").CheckRequest
  ): number {
    const s = char.static;

    if (check.type === "skill" && check.skill) {
      const skill = s.skills.find(
        (sk) => sk.name.toLowerCase() === check.skill!.toLowerCase()
      );
      if (skill) {
        return getSkillModifier(skill, s.abilities, s.proficiencyBonus);
      }
    }

    if (check.type === "saving_throw" && check.ability) {
      const save = s.savingThrows.find(
        (sv) => sv.ability === check.ability
      );
      if (save) {
        return getSavingThrowModifier(save, s.abilities, s.proficiencyBonus);
      }
      // Fallback: raw ability modifier
      const abilityKey = check.ability as keyof typeof s.abilities;
      if (s.abilities[abilityKey] !== undefined) {
        return getModifier(s.abilities[abilityKey]);
      }
    }

    if (check.type === "ability" && check.ability) {
      const abilityKey = check.ability as keyof typeof s.abilities;
      if (s.abilities[abilityKey] !== undefined) {
        return getModifier(s.abilities[abilityKey]);
      }
    }

    if (check.type === "attack") {
      // Use spell attack bonus or proficiency + STR/DEX
      if (s.spellAttackBonus !== undefined) {
        return s.spellAttackBonus;
      }
      // Melee: STR + prof, Ranged: DEX + prof
      const strMod = getModifier(s.abilities.strength);
      const dexMod = getModifier(s.abilities.dexterity);
      return Math.max(strMod, dexMod) + s.proficiencyBonus;
    }

    return 0;
  }

  // --- Helpers ---

  private getPlayerNames(): string[] {
    return Array.from(this.sessions.values())
      .filter((s) => s.playerName)
      .map((s) => s.playerName);
  }

  private getHostName(): string {
    return this.hostPlayerName;
  }

  private getRoomCode(): string {
    return this.roomCode;
  }

  private findHostWebSocket(): WebSocket | null {
    for (const [ws, session] of this.sessions.entries()) {
      if (session.status === "host") return ws;
    }
    return null;
  }

  private findSessionByName(
    playerName: string
  ): [WebSocket, SessionData] | null {
    for (const [ws, session] of this.sessions.entries()) {
      if (session.playerName === playerName) return [ws, session];
    }
    return null;
  }

  private findSessionByUserId(
    userId: string
  ): [WebSocket, SessionData] | null {
    for (const [ws, session] of this.sessions.entries()) {
      if (session.userId === userId) return [ws, session];
    }
    return null;
  }

  private sendTo(ws: WebSocket, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }

  private broadcast(message: ServerMessage): void {
    // Persist chat/system/AI messages to storage for replay on join
    if (
      message.type !== "server:player_joined" &&
      message.type !== "server:player_left"
    ) {
      this.appendToChatLog(message);
    }

    const json = JSON.stringify(message);
    for (const [ws, session] of this.sessions.entries()) {
      if (!session.playerName) continue;
      try {
        ws.send(json);
      } catch {
        // WebSocket might be closing
      }
    }
  }

  /** Broadcast to all players except the excluded one */
  private broadcastToApproved(
    message: ServerMessage,
    excluded?: WebSocket
  ): void {
    const json = JSON.stringify(message);
    for (const [ws, session] of this.sessions.entries()) {
      if (ws === excluded) continue;
      if (!session.playerName) continue;
      try {
        ws.send(json);
      } catch {
        // ignore
      }
    }
  }

  /** Get all players (online + offline) with their current status */
  private getAllPlayersWithStatus(): PlayerInfo[] {
    const onlineUserIds = new Set<string>();
    for (const session of this.sessions.values()) {
      if (session.playerName) {
        onlineUserIds.add(session.userId);
      }
    }

    return Array.from(this.allPlayerRecords.entries()).map(([userId, record]) => ({
      name: record.name,
      online: onlineUserIds.has(userId),
      isHost: record.isHost,
    }));
  }

  /** Get characters mapped by player name instead of userId */
  private getCharactersByPlayerName(): Record<string, CharacterData> {
    const result: Record<string, CharacterData> = {};

    // Build userId → playerName map from allPlayerRecords
    for (const [userId, record] of this.allPlayerRecords.entries()) {
      const char = this.characters.get(userId);
      if (char) {
        result[record.name] = char;
      }
    }

    return result;
  }

  /** Look up a player name from userId via allPlayerRecords. */
  private getPlayerNameByUserId(userId: string): string | null {
    const record = this.allPlayerRecords.get(userId);
    return record?.name ?? null;
  }

  /** Persist characters to DO storage */
  private persistCharacters(): void {
    this.ctx.storage.put(
      "characters",
      Object.fromEntries(this.characters.entries())
    );
  }

  /** Persist allPlayerRecords to DO storage */
  private persistAllPlayerRecords(): void {
    this.ctx.storage.put(
      "allPlayerRecords",
      Object.fromEntries(this.allPlayerRecords.entries())
    );
  }
}
