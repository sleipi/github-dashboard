import { describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { GitHubClient } from '../../../src/github/github-client.ts'
import { createCardRoutes } from '../../../src/routes/card-route.ts'
import { createCardService } from '../../../src/services/card-service.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

function makeClient(): GitHubClient {
  return {
    getUser: mock(async () => ({ login: 'alice', avatarUrl: '' })),
    getRepos: mock(async () => []),
    getPrs: mock(async () => []),
    getLastCommitDate: mock(async () => null),
    getCiStatus: mock(async () => 'unknown' as const),
    getDependabotCount: mock(async () => null),
  }
}

describe('card routes', () => {
  test('POST /api/cards/owner/repo toggles pin and returns HX-Trigger', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())
    const routes = createCardRoutes(service, repos.auth)

    const url = new URL('http://localhost:4242/api/cards/alice/alpha')
    const route = routes.find((r) => r.match(url, 'POST'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href, { method: 'POST' }), url)

    expect(res.headers.get('HX-Trigger')).toBe('cardsChanged')
    expect(repos.cards.isPinned('alice/alpha')).toBe(true)

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/cards returns cards HTML', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '' })
    const service = createCardService(repos, makeClient())
    const routes = createCardRoutes(service, repos.auth)

    const url = new URL('http://localhost:4242/api/cards')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')

    repos.close()
    cleanupTempDir(dir)
  })
})
