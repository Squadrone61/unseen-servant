import { test, expect } from "@playwright/test";

test.describe("Multiplayer", () => {
  test("two players can join the same room and see each other", async ({ browser }) => {
    // Create two separate browser contexts (like two different users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();

    // Create a room via API
    const res = await player1.request.post("http://localhost:8787/api/rooms/create");
    const { roomCode } = await res.json();

    // Set player names via addInitScript (runs before page JS)
    await player1.addInitScript(() => {
      localStorage.setItem("playerName", "Gandalf");
    });
    await player2.addInitScript(() => {
      localStorage.setItem("playerName", "Frodo");
    });

    // --- Player 1 joins ---
    await player1.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player1.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });
    // Player count button in navbar shows "1" after player 1 joins
    await expect(player1.getByRole("button", { name: "1", exact: true })).toBeVisible();

    // --- Player 2 joins ---
    await player2.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player2.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // Both players should see count of 2 in the party button
    await expect(player1.getByRole("button", { name: "2", exact: true })).toBeVisible({
      timeout: 5_000,
    });
    await expect(player2.getByRole("button", { name: "2", exact: true })).toBeVisible();

    // Player names are visible in the party popup — open it on player2's page
    await player2.getByRole("button", { name: "2", exact: true }).click();
    await expect(player2.getByText("Gandalf", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(player2.getByText("Frodo", { exact: true })).toBeVisible();

    // Chat input is disabled pre-story (story requires DM to connect and start)
    // Both players see the disabled placeholder input
    await expect(player1.getByPlaceholder("What do you do?")).toBeDisabled();
    await expect(player2.getByPlaceholder("What do you do?")).toBeDisabled();

    // Cleanup
    await context1.close();
    await context2.close();
  });

  test("second player sees party count update", async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();

    const res = await player1.request.post("http://localhost:8787/api/rooms/create");
    const { roomCode } = await res.json();

    // Set player names
    await player1.addInitScript(() => {
      localStorage.setItem("playerName", "Aragorn");
    });
    await player2.addInitScript(() => {
      localStorage.setItem("playerName", "Gimli");
    });

    // Player 1 joins
    await player1.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player1.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // Party count button in navbar shows "1" after player 1 joins
    await expect(player1.getByRole("button", { name: "1", exact: true })).toBeVisible();

    // Player 2 joins
    await player2.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player2.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // Both should see count of 2 in the party button
    await expect(player1.getByRole("button", { name: "2", exact: true })).toBeVisible({
      timeout: 5_000,
    });
    await expect(player2.getByRole("button", { name: "2", exact: true })).toBeVisible();

    await context1.close();
    await context2.close();
  });
});
