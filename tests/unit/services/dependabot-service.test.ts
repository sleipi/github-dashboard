import { describe, expect, test } from 'bun:test'
import type { DependabotSnapshot } from '../../../src/db/types.ts'
import { calculateTrend } from '../../../src/services/dependabot-service.ts'

const snap = (daysAgo: number, count: number, now: Date): DependabotSnapshot => ({
  repoFullName: 'alice/alpha',
  count,
  recordedAt: new Date(now.getTime() - daysAgo * 86_400_000),
})

describe('calculateTrend', () => {
  const now = new Date('2026-06-20T12:00:00Z')

  test('returns all null for empty history', () => {
    const trend = calculateTrend([], now)
    expect(trend).toEqual({ week: null, month: null, sixMonths: null })
  })

  test('returns null for week when history is too recent (< 3 days)', () => {
    const history = [snap(1, 5, now), snap(0, 7, now)]
    const trend = calculateTrend(history, now)
    expect(trend.week).toBeNull()
  })

  test('calculates positive weekly delta', () => {
    const history = [snap(8, 3, now), snap(0, 7, now)]
    const trend = calculateTrend(history, now)
    expect(trend.week).toBe(4) // 7 - 3
  })

  test('calculates negative monthly delta', () => {
    const history = [snap(31, 10, now), snap(0, 6, now)]
    const trend = calculateTrend(history, now)
    expect(trend.month).toBe(-4) // 6 - 10
  })
})
