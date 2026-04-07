import { test, expect } from "@playwright/test";

test.describe("Room Browser", () => {
  test("renders browse rooms page", async ({ page }) => {
    await page.goto("/rooms");

    // "Browse Rooms" appears in the TopBar breadcrumb (a <li> element, not a heading)
    await expect(page.getByText("Browse Rooms")).toBeVisible();

    // Refresh button is present in the TopBar
    await expect(page.getByRole("button", { name: /Refresh/ })).toBeVisible();

    // Home icon link is present (icon-only, no "Back to Home" text)
    await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
  });

  test("shows empty state or room list", async ({ page }) => {
    await page.goto("/rooms");

    // Wait for loading to finish
    await expect(page.getByText("Loading rooms...")).toBeHidden({
      timeout: 10_000,
    });

    // Should show either "No active rooms" empty state or room cards (div with Join button)
    const noRooms = page.getByText("No active rooms");
    const roomCards = page.getByRole("button", { name: "Join" });

    const hasNoRooms = await noRooms.isVisible().catch(() => false);
    const hasRooms = (await roomCards.count()) > 0;
    expect(hasNoRooms || hasRooms).toBeTruthy();
  });

  test("created room appears in browser", async ({ page, browser }) => {
    // Create a room via API
    const res = await page.request.post("http://localhost:8787/api/rooms/create");
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

  test("home icon link navigates to home", async ({ page }) => {
    await page.goto("/rooms");

    // The TopBar has an icon-only Home link (no "Back to Home" text)
    await page.getByRole("link", { name: "Home" }).click();

    await page.waitForURL("/", { timeout: 5_000 });
    await expect(page.locator("h1")).toHaveText("Unseen Servant");
  });
});
