import { afterEach, describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { GitHubClient } from '../../../src/github/github-client.ts'
import { createActivityService } from '../../../src/services/activity-service.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getUser: mock(async () => ({ login: 'alice', avatarUrl: '', expiresAt: null })),
    getRepos: mock(async () => []),
    searchRepos: mock(async () => []),
    getPrs: mock(async () => []),
    getLastCommitDate: mock(async () => null),
    getCiStatus: mock(async () => 'unknown' as const),
    getRepoEvents: mock(async () => ({ notModified: true as const })),
    getDependabotAlerts: mock(async () => []),
    ...overrides,
  }
}

describe('ActivityService', () => {
  const cleanup: string[] = []
  afterEach(() => {
    cleanup.splice(0).forEach(cleanupTempDir)
  })

  test('sync returns empty activities and empty refreshNeeded when no meta exists (first load adds all hints)', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-svc-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const getRepoEvents = mock(async () => ({
      events: [],
      etag: '"e1"',
      pollIntervalSecs: 60,
    }))
    const service = createActivityService(repos, makeClient({ getRepoEvents }))

    const result = await service.sync('alice/alpha')

    // Hard TTL fallback: no meta → all hints added
    expect(result.refreshNeeded.has('prs')).toBe(true)
    expect(result.refreshNeeded.has('commits')).toBe(true)
    expect(result.refreshNeeded.has('ci')).toBe(true)
    expect(getRepoEvents).toHaveBeenCalledTimes(1)

    repos.close()
    cleanupTempDir(dir)
  })

  test('sync returns empty refreshNeeded and skips GitHub call when events TTL is fresh', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-svc-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    // Seed fresh meta
    repos.activity.upsertMeta('alice/alpha', {
      eventsEtag: '"e1"',
      eventsCachedAt: new Date(), // just now
      pollIntervalSecs: 60,
      dependabotCachedAt: new Date(),
    })
    const getRepoEvents = mock(async () => ({ notModified: true as const }))
    const service = createActivityService(repos, makeClient({ getRepoEvents }))

    const result = await service.sync('alice/alpha')

    expect(result.refreshNeeded.size).toBe(0)
    expect(getRepoEvents).not.toHaveBeenCalled()

    repos.close()
    cleanupTempDir(dir)
  })

  test('sync returns empty refreshNeeded on 304', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-svc-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    // Seed stale meta (2 min ago, TTL=60s)
    repos.activity.upsertMeta('alice/alpha', {
      eventsEtag: '"e1"',
      eventsCachedAt: new Date(Date.now() - 120_000),
      pollIntervalSecs: 60,
      dependabotCachedAt: new Date(),
    })
    const getRepoEvents = mock(async () => ({ notModified: true as const }))
    const service = createActivityService(repos, makeClient({ getRepoEvents }))

    const result = await service.sync('alice/alpha')

    expect(result.refreshNeeded.size).toBe(0)
    expect(getRepoEvents).toHaveBeenCalledWith('alice/alpha', '"e1"')

    repos.close()
    cleanupTempDir(dir)
  })

  test('sync maps PullRequestEvent (merged) to pr_merged activity and adds prs hint', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-svc-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    repos.activity.upsertMeta('alice/alpha', {
      eventsEtag: '"e0"',
      eventsCachedAt: new Date(Date.now() - 120_000),
      pollIntervalSecs: 60,
      dependabotCachedAt: new Date(),
    })
    const getRepoEvents = mock(async () => ({
      events: [
        {
          id: 'evt_001',
          type: 'PullRequestEvent',
          actor: { login: 'bob' },
          payload: {
            action: 'closed',
            pull_request: {
              number: 42,
              title: 'Fix bug',
              merged: true,
              html_url: 'https://github.com/alice/alpha/pull/42',
            },
          },
          repo: { name: 'alice/alpha' },
          createdAt: '2026-06-20T10:00:00Z',
        },
      ],
      etag: '"e1"',
      pollIntervalSecs: 60,
    }))
    const service = createActivityService(repos, makeClient({ getRepoEvents }))

    const result = await service.sync('alice/alpha')

    expect(result.refreshNeeded.has('prs')).toBe(true)
    expect(result.activities).toHaveLength(1)
    expect(result.activities[0]?.eventType).toBe('pr_merged')
    expect(result.activities[0]?.actor).toBe('@bob')
    expect(result.activities[0]?.subject).toBe('merged #42 — Fix bug')

    repos.close()
    cleanupTempDir(dir)
  })

  test('sync maps PullRequestEvent (closed, not merged) to pr_abandoned', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-svc-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    repos.activity.upsertMeta('alice/alpha', {
      eventsCachedAt: new Date(Date.now() - 120_000),
      pollIntervalSecs: 60,
      dependabotCachedAt: new Date(),
    })
    const getRepoEvents = mock(async () => ({
      events: [
        {
          id: 'evt_002',
          type: 'PullRequestEvent',
          actor: { login: 'carol' },
          payload: {
            action: 'closed',
            pull_request: {
              number: 43,
              title: 'Old PR',
              merged: false,
              html_url: 'https://github.com/alice/alpha/pull/43',
            },
          },
          repo: { name: 'alice/alpha' },
          createdAt: '2026-06-20T11:00:00Z',
        },
      ],
      etag: '"e2"',
      pollIntervalSecs: 60,
    }))
    const service = createActivityService(repos, makeClient({ getRepoEvents }))

    const result = await service.sync('alice/alpha')

    expect(result.activities[0]?.eventType).toBe('pr_abandoned')
    expect(result.activities[0]?.subject).toBe('closed #43 without merging')

    repos.close()
    cleanupTempDir(dir)
  })

  test('sync emits commits+ci hints for PushEvent on main but records no activity', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-svc-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    repos.activity.upsertMeta('alice/alpha', {
      eventsCachedAt: new Date(Date.now() - 120_000),
      pollIntervalSecs: 60,
      dependabotCachedAt: new Date(),
    })
    const getRepoEvents = mock(async () => ({
      events: [
        {
          id: 'evt_003',
          type: 'PushEvent',
          actor: { login: 'alice' },
          payload: { ref: 'refs/heads/main', size: 3, before: 'abc', head: 'def' },
          repo: { name: 'alice/alpha' },
          createdAt: '2026-06-20T12:00:00Z',
        },
      ],
      etag: '"e3"',
      pollIntervalSecs: 60,
    }))
    const service = createActivityService(repos, makeClient({ getRepoEvents }))

    const result = await service.sync('alice/alpha')

    expect(result.refreshNeeded.has('commits')).toBe(true)
    expect(result.refreshNeeded.has('ci')).toBe(true)
    // No activity record — push events are suppressed from the strip
    expect(result.activities).toHaveLength(0)

    repos.close()
    cleanupTempDir(dir)
  })

  test('sync ignores PushEvent on non-default branches', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-svc-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    repos.activity.upsertMeta('alice/alpha', {
      eventsCachedAt: new Date(Date.now() - 120_000),
      pollIntervalSecs: 60,
      dependabotCachedAt: new Date(),
    })
    const getRepoEvents = mock(async () => ({
      events: [
        {
          id: 'evt_004',
          type: 'PushEvent',
          actor: { login: 'alice' },
          payload: { ref: 'refs/heads/feature/xyz', size: 1, before: 'a', head: 'b' },
          repo: { name: 'alice/alpha' },
          createdAt: '2026-06-20T12:00:00Z',
        },
      ],
      etag: '"e4"',
      pollIntervalSecs: 60,
    }))
    const service = createActivityService(repos, makeClient({ getRepoEvents }))

    const result = await service.sync('alice/alpha')

    expect(result.activities).toHaveLength(0)
    expect(result.refreshNeeded.has('commits')).toBe(false)

    repos.close()
    cleanupTempDir(dir)
  })

  test('sync inserts net-new Dependabot alerts as security_alert activities', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-svc-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    repos.activity.upsertMeta('alice/alpha', {
      eventsCachedAt: new Date(), // fresh events cache
      pollIntervalSecs: 60,
      dependabotCachedAt: new Date(Date.now() - 10 * 60_000), // stale dep cache (10 min ago)
    })
    const getDependabotAlerts = mock(async () => [
      {
        number: 1,
        packageName: 'lodash',
        summary: 'Prototype Pollution',
        severity: 'critical',
        htmlUrl: 'https://github.com/alice/alpha/security/dependabot/1',
        createdAt: '2026-06-20T08:00:00Z',
      },
    ])
    const service = createActivityService(repos, makeClient({ getDependabotAlerts }))

    await service.sync('alice/alpha')
    const activities = repos.activity.getActivities('alice/alpha')

    expect(activities.some((a) => a.eventType === 'security_alert')).toBe(true)
    const alert = activities.find((a) => a.eventType === 'security_alert')
    expect(alert?.subject).toBe('security: lodash — Prototype Pollution')
    expect(alert?.actor).toBe('@dependabot')

    repos.close()
    cleanupTempDir(dir)
  })

  test('sync does not re-insert existing Dependabot alerts', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-svc-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    // Pre-seed an existing alert
    repos.activity.upsertActivities('alice/alpha', [
      {
        repoFullName: 'alice/alpha',
        eventType: 'security_alert',
        actor: '@dependabot',
        subject: 'security: lodash — Prototype Pollution',
        linkUrl: 'https://github.com/alice/alpha/security/dependabot/1',
        occurredAt: new Date('2026-06-20T08:00:00Z'),
        recordedAt: new Date(),
        githubEventId: null,
      },
    ])
    repos.activity.upsertMeta('alice/alpha', {
      eventsCachedAt: new Date(),
      pollIntervalSecs: 60,
      dependabotCachedAt: new Date(Date.now() - 10 * 60_000),
    })
    const getDependabotAlerts = mock(async () => [
      {
        number: 1,
        packageName: 'lodash',
        summary: 'Prototype Pollution',
        severity: 'critical',
        htmlUrl: 'https://github.com/alice/alpha/security/dependabot/1',
        createdAt: '2026-06-20T08:00:00Z',
      },
    ])
    const service = createActivityService(repos, makeClient({ getDependabotAlerts }))

    await service.sync('alice/alpha')

    expect(
      repos.activity.getActivities('alice/alpha').filter((a) => a.eventType === 'security_alert'),
    ).toHaveLength(1)

    repos.close()
    cleanupTempDir(dir)
  })

  test('sync removes resolved Dependabot alerts no longer returned by API', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-svc-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    // Pre-seed two alerts — one will be resolved
    repos.activity.upsertActivities('alice/alpha', [
      {
        repoFullName: 'alice/alpha',
        eventType: 'security_alert',
        actor: '@dependabot',
        subject: 'security: lodash — Prototype Pollution',
        linkUrl: 'https://github.com/alice/alpha/security/dependabot/1',
        occurredAt: new Date('2026-06-20T08:00:00Z'),
        recordedAt: new Date(),
        githubEventId: null,
      },
      {
        repoFullName: 'alice/alpha',
        eventType: 'security_alert',
        actor: '@dependabot',
        subject: 'security: axios — SSRF',
        linkUrl: 'https://github.com/alice/alpha/security/dependabot/2',
        occurredAt: new Date('2026-06-20T09:00:00Z'),
        recordedAt: new Date(),
        githubEventId: null,
      },
    ])
    repos.activity.upsertMeta('alice/alpha', {
      eventsCachedAt: new Date(),
      pollIntervalSecs: 60,
      dependabotCachedAt: new Date(Date.now() - 10 * 60_000),
    })
    // API now only returns alert #1 — alert #2 was resolved
    const getDependabotAlerts = mock(async () => [
      {
        number: 1,
        packageName: 'lodash',
        summary: 'Prototype Pollution',
        severity: 'critical',
        htmlUrl: 'https://github.com/alice/alpha/security/dependabot/1',
        createdAt: '2026-06-20T08:00:00Z',
      },
    ])
    const service = createActivityService(repos, makeClient({ getDependabotAlerts }))

    await service.sync('alice/alpha')

    const remaining = repos.activity
      .getActivities('alice/alpha')
      .filter((a) => a.eventType === 'security_alert')
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.linkUrl).toBe('https://github.com/alice/alpha/security/dependabot/1')

    repos.close()
    cleanupTempDir(dir)
  })
})
