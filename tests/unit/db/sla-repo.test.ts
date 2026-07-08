import { afterEach, describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

describe('SlaRepo', () => {
  const cleanup: string[] = []
  afterEach(() => {
    cleanup.splice(0).forEach(cleanupTempDir)
  })

  test('getSla returns industry-standard defaults when no settings stored', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sla-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    const sla = repos.sla.getSla()

    expect(sla.critical).toBe(7)
    expect(sla.high).toBe(30)
    expect(sla.medium).toBe(90)
    expect(sla.low).toBe(180)
    repos.close()
  })

  test('setSla + getSla roundtrips all four severities', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sla-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.sla.setSla({ critical: 3, high: 14, medium: 60, low: 90 })
    const sla = repos.sla.getSla()

    expect(sla.critical).toBe(3)
    expect(sla.high).toBe(14)
    expect(sla.medium).toBe(60)
    expect(sla.low).toBe(90)
    repos.close()
  })

  test('setSla overwrites previous values', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sla-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.sla.setSla({ critical: 1, high: 1, medium: 1, low: 1 })
    repos.sla.setSla({ critical: 14, high: 60, medium: 120, low: 365 })
    const sla = repos.sla.getSla()

    expect(sla.critical).toBe(14)
    expect(sla.high).toBe(60)
    repos.close()
  })

  test('setSla does not affect other settings keys', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sla-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })
    repos.sla.setSla({ critical: 7, high: 30, medium: 90, low: 180 })

    expect(repos.auth.getToken()?.pat).toBe('ghp_test')
    repos.close()
  })
})
