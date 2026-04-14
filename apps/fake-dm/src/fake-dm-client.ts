import WebSocket from "ws";
import type { ClientMessage, ServerMessage, PlayerInfo } from "@unseen-servant/shared/types";
import { GameStateManager } from "../../mcp-bridge/src/services/game-state-manager.js";
import { CampaignManager } from "../../mcp-bridge/src/services/campaign-manager.js";
import { GameLogger } from "../../mcp-bridge/src/services/game-logger.js";
import { MessageQueue } from "../../mcp-bridge/src/message-queue.js";
import { CommandRouter } from "./commands.js";

interface FakeDMOptions {
  workerUrl: string;
  roomCode: string;
}

export class FakeDMClient {
  private ws: WebSocket | null = null;
  private opts: FakeDMOptions;
  private closed = false;
  private reconnectAttempts = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPongAt = 0;
  private configSent = false;

  readonly gsm: GameStateManager;
  readonly router: CommandRouter;

  players: PlayerInfo[] = [];

  constructor(opts: FakeDMOptions) {
    this.opts = opts;

    const messageQueue = new MessageQueue();
    const campaignManager = new CampaignManager();
    const gameLogger = new GameLogger(campaignManager);

    this.gsm = new GameStateManager({
      broadcast: (msg, targets) => this.broadcastViaWorker(msg, targets),
      messageQueue,
      campaignManager,
      gameLogger,
    });

    this.router = new CommandRouter(this);
  }

  connect(): void {
    if (this.closed) return;
    const wsUrl = this.opts.workerUrl.replace(/^http/, "ws").replace(/\/$/, "");
    const url = `${wsUrl}/api/rooms/${this.opts.roomCode}/ws`;

    console.log(`[fake-dm] ws connecting ${url}`);
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[fake-dm] ws open — joining as DM");
      this.reconnectAttempts = 0;
      this.lastPongAt = Date.now();
      this.send({
        type: "client:join",
        playerName: "DM",
        roomCode: this.opts.roomCode,
        guestId: "fake-dm",
        isDM: true,
      });

      this.clearPing();
      this.pingInterval = setInterval(() => {
        if (Date.now() - this.lastPongAt > 60_000) {
          console.log("[fake-dm] no pong in 60s — terminating");
          this.ws?.terminate();
          return;
        }
        try {
          this.ws?.ping();
        } catch {
          // closing
        }
      }, 30_000);
    });

    this.ws.on("pong", () => {
      this.lastPongAt = Date.now();
    });

    this.ws.on("message", (data) => {
      try {
        const raw = JSON.parse(data.toString());
        this.handleRaw(raw);
      } catch (e) {
        if (e instanceof SyntaxError) return;
        console.error("[fake-dm] message handler error", e);
      }
    });

    this.ws.on("close", (code) => {
      console.log(`[fake-dm] ws closed code=${code}`);
      this.configSent = false;
      this.clearPing();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.log(`[fake-dm] ws error: ${err.message}`);
      this.ws?.terminate();
    });
  }

  private handleRaw(raw: { type: string } & Record<string, unknown>): void {
    switch (raw.type) {
      case "server:room_joined": {
        const msg = raw as unknown as {
          roomCode: string;
          hostName: string;
          players: string[];
          allPlayers?: PlayerInfo[];
          storyStarted?: boolean;
          characters?: Record<string, import("@unseen-servant/shared/types").CharacterData>;
        };
        console.log(
          `[fake-dm] joined room ${msg.roomCode} host=${msg.hostName} players=${msg.players.join(",") || "none"}`,
        );
        this.gsm.hostName = msg.hostName;
        this.gsm.storyStarted = msg.storyStarted ?? false;
        if (msg.allPlayers) {
          this.players = msg.allPlayers;
          this.gsm.playerNames = msg.allPlayers.filter((p) => !p.isDM).map((p) => p.name);
        }
        if (msg.characters) {
          Object.assign(this.gsm.characters, msg.characters);
        }
        if (!this.configSent) {
          this.send({ type: "client:dm_config", provider: "fake-dm", supportsTools: true });
          // Auto-configure a throwaway campaign so the Campaign Config modal
          // clears and chat opens without host interaction.
          this.send({
            type: "client:campaign_configured_ack",
            campaignSlug: "fake-dm",
            campaignName: "Fake DM Session",
            pacingProfile: "balanced",
            encounterLength: "standard",
          });
          this.send({ type: "client:story_started" });
          this.gsm.storyStarted = true;
          this.configSent = true;
        }
        // Re-broadcast our in-memory state so that on reconnect the browser
        // sees map/combatants the fake-dm already set up.
        this.gsm.broadcastGameStateSync();
        if (this.gsm.gameState.encounter?.map || this.gsm.gameState.encounter?.combat) {
          this.broadcastViaWorker({
            type: "server:combat_update",
            combat: this.gsm.gameState.encounter.combat ?? null,
            map: this.gsm.gameState.encounter.map ?? null,
            timestamp: Date.now(),
          });
        }
        break;
      }
      case "server:player_joined": {
        const msg = raw as unknown as {
          playerName: string;
          isDM?: boolean;
          allPlayers?: PlayerInfo[];
          hostName: string;
        };
        if (msg.allPlayers) {
          this.players = msg.allPlayers;
          this.gsm.playerNames = msg.allPlayers.filter((p) => !p.isDM).map((p) => p.name);
        }
        console.log(`[fake-dm] + ${msg.playerName}`);
        if (!msg.isDM) {
          this.gsm.hostName = msg.hostName;
          this.gsm.sendStateSyncTo(msg.playerName);
        }
        break;
      }
      case "server:player_left": {
        const msg = raw as unknown as { playerName: string; allPlayers?: PlayerInfo[] };
        if (msg.allPlayers) {
          this.players = msg.allPlayers;
          this.gsm.playerNames = msg.allPlayers.filter((p) => !p.isDM).map((p) => p.name);
        }
        console.log(`[fake-dm] - ${msg.playerName}`);
        break;
      }
      case "server:character_updated": {
        const msg = raw as unknown as {
          playerName: string;
          character: import("@unseen-servant/shared/types").CharacterData;
        };
        this.gsm.characters[msg.playerName] = msg.character;
        break;
      }
      case "server:player_action": {
        const msg = raw as unknown as {
          playerName: string;
          userId?: string;
          action: ClientMessage;
          requestId: string;
        };
        this.handlePlayerAction(msg);
        break;
      }
      case "server:room_destroyed": {
        console.log("[fake-dm] room destroyed");
        this.close();
        break;
      }
      default:
        break;
    }
  }

  private handlePlayerAction(raw: {
    playerName: string;
    userId?: string;
    action: ClientMessage;
    requestId: string;
  }): void {
    console.log(`[fake-dm] player_action from=${raw.playerName} type=${raw.action.type}`);
    if (raw.action.type === "client:chat") {
      const content = raw.action.content.trim();
      console.log(`[fake-dm] chat content="${content}"`);
      if (content.startsWith("!")) {
        this.router.handle(raw.playerName, content);
        return;
      }
    }
    // Pass through everything else so rolls, moves, end turn still work.
    this.gsm.handlePlayerAction(raw.playerName, raw.action, raw.requestId, raw.userId);
  }

  /** Send feedback to all players as a DM chat message. */
  sayToAll(content: string): void {
    this.broadcastViaWorker({
      type: "server:ai",
      content,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });
    console.log(`[fake-dm] > ${content.split("\n")[0]}`);
  }

  /** Send a DM narrative line as an ai message. */
  sayAsDM(text: string): void {
    this.broadcastViaWorker({
      type: "server:ai",
      content: text,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });
  }

  private broadcastViaWorker(msg: ServerMessage, targets?: string[]): void {
    this.send({ type: "client:broadcast", payload: msg, targets });
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const delay = Math.min(1000 * 2 ** Math.min(this.reconnectAttempts, 5), 30_000);
    this.reconnectAttempts++;
    console.log(`[fake-dm] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }

  private clearPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  close(): void {
    this.closed = true;
    this.clearPing();
    this.ws?.close();
  }
}
