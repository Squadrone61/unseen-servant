import { test, expect } from "@playwright/test";

test.describe("Room Browser", () => {
  test("renders browse rooms page", async ({ page }) => {
    await page.goto("/rooms");

    // Heading
    await expect(
      page.getByRole("heading", { name: "Browse Rooms" })
    ).toBeVisible();

    // Subtitle
    await expect(page.getByText("Join an active game session")).toBeVisible();

    // Back link
    await expect(
      page.getByRole("link", { name: /Back to Home/ })
    ).toBeVisible();
  });

  test("shows empty state or room list", async ({ page }) => {
    await page.goto("/rooms");

    // Wait for loading to finish
    await expect(page.getByText("Loading rooms...")).toBeHidden({
      timeout: 10_000,
    });

    // Should show either "No active rooms" or room cards
    const noRooms = page.getByText("No active rooms");
    const roomCards = page.locator("button.bg-gray-800");

    const hasNoRooms = await noRooms.isVisible().catch(() => false);
    const hasRooms = (await roomCards.count()) > 0;
    expect(hasNoRooms || hasRooms).toBeTruthy();
  });

  test("created room appears in browser", async ({ page, browser }) => {
    // Create a room via API
    const res = await page.request.post(
      "http://localhost:8787/api/rooms/create"
    );
    const { roomCode } = await res.json();

    // Use a separate context to join the room (keeps it alive)
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await playerPage.addInitScript(() => {
      localStorage.setItem("playerName", "BrowseTest");
    });
    await playerPage.goto(`http://localhost:3000/rooms/${roomCode}`);

    // Wait for the player to join the room
    await expect(playerPage.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // Now browse rooms on the original page
    await page.goto("/rooms");
    await expect(page.getByText("Loading rooms...")).toBeHidden({
      timeout: 10_000,
    });

    // The room code should appear in the listing
    await expect(page.getByText(roomCode).first()).toBeVisible({
      timeout: 5_000,
    });

    await playerCtx.close();
  });

  test("back to home link works", async ({ page }) => {
    await page.goto("/rooms");

    await page.getByRole("link", { name: /Back to Home/ }).click();

    await page.waitForURL("/", { timeout: 5_000 });
    await expect(page.locator("h1")).toHaveText("Unseen Servant");
  });
});
