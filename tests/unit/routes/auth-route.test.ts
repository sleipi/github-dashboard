import { describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { GitHubClient } from '../../../src/github/github-client.ts'
import { createAuthRoutes } from '../../../src/routes/auth-route.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getUser: mock(async () => ({
      login: 'alice',
      avatarUrl: 'https://x.com/a.png',
      expiresAt: null,
    })),
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

describe('auth routes', () => {
  test('GET / shows setup page when no token', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    const routes = createAuthRoutes(repos.auth, makeClient())

    const url = new URL('http://localhost:4242/')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('Personal Access Token')

    repos.close()
    cleanupTempDir(dir)
  })

  test('POST /api/auth saves token and redirects on success', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    const routes = createAuthRoutes(repos.auth, makeClient())

    const url = new URL('http://localhost:4242/api/auth')
    const form = new FormData()
    form.append('pat', 'ghp_testtoken')
    const req = new Request(url.href, { method: 'POST', body: form })
    const route = routes.find((r) => r.match(url, 'POST'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(req, url)

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/')
    expect(repos.auth.getToken()?.username).toBe('alice')

    repos.close()
    cleanupTempDir(dir)
  })

  test('POST /api/auth with _method=DELETE clears token', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })
    const routes = createAuthRoutes(repos.auth, makeClient())

    const url = new URL('http://localhost:4242/api/auth')
    const form = new FormData()
    form.append('_method', 'DELETE')
    const req = new Request(url.href, { method: 'POST', body: form })
    const route = routes.find((r) => r.match(url, 'POST'))
    if (!route) throw new Error('route not found')
    await route.handle(req, url)

    expect(repos.auth.getToken()).toBeNull()

    repos.close()
    cleanupTempDir(dir)
  })

  test('POST /api/auth with empty PAT returns 400 with error message', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    const routes = createAuthRoutes(repos.auth, makeClient())

    const url = new URL('http://localhost:4242/api/auth')
    const form = new FormData()
    form.append('pat', '')
    const req = new Request(url.href, { method: 'POST', body: form })
    const route = routes.find((r) => r.match(url, 'POST'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(req, url)
    const body = await res.text()

    expect(res.status).toBe(400)
    expect(body).toContain('Bitte Token eingeben')

    repos.close()
    cleanupTempDir(dir)
  })

  test('POST /api/auth returns 401 and shows error when getUser throws', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    const routes = createAuthRoutes(
      repos.auth,
      makeClient({
        getUser: mock(async () => {
          throw new Error('Token ungültig (401)')
        }),
      }),
    )

    const url = new URL('http://localhost:4242/api/auth')
    const form = new FormData()
    form.append('pat', 'ghp_badtoken')
    const req = new Request(url.href, { method: 'POST', body: form })
    const route = routes.find((r) => r.match(url, 'POST'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(req, url)
    const body = await res.text()

    expect(res.status).toBe(401)
    expect(body).toContain('Token ungültig (401)')
    expect(repos.auth.getToken()).toBeNull()

    repos.close()
    cleanupTempDir(dir)
  })

  test('POST /api/auth saves expiresAt from getUser result', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    const expiresAt = new Date('2026-12-31T21:01:12.000Z')
    const routes = createAuthRoutes(
      repos.auth,
      makeClient({ getUser: mock(async () => ({ login: 'alice', avatarUrl: '', expiresAt })) }),
    )

    const url = new URL('http://localhost:4242/api/auth')
    const form = new FormData()
    form.append('pat', 'ghp_testtoken')
    const req = new Request(url.href, { method: 'POST', body: form })
    const route = routes.find((r) => r.match(url, 'POST'))
    if (!route) throw new Error('route not found')
    await route.handle(req, url)

    expect(repos.auth.getToken()?.expiresAt?.toISOString()).toBe('2026-12-31T21:01:12.000Z')

    repos.close()
    cleanupTempDir(dir)
  })

  test('POST /api/auth with HX-Request header returns HX-Redirect instead of 302', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    const routes = createAuthRoutes(repos.auth, makeClient())

    const url = new URL('http://localhost:4242/api/auth')
    const form = new FormData()
    form.append('pat', 'ghp_testtoken')
    const req = new Request(url.href, {
      method: 'POST',
      body: form,
      headers: { 'HX-Request': 'true' },
    })
    const route = routes.find((r) => r.match(url, 'POST'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(req, url)

    expect(res.headers.get('HX-Redirect')).toBe('/')
    expect(res.status).toBe(200)

    repos.close()
    cleanupTempDir(dir)
  })
})
