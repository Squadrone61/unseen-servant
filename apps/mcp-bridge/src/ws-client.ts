import WebSocket from "ws";
import type { MessageQueue } from "./message-queue.js";
import type { CampaignManager } from "./services/campaign-manager.js";
import type { PlayerSummary } from "./types.js";
import type {
  ServerMessage,
  CharacterData,
  PlayerInfo,
  GameState,
} from "@aidnd/shared/types";

interface WSClientOptions {
  workerUrl: string;
  roomCode: string;
  messageQueue: MessageQueue;
  campaignManager: CampaignManager;
  onStateSync?: (gameState: GameState) => void;
}

export class WSClient {
  private ws: WebSocket | null = null;
  private options: WSClientOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private closed = false;

  /** Latest player list from room_joined / player_joined / player_left */
  players: PlayerSummary[] = [];
  /** Latest character data keyed by player name */
  characters: Record<string, CharacterData> = {};
  /** Latest game state from game_state_sync */
  gameState: GameState | null = null;
  /** Whether the DM config has been sent */
  private configSent = false;

  connected = false;
  storyStarted = false;

  constructor(options: WSClientOptions) {
    this.options = options;
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
      this.send({
        type: "client:join",
        playerName: "DM",
        roomCode: this.options.roomCode,
        guestId: "aidnd-dm-bridge",
      });
    });

    this.ws.on("message", (data) => {
      try {
        const raw = JSON.parse(data.toString());

        // Handle relayed client:set_campaign from worker
        if (raw.type === "client:set_campaign") {
          this.handleSetCampaign(raw);
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
        console.error(
          `[ws-client] Joined room ${msg.roomCode} as DM (host: ${msg.hostName}, players: ${msg.players.join(", ")})`
        );

        // Store initial character data
        if (msg.characters) {
          this.characters = msg.characters;
        }

        // Build initial player list
        if (msg.allPlayers) {
          this.updatePlayers(msg.allPlayers);
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
        break;
      }

      case "server:player_joined":
      case "server:player_left": {
        if (msg.allPlayers) {
          this.updatePlayers(msg.allPlayers);
        }
        console.error(
          `[ws-client] ${msg.type === "server:player_joined" ? "+" : "-"} ${msg.playerName} (${msg.players.length} players)`
        );
        break;
      }

      case "server:character_updated": {
        this.characters[msg.playerName] = msg.character;
        break;
      }

      case "server:game_state_sync": {
        this.gameState = msg.gameState;
        this.options.onStateSync?.(msg.gameState);

        // Persist system prompt to campaign if one is active
        const cm = this.options.campaignManager;
        if (cm.activeSlug && msg.gameState.customSystemPrompt) {
          try {
            cm.saveSystemPrompt(msg.gameState.customSystemPrompt);
          } catch {
            // ignore — campaign might not exist yet
          }
        }
        break;
      }

      case "server:dm_request": {
        console.error(
          `[ws-client] Received dm_request (id: ${msg.requestId}, ${msg.messages.length} messages)`
        );
        this.options.messageQueue.push({
          requestId: msg.requestId,
          systemPrompt: msg.systemPrompt,
          messages: msg.messages,
        });
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
        // Auto-snapshot characters before shutting down
        this.autoSnapshot();
        this.close();
        break;
      }

      // Other messages are game state updates that we observe passively
      default:
        break;
    }
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
        // Create new campaign
        manifest = cm.createCampaign(msg.newCampaignName);
        console.error(
          `[ws-client] Created campaign: ${manifest.name} (${manifest.slug})`
        );
      } else if (msg.campaignSlug) {
        // Load existing campaign
        manifest = cm.loadCampaign(msg.campaignSlug);
        console.error(
          `[ws-client] Loaded campaign: ${manifest.name} (${manifest.slug})`
        );
      } else {
        console.error(`[ws-client] set_campaign: no slug or name provided`);
        return;
      }

      // Send campaign_loaded confirmation back through worker
      this.send({
        type: "client:campaign_loaded",
        campaignSlug: manifest.slug,
        campaignName: manifest.name,
        sessionCount: manifest.sessionCount,
      });

      // Send updated campaign list
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

  /** Auto-snapshot characters to campaign on disconnect/destroy. */
  private autoSnapshot(): void {
    const cm = this.options.campaignManager;
    if (!cm.activeSlug) return;

    try {
      if (Object.keys(this.characters).length > 0) {
        const count = cm.snapshotCharacters(this.characters);
        console.error(
          `[ws-client] Auto-snapshot: saved ${count} character(s) to campaign`
        );
      }
      cm.touchManifest();
    } catch (e) {
      console.error(
        `[ws-client] Auto-snapshot error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  private updatePlayers(allPlayers: PlayerInfo[]): void {
    this.players = allPlayers
      .filter((p) => p.name !== "DM") // exclude ourselves
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
  }

  /** Send a client message to the worker. */
  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Send a DM response back to the worker. */
  sendDMResponse(requestId: string, text: string): void {
    this.send({
      type: "client:dm_response",
      requestId,
      text,
    });
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error(
          `[ws-client] Max reconnect attempts reached, giving up.`
        );
      }
      return;
    }

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;
    console.error(
      `[ws-client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`
    );
    setTimeout(() => this.connect(), delay);
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
