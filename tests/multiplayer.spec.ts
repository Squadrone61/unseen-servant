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
    await expect(player1.getByText("Gandalf", { exact: true })).toBeVisible();

    // --- Player 2 joins ---
    await player2.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player2.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // Player 2 should see both players
    await expect(player2.getByText("Gandalf", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(player2.getByText("Frodo", { exact: true })).toBeVisible();

    // Player 1 should also see both players
    await expect(player1.getByText("Frodo", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(player1.getByText("Gandalf", { exact: true })).toBeVisible();

    // --- Chat test: Player 1 sends, Player 2 sees ---
    await player1.getByPlaceholder("What do you do?").fill("I cast fireball!");
    await player1.getByRole("button", { name: "Send" }).click();

    // Player 1 sees own message (echoed back from server)
    await expect(player1.getByText("I cast fireball!")).toBeVisible({
      timeout: 10_000,
    });

    // Player 2 sees the message too
    await expect(player2.getByText("I cast fireball!")).toBeVisible({
      timeout: 5_000,
    });

    // --- Chat test: Player 2 sends, Player 1 sees ---
    await player2.getByPlaceholder("What do you do?").fill("I dodge!");
    await player2.getByRole("button", { name: "Send" }).click();

    await expect(player2.getByText("I dodge!")).toBeVisible({
      timeout: 10_000,
    });
    await expect(player1.getByText("I dodge!")).toBeVisible({
      timeout: 5_000,
    });

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

    // Party count should show 1
    await expect(player1.getByText("Party (1)")).toBeVisible();

    // Player 2 joins
    await player2.goto(`http://localhost:3000/rooms/${roomCode}`);
    await expect(player2.getByText(roomCode).first()).toBeVisible({
      timeout: 15_000,
    });

    // Both should show Party (2)
    await expect(player1.getByText("Party (2)")).toBeVisible({
      timeout: 5_000,
    });
    await expect(player2.getByText("Party (2)")).toBeVisible();

    await context1.close();
    await context2.close();
  });
});
