import { test, expect } from "@playwright/test";

/**
 * Helper: create a room via API and register an init script that sets
 * localStorage BEFORE the React app hydrates.
 */
async function createRoomAndSetup(
  page: import("@playwright/test").Page,
  playerName: string,
): Promise<string> {
  const res = await page.request.post("http://localhost:8787/api/rooms/create");
  const { roomCode } = await res.json();

  await page.addInitScript((name) => {
    localStorage.setItem("playerName", name);
  }, playerName);

  return roomCode;
}

/** Wait for room to fully load (room code visible in sidebar). */
async function waitForRoom(page: import("@playwright/test").Page, roomCode: string) {
  await expect(page.getByText(roomCode).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Event Log", () => {
  test("Event Log section is not visible when no events exist", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "EventHost");
    await page.goto(`/rooms/${roomCode}`);
    await waitForRoom(page, roomCode);

    // Event Log heading should not be rendered (eventLog is empty on a fresh room)
    await expect(page.getByText("Event Log", { exact: true })).not.toBeVisible();
  });

  test("non-host player does not see Event Log section", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const host = await ctx1.newPage();
    const player = await ctx2.newPage();

    const res = await host.request.post("http://localhost:8787/api/rooms/create");
    const { roomCode } = await res.json();

    await host.addInitScript(() => {
      localStorage.setItem("playerName", "EventLogHost");
    });
    await player.addInitScript(() => {
      localStorage.setItem("playerName", "EventLogPlayer");
    });

    // Host joins first
    await host.goto(`http://localhost:3000/rooms/${roomCode}`);
    await waitForRoom(host, roomCode);

    // Player joins
    await player.goto(`http://localhost:3000/rooms/${roomCode}`);
    await waitForRoom(player, roomCode);

    // Neither should see Event Log (no events yet), but more importantly
    // the section is host-only — verify player doesn't see it
    await expect(player.getByText("Event Log", { exact: true })).not.toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });
});
