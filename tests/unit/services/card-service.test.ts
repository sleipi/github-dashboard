import { describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { GitHubClient } from '../../../src/github/github-client.ts'
import { createCardService } from '../../../src/services/card-service.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getUser: mock(async () => ({ login: 'alice', avatarUrl: '' })),
    getRepos: mock(async () => []),
    getPrs: mock(async () => []),
    getLastCommitDate: mock(async () => null),
    getCiStatus: mock(async () => 'unknown' as const),
    getDependabotCount: mock(async () => null),
    ...overrides,
  }
}

describe('CardService', () => {
  test('getCards returns empty array when nothing is pinned', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())

    expect(await service.getCards()).toEqual([])

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
    await service.getCard('alice/alpha')

    expect(getPrs).toHaveBeenCalledTimes(1)
    expect(repos.pullRequests.getCache('alice/alpha')).not.toBeNull()

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard uses cache when data is fresh (< 30s)', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const getPrs = mock(async () => [])
    const service = createCardService(repos, makeClient({ getPrs }))

    repos.cards.pin('alice/alpha')
    await service.getCard('alice/alpha') // 1. Fetch
    await service.getCard('alice/alpha') // 2. Sollte Cache nutzen

    expect(getPrs).toHaveBeenCalledTimes(1) // nur einmal gefetcht
    repos.close()
    cleanupTempDir(dir)
  })

  test('getCards skips failed cards and returns the rest', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const getPrs = mock(async (fullName: string) => {
      if (fullName === 'alice/broken') throw new Error('GitHub API error')
      return []
    })
    const service = createCardService(repos, makeClient({ getPrs }))

    repos.cards.pin('alice/alpha')
    repos.cards.pin('alice/broken')
    repos.cards.pin('alice/beta')

    const cards = await service.getCards()

    expect(cards).toHaveLength(2)
    expect(cards.map((c) => c.fullName)).toEqual(['alice/alpha', 'alice/beta'])
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
    await service.getCard('alice/alpha')

    expect(getCiStatus).toHaveBeenCalledTimes(3)
    const storedPrs = repos.pullRequests.getPrs('alice/alpha')
    expect(storedPrs).toHaveLength(4)
    expect(storedPrs.find((pr) => pr.number === 4)?.ciStatus).toBe('unknown')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard records a dependabot snapshot when depCount is not null', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(
      repos,
      makeClient({ getDependabotCount: mock(async () => 5) }),
    )

    repos.cards.pin('alice/alpha')
    await service.getCard('alice/alpha')

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
})
