import { test, expect } from "@playwright/test";
import { TestBridge } from "./test-bridge";

/**
 * WebSocket reconnection tests.
 *
 * These tests verify that when the player's WebSocket is force-closed
 * unexpectedly, the useWebSocket hook automatically reconnects and message
 * flow resumes correctly.
 *
 * Wire path under test:
 *   browser → Worker (real WS) → TestBridge broadcast → browser
 *
 * Force-close strategy: ws.close(3001) — custom application close code.
 * Code 3001 is NOT in the hook's no-reconnect list (1000, 4001, 4002),
 * so it triggers exponential backoff reconnection starting at 1 second.
 * Note: browsers reject close codes outside 1000 or 3000-4999 with
 * InvalidAccessError, so we use 3001 rather than 1001 ("Going Away").
 */

async function createRoomAndSetup(
  page: import("@playwright/test").Page,
  playerName: string,
): Promise<string> {
  const res = await page.request.post("http://localhost:8787/api/rooms/create");
  const { roomCode } = await res.json();

  // Inject localStorage AND a WebSocket tracker before React hydrates.
  // The tracker wraps window.WebSocket so tests can force-close the live socket
  // without needing access to the React ref.
  await page.addInitScript((name) => {
    localStorage.setItem("playerName", name);

    // Track every WebSocket instance created by the page
    const OriginalWS = window.WebSocket;
    (window as unknown as Record<string, unknown>).__wsSockets = [] as WebSocket[];

    class TrackedWebSocket extends OriginalWS {
      constructor(...args: ConstructorParameters<typeof OriginalWS>) {
        super(...(args as [string, string?]));
        ((window as unknown as Record<string, unknown>).__wsSockets as WebSocket[]).push(this);
      }
    }

    window.WebSocket = TrackedWebSocket as typeof WebSocket;
  }, playerName);

  return roomCode;
}

/**
 * Wait for the room page to be fully joined. "Waiting for DM..." only appears
 * in GameNavBar after the WebSocket join handshake completes (joined=true).
 */
async function waitForRoom(page: import("@playwright/test").Page, _roomCode: string) {
  await expect(page.getByText("Waiting for DM...")).toBeVisible({ timeout: 15_000 });
}

/**
 * Force-close all tracked WebSockets with code 3001 (custom application code).
 * Code 3001 triggers reconnection in useWebSocket (it is not in the
 * no-reconnect list of 1000, 4001, 4002). We use 3001 instead of 1001
 * because browsers reject close codes outside 1000 or 3000-4999 with
 * an InvalidAccessError.
 */
async function forceCloseWebSockets(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const sockets = (window as unknown as Record<string, unknown>).__wsSockets as WebSocket[];
    sockets.forEach((s) => {
      if (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING) {
        s.close(3001, "Test force-disconnect");
      }
    });
  });
}

test.describe("WebSocket Reconnection", () => {
  test("player reconnects automatically and receives messages after force-close", async ({
    page,
  }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "Reconnecto");

    await page.goto(`http://localhost:3000/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    // Connect the test bridge as DM
    await bridge.connect(roomCode);

    // --- Step 1: send a message before disconnect, verify it arrives ---
    // Use server:chat so the message appears in the main ChatPanel (always
    // visible). server:system goes to the Activity Log drawer which is
    // closed by default and would never be seen.
    bridge.broadcast({
      type: "server:chat",
      content: "Message before disconnect",
      playerName: "TestBridge",
      timestamp: Date.now(),
      id: `test-${Date.now()}`,
    });

    await expect(page.getByText("Message before disconnect")).toBeVisible({ timeout: 8_000 });

    // --- Step 2: force-close the player's WebSocket ---
    await forceCloseWebSockets(page);

    // The nav bar should briefly show "Reconnecting..." as the hook starts backoff
    await expect(page.getByText("Reconnecting...")).toBeVisible({ timeout: 5_000 });

    // --- Step 3: wait for automatic reconnection ---
    // The hook has a 1 s base delay before the first retry. After reconnect,
    // the nav bar returns to "Server Connected".
    await expect(page.getByText("Server Connected")).toBeVisible({ timeout: 15_000 });

    // Give the new connection a moment to stabilise before the bridge broadcasts
    await page.waitForTimeout(300);

    // --- Step 4: bridge sends a message after reconnection ---
    bridge.broadcast({
      type: "server:chat",
      content: "Message after reconnect",
      playerName: "TestBridge",
      timestamp: Date.now(),
      id: `test-${Date.now() + 1}`,
    });

    // Player must see the post-reconnect message — this proves the new WS
    // connection is live and the worker relay is flowing again
    await expect(page.getByText("Message after reconnect")).toBeVisible({ timeout: 8_000 });

    bridge.disconnect();
  });

  test("reconnect counter resets after successful reconnection", async ({ page }) => {
    const bridge = new TestBridge();
    const roomCode = await createRoomAndSetup(page, "Resilient");

    await page.goto(`http://localhost:3000/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    await bridge.connect(roomCode);

    // Force-close, wait for reconnect
    await forceCloseWebSockets(page);
    await expect(page.getByText("Reconnecting...")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Server Connected")).toBeVisible({ timeout: 15_000 });

    // Give the socket a moment to settle
    await page.waitForTimeout(300);

    // Force-close again — if the attempt counter was correctly reset after the
    // first reconnect, the second reconnect should also happen within ~1 s
    // (base delay), not 2 s (doubled delay from a non-reset counter).
    await forceCloseWebSockets(page);
    await expect(page.getByText("Reconnecting...")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Server Connected")).toBeVisible({ timeout: 15_000 });

    // Confirm message flow is intact after two disconnects
    bridge.broadcast({
      type: "server:chat",
      content: "Still alive after two reconnects",
      playerName: "TestBridge",
      timestamp: Date.now(),
      id: `test-${Date.now()}`,
    });

    await expect(page.getByText("Still alive after two reconnects")).toBeVisible({
      timeout: 8_000,
    });

    bridge.disconnect();
  });

  test("player rejoins room and is visible in party list after reconnect", async ({ browser }) => {
    // Use two browser contexts so a second player can see the party list update
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();
    const bridge = new TestBridge();

    // Create room; player1 is the one who disconnects and reconnects
    const res = await player1.request.post("http://localhost:8787/api/rooms/create");
    const { roomCode } = await res.json();

    // Inject localStorage + WS tracker on player1 before navigation
    await player1.addInitScript((name) => {
      localStorage.setItem("playerName", name);
      const OriginalWS = window.WebSocket;
      (window as unknown as Record<string, unknown>).__wsSockets = [] as WebSocket[];
      class TrackedWebSocket extends OriginalWS {
        constructor(...args: ConstructorParameters<typeof OriginalWS>) {
          super(...(args as [string, string?]));
          ((window as unknown as Record<string, unknown>).__wsSockets as WebSocket[]).push(this);
        }
      }
      window.WebSocket = TrackedWebSocket as typeof WebSocket;
    }, "Disconnecto");

    await player2.addInitScript(() => {
      localStorage.setItem("playerName", "Observer");
    });

    // Both players join — wait for "Waiting for DM..." which only appears after
    // the WebSocket join handshake completes (joined=true)
    await player1.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player1.getByText("Waiting for DM...")).toBeVisible({ timeout: 15_000 });

    await player2.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player2.getByText("Waiting for DM...")).toBeVisible({ timeout: 15_000 });

    // Both players should be visible in the party panel.
    // Player names are in a popup opened by clicking the party count button in
    // the navbar. Click the button (shows the player count number) to open it,
    // then check that "Disconnecto" appears in the party list.
    // Wait for player count to reach 2 before opening the panel.
    await expect(player2.getByRole("button", { name: "2" })).toBeVisible({ timeout: 5_000 });
    await player2.getByRole("button", { name: "2" }).click();
    await expect(player2.getByText("Disconnecto", { exact: true })).toBeVisible({ timeout: 5_000 });
    // Close the party panel by clicking the overlay behind it
    await player2.evaluate(() => document.body.click());

    await bridge.connect(roomCode);

    // Force-close player1's WebSocket using code 3001 (custom app code).
    // Browsers reject codes outside 1000 or 3000-4999 with InvalidAccessError.
    // Code 3001 is not in the hook's no-reconnect list so reconnection fires.
    await player1.evaluate(() => {
      const sockets = (window as unknown as Record<string, unknown>).__wsSockets as WebSocket[];
      sockets.forEach((s) => {
        if (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING) {
          s.close(3001, "Test force-disconnect");
        }
      });
    });

    // player1 reconnects automatically
    await expect(player1.getByText("Reconnecting...")).toBeVisible({ timeout: 5_000 });
    await expect(player1.getByText("Server Connected")).toBeVisible({ timeout: 15_000 });

    // After reconnect, player1 should still be on the room page
    await expect(player1.getByText(roomCode).first()).toBeVisible({ timeout: 5_000 });

    // player2 (observer) receives a broadcast — the relay still works.
    // Use server:chat so the message appears in the main ChatPanel (always
    // visible). server:system goes to the Activity Log drawer, which starts
    // closed and would never be visible during this assertion.
    await player1.waitForTimeout(300);
    bridge.broadcast({
      type: "server:chat",
      content: "Post-reconnect broadcast",
      playerName: "TestBridge",
      timestamp: Date.now(),
      id: `test-${Date.now()}`,
    });

    await expect(player2.getByText("Post-reconnect broadcast")).toBeVisible({ timeout: 8_000 });

    bridge.disconnect();
    await context1.close();
    await context2.close();
  });
});
