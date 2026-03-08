import WebSocket from "ws";
import type { MessageQueue } from "./message-queue.js";
import type { CampaignManager } from "./services/campaign-manager.js";
import { GameStateManager, type SessionStateSnapshot } from "./services/game-state-manager.js";
import type { PlayerSummary } from "./types.js";
import type {
  ClientMessage,
  ServerMessage,
  CharacterData,
  CheckRequest,
  CheckResult,
  PlayerInfo,
  GameState,
  RollResult,
} from "@aidnd/shared/types";

interface WSClientOptions {
  workerUrl: string;
  roomCode: string;
  messageQueue: MessageQueue;
  campaignManager: CampaignManager;
}

export class WSClient {
  private ws: WebSocket | null = null;
  private options: WSClientOptions;
  private reconnectAttempts = 0;
  private closed = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPongAt = 0;

  /** Latest player list from room_joined / player_joined / player_left */
  players: PlayerSummary[] = [];
  /** Latest character data keyed by player name */
  characters: Record<string, CharacterData> = {};
  /** Whether the DM config has been sent */
  private configSent = false;

  connected = false;
  storyStarted = false;

  /** Game state manager — owns all game state */
  gameStateManager: GameStateManager;

  constructor(options: WSClientOptions) {
    this.options = options;

    this.gameStateManager = new GameStateManager({
      broadcast: (msg, targets) => this.broadcastViaWorker(msg, targets),
      messageQueue: options.messageQueue,
      campaignManager: options.campaignManager,
    });
  }

  connect(): void {
    if (this.closed) return;

    const wsUrl = this.options.workerUrl
      .replace(/^http/, "ws")
      .replace(/\/$/, "");
    const url = `${wsUrl}/api/rooms/${this.options.roomCode}/ws`;

    console.error(`[ws-client] Connecting to ${url}...`);
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.error(`[ws-client] WebSocket open, joining room as DM...`);
      this.reconnectAttempts = 0;
      this.lastPongAt = Date.now();
      this.send({
        type: "client:join",
        playerName: "DM",
        roomCode: this.options.roomCode,
        guestId: "aidnd-dm-bridge",
        isDM: true,
      });

      // Start heartbeat: ping every 30s, terminate if no pong in 60s
      this.clearPingInterval();
      this.pingInterval = setInterval(() => {
        if (Date.now() - this.lastPongAt > 60_000) {
          console.error(`[ws-client] No pong received in 60s, terminating connection...`);
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
      } catch {
        // ignore non-JSON (e.g. "pong")
      }
    });

    this.ws.on("close", (code, reason) => {
      console.error(`[ws-client] Disconnected: ${code} ${reason.toString()}`);
      this.connected = false;
      this.configSent = false;
      this.clearPingInterval();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error(`[ws-client] Error: ${err.message}`);
    });
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "server:room_joined": {
        this.connected = true;
        this.storyStarted = msg.storyStarted ?? false;
        this.gameStateManager.storyStarted = this.storyStarted;
        this.gameStateManager.hostName = msg.hostName;
        console.error(
          `[ws-client] Joined room ${msg.roomCode} as DM (host: ${msg.hostName}, players: ${msg.players.join(", ")})`
        );

        // Store initial character data
        if (msg.characters) {
          this.characters = msg.characters;
          this.gameStateManager.characters = { ...msg.characters };
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

        // Auto-restore session state if reconnecting to active campaign
        if (msg.activeCampaignSlug && msg.storyStarted) {
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
        console.error(
          `[ws-client] + ${msg.playerName} (${msg.players.length} players)`
        );

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
        console.error(
          `[ws-client] - ${msg.playerName} (${msg.players.length} players)`
        );
        break;
      }

      case "server:character_updated": {
        this.characters[msg.playerName] = msg.character;
        this.gameStateManager.characters[msg.playerName] = msg.character;
        break;
      }

      case "server:system": {
        console.error(`[ws-client] System: ${msg.content}`);
        break;
      }

      case "server:error": {
        console.error(`[ws-client] Error: ${msg.message} (${msg.code})`);
        break;
      }

      case "server:room_destroyed": {
        console.error(`[ws-client] Room destroyed.`);
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
    action: ClientMessage;
    requestId: string;
  }): void {
    console.error(`[ws-client] Player action from ${raw.playerName}: ${raw.action.type}`);

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
      this.handleSaveNotes(raw.playerName, raw.action.content);
      return;
    }

    this.gameStateManager.handlePlayerAction(
      raw.playerName,
      raw.action,
      raw.requestId
    );
  }

  /** Send a ServerMessage to all clients via the worker's client:broadcast relay */
  private broadcastViaWorker(msg: ServerMessage, targets?: string[]): void {
    this.send({
      type: "client:broadcast",
      payload: msg,
      targets,
    });
  }

  /** Handle set_campaign relayed from worker. */
  private handleSetCampaign(msg: {
    campaignSlug?: string;
    newCampaignName?: string;
  }): void {
    const cm = this.options.campaignManager;

    try {
      let manifest;
      if (msg.newCampaignName) {
        manifest = cm.createCampaign(msg.newCampaignName);
        console.error(
          `[ws-client] Created campaign: ${manifest.name} (${manifest.slug})`
        );
      } else if (msg.campaignSlug) {
        manifest = cm.loadCampaign(msg.campaignSlug);
        console.error(
          `[ws-client] Loaded campaign: ${manifest.name} (${manifest.slug})`
        );
      } else {
        console.error(`[ws-client] set_campaign: no slug or name provided`);
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
      console.error(
        `[ws-client] Campaign error: ${e instanceof Error ? e.message : String(e)}`
      );
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
        if (!this.characters[playerName]) {
          this.characters[playerName] = character;
          this.gameStateManager.characters[playerName] = character;

          // Broadcast to worker so the frontend gets the character sheet
          this.broadcastViaWorker({
            type: "server:character_updated",
            playerName,
            character,
          });
        }
      }

      console.error(`[ws-client] Restored ${count} character(s) from campaign snapshots`);
    } catch (e) {
      console.error(
        `[ws-client] Character restore error: ${e instanceof Error ? e.message : String(e)}`
      );
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
        console.error(`[ws-client] Loaded campaign: ${manifest.name} (${manifest.slug})`);

        const chars = cm.loadCharacterSnapshots();
        if (Object.keys(chars).length > 0) {
          restoredCharacters = chars;
          console.error(`[ws-client] Restored ${Object.keys(chars).length} character(s) from campaign`);
        }
      } else {
        manifest = cm.createCampaign(msg.campaignName);
        console.error(`[ws-client] Created campaign: ${manifest.name} (${manifest.slug})`);
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
      const playerNames = this.players
        .map((p) => p.character?.name || p.name)
        .filter(Boolean);
      if (playerNames.length > 0) {
        cm.updatePlayers(playerNames);
      }

      // Update game state manager
      this.gameStateManager.gameState.pacingProfile = msg.pacingProfile as import("@aidnd/shared/types").PacingProfile;
      this.gameStateManager.gameState.encounterLength = msg.encounterLength as import("@aidnd/shared/types").EncounterLength;

      this.send({
        type: "client:campaign_configured_ack",
        campaignSlug: manifest.slug,
        campaignName: manifest.name,
        pacingProfile: msg.pacingProfile,
        encounterLength: msg.encounterLength,
        systemPrompt: msg.systemPrompt,
        restoredCharacters,
      });

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
      console.error(`[ws-client] Campaign configure error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Handle character data forwarded from worker for campaign persistence. */
  private handleCharacterForCampaign(msg: {
    playerName: string;
    character: CharacterData;
  }): void {
    const cm = this.options.campaignManager;
    if (!cm.activeSlug) return;

    this.characters[msg.playerName] = msg.character;
    this.gameStateManager.characters[msg.playerName] = msg.character;

    try {
      cm.snapshotCharacters({ [msg.playerName]: msg.character });
      console.error(`[ws-client] Saved character "${msg.character.static.name}" for ${msg.playerName}`);
    } catch (e) {
      console.error(`[ws-client] Character save error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Auto-snapshot characters and session state to campaign on disconnect/destroy. */
  private autoSnapshot(): void {
    const cm = this.options.campaignManager;
    if (!cm.activeSlug) return;

    try {
      // Save session state before character snapshots
      this.gameStateManager.saveSessionStateToCampaign();

      if (Object.keys(this.characters).length > 0) {
        const count = cm.snapshotCharacters(this.characters);
        console.error(
          `[ws-client] Auto-snapshot: saved ${count} character(s) to campaign`
        );
      }
      cm.touchManifest();
      cm.flushManifest();
    } catch (e) {
      console.error(
        `[ws-client] Auto-snapshot error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  /** Restore full session state from campaign files on reconnect. */
  private restoreSessionFromCampaign(slug: string): void {
    const cm = this.options.campaignManager;

    try {
      // Load campaign (sets activeSlug)
      const manifest = cm.loadCampaign(slug);
      console.error(`[ws-client] Restoring session for campaign: ${manifest.name} (${slug})`);

      // Read session-state.json
      const raw = cm.readFile("session-state");
      if (!raw) {
        console.error(`[ws-client] No session-state.json found, skipping state restoration`);
        return;
      }

      const snapshot = JSON.parse(raw) as SessionStateSnapshot;

      // Restore game state manager
      this.gameStateManager.restoreSessionState(snapshot);
      this.storyStarted = true;

      // Restore characters from campaign snapshots
      this.restoreCharactersFromCampaign(cm);

      // Merge live characters from room_joined over restored ones (live data wins)
      for (const [playerName, char] of Object.entries(this.characters)) {
        this.gameStateManager.characters[playerName] = char;
      }

      // Restore system prompt from campaign
      const savedPrompt = cm.getSystemPrompt();
      if (savedPrompt) {
        this.gameStateManager.gameState.customSystemPrompt = savedPrompt;
      }

      // Restore pacing/encounterLength from manifest
      if (manifest.pacingProfile) {
        this.gameStateManager.gameState.pacingProfile = manifest.pacingProfile as import("@aidnd/shared/types").PacingProfile;
      }
      if (manifest.encounterLength) {
        this.gameStateManager.gameState.encounterLength = manifest.encounterLength as import("@aidnd/shared/types").EncounterLength;
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

      console.error(
        `[ws-client] Session restored: ${snapshot.conversationHistory.length} messages, ` +
        `story=${snapshot.storyStarted}, combat=${!!snapshot.gameState.encounter?.combat}, ` +
        `saved at ${snapshot.savedAt}`
      );
    } catch (e) {
      console.error(
        `[ws-client] Session restore error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  /** Save player notes to campaign (private, AI never sees these). */
  private handleSaveNotes(playerName: string, content: string): void {
    const cm = this.options.campaignManager;
    if (!cm.activeSlug) return;

    try {
      cm.savePlayerNotes(playerName, content);
    } catch (e) {
      console.error(`[ws-client] Save notes error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Send saved notes to a specific player via targeted broadcast. */
  private sendPlayerNotes(playerName: string): void {
    const cm = this.options.campaignManager;
    if (!cm.activeSlug) return;

    try {
      const notes = cm.loadPlayerNotes(playerName);
      if (notes !== null) {
        this.broadcastViaWorker(
          { type: "server:player_notes_loaded", content: notes },
          [playerName],
        );
      }
    } catch (e) {
      console.error(`[ws-client] Load notes error: ${e instanceof Error ? e.message : String(e)}`);
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
        const char = this.characters[p.name];
        const summary: PlayerSummary = {
          name: p.name,
          online: p.online,
          isHost: p.isHost,
        };
        if (char) {
          const totalLevel = char.static.classes.reduce(
            (sum, c) => sum + c.level,
            0
          );
          summary.character = {
            name: char.static.name,
            race: char.static.race,
            classes: char.static.classes
              .map((c) => `${c.name} ${c.level}`)
              .join("/"),
            level: totalLevel,
            hp: `${char.dynamic.currentHP}/${char.static.maxHP}`,
            ac: char.static.armorClass,
            conditions: char.dynamic.conditions,
          };
        }
        return summary;
      });

    // Keep campaign manifest players in sync
    const cm = this.options.campaignManager;
    if (cm.activeSlug) {
      const playerNames = this.players
        .map((p) => p.character?.name || p.name)
        .filter(Boolean);
      cm.updatePlayers(playerNames);
    }
  }

  /** Send a client message to the worker. */
  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
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
    checkType: CheckRequest["type"];
    targetCharacter: string;
    ability?: string;
    skill?: string;
    dc?: number;
    advantage?: boolean;
    disadvantage?: boolean;
    reason: string;
    notation?: string;
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
      const checkId = this.gameStateManager.gameState.pendingCheck?.id
        ?? this.gameStateManager.gameState.encounter?.combat?.pendingCheck?.id;

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

          // Extract the last check result from conversation history
          const lastMsg = this.gameStateManager.conversationHistory
            .filter((m) => m.role === "user" && m.content.includes("[System:") && m.content.includes("rolled"))
            .pop();

          if (lastMsg) {
            // Parse basic info from system message
            const totalMatch = lastMsg.content.match(/rolled (\d+)/);
            const successMatch = lastMsg.content.match(/— (Success|Failure)/);
            const charMatch = lastMsg.content.match(/\[System: (.+?) rolled/);

            resolve({
              requestId: checkId,
              roll: {
                id: crypto.randomUUID(),
                rolls: [],
                modifier: 0,
                total: totalMatch ? parseInt(totalMatch[1]) : 0,
                label: params.reason,
              },
              dc: params.dc,
              success: successMatch?.[1] === "Success",
              characterName: charMatch?.[1] ?? params.targetCharacter,
            });
          } else {
            resolve({
              requestId: checkId,
              roll: { id: crypto.randomUUID(), rolls: [], modifier: 0, total: 0, label: params.reason },
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
          ([, c]) => c.static.name.toLowerCase() === params.targetCharacter.toLowerCase()
        );
        if (charEntry) {
          const [targetPlayerName] = charEntry;
          console.error(`[ws-client] Check timed out for ${params.targetCharacter}, auto-resolving...`);
          this.gameStateManager.handleRollDice(targetPlayerName, checkId);
          // The polling interval will detect the cleared check and resolve normally
        } else {
          // No character found — clear interval and resolve with a fallback
          clearInterval(interval);
          resolve({
            requestId: checkId,
            roll: { id: crypto.randomUUID(), rolls: [], modifier: 0, total: 0, label: params.reason },
            success: false,
            characterName: params.targetCharacter,
          });
        }
      }, 120_000);
    });
  }

  private scheduleReconnect(): void {
    if (this.closed) return;

    const delay = Math.min(1000 * 2 ** Math.min(this.reconnectAttempts, 5), 30_000);
    this.reconnectAttempts++;
    if (this.reconnectAttempts % 10 === 0) {
      console.error(
        `[ws-client] WARNING: ${this.reconnectAttempts} reconnect attempts so far — still trying...`
      );
    }
    console.error(
      `[ws-client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`
    );
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
