import { WebSocket } from "ws";

/**
 * TestBridge connects to the Cloudflare Worker as a DM participant via
 * WebSocket, enabling Playwright tests that exercise the real wire path:
 *
 *   browser → worker → (bridge.broadcast) → browser
 *
 * This replaces the __testInjectMessage injection pattern for tests that
 * need to verify behaviour across the full WebSocket + Zod relay stack.
 *
 * Usage:
 *   const bridge = new TestBridge();
 *   await bridge.connect(roomCode);
 *   bridge.broadcast({ type: "server:combat_update", ... });
 *   await page.waitForTimeout(500); // allow relay propagation
 *   bridge.disconnect();
 */
export class TestBridge {
  private ws: WebSocket | null = null;
  private messages: unknown[] = [];
  private messageListeners: Array<(msg: unknown) => void> = [];

  constructor(private workerUrl = "http://localhost:8787") {}

  /**
   * Connect to a room as the DM bridge.
   * Sends client:join with isDM=true, then client:dm_config once joined.
   * Resolves when the server:room_joined acknowledgement arrives.
   */
  async connect(roomCode: string): Promise<void> {
    const wsUrl = this.workerUrl.replace(/^http/, "ws") + `/api/rooms/${roomCode}/ws`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.on("open", () => {
        // Send join as DM — isDM flag makes the worker accept client:broadcast
        this.ws!.send(
          JSON.stringify({
            type: "client:join",
            playerName: "DM",
            roomCode,
            isDM: true,
            guestId: "test-dm-bridge",
          }),
        );
      });

      this.ws.on("message", (data) => {
        let msg: unknown;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        this.messages.push(msg);

        // After room_joined, announce DM config so players see "DM connected"
        if ((msg as { type: string }).type === "server:room_joined") {
          this.ws!.send(
            JSON.stringify({
              type: "client:dm_config",
              provider: "test-bridge",
              supportsTools: true,
            }),
          );
          resolve();
        }

        for (const listener of this.messageListeners) {
          listener(msg);
        }
      });

      this.ws.on("error", (err) => {
        reject(new Error(`TestBridge WebSocket error: ${err.message}`));
      });

      const timer = setTimeout(() => {
        reject(new Error("TestBridge connection timeout after 10 s"));
      }, 10_000);

      // Clean up the timeout once we resolve or reject
      this.ws.once("close", () => clearTimeout(timer));
    });
  }

  /**
   * Broadcast a server message to all players via the worker relay.
   * The worker's handleBroadcast validates session.isDM before relaying,
   * so this only works after a successful connect().
   */
  broadcast(payload: Record<string, unknown>, targets?: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("TestBridge not connected — call connect() first");
    }
    const msg: Record<string, unknown> = { type: "client:broadcast", payload };
    if (targets) msg.targets = targets;
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Wait for a message matching predicate, checking already-received messages
   * first so callers that arrive late don't miss events.
   */
  waitForMessage(predicate: (msg: unknown) => boolean, timeoutMs = 5_000): Promise<unknown> {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.messageListeners = this.messageListeners.filter((l) => l !== listener);
        reject(new Error("TestBridge.waitForMessage timeout"));
      }, timeoutMs);

      const listener = (msg: unknown) => {
        if (predicate(msg)) {
          clearTimeout(timer);
          this.messageListeners = this.messageListeners.filter((l) => l !== listener);
          resolve(msg);
        }
      };

      this.messageListeners.push(listener);
    });
  }

  /** Disconnect and reset state. Safe to call multiple times. */
  disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close(1000, "Test complete");
      } catch {
        // Already closing
      }
      this.ws = null;
    }
    this.messages = [];
    this.messageListeners = [];
  }
}
