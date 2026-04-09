/**
 * E2E: Complete character builder flow — Human / Soldier / Fighter / Standard Array
 * Requested by QA lead for manual verification with screenshots.
 * Screenshots go to .testing/e2e-builder-*.png (gitignored).
 *
 * Prerequisites: dev servers running (`pnpm dev:all`)
 */

import { test, expect, type Page } from "@playwright/test";
import path from "path";

const SCREENSHOT_DIR = path.resolve(__dirname, "../../../.testing");

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `e2e-builder-${name}.png`),
    fullPage: false,
  });
}

test("Human / Soldier / Fighter / Standard Array — full builder flow", async ({ page }) => {
  // ── Step 1: Navigate to /characters/create ────────────────────────────────
  // Clear any saved characters first so tests start fresh
  await page.goto("/characters/create");
  await page.evaluate(() => {
    localStorage.removeItem("characterLibrary");
  });
  await page.goto("/characters/create");
  await page.waitForLoadState("networkidle");

  // ── Step 2: Screenshot — initial layout ───────────────────────────────────
  await shot(page, "01-initial-layout");

  // Verify we're on the Species step
  await expect(page.getByRole("heading", { name: "Choose Your Species" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Species" })).toHaveAttribute(
    "aria-current",
    "step",
  );

  // ── Step 3-4: Species — select Human ──────────────────────────────────────
  // Human is in the grid — no traits/choices so it's the simplest selection
  const speciesSearch = page.getByPlaceholder("Search species...");
  await speciesSearch.fill("Human");
  await page.waitForTimeout(200);

  // EntityGrid renders each item in a div[role="button"] wrapper
  const humanBtn = page
    .getByRole("button")
    .filter({ hasText: /^Human/ })
    .first();
  await humanBtn.waitFor({ state: "visible" });
  await humanBtn.click();
  await page.waitForTimeout(300);

  await shot(page, "02-human-selected");

  // Human card should now be selected (aria-pressed="true")
  await expect(humanBtn).toHaveAttribute("aria-pressed", "true");

  // Background step should unlock
  await expect(page.getByRole("button", { name: "Background" })).not.toBeDisabled();

  // ── Step 5-7: Background — Soldier ────────────────────────────────────────
  await page.getByRole("button", { name: "Background" }).click();
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Choose Your Background" })).toBeVisible();

  const bgSearch = page.getByPlaceholder("Search backgrounds...");
  await bgSearch.fill("Soldier");
  await page.waitForTimeout(200);

  const soldierBtn = page
    .getByRole("button")
    .filter({ hasText: /^Soldier/ })
    .first();
  await soldierBtn.waitFor({ state: "visible" });
  await soldierBtn.click();
  await page.waitForTimeout(300);

  await shot(page, "03-soldier-selected");

  // Soldier should be selected
  await expect(soldierBtn).toHaveAttribute("aria-pressed", "true");

  // Ability score distribution section should appear (all backgrounds have it)
  await expect(page.getByText("Ability Score Distribution")).toBeVisible();

  // ── Step 8-12: Class — Fighter, Athletics + Perception ────────────────────
  await page.getByRole("button", { name: "Class" }).click();
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Choose Your Class" })).toBeVisible();

  const classSearch = page.getByPlaceholder("Search classes...");
  await classSearch.fill("Fighter");
  await page.waitForTimeout(200);

  const fighterBtn = page
    .getByRole("button")
    .filter({ hasText: /^Fighter/ })
    .first();
  await fighterBtn.waitFor({ state: "visible" });
  await fighterBtn.click();
  await page.waitForTimeout(300);

  await shot(page, "04-fighter-selected");

  // Fighter card selected
  await expect(fighterBtn).toHaveAttribute("aria-pressed", "true");

  // Level picker visible
  await expect(page.getByRole("group", { name: "Character level" })).toBeVisible();

  await shot(page, "05-fighter-level-picker");

  // Pick 2 skills: Athletics and Perception
  // ChoicePicker renders skill pills as role="option" or role="button"
  // The Fighter skill list includes Athletics and Perception
  const athleticsOption = page.getByRole("option", { name: /^Athletics$/i });
  const perceptionOption = page.getByRole("option", { name: /^Perception$/i });

  const athlVisible = await athleticsOption.isVisible().catch(() => false);
  if (athlVisible) {
    await athleticsOption.click();
    await perceptionOption.click();
  } else {
    // ChoicePicker may use a different pattern — try button pills
    const athlBtn = page.getByRole("button", { name: /^Athletics$/i }).first();
    const percBtn = page.getByRole("button", { name: /^Perception$/i }).first();
    await athlBtn.click();
    await percBtn.click();
  }

  await page.waitForTimeout(300);
  await shot(page, "06-skills-athletics-perception");

  // ── Step 13-15: Abilities — Standard Array ────────────────────────────────
  await page.getByRole("button", { name: "Abilities" }).click();
  await page.waitForLoadState("networkidle");

  // Use the step's H1 specifically to avoid matching the live preview "Ability Scores" H3
  await expect(page.getByRole("heading", { name: "Ability Scores", level: 1 })).toBeVisible();

  await shot(page, "07-abilities-step");

  // Standard Array should be selected by default (or select it)
  const standardArrayRadio = page.getByRole("radio", { name: "Standard Array" });
  await standardArrayRadio.click();
  await page.waitForTimeout(200);

  await shot(page, "08-standard-array");

  // Verify it's selected
  await expect(standardArrayRadio).toHaveAttribute("aria-checked", "true");

  // Ability score rows should be visible
  await expect(page.getByText("STR", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("DEX", { exact: true }).first()).toBeVisible();

  // ── Step 16-18: Details — "Gareth Ironforge" ─────────────────────────────
  await page.getByRole("button", { name: "Details" }).click();
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Character Details" })).toBeVisible();

  await shot(page, "09-details-step");

  const nameInput = page.getByLabel("Name");
  await nameInput.fill("Gareth Ironforge");
  await page.waitForTimeout(200);

  await shot(page, "10-details-name-gareth");

  await expect(nameInput).toHaveValue("Gareth Ironforge");

  // ── Step 19-20: Live Preview ───────────────────────────────────────────────
  // Scroll back to view the right panel live preview
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "11-live-preview-visible");

  // The live preview panel shows computed stats — with class + abilities set it should
  // show HP and AC values (not just the empty state)
  const previewPanel = page.locator("aside").last(); // LivePreview is the rightmost aside
  await expect(previewPanel.getByText("Character Preview")).toBeVisible();

  // ── Step 21-22: Finish ────────────────────────────────────────────────────
  const finishBtn = page.getByRole("button", { name: "Finish", exact: true }).first();
  await finishBtn.click();

  // Should redirect to /characters
  await page.waitForURL(/\/characters$/, { timeout: 10_000 });
  await page.waitForLoadState("networkidle");

  await shot(page, "12-characters-page-saved");

  // Verify we landed on /characters
  await expect(page.url()).toMatch(/\/characters$/);

  // "Gareth Ironforge" should be visible in the character list
  await expect(page.getByText("Gareth Ironforge", { exact: true })).toBeVisible({ timeout: 5_000 });
});
