import { describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { GitHubRepo } from '../../../src/github/github-client.ts'
import type { GitHubClient } from '../../../src/github/github-client.ts'
import { createModalRoutes } from '../../../src/routes/modal-route.ts'
import { createCardService } from '../../../src/services/card-service.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

const makeRepo = (fullName: string): GitHubRepo => {
  const [owner, name] = fullName.split('/') as [string, string]
  return {
    fullName,
    name,
    owner,
    isPrivate: false,
    language: 'TypeScript',
    stargazersCount: 0,
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getUser: mock(async () => ({ login: 'alice', avatarUrl: '' })),
    getRepos: mock(async () => [makeRepo('alice/alpha'), makeRepo('alice/beta')]),
    getPrs: mock(async () => []),
    getLastCommitDate: mock(async () => null),
    getCiStatus: mock(async () => 'unknown' as const),
    getDependabotCount: mock(async () => null),
    ...overrides,
  }
}

describe('modal routes', () => {
  test('GET /api/modal/repos returns HTML with the repo list', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(service, repos.cards)

    const url = new URL('http://localhost:4242/api/modal/repos')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(body).toContain('alice/alpha')
    expect(body).toContain('alice/beta')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/modal/repos marks already-pinned repos with data-checked=1', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    repos.cards.pin('alice/alpha')
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(service, repos.cards)

    const url = new URL('http://localhost:4242/api/modal/repos')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(body).toContain('data-checked="1"')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/modal/repos does not match other methods or paths', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(service, repos.cards)

    const otherUrl = new URL('http://localhost:4242/api/modal/other')
    expect(routes.some((r) => r.match(otherUrl, 'GET'))).toBe(false)
    const correctUrl = new URL('http://localhost:4242/api/modal/repos')
    expect(routes.some((r) => r.match(correctUrl, 'POST'))).toBe(false)

    repos.close()
    cleanupTempDir(dir)
  })
})
