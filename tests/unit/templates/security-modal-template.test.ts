import { describe, expect, test } from 'bun:test'
import type { SecurityAlert, SlaSettings } from '../../../src/db/types.ts'
import {
  renderSecurityModal,
  renderSlaSettingsModal,
  toSecurityModalViewModel,
} from '../../../src/templates/security-modal-template.ts'

const DEFAULT_SLA: SlaSettings = { critical: 7, high: 30, medium: 90, low: 180 }
const NOW = new Date('2026-07-08T12:00:00Z')

function makeAlert(overrides: Partial<SecurityAlert> = {}): SecurityAlert {
  return {
    repoFullName: 'alice/alpha',
    number: 1,
    ecosystem: 'npm',
    packageName: 'lodash',
    title: 'Prototype Pollution',
    severity: 'high',
    cvssScore: 7.4,
    createdAt: new Date(NOW.getTime() - 10 * 86_400_000),
    htmlUrl: 'https://github.com/alice/alpha/security/dependabot/1',
    ...overrides,
  }
}

describe('toSecurityModalViewModel', () => {
  test('hasAlerts is false for empty alerts', () => {
    const vm = toSecurityModalViewModel('alice/alpha', [], DEFAULT_SLA, NOW)
    expect(vm.hasAlerts).toBe(false)
    expect(vm.rows).toHaveLength(0)
  })

  test('hasAlerts is true when alerts present', () => {
    const vm = toSecurityModalViewModel('alice/alpha', [makeAlert()], DEFAULT_SLA, NOW)
    expect(vm.hasAlerts).toBe(true)
  })

  test('row ageDays is floored days since createdAt', () => {
    const alert = makeAlert({ createdAt: new Date(NOW.getTime() - 10 * 86_400_000) })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    expect(vm.rows[0]?.ageDays).toBe(10)
  })

  test('overdueBy is null when alert within SLA', () => {
    // high SLA = 30 days; alert is 10 days old
    const alert = makeAlert({
      severity: 'high',
      createdAt: new Date(NOW.getTime() - 10 * 86_400_000),
    })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    expect(vm.rows[0]?.overdueBy).toBeNull()
  })

  test('overdueBy is floored days over SLA when alert exceeds SLA', () => {
    // high SLA = 30 days; alert is 43 days old → 13 days over
    const alert = makeAlert({
      severity: 'high',
      createdAt: new Date(NOW.getTime() - 43 * 86_400_000),
    })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    expect(vm.rows[0]?.overdueBy).toBe(13)
  })

  test('sorts critical before high before medium before low', () => {
    const alerts = [
      makeAlert({ number: 1, severity: 'low' }),
      makeAlert({ number: 2, severity: 'critical' }),
      makeAlert({ number: 3, severity: 'medium' }),
      makeAlert({ number: 4, severity: 'high' }),
    ]
    const vm = toSecurityModalViewModel('alice/alpha', alerts, DEFAULT_SLA, NOW)
    expect(vm.rows.map((r) => r.severity)).toEqual(['critical', 'high', 'medium', 'low'])
  })

  test('within same severity, overdue alerts sort before within-SLA alerts', () => {
    const withinSla = makeAlert({
      number: 1,
      severity: 'high',
      createdAt: new Date(NOW.getTime() - 10 * 86_400_000), // 10 days, within 30d SLA
    })
    const overdue = makeAlert({
      number: 2,
      severity: 'high',
      createdAt: new Date(NOW.getTime() - 35 * 86_400_000), // 35 days, over 30d SLA
    })
    const vm = toSecurityModalViewModel('alice/alpha', [withinSla, overdue], DEFAULT_SLA, NOW)
    expect(vm.rows[0]?.number).toBe(2) // overdue first
    expect(vm.rows[1]?.number).toBe(1)
  })
})

describe('renderSecurityModal', () => {
  test('shows "No open security alerts" when no alerts', () => {
    const vm = toSecurityModalViewModel('alice/alpha', [], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).toContain('No open security alerts')
  })

  test('renders repo name in modal heading', () => {
    const vm = toSecurityModalViewModel('alice/alpha', [makeAlert()], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).toContain('alice/alpha')
  })

  test('renders alert row with htmlUrl as link', () => {
    const alert = makeAlert({ htmlUrl: 'https://github.com/alice/alpha/security/dependabot/42' })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).toContain('https://github.com/alice/alpha/security/dependabot/42')
  })

  test('renders overdue indicator for overdue alerts', () => {
    const alert = makeAlert({
      severity: 'high',
      createdAt: new Date(NOW.getTime() - 43 * 86_400_000),
    })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).toContain('over SLA')
  })

  test('renders CVSS score when present', () => {
    const alert = makeAlert({ cvssScore: 9.8 })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).toContain('9.8')
  })

  test('renders dash for null CVSS score', () => {
    const alert = makeAlert({ cvssScore: null })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).toContain('—')
  })

  test('escapes HTML in alert title', () => {
    const alert = makeAlert({ title: '<script>alert(1)</script>' })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('renderSlaSettingsModal', () => {
  test('renders input for each severity with current values', () => {
    const sla: SlaSettings = { critical: 7, high: 30, medium: 90, low: 180 }
    const html = renderSlaSettingsModal(sla)
    expect(html).toContain('value="7"')
    expect(html).toContain('value="30"')
    expect(html).toContain('value="90"')
    expect(html).toContain('value="180"')
  })

  test('renders industry standard hint for each severity', () => {
    const sla: SlaSettings = { critical: 7, high: 30, medium: 90, low: 180 }
    const html = renderSlaSettingsModal(sla)
    expect(html).toContain('industry standard')
  })

  test('form posts to /api/settings/sla', () => {
    const html = renderSlaSettingsModal({ critical: 7, high: 30, medium: 90, low: 180 })
    expect(html).toContain('hx-post="/api/settings/sla"')
  })

  test('renders custom values not equal to defaults', () => {
    const sla: SlaSettings = { critical: 3, high: 14, medium: 60, low: 90 }
    const html = renderSlaSettingsModal(sla)
    expect(html).toContain('value="3"')
    expect(html).toContain('value="14"')
  })
})
