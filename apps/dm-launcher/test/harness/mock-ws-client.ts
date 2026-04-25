import type { CheckResult, ServerMessage } from "@unseen-servant/shared/types";
import { WSClient } from "../../../mcp-bridge/src/ws-client.js";
import type { CampaignManager } from "../../../mcp-bridge/src/services/campaign-manager.js";
import type { GameLogger } from "../../../mcp-bridge/src/services/game-logger.js";
import type { MessageQueue } from "../../../mcp-bridge/src/message-queue.js";
import type { BroadcastLog } from "./types.js";

/**
 * Test-only WSClient that never opens a socket. Inherits the production class so
 * the GameStateManager construction + all the wsClient.sendXxx pass-throughs stay
 * authentic, but every outbound network message is captured into an array instead.
 */
export class MockWSClient extends WSClient {
  readonly broadcasts: BroadcastLog[] = [];

  constructor(opts: {
    messageQueue: MessageQueue;
    campaignManager: CampaignManager;
    gameLogger: GameLogger;
  }) {
    super({
      workerUrl: "http://test.invalid",
      roomCode: "TEST",
      messageQueue: opts.messageQueue,
      campaignManager: opts.campaignManager,
      gameLogger: opts.gameLogger,
    });
    // Pretend we joined a room so connected-only branches in GSM behave normally.
    this.connected = true;
    this.storyStarted = true;
  }

  /** Override: never actually open a WebSocket. */
  connect(): void {
    /* no-op in tests */
  }

  /**
   * Override: capture every outbound message instead of writing to a socket.
   * Records `client:broadcast` payloads (the user-visible events) at top level
   * so assertions can grep them. Other client:* messages (campaign acks etc.)
   * are recorded with their original type for completeness.
   */
  send(msg: Record<string, unknown>): void {
    if (msg.type === "client:broadcast" && msg.payload && typeof msg.payload === "object") {
      const payload = msg.payload as ServerMessage & { type: string };
      this.broadcasts.push({
        ts: new Date().toISOString(),
        type: payload.type,
        payload,
      });
      return;
    }
    this.broadcasts.push({
      ts: new Date().toISOString(),
      type: typeof msg.type === "string" ? msg.type : "unknown",
      payload: msg,
    });
  }

  /**
   * Override: don't actually wait for a real player to roll dice.
   * Auto-resolve immediately with a successful no-op result so combat scenarios
   * don't hang. Real check semantics belong in a richer scenario harness later.
   */
  override sendCheckRequest(params: {
    notation: string;
    checkType?: string;
    targetCharacter: string;
    dc?: number;
    reason: string;
  }): Promise<CheckResult> {
    return Promise.resolve({
      requestId: "test-check-" + Math.random().toString(36).slice(2, 10),
      roll: {
        id: crypto.randomUUID(),
        rolls: [{ die: 20, result: 15 }],
        modifier: 0,
        total: 15,
        label: params.reason,
      },
      success: params.dc === undefined ? true : 15 >= params.dc,
      characterName: params.targetCharacter,
    });
  }

  close(): void {
    /* no-op */
  }
}
