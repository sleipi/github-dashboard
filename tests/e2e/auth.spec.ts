import { expect, test } from '@playwright/test'

// Diese Tests laufen gegen eine leere DB (ohne geseedetes Token)
// Dafür starten wir einen separaten Server mit einer leeren DB.
// Da playwright.config.ts die Test-DB seedet, müssen wir hier
// die geseedete DB temporär "leeren" — einfachste Lösung:
// Auth-Tests testen Verhalten auf der Setup-Seite, die sichtbar
// ist wenn auth.deleteToken() aufgerufen wird.

test.describe('Setup-Seite', () => {
  // Abmelden damit Setup-Seite erscheint
  test.beforeEach(async ({ page }) => {
    // Logout via POST /api/auth mit _method=DELETE
    await page.request.post('/api/auth', {
      form: { _method: 'DELETE' },
    })
  })

  test('zeigt Setup-Formular wenn nicht eingeloggt', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Personal Access Token')).toBeVisible()
    await expect(page.locator('input[name="pat"]')).toBeVisible()
  })

  test('zeigt Fehlermeldung bei leerem Token', async ({ page }) => {
    await page.goto('/')
    await page.locator('button[type="submit"]').click()
    // HTML5 required validation verhindert Submit — kein Server-Error nötig
    // Der Browser zeigt native Validation an
    await expect(page.locator('input[name="pat"]:invalid')).toBeVisible()
  })

  test('zeigt Fehlermeldung bei ungültigem Token', async ({ page }) => {
    await page.goto('/')
    await page.fill('input[name="pat"]', 'ghp_ungueltig')
    await page.locator('button[type="submit"]').click()
    // Server antwortet mit 401 und Fehlertext
    // Da wir keinen Live-GitHub-Zugriff haben, wird der echte PAT abgelehnt
    await expect(page.getByText(/ungültig|error|fehler|401/i)).toBeVisible({ timeout: 10_000 })
  })
})
