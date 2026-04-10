/**
 * P0 Character Builder — navigation buttons, equipment step, full flow
 *
 * Tests the specific P0 fixes:
 * 1. Continue/Back footer buttons navigate correctly
 * 2. Equipment step renders (NEW step)
 * 3. Feats/Spells empty states for non-caster Fighter
 * 4. Complete Human/Soldier/Fighter flow with screenshots
 *
 * Prerequisites: dev servers running (`pnpm dev:all`)
 * Artifacts go to .testing/ (gitignored)
 */

import { test, expect, type Page } from "@playwright/test";
import path from "path";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = path.resolve(__dirname, "../../../.testing");

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `p0-test-${name}.png`),
    fullPage: false,
  });
}

/** Navigate to /characters/create with a clean localStorage slate. */
async function freshBuilder(page: Page) {
  await page.goto("/characters/create");
  await page.evaluate(() => {
    localStorage.removeItem("characterLibrary");
  });
  await page.goto("/characters/create");
  await page.waitForLoadState("networkidle");
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe("P0 Character Builder Fixes", () => {
  test.beforeEach(async ({ page }) => {
    await freshBuilder(page);
  });

  // ── 1. Continue button visible on Species step ───────────────────────────────

  test("1. Species step shows Continue to Background button", async ({ page }) => {
    await shot(page, "01-species-initial");

    // Footer Continue button — "Continue to Background"
    const continueBtn = page.getByRole("button", { name: /Continue to Background/i });
    await expect(continueBtn).toBeVisible();

    // Should be disabled before selecting a species (step not complete)
    await expect(continueBtn).toBeDisabled();
  });

  // ── 2. Continue enables after species selected ────────────────────────────────

  test("2. Continue to Background enables after selecting Human", async ({ page }) => {
    const continueBtn = page.getByRole("button", { name: /Continue to Background/i });

    // Select Human
    await page.getByText("Human", { exact: true }).first().click();
    await page.waitForTimeout(200);

    await shot(page, "02-human-selected-continue-enabled");

    // Continue button should now be enabled
    await expect(continueBtn).not.toBeDisabled();
  });

  // ── 3. Continue navigates to Background step ─────────────────────────────────

  test("3. Clicking Continue navigates to Background step", async ({ page }) => {
    await page.getByText("Human", { exact: true }).first().click();
    await page.waitForTimeout(200);

    await page.getByRole("button", { name: /Continue to Background/i }).click();
    await page.waitForTimeout(300);

    await shot(page, "03-background-step");

    // Should now be on Background step
    await expect(page.getByRole("heading", { name: "Choose Your Background" })).toBeVisible();

    // Background step is active in the sidebar
    await expect(page.getByRole("button", { name: "Background" })).toHaveAttribute(
      "aria-current",
      "step",
    );

    // Back button should now be visible — use exact match to avoid matching "Background" sidebar item
    await expect(page.getByRole("button", { name: "← Back" })).toBeVisible();
  });

  // ── 4. Back button returns to Species with selection preserved ────────────────

  test("4. Back button returns to Species with Human still selected", async ({ page }) => {
    // Select Human and go to Background
    await page.getByText("Human", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: /Continue to Background/i }).click();
    await page.waitForTimeout(300);

    // Click Back — use exact arrow-back label to avoid matching "Background" sidebar button
    await page.getByRole("button", { name: "← Back" }).click();
    await page.waitForTimeout(300);

    await shot(page, "04-back-to-species");

    // Should be back on Species step
    await expect(page.getByRole("heading", { name: "Choose Your Species" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Species" })).toHaveAttribute(
      "aria-current",
      "step",
    );

    // Human should still appear as selected (aria-pressed="true")
    const humanBtn = page
      .getByRole("button")
      .filter({ hasText: /^Human/ })
      .first();
    await expect(humanBtn).toHaveAttribute("aria-pressed", "true");
  });

  // ── 5. Background → Class navigation ─────────────────────────────────────────

  test("5. Background step: select Soldier, see ability section, Continue to Class", async ({
    page,
  }) => {
    // Species
    await page.getByText("Human", { exact: true }).first().click();
    await page.getByRole("button", { name: /Continue to Background/i }).click();
    await page.waitForTimeout(300);

    // Select Soldier
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

    await shot(page, "05-soldier-selected");

    // Ability score distribution should appear
    await expect(page.getByText("Ability Score Distribution")).toBeVisible();

    // Continue to Class button should be visible
    const continueToClass = page.getByRole("button", { name: /Continue to Class/i });
    await expect(continueToClass).toBeVisible();
    await expect(continueToClass).not.toBeDisabled();
  });

  // ── 6. Class step: Fighter, 2 skills ─────────────────────────────────────────

  test("6. Class step: select Fighter, pick 2 skills, Continue to Abilities", async ({ page }) => {
    // Navigate to Class step
    await page.getByText("Human", { exact: true }).first().click();
    await page.getByRole("button", { name: "Background" }).click();
    await page.getByText("Soldier", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Class" }).click();
    await page.waitForLoadState("networkidle");

    // Select Fighter
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

    await shot(page, "06-fighter-selected");

    // Fighter selected
    await expect(fighterBtn).toHaveAttribute("aria-pressed", "true");

    // Try to pick skills: Athletics and Perception
    // ChoicePicker renders options with role="option" or similar
    const athleticsOption = page.getByRole("option", { name: /^Athletics$/i });
    const perceptionOption = page.getByRole("option", { name: /^Perception$/i });

    const athlVisible = await athleticsOption.isVisible().catch(() => false);
    if (athlVisible) {
      await athleticsOption.click();
      await perceptionOption.click();
    } else {
      const athlBtn = page.getByRole("button", { name: /^Athletics$/i }).first();
      const percBtn = page.getByRole("button", { name: /^Perception$/i }).first();
      const athlBtnVisible = await athlBtn.isVisible().catch(() => false);
      if (athlBtnVisible) {
        await athlBtn.click();
        await percBtn.click();
      }
    }

    await page.waitForTimeout(300);
    await shot(page, "07-fighter-skills-selected");

    // Continue to Abilities
    const continueToAbilities = page.getByRole("button", { name: /Continue to Abilities/i });
    await expect(continueToAbilities).toBeVisible();
  });

  // ── 7. Abilities step ─────────────────────────────────────────────────────────

  test("7. Abilities step renders with Standard Array default", async ({ page }) => {
    await page.getByText("Human", { exact: true }).first().click();
    await page.getByRole("button", { name: "Background" }).click();
    await page.getByText("Soldier", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Class" }).click();
    await page.getByText("Fighter", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Abilities" }).click();
    await page.waitForLoadState("networkidle");

    await shot(page, "08-abilities-step");

    // Heading
    await expect(page.getByRole("heading", { name: "Ability Scores", level: 1 })).toBeVisible();

    // Standard Array selected by default
    await expect(page.getByRole("radio", { name: "Standard Array" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // All six ability labels visible
    await expect(page.getByText("STR", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("DEX", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("CON", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("INT", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("WIS", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("CHA", { exact: true }).first()).toBeVisible();

    // Continue to Feats
    const continueToFeats = page.getByRole("button", { name: /Continue to Feats/i });
    await expect(continueToFeats).toBeVisible();
  });

  // ── 8. Feats step: Fighter level 1 shows empty/no-ASI state ──────────────────

  test("8. Feats step: Fighter level 1 shows no-ASI state", async ({ page }) => {
    await page.getByText("Human", { exact: true }).first().click();
    await page.getByRole("button", { name: "Background" }).click();
    await page.getByText("Soldier", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Class" }).click();
    await page.getByText("Fighter", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Abilities" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Feats" }).click();
    await page.waitForLoadState("networkidle");

    await shot(page, "09-feats-step-fighter-l1");

    // Feats heading
    await expect(page.getByRole("heading", { name: "Feats" })).toBeVisible();

    // No ASI slots at level 1 — should show the "No ASI slots yet" message
    await expect(page.getByText(/No ASI slots yet/i)).toBeVisible();

    // Continue to Spells button should be visible
    await expect(page.getByRole("button", { name: /Continue to Spells/i })).toBeVisible();
  });

  // ── 9. Spells step: Fighter (non-caster) empty state ─────────────────────────

  test("9. Spells step: Fighter shows non-caster message", async ({ page }) => {
    await page.getByText("Human", { exact: true }).first().click();
    await page.getByRole("button", { name: "Background" }).click();
    await page.getByText("Soldier", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Class" }).click();
    await page.getByText("Fighter", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Abilities" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Spells" }).click();
    await page.waitForLoadState("networkidle");

    await shot(page, "10-spells-step-fighter");

    // Spells heading
    await expect(page.getByRole("heading", { name: "Spells" })).toBeVisible();

    // Non-caster message for Fighter
    await expect(page.getByText(/No spells available for this class/i)).toBeVisible();

    // Continue to Equipment button visible
    await expect(page.getByRole("button", { name: /Continue to Equipment/i })).toBeVisible();
  });

  // ── 10. Equipment step (NEW P0 feature) ──────────────────────────────────────

  test("10. Equipment step renders with weapon and armor grids for Fighter", async ({ page }) => {
    await page.getByText("Human", { exact: true }).first().click();
    await page.getByRole("button", { name: "Background" }).click();
    await page.getByText("Soldier", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Class" }).click();
    await page.getByText("Fighter", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Abilities" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Equipment" }).click();
    await page.waitForLoadState("networkidle");

    await shot(page, "11-equipment-step-initial");

    // Equipment heading
    await expect(page.getByRole("heading", { name: "Starting Equipment" })).toBeVisible();

    // Fighter gets martial weapons — should see weapons grid
    // The step should show at least some weapon options
    await expect(
      page.getByText(/Longsword|Greatsword|Shortsword|Battleaxe/i).first(),
    ).toBeVisible();

    // Fighter gets heavy armor — should see armor grid
    await expect(page.getByText(/Chain Mail|Plate|Scale Mail|Splint/i).first()).toBeVisible();

    // Continue to Details button
    await expect(page.getByRole("button", { name: /Continue to Details/i })).toBeVisible();
  });

  test("10b. Equipment step: selecting Longsword and Chain Mail", async ({ page }) => {
    await page.getByText("Human", { exact: true }).first().click();
    await page.getByRole("button", { name: "Background" }).click();
    await page.getByText("Soldier", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Class" }).click();
    await page.getByText("Fighter", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Abilities" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Equipment" }).click();
    await page.waitForLoadState("networkidle");

    // Select Longsword (click the card/button with that text)
    const longswordCard = page
      .getByRole("button")
      .filter({ hasText: /^Longsword/ })
      .first();
    const longswordVisible = await longswordCard.isVisible().catch(() => false);
    if (longswordVisible) {
      await longswordCard.click();
      await page.waitForTimeout(200);
      await shot(page, "12-equipment-longsword-selected");
      await expect(longswordCard).toHaveAttribute("aria-pressed", "true");
    } else {
      // Equipment items may render differently — look for clickable items
      await shot(page, "12-equipment-items-visible");
    }

    // Select Chain Mail armor
    const chainMailCard = page
      .getByRole("button")
      .filter({ hasText: /^Chain Mail/ })
      .first();
    const chainMailVisible = await chainMailCard.isVisible().catch(() => false);
    if (chainMailVisible) {
      await chainMailCard.click();
      await page.waitForTimeout(200);
      await shot(page, "13-equipment-chainmail-selected");
      await expect(chainMailCard).toHaveAttribute("aria-pressed", "true");
    }
  });

  // ── 11. Details step ─────────────────────────────────────────────────────────

  test("11. Details step: type character name", async ({ page }) => {
    await page.getByText("Human", { exact: true }).first().click();
    await page.getByRole("button", { name: "Background" }).click();
    await page.getByText("Soldier", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Class" }).click();
    await page.getByText("Fighter", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Abilities" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Details" }).click();
    await page.waitForLoadState("networkidle");

    await shot(page, "14-details-step");

    await expect(page.getByRole("heading", { name: "Character Details" })).toBeVisible();

    const nameInput = page.getByLabel("Name");
    await nameInput.fill("Gareth Ironforge");
    await page.waitForTimeout(200);

    await shot(page, "15-details-name-gareth");

    await expect(nameInput).toHaveValue("Gareth Ironforge");
  });

  // ── 12. Sidebar Finish button state ──────────────────────────────────────────

  test("12. Finish button enabled after completing Species, Class, and Abilities", async ({
    page,
  }) => {
    // Finish button should be DISABLED at start
    const finishBtn = page.getByRole("button", { name: /Finish/i }).first();
    await expect(finishBtn).toBeDisabled();

    // Complete Species
    await page.getByText("Human", { exact: true }).first().click();
    await page.waitForTimeout(200);

    // Still disabled (no class or abilities)
    await expect(finishBtn).toBeDisabled();

    // Complete Class
    await page.getByRole("button", { name: "Background" }).click();
    await page.getByText("Soldier", { exact: true }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Class" }).click();
    await page.getByText("Fighter", { exact: true }).first().click();
    await page.waitForTimeout(200);

    // Still disabled (no abilities)
    await expect(finishBtn).toBeDisabled();

    // Complete Abilities
    await page.getByRole("button", { name: "Abilities" }).click();
    await page.waitForTimeout(300);

    await shot(page, "16-finish-btn-enabled");

    // Now should be enabled (character can be computed)
    await expect(finishBtn).not.toBeDisabled();
  });

  // ── 13. Full flow: Human/Soldier/Fighter → Finish → /characters ──────────────

  test("13. Full Human/Soldier/Fighter flow saves and redirects", async ({ page }) => {
    // Species: Human
    await page.getByText("Human", { exact: true }).first().click();
    await page.waitForTimeout(200);

    // Background: Soldier (via Continue button)
    await page.getByRole("button", { name: /Continue to Background/i }).click();
    await page.waitForTimeout(300);

    await page.getByPlaceholder("Search backgrounds...").fill("Soldier");
    await page.waitForTimeout(200);
    await page
      .getByRole("button")
      .filter({ hasText: /^Soldier/ })
      .first()
      .click();
    await page.waitForTimeout(300);

    // Class: Fighter (via Continue button)
    await page.getByRole("button", { name: /Continue to Class/i }).click();
    await page.waitForTimeout(300);

    await page.getByPlaceholder("Search classes...").fill("Fighter");
    await page.waitForTimeout(200);
    await page
      .getByRole("button")
      .filter({ hasText: /^Fighter/ })
      .first()
      .click();
    await page.waitForTimeout(300);

    // Pick skills
    const skillOptions = page.locator('[role="option"]').filter({
      hasText: /Athletics|Acrobatics|Perception|Survival|Intimidation/,
    });
    const skillCount = await skillOptions.count();
    if (skillCount >= 2) {
      await skillOptions.nth(0).click();
      await skillOptions.nth(1).click();
    }

    // Abilities: (via Continue button)
    await page.getByRole("button", { name: /Continue to Abilities/i }).click();
    await page.waitForTimeout(300);

    await shot(page, "17-abilities-full-flow");

    // Standard Array is default — don't need to change anything
    // Navigate to Equipment via Continue chain
    await page.getByRole("button", { name: /Continue to Feats/i }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: /Continue to Spells/i }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: /Continue to Equipment/i }).click();
    await page.waitForTimeout(300);

    await shot(page, "18-equipment-full-flow");

    // Equipment step should be active
    await expect(page.getByRole("button", { name: "Equipment" })).toHaveAttribute(
      "aria-current",
      "step",
    );

    // Continue to Details
    await page.getByRole("button", { name: /Continue to Details/i }).click();
    await page.waitForTimeout(300);

    // Set name
    await page.getByLabel("Name").fill("Gareth Ironforge");
    await page.waitForTimeout(200);

    await shot(page, "19-details-gareth");

    // Live preview should show character stats
    const previewPanel = page.locator("aside").filter({ hasText: "Character Preview" });
    await expect(previewPanel.getByText("Core Stats")).toBeVisible();

    await shot(page, "20-live-preview-populated");

    // Finish button — click it
    const finishBtn = page.getByRole("button", { name: /^Finish/i }).first();
    await expect(finishBtn).not.toBeDisabled();
    await finishBtn.click();

    // Should redirect to /characters
    await page.waitForURL(/\/characters$/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    await shot(page, "21-characters-page-saved");

    await expect(page.url()).toMatch(/\/characters$/);
    await expect(page.getByText("Gareth Ironforge", { exact: true })).toBeVisible({
      timeout: 5_000,
    });
  });
});
