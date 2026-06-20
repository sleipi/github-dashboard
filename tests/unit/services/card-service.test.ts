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
})
