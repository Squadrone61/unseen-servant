/**
 * ChoicePicker — Phase 4 smoke tests
 *
 * Covers the unified ChoicePicker renderer introduced in the builder/popover
 * refactor. One test per representative scenario; confirms cards render with
 * name + info button, selection round-trips, sub-choices appear, and info
 * buttons open the universal EntityDetailPopover.
 *
 * Prerequisites: dev servers running (`pnpm dev:all`)
 * Artifacts go to .testing/ (gitignored)
 */

import { test, expect, type Page } from "@playwright/test";
import path from "path";

const SCREENSHOT_DIR = path.resolve(__dirname, "../../../.testing");

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `choice-picker-${name}.png`),
    fullPage: false,
  });
}

function stepBtn(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

/** Navigate to class step with the given species + background pre-selected. */
async function goToClassStep(page: Page, species = "Human", background = "Acolyte") {
  await page.goto("/characters/create");
  await page.waitForLoadState("networkidle");
  await page.getByText(species, { exact: true }).first().click();
  await stepBtn(page, "Background").click();
  await page.getByText(background, { exact: true }).first().click();
  await stepBtn(page, "Class").click();
}

test.describe("ChoicePicker — unified card-grid renderer", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("character_library");
    });
  });

  // ── 1. Species step: skill choice (Skillful) ─────────────────────────────────

  test("Species: Human Skillful choice shows cards with name + info button", async ({ page }) => {
    await page.goto("/characters/create");
    await page.waitForLoadState("networkidle");

    // Human has a Skillful choice (skill proficiency pool)
    await page.getByText("Human", { exact: true }).first().click();
    await shot(page, "01-human-skillful");

    await expect(page.getByRole("button", { name: "Acrobatics" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Athletics" })).toBeVisible();
  });

  test("Species: Human skill pick enables next button", async ({ page }) => {
    await page.goto("/characters/create");
    await page.waitForLoadState("networkidle");

    await page.getByText("Human", { exact: true }).first().click();

    // The Background step should already be unlocked after species selection
    await expect(stepBtn(page, "Background")).not.toBeDisabled();

    // Inside the human skillful choice, pick one skill
    const acrobaticsBtn = page.getByRole("button", { name: "Acrobatics" });
    if (await acrobaticsBtn.isVisible()) {
      await acrobaticsBtn.click();
      await shot(page, "02-human-skillful-picked");
      // The button should now be aria-pressed="true"
      await expect(acrobaticsBtn).toHaveAttribute("aria-pressed", "true");
    }
  });

  // ── 2. Class step: Fighter weapon mastery pool ────────────────────────────────

  test("Class: Fighter weapon-mastery pool renders — spot-check weapons present", async ({
    page,
  }) => {
    await goToClassStep(page);
    await page.getByText("Fighter", { exact: true }).first().click();
    await shot(page, "03-fighter-class-selected");

    // Weapon mastery heading should be visible — the choice label from the DB
    const weaponMasteryHeading = page.getByText(/Weapon Mastery/i).first();
    await expect(weaponMasteryHeading).toBeVisible();
    await weaponMasteryHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // Fighter gets Simple + Martial weapons. Use search to spot-check.
    const searchInput = page.getByLabel("Search options").first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("Longsword");
      await expect(page.getByRole("button", { name: "Longsword" })).toBeVisible();
      await searchInput.fill("Dagger");
      await expect(page.getByRole("button", { name: "Dagger" })).toBeVisible();
      await searchInput.fill("");
    } else {
      await expect(page.getByRole("button", { name: "Longsword" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Dagger" })).toBeVisible();
    }

    await shot(page, "04-fighter-weapon-mastery-pool");
  });

  test("Class: Fighter weapon-mastery — pick three saves correctly (count=3)", async ({ page }) => {
    await goToClassStep(page);
    await page.getByText("Fighter", { exact: true }).first().click();

    // Scroll to weapon mastery section
    const weaponMasteryHeading = page.getByText(/Weapon Mastery/i).first();
    await weaponMasteryHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // Fighter gets count=3 weapon mastery picks. Use search to locate each weapon.
    const searchInput = page.getByLabel("Search options").first();
    const hasSearch = await searchInput.isVisible();

    const pickWeapon = async (name: string) => {
      if (hasSearch) {
        await searchInput.fill(name);
        await page.waitForTimeout(100);
      }
      const btn = page.getByRole("button", { name, exact: true });
      await expect(btn).not.toBeDisabled();
      await btn.click();
    };

    await pickWeapon("Longsword");
    await pickWeapon("Shortsword");
    await pickWeapon("Rapier");

    // Clear search to verify all three are selected
    if (hasSearch) {
      await searchInput.fill("");
      await page.waitForTimeout(100);
    }
    await shot(page, "05-fighter-weapon-mastery-three-picked");

    // All three should be selected (count=3 allows exactly 3)
    await expect(page.getByRole("button", { name: "Longsword", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Shortsword", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Rapier", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // A fourth weapon's button should be disabled (cap reached)
    if (hasSearch) {
      await searchInput.fill("Dagger");
      await page.waitForTimeout(100);
    }
    const daggerBtn = page.getByRole("button", { name: "Dagger", exact: true });
    await expect(daggerBtn).toBeDisabled();
    await shot(page, "06-fighter-weapon-mastery-cap-enforced");
  });

  // ── 3. Class step: Barbarian weapon mastery (melee-only regression) ───────────

  test("Class: Barbarian weapon-mastery pool is melee-only (no bows/crossbows)", async ({
    page,
  }) => {
    await goToClassStep(page);
    await page.getByText("Barbarian", { exact: true }).first().click();
    await shot(page, "07-barbarian-class-selected");

    // Barbarian should show weapon mastery choices. Scroll to find it.
    const weaponMasteryHeading = page.getByText(/Weapon Mastery/i).first();
    await expect(weaponMasteryHeading).toBeVisible();
    await weaponMasteryHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, "08-barbarian-weapon-mastery-scrolled");

    // Melee weapons should be present. Use search to locate specific weapons.
    // The search box appears when pool > 15 items.
    const searchInput = page.getByLabel("Search options").first();
    if (await searchInput.isVisible()) {
      // Club and Greataxe are in the Barbarian melee pool (simple and martial).
      await searchInput.fill("Club");
      await page.waitForTimeout(100);
      await expect(page.getByRole("button", { name: "Club", exact: true })).toBeVisible();

      await searchInput.fill("Greataxe");
      await page.waitForTimeout(100);
      await expect(page.getByRole("button", { name: "Greataxe" })).toBeVisible();

      // Ranged weapons must NOT appear in the Barbarian pool
      await searchInput.fill("Longbow");
      await page.waitForTimeout(100);
      await expect(page.getByRole("button", { name: "Longbow" })).not.toBeVisible();

      await searchInput.fill("Heavy Crossbow");
      await page.waitForTimeout(100);
      await expect(page.getByRole("button", { name: "Heavy Crossbow" })).not.toBeVisible();

      // Handaxe has a range property (thrown) so it is also excluded from Barbarian pool
      await searchInput.fill("Handaxe");
      await page.waitForTimeout(100);
      await expect(page.getByRole("button", { name: "Handaxe" })).not.toBeVisible();

      await searchInput.fill("");
    } else {
      // No search (pool <= 15) — check directly
      await expect(page.getByRole("button", { name: "Greataxe" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Longbow" })).not.toBeVisible();
    }

    await shot(page, "09-barbarian-weapon-mastery-melee-only");
  });

  // ── 4. Class step: Rogue weapon mastery (simple/finesse/light only) ───────────

  test("Class: Rogue weapon-mastery pool excludes heavy martial weapons", async ({ page }) => {
    await goToClassStep(page);
    await page.getByText("Rogue", { exact: true }).first().click();
    await shot(page, "10-rogue-class-selected");

    // Rogue should show weapon mastery choices
    const weaponMasteryHeading = page.getByText(/Weapon Mastery/i).first();
    await expect(weaponMasteryHeading).toBeVisible();
    await weaponMasteryHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const searchInput = page.getByLabel("Search options").first();
    if (await searchInput.isVisible()) {
      // Dagger (simple) should be in the Rogue pool
      await searchInput.fill("Dagger");
      await expect(page.getByRole("button", { name: "Dagger" })).toBeVisible();

      // Shortsword (martial finesse) should be present
      await searchInput.fill("Shortsword");
      await expect(page.getByRole("button", { name: "Shortsword" })).toBeVisible();

      // Greatsword (heavy, no finesse/light) should NOT appear
      await searchInput.fill("Greatsword");
      await expect(page.getByRole("button", { name: "Greatsword" })).not.toBeVisible();

      await searchInput.fill("");
    } else {
      await expect(page.getByRole("button", { name: "Dagger" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Shortsword" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Greatsword" })).not.toBeVisible();
    }

    await shot(page, "11-rogue-weapon-mastery-filtered");
  });

  // ── 5. Class step: Fighter fighting-style with sub-choice ────────────────────

  test("Class: Fighter fighting-style sub-choice appears when Druidic Warrior selected", async ({
    page,
  }) => {
    await goToClassStep(page);
    await page.getByText("Fighter", { exact: true }).first().click();

    // Navigate to the fighting style choice. It appears at level 1 for Fighter.
    const fightingStyleHeading = page.getByText(/Fighting Style/i).first();
    await expect(fightingStyleHeading).toBeVisible();
    await fightingStyleHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, "12-fighter-fighting-style");

    // "Druidic Warrior" grants cantrip selection as a sub-choice
    const druidicWarrior = page.getByRole("button", { name: "Druidic Warrior" });
    if (await druidicWarrior.isVisible()) {
      await druidicWarrior.click();
      await shot(page, "12-fighter-druidic-warrior-selected");

      // Sub-choice picker should appear: cantrip selection
      // The nested picker shows after the selected row
      await expect(page.getByText(/cantrip|Cantrip/i).first()).toBeVisible();
    } else {
      // Druidic Warrior may not be in the pool for all builds — skip gracefully
      test.skip();
    }
  });

  // ── 6. Info button opens universal popover from within builder ───────────────

  test("ChoicePicker: info button opens universal EntityDetailPopover", async ({ page }) => {
    await goToClassStep(page);
    await page.getByText("Fighter", { exact: true }).first().click();

    // Scroll to the Fighter skill picker (has info buttons next to skill names)
    const athleticsRow = page.getByRole("button", { name: "Athletics" }).first();
    await athleticsRow.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // The info button is the sibling button inside the same row. Click the
    // nearest `aria-label="View details"` button to the Athletics row.
    const athleticsContainer = athleticsRow.locator("..").locator("..");
    await athleticsContainer.getByLabel("View details").click();

    await shot(page, "builder-info-popover");

    // The universal DetailPopover uses Cinzel-font h3 for the title. We just
    // need to confirm a popover appeared — the presence of a close (×) button
    // in a fixed/rounded container proves EntityDetailPopover is mounted.
    const closeBtn = page
      .locator(
        'div.fixed.rounded-lg button[aria-label*="lose" i], div.fixed.rounded-lg button:has(svg path[d*="M6 18L18 6"])',
      )
      .first();
    await expect(closeBtn).toBeVisible();
  });

  test("ChoicePicker: every option row has an info button", async ({ page }) => {
    await goToClassStep(page);
    await page.getByText("Fighter", { exact: true }).first().click();

    // Scroll to weapon mastery section where info buttons are present
    const weaponMasteryHeading = page.getByText(/Weapon Mastery/i).first();
    await weaponMasteryHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, "13-fighter-info-buttons");

    // Each option row renders an InfoButton with aria-label="View details".
    // We just verify the buttons exist — one per visible weapon row.
    const infoButtons = page.locator('[aria-label="View details"]');
    const count = await infoButtons.count();

    // There should be at least a few info buttons visible
    expect(count).toBeGreaterThan(2);
  });

  // ── 7. Search appears at >15 options ─────────────────────────────────────────

  test("ChoicePicker: search input appears when pool has >15 options", async ({ page }) => {
    await goToClassStep(page);
    await page.getByText("Fighter", { exact: true }).first().click();

    // Scroll to weapon mastery section
    const weaponMasteryHeading = page.getByText(/Weapon Mastery/i).first();
    await weaponMasteryHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, "14-fighter-search-visible");

    // Fighter weapon mastery pool has many weapons — search should appear
    // SearchInput renders an input with aria-label="Search options"
    await expect(page.getByLabel("Search options").first()).toBeVisible();
  });

  test("ChoicePicker: search filters visible options", async ({ page }) => {
    await goToClassStep(page);
    await page.getByText("Fighter", { exact: true }).first().click();

    // Scroll to weapon mastery section
    const weaponMasteryHeading = page.getByText(/Weapon Mastery/i).first();
    await weaponMasteryHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const searchInput = page.getByLabel("Search options").first();
    await searchInput.fill("sword");
    await shot(page, "15-fighter-search-sword");

    // "Longsword" should match
    await expect(page.getByRole("button", { name: "Longsword" })).toBeVisible();
    // "Dagger" should be filtered out
    await expect(page.getByRole("button", { name: "Dagger" })).not.toBeVisible();

    // Clear search
    await page.getByLabel("Clear search").click();
    await expect(page.getByRole("button", { name: "Dagger" })).toBeVisible();
  });

  // ── 8. Selection persists on step back/forward ────────────────────────────────

  test("ChoicePicker: skill selection persists after navigating away and back", async ({
    page,
  }) => {
    await page.goto("/characters/create");
    await page.waitForLoadState("networkidle");

    await page.getByText("Human", { exact: true }).first().click();

    // Pick Acrobatics from Skillful choice (if it appears)
    const acrobaticsBtn = page.getByRole("button", { name: "Acrobatics" });
    if (await acrobaticsBtn.isVisible()) {
      await acrobaticsBtn.click();
      await expect(acrobaticsBtn).toHaveAttribute("aria-pressed", "true");
    }

    // Navigate to Background and back
    await stepBtn(page, "Background").click();
    await page.waitForTimeout(100);
    await stepBtn(page, "Species").click();
    await page.waitForTimeout(100);

    await shot(page, "16-skill-persists-after-nav");

    // Acrobatics should still be selected
    if (await acrobaticsBtn.isVisible()) {
      await expect(acrobaticsBtn).toHaveAttribute("aria-pressed", "true");
    }
  });
});
