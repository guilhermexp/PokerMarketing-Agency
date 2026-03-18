import { test, expect } from "@playwright/test";
import { TEST_USER, loginViaUI, isAuthenticated, logoutViaUI } from "./fixtures";

/**
 * Authentication E2E Tests
 *
 * Tests the login flow using Better Auth with email/password.
 * These tests verify:
 * - Login form renders correctly
 * - User can log in with valid credentials
 * - User is redirected to dashboard after login
 * - Error messages appear for invalid credentials
 * - User can log out
 */

test.describe("Authentication", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page which should redirect to login if not authenticated
    await page.goto("/");
  });

  test("should display login form when not authenticated", async ({ page }) => {
    // Verify login page elements
    await expect(page.locator('h1:has-text("Login")')).toBeVisible();
    await expect(page.locator('input[id="email"]')).toBeVisible();
    await expect(page.locator('input[id="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("ENTRAR")')).toBeVisible();

    // Verify "Criar conta" link is visible
    await expect(page.locator('button:has-text("Criar conta")')).toBeVisible();

    // Verify social login options
    await expect(page.locator('button:has-text("Github")')).toBeVisible();
    await expect(page.locator('button:has-text("Google")')).toBeVisible();
  });

  test("should show error for invalid credentials", async ({ page }) => {
    // Fill form with invalid credentials
    await page.fill('input[id="email"]', "invalid@example.com");
    await page.fill('input[id="password"]', "wrongpassword");

    // Submit form
    await page.click('button:has-text("ENTRAR")');

    // Wait for error message
    await expect(
      page.locator(
        'text=Email ou senha incorretos, text=Nenhuma conta encontrada',
      ).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("should navigate to signup form", async ({ page }) => {
    // Click "Criar conta" link
    await page.click('button:has-text("Criar conta")');

    // Verify signup form is displayed
    await expect(page.locator('h1:has-text("Criar conta")')).toBeVisible({
      timeout: 5000,
    });
  });

  test.describe("Authenticated user", () => {
    // Skip these tests if no test credentials are configured
    test.skip(
      !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required",
    );

    test("should login successfully with valid credentials", async ({
      page,
    }) => {
      // Perform login
      await loginViaUI(page, TEST_USER);

      // Verify user is authenticated
      const authenticated = await isAuthenticated(page);
      expect(authenticated).toBe(true);

      // Verify we're on a protected route
      expect(page.url()).toMatch(
        /\/(campaign|campaigns|gallery|calendar)/,
      );
    });

    test("should show user profile after login", async ({ page }) => {
      await loginViaUI(page, TEST_USER);

      // Look for user profile button (shows first letter of name or avatar)
      const profileButton = page.locator("button").filter({
        has: page.locator("img, span"),
      });
      await expect(profileButton.first()).toBeVisible({ timeout: 10000 });
    });

    test("should logout successfully", async ({ page }) => {
      await loginViaUI(page, TEST_USER);

      // Verify we're logged in
      expect(await isAuthenticated(page)).toBe(true);

      // Perform logout
      await logoutViaUI(page);

      // Verify we're back at login page
      await expect(page.locator('h1:has-text("Login")')).toBeVisible();
    });
  });
});

test.describe("Remember me checkbox", () => {
  test("should have remember me option", async ({ page }) => {
    await page.goto("/");

    // Verify remember me checkbox exists
    await expect(page.locator('label:has-text("Lembrar de mim")')).toBeVisible();
    await expect(page.locator('button[role="checkbox"]')).toBeVisible();
  });
});

test.describe("Forgot password", () => {
  test("should have forgot password link", async ({ page }) => {
    await page.goto("/");

    // Verify forgot password link exists
    await expect(page.locator('button:has-text("Esqueceu?")')).toBeVisible();
  });
});
