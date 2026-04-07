import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/");
  });

  test("renders all core elements", async ({ page }) => {
    // Title
    await expect(page.locator("h1")).toHaveText("Unseen Servant");

    // Subtitle
    await expect(page.getByText("D&D 5E WITH AN AI GAME MASTER")).toBeVisible();

    // Character Name input
    await expect(page.getByPlaceholder("What should we call you?")).toBeVisible();

    // Create Room section + button
    await expect(page.getByText("Create Room", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Room" })).toBeVisible();

    // Join Room section + button
    await expect(page.getByText("Join Room", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Join Room" })).toBeVisible();

    // Browse all rooms link
    await expect(page.getByRole("link", { name: "Browse all →" })).toBeVisible();

    // Guest auth state
    await expect(page.getByText("Playing as guest")).toBeVisible();

    // Google sign-in button
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  });

  test("character name input works and persists to localStorage", async ({ page }) => {
    const nameInput = page.getByPlaceholder("What should we call you?");

    // Type a character name
    await nameInput.fill("Gandalf");
    await expect(nameInput).toHaveValue("Gandalf");

    // Wait for debounce (500ms) + buffer
    await page.waitForTimeout(700);

    // Check localStorage
    const storedName = await page.evaluate(() => localStorage.getItem("playerName"));
    expect(storedName).toBe("Gandalf");

    // Reload and verify it persists
    await page.reload();
    await expect(page.getByPlaceholder("What should we call you?")).toHaveValue("Gandalf");
  });

  test("create room shows error without character name", async ({ page }) => {
    await page.getByRole("button", { name: "Create Room" }).click();
    await expect(page.getByText("Enter your player name")).toBeVisible();
  });

  test("create room navigates to room page", async ({ page }) => {
    // Enter a character name first
    await page.getByPlaceholder("What should we call you?").fill("TestHero");
    await page.waitForTimeout(600); // debounce

    // Click Create Room
    await page.getByRole("button", { name: "Create Room" }).click();

    // Should navigate to /rooms/XXXXXX (6-char code)
    await page.waitForURL(/\/rooms\/[A-Z0-9]{6}$/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/rooms\/[A-Z0-9]{6}$/);
  });

  test("join room validates empty room code", async ({ page }) => {
    await page.getByPlaceholder("What should we call you?").fill("TestHero");
    await page.waitForTimeout(600);

    // Click Join with empty code
    await page.getByRole("button", { name: "Join Room" }).click();
    await expect(page.getByText("Room code must be 6 characters")).toBeVisible();
  });

  test("join room validates short room code", async ({ page }) => {
    await page.getByPlaceholder("What should we call you?").fill("TestHero");
    await page.getByPlaceholder("ABCDEF").fill("ABC");

    await page.getByRole("button", { name: "Join Room" }).click();
    await expect(page.getByText("Room code must be 6 characters")).toBeVisible();
  });

  test("join room validates missing character name", async ({ page }) => {
    await page.getByPlaceholder("ABCDEF").fill("ABCDEF");

    await page.getByRole("button", { name: "Join Room" }).click();
    await expect(page.getByText("Enter your player name")).toBeVisible();
  });

  test("room code input uppercases and limits to 6 chars", async ({ page }) => {
    const codeInput = page.getByPlaceholder("ABCDEF");
    await codeInput.fill("abcdefgh");
    // Should be uppercased and truncated to 6
    await expect(codeInput).toHaveValue("ABCDEF");
  });

  // TODO: "MCP bridge" info text was removed from the homepage in a UI cleanup pass.
  // test("shows MCP bridge info for AI setup", async ({ page }) => {
  //   await expect(page.getByText("MCP bridge")).toBeVisible();
  // });
});
