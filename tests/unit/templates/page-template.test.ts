import { describe, expect, test } from 'bun:test'
import { renderDashboard, renderSetupPage } from '../../../src/templates/page-template.ts'

describe('renderSetupPage', () => {
  test('renders the PAT input form', () => {
    const html = renderSetupPage()
    expect(html).toContain('Personal Access Token')
    expect(html).toContain('<form')
    expect(html).toContain('/api/auth')
  })

  test('renders error message when one is provided', () => {
    const html = renderSetupPage('Invalid token')
    expect(html).toContain('Invalid token')
  })

  test('does not render an error block when no error is provided', () => {
    const html = renderSetupPage()
    expect(html).not.toContain('color:#f85149')
  })

  test('escapes HTML in the error message', () => {
    const html = renderSetupPage('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  test('includes a favicon link', () => {
    const html = renderSetupPage()
    expect(html).toContain('rel="icon"')
  })
})

describe('renderDashboard', () => {
  test('renders the username in the header', () => {
    const html = renderDashboard('', 'alice', '')
    expect(html).toContain('alice')
  })

  test('renders the avatar image when avatarUrl is provided', () => {
    const html = renderDashboard('', 'alice', 'https://example.com/avatar.png')
    expect(html).toContain('https://example.com/avatar.png')
  })

  test('injects cardsHtml into the cards container', () => {
    const cardsHtml = '<div id="test-card">card content</div>'
    const html = renderDashboard(cardsHtml, 'alice', '')
    expect(html).toContain(cardsHtml)
  })

  test('escapes HTML in username', () => {
    const html = renderDashboard('', '<script>alert(1)</script>', '')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('escapes HTML in avatarUrl', () => {
    const html = renderDashboard('', 'alice', '" onerror="alert(1)')
    expect(html).not.toContain('" onerror="alert(1)')
    expect(html).toContain('&quot; onerror=&quot;alert(1)')
  })

  test('includes HTMX auto-refresh trigger on the cards container', () => {
    const html = renderDashboard('', 'alice', '')
    expect(html).toContain('hx-get="/api/cards"')
    expect(html).toContain('every 10s')
  })

  test('includes a favicon link', () => {
    const html = renderDashboard('', 'alice', '')
    expect(html).toContain('rel="icon"')
  })

  test('includes the add-repo button', () => {
    const html = renderDashboard('', 'alice', '')
    expect(html).toContain('hx-get="/api/modal/repos"')
  })

  test('renders no expiry icon when expiresAt is null', () => {
    const html = renderDashboard('', 'alice', '', null, null)
    expect(html).not.toContain('pat-modal')
  })

  test('renders expiry icon with info color when severity is info', () => {
    const expiresAt = new Date(Date.now() + 30 * 86_400_000)
    const html = renderDashboard('', 'alice', '', expiresAt, 'info')
    expect(html).toContain('#388bfd')
    expect(html).toContain('pat-modal')
  })

  test('renders expiry icon with notice color when severity is notice', () => {
    const expiresAt = new Date(Date.now() + 10 * 86_400_000)
    const html = renderDashboard('', 'alice', '', expiresAt, 'notice')
    expect(html).toContain('#d29922')
  })

  test('renders expiry icon with warning color when severity is warning', () => {
    const expiresAt = new Date(Date.now() + 1 * 86_400_000)
    const html = renderDashboard('', 'alice', '', expiresAt, 'warning')
    expect(html).toContain('#f85149')
  })

  test('icon title contains days remaining and expiry date', () => {
    const expiresAt = new Date('2026-12-31T00:00:00.000Z')
    const html = renderDashboard('', 'alice', '', expiresAt, 'info')
    expect(html).toContain('2026-12-31')
  })

  test('renewal modal contains link to GitHub token settings', () => {
    const expiresAt = new Date(Date.now() + 30 * 86_400_000)
    const html = renderDashboard('', 'alice', '', expiresAt, 'info')
    expect(html).toContain('https://github.com/settings/tokens')
  })

  test('renewal modal contains PAT input form that posts to /api/auth', () => {
    const expiresAt = new Date(Date.now() + 30 * 86_400_000)
    const html = renderDashboard('', 'alice', '', expiresAt, 'info')
    expect(html).toContain('hx-post="/api/auth"')
    expect(html).toContain('type="password"')
  })
})
