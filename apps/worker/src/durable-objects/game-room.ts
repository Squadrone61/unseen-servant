import { DurableObject } from "cloudflare:workers";
import { clientMessageSchema } from "@aidnd/shared/schemas";
import type {
  AIConfig,
  AuthUser,
  ClientMessage,
  ServerMessage,
} from "@aidnd/shared/types";
import { getProvider, MAX_PLAYERS_PER_ROOM } from "@aidnd/shared";
import { callAI } from "../services/ai-service";
import { verifyJWT } from "../auth/jwt";
import { DM_SYSTEM_PROMPT } from "../prompts/dm-system";
import type { Env } from "../types";

type PlayerStatus = "host" | "approved" | "pending";

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
        if (attachment.status === "host" || attachment.status === "approved") {
          this.approvedUserIds.add(attachment.userId);
        }
      }
    }

    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );

    // Load persisted state from storage
    this.ctx.blockConcurrencyWhile(async () => {
      const [chatLog, conversationHistory, aiConfig, roomCode, hostPlayerName] =
        await Promise.all([
          this.ctx.storage.get<ServerMessage[]>("chatLog"),
          this.ctx.storage.get<ConversationMessage[]>("conversationHistory"),
          this.ctx.storage.get<AIConfig>("aiConfig"),
          this.ctx.storage.get<string>("roomCode"),
          this.ctx.storage.get<string>("hostPlayerName"),
        ]);
      if (chatLog) this.chatLog = chatLog;
      if (conversationHistory) this.conversationHistory = conversationHistory;
      if (aiConfig) this.aiConfig = aiConfig;
      if (roomCode) this.roomCode = roomCode;
      if (hostPlayerName) this.hostPlayerName = hostPlayerName;
      this.storageLoaded = true;
    });
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

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    const tempSession: SessionData = {
      playerName: "",
      userId: "",
      status: "pending",
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
      case "client:approve_join":
        await this.handleApproveJoin(ws, msg);
        break;
      case "client:reject_join":
        await this.handleRejectJoin(ws, msg);
        break;
      case "client:kick_player":
        await this.handleKickPlayer(ws, msg);
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

    if (session?.playerName && session.status !== "pending") {
      this.broadcast({
        type: "server:player_left",
        playerName: session.playerName,
        players: this.getPlayerNames(),
        hostName: this.getHostName(),
      });
      this.broadcast({
        type: "server:system",
        content: `${session.playerName} has left the room.`,
        timestamp: Date.now(),
      });
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

    // Check room capacity (only count non-pending players)
    if (this.getPlayerNames().length >= MAX_PLAYERS_PER_ROOM) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Room is full",
        code: "ROOM_FULL",
      });
      return;
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

    // Determine player status
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
    } else if (this.approvedUserIds.has(userId)) {
      // Previously approved player reconnecting
      status = "approved";
    } else {
      // New player — needs host approval
      status = "pending";
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

    if (status === "pending") {
      // Send pending notice to the player
      this.sendTo(ws, {
        type: "server:join_pending",
        roomCode: msg.roomCode,
      });

      // Notify the host about the join request
      const hostWs = this.findHostWebSocket();
      if (hostWs) {
        this.sendTo(hostWs, {
          type: "server:join_request",
          playerName: msg.playerName,
          avatarUrl,
        });
      } else {
        // Host is offline — let the pending player know
        this.sendTo(ws, {
          type: "server:system",
          content:
            "The host is currently offline. You'll be admitted when they return.",
          timestamp: Date.now(),
        });
      }
      return;
    }

    // Player is approved (host, reconnect, or auto-approved)
    this.completeJoin(ws, session, msg.roomCode, isReconnect, authUser);
  }

  private completeJoin(
    ws: WebSocket,
    session: SessionData,
    roomCode: string,
    isReconnect: boolean,
    authUser?: AuthUser
  ): void {
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
    });

    // Replay full chat log so joining/reconnecting players see all history
    if (this.chatLog.length > 0) {
      for (const msg of this.chatLog) {
        this.sendTo(ws, msg);
      }
    }

    this.broadcastToApproved(
      {
        type: "server:player_joined",
        playerName: session.playerName,
        players: this.getPlayerNames(),
        hostName: this.getHostName(),
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

    if (this.aiConfig && this.conversationHistory.length === 0 && !isReconnect) {
      this.sendAIGreeting();
    }

    // If the host just reconnected, notify them about any pending players
    if (session.status === "host") {
      for (const [, pendingSession] of this.sessions.entries()) {
        if (pendingSession.status === "pending" && pendingSession.playerName) {
          this.sendTo(ws, {
            type: "server:join_request",
            playerName: pendingSession.playerName,
            avatarUrl: pendingSession.avatarUrl,
          });
        }
      }
    }
  }

  private async handleApproveJoin(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:approve_join" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || session.status !== "host") {
      this.sendTo(ws, {
        type: "server:error",
        message: "Only the host can approve players",
        code: "NOT_HOST",
      });
      return;
    }

    const pendingEntry = this.findPendingSession(msg.playerName);
    if (!pendingEntry) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Player not found in pending list",
        code: "PLAYER_NOT_FOUND",
      });
      return;
    }

    const [pendingWs, pendingSession] = pendingEntry;

    // Approve the player
    pendingSession.status = "approved";
    this.approvedUserIds.add(pendingSession.userId);
    pendingWs.serializeAttachment(pendingSession);
    this.sessions.set(pendingWs, pendingSession);

    // Extract roomCode from session or derive from context
    const roomCode = this.getRoomCode();
    this.completeJoin(pendingWs, pendingSession, roomCode, false);
  }

  private async handleRejectJoin(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:reject_join" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session || session.status !== "host") {
      this.sendTo(ws, {
        type: "server:error",
        message: "Only the host can reject players",
        code: "NOT_HOST",
      });
      return;
    }

    const pendingEntry = this.findPendingSession(msg.playerName);
    if (!pendingEntry) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Player not found in pending list",
        code: "PLAYER_NOT_FOUND",
      });
      return;
    }

    const [pendingWs] = pendingEntry;

    this.sendTo(pendingWs, {
      type: "server:error",
      message: "Your join request was rejected by the host",
      code: "REJECTED",
    });

    this.sessions.delete(pendingWs);
    try {
      pendingWs.close(4001, "Join request rejected");
    } catch {
      // Already closed
    }
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
    });

    this.broadcast({
      type: "server:system",
      content: `${msg.playerName} was kicked from the room.`,
      timestamp: Date.now(),
    });
  }

  private async handleChat(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:chat" }>
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session?.playerName || session.status === "pending") {
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
      await this.getAIResponse(session.playerName, msg.content);
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

    if (
      this.getPlayerNames().length > 0 &&
      this.conversationHistory.length === 0
    ) {
      await this.sendAIGreeting();
    }
  }

  // --- AI ---

  private async sendAIGreeting(): Promise<void> {
    if (!this.aiConfig) return;

    const provider = getProvider(this.aiConfig.provider);
    const providerName = provider?.name ?? this.aiConfig.provider;

    try {
      const playerNames = this.getPlayerNames().join(", ");
      const userMsg = `The adventuring party has gathered: ${playerNames}. Set the scene!`;

      const result = await callAI({
        aiConfig: this.aiConfig,
        systemPrompt: DM_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }],
      });

      await this.appendToConversation(
        { role: "user", content: `[Party gathered: ${playerNames}]` },
        { role: "assistant", content: result.text }
      );

      this.broadcast({
        type: "server:ai",
        content: result.text,
        timestamp: Date.now(),
        id: crypto.randomUUID(),
      });
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

    const userMessage = `[${playerName}]: ${content}`;
    await this.appendToConversation({ role: "user", content: userMessage });

    try {
      const result = await callAI({
        aiConfig: this.aiConfig,
        systemPrompt: DM_SYSTEM_PROMPT,
        messages: this.conversationHistory,
      });

      await this.appendToConversation({
        role: "assistant",
        content: result.text,
      });

      this.broadcast({
        type: "server:ai",
        content: result.text,
        timestamp: Date.now(),
        id: crypto.randomUUID(),
      });
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

  // --- Helpers ---

  private getPlayerNames(): string[] {
    return Array.from(this.sessions.values())
      .filter((s) => s.playerName && s.status !== "pending")
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

  private findPendingSession(
    playerName: string
  ): [WebSocket, SessionData] | null {
    for (const [ws, session] of this.sessions.entries()) {
      if (session.playerName === playerName && session.status === "pending") {
        return [ws, session];
      }
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
      // Only send to approved/host players, not pending
      if (session.status === "pending") continue;
      try {
        ws.send(json);
      } catch {
        // WebSocket might be closing
      }
    }
  }

  /** Broadcast to all approved players except the excluded one */
  private broadcastToApproved(
    message: ServerMessage,
    excluded?: WebSocket
  ): void {
    const json = JSON.stringify(message);
    for (const [ws, session] of this.sessions.entries()) {
      if (ws === excluded) continue;
      if (session.status === "pending") continue;
      try {
        ws.send(json);
      } catch {
        // ignore
      }
    }
  }
}
