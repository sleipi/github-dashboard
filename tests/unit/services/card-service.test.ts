import { describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { GitHubClient } from '../../../src/github/github-client.ts'
import { createCardService } from '../../../src/services/card-service.ts'
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

describe('CardService', () => {
  test('getPinned returns empty array when nothing is pinned', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())

    expect(service.getPinned()).toEqual([])

    repos.close()
    cleanupTempDir(dir)
  })

  test('togglePin pins a repo and returns true', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())

    const result = service.togglePin('alice/alpha')

    expect(result).toBe(true)
    expect(repos.cards.isPinned('alice/alpha')).toBe(true)

    repos.close()
    cleanupTempDir(dir)
  })

  test('togglePin unpins a pinned repo and returns false', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())

    service.togglePin('alice/alpha')
    const result = service.togglePin('alice/alpha')

    expect(result).toBe(false)
    expect(repos.cards.isPinned('alice/alpha')).toBe(false)

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard fetches from GitHub and caches in DB', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const getPrs = mock(async () => [])
    const service = createCardService(repos, makeClient({ getPrs }))

    repos.cards.pin('alice/alpha')
    await service.getCard('alice/alpha', new Set(['prs', 'commits', 'ci']))

    expect(getPrs).toHaveBeenCalledTimes(1)
    expect(repos.pullRequests.getCache('alice/alpha')).not.toBeNull()

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard skips GitHub fetch when refreshNeeded is empty and cache exists', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const getPrs = mock(async () => [])
    const service = createCardService(repos, makeClient({ getPrs }))

    repos.cards.pin('alice/alpha')
    await service.getCard('alice/alpha', new Set(['prs', 'commits', 'ci'])) // 1. Fetch
    await service.getCard('alice/alpha', new Set()) // 2. Should use cache

    expect(getPrs).toHaveBeenCalledTimes(1) // only fetched once
    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard fetches CI status for the first 3 PRs and marks the rest as unknown', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)

    const makePr = (n: number) => ({
      number: n,
      title: `PR ${n}`,
      draft: false,
      headSha: `sha${n}`,
      htmlUrl: `https://github.com/alice/alpha/pull/${n}`,
      creator: 'alice',
      labels: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })

    const getCiStatus = mock(async () => 'success' as const)
    const service = createCardService(
      repos,
      makeClient({
        getPrs: mock(async () => [makePr(1), makePr(2), makePr(3), makePr(4)]),
        getCiStatus,
      }),
    )

    repos.cards.pin('alice/alpha')
    await service.getCard('alice/alpha', new Set(['prs', 'commits', 'ci']))

    expect(getCiStatus).toHaveBeenCalledTimes(3)
    const storedPrs = repos.pullRequests.getPrs('alice/alpha')
    expect(storedPrs).toHaveLength(4)
    expect(storedPrs.find((pr) => pr.number === 4)?.ciStatus).toBe('unknown')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard records a dependabot snapshot using count from repos.activity', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)

    // Seed 5 security_alert activities so getDependabotCount returns 5
    const now = new Date()
    repos.activity.upsertActivities(
      'alice/alpha',
      Array.from({ length: 5 }, (_, i) => ({
        repoFullName: 'alice/alpha',
        eventType: 'security_alert' as const,
        actor: 'dependabot',
        subject: `alert-${i + 1}`,
        linkUrl: `https://github.com/alice/alpha/security/dependabot/${i + 1}`,
        occurredAt: now,
        recordedAt: now,
        githubEventId: null,
      })),
    )

    const service = createCardService(repos, makeClient())

    repos.cards.pin('alice/alpha')
    await service.getCard('alice/alpha', new Set(['prs', 'commits', 'ci']))

    const history = repos.dependabot.getHistory('alice/alpha')
    expect(history.length).toBeGreaterThan(0)
    expect(history[0]?.count).toBe(5)

    repos.close()
    cleanupTempDir(dir)
  })

  test('getAllRepos delegates to client.getRepos', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const mockRepos = [
      {
        fullName: 'alice/alpha',
        name: 'alpha',
        owner: 'alice',
        isPrivate: false,
        language: 'TypeScript' as string | null,
        stargazersCount: 0,
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]
    const service = createCardService(repos, makeClient({ getRepos: mock(async () => mockRepos) }))

    const result = await service.getAllRepos()
    expect(result).toEqual(mockRepos)

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard makes no GitHub API calls when refreshNeeded is empty', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const getPrs = mock(async () => [])
    const getLastCommitDate = mock(async () => null)
    const service = createCardService(repos, makeClient({ getPrs, getLastCommitDate }))

    // Seed a cache so there's data to serve
    repos.pullRequests.upsertCache('alice/alpha', {
      lastCommitAt: null,
      prTotal: 0,
      dependabotCount: null,
    })

    await service.getCard('alice/alpha', new Set())

    expect(getPrs).not.toHaveBeenCalled()
    expect(getLastCommitDate).not.toHaveBeenCalled()

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard fetches PRs when refreshNeeded includes prs', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const getPrs = mock(async () => [])
    repos.pullRequests.upsertCache('alice/alpha', {
      lastCommitAt: null,
      prTotal: 0,
      dependabotCount: null,
    })
    const service = createCardService(repos, makeClient({ getPrs }))

    await service.getCard('alice/alpha', new Set(['prs']))

    expect(getPrs).toHaveBeenCalledTimes(1)

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard reads Dependabot count from activity repo', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    // Seed 2 security_alert activities
    repos.activity.upsertActivities('alice/alpha', [
      {
        repoFullName: 'alice/alpha',
        eventType: 'security_alert',
        actor: '@dependabot',
        subject: 's1',
        linkUrl: 'https://github.com/alice/alpha/security/dependabot/1',
        occurredAt: new Date(),
        recordedAt: new Date(),
        githubEventId: null,
      },
      {
        repoFullName: 'alice/alpha',
        eventType: 'security_alert',
        actor: '@dependabot',
        subject: 's2',
        linkUrl: 'https://github.com/alice/alpha/security/dependabot/2',
        occurredAt: new Date(),
        recordedAt: new Date(),
        githubEventId: null,
      },
    ])
    repos.pullRequests.upsertCache('alice/alpha', {
      lastCommitAt: null,
      prTotal: 0,
      dependabotCount: null,
    })
    const service = createCardService(repos, makeClient())

    const data = await service.getCard('alice/alpha', new Set())

    expect(data.cache.dependabotCount).toBe(2)

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard skips CI refresh when refreshNeeded has ci but not prs', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const getCiStatus = mock(async () => 'success' as const)
    const getPrs = mock(async () => [])
    repos.pullRequests.upsertCache('alice/alpha', {
      lastCommitAt: null,
      prTotal: 0,
      dependabotCount: null,
    })
    const service = createCardService(repos, makeClient({ getCiStatus, getPrs }))

    await service.getCard('alice/alpha', new Set(['ci']))

    expect(getPrs).not.toHaveBeenCalled()
    expect(getCiStatus).not.toHaveBeenCalled()

    repos.close()
    cleanupTempDir(dir)
  })

  test('getPinned returns full names of pinned repos in order', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    repos.cards.pin('alice/alpha')
    repos.cards.pin('alice/beta')
    const service = createCardService(repos, makeClient())

    const pinned = service.getPinned()

    expect(pinned).toContain('alice/alpha')
    expect(pinned).toContain('alice/beta')

    repos.close()
    cleanupTempDir(dir)
  })
})
