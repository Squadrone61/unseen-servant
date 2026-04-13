import { DurableObject } from "cloudflare:workers";
import { clientMessageSchema } from "@unseen-servant/shared/schemas";
import type {
  AuthUser,
  CharacterData,
  ClientChatMessage,
  ClientMessage,
  DMBridgeConfig,
  PlayerInfo,
  ServerMessage,
} from "@unseen-servant/shared/types";
import { MAX_PLAYERS_PER_ROOM } from "@unseen-servant/shared";
import { verifyJWT } from "../auth/jwt";
import type { Env, RoomMeta } from "../types";

type PlayerStatus = "host" | "player";

interface SessionData {
  playerName: string;
  userId: string;
  avatarUrl?: string;
  status: PlayerStatus;
  joinedAt: number;
  isDM: boolean;
}

interface PlayerRecord {
  name: string;
  isHost: boolean;
}

export class GameRoom extends DurableObject<Env> {
  private sessions: Map<WebSocket, SessionData> = new Map();
  private dmBridgeConfig: DMBridgeConfig | null = null;
  private hostUserId: string | null = null;
  private hostPlayerName: string = "";
  private approvedUserIds: Set<string> = new Set();
  private chatLog: ServerMessage[] = [];
  private roomCode: string = "";
  private allPlayerRecords: Map<string, PlayerRecord> = new Map(); // keyed by userId
  private storyStarted: boolean = false;
  private password: string | null = null;
  private created: boolean = false;
  private createdAt: number = 0;
  private campaignConfigured: boolean = false;
  private activeCampaignSlug: string | null = null;
  private activeCampaignName: string | null = null;
  private characters: Map<string, CharacterData> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SessionData | undefined;
      if (attachment) {
        this.sessions.set(ws, attachment);
        if (attachment.status === "host") {
          this.hostUserId = attachment.userId;
        }
        if (attachment.status === "host" || attachment.status === "player") {
          this.approvedUserIds.add(attachment.userId);
        }
      }
    }

    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));

    this.ctx.blockConcurrencyWhile(async () => {
      const [
        roomCode,
        hostPlayerName,
        allPlayerRecords,
        created,
        password,
        createdAt,
        approvedUserIds,
        characters,
      ] = await Promise.all([
        this.ctx.storage.get<string>("roomCode"),
        this.ctx.storage.get<string>("hostPlayerName"),
        this.ctx.storage.get<Record<string, PlayerRecord>>("allPlayerRecords"),
        this.ctx.storage.get<boolean>("created"),
        this.ctx.storage.get<string>("password"),
        this.ctx.storage.get<number>("createdAt"),
        this.ctx.storage.get<string[]>("approvedUserIds"),
        this.ctx.storage.get<Record<string, CharacterData>>("characters"),
      ]);
      if (roomCode) this.roomCode = roomCode;
      if (hostPlayerName) this.hostPlayerName = hostPlayerName;
      if (allPlayerRecords) this.allPlayerRecords = new Map(Object.entries(allPlayerRecords));
      if (created) this.created = created;
      if (password) this.password = password;
      if (createdAt) this.createdAt = createdAt;
      // Merge persisted approvedUserIds with any active session userIds already added above
      if (approvedUserIds) {
        for (const id of approvedUserIds) {
          this.approvedUserIds.add(id);
        }
      }
      if (characters) {
        this.characters = new Map(Object.entries(characters));
      }
    });
  }

  // --- Room Metadata ---

  private async updateRoomMeta(): Promise<void> {
    if (!this.roomCode) return;
    const playerCount = this.getPlayerNames().length;
    const meta: RoomMeta = {
      roomCode: this.roomCode,
      hostName: this.hostPlayerName,
      playerCount,
      hasPassword: this.password !== null,
      createdAt: this.createdAt,
    };
    try {
      const ttl = playerCount === 0 ? 300 : 86400 * 7;
      await this.env.ROOMS.put(`room:${this.roomCode}`, JSON.stringify(meta), {
        expirationTtl: ttl,
      });
    } catch (e) {
      console.error("Failed to update room meta:", e);
    }
  }

  private appendToChatLog(message: ServerMessage): void {
    this.chatLog.push(message);
  }

  // --- HTTP & WebSocket Entry ---

  async fetch(request: Request): Promise<Response> {
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
      isDM: false,
    };
    server.serializeAttachment(tempSession);
    this.sessions.set(server, tempSession);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
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
      case "client:dm_config": {
        this.dmBridgeConfig = { provider: msg.provider, supportsTools: msg.supportsTools };
        const campaignInfo = this.activeCampaignName
          ? ` Campaign: ${this.activeCampaignName}.`
          : "";
        this.broadcast({
          type: "server:system",
          content: `DM connected (${msg.provider}). The Unseen Servant is ready!${campaignInfo}`,
          timestamp: Date.now(),
        });
        this.broadcast({
          type: "server:dm_config_update",
          provider: msg.provider,
          supportsTools: msg.supportsTools,
          campaigns: msg.campaigns,
        });
        break;
      }
      case "client:campaign_loaded": {
        this.activeCampaignSlug = msg.campaignSlug;
        this.activeCampaignName = msg.campaignName;
        this.broadcast({
          type: "server:campaign_loaded",
          campaignSlug: msg.campaignSlug,
          campaignName: msg.campaignName,
          sessionCount: msg.sessionCount,
        });
        break;
      }
      case "client:campaign_configured_ack":
        await this.handleCampaignConfiguredAck(ws, msg);
        break;
      case "client:story_started":
        this.storyStarted = true;
        break;
      case "client:set_password":
        await this.handleSetPassword(ws, msg);
        break;
      case "client:kick_player":
        await this.handleKickPlayer(ws, msg);
        break;
      case "client:destroy_room":
        await this.handleDestroyRoom(ws);
        break;
      case "client:broadcast":
        await this.handleBroadcast(ws, msg);
        break;
      case "client:action_result":
        // Bridge acknowledges a forwarded action — currently no-op
        break;

      // --- Forwarded to bridge ---
      case "client:set_character":
        await this.handleSetCharacter(ws, msg);
        break;
      case "client:typing": {
        const session = this.sessions.get(ws);
        if (session?.playerName) {
          this.broadcastToApproved(
            {
              type: "server:typing",
              playerName: session.playerName,
              isTyping: msg.isTyping,
            },
            ws,
          );
        }
        break;
      }
      case "client:chat":
        // Broadcast chat to all players immediately (no bridge needed)
        await this.handleChat(ws, msg);
        // Also forward to bridge for AI processing (if connected)
        this.forwardToBridgeIfAvailable(ws, msg);
        break;
      case "client:start_story":
      case "client:roll_dice":
      case "client:combat_action":
      case "client:move_token":
      case "client:end_turn":
      case "client:rollback":
      case "client:set_system_prompt":
      case "client:set_pacing":
      case "client:dm_override":
      case "client:set_campaign":
      case "client:configure_campaign":
      case "client:save_notes":
        this.forwardToBridge(ws, msg);
        break;

      // These are bridge→server messages handled directly by bridge now
      case "client:dm_response":
      case "client:dm_dice_roll":
      case "client:dm_check_request":
      case "client:dm_check_result":
        // Legacy: no longer processed by worker — bridge handles internally
        break;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string): Promise<void> {
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);
    // Codes 1005 and 1006 are internal browser sentinels — not valid to pass
    // to ws.close(). Normalize to 1000 (normal closure) to avoid a runtime error.
    const safeCode = code === 1005 || code === 1006 ? 1000 : code;
    ws.close(safeCode, "Connection closed");

    if (session?.playerName) {
      // Clear DM bridge config when DM disconnects
      if (session.isDM) {
        this.dmBridgeConfig = null;
      }

      this.broadcast({
        type: "server:player_left",
        playerName: session.playerName,
        players: this.getPlayerNames(),
        hostName: this.getHostName(),
        allPlayers: this.getAllPlayersWithStatus(),
        isDM: session.isDM || undefined,
      });
      this.broadcast({
        type: "server:system",
        content: `${session.playerName} has disconnected.`,
        timestamp: Date.now(),
      });

      // Notify bridge of player leaving (only if it wasn't the bridge itself)
      if (!session.isDM) {
        this.forwardToBridgeDirect({
          type: "server:player_left",
          playerName: session.playerName,
          players: this.getPlayerNames(),
          hostName: this.getHostName(),
          allPlayers: this.getAllPlayersWithStatus(),
        });
      }

      this.updateRoomMeta();
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);
    console.error("WebSocket error:", error, "Player:", session?.playerName);

    if (session?.playerName) {
      // Mirror cleanup from webSocketClose — clear DM state, notify players
      if (session.isDM) {
        this.dmBridgeConfig = null;
      }

      this.broadcast({
        type: "server:player_left",
        playerName: session.playerName,
        players: this.getPlayerNames(),
        hostName: this.getHostName(),
        allPlayers: this.getAllPlayersWithStatus(),
        isDM: session.isDM || undefined,
      });
      this.broadcast({
        type: "server:system",
        content: `${session.playerName} has disconnected.`,
        timestamp: Date.now(),
      });

      if (!session.isDM) {
        this.forwardToBridgeDirect({
          type: "server:player_left",
          playerName: session.playerName,
          players: this.getPlayerNames(),
          hostName: this.getHostName(),
          allPlayers: this.getAllPlayersWithStatus(),
        });
      }

      this.updateRoomMeta();
    }
  }

  // --- Bridge Relay ---

  /**
   * Forward a player's action to the DM bridge as server:player_action.
   * The bridge handles all game logic and broadcasts results via client:broadcast.
   */
  private forwardToBridge(ws: WebSocket, msg: ClientMessage): void {
    const session = this.sessions.get(ws);
    if (!session?.playerName) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Must join room first",
        code: "NOT_JOINED",
      });
      return;
    }

    const dmWs = this.findDMBridgeWebSocket();
    if (!dmWs) {
      this.sendTo(ws, {
        type: "server:error",
        message: "DM bridge not connected",
        code: "NO_DM",
      });
      return;
    }

    const requestId = crypto.randomUUID();
    try {
      dmWs.send(
        JSON.stringify({
          type: "server:player_action",
          playerName: session.playerName,
          userId: session.userId,
          action: msg,
          requestId,
        }),
      );
    } catch {
      this.sendTo(ws, {
        type: "server:error",
        message: "Failed to send to DM bridge — it may have disconnected",
        code: "DM_SEND_FAILED",
      });
    }
  }

  /**
   * Broadcast a chat message to all players and persist to chat log.
   */
  private async handleChat(ws: WebSocket, msg: ClientChatMessage): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session?.playerName) return;

    const chatMsg: ServerMessage = {
      type: "server:chat",
      content: msg.content,
      playerName: session.playerName,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    };
    this.broadcast(chatMsg);
  }

  /**
   * Forward to bridge if connected, silently skip if not.
   */
  private forwardToBridgeIfAvailable(ws: WebSocket, msg: ClientMessage): void {
    const session = this.sessions.get(ws);
    if (!session?.playerName) return;
    const dmWs = this.findDMBridgeWebSocket();
    if (!dmWs) return;
    const requestId = crypto.randomUUID();
    try {
      dmWs.send(
        JSON.stringify({
          type: "server:player_action",
          playerName: session.playerName,
          userId: session.userId,
          action: msg,
          requestId,
        }),
      );
    } catch {
      // Bridge disconnected — chat still works
    }
  }

  /**
   * Send a raw ServerMessage directly to the bridge WebSocket (not wrapped).
   */
  private forwardToBridgeDirect(msg: ServerMessage): void {
    const dmWs = this.findDMBridgeWebSocket();
    if (dmWs) {
      try {
        dmWs.send(JSON.stringify(msg));
      } catch {
        // DM bridge WebSocket may have closed
      }
    }
  }

  /**
   * Handle client:broadcast from the DM bridge.
   * Validates sender is DM, extracts payload, broadcasts to targets.
   */
  private async handleBroadcast(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:broadcast" }>,
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session?.isDM) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Only the DM bridge can broadcast",
        code: "NOT_DM",
      });
      return;
    }

    const payload = msg.payload as ServerMessage;

    // Keep the worker's character cache in sync with bridge-originated updates
    // (HP changes, level-ups, item equips, etc.). This is what lets us seed a
    // reconnecting bridge or a reconnecting client with the current sheet.
    if (payload.type === "server:character_updated") {
      this.characters.set(payload.playerName, payload.character);
      void this.persistCharacters();
    }

    if (msg.targets && msg.targets.length > 0) {
      // Send only to named players
      const json = JSON.stringify(payload);
      for (const [clientWs, clientSession] of this.sessions.entries()) {
        if (msg.targets.includes(clientSession.playerName)) {
          try {
            clientWs.send(json);
          } catch {
            // WebSocket might be closing
          }
        }
      }
      // Still persist chat messages
      if (payload.type !== "server:player_joined" && payload.type !== "server:player_left") {
        this.appendToChatLog(payload);
      }
    } else {
      // Broadcast to all
      this.broadcast(payload);
    }
  }

  // --- Join Handler ---

  private async handleJoin(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:join" }>,
  ): Promise<void> {
    if (!this.created) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Room does not exist",
        code: "ROOM_NOT_FOUND",
      });
      ws.close(4004, "Room not found");
      return;
    }

    if (!this.roomCode) {
      this.roomCode = msg.roomCode;
      this.ctx.storage.put("roomCode", this.roomCode);
    }

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
        userId = msg.guestId || `guest_${crypto.randomUUID().slice(0, 8)}`;
      }
    } else {
      userId = msg.guestId || `guest_${crypto.randomUUID().slice(0, 8)}`;
    }

    if (this.getPlayerNames().length >= MAX_PLAYERS_PER_ROOM) {
      this.sendTo(ws, {
        type: "server:error",
        message: "Room is full",
        code: "ROOM_FULL",
      });
      return;
    }

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

    if (this.getPlayerNames().includes(msg.playerName)) {
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

    let status: PlayerStatus;
    const isReconnect = this.approvedUserIds.has(userId) || this.hostUserId === userId;

    if (!this.hostUserId) {
      status = "host";
      this.hostUserId = userId;
      this.hostPlayerName = msg.playerName;
      this.approvedUserIds.add(userId);
      this.ctx.storage.put("hostPlayerName", this.hostPlayerName);
      this.ctx.storage.put("approvedUserIds", Array.from(this.approvedUserIds));
    } else if (this.hostUserId === userId) {
      status = "host";
      this.hostPlayerName = msg.playerName;
      this.ctx.storage.put("hostPlayerName", this.hostPlayerName);
    } else {
      status = "player";
      this.approvedUserIds.add(userId);
      this.ctx.storage.put("approvedUserIds", Array.from(this.approvedUserIds));
    }

    const session: SessionData = {
      playerName: msg.playerName,
      userId,
      avatarUrl,
      status,
      joinedAt: Date.now(),
      isDM: msg.isDM ?? false,
    };
    ws.serializeAttachment(session);
    this.sessions.set(ws, session);

    await this.completeJoin(ws, session, msg.roomCode, isReconnect, authUser);
  }

  private async completeJoin(
    ws: WebSocket,
    session: SessionData,
    roomCode: string,
    isReconnect: boolean,
    authUser?: AuthUser,
  ): Promise<void> {
    if (!this.allPlayerRecords.has(session.userId) && !session.isDM) {
      this.allPlayerRecords.set(session.userId, {
        name: session.playerName,
        isHost: session.status === "host",
      });
      await this.persistAllPlayerRecords();
    }

    this.sendTo(ws, {
      type: "server:room_joined",
      roomCode,
      players: this.getPlayerNames(),
      hostName: this.getHostName(),
      isHost: session.status === "host",
      isReconnect,
      user: authUser,
      allPlayers: this.getAllPlayersWithStatus(),
      storyStarted: this.storyStarted,
      dmConnected: this.dmBridgeConfig !== null,
      campaignConfigured: this.campaignConfigured || undefined,
      activeCampaignSlug: this.activeCampaignSlug ?? undefined,
      activeCampaignName: this.activeCampaignName ?? undefined,
      characters: this.characters.size > 0 ? this.charactersAsRecord() : undefined,
    });

    // Replay chat log
    if (this.chatLog.length > 0) {
      for (const msg of this.chatLog) {
        this.sendTo(ws, msg);
      }
    }

    // Notify bridge so it can send game_state_sync
    if (!session.isDM) {
      this.forwardToBridgeDirect({
        type: "server:player_joined",
        playerName: session.playerName,
        players: this.getPlayerNames(),
        hostName: this.getHostName(),
        allPlayers: this.getAllPlayersWithStatus(),
      });
    } else {
      // Bridge just connected — flush every cached character so the
      // GameStateManager is fully seeded, even for players who set their
      // character before the bridge was online (e.g. the host).
      this.flushCharactersToBridge();
    }

    this.broadcastToApproved(
      {
        type: "server:player_joined",
        playerName: session.playerName,
        players: this.getPlayerNames(),
        hostName: this.getHostName(),
        allPlayers: this.getAllPlayersWithStatus(),
        isDM: session.isDM || undefined,
      },
      ws,
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

    this.updateRoomMeta();
  }

  // --- Campaign Config Ack ---

  private async handleCampaignConfiguredAck(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:campaign_configured_ack" }>,
  ): Promise<void> {
    this.campaignConfigured = true;
    this.activeCampaignSlug = msg.campaignSlug;
    this.activeCampaignName = msg.campaignName;

    this.broadcast({
      type: "server:campaign_configured",
      campaignName: msg.campaignName,
      campaignSlug: msg.campaignSlug,
      pacingProfile: msg.pacingProfile,
      encounterLength: msg.encounterLength,
      systemPrompt: msg.systemPrompt,
      restoredCharacters: msg.restoredCharacters,
    } as ServerMessage);

    this.broadcast({
      type: "server:system",
      content: `Campaign "${msg.campaignName}" configured.`,
      timestamp: Date.now(),
    });
  }

  // --- Room Management (kept in worker) ---

  private async handleSetPassword(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:set_password" }>,
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
      content: this.password ? "Room password has been set." : "Room password has been removed.",
      timestamp: Date.now(),
    });
  }

  private async handleKickPlayer(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:kick_player" }>,
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

    this.approvedUserIds.delete(targetSession.userId);
    this.ctx.storage.put("approvedUserIds", Array.from(this.approvedUserIds));

    this.sendTo(targetWs, {
      type: "server:kicked",
      reason: "You were kicked by the host",
    });

    this.sessions.delete(targetWs);

    this.allPlayerRecords.delete(targetSession.userId);
    await this.persistAllPlayerRecords();

    if (this.characters.delete(targetSession.playerName)) {
      await this.persistCharacters();
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

    this.broadcast({ type: "server:room_destroyed" });

    for (const [clientWs] of this.sessions) {
      try {
        clientWs.close(1000, "Room destroyed");
      } catch {
        // Already closed
      }
    }

    try {
      await this.env.ROOMS.delete(`room:${this.roomCode}`);
    } catch {
      // ignore
    }

    await this.ctx.storage.deleteAll();

    this.sessions.clear();
    this.dmBridgeConfig = null;
    this.hostUserId = null;
    this.hostPlayerName = "";
    this.approvedUserIds.clear();
    this.chatLog = [];
    this.roomCode = "";
    this.allPlayerRecords.clear();
    this.characters.clear();
    this.storyStarted = false;
    this.created = false;
    this.password = null;
    this.createdAt = 0;
  }

  // --- Character Handler ---

  private async handleSetCharacter(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "client:set_character" }>,
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

    // Cache latest character for this player — used to seed the bridge on connect
    // and to serve reconnecting clients in server:room_joined.
    this.characters.set(session.playerName, msg.character);
    await this.persistCharacters();

    // Forward to bridge if connected; otherwise the flush on bridge connect
    // will deliver it. No NO_DM error — this message is tolerated any time.
    const dmWs = this.findDMBridgeWebSocket();
    if (dmWs) {
      this.sendCharacterToBridge(session.playerName, msg.character);
    }
  }

  // --- Helpers ---

  private findDMBridgeWebSocket(): WebSocket | null {
    for (const [ws, session] of this.sessions.entries()) {
      if (session.isDM) return ws;
    }
    return null;
  }

  private getPlayerNames(): string[] {
    return Array.from(this.sessions.values())
      .filter((s) => s.playerName && !s.isDM)
      .map((s) => s.playerName);
  }

  private getHostName(): string {
    return this.hostPlayerName;
  }

  private findSessionByName(playerName: string): [WebSocket, SessionData] | null {
    for (const [ws, session] of this.sessions.entries()) {
      if (session.playerName === playerName) return [ws, session];
    }
    return null;
  }

  private findSessionByUserId(userId: string): [WebSocket, SessionData] | null {
    for (const [ws, session] of this.sessions.entries()) {
      if (session.userId === userId) return [ws, session];
    }
    return null;
  }

  private sendTo(ws: WebSocket, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }

  private broadcast(message: ServerMessage): void {
    // Ensure system messages have an id for client-side deduplication
    if (message.type === "server:system" && !message.id) {
      message.id = crypto.randomUUID();
    }

    if (message.type !== "server:player_joined" && message.type !== "server:player_left") {
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

  private broadcastToApproved(message: ServerMessage, excluded?: WebSocket): void {
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

  private async persistAllPlayerRecords(): Promise<void> {
    try {
      await this.ctx.storage.put(
        "allPlayerRecords",
        Object.fromEntries(this.allPlayerRecords.entries()),
      );
    } catch (e) {
      console.error("Failed to persist allPlayerRecords:", e);
    }
  }

  private async persistCharacters(): Promise<void> {
    try {
      await this.ctx.storage.put("characters", Object.fromEntries(this.characters.entries()));
    } catch (e) {
      console.error("Failed to persist characters:", e);
    }
  }

  private charactersAsRecord(): Record<string, CharacterData> {
    return Object.fromEntries(this.characters.entries());
  }

  private sendCharacterToBridge(playerName: string, character: CharacterData): void {
    const dmWs = this.findDMBridgeWebSocket();
    if (!dmWs) return;
    const session = this.findSessionByName(playerName);
    const userId = session?.[1].userId ?? "";
    try {
      dmWs.send(
        JSON.stringify({
          type: "server:player_action",
          playerName,
          userId,
          action: { type: "client:set_character", character },
          requestId: crypto.randomUUID(),
        }),
      );
    } catch {
      // bridge may have closed — cache still intact for next connect
    }
  }

  private flushCharactersToBridge(): void {
    for (const [playerName, character] of this.characters.entries()) {
      this.sendCharacterToBridge(playerName, character);
    }
  }
}
