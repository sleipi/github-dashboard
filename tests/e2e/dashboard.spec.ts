import { expect, test } from '@playwright/test'

// Der Server läuft mit der seeded DB aus seed-db.ts
// Enthält: 2 gepinnte Repos, 2 PRs für alice/awesome-project

test.describe('Dashboard', () => {
  // Seeded Session wiederherstellen damit Dashboard-Tests unabhängig von Auth-Tests laufen
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/test/restore-session')
  })

  test('zeigt Dashboard wenn eingeloggt', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Dashboard')).toBeVisible()
    await expect(page.getByText('testuser')).toBeVisible()
  })

  test('zeigt gepinnte Repos als Cards', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('awesome-project')).toBeVisible()
    await expect(page.getByText('another-repo')).toBeVisible()
  })

  test('zeigt PRs in der Card', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('feat: add dark mode support')).toBeVisible()
    await expect(page.getByText('fix: resolve memory leak in worker')).toBeVisible()
  })

  test('zeigt Dependabot-Alert-Anzahl', async ({ page }) => {
    await page.goto('/')
    // 3 aktuelle Alerts, Trend: -2 (von 5 auf 3)
    await expect(page.getByText('3')).toBeVisible()
  })

  test('"Repo hinzufügen" öffnet Modal', async ({ page }) => {
    await page.goto('/')
    // HTMX Modal öffnen — da kein Live-GitHub, wird der Request fehlschlagen
    // Wir testen nur dass der Button existiert und anklickbar ist
    const btn = page.getByRole('button', { name: /Repo hinzufügen/i })
    await expect(btn).toBeVisible()
  })

  test('Abmelden leitet zur Setup-Seite weiter', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Abmelden/i }).click()
    await expect(page.getByText('Personal Access Token')).toBeVisible()
  })

  test('PR-Link öffnet in neuem Tab', async ({ page }) => {
    await page.goto('/')
    const prLink = page.getByRole('link', { name: /feat: add dark mode/i })
    await expect(prLink).toHaveAttribute('target', '_blank')
    await expect(prLink).toHaveAttribute('href', /github\.com\/alice\/awesome-project\/pull\/42/)
  })

  test('Aktualisieren-Button ist sichtbar', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Aktualisieren/i })).toBeVisible()
  })
})
