import { test, expect } from "@playwright/test";
import { TEST_USER, loginViaUI, PROTECTED_ROUTES, waitForAppLoad } from "./fixtures";

/**
 * Navigation & Routing E2E Tests
 *
 * Tests that all main routes load correctly and handle errors gracefully.
 * These tests verify:
 * - All protected routes redirect to login when unauthenticated
 * - All routes load without errors when authenticated
 * - 404 handling works correctly
 * - Lazy loading of views works
 */

test.describe("Navigation - Unauthenticated", () => {
  test("should redirect all protected routes to login", async ({ page }) => {
    for (const route of PROTECTED_ROUTES) {
      await page.goto(route);

      // Should show login page
      await expect(page.locator('h1:has-text("Login")')).toBeVisible({
        timeout: 10000,
      });
    }
  });

  test("root path should show login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/");

    // Should show login page
    await expect(page.locator('h1:has-text("Login")')).toBeVisible({
      timeout: 10000,
    });
  });
});

test.describe("Navigation - Authenticated", () => {
  // Skip tests if no test credentials are configured
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required",
  );

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, TEST_USER);
  });

  test("should load /campaign without errors", async ({ page }) => {
    await page.goto("/campaign");
    await waitForAppLoad(page);

    expect(page.url()).toContain("/campaign");

    // No critical errors
    const errorBoundary = page.locator('[class*="error-boundary"]');
    await expect(errorBoundary).toHaveCount(0);
  });

  test("should load /campaigns without errors", async ({ page }) => {
    await page.goto("/campaigns");
    await waitForAppLoad(page);

    expect(page.url()).toContain("/campaigns");
  });

  test("should load /gallery without errors", async ({ page }) => {
    await page.goto("/gallery");
    await waitForAppLoad(page);

    expect(page.url()).toContain("/gallery");
  });

  test("should load /calendar without errors", async ({ page }) => {
    await page.goto("/calendar");
    await waitForAppLoad(page);

    expect(page.url()).toContain("/calendar");
  });

  test("should load /carousels without errors", async ({ page }) => {
    await page.goto("/carousels");
    await waitForAppLoad(page);

    expect(page.url()).toContain("/carousels");
  });

  test("should load /flyer without errors", async ({ page }) => {
    await page.goto("/flyer");
    await waitForAppLoad(page);

    expect(page.url()).toContain("/flyer");
  });

  test("should load /playground without errors", async ({ page }) => {
    await page.goto("/playground");
    await waitForAppLoad(page);

    expect(page.url()).toContain("/playground");
  });

  test("should load /image-playground without errors", async ({ page }) => {
    await page.goto("/image-playground");
    await waitForAppLoad(page);

    expect(page.url()).toContain("/image-playground");
  });
});

test.describe("404 Handling", () => {
  test("should handle non-existent routes gracefully", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-12345");

    // Either redirect to login (if unauthenticated) or to default route (if authenticated)
    // The app uses a catch-all redirect to /campaign
    const loginVisible = await page
      .locator('h1:has-text("Login")')
      .isVisible()
      .catch(() => false);
    const campaignInUrl = page.url().includes("/campaign");

    expect(loginVisible || campaignInUrl).toBe(true);
  });

  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required",
  );

  test("should redirect unknown routes to /campaign when authenticated", async ({
    page,
  }) => {
    await loginViaUI(page, TEST_USER);

    await page.goto("/unknown-route-xyz");

    // Should redirect to campaign (default route)
    await page.waitForURL(/\/campaign/, { timeout: 10000 });
    expect(page.url()).toContain("/campaign");
  });
});

test.describe("Lazy Loading", () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required",
  );

  test("should load views lazily without blocking", async ({ page }) => {
    await loginViaUI(page, TEST_USER);

    // Navigate through multiple routes quickly
    const routes = ["/campaign", "/gallery", "/calendar", "/campaigns"];

    for (const route of routes) {
      await page.goto(route);

      // Each route should load within reasonable time
      await page.waitForLoadState("networkidle", { timeout: 15000 });
      expect(page.url()).toContain(route);
    }
  });
});

test.describe("Browser navigation", () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required",
  );

  test("should handle browser back/forward navigation", async ({ page }) => {
    await loginViaUI(page, TEST_USER);

    // Navigate to campaign
    await page.goto("/campaign");
    await waitForAppLoad(page);

    // Navigate to gallery
    await page.goto("/gallery");
    await waitForAppLoad(page);
    expect(page.url()).toContain("/gallery");

    // Go back
    await page.goBack();
    await waitForAppLoad(page);
    expect(page.url()).toContain("/campaign");

    // Go forward
    await page.goForward();
    await waitForAppLoad(page);
    expect(page.url()).toContain("/gallery");
  });
});
