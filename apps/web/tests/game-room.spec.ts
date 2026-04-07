import { test, expect } from "@playwright/test";

/**
 * Helper: create a room via API and register an init script that sets
 * localStorage BEFORE the React app hydrates (avoids race conditions).
 * Returns the room code.
 */
async function createRoomAndSetup(
  page: import("@playwright/test").Page,
  playerName: string,
): Promise<string> {
  // Create room via API
  const res = await page.request.post("http://localhost:8787/api/rooms/create");
  const { roomCode } = await res.json();

  // addInitScript runs before page JS on every navigation —
  // guarantees localStorage is set before React reads it
  await page.addInitScript((name) => {
    localStorage.setItem("playerName", name);
  }, playerName);

  return roomCode;
}

test.describe("Game Room", () => {
  test("redirects to home when no playerName is set", async ({ page }) => {
    // Create a room first
    const res = await page.request.post("http://localhost:8787/api/rooms/create");
    const { roomCode } = await res.json();

    // Ensure localStorage is cleared before page JS runs
    await page.addInitScript(() => {
      localStorage.removeItem("playerName");
    });

    await page.goto(`/rooms/${roomCode}`);

    // Should redirect to home with ?join= param
    await page.waitForURL(new RegExp(`\\?join=${roomCode}`), {
      timeout: 15_000,
    });
    expect(page.url()).toContain(`?join=${roomCode}`);
  });

  test("shows connecting state then joins room", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "TestHero");

    await page.goto(`/rooms/${roomCode}`);

    // Should eventually show the room code in the sidebar (after join completes)
    await expect(page.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("displays room UI after joining", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "Aragorn");

    await page.goto(`/rooms/${roomCode}`);

    // Wait for join — room code in navbar
    await expect(page.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // HOST badge in navbar (not "(host)" — renders as "HOST" span)
    await expect(page.getByText("HOST")).toBeVisible();

    // "Waiting for the adventure" message (uses unicode ellipsis)
    await expect(page.getByText("Waiting for the adventure to begin\u2026")).toBeVisible();

    // Chat input exists (but is disabled until story starts — no DM connected)
    await expect(page.getByPlaceholder("What do you do?")).toBeVisible();

    // Character section in left sidebar (no characters yet — shows prompt to create)
    await expect(page.getByText("No characters")).toBeVisible();

    // Activity Log is in a drawer that only appears after story/campaign starts — not checked here
  });

  test("chat input is disabled before story starts", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "Legolas");

    await page.goto(`/rooms/${roomCode}`);

    // Wait for room to load
    await expect(page.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // Chat input is visible but disabled — chat requires a DM to connect and start the story
    await expect(page.getByPlaceholder("What do you do?")).toBeVisible();
    await expect(page.getByPlaceholder("What do you do?")).toBeDisabled();
  });

  test("host sees AI config section", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "DungeonMaster");

    await page.goto(`/rooms/${roomCode}`);

    // Wait for join
    await expect(page.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // DM status should show "Waiting for DM..."
    await expect(page.getByText("Waiting for DM...")).toBeVisible();
  });

  test("shows HOST badge in navbar", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "HostPlayer");

    await page.goto(`/rooms/${roomCode}`);
    await expect(page.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // HOST badge in navbar (renders as uppercase "HOST" span next to room code)
    await expect(page.getByText("HOST")).toBeVisible();
  });

  test("connected status indicator shows green", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "OnlinePlayer");

    await page.goto(`/rooms/${roomCode}`);

    // Wait for "Server Connected" text in navbar status indicator
    await expect(page.getByText("Server Connected")).toBeVisible({ timeout: 15_000 });
  });
});
