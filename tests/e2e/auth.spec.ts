import { expect, test } from '@playwright/test'

// These tests run against an empty DB (without a seeded token).
// We start a separate server with an empty DB.
// Since playwright.config.ts seeds the test DB, we temporarily
// "empty" it here — simplest approach:
// Auth tests verify behaviour on the setup page, which is visible
// when auth.deleteToken() is called.

test.describe('Setup page', () => {
  // Sign out so the setup page appears
  test.beforeEach(async ({ page }) => {
    // Logout via POST /api/auth with _method=DELETE
    await page.request.post('/api/auth', {
      form: { _method: 'DELETE' },
    })
  })

  test('shows setup form when not logged in', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Personal Access Token')).toBeVisible()
    await expect(page.locator('input[name="pat"]')).toBeVisible()
  })

  test('shows error message for empty token', async ({ page }) => {
    await page.goto('/')
    await page.locator('button[type="submit"]').click()
    // HTML5 required validation prevents submit — no server error needed
    // The browser shows native validation
    await expect(page.locator('input[name="pat"]:invalid')).toBeVisible()
  })

  test('shows error message for invalid token', async ({ page }) => {
    await page.goto('/')
    await page.fill('input[name="pat"]', 'ghp_invalid')
    await page.locator('button[type="submit"]').click()
    // Server responds with 401 and error text
    // Since we have no live GitHub access, the real PAT will be rejected
    await expect(page.getByText(/invalid|error|401/i)).toBeVisible({ timeout: 10_000 })
  })
})
