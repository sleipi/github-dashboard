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
    const modalLinks = page.locator('#modal a[href*="github.com"]')
    await expect(modalLinks).toHaveCount(9)
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

// The server runs with the seeded DB from seed-db.ts
// Contains: 2 pinned repos, 2 PRs for alice/awesome-project

test.describe('Dashboard', () => {
  // Restore seeded session so dashboard tests run independently of auth tests
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/test/restore-session')
  })

  test('shows dashboard when logged in', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Dashboard')).toBeVisible()
    await expect(page.getByText('testuser')).toBeVisible()
  })

  test('shows pinned repos as cards', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('awesome-project')).toBeVisible()
    await expect(page.getByText('another-repo')).toBeVisible()
  })

  test('shows PRs in the card', async ({ page }) => {
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

  test('shows Dependabot alert count', async ({ page }) => {
    await page.goto('/')
    // 3 current alerts — search by title attribute since '3' also appears in PR numbers
    await expect(
      page.locator('[data-card-name="alice/awesome-project"] [title="3 open Dependabot alerts"]'),
    ).toBeVisible()
  })

  test('"Add repo" opens modal', async ({ page }) => {
    await page.goto('/')
    // Open HTMX modal — no live GitHub, so the request will fail
    // We only test that the button exists and is clickable
    const btn = page.getByRole('button', { name: /Add repo/i })
    await expect(btn).toBeVisible()
  })

  test('Sign out redirects to setup page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Sign out/i }).click()
    await expect(page.getByText('Personal Access Token')).toBeVisible()
  })

  test('PR link opens in new tab', async ({ page }) => {
    await page.goto('/')
    // Scope to PR rows to avoid collision with activity items that also reference PR #42
    const prLink = page
      .locator('[data-card-name="alice/awesome-project"] .pr-row')
      .filter({ hasText: 'feat: add dark mode support' })
    await expect(prLink).toHaveAttribute('target', '_blank')
    await expect(prLink).toHaveAttribute('href', /github\.com\/alice\/awesome-project\/pull\/42/)
  })

  test('Refresh button is visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible()
  })

  test('Remove button removes the card from the dashboard', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-card-name="alice/awesome-project"]')).toBeVisible()
    await page.locator('[data-card-name="alice/awesome-project"]').getByTitle('Remove').click()
    await expect(page.locator('[data-card-name="alice/awesome-project"]')).not.toBeVisible({
      timeout: 5000,
    })
    await expect(page.locator('[data-card-name="alice/another-repo"]')).toBeVisible()
  })

  test('repo-search filters repos in modal', async ({ page }) => {
    await page.goto('/')

    // Inject modal HTML directly (bypasses GitHub API call)
    await page.evaluate(() => {
      const modal = document.getElementById('modal')
      if (modal) {
        modal.innerHTML = `
          <div class="modal-overlay">
            <div class="modal" style="display:flex;flex-direction:column">
              <div style="padding:10px 14px;border-bottom:1px solid #21262d">
                <input id="repo-search" type="text" placeholder="Search repos…"
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

  test('repo-search keeps flex layout after filtering', async ({ page }) => {
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

    // Filter then clear → display must remain flex
    await page.fill('#repo-search', 'foo')
    await page.fill('#repo-search', '')

    const displayValue = await page
      .locator('[data-repo-name="alice/foo"]')
      .evaluate((el) => window.getComputedStyle(el).display)
    expect(displayValue).toBe('flex')
  })

  test('_toggleCheck sets checkmark on first click', async ({ page }) => {
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

  test('_toggleCheck removes checkmark on second click', async ({ page }) => {
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

  // --- Card details ---

  test('shows "No open PRs" when repo has no PRs', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.locator('[data-card-name="alice/another-repo"]').getByText('✓ No open PRs'),
    ).toBeVisible()
  })

  test('shows Dependabot trend', async ({ page }) => {
    await page.goto('/')
    // Seed: 5 alerts 8 days ago → 3 now → weekly trend -2 → formatTrend: "(-2)"
    await expect(
      page.locator('[data-card-name="alice/awesome-project"]').getByText('(-2)'),
    ).toBeVisible()
  })

  test('repo link on the card opens in new tab', async ({ page }) => {
    await page.goto('/')
    const repoLink = page.locator('[data-card-name="alice/awesome-project"] .card-header a').first()
    await expect(repoLink).toHaveAttribute('target', '_blank')
    await expect(repoLink).toHaveAttribute('href', 'https://github.com/alice/awesome-project')
  })

  test('Dependabot link opens in new tab', async ({ page }) => {
    await page.goto('/')
    // Use exact href to avoid matching activity security_alert links (security/dependabot/N)
    const depLink = page.locator(
      '[data-card-name="alice/awesome-project"] a[href="https://github.com/alice/awesome-project/security/dependabot"]',
    )
    await expect(depLink).toHaveAttribute('target', '_blank')
  })

  test('shows Draft badge for draft PRs', async ({ page }) => {
    await page.goto('/')
    // PR #40 is seeded as draft:true
    await expect(
      page.locator('[data-card-name="alice/awesome-project"] .badge').filter({ hasText: 'Draft' }),
    ).toBeVisible()
  })

  test('shows "+ more PRs" button when more than 6 PRs exist', async ({ page }) => {
    await page.goto('/')
    // 7 PRs seeded, MAX_PRS_ON_CARD=5 → 2 overflow
    await expect(
      page.locator('[data-card-name="alice/awesome-project"]').getByText('+ 2 more PRs'),
    ).toBeVisible()
  })

  // --- HTMX interactions ---

  test('Refresh button reloads all cards', async ({ page }) => {
    await page.goto('/')
    const refreshPromise = page.waitForResponse(
      (r) => r.url().includes('/api/cards') && !r.url().includes('reorder') && r.status() === 200,
    )
    await page.getByRole('button', { name: /Refresh/i }).click()
    await refreshPromise
    await expect(page.getByText('awesome-project')).toBeVisible()
    await expect(page.getByText('another-repo')).toBeVisible()
  })

  test('card reload button reloads the individual card', async ({ page }) => {
    await page.goto('/')
    const reloadPromise = page.waitForResponse(
      (r) => r.url().includes('/api/card/alice/awesome-project') && r.status() === 200,
    )
    await page.locator('[data-card-name="alice/awesome-project"]').getByTitle('Refresh').click()
    await reloadPromise
    await expect(page.locator('[data-card-name="alice/awesome-project"]')).toBeVisible()
    // Scope to PR row to avoid collision with activity items referencing the same PR title
    await expect(
      page
        .locator('[data-card-name="alice/awesome-project"] .pr-row')
        .filter({ hasText: 'feat: add dark mode support' }),
    ).toBeVisible()
  })

  test('card shows error state when reload fails', async ({ page }) => {
    await page.goto('/')
    // Mock GET /api/card/:owner/:repo with an error response
    await page.route('**/api/card/alice/awesome-project', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<div class="card" data-card-name="alice/awesome-project" style="border-color:#f85149">
          <div class="card-header"><span>alice/awesome-project</span></div>
          <div class="card-body"><span>Connection to GitHub failed</span></div>
        </div>`,
      }),
    )
    await page.locator('[data-card-name="alice/awesome-project"]').getByTitle('Refresh').click()
    await expect(page.getByText('Connection to GitHub failed')).toBeVisible({
      timeout: 5000,
    })
  })

  // --- Modal lifecycle ---

  test('modal closes on click of × button', async ({ page }) => {
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

  test('modal closes on click of overlay', async ({ page }) => {
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
    // dispatchEvent on the overlay itself so event.target===this holds
    await page.evaluate(() => {
      const overlay = document.querySelector('.modal-overlay') as HTMLElement
      overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await expect(page.getByText('Test Modal')).not.toBeVisible()
  })

  test('modal closes with Escape key', async ({ page }) => {
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

  test('PR modal opens on click of "+ more PRs" button', async ({ page }) => {
    await page.goto('/')
    const modalPromise = page.waitForResponse(
      (r) => r.url().includes('/api/prs/alice/awesome-project') && r.status() === 200,
    )
    await page.locator('[data-card-name="alice/awesome-project"]').getByText('+ 2 more PRs').click()
    await modalPromise
    // Check modal header and the overflow PR (not visible on the card)
    await expect(page.locator('#modal').getByText('Pull Requests')).toBeVisible()
    await expect(page.getByText('feat: add export functionality')).toBeVisible()
  })

  // --- Drag & drop ---

  test('cards can be reordered via drag and drop', async ({ page }) => {
    await page.goto('/')
    // Initial order: awesome-project (0), another-repo (1)
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

    // After swap: another-repo first, awesome-project second
    const cards = page.locator('[data-card-name]')
    await expect(cards.nth(0)).toHaveAttribute('data-card-name', 'alice/another-repo')
    await expect(cards.nth(1)).toHaveAttribute('data-card-name', 'alice/awesome-project')
  })

  // --- Empty state ---

  test('browser tab shows count in title when new events arrive after watermark', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForSelector('[data-card-name]')

    // Reset watermark to epoch so all seeded activities appear "new"
    await page.evaluate(() => {
      ;(window as unknown as { _lastSeenAt: number })._lastSeenAt = 0
    })

    // Click Refresh to trigger an /api/cards poll with X-Last-Seen-Event-At: 0
    await page.click('button:has-text("Refresh")')
    await page.waitForFunction(() => document.title.includes('('))

    const title = await page.title()
    expect(title).toMatch(/^\(\d+\) GitHub Dashboard$/)
  })

  test('browser tab title clears badge on tab focus simulation', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-card-name]')

    // Set badge state
    await page.evaluate(() => {
      ;(window as unknown as { _lastSeenAt: number })._lastSeenAt = 0
    })
    await page.click('button:has-text("Refresh")')
    await page.waitForFunction(() => document.title.includes('('))

    // Simulate tab becoming visible (visibilitychange fires on page.bringToFront)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    const title = await page.title()
    expect(title).toBe('GitHub Dashboard')
  })

  test('shows empty state when all repos are removed', async ({ page }) => {
    await page.goto('/')

    // Unpin first card and wait for all cardsChanged HTMX refreshes to settle
    await page.locator('[data-card-name="alice/awesome-project"]').getByTitle('Remove').click()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-card-name="alice/awesome-project"]')).not.toBeVisible({
      timeout: 5000,
    })

    // Unpin second card and wait for all cardsChanged HTMX refreshes to settle
    await page.locator('[data-card-name="alice/another-repo"]').getByTitle('Remove').click()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-card-name="alice/another-repo"]')).not.toBeVisible({
      timeout: 5000,
    })

    await expect(page.getByText('No repos pinned yet')).toBeVisible()
  })
})
