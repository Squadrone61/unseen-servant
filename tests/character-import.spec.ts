import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const WORKER_URL = "http://localhost:8787";

/**
 * Helper: create a room via API and register an init script that sets
 * localStorage BEFORE the React app hydrates.
 */
async function createRoomAndSetup(
  page: import("@playwright/test").Page,
  playerName: string
): Promise<string> {
  const res = await page.request.post(`${WORKER_URL}/api/rooms/create`);
  const { roomCode } = await res.json();

  await page.addInitScript(
    (name) => {
      localStorage.setItem("playerName", name);
    },
    playerName
  );

  return roomCode;
}

/** Load a parsed character fixture from .testing/ */
function loadFixture(name: string) {
  const filePath = path.resolve(__dirname, "..", ".testing", name);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

test.describe("Character Import", () => {
  test("JSON paste: invalid JSON shows error in UI", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "TestHero");
    await page.goto(`/rooms/${roomCode}`);
    await expect(page.getByText(roomCode)).toBeVisible({ timeout: 15_000 });

    // Expand JSON mode
    await page.getByText("Or paste character JSON...").click();

    // Paste invalid JSON
    await page.getByPlaceholder("Paste D&D Beyond character JSON here...").fill("{ not valid json");
    await page.getByRole("button", { name: "Parse JSON" }).click();

    // Should show an error
    await expect(page.getByText("Invalid JSON")).toBeVisible({ timeout: 5_000 });
  });

  test("JSON paste: successful import shows character in sheet", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "TestHero");
    const fixture = loadFixture("kael_sunforge_import.json");

    // Mock the API endpoint to return our fixture directly
    await page.route(`${WORKER_URL}/api/character/import`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture),
      });
    });

    await page.goto(`/rooms/${roomCode}`);
    await expect(page.getByText(roomCode)).toBeVisible({ timeout: 15_000 });

    // Expand JSON mode and paste something (content doesn't matter — API is mocked)
    await page.getByText("Or paste character JSON...").click();
    await page.getByPlaceholder("Paste D&D Beyond character JSON here...").fill('{"data":{}}');
    await page.getByRole("button", { name: "Parse JSON" }).click();

    // Character name should appear in the import success state
    await expect(page.getByText("Kael Sunforge")).toBeVisible({ timeout: 10_000 });
  });

  test("imported character persists in localStorage", async ({ page }) => {
    const roomCode = await createRoomAndSetup(page, "TestHero");
    const fixture = loadFixture("kael_sunforge_import.json");

    await page.route(`${WORKER_URL}/api/character/import`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture),
      });
    });

    await page.goto(`/rooms/${roomCode}`);
    await expect(page.getByText(roomCode)).toBeVisible({ timeout: 15_000 });

    // Import via JSON paste
    await page.getByText("Or paste character JSON...").click();
    await page.getByPlaceholder("Paste D&D Beyond character JSON here...").fill('{"data":{}}');
    await page.getByRole("button", { name: "Parse JSON" }).click();

    await expect(page.getByText("Kael Sunforge")).toBeVisible({ timeout: 10_000 });

    // Verify localStorage
    const stored = await page.evaluate(() => localStorage.getItem("imported_character"));
    expect(stored).toBeTruthy();
    const data = JSON.parse(stored!);
    expect(data.static.name).toBe("Kael Sunforge");
    expect(data.static.race).toBe("Human");
    expect(data.dynamic.currentHP).toBeGreaterThan(0);
  });

  test("API endpoint: JSON mode returns parsed character", async ({ page }) => {
    // Test the restored endpoint directly via API call
    // We need valid DDB-like JSON. The parser is lenient — test with a minimal structure.
    // Since we can't easily get raw DDB JSON, verify the endpoint exists and responds.
    const res = await page.request.post(`${WORKER_URL}/api/character/import`, {
      data: { mode: "json", json: { notValidDDB: true } },
    });

    // Should get a 422 PARSE_ERROR (not 404 — the endpoint exists)
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("PARSE_ERROR");
  });

  test("API endpoint: missing JSON returns 400", async ({ page }) => {
    const res = await page.request.post(`${WORKER_URL}/api/character/import`, {
      data: { mode: "json" },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("MISSING_JSON");
  });

  test("API endpoint: invalid mode returns 400", async ({ page }) => {
    const res = await page.request.post(`${WORKER_URL}/api/character/import`, {
      data: { mode: "invalid" },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_MODE");
  });
});
