import { afterEach, describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { SecurityAlert } from '../../../src/db/types.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

const T0 = new Date('2026-06-01T10:00:00Z')

function makeAlert(overrides: Partial<SecurityAlert> = {}): SecurityAlert {
  return {
    repoFullName: 'alice/alpha',
    number: 1,
    ecosystem: 'npm',
    packageName: 'lodash',
    title: 'Prototype Pollution in lodash',
    severity: 'high',
    cvssScore: 7.4,
    createdAt: T0,
    htmlUrl: 'https://github.com/alice/alpha/security/dependabot/1',
    ...overrides,
  }
}

describe('SecurityAlertsRepo', () => {
  const cleanup: string[] = []
  afterEach(() => {
    cleanup.splice(0).forEach(cleanupTempDir)
  })

  test('getAlerts returns empty for unknown repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    expect(repos.security.getAlerts('alice/alpha')).toEqual([])
    repos.close()
  })

  test('upsertAlerts stores all fields and getAlerts retrieves them', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.security.upsertAlerts('alice/alpha', [makeAlert()])
    const alerts = repos.security.getAlerts('alice/alpha')

    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.ecosystem).toBe('npm')
    expect(alerts[0]?.packageName).toBe('lodash')
    expect(alerts[0]?.title).toBe('Prototype Pollution in lodash')
    expect(alerts[0]?.severity).toBe('high')
    expect(alerts[0]?.cvssScore).toBe(7.4)
    expect(alerts[0]?.createdAt.toISOString()).toBe(T0.toISOString())
    expect(alerts[0]?.htmlUrl).toContain('/security/dependabot/1')
    repos.close()
  })

  test('upsertAlerts replaces existing alerts for repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.security.upsertAlerts('alice/alpha', [makeAlert({ number: 1 }), makeAlert({ number: 2 })])
    repos.security.upsertAlerts('alice/alpha', [makeAlert({ number: 3 })])

    const alerts = repos.security.getAlerts('alice/alpha')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.number).toBe(3)
    repos.close()
  })

  test('upsertAlerts with empty array clears existing alerts', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.security.upsertAlerts('alice/alpha', [makeAlert()])
    repos.security.upsertAlerts('alice/alpha', [])

    expect(repos.security.getAlerts('alice/alpha')).toHaveLength(0)
    repos.close()
  })

  test('getAlerts sorts critical before high before medium before low', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.security.upsertAlerts('alice/alpha', [
      makeAlert({ number: 1, severity: 'low' }),
      makeAlert({ number: 2, severity: 'critical' }),
      makeAlert({ number: 3, severity: 'medium' }),
      makeAlert({ number: 4, severity: 'high' }),
    ])

    const alerts = repos.security.getAlerts('alice/alpha')
    expect(alerts.map((a) => a.severity)).toEqual(['critical', 'high', 'medium', 'low'])
    repos.close()
  })

  test('getAlerts within same severity orders oldest createdAt first', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const older = new Date('2026-01-01T00:00:00Z')
    const newer = new Date('2026-06-01T00:00:00Z')

    repos.security.upsertAlerts('alice/alpha', [
      makeAlert({ number: 1, severity: 'high', createdAt: newer }),
      makeAlert({ number: 2, severity: 'high', createdAt: older }),
    ])

    const alerts = repos.security.getAlerts('alice/alpha')
    expect(alerts[0]?.number).toBe(2)
    expect(alerts[1]?.number).toBe(1)
    repos.close()
  })

  test('upsertAlerts does not affect alerts for other repos', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.security.upsertAlerts('alice/alpha', [makeAlert({ repoFullName: 'alice/alpha' })])
    repos.security.upsertAlerts('alice/beta', [])

    expect(repos.security.getAlerts('alice/alpha')).toHaveLength(1)
    repos.close()
  })

  test('cvssScore can be null', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.security.upsertAlerts('alice/alpha', [makeAlert({ cvssScore: null })])
    const alerts = repos.security.getAlerts('alice/alpha')

    expect(alerts[0]?.cvssScore).toBeNull()
    repos.close()
  })
})
