import { describe, expect, test } from 'bun:test'
import {
  aggregateCiStatus,
  depColor,
  escapeHtml,
  formatRelative,
  formatTrend,
} from '../../../src/templates/formatters.ts'

const now = new Date('2026-06-20T12:00:00Z')

describe('formatRelative', () => {
  test('returns "Gerade eben" for < 60s', () => {
    expect(formatRelative(new Date(now.getTime() - 30_000), now)).toBe('Gerade eben')
  })
  test('returns minutes for < 1h', () => {
    expect(formatRelative(new Date(now.getTime() - 5 * 60_000), now)).toBe('vor 5 Min.')
  })
  test('returns hours for < 24h', () => {
    expect(formatRelative(new Date(now.getTime() - 3 * 3_600_000), now)).toBe('vor 3 Std.')
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

describe('formatTrend', () => {
  test('formats positive and negative deltas', () => {
    expect(formatTrend({ week: 2, month: -1, sixMonths: null })).toBe('(+2, -1)')
  })
  test('returns empty string when all null', () => {
    expect(formatTrend({ week: null, month: null, sixMonths: null })).toBe('')
  })
})

describe('depColor', () => {
  test('green for 0 alerts', () => {
    expect(depColor(0)).toBe('#3fb950')
  })
  test('red for > 5 alerts', () => {
    expect(depColor(6)).toBe('#f85149')
  })
  test('yellow for 1–5 alerts', () => {
    expect(depColor(3)).toBe('#d29922')
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
