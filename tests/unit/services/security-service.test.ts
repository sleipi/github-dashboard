import { describe, expect, test } from 'bun:test'
import type { SecurityAlert, SlaSettings } from '../../../src/db/types.ts'
import { calculateSecurityCounts } from '../../../src/services/security-service.ts'

const DEFAULT_SLA: SlaSettings = { critical: 7, high: 30, medium: 90, low: 180 }
const NOW = new Date('2026-07-08T12:00:00Z')

function makeAlert(overrides: Partial<SecurityAlert> = {}): SecurityAlert {
  return {
    repoFullName: 'alice/alpha',
    number: 1,
    ecosystem: 'npm',
    packageName: 'lodash',
    title: 'test alert',
    severity: 'high',
    cvssScore: 5.0,
    createdAt: new Date(NOW.getTime() - 10 * 86_400_000), // 10 days ago
    htmlUrl: 'https://github.com/alice/alpha/security/dependabot/1',
    ...overrides,
  }
}

describe('calculateSecurityCounts', () => {
  test('returns all-zero counts and empty overdueSeverities for empty alerts', () => {
    const counts = calculateSecurityCounts([], DEFAULT_SLA, NOW)
    expect(counts.critical).toBe(0)
    expect(counts.high).toBe(0)
    expect(counts.medium).toBe(0)
    expect(counts.low).toBe(0)
    expect(counts.overdueSeverities.size).toBe(0)
  })

  test('counts alerts by severity', () => {
    const alerts = [
      makeAlert({ number: 1, severity: 'critical' }),
      makeAlert({ number: 2, severity: 'critical' }),
      makeAlert({ number: 3, severity: 'high' }),
      makeAlert({ number: 4, severity: 'medium' }),
      makeAlert({ number: 5, severity: 'low' }),
      makeAlert({ number: 6, severity: 'low' }),
    ]
    const counts = calculateSecurityCounts(alerts, DEFAULT_SLA, NOW)
    expect(counts.critical).toBe(2)
    expect(counts.high).toBe(1)
    expect(counts.medium).toBe(1)
    expect(counts.low).toBe(2)
  })

  test('marks severity overdue when any alert exceeds SLA threshold', () => {
    // high SLA = 30 days; alert is 31 days old → overdue
    const alert = makeAlert({
      severity: 'high',
      createdAt: new Date(NOW.getTime() - 31 * 86_400_000),
    })
    const counts = calculateSecurityCounts([alert], DEFAULT_SLA, NOW)
    expect(counts.overdueSeverities.has('high')).toBe(true)
  })

  test('does not mark overdue when alert age equals SLA exactly', () => {
    // high SLA = 30 days; alert is exactly 30 days old → NOT overdue (must be >)
    const alert = makeAlert({
      severity: 'high',
      createdAt: new Date(NOW.getTime() - 30 * 86_400_000),
    })
    const counts = calculateSecurityCounts([alert], DEFAULT_SLA, NOW)
    expect(counts.overdueSeverities.has('high')).toBe(false)
  })

  test('marks only the exceeded severity, not all', () => {
    const alerts = [
      // critical SLA=7d, alert is 10d old → overdue
      makeAlert({
        number: 1,
        severity: 'critical',
        createdAt: new Date(NOW.getTime() - 10 * 86_400_000),
      }),
      // high SLA=30d, alert is 10d old → NOT overdue
      makeAlert({
        number: 2,
        severity: 'high',
        createdAt: new Date(NOW.getTime() - 10 * 86_400_000),
      }),
    ]
    const counts = calculateSecurityCounts(alerts, DEFAULT_SLA, NOW)
    expect(counts.overdueSeverities.has('critical')).toBe(true)
    expect(counts.overdueSeverities.has('high')).toBe(false)
    expect(counts.overdueSeverities.has('medium')).toBe(false)
    expect(counts.overdueSeverities.has('low')).toBe(false)
  })

  test('marks severity overdue if at least one alert in that severity exceeds SLA', () => {
    const alerts = [
      // high, 10d old — within 30d SLA
      makeAlert({
        number: 1,
        severity: 'high',
        createdAt: new Date(NOW.getTime() - 10 * 86_400_000),
      }),
      // high, 35d old — over 30d SLA
      makeAlert({
        number: 2,
        severity: 'high',
        createdAt: new Date(NOW.getTime() - 35 * 86_400_000),
      }),
    ]
    const counts = calculateSecurityCounts(alerts, DEFAULT_SLA, NOW)
    expect(counts.overdueSeverities.has('high')).toBe(true)
  })

  test('uses custom SLA values from provided SlaSettings', () => {
    const customSla: SlaSettings = { critical: 1, high: 1, medium: 1, low: 1 }
    // alert is 2 days old; custom SLA is 1 day → all severities overdue
    const alert = makeAlert({
      severity: 'low',
      createdAt: new Date(NOW.getTime() - 2 * 86_400_000),
    })
    const counts = calculateSecurityCounts([alert], customSla, NOW)
    expect(counts.overdueSeverities.has('low')).toBe(true)
  })
})
