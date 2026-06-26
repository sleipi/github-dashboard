import { describe, expect, test } from 'bun:test'
import {
  ageRowStyle,
  aggregateCiStatus,
  depBgColor,
  depColor,
  escapeHtml,
  formatDepBadgeTrend,
  formatDepLabel,
  formatRelative,
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

describe('formatDepBadgeTrend', () => {
  test('returns empty string when all null', () => {
    expect(formatDepBadgeTrend({ week: null, month: null, sixMonths: null })).toBe('')
  })
  test('formats labeled pipe-separated values without + prefix', () => {
    expect(formatDepBadgeTrend({ week: -4, month: 10, sixMonths: 99 })).toBe(
      'week -4 | month 10 | 6month 99',
    )
  })
  test('caps values at 99+ when >= 100', () => {
    expect(formatDepBadgeTrend({ week: 150, month: -200, sixMonths: 100 })).toBe(
      'week 99+ | month -99+ | 6month 99+',
    )
  })
  test('propagates week to month and 6-month when only week present', () => {
    expect(formatDepBadgeTrend({ week: 2, month: null, sixMonths: null })).toBe(
      'week 2 | month 2 | 6month 2',
    )
  })
  test('propagates month to 6-month when sixMonths null', () => {
    expect(formatDepBadgeTrend({ week: 1, month: 3, sixMonths: null })).toBe(
      'week 1 | month 3 | 6month 3',
    )
  })
})

describe('depBgColor', () => {
  test('green bg for 0 alerts', () => {
    expect(depBgColor(0)).toBe('rgba(63,185,80,0.12)')
  })
  test('red bg for > 5 alerts', () => {
    expect(depBgColor(6)).toBe('rgba(248,81,73,0.15)')
  })
  test('orange bg for 1-5 alerts', () => {
    expect(depBgColor(3)).toBe('rgba(210,153,34,0.15)')
  })
})

describe('formatDepLabel', () => {
  test('base label only when all trend null', () => {
    expect(formatDepLabel(5, { week: null, month: null, sixMonths: null })).toBe(
      '5 open Dependabot alerts',
    )
  })
  test('no alerts base label', () => {
    expect(formatDepLabel(0, { week: null, month: null, sixMonths: null })).toBe(
      'No Dependabot alerts',
    )
  })
  test('99+ label when count >= 100', () => {
    expect(formatDepLabel(100, { week: null, month: null, sixMonths: null })).toBe(
      '99+ open Dependabot alerts',
    )
  })
  test('singular label for 1 alert', () => {
    expect(formatDepLabel(1, { week: null, month: null, sixMonths: null })).toBe(
      '1 open Dependabot alert',
    )
  })
  test('all three periods when all trend data present', () => {
    const label = formatDepLabel(5, { week: 2, month: -1, sixMonths: 0 })
    expect(label).toContain('+2 this week')
    expect(label).toContain('-1 this month')
    expect(label).toContain('0 last 6 months')
  })
  test('propagates week value to month and 6-month when only week data exists', () => {
    const label = formatDepLabel(3, { week: 2, month: null, sixMonths: null })
    expect(label).toContain('+2 this week')
    expect(label).toContain('+2 this month')
    expect(label).toContain('+2 last 6 months')
  })
  test('propagates month value to 6-month when month exists but sixMonths null', () => {
    const label = formatDepLabel(3, { week: 1, month: 3, sixMonths: null })
    expect(label).toContain('+1 this week')
    expect(label).toContain('+3 this month')
    expect(label).toContain('+3 last 6 months')
  })
  test('shows ? for week when only sixMonths data exists', () => {
    const label = formatDepLabel(3, { week: null, month: null, sixMonths: 4 })
    expect(label).toContain('? this week')
    expect(label).toContain('? this month')
    expect(label).toContain('+4 last 6 months')
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
