import { describe, expect, test } from 'bun:test'
import {
  ageRowStyle,
  aggregateCiStatus,
  escapeHtml,
  formatRelative,
  freshAgeStyle,
} from '../../../src/templates/formatters.ts'

const now = new Date('2026-06-20T12:00:00Z')

describe('formatRelative', () => {
  test('returns "just now" for < 60s', () => {
    expect(formatRelative(new Date(now.getTime() - 30_000), now)).toBe('just now')
  })
  test('returns minutes for < 1h', () => {
    expect(formatRelative(new Date(now.getTime() - 5 * 60_000), now)).toBe('5m ago')
  })
  test('returns hours for < 24h', () => {
    expect(formatRelative(new Date(now.getTime() - 3 * 3_600_000), now)).toBe('3h ago')
  })
  test('returns "—" for null', () => {
    expect(formatRelative(null, now)).toBe('—')
  })
})

describe('aggregateCiStatus', () => {
  test('returns null for empty array', () => {
    expect(aggregateCiStatus([])).toBeNull()
  })
  test('failure takes priority over success', () => {
    expect(aggregateCiStatus(['success', 'failure', 'pending'])).toBe('failure')
  })
  test('pending takes priority over unknown', () => {
    expect(aggregateCiStatus(['unknown', 'pending'])).toBe('pending')
  })
  test('all success returns success', () => {
    expect(aggregateCiStatus(['success', 'success'])).toBe('success')
  })
})

describe('ageRowStyle', () => {
  test('returns empty string for null date', () => {
    expect(ageRowStyle(null, now)).toBe('')
  })
  test('returns empty string for date 5 days old', () => {
    expect(ageRowStyle(new Date(now.getTime() - 5 * 86_400_000), now)).toBe('')
  })
  test('returns faint orange for 8 days old', () => {
    expect(ageRowStyle(new Date(now.getTime() - 8 * 86_400_000), now)).toContain(
      'rgba(248,113,113,0.07)',
    )
  })
  test('returns stronger orange for 20 days old', () => {
    expect(ageRowStyle(new Date(now.getTime() - 20 * 86_400_000), now)).toContain(
      'rgba(248,113,113,0.11)',
    )
  })
  test('returns medium orange for 45 days old', () => {
    expect(ageRowStyle(new Date(now.getTime() - 45 * 86_400_000), now)).toContain(
      'rgba(248,113,113,0.16)',
    )
  })
  test('returns max orange for 100 days old', () => {
    expect(ageRowStyle(new Date(now.getTime() - 100 * 86_400_000), now)).toContain(
      'rgba(248,113,113,0.22)',
    )
  })
})

describe('escapeHtml', () => {
  test('escapes ampersand', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b')
  })
  test('escapes less-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })
  test('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;')
  })
  test('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s')
  })
  test('escapes all special chars in one string', () => {
    expect(escapeHtml('<a href="foo&bar">it\'s</a>')).toBe(
      '&lt;a href=&quot;foo&amp;bar&quot;&gt;it&#39;s&lt;/a&gt;',
    )
  })
  test('leaves plain strings unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })
})

describe('freshAgeStyle', () => {
  test('returns empty string for null date', () => {
    expect(freshAgeStyle(null, now)).toBe('')
  })

  test('returns max-opacity green for a brand-new item (0 hours old)', () => {
    const style = freshAgeStyle(new Date(now.getTime() - 30_000), now)
    expect(style).toContain('rgba(34,197,94,0.5)')
  })

  test('returns lower-opacity green for a 3-hour-old item', () => {
    const style = freshAgeStyle(new Date(now.getTime() - 3 * 3_600_000), now)
    expect(style).toContain('rgba(34,197,94,0.25)')
  })

  test('returns faintest green for a 5-hour-old item', () => {
    const style = freshAgeStyle(new Date(now.getTime() - 5 * 3_600_000), now)
    expect(style).toContain('rgba(34,197,94,0.08)')
  })

  test('returns empty string for item 6 hours old (out of green window)', () => {
    const style = freshAgeStyle(new Date(now.getTime() - 6 * 3_600_000), now)
    expect(style).toBe('')
  })

  test('returns empty string for item 3 days old', () => {
    const style = freshAgeStyle(new Date(now.getTime() - 3 * 86_400_000), now)
    expect(style).toBe('')
  })

  test('falls back to red scale for item older than 7 days', () => {
    const style = freshAgeStyle(new Date(now.getTime() - 10 * 86_400_000), now)
    expect(style).toContain('rgba(248,113,113,')
  })

  test('opacity is lower for 3h old item than brand-new item', () => {
    const newStyle = freshAgeStyle(new Date(now.getTime() - 0), now)
    const oldStyle = freshAgeStyle(new Date(now.getTime() - 3 * 3_600_000), now)
    const extract = (s: string) =>
      Number.parseFloat(s.match(/rgba\(34,197,94,([^)]+)\)/)?.[1] ?? '0')
    expect(extract(newStyle)).toBeGreaterThan(extract(oldStyle))
  })
})
