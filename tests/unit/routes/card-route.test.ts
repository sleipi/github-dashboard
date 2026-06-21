import { describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { GitHubClient } from '../../../src/github/github-client.ts'
import { createCardRoutes } from '../../../src/routes/card-route.ts'
import { createCardService } from '../../../src/services/card-service.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getUser: mock(async () => ({ login: 'alice', avatarUrl: '', expiresAt: null })),
    getRepos: mock(async () => []),
    getPrs: mock(async () => []),
    getLastCommitDate: mock(async () => null),
    getCiStatus: mock(async () => 'unknown' as const),
    getDependabotCount: mock(async () => null),
    ...overrides,
  }
}

function makeCardService(repos: ReturnType<typeof createSqliteRepos>) {
  return createCardService(repos, makeClient())
}

describe('card routes', () => {
  test('POST /api/cards/owner/repo toggles pin and returns HX-Trigger', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())
    const routes = createCardRoutes(service, repos.auth, makeClient())

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
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })
    const service = createCardService(repos, makeClient())
    const routes = createCardRoutes(service, repos.auth, makeClient())

    const url = new URL('http://localhost:4242/api/cards')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET / with token renders the full dashboard HTML', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({
      pat: 'ghp_test',
      username: 'alice',
      avatarUrl: 'https://x.com/a.png',
      expiresAt: null,
    })
    const service = createCardService(repos, makeClient())
    const routes = createCardRoutes(service, repos.auth, makeClient())

    const url = new URL('http://localhost:4242/')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('alice')
    expect(body).toContain('Dashboard')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET / without token redirects to /', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
    const repos = createSqliteRepos(dbPath)
    // no token saved
    const service = createCardService(repos, makeClient())
    const routes = createCardRoutes(service, repos.auth, makeClient())

    const url = new URL('http://localhost:4242/')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/card/owner/repo returns card HTML for a pinned repo', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
    const repos = createSqliteRepos(dbPath)
    repos.cards.pin('alice/alpha')
    const service = createCardService(repos, makeClient())
    const routes = createCardRoutes(service, repos.auth, makeClient())

    const url = new URL('http://localhost:4242/api/card/alice/alpha')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('alice/alpha')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/card/owner/repo returns error HTML when card load fails', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(
      repos,
      makeClient({
        getPrs: mock(async () => {
          throw new Error('GitHub unavailable')
        }),
      }),
    )
    const routes = createCardRoutes(service, repos.auth, makeClient())

    const url = new URL('http://localhost:4242/api/card/alice/alpha')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('GitHub unavailable')
    expect(body).toContain('alice/alpha')

    repos.close()
    cleanupTempDir(dir)
  })

  test('POST /api/cards/reorder reorders pinned repos and returns HX-Trigger', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
    const repos = createSqliteRepos(dbPath)
    repos.cards.pin('alice/alpha')
    repos.cards.pin('alice/beta')
    const service = createCardService(repos, makeClient())
    const routes = createCardRoutes(service, repos.auth, makeClient())

    const url = new URL('http://localhost:4242/api/cards/reorder')
    const route = routes.find((r) => r.match(url, 'POST'))
    if (!route) throw new Error('route not found')
    const req = new Request(url.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ['alice/beta', 'alice/alpha'] }),
    })
    const res = await route.handle(req, url)

    expect(res.headers.get('HX-Trigger')).toBe('cardsChanged')
    const pinned = repos.cards.getPinned()
    expect(pinned[0]?.fullName).toBe('alice/beta')
    expect(pinned[1]?.fullName).toBe('alice/alpha')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET / calls getUser once to backfill expiresAt when it is undefined (unchecked)', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({
      pat: 'ghp_test',
      username: 'alice',
      avatarUrl: '',
      expiresAt: undefined,
    })

    const expiresAt = new Date('2026-12-31T00:00:00.000Z')
    const getUser = mock(async () => ({ login: 'alice', avatarUrl: '', expiresAt }))
    const client = makeClient({ getUser })
    const service = makeCardService(repos)
    const routes = createCardRoutes(service, repos.auth, client)

    const url = new URL('http://localhost:4242/')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    await route.handle(new Request(url.href), url)

    expect(getUser).toHaveBeenCalledTimes(1)
    expect(repos.auth.getToken()?.expiresAt?.toISOString()).toBe('2026-12-31T00:00:00.000Z')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET / skips backfill when expiresAt is null (confirmed no expiry)', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const getUser = mock(async () => ({ login: 'alice', avatarUrl: '', expiresAt: null }))
    const client = makeClient({ getUser })
    const service = makeCardService(repos)
    const routes = createCardRoutes(service, repos.auth, client)

    const url = new URL('http://localhost:4242/')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    await route.handle(new Request(url.href), url)

    expect(getUser).not.toHaveBeenCalled()

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET / skips backfill when expiresAt is already set', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({
      pat: 'ghp_test',
      username: 'alice',
      avatarUrl: '',
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    })

    const getUser = mock(async () => ({ login: 'alice', avatarUrl: '', expiresAt: new Date() }))
    const client = makeClient({ getUser })
    const service = makeCardService(repos)
    const routes = createCardRoutes(service, repos.auth, client)

    const url = new URL('http://localhost:4242/')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    await route.handle(new Request(url.href), url)

    expect(getUser).not.toHaveBeenCalled()

    repos.close()
    cleanupTempDir(dir)
  })
})
