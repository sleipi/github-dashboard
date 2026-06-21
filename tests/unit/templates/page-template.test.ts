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
})
