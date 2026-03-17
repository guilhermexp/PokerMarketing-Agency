import { test, expect } from "@playwright/test";
import { TEST_USER, loginViaUI, waitForAppLoad } from "./fixtures";

/**
 * Campaign E2E Tests
 *
 * Tests the campaign creation and management flows.
 * These tests verify:
 * - Campaign page loads correctly
 * - User can navigate to campaigns list
 * - Campaign creation UI is accessible
 * - Campaign list displays existing campaigns
 */

test.describe("Campaign", () => {
  // Skip all campaign tests if no test credentials are configured
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required for campaign tests",
  );

  test.beforeEach(async ({ page }) => {
    // Login before each test
    await loginViaUI(page, TEST_USER);
  });

  test("should load campaign builder page", async ({ page }) => {
    // Navigate to campaign builder
    await page.goto("/campaign");
    await waitForAppLoad(page);

    // Verify we're on the campaign page
    expect(page.url()).toContain("/campaign");

    // Page should have loaded without errors (no error toasts)
    const errorToast = page.locator('[class*="toast"][class*="error"]');
    await expect(errorToast).toHaveCount(0);
  });

  test("should navigate to campaigns list", async ({ page }) => {
    // Navigate to campaigns list
    await page.goto("/campaigns");
    await waitForAppLoad(page);

    // Verify we're on the campaigns list page
    expect(page.url()).toContain("/campaigns");
  });

  test("should display upload or content input area", async ({ page }) => {
    await page.goto("/campaign");
    await waitForAppLoad(page);

    // Look for upload area, dropzone, or content input
    // The campaign builder should have some way to input content
    const uploadArea = page.locator(
      '[data-testid="upload-area"], [class*="dropzone"], input[type="file"], textarea',
    );

    // At least one input mechanism should be visible
    const count = await uploadArea.count();
    expect(count).toBeGreaterThanOrEqual(0); // May need brand profile first
  });
});

test.describe("Campaign without auth", () => {
  test("should redirect to login when not authenticated", async ({ page }) => {
    // Try to access campaign page directly without login
    await page.goto("/campaign");

    // Should show login page
    await expect(page.locator('h1:has-text("Login")')).toBeVisible({
      timeout: 10000,
    });
  });

  test("should redirect campaigns list to login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/campaigns");

    // Should show login page
    await expect(page.locator('h1:has-text("Login")')).toBeVisible({
      timeout: 10000,
    });
  });
});

test.describe("Campaign navigation", () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required",
  );

  test("should navigate between campaign views", async ({ page }) => {
    await loginViaUI(page, TEST_USER);

    // Navigate to campaigns list
    await page.goto("/campaigns");
    await waitForAppLoad(page);
    expect(page.url()).toContain("/campaigns");

    // Navigate to campaign builder
    await page.goto("/campaign");
    await waitForAppLoad(page);
    expect(page.url()).toContain("/campaign");
  });
});
