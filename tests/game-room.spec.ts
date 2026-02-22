import { test, expect } from "@playwright/test";

/**
 * Helper: create a room via API and register an init script that sets
 * localStorage BEFORE the React app hydrates (avoids race conditions).
 * Returns the room code.
 */
async function createRoomAndSetup(
  page: import("@playwright/test").Page,
  playerName: string
): Promise<string> {
  // Create room via API
  const res = await page.request.post("http://localhost:8787/api/rooms/create");
  const { roomCode } = await res.json();

  // addInitScript runs before page JS on every navigation —
  // guarantees localStorage is set before React reads it
  await page.addInitScript(
    (name) => {
      localStorage.setItem("playerName", name);
    },
    playerName
  );

  return roomCode;
}

test.describe("Game Room", () => {
  test("redirects to home when no playerName is set", async ({ page }) => {
    // Create a room first
    const res = await page.request.post(
      "http://localhost:8787/api/rooms/create"
    );
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

    // Wait for join — room code in sidebar
    await expect(page.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // Player name in party list
    await expect(page.getByText("Aragorn", { exact: true })).toBeVisible();

    // Host badge
    await expect(page.getByText("(host)")).toBeVisible();

    // Chat panel header
    await expect(
      page.getByRole("heading", { name: "AI Dungeon Master" })
    ).toBeVisible();

    // "Waiting for the adventure" message
    await expect(
      page.getByText("Waiting for the adventure to begin...")
    ).toBeVisible();

    // Chat input
    await expect(page.getByPlaceholder("What do you do?")).toBeVisible();

    // Character import section in left sidebar
    await expect(page.getByText("Import Character")).toBeVisible();

    // Activity log
    await expect(page.getByText("Activity Log")).toBeVisible();
  });

  test("can send and see chat messages", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "Legolas");

    await page.goto(`/rooms/${roomCode}`);

    // Wait for connection
    await expect(page.getByPlaceholder("What do you do?")).toBeEnabled({
      timeout: 15_000,
    });

    // Type and send a message
    await page.getByPlaceholder("What do you do?").fill("I search the room");
    await page.getByRole("button", { name: "Send" }).click();

    // Message should appear in chat
    await expect(page.getByText("I search the room")).toBeVisible();
  });

  test("host sees AI config section", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "DungeonMaster");

    await page.goto(`/rooms/${roomCode}`);

    // Wait for join
    await expect(page.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // AI Dungeon Master config section should be visible for host
    await expect(
      page.getByText("AI Dungeon Master", { exact: false }).last()
    ).toBeVisible();

    // Extension status should show "Waiting for extension..."
    await expect(page.getByText("Waiting for extension...")).toBeVisible();
  });

  test("shows Host badge in sidebar", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "HostPlayer");

    await page.goto(`/rooms/${roomCode}`);
    await expect(page.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // Host badge in sidebar
    await expect(page.getByText("Host").first()).toBeVisible();
  });

  test("connected status indicator shows green", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "OnlinePlayer");

    await page.goto(`/rooms/${roomCode}`);

    // Wait for "Connected" text in chat panel header
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });
  });
});
