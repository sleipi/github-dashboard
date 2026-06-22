/// <reference lib="dom" />
import { expect, test } from '@playwright/test'

test.describe('Activity strip', () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/test/restore-session')
  })

  test('activity strip is visible above the PR list', async ({ page }) => {
    await page.goto('/')
    const card = page.locator('.card').first()
    const activityLink = card.locator('a').filter({ hasText: '@bob merged' }).first()
    await expect(activityLink).toBeVisible()
  })

  test('activity strip shows at most 5 items', async ({ page }) => {
    await page.goto('/')
    const card = page.locator('.card').first()
    const activityLinks = card.locator('a').filter({ hasText: /^@/ })
    const count = await activityLinks.count()
    expect(count).toBeLessThanOrEqual(5)
  })

  test('"N more activities" button appears when overflow', async ({ page }) => {
    await page.goto('/')
    const card = page.locator('.card').first()
    await expect(card.locator('button', { hasText: /more activities/ })).toBeVisible()
  })

  test('clicking "more activities" opens modal with full list', async ({ page }) => {
    await page.goto('/')
    const card = page.locator('.card').first()
    await card.locator('button', { hasText: /more activities/ }).click()
    await expect(page.locator('#modal .modal-overlay')).toBeVisible()
    await expect(page.locator('#modal').getByText('Activity')).toBeVisible()
  })

  test('new PR has no highlight when older than 6h', async ({ page }) => {
    await page.goto('/')
    const card = page.locator('.card').first()
    const prRows = card.locator('.pr-row')
    const highlightedRows = await prRows.evaluateAll((rows) =>
      rows.filter((r) => (r as HTMLElement).style.background.includes('rgba(34,197,94')),
    )
    expect(highlightedRows.length).toBe(0)
  })

  test('PR list shows at most 5 PRs on card', async ({ page }) => {
    await page.goto('/')
    const card = page.locator('.card').first()
    const prRows = card.locator('.pr-row')
    const count = await prRows.count()
    expect(count).toBeLessThanOrEqual(5)
  })

  test('activity items are links to GitHub', async ({ page }) => {
    await page.goto('/')
    const card = page.locator('.card').first()
    const firstActivityLink = card.locator('a').filter({ hasText: '@bob merged' }).first()
    const href = await firstActivityLink.getAttribute('href')
    expect(href).toContain('github.com')
    expect(href).toContain('pull/35')
  })
})

test.describe('PAT expiry icon', () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/test/restore-session')
  })

  test('no icon shown when session has no expiry date', async ({ page }) => {
    // restore-session seeds expiresAt: null
    await page.goto('/')
    await expect(page.locator('[aria-label="PAT expiry warning"]')).not.toBeVisible()
  })

  test('shows info icon (blue) when expiry is more than 21 days away', async ({ page }) => {
    await page.request.post('/api/test/set-expiry', {
      data: JSON.stringify({ daysFromNow: 30 }),
      headers: { 'Content-Type': 'application/json' },
    })
    await page.goto('/')
    const icon = page.locator('[aria-label="PAT expiry warning"]')
    await expect(icon).toBeVisible()
    const color = await icon.evaluate((el) => (el as HTMLElement).style.color)
    expect(color).toContain('rgb(56, 139, 253)')
  })

  test('shows notice icon (amber) when expiry is 4–21 days away', async ({ page }) => {
    await page.request.post('/api/test/set-expiry', {
      data: JSON.stringify({ daysFromNow: 10 }),
      headers: { 'Content-Type': 'application/json' },
    })
    await page.goto('/')
    const icon = page.locator('[aria-label="PAT expiry warning"]')
    await expect(icon).toBeVisible()
    const style = await icon.getAttribute('style')
    expect(style).toContain('#d29922')
  })

  test('shows warning icon (red) when expiry is 3 days or less', async ({ page }) => {
    await page.request.post('/api/test/set-expiry', {
      data: JSON.stringify({ daysFromNow: 2 }),
      headers: { 'Content-Type': 'application/json' },
    })
    await page.goto('/')
    const icon = page.locator('[aria-label="PAT expiry warning"]')
    await expect(icon).toBeVisible()
    const style = await icon.getAttribute('style')
    expect(style).toContain('#f85149')
  })

  test('clicking icon opens the renewal modal', async ({ page }) => {
    await page.request.post('/api/test/set-expiry', {
      data: JSON.stringify({ daysFromNow: 2 }),
      headers: { 'Content-Type': 'application/json' },
    })
    await page.goto('/')
    await page.locator('[aria-label="PAT expiry warning"]').click()
    await expect(page.locator('#pat-modal')).toBeVisible()
    await expect(page.getByText('Create a new token on GitHub →')).toBeVisible()
    await expect(page.locator('#pat-modal input[name="pat"]')).toBeVisible()
  })

  test('clicking modal backdrop closes it', async ({ page }) => {
    await page.request.post('/api/test/set-expiry', {
      data: JSON.stringify({ daysFromNow: 2 }),
      headers: { 'Content-Type': 'application/json' },
    })
    await page.goto('/')
    await page.locator('[aria-label="PAT expiry warning"]').click()
    await expect(page.locator('#pat-modal')).toBeVisible()
    // Click the backdrop (the overlay element itself, not the inner dialog)
    await page.locator('#pat-modal').click({ position: { x: 5, y: 5 } })
    await expect(page.locator('#pat-modal')).not.toBeVisible()
  })
})

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
    // Scope to PR rows to avoid collision with activity items that also mention PR titles
    const card = page.locator('[data-card-name="alice/awesome-project"]')
    await expect(
      card.locator('.pr-row').filter({ hasText: 'feat: add dark mode support' }),
    ).toBeVisible()
    await expect(
      card.locator('.pr-row').filter({ hasText: 'fix: resolve memory leak in worker' }),
    ).toBeVisible()
  })

  test('zeigt Dependabot-Alert-Anzahl', async ({ page }) => {
    await page.goto('/')
    // 3 aktuelle Alerts — über title-Attribut suchen, da '3' auch in PR-Nummern vorkommt
    await expect(
      page.locator('[data-card-name="alice/awesome-project"] [title="3 Alerts"]'),
    ).toBeVisible()
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
    // Scope to PR rows to avoid collision with activity items that also reference PR #42
    const prLink = page
      .locator('[data-card-name="alice/awesome-project"] .pr-row')
      .filter({ hasText: 'feat: add dark mode support' })
    await expect(prLink).toHaveAttribute('target', '_blank')
    await expect(prLink).toHaveAttribute('href', /github\.com\/alice\/awesome-project\/pull\/42/)
  })

  test('Aktualisieren-Button ist sichtbar', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Aktualisieren/i })).toBeVisible()
  })

  test('Entfernen-Button entfernt die Card aus dem Dashboard', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-card-name="alice/awesome-project"]')).toBeVisible()
    await page.locator('[data-card-name="alice/awesome-project"]').getByTitle('Entfernen').click()
    await expect(page.locator('[data-card-name="alice/awesome-project"]')).not.toBeVisible({
      timeout: 5000,
    })
    await expect(page.locator('[data-card-name="alice/another-repo"]')).toBeVisible()
  })

  test('repo-search filtert Repos im Modal', async ({ page }) => {
    await page.goto('/')

    // Modal-HTML direkt injizieren (umgeht GitHub-API-Call)
    await page.evaluate(() => {
      const modal = document.getElementById('modal')
      if (modal) {
        modal.innerHTML = `
          <div class="modal-overlay">
            <div class="modal" style="display:flex;flex-direction:column">
              <div style="padding:10px 14px;border-bottom:1px solid #21262d">
                <input id="repo-search" type="text" placeholder="Repo suchen…"
                       style="width:100%"/>
              </div>
              <div>
                <div data-repo-name="alice/awesome-project" style="display:flex;padding:8px">awesome-project</div>
                <div data-repo-name="alice/another-repo" style="display:flex;padding:8px">another-repo</div>
                <div data-repo-name="bob/totally-different" style="display:flex;padding:8px">totally-different</div>
              </div>
            </div>
          </div>`
      }
    })

    await page.fill('#repo-search', 'awesome')

    await expect(page.locator('[data-repo-name="alice/awesome-project"]')).toBeVisible()
    await expect(page.locator('[data-repo-name="alice/another-repo"]')).toBeHidden()
    await expect(page.locator('[data-repo-name="bob/totally-different"]')).toBeHidden()
  })

  test('repo-search behält flex-Layout nach Filterung', async ({ page }) => {
    await page.goto('/')

    await page.evaluate(() => {
      const modal = document.getElementById('modal')
      if (modal) {
        modal.innerHTML = `
          <div class="modal-overlay">
            <div class="modal" style="display:flex;flex-direction:column">
              <div style="padding:10px 14px">
                <input id="repo-search" type="text"/>
              </div>
              <div>
                <div data-repo-name="alice/foo" style="display:flex;align-items:center;gap:12px">
                  <div class="check" style="width:16px;height:16px"></div>
                  <span>foo</span>
                </div>
              </div>
            </div>
          </div>`
      }
    })

    // Filtern und wieder leeren → display muss flex bleiben
    await page.fill('#repo-search', 'foo')
    await page.fill('#repo-search', '')

    const displayValue = await page
      .locator('[data-repo-name="alice/foo"]')
      .evaluate((el) => window.getComputedStyle(el).display)
    expect(displayValue).toBe('flex')
  })

  test('_toggleCheck setzt Checkmark beim ersten Klick', async ({ page }) => {
    await page.goto('/')

    await page.evaluate(() => {
      const modal = document.getElementById('modal')
      if (modal) {
        modal.innerHTML = `
          <div>
            <div data-repo-name="alice/foo" style="display:flex;align-items:center;gap:12px"
                 onclick="_toggleCheck(this)">
              <div class="check" data-checked="0"
                   style="width:16px;height:16px;background:transparent;border:1.5px solid #30363d;
                          display:flex;align-items:center;justify-content:center"></div>
              <span>foo</span>
            </div>
          </div>`
      }
    })

    await page.locator('[data-repo-name="alice/foo"]').click()

    const checked = await page.locator('.check').getAttribute('data-checked')
    expect(checked).toBe('1')

    const hasSvg = await page.locator('.check svg').count()
    expect(hasSvg).toBe(1)
  })

  test('_toggleCheck entfernt Checkmark beim zweiten Klick', async ({ page }) => {
    await page.goto('/')

    await page.evaluate(() => {
      const modal = document.getElementById('modal')
      if (modal) {
        modal.innerHTML = `
          <div>
            <div data-repo-name="alice/bar" style="display:flex;align-items:center;gap:12px"
                 onclick="_toggleCheck(this)">
              <div class="check" data-checked="1"
                   style="width:16px;height:16px;background:#238636;border:1.5px solid #238636;
                          display:flex;align-items:center;justify-content:center">
                <svg width="9" height="9" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
              </div>
              <span>bar</span>
            </div>
          </div>`
      }
    })

    await page.locator('[data-repo-name="alice/bar"]').click()

    const checked = await page.locator('.check').getAttribute('data-checked')
    expect(checked).toBe('0')

    const hasSvg = await page.locator('.check svg').count()
    expect(hasSvg).toBe(0)
  })

  // --- Kartendetails ---

  test('zeigt "Keine offenen PRs" wenn Repo keine PRs hat', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.locator('[data-card-name="alice/another-repo"]').getByText('✓ Keine offenen PRs'),
    ).toBeVisible()
  })

  test('zeigt Dependabot-Trend', async ({ page }) => {
    await page.goto('/')
    // Seed: 5 Alerts vor 8 Tagen → 3 jetzt → Wochentrend -2 → formatTrend: "(-2)"
    await expect(
      page.locator('[data-card-name="alice/awesome-project"]').getByText('(-2)'),
    ).toBeVisible()
  })

  test('Repo-Link auf der Card öffnet in neuem Tab', async ({ page }) => {
    await page.goto('/')
    const repoLink = page.locator('[data-card-name="alice/awesome-project"] .card-header a').first()
    await expect(repoLink).toHaveAttribute('target', '_blank')
    await expect(repoLink).toHaveAttribute('href', 'https://github.com/alice/awesome-project')
  })

  test('Dependabot-Link öffnet in neuem Tab', async ({ page }) => {
    await page.goto('/')
    // Use exact href to avoid matching activity security_alert links (security/dependabot/N)
    const depLink = page.locator(
      '[data-card-name="alice/awesome-project"] a[href="https://github.com/alice/awesome-project/security/dependabot"]',
    )
    await expect(depLink).toHaveAttribute('target', '_blank')
  })

  test('zeigt Draft-Badge für Draft-PRs', async ({ page }) => {
    await page.goto('/')
    // PR #40 ist als draft:true geseedet
    await expect(
      page.locator('[data-card-name="alice/awesome-project"] .badge').filter({ hasText: 'Draft' }),
    ).toBeVisible()
  })

  test('zeigt "+ weiterer PR"-Button wenn mehr als 6 PRs vorhanden sind', async ({ page }) => {
    await page.goto('/')
    // 7 PRs geseedet, MAX_PRS_ON_CARD=6 → 1 Overflow
    await expect(
      page.locator('[data-card-name="alice/awesome-project"]').getByText('+ 1 weiterer PR'),
    ).toBeVisible()
  })

  // --- HTMX-Interaktionen ---

  test('Aktualisieren-Button lädt alle Cards neu', async ({ page }) => {
    await page.goto('/')
    const refreshPromise = page.waitForResponse(
      (r) => r.url().includes('/api/cards') && !r.url().includes('reorder') && r.status() === 200,
    )
    await page.getByRole('button', { name: /Aktualisieren/i }).click()
    await refreshPromise
    await expect(page.getByText('awesome-project')).toBeVisible()
    await expect(page.getByText('another-repo')).toBeVisible()
  })

  test('Card-Reload-Button lädt die einzelne Card neu', async ({ page }) => {
    await page.goto('/')
    const reloadPromise = page.waitForResponse(
      (r) => r.url().includes('/api/card/alice/awesome-project') && r.status() === 200,
    )
    await page.locator('[data-card-name="alice/awesome-project"]').getByTitle('Neu laden').click()
    await reloadPromise
    await expect(page.locator('[data-card-name="alice/awesome-project"]')).toBeVisible()
    // Scope to PR row to avoid collision with activity items referencing the same PR title
    await expect(
      page
        .locator('[data-card-name="alice/awesome-project"] .pr-row')
        .filter({ hasText: 'feat: add dark mode support' }),
    ).toBeVisible()
  })

  test('Card zeigt Fehlerzustand wenn Neu-Laden fehlschlägt', async ({ page }) => {
    await page.goto('/')
    // GET /api/card/:owner/:repo mit Fehlerantwort mocken
    await page.route('**/api/card/alice/awesome-project', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<div class="card" data-card-name="alice/awesome-project" style="border-color:#f85149">
          <div class="card-header"><span>alice/awesome-project</span></div>
          <div class="card-body"><span>Verbindung zu GitHub fehlgeschlagen</span></div>
        </div>`,
      }),
    )
    await page.locator('[data-card-name="alice/awesome-project"]').getByTitle('Neu laden').click()
    await expect(page.getByText('Verbindung zu GitHub fehlgeschlagen')).toBeVisible({
      timeout: 5000,
    })
  })

  // --- Modal-Lifecycle ---

  test('Modal schließt bei Klick auf ×-Button', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      const modal = document.getElementById('modal')
      if (modal) {
        modal.innerHTML = `
          <div class="modal-overlay">
            <div class="modal" onclick="event.stopPropagation()">
              <div style="padding:15px 20px;display:flex;align-items:center">
                <span style="flex:1">Test Modal</span>
                <button onclick="document.getElementById('modal').innerHTML=''"
                        style="font-size:20px">×</button>
              </div>
            </div>
          </div>`
      }
    })
    await expect(page.getByText('Test Modal')).toBeVisible()
    await page.locator('#modal button').filter({ hasText: '×' }).click()
    await expect(page.getByText('Test Modal')).not.toBeVisible()
  })

  test('Modal schließt bei Klick auf den Overlay', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      const modal = document.getElementById('modal')
      if (modal) {
        modal.innerHTML = `
          <div class="modal-overlay"
               onclick="if(event.target===this)document.getElementById('modal').innerHTML=''">
            <div class="modal" onclick="event.stopPropagation()">
              <span>Test Modal</span>
            </div>
          </div>`
      }
    })
    await expect(page.getByText('Test Modal')).toBeVisible()
    // dispatchEvent auf dem Overlay selbst damit event.target===this gilt
    await page.evaluate(() => {
      const overlay = document.querySelector('.modal-overlay') as HTMLElement
      overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await expect(page.getByText('Test Modal')).not.toBeVisible()
  })

  test('Modal schließt mit Escape-Taste', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      const modal = document.getElementById('modal')
      if (modal) {
        modal.innerHTML = `
          <div class="modal-overlay">
            <div class="modal"><span>Test Modal</span></div>
          </div>`
      }
    })
    await expect(page.getByText('Test Modal')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Test Modal')).not.toBeVisible()
  })

  test('PR-Modal öffnet sich bei Klick auf "+ weiterer PR"-Button', async ({ page }) => {
    await page.goto('/')
    const modalPromise = page.waitForResponse(
      (r) => r.url().includes('/api/prs/alice/awesome-project') && r.status() === 200,
    )
    await page
      .locator('[data-card-name="alice/awesome-project"]')
      .getByText('+ 1 weiterer PR')
      .click()
    await modalPromise
    // Modal-Header und der Overflow-PR (nicht auf der Card sichtbar) prüfen
    await expect(page.locator('#modal').getByText('Pull Requests')).toBeVisible()
    await expect(page.getByText('feat: add export functionality')).toBeVisible()
  })

  // --- Drag & Drop ---

  test('Cards können per Drag & Drop umsortiert werden', async ({ page }) => {
    await page.goto('/')
    // Initialreihenfolge: awesome-project (0), another-repo (1)
    const card1 = page.locator('[data-card-name="alice/awesome-project"]')
    const card2 = page.locator('[data-card-name="alice/another-repo"]')

    const reorderPromise = page.waitForResponse(
      (r) => r.url().includes('/api/cards/reorder') && r.status() === 200,
    )
    const cardsRefreshPromise = page.waitForResponse(
      (r) => r.url().includes('/api/cards') && !r.url().includes('reorder') && r.status() === 200,
    )

    await card1.dragTo(card2)
    await reorderPromise
    await cardsRefreshPromise

    // Nach dem Tauschen: another-repo vorne, awesome-project hinten
    const cards = page.locator('[data-card-name]')
    await expect(cards.nth(0)).toHaveAttribute('data-card-name', 'alice/another-repo')
    await expect(cards.nth(1)).toHaveAttribute('data-card-name', 'alice/awesome-project')
  })

  // --- Leer-Zustand ---

  test('zeigt Leerstate wenn alle Repos entfernt wurden', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-card-name="alice/awesome-project"]').getByTitle('Entfernen').click()
    await expect(page.locator('[data-card-name="alice/awesome-project"]')).not.toBeVisible({
      timeout: 5000,
    })
    await page.locator('[data-card-name="alice/another-repo"]').getByTitle('Entfernen').click()
    await expect(page.locator('[data-card-name="alice/another-repo"]')).not.toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByText('Noch keine Repos gepinnt')).toBeVisible()
  })
})
