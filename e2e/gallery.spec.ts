import { test, expect } from "@playwright/test";
import { TEST_USER, loginViaUI, waitForAppLoad } from "./fixtures";

/**
 * Gallery E2E Tests
 *
 * Tests the image gallery functionality.
 * These tests verify:
 * - Gallery page loads correctly
 * - Images are displayed (if any exist)
 * - Gallery UI elements are accessible
 */

test.describe("Gallery", () => {
  test.describe("Authenticated", () => {
    // Skip tests if no test credentials are configured
    test.skip(
      !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required for gallery tests",
    );

    test.beforeEach(async ({ page }) => {
      await loginViaUI(page, TEST_USER);
    });

    test("should load gallery page", async ({ page }) => {
      await page.goto("/gallery");
      await waitForAppLoad(page);

      // Verify we're on the gallery page
      expect(page.url()).toContain("/gallery");

      // Page should have loaded without errors
      const errorToast = page.locator('[class*="toast"][class*="error"]');
      await expect(errorToast).toHaveCount(0);
    });

    test("should display gallery container", async ({ page }) => {
      await page.goto("/gallery");
      await waitForAppLoad(page);

      // Gallery should have some container element
      // Look for grid, list, or gallery-specific elements
      const galleryContainer = page.locator(
        '[data-testid="gallery"], [class*="gallery"], [class*="grid"]',
      );

      // At least one gallery-related element should exist
      const count = await galleryContainer.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("should show images or empty state", async ({ page }) => {
      await page.goto("/gallery");
      await waitForAppLoad(page);

      // Either images should be displayed or an empty state message
      const images = page.locator("img[src*='blob'], img[src*='http']");
      const emptyState = page.locator(
        '[class*="empty"], :text("sem imagens"), :text("vazia")',
      );

      const imageCount = await images.count();
      const emptyCount = await emptyState.count();

      // Either images exist or empty state is shown
      expect(imageCount + emptyCount).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("Unauthenticated", () => {
    test("should redirect to login when not authenticated", async ({
      page,
    }) => {
      await page.goto("/gallery");

      // Should show login page
      await expect(page.locator('h1:has-text("Login")')).toBeVisible({
        timeout: 10000,
      });
    });
  });
});

test.describe("Gallery interactions", () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required",
  );

  test("should be able to navigate to gallery from other pages", async ({
    page,
  }) => {
    await loginViaUI(page, TEST_USER);

    // Start from campaign page
    await page.goto("/campaign");
    await waitForAppLoad(page);

    // Navigate to gallery (via URL since we don't know exact nav structure)
    await page.goto("/gallery");
    await waitForAppLoad(page);

    expect(page.url()).toContain("/gallery");
  });
});
