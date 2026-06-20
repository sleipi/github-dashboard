import { afterEach, describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

const MIN_30 = 30 * 60 * 1000

describe('DependabotRepo', () => {
  const cleanup: string[] = []
  afterEach(() => {
    cleanup.splice(0).forEach(cleanupTempDir)
  })

  test('getHistory returns empty for unknown repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-dep-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    expect(repos.dependabot.getHistory('alice/alpha')).toEqual([])
    repos.close()
  })

  test('maybeRecordSnapshot stores first snapshot immediately', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-dep-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const now = new Date('2026-06-20T10:00:00Z')

    repos.dependabot.maybeRecordSnapshot('alice/alpha', 3, now, MIN_30)

    const history = repos.dependabot.getHistory('alice/alpha')
    expect(history).toHaveLength(1)
    expect(history[0]?.count).toBe(3)
    repos.close()
  })

  test('maybeRecordSnapshot skips if within minInterval', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-dep-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const t0 = new Date('2026-06-20T10:00:00Z')
    const t1 = new Date('2026-06-20T10:15:00Z') // 15 min später

    repos.dependabot.maybeRecordSnapshot('alice/alpha', 3, t0, MIN_30)
    repos.dependabot.maybeRecordSnapshot('alice/alpha', 5, t1, MIN_30)

    expect(repos.dependabot.getHistory('alice/alpha')).toHaveLength(1)
    repos.close()
  })

  test('maybeRecordSnapshot records after minInterval', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-dep-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const t0 = new Date('2026-06-20T10:00:00Z')
    const t1 = new Date('2026-06-20T10:31:00Z') // 31 min später

    repos.dependabot.maybeRecordSnapshot('alice/alpha', 3, t0, MIN_30)
    repos.dependabot.maybeRecordSnapshot('alice/alpha', 5, t1, MIN_30)

    expect(repos.dependabot.getHistory('alice/alpha')).toHaveLength(2)
    repos.close()
  })

  test('pruneOld removes entries older than daysToKeep', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-dep-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const old = new Date('2025-01-01T00:00:00Z')
    const recent = new Date('2026-06-20T10:00:00Z')
    const now = new Date('2026-06-20T10:01:00Z')

    // Insert both directly (bypass interval check by using different timestamps > 30min apart)
    repos.dependabot.maybeRecordSnapshot('alice/alpha', 10, old, 0)
    repos.dependabot.maybeRecordSnapshot('alice/alpha', 5, recent, 0)
    repos.dependabot.pruneOld(183, now)

    const history = repos.dependabot.getHistory('alice/alpha')
    expect(history).toHaveLength(1)
    expect(history[0]?.count).toBe(5)
    repos.close()
  })
})
