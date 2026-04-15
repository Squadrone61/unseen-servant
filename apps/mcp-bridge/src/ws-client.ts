import WebSocket from "ws";
import { log } from "./logger.js";
import type { MessageQueue } from "./message-queue.js";
import type { CampaignManager } from "./services/campaign-manager.js";
import type { GameLogger } from "./services/game-logger.js";
import { GameStateManager, type SessionStateSnapshot } from "./services/game-state-manager.js";
import { getHP, getAC } from "@unseen-servant/shared/character";
import type { PlayerSummary } from "./types.js";
import type {
  ClientMessage,
  ServerMessage,
  CharacterData,
  CheckResult,
  PlayerInfo,
  RollResult,
} from "@unseen-servant/shared/types";

interface WSClientOptions {
  workerUrl: string;
  roomCode: string;
  messageQueue: MessageQueue;
  campaignManager: CampaignManager;
  gameLogger: GameLogger;
}

export class WSClient {
  private ws: WebSocket | null = null;
  private options: WSClientOptions;
  private reconnectAttempts = 0;
  private closed = false;
  private wasDisconnected = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPongAt = 0;

  /** Latest player list from room_joined / player_joined / player_left */
  players: PlayerSummary[] = [];
  /** Mapping of playerName → userId for stable identity across sessions */
  playerUserIds: Record<string, string> = {};
  /** Whether the DM config has been sent */
  private configSent = false;

  connected = false;
  storyStarted = false;

  /** Game state manager — owns all game state */
  gameStateManager: GameStateManager;
  gameLogger: GameLogger;

  constructor(options: WSClientOptions) {
    this.options = options;
    this.gameLogger = options.gameLogger;

    this.gameStateManager = new GameStateManager({
      broadcast: (msg, targets) => this.broadcastViaWorker(msg, targets),
      messageQueue: options.messageQueue,
      campaignManager: options.campaignManager,
      gameLogger: options.gameLogger,
    });
  }

  connect(): void {
    if (this.closed) return;

    const wsUrl = this.options.workerUrl.replace(/^http/, "ws").replace(/\/$/, "");
    const url = `${wsUrl}/api/rooms/${this.options.roomCode}/ws`;

    log("ws-client", `Connecting to ${url}...`);
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      log(
        "ws-client",
        `Failed to create WebSocket: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      log("ws-client", "WebSocket open, joining room as DM...");
      this.reconnectAttempts = 0;
      this.lastPongAt = Date.now();
      this.send({
        type: "client:join",
        playerName: "DM",
        roomCode: this.options.roomCode,
        guestId: "unseen-servant-bridge",
        isDM: true,
      });

      // Start heartbeat: ping every 30s, terminate if no pong in 60s
      this.clearPingInterval();
      this.pingInterval = setInterval(() => {
        if (Date.now() - this.lastPongAt > 60_000) {
          log("ws-client", "No pong received in 60s, terminating connection...");
          this.ws?.terminate();
          return;
        }
        try {
          this.ws?.ping();
        } catch {
          // WebSocket may be closing
        }
      }, 30_000);
    });

    this.ws.on("pong", () => {
      this.lastPongAt = Date.now();
    });

    this.ws.on("message", (data) => {
      try {
        const raw = JSON.parse(data.toString());

        // Handle relayed client:set_campaign from worker
        if (raw.type === "client:set_campaign") {
          this.handleSetCampaign(raw);
          return;
        }

        // Handle relayed client:configure_campaign from worker
        if (raw.type === "client:configure_campaign") {
          this.handleConfigureCampaign(raw);
          return;
        }

        // Handle character forwarding for campaign persistence
        if (raw.type === "server:character_for_campaign") {
          this.handleCharacterForCampaign(raw);
          return;
        }

        // Handle player action forwarded from worker
        if (raw.type === "server:player_action") {
          this.handlePlayerAction(raw);
          return;
        }

        const msg = raw as ServerMessage;
        this.handleMessage(msg);
      } catch (e) {
        // Only ignore JSON parse errors (non-JSON messages like "pong")
        if (e instanceof SyntaxError) return;
        const errMsg = e instanceof Error ? e.message : String(e);
        log("ws-client", `Message handler error: ${errMsg}`);
        this.broadcastError("BRIDGE_HANDLER_EXCEPTION", `DM bridge error: ${errMsg}`);
      }
    });

    this.ws.on("close", (code, reason) => {
      log("ws-client", `Disconnected: ${code} ${reason.toString()}`);
      this.gameLogger.error("ws-client", `WebSocket disconnected: ${code}`);
      this.connected = false;
      this.configSent = false;
      this.wasDisconnected = true;
      this.clearPingInterval();
      this.options.messageQueue.rejectAllWaiters();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      log("ws-client", `Error: ${err.message}`);
      // Terminate to trigger close→reconnect flow instead of silently hanging
      this.ws?.terminate();
    });
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "server:room_joined": {
        this.connected = true;
        this.storyStarted = msg.storyStarted ?? false;
        this.gameStateManager.storyStarted = this.storyStarted;
        this.gameStateManager.hostName = msg.hostName;

        const isWsReconnect = this.wasDisconnected;
        if (isWsReconnect) {
          log("ws-client", `Reconnected successfully after ${this.reconnectAttempts} attempts`);
          this.gameLogger.system("Reconnected to room");
          this.broadcastViaWorker({
            type: "server:system",
            content: "DM has reconnected. Resuming session.",
            timestamp: Date.now(),
          });
          this.gameStateManager.broadcastGameStateSync();
          this.wasDisconnected = false;
        }

        log(
          "ws-client",
          `Joined room ${msg.roomCode} as DM (host: ${msg.hostName}, players: ${msg.players.join(", ")})`,
        );

        // Store initial character data (bridge is source of truth)
        if (msg.characters) {
          Object.assign(this.gameStateManager.characters, msg.characters);
        }

        // Build initial player list
        if (msg.allPlayers) {
          this.updatePlayers(msg.allPlayers);
          this.gameStateManager.playerNames = msg.allPlayers
            .filter((p) => !p.isDM)
            .map((p) => p.name);
        }

        // Send DM config to announce the bridge with campaign list
        if (!this.configSent) {
          const campaigns = this.options.campaignManager.listCampaigns();
          this.send({
            type: "client:dm_config",
            provider: "claude-code-mcp",
            supportsTools: true,
            campaigns: campaigns.length > 0 ? campaigns : undefined,
          });
          this.configSent = true;
        }

        // Auto-restore session state from campaign files on fresh connect only.
        // On WS reconnect the in-memory state is still valid — skip file restore
        // to avoid overwriting live conversation history with stale data.
        if (msg.activeCampaignSlug && msg.storyStarted && !isWsReconnect) {
          this.restoreSessionFromCampaign(msg.activeCampaignSlug);
        }
        break;
      }

      case "server:player_joined": {
        if (msg.allPlayers) {
          this.updatePlayers(msg.allPlayers);
          this.gameStateManager.playerNames = msg.allPlayers
            .filter((p) => !p.isDM)
            .map((p) => p.name);
        }
        log("ws-client", `+ ${msg.playerName} (${msg.players.length} players)`);
        this.gameLogger.system(`Player joined: ${msg.playerName}`);

        // Send game state sync to newly joined player
        if (!msg.isDM) {
          this.gameStateManager.hostName = msg.hostName;
          this.gameStateManager.sendStateSyncTo(msg.playerName);
          // Send saved notes if campaign is active
          this.sendPlayerNotes(msg.playerName);
        }
        break;
      }

      case "server:player_left": {
        if (msg.allPlayers) {
          this.updatePlayers(msg.allPlayers);
          this.gameStateManager.playerNames = msg.allPlayers
            .filter((p) => !p.isDM)
            .map((p) => p.name);
        }
        log("ws-client", `- ${msg.playerName} (${msg.players.length} players)`);
        this.gameLogger.system(`Player left: ${msg.playerName}`);
        break;
      }

      case "server:character_updated": {
        this.gameStateManager.characters[msg.playerName] = msg.character;
        break;
      }

      case "server:system": {
        log("ws-client", `System: ${msg.content}`);
        break;
      }

      case "server:error": {
        log("ws-client", `Error: ${msg.message} (${msg.code})`);
        break;
      }

      case "server:room_destroyed": {
        log("ws-client", "Room destroyed.");
        this.autoSnapshot();
        this.close();
        break;
      }

      default:
        break;
    }
  }

  /** Handle server:player_action — dispatch to GameStateManager */
  private handlePlayerAction(raw: {
    type: "server:player_action";
    playerName: string;
    userId?: string;
    action: ClientMessage;
    requestId: string;
  }): void {
    log("ws-client", `Player action from ${raw.playerName}: ${raw.action.type}`);

    // Track playerName → userId mapping for campaign persistence
    if (raw.userId) {
      this.playerUserIds[raw.playerName] = raw.userId;
    }

    // Special handling: set_campaign and configure_campaign are campaign manager operations
    if (raw.action.type === "client:set_campaign") {
      this.handleSetCampaign(raw.action);
      return;
    }
    if (raw.action.type === "client:configure_campaign") {
      this.handleConfigureCampaign(raw.action);
      return;
    }
    if (raw.action.type === "client:save_notes") {
      this.handleSaveNotes(raw.playerName, raw.action.content, raw.userId);
      return;
    }

    const wasStoryStarted = this.gameStateManager.storyStarted;
    this.gameStateManager.handlePlayerAction(raw.playerName, raw.action, raw.requestId, raw.userId);

    // Signal worker that story has started (replaces string-sniffing)
    if (!wasStoryStarted && this.gameStateManager.storyStarted) {
      this.send({ type: "client:story_started" });
    }
  }

  /** Send a ServerMessage to all clients via the worker's client:broadcast relay */
  private broadcastViaWorker(msg: ServerMessage, targets?: string[]): void {
    this.send({
      type: "client:broadcast",
      payload: msg,
      targets,
    });
  }

  /** Broadcast a server:error to all players — surfaces bridge failures in the UI. */
  private broadcastError(code: string, message: string): void {
    this.broadcastViaWorker({ type: "server:error", message, code });
  }

  /** Handle set_campaign relayed from worker. */
  private handleSetCampaign(msg: { campaignSlug?: string; newCampaignName?: string }): void {
    const cm = this.options.campaignManager;

    try {
      let manifest;
      if (msg.newCampaignName) {
        manifest = cm.createCampaign(msg.newCampaignName);
        log("ws-client", `Created campaign: ${manifest.name} (${manifest.slug})`);
      } else if (msg.campaignSlug) {
        manifest = cm.loadCampaign(msg.campaignSlug);
        log("ws-client", `Loaded campaign: ${manifest.name} (${manifest.slug})`);
      } else {
        log("ws-client", "set_campaign: no slug or name provided");
        return;
      }

      this.send({
        type: "client:campaign_loaded",
        campaignSlug: manifest.slug,
        campaignName: manifest.name,
        sessionCount: manifest.sessionCount,
      });

      // Restore character snapshots from campaign into game state
      this.restoreCharactersFromCampaign(cm);

      const campaigns = cm.listCampaigns();
      this.send({
        type: "client:dm_config",
        provider: "claude-code-mcp",
        supportsTools: true,
        campaigns: campaigns.length > 0 ? campaigns : undefined,
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log("ws-client", `Campaign error: ${errMsg}`);
      this.broadcastError("CAMPAIGN_LOAD_FAILED", `Campaign load failed: ${errMsg}`);
    }
  }

  /** Restore saved character snapshots from campaign into bridge + broadcast to worker. */
  private restoreCharactersFromCampaign(cm: CampaignManager): void {
    try {
      const snapshots = cm.loadCharacterSnapshots();
      const count = Object.keys(snapshots).length;
      if (count === 0) return;

      for (const [playerName, charData] of Object.entries(snapshots)) {
        const character = charData as CharacterData;
        // Only restore if we don't already have this character (live data takes priority)
        if (!this.gameStateManager.characters[playerName]) {
          this.gameStateManager.characters[playerName] = character;

          // Broadcast to worker so the frontend gets the character sheet
          this.broadcastViaWorker({
            type: "server:character_updated",
            playerName,
            character,
          });
        }
      }

      log("ws-client", `Restored ${count} character(s) from campaign snapshots`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log("ws-client", `Character restore error: ${errMsg}`);
      this.broadcastError("CHARACTER_RESTORE_FAILED", `Character restore failed: ${errMsg}`);
    }
  }

  /** Handle configure_campaign relayed from worker. */
  private handleConfigureCampaign(msg: {
    campaignName: string;
    systemPrompt?: string;
    pacingProfile: string;
    encounterLength: string;
    existingCampaignSlug?: string;
  }): void {
    const cm = this.options.campaignManager;

    try {
      let manifest;
      let restoredCharacters: Record<string, unknown> | undefined;

      if (msg.existingCampaignSlug) {
        manifest = cm.loadCampaign(msg.existingCampaignSlug);
        log("ws-client", `Loaded campaign: ${manifest.name} (${manifest.slug})`);

        const { characters: chars, userIds } = cm.loadCharacterSnapshotsWithIds();
        if (Object.keys(chars).length > 0) {
          restoredCharacters = chars;
          // Restore userId mappings from saved snapshots
          Object.assign(this.playerUserIds, userIds);
          log("ws-client", `Restored ${Object.keys(chars).length} character(s) from campaign`);
        }
      } else {
        manifest = cm.createCampaign(msg.campaignName);
        log("ws-client", `Created campaign: ${manifest.name} (${manifest.slug})`);
      }

      if (msg.systemPrompt) {
        cm.saveSystemPrompt(msg.systemPrompt);
        this.gameStateManager.gameState.customSystemPrompt = msg.systemPrompt;
      } else if (msg.existingCampaignSlug) {
        const savedPrompt = cm.getSystemPrompt();
        if (savedPrompt) {
          this.gameStateManager.gameState.customSystemPrompt = savedPrompt;
        }
      }

      cm.saveSettings({
        pacingProfile: msg.pacingProfile,
        encounterLength: msg.encounterLength,
      });

      // Populate players in the manifest from current room players
      const playerNames = this.players.map((p) => p.character?.name || p.name).filter(Boolean);
      if (playerNames.length > 0) {
        cm.updatePlayers(playerNames);
      }

      // Update game state manager
      this.gameStateManager.gameState.pacingProfile =
        msg.pacingProfile as import("@unseen-servant/shared/types").PacingProfile;
      this.gameStateManager.gameState.encounterLength =
        msg.encounterLength as import("@unseen-servant/shared/types").EncounterLength;

      this.send({
        type: "client:campaign_configured_ack",
        campaignSlug: manifest.slug,
        campaignName: manifest.name,
        pacingProfile: msg.pacingProfile,
        encounterLength: msg.encounterLength,
        systemPrompt: msg.systemPrompt,
        restoredCharacters,
        characterUserIds:
          Object.keys(this.playerUserIds).length > 0 ? this.playerUserIds : undefined,
      });

      this.gameLogger.sessionStart(
        manifest.slug,
        manifest.sessionCount + 1,
        !!msg.existingCampaignSlug,
      );

      const campaigns = cm.listCampaigns();
      this.send({
        type: "client:dm_config",
        provider: "claude-code-mcp",
        supportsTools: true,
        campaigns: campaigns.length > 0 ? campaigns : undefined,
      });

      // Send saved notes to all connected players
      this.sendAllPlayerNotes();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log("ws-client", `Campaign configure error: ${errMsg}`);
      this.broadcastError("CAMPAIGN_CONFIG_FAILED", `Campaign configuration failed: ${errMsg}`);
    }
  }

  /** Handle character data forwarded from worker for campaign persistence. */
  private handleCharacterForCampaign(msg: {
    playerName: string;
    userId?: string;
    character: CharacterData;
  }): void {
    const cm = this.options.campaignManager;
    if (!cm.activeSlug) return;

    this.gameStateManager.characters[msg.playerName] = msg.character;

    // Track userId for stable identity
    if (msg.userId) {
      this.playerUserIds[msg.playerName] = msg.userId;
    }

    try {
      cm.snapshotCharacters(
        { [msg.playerName]: msg.character },
        { [msg.playerName]: msg.userId || this.playerUserIds[msg.playerName] },
      );
      log("ws-client", `Saved character "${msg.character.static.name}" for ${msg.playerName}`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log("ws-client", `Character save error: ${errMsg}`);
      this.broadcastError("CHARACTER_SAVE_FAILED", `Character save failed: ${errMsg}`);
    }
  }

  /** Auto-snapshot characters and session state to campaign on disconnect/destroy. */
  private autoSnapshot(): void {
    const cm = this.options.campaignManager;
    if (!cm.activeSlug) return;

    try {
      // Save session state before character snapshots
      this.gameStateManager.saveSessionStateToCampaign();

      // Use GSM's characters — they have up-to-date dynamic data from tool mutations
      const chars = this.gameStateManager.characters;
      if (Object.keys(chars).length > 0) {
        const count = cm.snapshotCharacters(chars, this.playerUserIds);
        log("ws-client", `Auto-snapshot: saved ${count} character(s) to campaign`);
      }
      cm.touchManifest();
      cm.flushManifest();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log("ws-client", `Auto-snapshot error: ${errMsg}`);
      this.broadcastError("AUTO_SNAPSHOT_FAILED", `Auto-snapshot failed: ${errMsg}`);
    }
  }

  /** Restore full session state from campaign files on reconnect. */
  private restoreSessionFromCampaign(slug: string): void {
    const cm = this.options.campaignManager;

    try {
      // Load campaign (sets activeSlug)
      const manifest = cm.loadCampaign(slug);
      log("ws-client", `Restoring session for campaign: ${manifest.name} (${slug})`);

      // Read session-state.json
      const raw = cm.readFile("session-state");
      if (!raw) {
        log("ws-client", "No session-state.json found, skipping state restoration");
        return;
      }

      const snapshot = JSON.parse(raw) as SessionStateSnapshot;

      // Load chat history from separate file (backward compat: fall back to snapshot)
      let chatHistory: { role: "user" | "assistant"; content: string }[] | undefined;
      const chatRaw = cm.readFile("chat-history");
      if (chatRaw) {
        try {
          chatHistory = JSON.parse(chatRaw);
        } catch {
          log("ws-client", "Failed to parse chat-history.json, falling back to snapshot");
        }
      }

      // Restore game state manager
      this.gameStateManager.restoreSessionState(snapshot, chatHistory);
      this.storyStarted = true;

      // Restore characters from campaign snapshots
      this.restoreCharactersFromCampaign(cm);

      // Restore system prompt from campaign
      const savedPrompt = cm.getSystemPrompt();
      if (savedPrompt) {
        this.gameStateManager.gameState.customSystemPrompt = savedPrompt;
      }

      // Restore pacing/encounterLength from manifest
      if (manifest.pacingProfile) {
        this.gameStateManager.gameState.pacingProfile =
          manifest.pacingProfile as import("@unseen-servant/shared/types").PacingProfile;
      }
      if (manifest.encounterLength) {
        this.gameStateManager.gameState.encounterLength =
          manifest.encounterLength as import("@unseen-servant/shared/types").EncounterLength;
      }

      // Notify worker that campaign is loaded
      this.send({
        type: "client:campaign_loaded",
        campaignSlug: manifest.slug,
        campaignName: manifest.name,
        sessionCount: manifest.sessionCount,
      });

      // Broadcast game state sync so players get restored combat/encounter state
      this.gameStateManager.broadcastGameStateSync();

      // Send saved notes to all connected players
      this.sendAllPlayerNotes();

      const msgCount = chatHistory?.length ?? snapshot.conversationHistory?.length ?? 0;
      log(
        "ws-client",
        `Session restored: ${msgCount} messages, ` +
          `story=${snapshot.storyStarted}, combat=${!!snapshot.gameState.encounter?.combat}, ` +
          `saved at ${snapshot.savedAt}`,
      );
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log("ws-client", `Session restore error: ${errMsg}`);
      this.broadcastError("SESSION_RESTORE_FAILED", `Session restore failed: ${errMsg}`);
    }
  }

  /** Save player notes to campaign (private, AI never sees these). */
  private handleSaveNotes(playerName: string, content: string, userId?: string): void {
    const cm = this.options.campaignManager;
    if (!cm.activeSlug) return;

    try {
      cm.savePlayerNotes(playerName, content, userId);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log("ws-client", `Save notes error: ${errMsg}`);
      this.broadcastError("SAVE_NOTES_FAILED", `Save notes failed: ${errMsg}`);
    }
  }

  /** Send saved notes to a specific player via targeted broadcast. */
  private sendPlayerNotes(playerName: string): void {
    const cm = this.options.campaignManager;
    if (!cm.activeSlug) return;

    try {
      const userId = this.playerUserIds[playerName];
      const notes = cm.loadPlayerNotes(playerName, userId);
      if (notes !== null) {
        this.broadcastViaWorker({ type: "server:player_notes_loaded", content: notes }, [
          playerName,
        ]);
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log("ws-client", `Load notes error: ${errMsg}`);
      this.broadcastError("LOAD_NOTES_FAILED", `Load notes failed: ${errMsg}`);
    }
  }

  /** Send saved notes to all connected players. */
  private sendAllPlayerNotes(): void {
    for (const player of this.players) {
      this.sendPlayerNotes(player.name);
    }
  }

  private updatePlayers(allPlayers: PlayerInfo[]): void {
    this.players = allPlayers
      .filter((p) => !p.isDM)
      .map((p) => {
        const char = this.gameStateManager.characters[p.name];
        const summary: PlayerSummary = {
          name: p.name,
          online: p.online,
          isHost: p.isHost,
        };
        if (char) {
          const totalLevel = char.static.classes.reduce((sum, c) => sum + c.level, 0);
          summary.character = {
            name: char.static.name,
            race: char.static.species || char.static.race,
            classes: char.static.classes.map((c) => `${c.name} ${c.level}`).join("/"),
            level: totalLevel,
            hp: `${char.dynamic.currentHP}/${getHP(char)}`,
            ac: getAC(char),
            conditions: char.dynamic.conditions.map((c) => c.name),
          };
        }
        return summary;
      });

    // Keep campaign manifest players in sync
    const cm = this.options.campaignManager;
    if (cm.activeSlug) {
      const playerNames = this.players.map((p) => p.character?.name || p.name).filter(Boolean);
      cm.updatePlayers(playerNames);
    }
  }

  /** Send a client message to the worker. */
  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      log(
        "ws-client",
        `send() dropped (readyState=${this.ws?.readyState ?? "no ws"}): ${String(msg.type ?? "unknown")}`,
      );
    }
  }

  /** Broadcast DM typing indicator to all players */
  sendTypingIndicator(isTyping: boolean): void {
    this.broadcastViaWorker({
      type: "server:typing",
      playerName: "DM",
      isTyping,
    });
  }

  /** Broadcast a system event message to all players (visible in activity log). */
  broadcastSystemEvent(content: string): void {
    this.broadcastViaWorker({
      type: "server:system",
      content,
      timestamp: Date.now(),
    });
  }

  /** Rate-limited activity ping so long DM tool chains don't look silent. */
  private lastActivityPingAt = 0;
  pingActivity(content: string, minIntervalMs = 2500): void {
    const now = Date.now();
    if (now - this.lastActivityPingAt < minIntervalMs) return;
    this.lastActivityPingAt = now;
    this.broadcastSystemEvent(content);
  }

  /** Send a DM response — now goes through GameStateManager */
  sendDMResponse(requestId: string, text: string): void {
    this.gameStateManager.sendResponse(requestId, text);
  }

  /** Send a DM dice roll to all players */
  sendDiceRoll(roll: RollResult, reason?: string): void {
    this.broadcastViaWorker({
      type: "server:dice_roll",
      roll: { ...roll, label: reason ? `${roll.label} — ${reason}` : roll.label },
      playerName: "DM",
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });
  }

  /** Send a check request and wait for the result. */
  sendCheckRequest(params: {
    notation: string;
    checkType?: string;
    targetCharacter: string;
    dc?: number;
    reason: string;
  }): Promise<CheckResult> {
    return new Promise((resolve, reject) => {
      // Use GameStateManager to create the check request
      const result = this.gameStateManager.requestCheck(params);

      if (result.startsWith("Character")) {
        reject(new Error(result));
        return;
      }

      // Wait for the player to roll — listen for the check result via game state manager
      // The player clicks "Roll" → worker forwards roll_dice → bridge handles it →
      // broadcasts check_result → conversation history gets the result
      // For now, we resolve when the check is processed by handleRollDice
      const checkId =
        this.gameStateManager.gameState.pendingCheck?.id ??
        this.gameStateManager.gameState.encounter?.combat?.pendingCheck?.id;

      if (!checkId) {
        reject(new Error("Failed to create check request"));
        return;
      }

      // Poll for check completion (pendingCheck gets cleared when resolved)
      const interval = setInterval(() => {
        const combat = this.gameStateManager.gameState.encounter?.combat;
        const pendingCheck = combat?.pendingCheck ?? this.gameStateManager.gameState.pendingCheck;

        // Check cleared = resolved
        if (!pendingCheck || pendingCheck.id !== checkId) {
          clearInterval(interval);
          clearTimeout(timeout);

          const cr = this.gameStateManager.lastCheckResult;
          if (cr) {
            this.gameStateManager.lastCheckResult = null;
            resolve({
              requestId: checkId,
              roll: {
                id: crypto.randomUUID(),
                rolls: cr.rolls,
                modifier: cr.modifier,
                total: cr.total,
                label: cr.label,
                criticalHit: cr.criticalHit,
                criticalFail: cr.criticalFail,
              },
              dc: cr.dc,
              success: cr.success,
              characterName: cr.characterName,
            });
          } else {
            resolve({
              requestId: checkId,
              roll: {
                id: crypto.randomUUID(),
                rolls: [],
                modifier: 0,
                total: 0,
                label: params.reason,
              },
              success: true,
              characterName: params.targetCharacter,
            });
          }
        }
      }, 500);

      const timeout = setTimeout(() => {
        // Auto-resolve: roll server-side instead of rejecting
        // Find the player name for the target character
        const charEntry = Object.entries(this.gameStateManager.characters).find(
          ([, c]) => c.static.name.toLowerCase() === params.targetCharacter.toLowerCase(),
        );
        if (charEntry) {
          const [targetPlayerName] = charEntry;
          log("ws-client", `Check timed out for ${params.targetCharacter}, auto-resolving...`);
          this.gameStateManager.handleRollDice(targetPlayerName, checkId);
          // The polling interval will detect the cleared check and resolve normally
        } else {
          // No character found — surface the problem loudly rather than silently failing the save
          clearInterval(interval);
          log(
            "ws-client",
            `Check for unknown character "${params.targetCharacter}" — rejecting so the caller can handle it`,
          );
          this.broadcastSystemEvent(
            `Check request ignored — no character named "${params.targetCharacter}" in this session.`,
          );
          reject(new Error(`No character named "${params.targetCharacter}"`));
        }
      }, 120_000);
    });
  }

  private scheduleReconnect(): void {
    if (this.closed) return;

    const delay = Math.min(1000 * 2 ** Math.min(this.reconnectAttempts, 5), 30_000);
    this.reconnectAttempts++;
    if (this.reconnectAttempts % 10 === 0) {
      log(
        "ws-client",
        `WARNING: ${this.reconnectAttempts} reconnect attempts so far — still trying...`,
      );
    }
    log("ws-client", `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    setTimeout(() => this.connect(), delay);
  }

  private clearPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  close(): void {
    this.closed = true;
    this.clearPingInterval();
    this.ws?.close();
  }
}
