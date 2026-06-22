import { afterEach, describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { Activity } from '../../../src/db/types.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

const makeActivity = (overrides: Partial<Omit<Activity, 'id'>> = {}): Omit<Activity, 'id'> => ({
  repoFullName: 'alice/alpha',
  eventType: 'pr_merged',
  actor: '@bob',
  subject: 'merged #42 — Fix login bug',
  linkUrl: 'https://github.com/alice/alpha/pull/42',
  occurredAt: new Date('2026-06-20T10:00:00Z'),
  recordedAt: new Date('2026-06-20T10:01:00Z'),
  githubEventId: 'evt_001',
  ...overrides,
})

describe('ActivityRepo', () => {
  const cleanup: string[] = []
  afterEach(() => {
    cleanup.splice(0).forEach(cleanupTempDir)
  })

  test('getActivities returns empty array for unknown repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    expect(repos.activity.getActivities('alice/alpha')).toEqual([])
    repos.close()
  })

  test('upsertActivities stores and retrieves activity rows', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.activity.upsertActivities('alice/alpha', [makeActivity()])
    const rows = repos.activity.getActivities('alice/alpha')

    expect(rows).toHaveLength(1)
    expect(rows[0]?.eventType).toBe('pr_merged')
    expect(rows[0]?.actor).toBe('@bob')
    expect(rows[0]?.githubEventId).toBe('evt_001')
    repos.close()
  })

  test('upsertActivities deduplicates by githubEventId', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.activity.upsertActivities('alice/alpha', [makeActivity({ githubEventId: 'evt_001' })])
    repos.activity.upsertActivities('alice/alpha', [makeActivity({ githubEventId: 'evt_001' })])

    expect(repos.activity.getActivities('alice/alpha')).toHaveLength(1)
    repos.close()
  })

  test('upsertActivities allows multiple rows with null githubEventId (Dependabot alerts)', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.activity.upsertActivities('alice/alpha', [
      makeActivity({
        eventType: 'security_alert',
        githubEventId: null,
        linkUrl: 'https://github.com/alice/alpha/security/dependabot/1',
      }),
      makeActivity({
        eventType: 'security_alert',
        githubEventId: null,
        linkUrl: 'https://github.com/alice/alpha/security/dependabot/2',
      }),
    ])

    expect(repos.activity.getActivities('alice/alpha')).toHaveLength(2)
    repos.close()
  })

  test('upsertActivities prunes rows older than 30 days', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const old = new Date(Date.now() - 31 * 86_400_000)

    repos.activity.upsertActivities('alice/alpha', [
      makeActivity({ occurredAt: old, githubEventId: 'old' }),
      makeActivity({ occurredAt: new Date(), githubEventId: 'new' }),
    ])

    const rows = repos.activity.getActivities('alice/alpha')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.githubEventId).toBe('new')
    repos.close()
  })

  test('getDependabotCount counts security_alert rows for a repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.activity.upsertActivities('alice/alpha', [
      makeActivity({
        eventType: 'security_alert',
        githubEventId: null,
        linkUrl: 'https://github.com/alice/alpha/security/dependabot/1',
      }),
      makeActivity({
        eventType: 'security_alert',
        githubEventId: null,
        linkUrl: 'https://github.com/alice/alpha/security/dependabot/2',
      }),
      makeActivity({ eventType: 'pr_merged', githubEventId: 'x' }),
    ])

    expect(repos.activity.getDependabotCount('alice/alpha')).toBe(2)
    repos.close()
  })

  test('getMeta returns null for unknown repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    expect(repos.activity.getMeta('alice/alpha')).toBeNull()
    repos.close()
  })

  test('upsertMeta stores and retrieves meta', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const cachedAt = new Date('2026-06-20T10:00:00Z')

    repos.activity.upsertMeta('alice/alpha', {
      eventsEtag: 'abc123',
      eventsCachedAt: cachedAt,
      pollIntervalSecs: 90,
    })
    const meta = repos.activity.getMeta('alice/alpha')

    expect(meta?.eventsEtag).toBe('abc123')
    expect(meta?.pollIntervalSecs).toBe(90)
    expect(meta?.eventsCachedAt?.toISOString()).toBe(cachedAt.toISOString())
    repos.close()
  })

  test('upsertMeta partial update preserves existing fields', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.activity.upsertMeta('alice/alpha', { eventsEtag: 'abc', pollIntervalSecs: 60 })
    repos.activity.upsertMeta('alice/alpha', { pollIntervalSecs: 90 })

    expect(repos.activity.getMeta('alice/alpha')?.eventsEtag).toBe('abc')
    expect(repos.activity.getMeta('alice/alpha')?.pollIntervalSecs).toBe(90)
    repos.close()
  })

  test('getActivities returns rows DESC by occurred_at', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.activity.upsertActivities('alice/alpha', [
      makeActivity({ occurredAt: new Date('2026-06-20T08:00:00Z'), githubEventId: 'a' }),
      makeActivity({ occurredAt: new Date('2026-06-20T10:00:00Z'), githubEventId: 'b' }),
    ])

    const rows = repos.activity.getActivities('alice/alpha')
    expect(rows[0]?.githubEventId).toBe('b')
    expect(rows[1]?.githubEventId).toBe('a')
    repos.close()
  })
})
