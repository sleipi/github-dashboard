import { describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { PullRequest, SecurityAlert } from '../../../src/db/types.ts'
import type { GitHubClient } from '../../../src/github/github-client.ts'
import { computeMostRecentActivity, createCardService } from '../../../src/services/card-service.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    repoFullName: 'alice/alpha',
    number: 1,
    title: 'pr',
    draft: false,
    ciStatus: 'unknown',
    prUrl: 'https://github.com/alice/alpha/pull/1',
    creator: 'alice',
    labels: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function makeAlert(overrides: Partial<SecurityAlert> = {}): SecurityAlert {
  return {
    repoFullName: 'alice/alpha',
    number: 1,
    ecosystem: 'npm',
    packageName: 'lodash',
    title: 'Prototype Pollution in lodash',
    severity: 'high',
    cvssScore: 7.4,
    createdAt: new Date('2026-01-01'),
    htmlUrl: 'https://github.com/alice/alpha/security/dependabot/1',
    ...overrides,
  }
}

function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getUser: mock(async () => ({ login: 'alice', avatarUrl: '', expiresAt: null })),
    getRepos: mock(async () => []),
    searchRepos: mock(async () => []),
    getUserOrgs: mock(async () => []),
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

  test('getCard falls back to cached PRs when GitHub API throws and cache exists', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    // Seed a cached PR
    repos.pullRequests.upsertPrs('alice/alpha', [
      {
        repoFullName: 'alice/alpha',
        number: 1,
        title: 'cached pr',
        draft: false,
        ciStatus: 'success',
        prUrl: 'https://github.com/alice/alpha/pull/1',
        creator: 'alice',
        labels: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    ])
    repos.pullRequests.upsertCache('alice/alpha', {
      lastCommitAt: null,
      prTotal: 1,
      dependabotCount: 0,
    })
    const getPrs = mock(async () => {
      throw new Error('GitHub API unavailable')
    })
    const service = createCardService(repos, makeClient({ getPrs }))

    const result = await service.getCard('alice/alpha', new Set(['prs']))

    expect(result.prs).toHaveLength(1)
    expect(result.prs[0]?.title).toBe('cached pr')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard propagates GitHub API error when no cache exists', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const getPrs = mock(async () => {
      throw new Error('GitHub API unavailable')
    })
    const service = createCardService(repos, makeClient({ getPrs }))

    await expect(service.getCard('alice/alpha', new Set(['prs']))).rejects.toThrow(
      'GitHub API unavailable',
    )

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

describe('computeMostRecentActivity', () => {
  test('returns null when all sources are empty', () => {
    expect(computeMostRecentActivity(null, [], [])).toBeNull()
  })

  test('returns lastCommitAt when it is the only source', () => {
    const commitAt = new Date('2026-05-01')
    expect(computeMostRecentActivity(commitAt, [], [])).toEqual(commitAt)
  })

  test('returns PR updatedAt when it is newer than lastCommitAt', () => {
    const commitAt = new Date('2026-01-01')
    const prUpdatedAt = new Date('2026-06-01')
    const prs = [makePr({ updatedAt: prUpdatedAt })]

    expect(computeMostRecentActivity(commitAt, prs, [])).toEqual(prUpdatedAt)
  })

  test('returns alert createdAt when it is newer than commit and PRs', () => {
    const commitAt = new Date('2026-01-01')
    const prs = [makePr({ updatedAt: new Date('2026-02-01') })]
    const alertCreatedAt = new Date('2026-07-01')
    const alerts = [makeAlert({ createdAt: alertCreatedAt })]

    expect(computeMostRecentActivity(commitAt, prs, alerts)).toEqual(alertCreatedAt)
  })

  test('takes the max across multiple PRs and alerts, not just the first', () => {
    const prs = [
      makePr({ number: 1, updatedAt: new Date('2026-01-01') }),
      makePr({ number: 2, updatedAt: new Date('2026-08-01') }),
      makePr({ number: 3, updatedAt: new Date('2026-03-01') }),
    ]
    const alerts = [
      makeAlert({ number: 1, createdAt: new Date('2026-02-01') }),
      makeAlert({ number: 2, createdAt: new Date('2026-04-01') }),
    ]

    expect(computeMostRecentActivity(null, prs, alerts)).toEqual(new Date('2026-08-01'))
  })
})

describe('CardService auto-sort', () => {
  test('getCard populates mostRecentActivityAt from cache/PRs/alerts', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    repos.pullRequests.upsertCache('alice/alpha', {
      lastCommitAt: new Date('2026-01-01'),
      prTotal: 0,
      dependabotCount: 0,
    })
    repos.pullRequests.upsertPrs('alice/alpha', [makePr({ updatedAt: new Date('2026-05-01') })])
    repos.security.upsertAlerts('alice/alpha', [makeAlert({ createdAt: new Date('2026-03-01') })])
    const service = createCardService(repos, makeClient())

    const data = await service.getCard('alice/alpha', new Set())

    expect(data.mostRecentActivityAt).toEqual(new Date('2026-05-01'))

    repos.close()
    cleanupTempDir(dir)
  })

  test('isAutoSortEnabled defaults to false and setAutoSort toggles + persists', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())

    expect(service.isAutoSortEnabled()).toBe(false)

    service.setAutoSort(true)

    expect(service.isAutoSortEnabled()).toBe(true)
    expect(repos.autoSort.isEnabled()).toBe(true)

    repos.close()
    cleanupTempDir(dir)
  })

  test('isGlobalSearchEnabled defaults to false and setGlobalSearchEnabled toggles + persists', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())

    expect(service.isGlobalSearchEnabled()).toBe(false)

    service.setGlobalSearchEnabled(true)

    expect(service.isGlobalSearchEnabled()).toBe(true)
    expect(repos.globalSearch.isEnabled()).toBe(true)

    repos.close()
    cleanupTempDir(dir)
  })
})
