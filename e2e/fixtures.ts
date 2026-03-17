import { test as base, expect } from "@playwright/test";

/**
 * E2E Test Fixtures
 *
 * Provides reusable test fixtures for authentication and common operations.
 * Auth state can be shared via storageState for faster test execution.
 */

export interface TestUser {
  email: string;
  password: string;
}

/**
 * Test user credentials for E2E tests.
 * In CI, these should be set via environment variables.
 * For local development, create a test account or mock auth.
 */
export const TEST_USER: TestUser = {
  email: process.env.E2E_TEST_EMAIL || "test@example.com",
  password: process.env.E2E_TEST_PASSWORD || "testpassword123",
};

/**
 * Path to store authenticated session state.
 * Used with storageState to skip login in subsequent tests.
 */
export const AUTH_STATE_PATH = "e2e/.auth/user.json";

/**
 * Custom test fixtures extending Playwright base test.
 */
export const test = base.extend<{
  authenticatedPage: ReturnType<typeof base.extend>;
}>({});

export { expect };

/**
 * Helper to perform login via UI.
 * Can be skipped if using storageState from a previous authenticated session.
 */
export async function loginViaUI(
  page: import("@playwright/test").Page,
  user: TestUser = TEST_USER,
): Promise<void> {
  await page.goto("/");

  // Wait for auth page to load
  await page.waitForSelector('h1:has-text("Login")', { timeout: 10000 });

  // Fill login form
  await page.fill('input[id="email"]', user.email);
  await page.fill('input[id="password"]', user.password);

  // Click submit button (circular button with "ENTRAR" text)
  await page.click('button:has-text("ENTRAR")');

  // Wait for redirect after login (dashboard should load)
  await page.waitForURL(/\/(campaign|campaigns|gallery|calendar)/, {
    timeout: 15000,
  });
}

/**
 * Helper to check if user is authenticated.
 * Looks for elements that only appear when logged in.
 */
export async function isAuthenticated(
  page: import("@playwright/test").Page,
): Promise<boolean> {
  try {
    // Check for user profile button or dashboard elements
    const profileButton = page.locator(
      'button[title], [data-testid="user-menu"]',
    );
    await profileButton.waitFor({ state: "visible", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper to logout via UI.
 */
export async function logoutViaUI(
  page: import("@playwright/test").Page,
): Promise<void> {
  // Hover over user profile button to show dropdown
  const profileButton = page.locator('button[title], [data-testid="user-menu"]');
  await profileButton.hover();

  // Click logout button
  await page.click('button:has-text("Sair")');

  // Wait for redirect to login page
  await page.waitForSelector('h1:has-text("Login")', { timeout: 10000 });
}

/**
 * Routes that require authentication.
 */
export const PROTECTED_ROUTES = [
  "/campaign",
  "/campaigns",
  "/gallery",
  "/calendar",
  "/carousels",
  "/flyer",
  "/playground",
  "/image-playground",
] as const;

/**
 * Admin routes that require super admin role.
 */
export const ADMIN_ROUTES = ["/admin"] as const;

/**
 * Helper to wait for app to be fully loaded.
 * Useful after navigation to ensure all data is fetched.
 */
export async function waitForAppLoad(
  page: import("@playwright/test").Page,
): Promise<void> {
  // Wait for any loading indicators to disappear
  await page.waitForFunction(
    () => {
      const loaders = document.querySelectorAll('[class*="animate-spin"]');
      return loaders.length === 0;
    },
    { timeout: 30000 },
  );
}
